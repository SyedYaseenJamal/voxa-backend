/**
 * obdCms.service.js
 *
 * Handles all communication with the external OBD CMS platform.
 * Uses CI3 session-based auth (ci_session cookie).
 *
 * Login flow (discovered via diagnostic):
 *   1. GET /  → server issues ci_session cookie on the login page itself
 *   2. POST /authenticate  → with ci_session + credentials → validates session
 *   3. Reuse the same ci_session cookie on all subsequent requests
 */

import axios from 'axios';
import FormData from 'form-data';
import * as cheerio from 'cheerio';

const BASE_URL = (process.env.OBD_BASE_URL || 'http://172.16.17.127/obd_cms/public').replace(/\/$/, '');
const USERNAME = process.env.OBD_USERNAME || 'admin';
const PASSWORD = process.env.OBD_PASSWORD || 'admin123';

// ── Singleton session state ───────────────────────────────────────────────────
let sessionCookie = null; // full "ci_session=<value>" string

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract ci_session value from a Set-Cookie header array.
 * @param {string|string[]|undefined} setCookieHeaders
 * @returns {string|null}  e.g. "ci_session=abc123"
 */
function extractCiSession(setCookieHeaders) {
  if (!setCookieHeaders) return null;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const header of headers) {
    const match = header.match(/ci_session=([^;]+)/i);
    if (match) {
      const val = match[1].trim();
      if (val && val !== 'deleted' && val.length > 5) {
        return `ci_session=${val}`;
      }
    }
  }
  return null;
}

/**
 * Returns true if the HTML looks like the OBD login page.
 */
function isLoginPage(html) {
  if (typeof html !== 'string') return false;
  return (
    html.includes('name="username"') ||
    html.includes('name="password"') ||
    html.includes('/authenticate')
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Authenticate with OBD CMS.
 *
 * Real flow (from diagnostic):
 *   • GET / → the login page itself sets ci_session via Set-Cookie
 *   • POST /authenticate → sends username + password with ci_session cookie
 *   • On success: redirects to dashboard; session cookie stays valid
 */
export async function login() {
  console.log('[OBD CMS] Logging in to:', BASE_URL);

  // ── Step 1: GET login page to obtain initial ci_session cookie ────────────
  const getResp = await axios.get(`${BASE_URL}/`, {
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 15000,
  });

  const initialCookie = extractCiSession(getResp.headers['set-cookie']);
  if (!initialCookie) {
    throw new Error(`OBD CMS: Login page did not return a ci_session cookie. Status: ${getResp.status}`);
  }
  console.log('[OBD CMS] Got initial session cookie from login page.');

  // ── Step 2: POST credentials to /authenticate ────────────────────────────
  const form = new FormData();
  form.append('username', USERNAME);
  form.append('password', PASSWORD);

  const authResp = await axios.post(`${BASE_URL}/authenticate`, form, {
    headers: {
      ...form.getHeaders(),
      Cookie: initialCookie,
    },
    maxRedirects: 0,           // Capture the redirect, don't follow it
    validateStatus: () => true,
    timeout: 15000,
  });

  console.log('[OBD CMS] POST /authenticate status:', authResp.status);

  // Success: CI3 redirects to dashboard (301/302/303) on valid credentials.
  // The ci_session is either refreshed in Set-Cookie or unchanged.
  if (authResp.status === 301 || authResp.status === 302 || authResp.status === 303) {
    // Use the new cookie if issued, otherwise the initial one is still valid
    const newCookie = extractCiSession(authResp.headers['set-cookie']);
    sessionCookie = newCookie || initialCookie;
    console.log('[OBD CMS] Login successful (redirect). Session ready.');
    return;
  }

  // Some CI3 apps return 200 and redirect via meta/JS on success
  if (authResp.status === 200) {
    const html = typeof authResp.data === 'string' ? authResp.data : '';
    if (!isLoginPage(html)) {
      // Authenticated — response is not the login page
      const newCookie = extractCiSession(authResp.headers['set-cookie']);
      sessionCookie = newCookie || initialCookie;
      console.log('[OBD CMS] Login successful (200 non-login page). Session ready.');
      return;
    }
    // Still on login page = wrong credentials
    throw new Error(`OBD CMS: Authentication failed — still on login page. Check OBD_USERNAME / OBD_PASSWORD.`);
  }

  throw new Error(`OBD CMS: Unexpected /authenticate response: HTTP ${authResp.status}`);
}

// ── Session retry wrapper ─────────────────────────────────────────────────────

/**
 * Wraps any OBD request with session-expiry detection + one auto re-login.
 */
async function withSessionRetry(requestFn, isRetry = false) {
  if (!sessionCookie) await login();

  const response = await requestFn();

  const html = typeof response.data === 'string' ? response.data : '';
  const location = (response.headers?.['location'] || '').toLowerCase();
  const sessionExpired =
    isLoginPage(html) ||
    (response.status === 302 && (location === '/' || location.includes('authenticate')));

  if (sessionExpired) {
    if (isRetry) throw new Error('OBD CMS: Cannot establish session even after re-login.');
    console.warn('[OBD CMS] Session expired — re-logging in and retrying...');
    sessionCookie = null;
    await login();
    return withSessionRetry(requestFn, true);
  }

  return response;
}

// ── getCampaigns ──────────────────────────────────────────────────────────────

/**
 * Fetch and parse the OBD CMS campaigns list (parses HTML table).
 * @returns {Promise<Array<{id,name,user,type,status,schedule}>>}
 */
export async function getCampaigns() {
  const response = await withSessionRetry(() =>
    axios.get(`${BASE_URL}/campaigns`, {
      headers: { Cookie: sessionCookie },
      maxRedirects: 5,
      validateStatus: () => true
      // timeout: 15000,
    })
  );

  const html = response.data;
  if (typeof html !== 'string') {
    throw new Error('OBD CMS: Non-HTML response from /campaigns');
  }

  const $ = cheerio.load(html);
  const campaigns = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    campaigns.push({
      id: $(cells[0]).text().trim(),
      name: $(cells[1]).text().trim(),
      user: $(cells[2])?.text().trim() || '',
      type: $(cells[3])?.text().trim() || '',
      status: $(cells[4])?.text().trim() || '',
      schedule: $(cells[5])?.text().trim() || '',
    });
  });

  return campaigns;
}

// ── createCampaign ────────────────────────────────────────────────────────────

/**
 * Create a campaign on OBD CMS via multipart POST to /campaigns/store.
 */
export async function createCampaign(payload, csvBuffer, csvFilename) {
  const {
    campaign_name,
    campaign_type,
    audio_id,
    schedule_time,
    description = '',
    dtmfOptions = [],
  } = payload;

  const doRequest = () => {
    const form = new FormData();
    form.append('campaign_name', campaign_name);
    form.append('campaign_type', campaign_type);
    form.append('audio_id', String(audio_id));
    form.append('schedule_time', schedule_time);
    if (description) form.append('description', description);

    form.append('csv_file', csvBuffer, {
      filename: csvFilename || 'contacts.csv',
      contentType: 'text/csv',
    });

    if (campaign_type === 'dtmf' && dtmfOptions.length > 0) {
      for (const opt of dtmfOptions) {
        form.append('digit[]', String(opt.digit));
        form.append('option_text[]', String(opt.optionText || opt.option_text || ''));
        form.append('reply_audio[]', String(opt.replyAudio || opt.reply_audio || ''));
      }
    }

    return axios.post(`${BASE_URL}/campaigns/store`, form, {
      headers: { ...form.getHeaders(), Cookie: sessionCookie },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 30000,
    });
  };

  const response = await withSessionRetry(doRequest);
  const location = response.headers['location'] || '';
  let obdCampaignId = null;

  // OBD CMS redirects to /campaigns/view/{id} on successful creation
  const match = location.match(/\/campaigns\/view\/(\d+)/i);
  if (match) {
    obdCampaignId = match[1];
  } else if (response.status === 200) {
    // Fallback if it returns 200 without redirect (e.g. error on page)
    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const $ = cheerio.load(raw);
    $('table tbody tr').last().find('td').each((i, el) => {
      if (i === 0) obdCampaignId = $(el).text().trim() || null;
    });
  }

  const success = obdCampaignId !== null;
  const raw = typeof response.data === 'string' ? response.data : '';

  return { success, obdCampaignId, raw };
}

// ── startCampaign ─────────────────────────────────────────────────────────────

/**
 * Start a campaign on OBD CMS via GET /campaigns/start/{campaignId}
 */
export async function startCampaign(campaignId) {
  const response = await withSessionRetry(() =>
    axios.get(`${BASE_URL}/campaigns/start/${campaignId}`, {
      headers: { Cookie: sessionCookie },
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 15000,
    })
  );

  console.log(`[OBD CMS] startCampaign(${campaignId}) status:`, response.status);
  const raw = typeof response.data === 'string' ? response.data : '';
  const success = response.status < 400 && !isLoginPage(raw);

  return success;
}

// ── getCampaignDetail ────────────────────────────────────────────────────────

/**
 * Fetch and parse campaign detail from OBD CMS
 * GET /campaigns/view/{campaignId}
 */
export async function getCampaignDetail(campaignId) {
  const response = await withSessionRetry(() =>
    axios.get(`${BASE_URL}/campaigns/view/${campaignId}`, {
      headers: { Cookie: sessionCookie },
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 15000,
    })
  );

  const html = response.data;
  if (typeof html !== 'string') {
    throw new Error('OBD CMS: Non-HTML response from /campaigns/view');
  }

  const $ = cheerio.load(html);

  // Extract Campaign name (h3 tag)
  const campaignName = $('h3').first().text().trim();

  // Stats (card h4 values)
  const statValues = [];
  $('.col-md-3 .card-body h4').each((i, el) => {
    statValues.push($(el).text().trim());
  });

  const stats = {
    total: statValues[0] || '0',
    pending: statValues[1] || '0',
    completed: statValues[2] || '0',
    failed: statValues[3] || '0'
  };

  // Recipients Table
  const recipients = [];
  $('table tr').each((i, row) => {
    if (i === 0) return; // Skip header row
    const cells = $(row).find('td');
    if (cells.length >= 4) {
      recipients.push({
        msisdn: $(cells[0]).text().trim(),
        status: $(cells[1]).text().trim(),
        attempts: $(cells[2]).text().trim(),
        lastAttempt: $(cells[3]).text().trim()
      });
    }
  });

  return {
    campaignName,
    stats,
    recipients
  };
}

// ── uploadAudio ──────────────────────────────────────────────────────────────

/**
 * Upload an audio file to OBD CMS.
 * Flow:
 *   1. GET /audio/upload → extract CSRF _token from HTML
 *   2. POST /audio/upload as multipart/form-data with _token + audio file
 *
 * @param {Buffer} fileBuffer   - raw file bytes
 * @param {string} fileName     - original file name (e.g. "my_audio.wav")
 * @returns {Promise<object>}   - raw response data from OBD CMS
 */
export async function uploadAudio(fileBuffer, fileName) {
  // ── POST multipart form to /audio/store ──────────────────────────────────
  const doUpload = () => {
    const form = new FormData();
    form.append('audio', fileBuffer, {
      filename: fileName,
      contentType: 'audio/wav',
    });

    return axios.post(`${BASE_URL}/audio/store`, form, {
      headers: {
        ...form.getHeaders(),
        Cookie: sessionCookie,
      },
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 30000,
    });
  };

  const response = await withSessionRetry(doUpload);
  return response.data;
}

// ── listAudio ─────────────────────────────────────────────────────────────────

/**
 * Fetch the list of audio files from OBD CMS.
 * Tries JSON first; falls back to parsing the HTML <table>.
 *
 * @returns {Promise<Array<{id: string, original_name: string, stored_file: string}>>}
 */
export async function listAudio() {
  const response = await withSessionRetry(() =>
    axios.get(`${BASE_URL}/audio`, {
      headers: {
        Cookie: sessionCookie,
        Accept: 'application/json',
      },
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 15000,
    })
  );

  const contentType = response.headers['content-type'] || '';

  // ── JSON response ────────────────────────────────────────────────────────
  if (contentType.includes('application/json') || typeof response.data === 'object') {
    const raw = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.data)
        ? response.data.data
        : [];
    return raw.map(item => ({
      id:            String(item.id ?? ''),
      original_name: String(item.original_name ?? item.name ?? ''),
      stored_file:   String(item.stored_file ?? item.file ?? ''),
    }));
  }

  // ── HTML fallback: parse <table> ─────────────────────────────────────────
  const html = typeof response.data === 'string' ? response.data : '';
  if (!html) throw new Error('listAudio: Empty response from OBD CMS /audio');

  const $ = cheerio.load(html);
  const audioList = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    audioList.push({
      id:            $(cells[0]).text().trim(),
      original_name: $(cells[1]).text().trim(),
      stored_file:   $(cells[2])?.text().trim() || $(cells[1]).text().trim(),
    });
  });

  return audioList;
}

const obdCmsService = { login, getCampaigns, createCampaign, startCampaign, getCampaignDetail, uploadAudio, listAudio };
export default obdCmsService;
