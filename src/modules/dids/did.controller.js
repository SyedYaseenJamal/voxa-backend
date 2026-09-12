// ─── DID Controller ───────────────────────────────────────────────────────────
// Admin endpoints : full CRUD + assign/release
// Company endpoint: read-only view of their assigned DIDs

import Did from './did.model.js';
import User from '../auth/auth.model.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const toId = (v) => String(v ?? '').trim();

// ── Admin: Add a new DID to the pool ─────────────────────────────────────────
// POST /api/v1/dids
export const createDid = async (req, res) => {
  try {
    const { did_number, label, notes, context } = req.body;
    if (!did_number || !String(did_number).trim()) {
      return apiError(res, 400, 'did_number is required');
    }

    const did = await Did.create({
      did_number: String(did_number).trim(),
      label:      String(label   ?? '').trim(),
      notes:      String(notes   ?? '').trim(),
      context:    String(context ?? '').trim(),
      status:     'available',
      company_id: null,
      added_by:   req.user?.userId ?? null,
      assigned_at: new Date(),
    });

    return success(res, did, 'DID added to pool', 201);
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: List all DIDs in the pool ──────────────────────────────────────────
// GET /api/v1/dids
// Returns only the *current* row per DID number (released_at = null and is_active = true),
// plus unassigned pool entries.
export const listDids = async (req, res) => {
  try {
    const dids = await Did.find({ is_active: true, released_at: null })
      .populate('company_id', 'name status')
      .populate({
        path: 'assigned_user_id',
        select: 'fullName email roleId',
        populate: { path: 'roleId', select: 'name' }
      })
      .sort({ createdAt: -1 });

    return success(res, dids, 'DIDs fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Get a single DID by _id ────────────────────────────────────────────
// GET /api/v1/dids/:id
export const getDid = async (req, res) => {
  try {
    const did = await Did.findById(req.params.id).populate('company_id', 'name status');
    if (!did) return apiError(res, 404, 'DID not found');
    return success(res, did, 'DID fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Full assignment history for a DID number ───────────────────────────
// GET /api/v1/dids/:id/history
// Uses the did_number from the referenced document to find all rows.
export const getDidHistory = async (req, res) => {
  try {
    const ref = await Did.findById(req.params.id);
    if (!ref) return apiError(res, 404, 'DID not found');

    const history = await Did.find({ did_number: ref.did_number })
      .populate('company_id', 'name status')
      .sort({ assigned_at: -1 });

    return success(res, history, 'DID history fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Update DID metadata ────────────────────────────────────────────────
// PATCH /api/v1/dids/:id
export const updateDid = async (req, res) => {
  try {
    const allowed = ['label', 'notes', 'context', 'campaign_id', 'ai_flow_id'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    const did = await Did.findByIdAndUpdate(req.params.id, patch, { new: true }).populate('company_id', 'name status');
    if (!did) return apiError(res, 404, 'DID not found');
    return success(res, did, 'DID updated');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Soft-delete a DID ─────────────────────────────────────────────────
// DELETE /api/v1/dids/:id
export const deleteDid = async (req, res) => {
  try {
    const did = await Did.findByIdAndUpdate(req.params.id, { is_active: false }, { new: true });
    if (!did) return apiError(res, 404, 'DID not found');
    return success(res, null, 'DID deleted');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Assign a DID to a company ─────────────────────────────────────────
// POST /api/v1/dids/:id/assign  { company_id }
// Steps:
//   1. Stamp released_at on the current row (if it was assigned to another company)
//   2. Create a NEW row for the new assignment (preserving history)
export const assignDid = async (req, res) => {
  try {
    const { company_id } = req.body;
    if (!company_id) return apiError(res, 400, 'company_id is required');

    const current = await Did.findById(req.params.id);
    if (!current || !current.is_active) return apiError(res, 404, 'DID not found');
    if (current.released_at) return apiError(res, 400, 'Cannot assign a released DID row — use the active row');

    // If already assigned to the same company, no-op
    if (current.company_id && toId(current.company_id) === toId(company_id)) {
      return apiError(res, 400, 'DID is already assigned to this company');
    }

    const now = new Date();

    // 1. Release the current row
    current.released_at = now;
    current.status      = current.company_id ? 'released' : 'released';
    await current.save();

    // 2. Create a new assignment row
    const newRow = await Did.create({
      did_number:   current.did_number,
      label:        current.label,
      notes:        current.notes,
      context:      current.context,
      campaign_id:  current.campaign_id,
      ai_flow_id:   current.ai_flow_id,
      status:       'assigned',
      company_id,
      added_by:     current.added_by,
      assigned_at:  now,
      released_at:  null,
      is_active:    true,
    });

    const populated = await newRow.populate('company_id', 'name status');
    return success(res, populated, 'DID assigned to company');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Admin: Release a DID from its company ────────────────────────────────────
// POST /api/v1/dids/:id/release
// Stamps released_at and creates a new "available" pool row.
export const releaseDid = async (req, res) => {
  try {
    const current = await Did.findById(req.params.id);
    if (!current || !current.is_active) return apiError(res, 404, 'DID not found');
    if (current.released_at) return apiError(res, 400, 'DID is already released');
    if (!current.company_id) return apiError(res, 400, 'DID is not assigned to any company');

    const now = new Date();

    // Stamp the current assignment as released
    current.released_at = now;
    current.status      = 'released';
    await current.save();

    // Create new "available" pool row
    const newRow = await Did.create({
      did_number:   current.did_number,
      label:        current.label,
      notes:        current.notes,
      context:      current.context,
      campaign_id:  null,
      ai_flow_id:   current.ai_flow_id,
      status:       'available',
      company_id:   null,
      added_by:     current.added_by,
      assigned_at:  now,
      released_at:  null,
      is_active:    true,
    });

    return success(res, newRow, 'DID released back to pool');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Company: List DIDs assigned to this company ───────────────────────────────
// GET /api/v1/dids/company/mine
// Uses company_id from JWT payload.
export const listCompanyDids = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company context found in token');

    // Active assignments (released_at = null) for this company
    const dids = await Did.find({
      company_id:  companyId,
      status:      'assigned',
      is_active:   true,
      released_at: null,
    })
      .populate({
        path: 'assigned_user_id',
        select: 'fullName email roleId',
        populate: { path: 'roleId', select: 'name' }
      })
      .sort({ assigned_at: -1 });

    return success(res, dids, 'Company DIDs fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Company: Assign a specific DID to a user within the company ──────────────
// PATCH /api/v1/dids/company/mine/:didId/assign-user
export const assignUserToDid = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company context found in token');

    const { didId } = req.params;
    const { user_id } = req.body;

    const did = await Did.findOne({
      _id: didId,
      company_id: companyId,
      status: 'assigned',
      is_active: true,
      released_at: null,
    });

    if (!did) return apiError(res, 404, 'DID not found or not assigned to your company');

    if (user_id) {
      // Validate that user exists and belongs to the caller's company (any role allowed)
      const user = await User.findOne({ _id: user_id, companyId });
      if (!user) return apiError(res, 404, 'User not found or does not belong to your company');
      did.assigned_user_id = user._id;
    } else {
      did.assigned_user_id = null;
    }

    await did.save();

    const updated = await Did.findById(did._id).populate({
      path: 'assigned_user_id',
      select: 'fullName email roleId',
      populate: { path: 'roleId', select: 'name' }
    });

    return success(res, updated, 'DID user assignment updated successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

// ── Company: Get assignment history for a specific DID ───────────────────────
// GET /api/v1/dids/company/mine/:didId/history
// Only shows history relevant to the company — i.e., rows where company_id matches.
export const getCompanyDidHistory = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return apiError(res, 403, 'No company context found in token');

    const ref = await Did.findOne({ _id: req.params.didId, company_id: companyId });
    if (!ref) return apiError(res, 404, 'DID not found or not assigned to your company');

    // Full history for this number (all companies — anonymised for companies other than this one)
    const history = await Did.find({ did_number: ref.did_number })
      .populate('company_id', 'name')
      .sort({ assigned_at: -1 });

    // For company view: mask company names that aren't theirs
    const masked = history.map((row) => ({
      _id:         row._id,
      did_number:  row.did_number,
      status:      row.status,
      company:     toId(row.company_id?._id) === toId(companyId)
                     ? (row.company_id?.name ?? 'Your Company')
                     : row.company_id ? 'Previously Assigned' : 'Available Pool',
      assigned_at: row.assigned_at,
      released_at: row.released_at,
    }));

    return success(res, masked, 'DID history fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};
