import fs from 'fs';
import path from 'path';
import axios from 'axios';
import User from '../auth/auth.model.js';
import Lead from '../integrations/lead.model.js';
import Did from '../dids/did.model.js';
import Company from '../companies/company.model.js';
import PlatformIntegration from '../integrations/platformIntegration.model.js';
import { CallAnalysis } from './callAnalysis.model.js';
import { CallNote } from './callNote.model.js';
import {
  findRecordingFile,
  callPipelineProcess,
  callPipelineTranscribe,
  callPipelineSummarize,
  fetchAndSyncRecordings,
  enrichCallsWithRecordings,
} from './telephony.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const fetchRecordings = async (req, res) => {
  try {
    const { tenant_id, date, api_url } = req.body || {};
    const result = await fetchAndSyncRecordings({ tenant_id, date, api_url });
    return success(res, result, result.message);
  } catch (err) {
    console.error('[Telephony Controller] fetchRecordings Error:', err);
    return apiError(res, 500, err.message);
  }
};

export const checkRecording = async (req, res) => {
  try {
    const { uniqueid, phone, filename, start_time, destination, callerid, did } = req.query;
    if (!uniqueid && !filename && !phone && !destination && !callerid) {
      return apiError(res, 400, 'At least one parameter (uniqueid, filename, phone, or destination) is required');
    }

    const filePath = findRecordingFile({
      uniqueid,
      phone,
      filename,
      start_time,
      destination,
      callerid,
      did,
    });
    if (!filePath || !fs.existsSync(filePath)) {
      return apiError(res, 404, 'Recording not found');
    }

    const baseName = path.basename(filePath);
    const streamUrl = `/api/v1/telephony/recordings/stream?uniqueid=${encodeURIComponent(uniqueid || '')}&filename=${encodeURIComponent(baseName)}`;

    return success(res, {
      exists: true,
      uniqueid,
      filename: baseName,
      stream_url: streamUrl,
    }, 'Recording found');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const streamRecording = async (req, res) => {
  try {
    const { uniqueid, phone, filename, start_time, destination, callerid, did } = req.query;
    const filePath = findRecordingFile({
      uniqueid,
      phone,
      filename,
      start_time,
      destination,
      callerid,
      did,
    });

    if (!filePath || !fs.existsSync(filePath)) {
      return apiError(res, 404, 'Recording not found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const getCallAnalysis = async (req, res) => {
  try {
    const { callId } = req.params;
    const analysis = await CallAnalysis.findOne({
      $or: [{ call_id: callId }, { uniqueid: callId }]
    });

    if (!analysis) {
      return apiError(res, 404, 'No AI analysis found for this call');
    }

    return success(res, analysis, 'Call analysis fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const processCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, start_time, destination, callerid, did, audio_url, script = 'mixed' } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());

    // Check if already processed and not requested force re-analysis
    if (!req.body.force) {
      const existing = await CallAnalysis.findOne({
        $or: [{ call_id: activeCallId }, { uniqueid: uniqueid }]
      });
      if (existing && existing.status === 'completed') {
        return success(res, existing, 'Existing analysis returned');
      }
    }

    const filePath = findRecordingFile({
      uniqueid: uniqueid || activeCallId,
      phone,
      filename,
      start_time,
      destination,
      callerid,
      did,
    });
    let resolvedAudioUrl = audio_url;

    if (!filePath && !resolvedAudioUrl) {
      return apiError(res, 404, 'Recording file not found on server for processing');
    }

    const result = await callPipelineProcess({
      callId: activeCallId,
      script,
      filePath,
      audioUrl: resolvedAudioUrl,
    });

    // Save or update in MongoDB
    const analysisRecord = await CallAnalysis.findOneAndUpdate(
      { call_id: activeCallId },
      {
        call_id: activeCallId,
        uniqueid: uniqueid || activeCallId,
        callerid: phone,
        recording_filename: filePath ? path.basename(filePath) : null,
        recording_url: resolvedAudioUrl,
        script,
        transcript: result.transcript,
        summary: result.summary,
        status: 'completed',
        raw_response: result,
      },
      { upsert: true, new: true }
    );

    return success(res, analysisRecord, 'Call processed successfully');
  } catch (err) {
    console.error('[Telephony Controller] Process Call Error:', err);
    return apiError(res, 500, err.message);
  }
};

export const transcribeCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, audio_url, script = 'mixed' } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());
    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);

    if (!filePath && !audio_url) {
      return apiError(res, 404, 'Recording file not found for transcription');
    }

    const result = await callPipelineTranscribe({
      callId: activeCallId,
      script,
      filePath,
      audioUrl: audio_url,
    });

    return success(res, result, 'Call transcribed successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const summarizeCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, audio_url } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());
    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);

    if (!filePath && !audio_url) {
      return apiError(res, 404, 'Recording file not found for summarization');
    }

    const result = await callPipelineSummarize({
      callId: activeCallId,
      filePath,
      audioUrl: audio_url,
    });

    return success(res, result, 'Call summarized successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Helper functions for robust Asterisk CDR identifier extraction ─────────

const IGNORED_CALLER_NAMES = new Set([
  'unknown', 'anonymous', 'unavailable', 'none', 'undefined', 'null', 'asterisk', 'default'
]);

function extractCallerName(callerIdStr) {
  if (!callerIdStr || typeof callerIdStr !== 'string') return null;
  const trimmed = callerIdStr.trim();
  if (!trimmed) return null;

  // Pattern 1: "Display Name" <1002> or 'Display Name' <+92300...> or Display Name <1002>
  const matchWithAngle = trimmed.match(/^["']?([^<"']+)["']?\s*<.*>$/);
  if (matchWithAngle && matchWithAngle[1]) {
    const candidate = matchWithAngle[1].trim();
    if (candidate && !/^\+?\d+$/.test(candidate)) {
      if (!IGNORED_CALLER_NAMES.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Pattern 2: Pure text name without angles or numbers (e.g. "John Doe", "Super Admin")
  if (!/[<>]/.test(trimmed) && !/^\+?\d{4,}$/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    const clean = trimmed.replace(/["']/g, '').trim();
    if (clean && !IGNORED_CALLER_NAMES.has(clean.toLowerCase())) {
      return clean;
    }
  }

  return null;
}

function extractChannelEndpoint(channelStr) {
  if (!channelStr || typeof channelStr !== 'string') return null;
  // Matches PJSIP/1002-0000001a or SIP/agent1-0000001a or DAHDI/1-1 etc.
  const match = channelStr.match(/^(?:PJSIP|SIP|DAHDI|IAX2|Local)\/([^-/@]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

function getPhoneKeys(phone) {
  if (!phone) return [];
  const str = String(phone).trim();
  const angleMatch = str.match(/<([^>]+)>/);
  const target = angleMatch ? angleMatch[1] : str;
  const digitsOnly = target.replace(/\D/g, '');
  const raw = target.replace(/["'\s]/g, '').trim();

  const keys = new Set();
  if (raw) {
    keys.add(raw);
    if (raw.length >= 7) {
      for (let len = 7; len <= raw.length; len++) {
        keys.add(raw.slice(0, len));
      }
    }
  }

  if (digitsOnly) {
    keys.add(digitsOnly);
    // Suffixes:
    if (digitsOnly.length >= 10) keys.add(digitsOnly.slice(-10));
    if (digitsOnly.length >= 9) keys.add(digitsOnly.slice(-9));
    if (digitsOnly.length >= 8) keys.add(digitsOnly.slice(-8));
    if (digitsOnly.length >= 7) keys.add(digitsOnly.slice(-7));

    // Prefixes (e.g. Asterisk truncates extensions/DIDs to 10 chars):
    if (digitsOnly.length >= 7) {
      for (let len = 7; len <= digitsOnly.length; len++) {
        keys.add(digitsOnly.slice(0, len));
      }
    }

    if (digitsOnly.startsWith('92') && digitsOnly.length > 2) {
      const rest = digitsOnly.slice(2);
      keys.add(rest);
      keys.add('0' + rest);
      if (rest.length >= 6) {
        for (let len = 6; len <= rest.length; len++) {
          keys.add(rest.slice(0, len));
          keys.add('0' + rest.slice(0, len));
        }
      }
    }
    if (digitsOnly.startsWith('0') && digitsOnly.length > 1) {
      const rest = digitsOnly.slice(1);
      keys.add(rest);
      keys.add('92' + rest);
      if (rest.length >= 6) {
        for (let len = 6; len <= rest.length; len++) {
          keys.add(rest.slice(0, len));
          keys.add('92' + rest.slice(0, len));
        }
      }
    }
  }
  return Array.from(keys);
}

function matchDidInfo(callKeys, lookupMap, didList) {
  // 1. Direct exact key match
  for (const k of callKeys) {
    if (k && lookupMap[k]) return lookupMap[k];
  }

  // 2. Prefix / substring match against registered DIDs
  if (Array.isArray(didList) && didList.length > 0) {
    for (const k of callKeys) {
      if (!k) continue;
      const cleanK = String(k).replace(/\D/g, '');
      if (cleanK.length >= 6) {
        for (const d of didList) {
          const didNum = d.did_number || '';
          const cleanDid = didNum.replace(/\D/g, '');
          if (!cleanDid) continue;

          const isPrefix = cleanDid.startsWith(cleanK) || cleanK.startsWith(cleanDid);
          const isSubstr = (cleanK.length >= 7 && cleanDid.includes(cleanK)) || 
                           (cleanDid.length >= 7 && cleanK.includes(cleanDid));

          if (isPrefix || isSubstr) {
            const hit = lookupMap[cleanDid] || lookupMap[didNum] || lookupMap[String(d._id)];
            if (hit) return hit;
          }
        }
      }
    }
  }

  return null;
}

function normalizeNumber(num) {
  if (!num) return '';
  const str = String(num).trim();
  const angleMatch = str.match(/<([^>]+)>/);
  const target = angleMatch ? angleMatch[1] : str;
  return target.replace(/\D/g, '').slice(-10);
}

function extractRawNumber(num) {
  if (!num) return '';
  const str = String(num).trim();
  const angleMatch = str.match(/<([^>]+)>/);
  const raw = angleMatch ? angleMatch[1] : str;
  return raw.replace(/["'\s]/g, '').trim();
}

/**
 * Returns company call logs with role-based filtering, user tracking, and company-segregated lead matching.
 */
export const getCompanyCallLogs = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.userId;

    if (!companyId) {
      return apiError(res, 400, 'Company ID is missing from user session');
    }

    // 1. Fetch user & role details
    const currentUser = await User.findById(userId).populate('roleId');
    const roleName = currentUser?.roleId?.name || req.user.role || 'User';
    const normalizedRoleName = roleName.toLowerCase();
    
    // Check if user is Super Admin or Admin for this company
    const isCompanyAdmin = req.user.portal === 'admin' || 
                           normalizedRoleName.includes('admin') || 
                           normalizedRoleName.includes('super');

    // 2. Fetch call logs from Asterisk API and DB entities in parallel
    const [authRes, dids, companyUsers, leads, metaIntegration] = await Promise.all([
      axios.get('http://172.16.17.127/api/api.php?action=GenerateAuthKey&user=apiUAsk&pass=7xK9pQ2mW5vB').catch(() => null),
      Did.find({ company_id: companyId, is_active: true, released_at: null })
        .populate('assigned_user_id', 'fullName email phoneNumber username')
        .sort({ assigned_at: -1, createdAt: -1 })
        .lean(),
      User.find({ companyId }, 'fullName email phoneNumber username roleId').populate('roleId', 'name').lean(),
      Lead.find({ companyId }, 'fullName phoneE164 email sourcePayload').lean(),
      PlatformIntegration.findOne({ companyId, platformType: 'meta' }).catch(() => null)
    ]);

    if (authRes?.data?.status !== 'success') {
      return apiError(res, 500, 'Failed to authenticate with call logs provider');
    }
    const token = authRes.data.data.token;
    const logsRes = await axios.get('http://172.16.17.127/api/api.php?action=GetRecentCalls', {
      headers: { 'X-Auth-Token': token }
    });
    const allCalls = logsRes.data?.data?.recent_calls || [];

    // Find primary admin user as fallback for company-level calls
    const primaryAdminUser = companyUsers.find(u => {
      const r = (u.roleId?.name || '').toLowerCase();
      return r.includes('super') || r.includes('admin');
    }) || companyUsers.find(u => String(u._id) === String(userId)) || companyUsers[0] || currentUser;

    // Map leads strictly for this company by all phone number formats
    const leadMap = {};
    leads.forEach(l => {
      const name = l.fullName || (l.sourcePayload?.full_name || l.sourcePayload?.name || '');
      if (name && l.phoneE164) {
        getPhoneKeys(l.phoneE164).forEach(k => {
          if (!leadMap[k]) leadMap[k] = name;
        });
      }
    });

    // If Meta integration exists, also fetch Meta form leads non-blockingly
    if (metaIntegration?.credentials?.metaPageAccessToken && metaIntegration?.credentials?.metaPageId) {
      try {
        const metaToken = metaIntegration.credentials.metaPageAccessToken;
        const pageId = metaIntegration.credentials.metaPageId;
        const formsRes = await axios.get(`https://graph.facebook.com/v20.0/${pageId}/leadgen_forms`, {
          params: { access_token: metaToken, limit: 50 },
          timeout: 3500
        }).catch(() => null);

        const forms = formsRes?.data?.data || [];
        if (forms.length > 0) {
          const formPromises = forms.map(f =>
            axios.get(`https://graph.facebook.com/v20.0/${f.id}/leads`, {
              params: { access_token: metaToken, fields: 'id,created_time,field_data', limit: 100 },
              timeout: 3500
            }).catch(() => null)
          );
          const formResults = await Promise.allSettled(formPromises);
          formResults.forEach(r => {
            if (r.status === 'fulfilled' && r.value?.data?.data) {
              r.value.data.data.forEach(item => {
                const fields = {};
                item.field_data?.forEach(fd => {
                  const val = fd.values?.[0] || '';
                  if (fd.name) fields[fd.name.toLowerCase()] = val;
                });
                const name = fields.full_name || fields.name || fields.first_name || '';
                const phone = fields.phone_number || fields.phone || '';
                if (phone && name) {
                  getPhoneKeys(phone).forEach(k => {
                    if (!leadMap[k]) leadMap[k] = name;
                  });
                }
              });
            }
          });
        }
      } catch {
        // Continue silently if Meta leads fetch fails
      }
    }

    // Map company DIDs
    const companyDidSet = new Set();
    const userExtMap = {};

    dids.forEach(d => {
      const assignedName = d.assigned_user_id?.fullName || primaryAdminUser?.fullName || 'Company User';
      getPhoneKeys(d.did_number).forEach(k => {
        companyDidSet.add(k);
        userExtMap[k] = assignedName;
      });
      if (d.did_number) {
        userExtMap[d.did_number] = assignedName;
        userExtMap[d.did_number.replace(/\D/g, '')] = assignedName;
      }
      userExtMap[String(d._id)] = assignedName;
    });

    // Map extensions / phone numbers / usernames / names to company user names
    const userNameMap = {};
    companyUsers.forEach(u => {
      if (!u.fullName) return;
      const fName = u.fullName.trim();
      userNameMap[fName.toLowerCase()] = fName;
      userExtMap[String(u._id)] = fName;

      if (u.username) {
        const uName = u.username.trim();
        userExtMap[uName] = fName;
        userExtMap[uName.toLowerCase()] = fName;
        getPhoneKeys(uName).forEach(k => { userExtMap[k] = fName; });
      }
      if (u.phoneNumber) {
        getPhoneKeys(u.phoneNumber).forEach(k => { userExtMap[k] = fName; });
      }
      if (u.email) {
        userExtMap[u.email.toLowerCase().trim()] = fName;
      }
    });

    // Determine numbers/extensions assigned strictly to current user
    const userNumbers = new Set();
    if (currentUser) {
      userNumbers.add(String(currentUser._id));
      if (currentUser.username) {
        userNumbers.add(currentUser.username.trim());
        userNumbers.add(currentUser.username.toLowerCase().trim());
        getPhoneKeys(currentUser.username).forEach(k => userNumbers.add(k));
      }
      if (currentUser.phoneNumber) {
        getPhoneKeys(currentUser.phoneNumber).forEach(k => userNumbers.add(k));
      }
      if (currentUser.email) {
        userNumbers.add(currentUser.email.toLowerCase().trim());
      }
    }
    dids.forEach(d => {
      const assignedId = d.assigned_user_id?._id || d.assigned_user_id;
      if (assignedId && String(assignedId) === String(userId)) {
        getPhoneKeys(d.did_number).forEach(k => userNumbers.add(k));
      }
    });

    const annotatedCalls = [];

    for (const call of allCalls) {
      const callerName = extractCallerName(call.callerid);
      const callerKeys = getPhoneKeys(call.callerid);
      const destKeys = getPhoneKeys(call.destination);
      const extKeys = getPhoneKeys(call.extension);
      const srcKeys = getPhoneKeys(call.src);
      const dstKeys = getPhoneKeys(call.dst);
      const chanExt = extractChannelEndpoint(call.channel);
      const dstChanExt = extractChannelEndpoint(call.dstchannel);

      const allCallKeys = [
        ...callerKeys, ...destKeys, ...extKeys, ...srcKeys, ...dstKeys,
        ...(chanExt ? [chanExt] : []),
        ...(dstChanExt ? [dstChanExt] : [])
      ];

      // Check if call was made/received by current user
      const isCurrentUserCallerName = callerName && currentUser?.fullName && 
        callerName.toLowerCase() === currentUser.fullName.toLowerCase();

      const isUserCall = isCurrentUserCallerName ||
        allCallKeys.some(k => userNumbers.has(k));

      // Match DID info using helper
      const matchedDidUser = matchDidInfo(allCallKeys, userExtMap, dids);

      // Match lead name: check destination first (outbound), then callerid (inbound), then dst
      const leadName = destKeys.map(k => leadMap[k]).find(Boolean) ||
        callerKeys.map(k => leadMap[k]).find(Boolean) ||
        dstKeys.map(k => leadMap[k]).find(Boolean) ||
        null;

      // Check if call belongs to this company
      const hasCompanyDid = Boolean(matchedDidUser) || allCallKeys.some(k => companyDidSet.has(k));
      const hasCompanyUser = allCallKeys.some(k => userExtMap[k]);
      const matchedUserByName = callerName ? (userNameMap[callerName.toLowerCase()] || companyUsers.find(u => u.fullName && u.fullName.toLowerCase().includes(callerName.toLowerCase()))?.fullName) : null;

      const isCompanyCall = isUserCall || hasCompanyDid || hasCompanyUser || Boolean(matchedUserByName) || (leadName !== null);

      // Filtering: show calls belonging to company or user
      if (isCompanyAdmin) {
        if (!isCompanyCall && !isUserCall) continue;
      } else {
        if (!isUserCall && !isCompanyCall) continue;
      }

      // Determine user name who made/received call
      const userName = matchedUserByName ||
        (isCurrentUserCallerName ? currentUser?.fullName : null) ||
        matchedDidUser ||
        allCallKeys.map(k => userExtMap[k]).find(Boolean) ||
        callerName ||
        (isUserCall ? (currentUser?.fullName || 'User') : null) ||
        (isCompanyCall ? (primaryAdminUser?.fullName || 'Company User') : null);

      annotatedCalls.push({
        ...call,
        userName,
        leadName
      });
    }

    const enrichedLogs = enrichCallsWithRecordings(annotatedCalls);

    return success(res, {
      logs: enrichedLogs,
      isCompanyAdmin,
      roleName
    }, 'Company call logs fetched successfully');
  } catch (err) {
    console.error('[Telephony Controller] getCompanyCallLogs Error:', err);
    return apiError(res, 500, err.message);
  }
};

/**
 * GET /api/v1/telephony/admin/logs
 * Admin-only: returns ALL calls enriched with userName, companyName, companyId, leadName.
 * Supports optional query param: ?companyId=<id> to server-side filter by company.
 */
export const getAdminMasterLogs = async (req, res) => {
  try {
    // Only admin portal users can call this
    if (req.user?.portal !== 'admin') {
      return apiError(res, 403, 'Admin access required');
    }

    const filterCompanyId = req.query.companyId || null;

    // 1. Fetch all calls from Asterisk and all DB entities in parallel
    const [authRes, companies, allDids, allUsers, allLeads] = await Promise.all([
      axios.get('http://172.16.17.127/api/api.php?action=GenerateAuthKey&user=apiUAsk&pass=7xK9pQ2mW5vB').catch(() => null),
      Company.find({}, '_id name tenantId').lean(),
      Did.find({
        company_id: { $ne: null },
        is_active: true,
        released_at: null,
      }).populate('assigned_user_id', 'fullName email phoneNumber username')
        .populate('company_id', 'name')
        .sort({ assigned_at: -1, createdAt: -1 })
        .lean(),
      User.find(
        { portal: 'customer', companyId: { $ne: null } },
        'fullName email phoneNumber username companyId roleId'
      ).populate('roleId', 'name').lean(),
      Lead.find({}, 'fullName phoneE164 email companyId sourcePayload').lean()
    ]);

    if (authRes?.data?.status !== 'success') {
      return apiError(res, 500, 'Failed to authenticate with call logs provider');
    }
    const token = authRes.data.data.token;
    const logsRes = await axios.get('http://172.16.17.127/api/api.php?action=GetRecentCalls', {
      headers: { 'X-Auth-Token': token }
    });
    const allCalls = logsRes.data?.data?.recent_calls || [];

    // Build company lookup map: companyId (string) → company name
    const companyNameMap = {};
    companies.forEach(c => {
      companyNameMap[String(c._id)] = c.name;
    });

    // Build lead lookup map for master logs
    const masterLeadMap = {};
    allLeads.forEach(l => {
      const name = l.fullName || (l.sourcePayload?.full_name || l.sourcePayload?.name || '');
      if (name && l.phoneE164) {
        getPhoneKeys(l.phoneE164).forEach(k => {
          if (!masterLeadMap[k]) masterLeadMap[k] = name;
        });
      }
    });

    // Build DID-based and user-based lookup: identifier → { userName, companyId, companyName }
    const extMap = {};

    // Group users by company to find default company admin
    const companyUsersMap = {};
    allUsers.forEach(u => {
      const cId = String(u.companyId || '');
      if (!companyUsersMap[cId]) companyUsersMap[cId] = [];
      companyUsersMap[cId].push(u);
    });

    allDids.forEach(d => {
      const cId = String(d.company_id?._id || d.company_id || '');
      const cName = d.company_id?.name || companyNameMap[cId] || 'Company';
      const cUsers = companyUsersMap[cId] || [];
      const defaultAdmin = cUsers.find(u => {
        const r = (u.roleId?.name || '').toLowerCase();
        return r.includes('admin') || r.includes('super');
      }) || cUsers[0];
      const userName = d.assigned_user_id?.fullName || defaultAdmin?.fullName || 'Company User';

      const info = {
        userName,
        companyId: cId,
        companyName: cName,
      };

      getPhoneKeys(d.did_number).forEach(k => {
        extMap[k] = info;
      });
      if (d.did_number) {
        extMap[d.did_number] = info;
        extMap[d.did_number.replace(/\D/g, '')] = info;
      }
      extMap[String(d._id)] = info;
    });

    // Also map users by their phoneNumber, username, and ID
    allUsers.forEach(u => {
      const cId = String(u.companyId || '');
      const cName = companyNameMap[cId] || 'Company';
      const info = { userName: u.fullName, companyId: cId, companyName: cName };

      extMap[String(u._id)] = info;
      if (u.phoneNumber) {
        getPhoneKeys(u.phoneNumber).forEach(k => {
          if (!extMap[k]) extMap[k] = info;
        });
      }
      if (u.username) {
        const trimmed = u.username.trim();
        if (trimmed && !extMap[trimmed]) extMap[trimmed] = info;
        getPhoneKeys(trimmed).forEach(k => {
          if (!extMap[k]) extMap[k] = info;
        });
      }
    });

    // Map user full names for direct name lookup
    const nameMap = {};
    allUsers.forEach(u => {
      if (u.fullName) {
        const cId = String(u.companyId || '');
        const cName = companyNameMap[cId] || 'Company';
        nameMap[u.fullName.toLowerCase().trim()] = {
          userName: u.fullName,
          companyId: cId,
          companyName: cName
        };
      }
    });

    // 5. Annotate every call
    const annotatedCalls = allCalls.map(call => {
      const callerName = extractCallerName(call.callerid);
      const callerKeys = getPhoneKeys(call.callerid);
      const destKeys = getPhoneKeys(call.destination);
      const extKeys = getPhoneKeys(call.extension);
      const srcKeys = getPhoneKeys(call.src);
      const dstKeys = getPhoneKeys(call.dst);
      const chanExt = extractChannelEndpoint(call.channel);
      const dstChanExt = extractChannelEndpoint(call.dstchannel);

      const allCallKeys = [
        ...callerKeys, ...destKeys, ...extKeys, ...srcKeys, ...dstKeys,
        ...(chanExt ? [chanExt] : []),
        ...(dstChanExt ? [dstChanExt] : [])
      ];

      const nameMatch = callerName ? nameMap[callerName.toLowerCase().trim()] : null;
      const keyMatch = matchDidInfo(allCallKeys, extMap, allDids) || allCallKeys.map(k => extMap[k]).find(Boolean);
      const match = nameMatch || keyMatch || null;

      const leadName = destKeys.map(k => masterLeadMap[k]).find(Boolean) ||
        callerKeys.map(k => masterLeadMap[k]).find(Boolean) ||
        dstKeys.map(k => masterLeadMap[k]).find(Boolean) ||
        null;

      const annotated = {
        ...call,
        userName: match?.userName || callerName || null,
        companyId: match?.companyId || null,
        companyName: match?.companyName || null,
        leadName,
      };
      return annotated;
    });

    // 6. Optional server-side company filter
    const resultCalls = filterCompanyId && filterCompanyId !== 'all'
      ? annotatedCalls.filter(c => c.companyId === filterCompanyId)
      : annotatedCalls;

    const enrichedLogs = enrichCallsWithRecordings(resultCalls);

    return success(res, {
      logs: enrichedLogs,
      totalAll: annotatedCalls.length,
      totalFiltered: resultCalls.length,
    }, 'Admin master call logs fetched successfully');
  } catch (err) {
    console.error('[Telephony Controller] getAdminMasterLogs Error:', err);
    return apiError(res, 500, err.message);
  }
};


/**
 * GET /api/v1/telephony/notes/:callId
 * Fetch notes for a specific call ID scoped to company.
 */
export const getCallNotes = async (req, res) => {
  try {
    const { callId } = req.params;
    const companyId = req.user.companyId;

    if (!companyId) {
      return apiError(res, 400, 'Company ID missing from user session');
    }

    const notes = await CallNote.find({ companyId, callId }).sort({ createdAt: -1 });
    return success(res, notes, 'Call notes fetched successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

/**
 * POST /api/v1/telephony/notes/:callId
 * Add a new note for a specific call ID.
 */
export const addCallNote = async (req, res) => {
  try {
    const { callId } = req.params;
    const { note } = req.body;
    const companyId = req.user.companyId;
    const userId = req.user.userId;

    if (!note || !note.trim()) {
      return apiError(res, 400, 'Note text is required');
    }

    const currentUser = await User.findById(userId);
    const authorName = currentUser?.fullName || req.user.email || 'User';

    const newNote = await CallNote.create({
      companyId,
      callId,
      userId,
      authorName,
      note: note.trim()
    });

    return success(res, newNote, 'Call note added successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};


