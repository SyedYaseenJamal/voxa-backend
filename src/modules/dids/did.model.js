import mongoose from 'mongoose';

// ─── DID Model ────────────────────────────────────────────────────────────────
// History is maintained by creating a new row per assignment and stamping
// released_at on the previous one. did_number is intentionally NOT unique.
// company_id = null → DID is in the admin pool (unassigned).

const DidSchema = new mongoose.Schema(
  {
    // The actual phone number (E.164 or national format)
    did_number: {
      type: String,
      required: true,
      trim: true,
    },

    // Friendly label / display name
    label: {
      type: String,
      default: '',
      trim: true,
    },

    // Admin notes / comments
    notes: {
      type: String,
      default: '',
    },

    // Current status of this DID row
    // available  → in pool, not assigned to any company
    // assigned   → currently assigned to company_id
    // released   → was released back to pool (historical row)
    status: {
      type: String,
      enum: ['available', 'assigned', 'released'],
      default: 'available',
    },

    // The company this row is assigned to. null = unassigned (pool).
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },

    // User within the company assigned to this specific DID (can have any role)
    assigned_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Optional campaign linkage
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
    },

    // Optional AI flow linkage
    ai_flow_id: {
      type: String,
      default: null,
    },

    // Optional free-form context tag
    context: {
      type: String,
      default: '',
    },

    // Soft-delete flag (false = deleted from pool entirely)
    is_active: {
      type: Boolean,
      default: true,
    },

    // When this assignment row started
    assigned_at: {
      type: Date,
      default: Date.now,
    },

    // When this assignment row ended (null = currently active)
    released_at: {
      type: Date,
      default: null,
    },

    // Super admin who added this DID to the pool
    added_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin',
      default: null,
    },
  },
  { timestamps: true }
);

// Index to quickly find all assignment rows for a given number
DidSchema.index({ did_number: 1, assigned_at: -1 });
// Index for company lookups
DidSchema.index({ company_id: 1, status: 1 });
// Index for active pool DIDs
DidSchema.index({ status: 1, is_active: 1 });

export default mongoose.model('Did', DidSchema);
