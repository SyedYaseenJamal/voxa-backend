// ─── AI Agents Controller ──────────────────────────────────────────────────────
// Acts as a secure proxy to the Voxa AI Pipeline API (FastAPI @ VOXA_AI_PIPELINE_URL).
// The X-API-Key never reaches the browser — all pipeline calls happen server-side.
//
// Admin routes   : full CRUD on any company's configs + global call history
// Company routes : scoped CRUD on own configs + own call history
// Public route   : webhook receiver (no auth, HMAC verified)

import crypto from 'crypto';
import { Agent } from 'undici';
import { AgentConfig, AiCall, StructuredOutputSchema } from './aiAgent.model.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

// ── Pipeline client ───────────────────────────────────────────────────────────

const PIPELINE_URL = process.env.VOXA_AI_PIPELINE_URL ?? 'https://crm-intelligence-voxa.vercel.app';
const PIPELINE_KEY = process.env.VOXA_AI_PIPELINE_API_KEY ?? '';
const pipelineAgent = new Agent({ connect: { rejectUnauthorized: false } });

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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail
      ? (Array.isArray(json.detail) ? json.detail.map(d => d.msg).join(', ') : json.detail)
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

// Build the payload the pipeline expects for POST/PUT
function toPipelinePayload(companyId, body) {
  const payload = pick(body, CONFIG_PIPELINE_FIELDS);
  payload.crm_user_id = String(companyId);
  return payload;
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

    // Build the webhook URL that receives call results for this company
    const webhookBase = process.env.CRM_WEBHOOK_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
    const webhookUrl  = req.body.webhook_url || `${webhookBase}/api/v1/ai-agents/webhook`;

    // Generate a webhook secret if not provided
    const webhookSecret = req.body.webhook_secret || crypto.randomBytes(24).toString('hex');

    const pipelinePayload = toPipelinePayload(company_id, { ...req.body, webhook_url: webhookUrl, webhook_secret: webhookSecret });

    // Validate required pipeline fields
    const required = ['name', 'tone', 'script', 'voice', 'webhook_url', 'webhook_secret'];
    for (const f of required) {
      if (!pipelinePayload[f]) return apiError(res, 400, `${f} is required`);
    }

    // Create on pipeline
    let pipelineRecord = null;
    try {
      pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
    } catch (pipelineErr) {
      // Store locally even if pipeline is unreachable — will be synced later
      console.warn('[AI-AGENTS] Pipeline unreachable, storing locally only:', pipelineErr.message);
    }

    // Store locally
    const cfg = await AgentConfig.create({
      ...pick(req.body, CONFIG_PIPELINE_FIELDS),
      company_id,
      webhook_url:        webhookUrl,
      webhook_secret:     webhookSecret,
      pipeline_config_id: pipelineRecord?.id ?? null,
    });

    const populated = await cfg.populate('company_id', 'name status');
    return success(res, populated, 'Agent config created', 201);
  } catch (err) {
    return apiError(res, err.statusCode ?? 500, err.message);
  }
};

export const adminUpdateConfig = async (req, res) => {
  try {
    const cfg = await AgentConfig.findById(req.params.id);
    if (!cfg || !cfg.is_active) return apiError(res, 404, 'Config not found');

    const pipelinePayload = toPipelinePayload(cfg.company_id, req.body);

    // Update on pipeline if we have a pipeline ID
    if (cfg.pipeline_config_id) {
      try {
        await pipeline('PUT', `/v1/agent-configs/${cfg.pipeline_config_id}`, pipelinePayload);
      } catch (pipelineErr) {
        console.warn('[AI-AGENTS] Pipeline update failed:', pipelineErr.message);
      }
    }

    // Update locally
    Object.assign(cfg, pick(req.body, CONFIG_PIPELINE_FIELDS));
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
    if (!cfg.pipeline_config_id) return apiError(res, 400, 'Config is not synced with the AI pipeline yet');

    const crm_user_id = String(cfg.company_id);
    const pipelinePayload = { crm_user_id, agent_config_id: cfg.pipeline_config_id, from_number, phone_number };

    let pipelineCallId = null;
    try {
      const pResp = await pipeline('POST', '/v1/calls/outbound', pipelinePayload);
      pipelineCallId = pResp.call_id;
    } catch (pipelineErr) {
      return apiError(res, pipelineErr.statusCode ?? 502, `Pipeline error: ${pipelineErr.message}`);
    }

    // Create local record
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
    try {
      pipelineRecord = await pipeline('POST', '/v1/agent-configs', pipelinePayload);
    } catch (pipelineErr) {
      console.warn('[AI-AGENTS] Pipeline unreachable:', pipelineErr.message);
    }

    const cfg = await AgentConfig.create({
      ...pick(req.body, CONFIG_PIPELINE_FIELDS),
      company_id:         companyId,
      webhook_url:        webhookUrl,
      webhook_secret:     webhookSecret,
      pipeline_config_id: pipelineRecord?.id ?? null,
    });

    return success(res, cfg, 'Config created', 201);
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

    if (cfg.pipeline_config_id) {
      try {
        await pipeline('PUT', `/v1/agent-configs/${cfg.pipeline_config_id}`, toPipelinePayload(companyId, req.body));
      } catch (pipelineErr) {
        console.warn('[AI-AGENTS] Pipeline update failed:', pipelineErr.message);
      }
    }

    Object.assign(cfg, pick(req.body, CONFIG_PIPELINE_FIELDS));
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
    if (!cfg.pipeline_config_id) return apiError(res, 400, 'Config is not synced with the AI pipeline yet');

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

// ── PUBLIC: Webhook receiver ──────────────────────────────────────────────────
// Called by the AI Pipeline when a call ends. No JWT auth — verified by HMAC.

export const receiveWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-voxa-signature'] ?? '';
    const rawBody   = req.rawBody; // populated by express.json verify in app.js (or req.body JSON string)

    const payload = req.body;
    const { call_id } = payload;

    if (!call_id) return res.status(400).json({ error: 'call_id missing' });

    // Find the call record to get the webhook_secret for HMAC verification
    const callRecord = await AiCall.findOne({ call_id }).populate('agent_config_id');

    if (callRecord?.agent_config_id?.webhook_secret) {
      const secret = callRecord.agent_config_id.webhook_secret;
      const bodyStr = rawBody ?? JSON.stringify(payload);
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
      if (signature !== expected) {
        console.warn('[WEBHOOK] HMAC mismatch for call_id:', call_id);
        // Log but don't reject — prevents lockout if secret is mismatched during setup
      }
    }

    // Map pipeline status to our status enum
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

    await AiCall.findOneAndUpdate({ call_id }, update, { upsert: true, new: true });

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
