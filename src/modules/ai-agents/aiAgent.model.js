import mongoose from 'mongoose';

// ─── AgentConfig ──────────────────────────────────────────────────────────────
// Mirrors an agent-config record on the AI Pipeline service.
// We store a copy here so we can display it without hitting the pipeline on every page load.

const transferDestSchema = new mongoose.Schema({
  name:        { type: String },
  phone_number:{ type: String },
}, { _id: false });

const agentConfigSchema = new mongoose.Schema({
  // Link to the AI Pipeline record
  pipeline_config_id: { type: String, default: null }, // UUID returned by POST /v1/agent-configs

  // Which company owns this config
  company_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // Core fields (mirrors the AI pipeline schema)
  name:        { type: String, required: true },
  language:    { type: String, default: 'ur-en-auto' },
  tone:        { type: String, required: true },
  script:      { type: String, required: true },
  voice:       { type: String, required: true, default: 'Puck' },

  // Structured output
  structured_output_schema_id: { type: String, default: null },

  // Webhook
  webhook_url:    { type: String, required: true },
  webhook_secret: { type: String, required: true },

  // Feature flags
  hangup_enabled:               { type: Boolean, default: true  },
  dtmf_enabled:                 { type: Boolean, default: false },
  voicemail_detection_enabled:  { type: Boolean, default: false },
  voicemail_message:            { type: String,  default: null  },
  speak_first:                  { type: String,  enum: ['agent', 'caller'], default: 'agent' },
  greeting_message:             { type: String,  default: null  },
  goodbye_message:              { type: String,  default: null  },
  goodbye_message_verbatim:     { type: Boolean, default: false },
  idle_timeout_seconds:         { type: Number,  default: 10.0 },
  idle_max_reprompts:           { type: Number,  default: 2    },
  call_recording_enabled:       { type: Boolean, default: false },
  noise_cancellation_enabled:   { type: Boolean, default: false },
  transfer_enabled:             { type: Boolean, default: false },
  transfer_destinations:        { type: [transferDestSchema], default: [] },

  is_active: { type: Boolean, default: true },
}, { timestamps: true });

export const AgentConfig = mongoose.model('AgentConfig', agentConfigSchema);

// ─── AiCall ───────────────────────────────────────────────────────────────────
// Stores triggered outbound call records. Populated initially with queued status,
// then updated by the webhook receiver when the call ends.

const transcriptTurnSchema = new mongoose.Schema({
  role: { type: String, enum: ['agent', 'caller'] },
  text: { type: String },
  ts:   { type: String },
}, { _id: false });

const aiCallSchema = new mongoose.Schema({
  // AI Pipeline identifiers
  call_id:         { type: String, unique: true, sparse: true }, // UUID from pipeline
  agent_config_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentConfig' },
  pipeline_config_id: { type: String }, // pipeline-side UUID

  // Which company/tenant
  company_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  crm_user_id:  { type: String }, // echoed from pipeline

  // Call details
  phone_number:  { type: String },
  from_number:   { type: String },
  direction:     { type: String, default: 'outbound' },

  // Status lifecycle
  status: {
    type: String,
    enum: ['queued', 'ringing', 'completed', 'no_answer', 'voicemail', 'transferred', 'failed'],
    default: 'queued',
  },
  ended_reason: { type: String, default: null },

  // Timing
  started_at:       { type: Date, default: null },
  ended_at:         { type: Date, default: null },
  duration_seconds: { type: Number, default: null },

  // Result (populated by webhook)
  transcript:        { type: [transcriptTurnSchema], default: [] },
  structured_output: { type: mongoose.Schema.Types.Mixed, default: null },
  recording_url:     { type: String, default: null },

  // Who triggered
  triggered_by: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
}, { timestamps: true });

export const AiCall = mongoose.model('AiCall', aiCallSchema);

// ─── StructuredOutputSchema ───────────────────────────────────────────────────

const structuredOutputSchemaSchema = new mongoose.Schema({
  pipeline_schema_id: { type: String, default: null },
  company_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  name:        { type: String, required: true },
  json_schema: { type: mongoose.Schema.Types.Mixed, required: true },
  is_default:  { type: Boolean, default: false },
  is_active:   { type: Boolean, default: true  },
}, { timestamps: true });

export const StructuredOutputSchema = mongoose.model('StructuredOutputSchema', structuredOutputSchemaSchema);
