Voxa Platform — DB Schema v6

// Voxa Platform — DB Schema v6
// Paste at https://dbdiagram.io/d

// ─── ACCESS CONTROL ──────────────────────────────────────────

Table roles {
  _id         varchar [pk, note: 'ObjectId']
  name        varchar [not null]
  permissions varchar [note: 'JSON array']
  description varchar
  status      varchar [default: 'active', note: 'active | inactive']
  created_by  varchar [note: 'super_admins._id']
  created_at  timestamp [not null]
  updated_at  timestamp
  deleted_at  timestamp [note: 'null = not deleted. Soft delete.']
}

// ─── PERMISSIONS ─────────────────────────────────────────────
// Granular permission registry. Roles hold a JSON array of permission IDs.
// module = which area of the product (users, reports, billing, calls, agents)
// action = what operation (create, read, update, delete, export)
// is_system = true means this permission cannot be deleted

Table permissions {
  _id         varchar [pk, note: 'ObjectId']
  name        varchar [not null, unique, note: 'e.g. users:create, billing:export']
  module      varchar [not null, note: 'users | reports | billing | calls | agents | campaigns']
  action      varchar [not null, note: 'create | read | update | delete | export']
  description varchar
  is_system   boolean [default: false, note: 'true = cannot be deleted']
  created_at  timestamp [not null]
}

Table super_admins {
  _id                 varchar [pk, note: 'ObjectId']
  email               varchar [not null, unique]
  full_name           varchar [not null]
  role_id             varchar
  is_active           boolean   [default: true]
  last_login_at       timestamp
  two_fa_enabled      boolean   [default: false]
  password_hash       varchar   [not null]
  password_expires_at timestamp
}

Table company_users {
  _id        varchar [pk, note: 'ObjectId']
  company_id varchar [not null]
  role_id    varchar
  email      varchar [not null]
  full_name  varchar [not null]
  created_by varchar [note: 'company_users._id']
  username      varchar [unique, note: 'Login username']
  password_hash varchar [not null]
  phone_number  varchar
  status        varchar [default: 'active', note: 'active | suspended | inactive']
  created_at    timestamp [not null]
  updated_at    timestamp
  last_login_at timestamp
}

// ─── PLANS ───────────────────────────────────────────────────
// Plan templates. Can be reused or created as one-off custom plans.
// tokens = hard cap on consumption for this plan.
// alert_threshold_pct = when to fire the usage warning (default 80%).
// Prepaid: charged flat at purchase regardless of actual usage.
// Postpaid: plan defines the cap/tier — billing comes from usage_records.

Table plans {
  _id                  varchar [pk, note: 'ObjectId']
  name                 varchar [not null]
  cost                 float   [not null, note: 'Flat charge for prepaid. Tier price for postpaid.']
  duration_type        varchar [not null, note: 'monthly | pay-as-you-go']
  tokens               int     [not null, note: 'Hard cap — max tokens allowed under this plan']
  ai_receptionist      boolean [default: false]
  bulk_ai_calling      boolean [default: false]
  max_agents           int
  max_concurrent_calls int
  is_custom            boolean [default: false, note: 'true = built for a specific company']
  created_by           varchar
  is_active            boolean [default: true, note: 'false = retired plan, not assignable']
  created_at           timestamp [not null]
}

// ─── FEATURE COSTS ───────────────────────────────────────────
// Universal rate card. One row per billable feature.
// This is what gets charged per unit when:
//   - Postpaid: billing is calculated from actual usage (usage_records)
//   - Prepaid overage: plan ran out, customer approved more usage
// Never deleted — set is_active=false to retire.
//
// Example rows:
//   bulk_ai_calling     | $0.05 | per_minute
//   summarization       | $0.02 | per_token
//   ai_receptionist     | $0.08 | per_minute
//   concurrent_channels | $0.10 | per_channel
//   recording           | $0.01 | per_minute

Table feature_costs {
  _id            varchar [pk, note: 'ObjectId']
  feature_key    varchar [not null, unique, note: 'ai_receptionist | bulk_ai_calling | summarization | concurrent_call_channels | recording']
  feature_label  varchar [not null]
  base_unit_cost float   [not null, note: 'Cost per billing_unit']
  billing_unit   varchar [not null, note: 'per_minute | per_token | per_channel | per_record']
  is_active      boolean   [default: true]
  effective_from timestamp [not null]
  updated_at     timestamp
}

// ─── COMPANIES ───────────────────────────────────────────────

Table companies {
  _id                     varchar [pk, note: 'ObjectId']
  name                    varchar [not null]
  status                  varchar [not null, note: 'active | suspended | pending']
  billing_model           varchar [not null, note: 'prepaid | postpaid']
  created_by              varchar
  ai_receptionist_enabled boolean [default: false]
  bulk_ai_calling_enabled boolean [default: false]
  max_concurrent_calls    int
  stripe_customer_id      varchar
  force_halt              boolean [default: false, note: 'Hard block — no service regardless of plan']
  created_at              timestamp [not null]
}

// ─── TENANT INFO ─────────────────────────────────────────────
// Soft history — never deleted or overwritten.
// Contact changes: set is_active=false + effective_to on old row,
// insert new row for new contact. Full history always preserved.

Table tenant_info {
  _id            varchar [pk, note: 'ObjectId']
  company_id     varchar [not null]
  tenant_id      varchar [not null]
  region         varchar
  province       varchar [note: 'Used for tax calculation']
  address        varchar
  contact_name   varchar [not null]
  contact_email  varchar [not null]
  is_active      boolean   [default: true, note: 'Only one row per company is true at a time']
  effective_from timestamp [not null]
  effective_to   timestamp [note: 'null = currently active']
}

// ─── PREPAID BILLING ─────────────────────────────────────────
// One row per plan purchase — independent buckets, never merged.
// Charged FLAT at purchase_at regardless of how much is consumed.
// Example: company buys Plan A (3000 tokens, $99) → charged $99 upfront.
//          Uses 1800, runs out early, buys Plan B (1500 tokens, $49) → charged $49 upfront.
//          Two rows. Two separate charges. Usage tracked separately in usage_records.
// billing_lock = true when tokens exhausted → triggers "buy next plan?" prompt.
// Nothing is deleted — exhausted rows stay as purchase history.

Table prepaid_billing {
  _id              varchar [pk, note: 'ObjectId']
  company_id       varchar [not null]
  plan_id          varchar [not null, note: 'Plan template purchased']
  amount_charged   float   [not null, note: 'Flat amount charged at purchase — does not change']
  tokens_cap       int     [not null, note: 'Snapshot of plan.tokens at purchase time']
  billing_lock     boolean [default: false, note: 'true = cap hit; prompt to buy next plan']
  status           varchar [not null, note: 'active | exhausted | expired | cancelled']
  purchased_at     timestamp [not null, note: 'When charged']
  period_start     timestamp [not null]
  period_end       timestamp [not null, note: 'Tokens expire here even if unused']
}

// ─── POSTPAID BILLING ────────────────────────────────────────
// One row per billing period per company.
// Company is assigned a plan — plan gives them a token cap for the period.
// Billing at period end is calculated from usage_records (actual usage).
// Two phases:
//   WITHIN CAP  → usage billed at plan rate (plan.cost covers it)
//   BEYOND CAP  → overage_active flips true, usage billed at
//                 feature_costs.base_unit_cost per unit (standard rates)
// allow_overage = false → hard stop at cap, no standard rate charges.

Table postpaid_billing {
  _id                 varchar [pk, note: 'ObjectId']
  company_id          varchar [not null]
  plan_id             varchar [not null, note: 'Defines cap and allowed features for this period']
  tokens_cap          int     [not null, note: 'Snapshot of plan.tokens — ceiling before standard rates kick in']
  tokens_used         int     [default: 0, note: 'Running total — when this hits tokens_cap, overage_active flips']
  overuse_active      boolean [default: false, note: 'true = cap hit, now billing at feature_costs base rates']
  overage_amount_due  float   [default: 0, note: 'Accrues from usage_records once overage_active=true']
  status              varchar [not null, note: 'active | overage | closed']
  period_start        timestamp [not null]
  period_end          timestamp [not null]
  created_at          timestamp [not null]
}

// ─── USAGE RECORDS ───────────────────────────────────────────
// Every feature consumption event written at runtime.
// This is the billing source of truth for postpaid.
// For prepaid: drives the token deduction + billing_lock trigger.
// billing_ref_id = which billing period row this usage belongs to
//   (prepaid_billing._id or postpaid_billing._id based on billing_model).
// ref_id = the actual resource that caused the usage (call, campaign, etc.)
// Nothing is deleted — permanent audit trail.

Table usage_records {
  _id             varchar [pk, note: 'ObjectId']
  company_id      varchar [not null]
  feature_key     varchar [not null, note: 'FK to feature_costs.feature_key']
  units_consumed  float   [not null, note: 'Minutes / tokens / channels — matches feature_costs.billing_unit']
  cost_at_time    float   [not null, note: 'Snapshot of feature_costs.base_unit_cost when recorded']
  billing_model   varchar [not null, note: 'prepaid | postpaid']
  billing_ref_id  varchar [not null, note: 'prepaid_billing._id OR postpaid_billing._id']
  ref_id          varchar [note: 'Polymorphic — call_id / campaign_id / recording_id']
  ref_type        varchar [note: 'call | campaign | recording | summarization']
  recorded_at     timestamp [not null]
}

// ─── AGENTS ──────────────────────────────────────────────────

// ─── AGENT SESSIONS ──────────────────────────────────────────
// Immutable log of every online/offline status change per agent.
// Use this to calculate total hours worked per shift or per day.
// Never deleted — permanent audit trail.
// To get hours worked: SUM(went_offline_at - went_online_at) WHERE agent_id = X

Table agent_sessions {
  _id            varchar   [pk, note: 'ObjectId']
  company_id     varchar   [not null]
  agent_id       varchar   [not null]
  went_online_at timestamp [not null]
  went_offline_at timestamp [note: 'null = currently online']
  duration_seconds int     [note: 'Computed and stored at session close']
  session_type   varchar   [note: 'shift | break | away — optional granularity']
}

Table agents {
  _id                varchar [pk, note: 'ObjectId']
  company_id         varchar [not null]
  agent_id           varchar [not null, unique]
  sip_extension      varchar
  email              varchar
  operational_status varchar [note: 'online | offline | busy']
  working_hours      varchar [note: 'JSON — e.g. {mon: "09:00-17:00", fri: "09:00-14:00"}']
  timezone           varchar [note: 'e.g. Asia/Karachi — for working_hours interpretation']
  created_by         varchar
}

// ─── DIDs ────────────────────────────────────────────────────
// did_number NOT unique — numbers can be blacklisted and reassigned.
// All rows kept. released_at = null means currently active.

Table dids {
  _id         varchar [pk, note: 'ObjectId']
  company_id  varchar [not null]
  did_number  varchar [not null, note: 'Not unique — full history maintained']
  campaign_id varchar
  ai_flow_id  varchar
  context     varchar
  is_active   boolean   [default: true]
  assigned_at timestamp [not null]
  released_at timestamp [note: 'null = still active']
}

// ─── LEADS ───────────────────────────────────────────────────

Table leads {
  _id           varchar [pk, note: 'ObjectId']
  company_id    varchar [not null]
  lead_list_id  varchar [not null]
  phone_e164    varchar [not null, note: 'Customer phone in E164 format (+923001234567). Always extracted. This is what gets dialled.']
  source_payload   varchar [note: 'JSON — raw payload from source as-is. Meta sends first_name/city/ad_id. CSV sends whatever columns. All dumped here.']
  global_status varchar [not null, note: 'new | active | converted | dnc — lifecycle across ALL campaigns']
  dnc_at        timestamp [note: 'Set when global_status = dnc. Legal compliance audit trail.']
  last_call_id  varchar [note: 'Shortcut → calls._id. Most recent call across any campaign.']
  preferred_call_time varchar [note: 'e.g. morning | afternoon | evening — customer preference']
  created_at    timestamp [not null]
}

// ─── CAMPAIGNS ───────────────────────────────────────────────

Table campaigns {
  _id               varchar [pk, note: 'ObjectId']
  company_id        varchar [not null]
  name              varchar [not null]
  type              varchar [not null, note: 'inbound | outbound']
  calling_mode      varchar [not null, note: 'ai_bulk | ai_receptionist | human_agent | blended']
  status            varchar [not null, note: 'draft | active | paused | completed']
  did_id            varchar
  ai_flow_id        varchar [not null]
  agent_config      varchar [note: 'JSON — LLM prompt, voice, personality. Per-campaign. Overrides company default.']
  output_config     varchar [note: 'JSON — structured output schema. Per-campaign.']
  max_attempts      int     [default: 3]
  retry_delay_hours int     [default: 24]
  schedule_config   varchar [note: 'JSON — calling hours, timezone, days of week']
  created_by        varchar
  created_at        timestamp [not null]
}

// ─── CALLS ───────────────────────────────────────────────────

Table calls {
  _id                       varchar [pk, note: 'ObjectId']
  call_id                   varchar [not null, unique, note: 'External telephony call ID']
  company_id                varchar [not null]
  lead_id                   varchar
  agent_id                  varchar
  did_id                    varchar
  campaign_id               varchar
  call_direction            varchar [not null, note: 'inbound | outbound']
  call_type                 varchar [note: 'ai | human | blended']
  call_status               varchar [not null, note: 'initiated | in_progress | completed | failed | no_answer']
  call_started_at           timestamp
  call_ended_at             timestamp
  duration_seconds          int
  agent_escalation_required boolean [default: false]
  operational_state         varchar
  end_of_report             varchar [note: 'Summary/outcome appended at call close']
  resource_utilization      varchar [note: 'JSON — per-feature breakdown for this call']
  transfer_count  int [default: 0, note: 'How many times call was transferred between agents']
}

// ─── CALLBACKS ───────────────────────────────────────────────

Table callbacks {
  _id              varchar [pk, note: 'ObjectId']
  company_id       varchar [not null]
  lead_id          varchar
  agent_id         varchar
  campaign_id      varchar
  original_call_id varchar
  status           varchar [not null, note: 'pending | completed | cancelled']
  scheduled_at     timestamp
  requested_at     timestamp [not null]
}

// ─── RECORDINGS ──────────────────────────────────────────────

Table recordings {
  _id              varchar [pk, note: 'ObjectId']
  company_id       varchar [not null]
  call_id          varchar [not null]
  agent_id         varchar
  file_url         varchar [not null]
  duration_seconds int
  retention_days   int       [not null, note: '30 | 60 — deleted under low storage']
  recorded_at      timestamp [not null]
  expires_at       timestamp [not null]
}

//----------  Lead Campaigns -----------------------------------

Table lead_campaigns {
  _id               varchar [pk, note: 'ObjectId']
  lead_id           varchar [not null]
  campaign_id       varchar [not null]
  assigned_agent_id varchar [note: 'null for pure AI campaigns']
  status            varchar [not null, note: 'queued | calling | contacted | converted | failed | dnc']
  attempts          int     [default: 0]
  last_attempted_at timestamp
  next_attempt_at   timestamp [note: 'Scheduler: WHERE status=queued AND next_attempt_at <= NOW()']
  last_call_id      varchar [note: '→ calls._id — most recent call within THIS campaign for this lead']
  outcome_notes     varchar
  added_at          timestamp [not null]
}

//-------------------- Lead Lists--------------------------

Table lead_lists {
  _id           varchar [pk, note: 'ObjectId']
  company_id    varchar [not null]
  name          varchar [not null, note: 'Meta Summer July 2026 / CSV Upload 29 Jul etc']
  source        varchar [not null, note: 'meta | shopify | instagram | tiktok | csv | manual | api']
  source_ref_id varchar [note: 'Meta form ID / Shopify webhook ID / uploaded filename']
  integration_id varchar [note: 'platform_integrations._id — null for csv/manual']
  total_leads   int     [note: 'Denormalised count for quick display']
  created_by    varchar [note: 'company_users._id — null if system/webhook created it']
  created_at    timestamp [not null]
}

// ─── INVOICES ────────────────────────────────────────────────

Table invoices {
  _id               varchar [pk, note: 'ObjectId']
  company_id        varchar [not null]
  stripe_invoice_id varchar [not null, unique]
  amount_due        float   [not null]
  status            varchar [not null, note: 'draft | open | paid | void | uncollectible']
  period_start      timestamp
  period_end        timestamp
}

// ─── AUDIT LOGS ──────────────────────────────────────────────

Table audit_logs {
  _id            varchar [pk, note: 'ObjectId']
  company_id     varchar
  actor_type     varchar [not null, note: 'super_admin | company_user | system']
  actor_id       varchar [not null]
  action         varchar [not null]
  resource_type  varchar [not null]
  resource_id    varchar
  actor_location varchar
  ip_address     varchar
  created_at     timestamp [not null]
}

// ─── PLATFORM INTEGRATIONS ───────────────────────────────────
// One row per company per platform. Stores OAuth tokens and webhook config
// for each connected lead source (Meta, WhatsApp, Shopify, TikTok etc.)
// status = active | disconnected | error
Table platform_integrations {
  _id                 varchar   [pk, note: 'ObjectId']
  company_id          varchar   [not null]
  platform_type       varchar   [not null, note: 'meta | whatsapp | shopify | instagram | tiktok | api']
  access_token        varchar   [note: 'OAuth token. Encrypted at rest.']
  refresh_token       varchar   [note: 'For platforms that issue refresh tokens']
  webhook_url         varchar   [note: 'Endpoint registered with platform']
  status              varchar   [not null, default: 'active', note: 'active | disconnected | error']
  leads_received_count int      [default: 0]
  last_sync_at        timestamp
  connected_at        timestamp [not null]
  connected_by        varchar   [note: 'company_users._id']
}

// ─── REFS ────────────────────────────────────────────────────

Ref: super_admins.role_id                 > roles._id
Ref: company_users.company_id             > companies._id
Ref: company_users.role_id                > roles._id
Ref: plans.created_by                     > super_admins._id
Ref: companies.created_by                 > super_admins._id
Ref: tenant_info.company_id               > companies._id
Ref: prepaid_billing.company_id           > companies._id
Ref: prepaid_billing.plan_id              > plans._id
Ref: postpaid_billing.company_id          > companies._id
Ref: postpaid_billing.plan_id             > plans._id
Ref: usage_records.company_id             > companies._id
Ref: agents.company_id                    > companies._id
Ref: agents.created_by                    > company_users._id
Ref: dids.company_id                      > companies._id
Ref: dids.campaign_id                     > campaigns._id
Ref: lead_lists.company_id                > companies._id
Ref: lead_lists.created_by                > company_users._id
Ref: leads.company_id                     > companies._id
Ref: leads.lead_list_id                   > lead_lists._id
Ref: leads.last_call_id                   > calls._id
Ref: campaigns.company_id                 > companies._id
Ref: campaigns.did_id                     > dids._id
Ref: campaigns.created_by                 > company_users._id
Ref: lead_campaigns.lead_id               > leads._id
Ref: lead_campaigns.campaign_id           > campaigns._id
Ref: lead_campaigns.assigned_agent_id     > agents._id
Ref: lead_campaigns.last_call_id          > calls._id
Ref: calls.company_id                     > companies._id
Ref: calls.lead_id                        > leads._id
Ref: calls.agent_id                       > agents._id
Ref: calls.did_id                         > dids._id
Ref: calls.campaign_id                    > campaigns._id
Ref: callbacks.company_id                 > companies._id
Ref: callbacks.lead_id                    > leads._id
Ref: callbacks.agent_id                   > agents._id
Ref: callbacks.campaign_id                > campaigns._id
Ref: callbacks.original_call_id           > calls._id
Ref: recordings.company_id                > companies._id
Ref: recordings.call_id                   > calls._id
Ref: recordings.agent_id                  > agents._id
Ref: invoices.company_id                  > companies._id
Ref: audit_logs.company_id                > companies._id
Ref: roles.created_by > super_admins._id
Ref: lead_lists.integration_id > platform_integrations._id