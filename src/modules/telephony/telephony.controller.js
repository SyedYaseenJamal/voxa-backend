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

/**
 * GET /api/v1/telephony/company/logs
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
    const [dids, companyUsers, leads] = await Promise.all([
      Did.find({ company_id: companyId }).populate('assigned_user_id', 'fullName email phoneNumber'),
      User.find({ companyId }),
      Lead.find({ companyId }, 'fullName phoneE164 email')
    ]);

    const normalize = (num) => (num || '').replace(/\D/g, '').slice(-10);

    // Map leads strictly for this company by normalized phone number
    const leadMap = {};
    leads.forEach(l => {
      const core = normalize(l.phoneE164);
      if (core && l.fullName) {
        leadMap[core] = l.fullName;
      }
    });

    // Map extensions / DIDs / phone numbers to company user names
    const userExtMap = {};
    companyUsers.forEach(u => {
      if (u.phoneNumber) userExtMap[normalize(u.phoneNumber)] = u.fullName;
      if (u.username) userExtMap[u.username] = u.fullName;
    });
    dids.forEach(d => {
      if (d.assigned_user_id?.fullName) {
        const core = normalize(d.did_number);
        if (core) userExtMap[core] = d.assigned_user_id.fullName;
      }
    });

    // Determine numbers/extensions assigned to current user
    const userNumbers = new Set();
    if (currentUser?.phoneNumber) userNumbers.add(normalize(currentUser.phoneNumber));
    if (currentUser?.username) userNumbers.add(currentUser.username);
    dids.forEach(d => {
      const assignedId = d.assigned_user_id?._id || d.assigned_user_id;
      if (assignedId && String(assignedId) === String(userId)) {
        userNumbers.add(normalize(d.did_number));
      }
    });

    const annotatedCalls = [];

    for (const call of allCalls) {
      const callerCore = normalize(call.callerid);
      const destCore = normalize(call.destination);
      const ext = call.extension || '';

      const isUserCall = userNumbers.has(callerCore) || userNumbers.has(destCore) || userNumbers.has(ext);

      // Role-based filtering: non-admins can only see calls they made/received
      if (!isCompanyAdmin && !isUserCall) {
        continue;
      }

      // Determine user name who made/received call
      const userName = userExtMap[ext] || userExtMap[callerCore] || userExtMap[destCore] || (isUserCall ? currentUser.fullName : null);

      // Match lead name for this company strictly
      const leadName = leadMap[destCore] || leadMap[callerCore] || null;

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

    const normalize = (num) => (num || '').replace(/\D/g, '').slice(-10);

    // Build company lookup map: companyId (string) → company name
    const companyNameMap = {};
    companies.forEach(c => {
      companyNameMap[String(c._id)] = c.name;
    });

    // Build DID-based lookup: extension/phone → { userName, companyId, companyName }
    // Keyed by normalized phone number of the DID
    const extMap = {};

    allDids.forEach(d => {
      if (!d.assigned_user_id?.fullName) return;
      const cId = String(d.company_id?._id || d.company_id || '');
      const cName = d.company_id?.name || companyNameMap[cId] || 'Unknown Company';
      const core = normalize(d.did_number);
      if (core) {
        extMap[core] = {
          userName: d.assigned_user_id.fullName,
          companyId: cId,
          companyName: cName,
        };
      }
      // Also key by the full DID number in case normalize strips too much
      const raw = (d.did_number || '').trim();
      if (raw && raw !== core) {
        extMap[raw] = extMap[core];
      }
    });

    // Also map users by their phoneNumber and username (extension)
    allUsers.forEach(u => {
      const cId = String(u.companyId || '');
      const cName = companyNameMap[cId] || 'Unknown Company';
      const info = { userName: u.fullName, companyId: cId, companyName: cName };
      if (u.phoneNumber) {
        const core = normalize(u.phoneNumber);
        if (core && !extMap[core]) extMap[core] = info;
      }
      if (u.username) {
        if (!extMap[u.username]) extMap[u.username] = info;
      }
    });

    // 5. Annotate every call
    const annotatedCalls = allCalls.map(call => {
      const callerCore = normalize(call.callerid);
      const destCore = normalize(call.destination);
      const ext = call.extension || '';

      const match = extMap[ext] || extMap[callerCore] || extMap[destCore] || null;

      const annotated = {
        ...call,
        userName: match?.userName || null,
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


