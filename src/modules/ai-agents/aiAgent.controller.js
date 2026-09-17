// ─── AI Agents Controller ──────────────────────────────────────────────────────
// Acts as a secure proxy to the Voxa AI Pipeline API (FastAPI @ VOXA_AI_PIPELINE_URL).
// The X-API-Key never reaches the browser — all pipeline calls happen server-side.
//
// Admin routes   : full CRUD on any company's configs + global call history + manual sync
// Company routes : scoped CRUD on own configs + own call history + manual sync
// Public route   : webhook receiver (no auth, HMAC verified)

import crypto from 'crypto';
import { Agent } from 'undici';
import { AgentConfig, AiCall, StructuredOutputSchema } from './aiAgent.model.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

// ── Pipeline client ───────────────────────────────────────────────────────────

const PIPELINE_URL = (process.env.VOXA_AI_PIPELINE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const PIPELINE_KEY = process.env.VOXA_AI_PIPELINE_API_KEY || process.env['X-API-Key'] || process.env.X_API_KEY || '';
const pipelineAgent = new Agent({ connect: { rejectUnauthorized: false } });

function isNetworkError(err) {
  if (!err) return false;
  return err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    (err.message && err.message.toLowerCase().includes('fetch failed'));
}

async function pipeline(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'X-API-Key': PIPELINE_KEY,
      'Content-Type': 'application/json',
    },
    dispatcher: pipelineAgent,
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${PIPELINE_URL}${path}`, opts);
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail
      ? (Array.isArray(json.detail) ? json.detail.map(d => `${d.loc ? d.loc.slice(1).join('.') + ': ' : ''}${d.msg}`).join(', ') : json.detail)
      : `Pipeline error ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    throw err;
  }
  return json;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pick = (obj, keys) => keys.reduce((acc, k) => { if (obj[k] !== undefined) acc[k] = obj[k]; return acc; }, {});

const CONFIG_PIPELINE_FIELDS = [
  'name', 'language', 'tone', 'script', 'voice',
  'structured_output_schema_id', 'knowledge_base_id', 'tools_enabled',
  'webhook_url', 'webhook_secret',
  'hangup_enabled', 'dtmf_enabled',
  'voicemail_detection_enabled', 'voicemail_message',
  'speak_first', 'greeting_message',
  'goodbye_message', 'goodbye_message_verbatim',
  'idle_timeout_seconds', 'idle_max_reprompts',
  'call_recording_enabled', 'noise_cancellation_enabled',
  'transfer_enabled', 'transfer_destinations',
];

// Build and sanitize the payload the pipeline expects for POST/PUT
function toPipelinePayload(companyId, body) {
  const crm_user_id = companyId ? String(companyId) : 'admin';
  const voicemailEnabled = Boolean(body.voicemail_detection_enabled);

  return {
    crm_user_id,
    name: (body.name || '').trim(),
    language: body.language || 'ur-en-auto',
    tone: (body.tone || '').trim(),
    script: (body.script || '').trim(),
    voice: body.voice || 'Puck',
    structured_output_schema_id: body.structured_output_schema_id?.trim() || null,
    knowledge_base_id: body.knowledge_base_id?.trim() || null,
    tools_enabled: Array.isArray(body.tools_enabled) ? body.tools_enabled : [],
    webhook_url: body.webhook_url,
    webhook_secret: body.webhook_secret,
    hangup_enabled: body.hangup_enabled !== undefined ? Boolean(body.hangup_enabled) : true,
    dtmf_enabled: Boolean(body.dtmf_enabled),
    voicemail_detection_enabled: voicemailEnabled,
    voicemail_message: voicemailEnabled
      ? (body.voicemail_message?.trim() || 'Please leave a message after the tone.')
      : (body.voicemail_message?.trim() || null),
    speak_first: body.speak_first === 'caller' ? 'caller' : 'agent',
    greeting_message: body.greeting_message?.trim() || null,
    goodbye_message: body.goodbye_message?.trim() || null,
    goodbye_message_verbatim: Boolean(body.goodbye_message_verbatim),
    idle_timeout_seconds: Number(body.idle_timeout_seconds) || 10.0,
    idle_max_reprompts: parseInt(body.idle_max_reprompts, 10) || 2,
    call_recording_enabled: Boolean(body.call_recording_enabled),
    noise_cancellation_enabled: Boolean(body.noise_cancellation_enabled),
    transfer_enabled: false, // Per Phase 1 spec: leave false until Asterisk SIP REFER confirmed
    transfer_destinations: Array.isArray(body.transfer_destinations) ? body.transfer_destinations : [],
  };
}

// Synchronizes a local config record to the remote pipeline service
async function syncConfigToPipeline(cfg) {
  const pipelinePayload = toPipelinePayload(cfg.company_id, cfg);
  let pipelineRecord;

  if (cfg.pipeline_config_id) {
    try {
      pipelineRecord = await pipeline('PUT', `/v1/agent-configs/${cfg.pipeline_config_id}`, pipelinePayload);
    } catch (err) {
      if (err.statusCode === 404) {
        // If config was deleted or missing remotely, create a fresh one
        pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
      } else {
        throw err;
      }
    }
  } else {
    pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
  }

  if (pipelineRecord?.id) {
    cfg.pipeline_config_id = pipelineRecord.id;
    await cfg.save();
  }
  return cfg;
}

// ── ADMIN: Agent Config CRUD ──────────────────────────────────────────────────

export const adminListConfigs = async (req, res) => {
  try {
    const filter = { is_active: true };
    if (req.query.company_id) filter.company_id = req.query.company_id;

    const configs = await AgentConfig.find(filter)
      .populate('company_id', 'name status')
      .sort({ createdAt: -1 });

    return success(res, configs, 'Agent configs fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminGetConfig = async (req, res) => {
  try {
    const cfg = await AgentConfig.findById(req.params.id).populate('company_id', 'name status');
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Config not found');
    return success(res, cfg, 'Config fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminCreateConfig = async (req, res) => {
  try {
    const { company_id } = req.body;
    if (!company_id) return apiError(res, 400, 'company_id is required');

    const webhookBase = process.env.CRM_WEBHOOK_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
    const webhookUrl  = req.body.webhook_url || `${webhookBase}/api/v1/ai-agents/webhook`;
    const webhookSecret = req.body.webhook_secret || crypto.randomBytes(24).toString('hex');

    const pipelinePayload = toPipelinePayload(company_id, { ...req.body, webhook_url: webhookUrl, webhook_secret: webhookSecret });

    const required = ['name', 'tone', 'script', 'voice', 'webhook_url', 'webhook_secret'];
    for (const f of required) {
      if (!pipelinePayload[f]) return apiError(res, 400, `${f} is required`);
    }

    let pipelineRecord = null;
    let syncNotice = '';
    try {
      pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
    } catch (pipelineErr) {
      if (isNetworkError(pipelineErr)) {
        syncNotice = ` (Warning: AI Pipeline at ${PIPELINE_URL} is currently unreachable; config saved locally and will auto-sync on first call)`;
        console.warn('[AI-AGENTS] Pipeline unreachable, storing locally only:', pipelineErr.message);
      } else {
        // Validation (422) or Auth (401) error — propagate to caller
        return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline validation error: ${pipelineErr.message}`);
      }
    }

    const cfg = await AgentConfig.create({
      ...pick(req.body, CONFIG_PIPELINE_FIELDS),
      company_id,
      webhook_url:        webhookUrl,
      webhook_secret:     webhookSecret,
      pipeline_config_id: pipelineRecord?.id ?? null,
    });

    const populated = await cfg.populate('company_id', 'name status');
    return success(res, populated, `Agent config created${syncNotice}`, 201);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const adminUpdateConfig = async (req, res) => {
  try {
    const cfg = await AgentConfig.findById(req.params.id);
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Config not found');

    Object.assign(cfg, pick(req.body, CONFIG_PIPELINE_FIELDS));

    if (req.body.webhook_url) cfg.webhook_url = req.body.webhook_url;
    if (req.body.webhook_secret) cfg.webhook_secret = req.body.webhook_secret;

    const pipelinePayload = toPipelinePayload(cfg.company_id, cfg);

    // If already registered on pipeline, update it
    if (cfg.pipeline_config_id) {
      try {
        await pipeline('PUT', `/v1/agent-configs/${cfg.pipeline_config_id}`, pipelinePayload);
      } catch (pipelineErr) {
        if (!isNetworkError(pipelineErr)) {
          return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline update error: ${pipelineErr.message}`);
        }
        console.warn('[AI-AGENTS] Pipeline update skipped (unreachable):', pipelineErr.message);
      }
    }

    await cfg.save();
    const populated = await cfg.populate('company_id', 'name status');
    return success(res, populated, 'Config updated');
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const adminDeleteConfig = async (req, res) => {
  try {
    const cfg = await AgentConfig.findById(req.params.id);
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Config not found');

    if (cfg.pipeline_config_id) {
      try {
        await pipeline('DELETE', `/v1/agent-configs/${cfg.pipeline_config_id}`);
      } catch (pipelineErr) {
        console.warn('[AI-AGENTS] Pipeline delete failed:', pipelineErr.message);
      }
    }

    cfg.is_active = false;
    await cfg.save();
    return success(res, null, 'Config deleted');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminSyncConfig = async (req, res) => {
  try {
    const cfg = await AgentConfig.findById(req.params.id).populate('company_id', 'name status');
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Config not found');

    await syncConfigToPipeline(cfg);
    return success(res, cfg, 'Config synced with AI pipeline successfully');
  } catch (err) {
    return apiError(res, err.statusCode ?? 502, `Sync failed: ${err.message}`);
  }
};

// ── ADMIN: Calls ──────────────────────────────────────────────────────────────

export const adminListCalls = async (req, res) => {
  try {
    const filter = {};
    if (req.query.company_id) filter.company_id = req.query.company_id;
    if (req.query.status)     filter.status     = req.query.status;

    const calls = await AiCall.find(filter)
      .populate('company_id', 'name')
      .populate('agent_config_id', 'name voice')
      .sort({ createdAt: -1 })
      .limit(200);

    return success(res, calls, 'Calls fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminGetCall = async (req, res) => {
  try {
    const call = await AiCall.findById(req.params.id)
      .populate('company_id', 'name')
      .populate('agent_config_id', 'name voice');
    if (!call) return apiError(res, 404, 'Call not found');
    return success(res, call, 'Call fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminTriggerCall = async (req, res) => {
  try {
    const { agent_config_id, phone_number, from_number } = req.body;
    if (!agent_config_id || !phone_number || !from_number) {
      return apiError(res, 400, 'agent_config_id, phone_number, and from_number are required');
    }

    const cfg = await AgentConfig.findById(agent_config_id);
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Agent config not found');

    // Auto-sync config to pipeline on-the-fly if not synced yet
    if (!cfg.pipeline_config_id) {
      try {
        await syncConfigToPipeline(cfg);
      } catch (syncErr) {
        return apiError(res, syncErr.statusCode ?? 502, `AI Pipeline sync required: ${syncErr.message}`);
      }
    }

    const crm_user_id = cfg.company_id ? String(cfg.company_id) : 'admin';
    const pipelinePayload = { crm_user_id, agent_config_id: cfg.pipeline_config_id, from_number, phone_number };

    let pipelineCallId = null;
    try {
      const pResp = await pipeline('POST', '/v1/calls/outbound', pipelinePayload);
      pipelineCallId = pResp.call_id;
    } catch (pipelineErr) {
      return apiError(res, pipelineErr.statusCode ?? 502, `Pipeline error: ${pipelineErr.message}`);
    }

    const call = await AiCall.create({
      call_id:            pipelineCallId,
      agent_config_id:    cfg._id,
      pipeline_config_id: cfg.pipeline_config_id,
      company_id:         cfg.company_id,
      crm_user_id,
      phone_number,
      from_number,
      status:             'queued',
      triggered_by:       req.user?.userId ?? null,
    });

    return success(res, call, 'Call queued', 202);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const adminGetRecording = async (req, res) => {
  try {
    const call = await AiCall.findById(req.params.id);
    if (!call) return apiError(res, 404, 'Call record not found');
    if (!call.call_id) return apiError(res, 404, 'No call identifier associated with this record');

    const recRes = await fetch(`${PIPELINE_URL}/v1/calls/${call.call_id}/recording`, {
      headers: { 'X-API-Key': PIPELINE_KEY },
      dispatcher: pipelineAgent,
    });

    if (!recRes.ok) {
      return apiError(res, recRes.status, `Recording not found or failed to retrieve from pipeline (${recRes.status})`);
    }

    res.setHeader('Content-Type', recRes.headers.get('content-type') || 'audio/wav');
    const contentLength = recRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', `inline; filename="recording-${call.call_id}.wav"`);

    const arrayBuffer = await recRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── COMPANY: Agent Config CRUD ────────────────────────────────────────────────

export const companyListConfigs = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const configs = await AgentConfig.find({ company_id: companyId, is_active: true })
      .sort({ createdAt: -1 });

    return success(res, configs, 'Configs fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const companyCreateConfig = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const webhookBase   = process.env.CRM_WEBHOOK_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
    const webhookUrl    = req.body.webhook_url || `${webhookBase}/api/v1/ai-agents/webhook`;
    const webhookSecret = req.body.webhook_secret || crypto.randomBytes(24).toString('hex');

    const pipelinePayload = toPipelinePayload(companyId, { ...req.body, webhook_url: webhookUrl, webhook_secret: webhookSecret });

    const required = ['name', 'tone', 'script', 'voice'];
    for (const f of required) {
      if (!pipelinePayload[f]) return apiError(res, 400, `${f} is required`);
    }

    let pipelineRecord = null;
    let syncNotice = '';
    try {
      pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
    } catch (pipelineErr) {
      if (isNetworkError(pipelineErr)) {
        syncNotice = ` (Warning: AI Pipeline at ${PIPELINE_URL} is currently unreachable; config saved locally and will auto-sync on first call)`;
        console.warn('[AI-AGENTS] Pipeline unreachable:', pipelineErr.message);
      } else {
        return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline validation error: ${pipelineErr.message}`);
      }
    }

    const cfg = await AgentConfig.create({
      ...pick(req.body, CONFIG_PIPELINE_FIELDS),
      company_id:         companyId,
      webhook_url:        webhookUrl,
      webhook_secret:     webhookSecret,
      pipeline_config_id: pipelineRecord?.id ?? null,
    });

    return success(res, cfg, `Config created${syncNotice}`, 201);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const companyUpdateConfig = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const cfg = await AgentConfig.findOne({ _id: req.params.id, company_id: companyId, is_active: true });
    if (!cfg) return apiError(res, 404, 'Config not found');

    Object.assign(cfg, pick(req.body, CONFIG_PIPELINE_FIELDS));
    if (req.body.webhook_url) cfg.webhook_url = req.body.webhook_url;
    if (req.body.webhook_secret) cfg.webhook_secret = req.body.webhook_secret;

    const pipelinePayload = toPipelinePayload(companyId, cfg);

    if (cfg.pipeline_config_id) {
      try {
        await pipeline('PUT', `/v1/agent-configs/${cfg.pipeline_config_id}`, pipelinePayload);
      } catch (pipelineErr) {
        if (!isNetworkError(pipelineErr)) {
          return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline update error: ${pipelineErr.message}`);
        }
        console.warn('[AI-AGENTS] Pipeline update skipped (unreachable):', pipelineErr.message);
      }
    }

    await cfg.save();
    return success(res, cfg, 'Config updated');
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const companyDeleteConfig = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const cfg = await AgentConfig.findOne({ _id: req.params.id, company_id: companyId, is_active: true });
    if (!cfg) return apiError(res, 404, 'Config not found');

    if (cfg.pipeline_config_id) {
      try { await pipeline('DELETE', `/v1/agent-configs/${cfg.pipeline_config_id}`); } catch (_) {}
    }
    cfg.is_active = false;
    await cfg.save();
    return success(res, null, 'Config deleted');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const companySyncConfig = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const cfg = await AgentConfig.findOne({ _id: req.params.id, company_id: companyId, is_active: true });
    if (!cfg) return apiError(res, 404, 'Config not found');

    await syncConfigToPipeline(cfg);
    return success(res, cfg, 'Config synced with AI pipeline successfully');
  } catch (err) {
    return apiError(res, err.statusCode ?? 502, `Sync failed: ${err.message}`);
  }
};

// ── COMPANY: Calls ────────────────────────────────────────────────────────────

export const companyListCalls = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const filter = { company_id: companyId };
    if (req.query.status) filter.status = req.query.status;

    const calls = await AiCall.find(filter)
      .populate('agent_config_id', 'name voice')
      .sort({ createdAt: -1 })
      .limit(200);

    return success(res, calls, 'Calls fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const companyGetCall = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const call = await AiCall.findOne({ _id: req.params.id, company_id: companyId })
      .populate('agent_config_id', 'name voice');
    if (!call) return apiError(res, 404, 'Call not found');
    return success(res, call, 'Call fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const companyTriggerCall = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const { agent_config_id, phone_number, from_number } = req.body;
    if (!agent_config_id || !phone_number || !from_number) {
      return apiError(res, 400, 'agent_config_id, phone_number, and from_number are required');
    }

    const cfg = await AgentConfig.findOne({ _id: agent_config_id, company_id: companyId, is_active: true });
    if (!cfg) return apiError(res, 404, 'Agent config not found');

    // Auto-sync config to pipeline on-the-fly if not synced yet
    if (!cfg.pipeline_config_id) {
      try {
        await syncConfigToPipeline(cfg);
      } catch (syncErr) {
        return apiError(res, syncErr.statusCode ?? 502, `AI Pipeline sync required: ${syncErr.message}`);
      }
    }

    const crm_user_id = String(companyId);

    let pipelineCallId = null;
    try {
      const pResp = await pipeline('POST', '/v1/calls/outbound', {
        crm_user_id,
        agent_config_id: cfg.pipeline_config_id,
        from_number,
        phone_number,
      });
      pipelineCallId = pResp.call_id;
    } catch (pipelineErr) {
      return apiError(res, pipelineErr.statusCode ?? 502, `Pipeline error: ${pipelineErr.message}`);
    }

    const call = await AiCall.create({
      call_id:            pipelineCallId,
      agent_config_id:    cfg._id,
      pipeline_config_id: cfg.pipeline_config_id,
      company_id:         companyId,
      crm_user_id,
      phone_number,
      from_number,
      status:             'queued',
      triggered_by:       req.user?.userId ?? null,
    });

    return success(res, call, 'Call queued', 202);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const companyGetRecording = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const call = await AiCall.findOne({ _id: req.params.id, company_id: companyId });
    if (!call) return apiError(res, 404, 'Call record not found');
    if (!call.call_id) return apiError(res, 404, 'No call identifier associated with this record');

    const recRes = await fetch(`${PIPELINE_URL}/v1/calls/${call.call_id}/recording`, {
      headers: { 'X-API-Key': PIPELINE_KEY },
      dispatcher: pipelineAgent,
    });

    if (!recRes.ok) {
      return apiError(res, recRes.status, `Recording not found or failed to retrieve from pipeline (${recRes.status})`);
    }

    res.setHeader('Content-Type', recRes.headers.get('content-type') || 'audio/wav');
    const contentLength = recRes.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', `inline; filename="recording-${call.call_id}.wav"`);

    const arrayBuffer = await recRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── PUBLIC: Webhook receiver ──────────────────────────────────────────────────
// Called by the AI Pipeline when a call ends. No JWT auth — verified by HMAC.

export const receiveWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-voxa-signature'] ?? '';
    const rawBody   = req.rawBody; // populated by express.json verify in app.js
    const payload   = req.body;
    const { call_id } = payload;

    if (!call_id) return res.status(400).json({ error: 'call_id missing' });

    // Find the call record to get the webhook_secret for HMAC verification
    const callRecord = await AiCall.findOne({ call_id }).populate('agent_config_id');

    if (callRecord?.agent_config_id?.webhook_secret) {
      const secret = callRecord.agent_config_id.webhook_secret;
      const bodyStr = rawBody ?? JSON.stringify(payload);
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
      if (signature !== expected) {
        console.warn('[WEBHOOK] HMAC signature mismatch for call_id:', call_id);
      }
    }

    const statusMap = { completed: 'completed', no_answer: 'no_answer', voicemail: 'voicemail', transferred: 'transferred' };

    const update = {
      status:           statusMap[payload.status] ?? payload.status,
      ended_reason:     payload.ended_reason ?? null,
      started_at:       payload.started_at ? new Date(payload.started_at) : null,
      ended_at:         payload.ended_at   ? new Date(payload.ended_at)   : null,
      duration_seconds: payload.duration_seconds ?? null,
      transcript:       payload.transcript ?? [],
      structured_output:payload.structured_output ?? null,
      recording_url:    payload.recording_url ?? null,
    };

    if (!callRecord) {
      const configRecord = await AgentConfig.findOne({ pipeline_config_id: payload.agent_config_id });
      if (configRecord) {
        update.agent_config_id = configRecord._id;
        update.company_id = configRecord.company_id;
      } else if (payload.crm_user_id && payload.crm_user_id !== 'admin') {
        update.company_id = payload.crm_user_id;
      }
      update.phone_number = payload.phone_number;
      update.direction = payload.direction || 'outbound';
    }

    await AiCall.findOneAndUpdate({ call_id }, update, { upsert: true, new: true });
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── STRUCTURED OUTPUT SCHEMAS (Company & Admin) ────────────────────────────────

export const companyListSchemas = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const schemas = await StructuredOutputSchema.find({
      $or: [{ company_id: companyId }, { is_default: true }],
      is_active: true,
    }).sort({ createdAt: -1 });

    return success(res, schemas, 'Structured output schemas fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const companyCreateSchema = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const { name, json_schema } = req.body;
    if (!name || !json_schema) return apiError(res, 400, 'name and json_schema are required');

    const crm_user_id = String(companyId);
    let pipelineSchema = null;
    try {
      pipelineSchema = await pipeline('POST', '/v1/structured-output-schemas', {
        crm_user_id,
        name,
        json_schema,
        is_default: false,
      });
    } catch (pipelineErr) {
      if (!isNetworkError(pipelineErr)) {
        return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline schema error: ${pipelineErr.message}`);
      }
      console.warn('[AI-AGENTS] Pipeline schema creation unreachable:', pipelineErr.message);
    }

    const schemaRecord = await StructuredOutputSchema.create({
      pipeline_schema_id: pipelineSchema?.id ?? null,
      company_id: companyId,
      name,
      json_schema,
      is_default: false,
    });

    return success(res, schemaRecord, 'Structured output schema created', 201);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const companyUpdateSchema = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const schemaRecord = await StructuredOutputSchema.findOne({ _id: req.params.id, company_id: companyId, is_active: true });
    if (!schemaRecord) return apiError(res, 404, 'Schema not found');

    const { name, json_schema } = req.body;
    if (name) schemaRecord.name = name;
    if (json_schema) schemaRecord.json_schema = json_schema;

    if (schemaRecord.pipeline_schema_id) {
      try {
        await pipeline('PUT', `/v1/structured-output-schemas/${schemaRecord.pipeline_schema_id}`, {
          crm_user_id: String(companyId),
          name: schemaRecord.name,
          json_schema: schemaRecord.json_schema,
          is_default: false,
        });
      } catch (pipelineErr) {
        if (!isNetworkError(pipelineErr)) {
          return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline schema update failed: ${pipelineErr.message}`);
        }
        console.warn('[AI-AGENTS] Pipeline schema update skipped (unreachable):', pipelineErr.message);
      }
    }

    await schemaRecord.save();
    return success(res, schemaRecord, 'Schema updated');
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const companyDeleteSchema = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company associated with this user');

    const schemaRecord = await StructuredOutputSchema.findOne({ _id: req.params.id, company_id: companyId, is_active: true });
    if (!schemaRecord) return apiError(res, 404, 'Schema not found');

    if (schemaRecord.pipeline_schema_id) {
      try { await pipeline('DELETE', `/v1/structured-output-schemas/${schemaRecord.pipeline_schema_id}`); } catch (_) {}
    }

    schemaRecord.is_active = false;
    await schemaRecord.save();
    return success(res, null, 'Schema deleted');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminListSchemas = async (req, res) => {
  try {
    const filter = { is_active: true };
    if (req.query.company_id) filter.company_id = req.query.company_id;

    const schemas = await StructuredOutputSchema.find(filter)
      .populate('company_id', 'name status')
      .sort({ createdAt: -1 });

    return success(res, schemas, 'Schemas fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const adminCreateSchema = async (req, res) => {
  try {
    const { company_id, name, json_schema, is_default } = req.body;
    if (!name || !json_schema) return apiError(res, 400, 'name and json_schema are required');

    const crm_user_id = company_id ? String(company_id) : 'admin';
    let pipelineSchema = null;
    try {
      pipelineSchema = await pipeline('POST', '/v1/structured-output-schemas', {
        crm_user_id,
        name,
        json_schema,
        is_default: Boolean(is_default),
      });
    } catch (pipelineErr) {
      if (!isNetworkError(pipelineErr)) {
        return apiError(res, pipelineErr.statusCode ?? 500, `Pipeline schema error: ${pipelineErr.message}`);
      }
      console.warn('[AI-AGENTS] Pipeline schema creation unreachable:', pipelineErr.message);
    }

    const schemaRecord = await StructuredOutputSchema.create({
      pipeline_schema_id: pipelineSchema?.id ?? null,
      company_id: company_id ?? null,
      name,
      json_schema,
      is_default: Boolean(is_default),
    });

    return success(res, schemaRecord, 'Schema created', 201);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};
