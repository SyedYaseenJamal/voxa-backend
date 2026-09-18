import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Agent } from 'undici';
import axios from 'axios';

const pipelineAgent = new Agent({ connect: { rejectUnauthorized: false } });

function pipelineFetch(url, options = {}) {
  return fetch(url, { ...options, dispatcher: pipelineAgent });
}

const PIPELINE_URL = 'https://crm-intelligence-voxa.vercel.app'.replace(/\/$/, '');

export const RECORDINGS_DIRS = Array.from(new Set([
  process.env.RECORDINGS_PATH,
  '/var/www/voxa-backend/recordings',
  '/var/www/voxa-backend/call_recordings',
  path.resolve(process.cwd(), 'recordings'),
  path.resolve(process.cwd(), 'call_recordings'),
  path.resolve(process.cwd(), 'voxa-backend', 'recordings'),
  path.resolve(process.cwd(), 'voxa-backend', 'call_recordings'),
  path.resolve(process.cwd(), '..', 'recordings'),
  path.resolve(process.cwd(), '..', 'call_recordings'),
  '/var/data',
  'var/data',
  'C:/var/data',
  path.resolve(process.cwd(), 'var', 'data'),
  '../../../../../data'
].filter(Boolean)));

/**
 * Returns primary target recordings directory where new files are saved.
 * Defaults to /var/www/voxa-backend/recordings on server, or local recordings dir.
 */
export function getPrimaryRecordingsDir() {
  if (process.env.RECORDINGS_PATH) {
    if (!fs.existsSync(process.env.RECORDINGS_PATH)) {
      try { fs.mkdirSync(process.env.RECORDINGS_PATH, { recursive: true }); } catch (_) {}
    }
    return process.env.RECORDINGS_PATH;
  }
  if (fs.existsSync('/var/www/voxa-backend/recordings')) {
    return '/var/www/voxa-backend/recordings';
  }
  if (fs.existsSync('/var/www/voxa-backend')) {
    const p = '/var/www/voxa-backend/recordings';
    try { fs.mkdirSync(p, { recursive: true }); return p; } catch (_) {}
  }
  const localDir = path.resolve(process.cwd(), 'recordings');
  if (!fs.existsSync(localDir)) {
    try { fs.mkdirSync(localDir, { recursive: true }); } catch (_) {}
  }
  return localDir;
}

/**
 * Normalizes a phone number to candidate search strings (local PK 03..., 923..., raw digits).
 */
export function getPhoneSearchCandidates(phone) {
  if (!phone) return [];
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  const candidates = new Set();
  if (raw) candidates.add(raw);
  if (digits) candidates.add(digits);

  // If local Pakistani 03XXXXXXXXX (11 digits)
  if (digits.length === 11 && digits.startsWith('03')) {
    candidates.add(digits); // 03351264707
    candidates.add(`92${digits.slice(1)}`); // 923351264707
    candidates.add(`+92${digits.slice(1)}`);
    candidates.add(digits.slice(1)); // 3351264707
  } else if (digits.length === 12 && digits.startsWith('923')) {
    candidates.add(`0${digits.slice(2)}`); // 03351264707
    candidates.add(digits);
    candidates.add(`+${digits}`);
    candidates.add(digits.slice(2));
  } else if (digits.length === 10 && digits.startsWith('3')) {
    candidates.add(`0${digits}`);
    candidates.add(`92${digits}`);
    candidates.add(`+92${digits}`);
    candidates.add(digits);
  }

  return Array.from(candidates);
}

/**
 * Parse start_time into date (DD-MM-YYYY) and candidate HHmm time strings.
 */
export function parseCallDateTime(startTime) {
  if (!startTime) return null;
  const str = String(startTime).trim();
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
  if (!m) return null;

  const [, year, month, day, hourStr, minStr] = m;
  const dateStr = `${day}-${month}-${year}`; // e.g. "17-09-2026"
  const timeStr = `${hourStr}${minStr}`;     // e.g. "1335"

  const hr = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);

  // Previous minute
  const prevMin = min > 0 ? min - 1 : 59;
  const prevHr = min > 0 ? hr : (hr > 0 ? hr - 1 : 23);
  const timeMinus1 = `${String(prevHr).padStart(2, '0')}${String(prevMin).padStart(2, '0')}`;

  // Next minute
  const nextMin = min < 59 ? min + 1 : 0;
  const nextHr = min < 59 ? hr : (hr < 23 ? hr + 1 : 0);
  const timePlus1 = `${String(nextHr).padStart(2, '0')}${String(nextMin).padStart(2, '0')}`;

  return {
    dateStr,
    timeStr,
    timeMinus1,
    timePlus1,
    candidateTimes: [timeStr, timeMinus1, timePlus1],
  };
}

/**
 * Scans all available audio files across RECORDINGS_DIRS.
 * Returns an array of parsed file objects for high-performance in-memory matching.
 */
export function getAllAvailableAudioFiles() {
  const result = [];
  const seenPaths = new Set();

  for (const dir of RECORDINGS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    let list;
    try {
      list = fs.readdirSync(dir);
    } catch (_) {
      continue;
    }

    for (const file of list) {
      if (!file.endsWith('.wav') && !file.endsWith('.mp3') && !file.endsWith('.gsm')) continue;
      const fullPath = path.join(dir, file);
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);

      // Parse new format: {HHmm}_{DD-MM-YYYY}_{phone}_{did}_{tenant}.wav
      // Example: 1335_17-09-2026_03351264707_+922135863050_1.wav
      const matchNew = file.match(/^(\d{4})_(\d{2}-\d{2}-\d{4})_([^_]+)_([^_]+)_(\d+)\.(wav|mp3|gsm)$/i);
      if (matchNew) {
        result.push({
          fileName: file,
          fullPath,
          format: 'new',
          time: matchNew[1],
          date: matchNew[2],
          phone: matchNew[3],
          did: matchNew[4],
          tenantId: matchNew[5],
        });
      } else {
        result.push({
          fileName: file,
          fullPath,
          format: 'legacy',
        });
      }
    }
  }

  return result;
}

/**
 * Searches recording directories for a recording matching the call.
 *
 * Supports:
 * 1. Direct filename or raw path
 * 2. New format: {HHmm}_{DD-MM-YYYY}_{phone_number}_{did}_{tenant_id}.wav
 * 3. Legacy format: {phone}_{uniqueid}.wav or {uniqueid}.wav
 */
export function findRecordingFile(uniqueidOrOptions, phone = null, rawFilename = null, extra = {}) {
  let uniqueid = null;
  let rawPhone = null;
  let filename = null;
  let startTime = null;
  let destination = null;
  let callerid = null;
  let did = null;

  if (typeof uniqueidOrOptions === 'object' && uniqueidOrOptions !== null) {
    uniqueid = uniqueidOrOptions.uniqueid || uniqueidOrOptions.callId || uniqueidOrOptions.id;
    rawPhone = uniqueidOrOptions.phone;
    filename = uniqueidOrOptions.filename || uniqueidOrOptions.rawFilename;
    startTime = uniqueidOrOptions.start_time || uniqueidOrOptions.startTime;
    destination = uniqueidOrOptions.destination;
    callerid = uniqueidOrOptions.callerid;
    did = uniqueidOrOptions.did;
  } else {
    uniqueid = uniqueidOrOptions;
    rawPhone = phone;
    filename = rawFilename;
    if (extra && typeof extra === 'object') {
      startTime = extra.start_time || extra.startTime;
      destination = extra.destination;
      callerid = extra.callerid;
      did = extra.did;
    }
  }

  const targetUniqueId = String(uniqueid || '').trim();
  const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, '') : '';

  // ── Step 0: Direct rawFilename check ──────────────────────────────────────
  if (filename) {
    const directPath = path.resolve(filename);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      return directPath;
    }
    const base = path.basename(filename);
    for (const dir of RECORDINGS_DIRS) {
      const candidatePath = path.join(dir, base);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    }
  }

  const audioFiles = getAllAvailableAudioFiles();

  // ── Step 1: New Format Match ({time}_{date}_{phone}_{did}_{tenant}.wav) ───
  const dt = parseCallDateTime(startTime);
  const phoneCandidates = Array.from(new Set([
    ...getPhoneSearchCandidates(destination),
    ...getPhoneSearchCandidates(rawPhone),
    ...getPhoneSearchCandidates(callerid)
  ]));

  if (dt && phoneCandidates.length > 0) {
    // 1a. Best match: Exact Date + Exact Time (HHmm) + Matching Phone
    for (const item of audioFiles) {
      if (item.format === 'new' && item.date === dt.dateStr && item.time === dt.timeStr) {
        if (phoneCandidates.some(p => item.phone === p || item.phone.includes(p) || p.includes(item.phone))) {
          return item.fullPath;
        }
      }
    }

    // 1b. Close match: Exact Date + Close Time (+/- 1 min) + Matching Phone
    for (const item of audioFiles) {
      if (item.format === 'new' && item.date === dt.dateStr && (item.time === dt.timeMinus1 || item.time === dt.timePlus1)) {
        if (phoneCandidates.some(p => item.phone === p || item.phone.includes(p) || p.includes(item.phone))) {
          return item.fullPath;
        }
      }
    }

    // 1c. Same Date + Matching Phone (closest time)
    const datePhoneMatches = audioFiles.filter(item =>
      item.format === 'new' && item.date === dt.dateStr &&
      phoneCandidates.some(p => item.phone === p || item.phone.includes(p) || p.includes(item.phone))
    );
    if (datePhoneMatches.length > 0) {
      // Find closest minute
      const targetMin = parseInt(dt.timeStr.slice(0, 2), 10) * 60 + parseInt(dt.timeStr.slice(2), 10);
      let closest = datePhoneMatches[0];
      let minDiff = Infinity;
      for (const m of datePhoneMatches) {
        const mMin = parseInt(m.time.slice(0, 2), 10) * 60 + parseInt(m.time.slice(2), 10);
        const diff = Math.abs(mMin - targetMin);
        if (diff < minDiff) {
          minDiff = diff;
          closest = m;
        }
      }
      return closest.fullPath;
    }
  }

  // ── Step 2: Legacy uniqueid-based matching ────────────────────────────────
  if (targetUniqueId) {
    const legacyTargets = [];
    if (cleanPhone) legacyTargets.push(`${cleanPhone}_${targetUniqueId}.wav`);
    if (rawPhone && rawPhone !== cleanPhone) legacyTargets.push(`${rawPhone}_${targetUniqueId}.wav`);
    legacyTargets.push(`${targetUniqueId}.wav`);

    for (const target of legacyTargets) {
      const match = audioFiles.find(a => a.fileName === target);
      if (match) return match.fullPath;
    }

    const partial = audioFiles.find(a => a.fileName.includes(targetUniqueId));
    if (partial) return partial.fullPath;
  }

  return null;
}

/**
 * Fetch recordings from Asterisk on-demand API (http://172.16.17.127/callOnDemandApi.php)
 * and download to /var/www/voxa-backend/recordings.
 */
export async function fetchAndSyncRecordings({ tenant_id = null, date = null, api_url = null } = {}) {
  const targetApiUrl = api_url || process.env.CALL_ON_DEMAND_API_URL || 'http://172.16.17.127/callOnDemandApi.php';
  const targetDir = getPrimaryRecordingsDir();

  console.log(`\n[RecordingsSync] ═══════════════════════════════════════════`);
  console.log(`[RecordingsSync] Fetching recordings list from ${targetApiUrl}`);
  console.log(`[RecordingsSync] Target save directory: ${targetDir}`);
  console.log(`[RecordingsSync] ═══════════════════════════════════════════`);

  const params = {};
  if (tenant_id) params.tenant_id = tenant_id;
  if (date) params.date = date;

  let response;
  try {
    response = await axios.get(targetApiUrl, {
      params,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    const isConnRefused = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND';
    const msg = isConnRefused
      ? `Cannot reach Asterisk recordings API at ${targetApiUrl} (${err.code || err.message}). Note: Asterisk IP is whitelisted on the server (/var/www/voxa-backend on zain-vm-2). Local recordings on disk will remain active.`
      : `Failed to fetch recordings from Asterisk API: ${err.message}`;
    console.error(`[RecordingsSync] Error:`, msg);
    throw new Error(msg);
  }

  const data = response.data;
  if (data?.status !== 'success' || !Array.isArray(data?.data)) {
    throw new Error(data?.message || 'Invalid response structure from callOnDemandApi.php');
  }

  const recordings = data.data;
  console.log(`[RecordingsSync] Found ${recordings.length} recordings from API`);

  let downloadedCount = 0;
  let existingCount = 0;
  let failedCount = 0;
  const failedFiles = [];
  const index = [];

  for (const rec of recordings) {
    const rawUrl = String(rec.recording_url || '');
    // Clean escaped slashes and double slashes after protocol
    const cleanUrl = rawUrl.replace(/\\\/+/g, '/').replace(/([^:])\/\/+/g, '$1/');
    const fileName = rec.file_name;
    if (!fileName) continue;

    const destPath = path.join(targetDir, fileName);

    // Check if file already exists in any recordings dir with valid size
    const existingPath = findRecordingFile({ rawFilename: fileName });
    if (existingPath && fs.existsSync(existingPath) && fs.statSync(existingPath).size > 0) {
      existingCount++;
      index.push({
        ...rec,
        file_name: fileName,
        local_path: existingPath,
        exists: true
      });
      continue;
    }

    try {
      console.log(`[RecordingsSync] Downloading: ${fileName} from ${cleanUrl}`);
      const fileRes = await axios({
        url: cleanUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000
      });

      const writer = fs.createWriteStream(destPath);
      await pipeline(fileRes.data, writer);

      downloadedCount++;
      index.push({
        ...rec,
        file_name: fileName,
        local_path: destPath,
        exists: true
      });
    } catch (dlErr) {
      console.warn(`[RecordingsSync] ⚠️ Failed downloading ${fileName}: ${dlErr.message}`);
      failedCount++;
      failedFiles.push({ fileName, error: dlErr.message });
    }
  }

  // Save index to targetDir/recordings_index.json
  try {
    const indexPath = path.join(targetDir, 'recordings_index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    console.log(`[RecordingsSync] Saved index of ${index.length} recordings to ${indexPath}`);
  } catch (idxErr) {
    console.warn(`[RecordingsSync] Could not write index file: ${idxErr.message}`);
  }

  return {
    success: true,
    total: recordings.length,
    newly_downloaded: downloadedCount,
    already_exists: existingCount,
    failed: failedCount,
    failed_files: failedFiles,
    target_directory: targetDir,
    message: `Successfully processed ${recordings.length} recordings: ${downloadedCount} newly downloaded, ${existingCount} already present${failedCount > 0 ? `, ${failedCount} failed` : ''}.`
  };
}

/**
 * Fast in-memory enrichment of call logs with matching recording filenames and stream URLs.
 */
export function enrichCallsWithRecordings(calls = []) {
  if (!Array.isArray(calls) || calls.length === 0) return calls;
  const audioFiles = getAllAvailableAudioFiles();
  if (audioFiles.length === 0) return calls;

  return calls.map(call => {
    const matchedPath = findRecordingFile({
      uniqueid: call.uniqueid,
      phone: call.destination || call.callerid,
      start_time: call.start_time,
      destination: call.destination,
      callerid: call.callerid,
      did: call.callerid || call.extension,
    });

    if (matchedPath) {
      const fileName = path.basename(matchedPath);
      return {
        ...call,
        recording_filename: fileName,
        has_recording: true,
        recording_stream_url: `/api/v1/telephony/recordings/stream?filename=${encodeURIComponent(fileName)}&uniqueid=${encodeURIComponent(call.uniqueid || '')}`
      };
    }

    return {
      ...call,
      has_recording: false
    };
  });
}

/**
 * Call the AI Pipeline API — full process (transcribe + summarize)
 */
export async function callPipelineProcess({ callId, script = 'mixed', filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));
    formData.append('script', script);

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/process`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline failed with status ${res.status}: ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId),
        script: script
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline URL process failed with status ${res.status}: ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL could be found for processing.');
}

/**
 * Call pipeline for transcription only
 */
export async function callPipelineTranscribe({ callId, script = 'mixed', filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));
    formData.append('script', script);

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline transcribe failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/transcribe-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId),
        script
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline transcribe URL failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL provided');
}

/**
 * Call pipeline for summarize only
 */
export async function callPipelineSummarize({ callId, filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/summarize`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline summarize failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/summarize-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId)
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline summarize URL failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL provided');
}
