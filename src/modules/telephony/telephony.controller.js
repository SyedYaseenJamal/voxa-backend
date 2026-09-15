import fs from 'fs';
import path from 'path';
import axios from 'axios';
import User from '../auth/auth.model.js';
import Lead from '../integrations/lead.model.js';
import Did from '../dids/did.model.js';
import Company from '../companies/company.model.js';
import { CallAnalysis } from './callAnalysis.model.js';
import { CallNote } from './callNote.model.js';
import { findRecordingFile, callPipelineProcess, callPipelineTranscribe, callPipelineSummarize } from './telephony.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const checkRecording = async (req, res) => {
  try {
    const { uniqueid, phone, filename } = req.query;
    if (!uniqueid && !filename) {
      return apiError(res, 400, 'uniqueid or filename parameter is required');
    }

    const filePath = findRecordingFile(uniqueid, phone, filename);
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
    const { uniqueid, phone, filename } = req.query;
    const filePath = findRecordingFile(uniqueid, phone, filename);

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
    const { call_id, uniqueid, phone, filename, audio_url, script = 'mixed' } = req.body;
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

    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);
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

    // 2. Fetch call logs from Asterisk API
    const authRes = await axios.get('http://172.16.17.127/api/api.php?action=GenerateAuthKey&user=apiUAsk&pass=7xK9pQ2mW5vB');
    if (authRes.data?.status !== 'success') {
      return apiError(res, 500, 'Failed to authenticate with call logs provider');
    }
    const token = authRes.data.data.token;
    const logsRes = await axios.get('http://172.16.17.127/api/api.php?action=GetRecentCalls', {
      headers: { 'X-Auth-Token': token }
    });
    const allCalls = logsRes.data?.data?.recent_calls || [];

    // 3. Fetch DIDs, Users & Leads strictly for THIS company
    const [dids, companyUsers, leads, companyDoc] = await Promise.all([
      Did.find({ company_id: companyId }).populate('assigned_user_id', 'fullName email phoneNumber username'),
      User.find({ companyId }, 'fullName email phoneNumber username roleId').populate('roleId', 'name'),
      Lead.find({ companyId }, 'fullName phoneE164 email'),
      Company.findById(companyId, 'name tenant')
    ]);

    // Find primary admin user as fallback for company-level calls
    const primaryAdminUser = companyUsers.find(u => {
      const r = (u.roleId?.name || '').toLowerCase();
      return r.includes('super') || r.includes('admin');
    }) || companyUsers[0] || currentUser;

    // Map leads strictly for this company by normalized phone number
    const leadMap = {};
    leads.forEach(l => {
      const core = normalizeNumber(l.phoneE164);
      const raw = extractRawNumber(l.phoneE164);
      if (core && l.fullName) leadMap[core] = l.fullName;
      if (raw && l.fullName) leadMap[raw] = l.fullName;
    });

    // Map extensions / DIDs / phone numbers / usernames to company user names
    const userExtMap = {};
    companyUsers.forEach(u => {
      if (!u.fullName) return;
      userExtMap[String(u._id)] = u.fullName;
      if (u.username) {
        userExtMap[u.username.trim()] = u.fullName;
        userExtMap[u.username.toLowerCase().trim()] = u.fullName;
        const normUser = normalizeNumber(u.username);
        if (normUser) userExtMap[normUser] = u.fullName;
      }
      if (u.phoneNumber) {
        const core = normalizeNumber(u.phoneNumber);
        const raw = extractRawNumber(u.phoneNumber);
        if (core) userExtMap[core] = u.fullName;
        if (raw) userExtMap[raw] = u.fullName;
      }
      if (u.email) {
        userExtMap[u.email.toLowerCase().trim()] = u.fullName;
      }
    });

    // Map company DIDs
    const companyDidSet = new Set();
    dids.forEach(d => {
      const assignedName = d.assigned_user_id?.fullName || primaryAdminUser?.fullName || 'Company User';
      const core = normalizeNumber(d.did_number);
      const raw = extractRawNumber(d.did_number);
      if (core) {
        userExtMap[core] = assignedName;
        companyDidSet.add(core);
      }
      if (raw) {
        userExtMap[raw] = assignedName;
        companyDidSet.add(raw);
      }
    });

    // Determine numbers/extensions assigned strictly to current user
    const userNumbers = new Set();
    if (currentUser) {
      userNumbers.add(String(currentUser._id));
      if (currentUser.username) {
        userNumbers.add(currentUser.username.trim());
        userNumbers.add(currentUser.username.toLowerCase().trim());
      }
      if (currentUser.phoneNumber) {
        const core = normalizeNumber(currentUser.phoneNumber);
        const raw = extractRawNumber(currentUser.phoneNumber);
        if (core) userNumbers.add(core);
        if (raw) userNumbers.add(raw);
      }
    }
    dids.forEach(d => {
      const assignedId = d.assigned_user_id?._id || d.assigned_user_id;
      if (assignedId && String(assignedId) === String(userId)) {
        const core = normalizeNumber(d.did_number);
        const raw = extractRawNumber(d.did_number);
        if (core) userNumbers.add(core);
        if (raw) userNumbers.add(raw);
      }
    });

    const annotatedCalls = [];

    for (const call of allCalls) {
      const callerName = extractCallerName(call.callerid);
      const callerNum = extractRawNumber(call.callerid);
      const callerCore = normalizeNumber(call.callerid);

      const destNum = extractRawNumber(call.destination);
      const destCore = normalizeNumber(call.destination);

      const ext = (call.extension || '').trim();
      const extCore = normalizeNumber(ext);

      const srcNum = extractRawNumber(call.src);
      const srcCore = normalizeNumber(call.src);

      const dstNum = extractRawNumber(call.dst);
      const dstCore = normalizeNumber(call.dst);

      const chanExt = extractChannelEndpoint(call.channel);
      const dstChanExt = extractChannelEndpoint(call.dstchannel);

      // Check if call was made/received by current user
      const isCurrentUserCallerName = callerName && currentUser?.fullName && 
        callerName.toLowerCase() === currentUser.fullName.toLowerCase();

      const isUserCall = isCurrentUserCallerName ||
        [callerCore, callerNum, destCore, destNum, ext, extCore, srcCore, srcNum, dstCore, dstNum, chanExt, dstChanExt]
          .some(k => k && userNumbers.has(k));

      // Check if call belongs to this company
      const isCompanyCall = isUserCall ||
        [callerCore, callerNum, destCore, destNum, ext, extCore, srcCore, srcNum, dstCore, dstNum, chanExt, dstChanExt]
          .some(k => k && (companyDidSet.has(k) || userExtMap[k])) ||
        (callerName && companyUsers.some(u => u.fullName && u.fullName.toLowerCase() === callerName.toLowerCase()));

      // Role-based filtering:
      // Non-admins only see calls they made/received
      if (!isCompanyAdmin && !isUserCall) {
        continue;
      }
      // Company admins see all calls belonging to their company
      if (isCompanyAdmin && !isCompanyCall && !isUserCall) {
        continue;
      }

      // Check if callerName matches a known company user
      const matchedUserByName = callerName 
        ? companyUsers.find(u => u.fullName && u.fullName.toLowerCase() === callerName.toLowerCase())
        : null;

      // Determine user name who made/received call
      const userName = matchedUserByName?.fullName ||
        (chanExt && userExtMap[chanExt]) ||
        (dstChanExt && userExtMap[dstChanExt]) ||
        (ext && userExtMap[ext]) ||
        (extCore && userExtMap[extCore]) ||
        (callerCore && userExtMap[callerCore]) ||
        (callerNum && userExtMap[callerNum]) ||
        (srcCore && userExtMap[srcCore]) ||
        (srcNum && userExtMap[srcNum]) ||
        (destCore && userExtMap[destCore]) ||
        (destNum && userExtMap[destNum]) ||
        (dstCore && userExtMap[dstCore]) ||
        (dstNum && userExtMap[dstNum]) ||
        callerName ||
        (isUserCall ? (currentUser?.fullName || 'User') : null) ||
        (isCompanyCall ? (primaryAdminUser?.fullName || 'Company User') : null);

      // Match lead name for this company strictly
      const leadName = (destCore && leadMap[destCore]) ||
        (destNum && leadMap[destNum]) ||
        (callerCore && leadMap[callerCore]) ||
        (callerNum && leadMap[callerNum]) ||
        null;

      annotatedCalls.push({
        ...call,
        userName,
        leadName
      });
    }

    return success(res, {
      logs: annotatedCalls,
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
 * Admin-only: returns ALL calls enriched with userName, companyName, companyId.
 * Supports optional query param: ?companyId=<id> to server-side filter by company.
 */
export const getAdminMasterLogs = async (req, res) => {
  try {
    // Only admin portal users can call this
    if (req.user?.portal !== 'admin') {
      return apiError(res, 403, 'Admin access required');
    }

    const filterCompanyId = req.query.companyId || null;

    // 1. Fetch all calls from Asterisk
    const authRes = await axios.get('http://172.16.17.127/api/api.php?action=GenerateAuthKey&user=apiUAsk&pass=7xK9pQ2mW5vB');
    if (authRes.data?.status !== 'success') {
      return apiError(res, 500, 'Failed to authenticate with call logs provider');
    }
    const token = authRes.data.data.token;
    const logsRes = await axios.get('http://172.16.17.127/api/api.php?action=GetRecentCalls', {
      headers: { 'X-Auth-Token': token }
    });
    const allCalls = logsRes.data?.data?.recent_calls || [];

    // 2. Load all companies
    const companies = await Company.find({}, '_id name tenantId').lean();

    // 3. Load all DIDs (with assigned_user_id populated) across all companies
    const allDids = await Did.find({
      company_id: { $ne: null },
      status: 'assigned',
      is_active: true,
    }).populate('assigned_user_id', 'fullName email phoneNumber username')
      .populate('company_id', 'name')
      .lean();

    // 4. Load all company users
    const allUsers = await User.find(
      { portal: 'customer', companyId: { $ne: null } },
      'fullName email phoneNumber username companyId'
    ).lean();

    // Build company lookup map: companyId (string) → company name
    const companyNameMap = {};
    companies.forEach(c => {
      companyNameMap[String(c._id)] = c.name;
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
      const defaultUser = companyUsersMap[cId]?.[0];
      const userName = d.assigned_user_id?.fullName || defaultUser?.fullName || 'Company User';

      const info = {
        userName,
        companyId: cId,
        companyName: cName,
      };

      const core = normalizeNumber(d.did_number);
      const raw = extractRawNumber(d.did_number);
      if (core) extMap[core] = info;
      if (raw) extMap[raw] = info;
    });

    // Also map users by their phoneNumber, username, and ID
    allUsers.forEach(u => {
      const cId = String(u.companyId || '');
      const cName = companyNameMap[cId] || 'Company';
      const info = { userName: u.fullName, companyId: cId, companyName: cName };

      extMap[String(u._id)] = info;
      if (u.phoneNumber) {
        const core = normalizeNumber(u.phoneNumber);
        const raw = extractRawNumber(u.phoneNumber);
        if (core && !extMap[core]) extMap[core] = info;
        if (raw && !extMap[raw]) extMap[raw] = info;
      }
      if (u.username) {
        const trimmed = u.username.trim();
        if (trimmed && !extMap[trimmed]) extMap[trimmed] = info;
        const normUser = normalizeNumber(trimmed);
        if (normUser && !extMap[normUser]) extMap[normUser] = info;
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
      const callerNum = extractRawNumber(call.callerid);
      const callerCore = normalizeNumber(call.callerid);

      const destNum = extractRawNumber(call.destination);
      const destCore = normalizeNumber(call.destination);

      const ext = (call.extension || '').trim();
      const extCore = normalizeNumber(ext);

      const srcNum = extractRawNumber(call.src);
      const srcCore = normalizeNumber(call.src);

      const dstNum = extractRawNumber(call.dst);
      const dstCore = normalizeNumber(call.dst);

      const chanExt = extractChannelEndpoint(call.channel);
      const dstChanExt = extractChannelEndpoint(call.dstchannel);

      const nameMatch = callerName ? nameMap[callerName.toLowerCase().trim()] : null;

      const match = nameMatch ||
        (chanExt && extMap[chanExt]) ||
        (dstChanExt && extMap[dstChanExt]) ||
        (ext && extMap[ext]) ||
        (extCore && extMap[extCore]) ||
        (callerCore && extMap[callerCore]) ||
        (callerNum && extMap[callerNum]) ||
        (srcCore && extMap[srcCore]) ||
        (srcNum && extMap[srcNum]) ||
        (destCore && extMap[destCore]) ||
        (destNum && extMap[destNum]) ||
        (dstCore && extMap[dstCore]) ||
        (dstNum && extMap[dstNum]) ||
        null;

      const annotated = {
        ...call,
        userName: match?.userName || callerName || null,
        companyId: match?.companyId || null,
        companyName: match?.companyName || null,
      };
      return annotated;
    });

    // 6. Optional server-side company filter
    const resultCalls = filterCompanyId && filterCompanyId !== 'all'
      ? annotatedCalls.filter(c => c.companyId === filterCompanyId)
      : annotatedCalls;

    return success(res, {
      logs: resultCalls,
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


