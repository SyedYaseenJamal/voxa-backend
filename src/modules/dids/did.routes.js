// ─── DID Routes ───────────────────────────────────────────────────────────────
// Mounted at /api/v1/dids

import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requireCustomerPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import {
  createDid,
  listDids,
  getDid,
  getDidHistory,
  updateDid,
  deleteDid,
  assignDid,
  releaseDid,
  listCompanyDids,
  getCompanyDidHistory,
  assignUserToDid,
} from './did.controller.js';

const router = Router();

// ── Company routes (require customer portal auth) ─────────────────────────────
// These MUST be declared before the /:id routes to avoid param conflicts.

// GET /api/v1/dids/company/mine   — list DIDs assigned to my company
router.get(
  '/company/mine',
  protect,
  requireCustomerPortal,
  requirePermission('did:read'),
  listCompanyDids
);

// GET /api/v1/dids/company/mine/:didId/history  — history for a specific DID
router.get(
  '/company/mine/:didId/history',
  protect,
  requireCustomerPortal,
  requirePermission('did:read'),
  getCompanyDidHistory
);

// PATCH /api/v1/dids/company/mine/:didId/assign-user — assign specific DID to a user
router.patch(
  '/company/mine/:didId/assign-user',
  protect,
  requireCustomerPortal,
  requirePermission('did:assign'),
  assignUserToDid
);

// ── Admin routes (require admin portal auth) ──────────────────────────────────

// POST /api/v1/dids               — add a new DID to the pool
router.post(
  '/',
  protect,
  requireAdminPortal,
  requirePermission('did:create'),
  createDid
);

// GET /api/v1/dids                — list all active DIDs
router.get(
  '/',
  protect,
  requireAdminPortal,
  requirePermission('did:read'),
  listDids
);

// GET /api/v1/dids/:id            — get a single DID
router.get(
  '/:id',
  protect,
  requireAdminPortal,
  requirePermission('did:read'),
  getDid
);

// GET /api/v1/dids/:id/history    — full assignment history for a DID number
router.get(
  '/:id/history',
  protect,
  requireAdminPortal,
  requirePermission('did:read'),
  getDidHistory
);

// PATCH /api/v1/dids/:id          — update label/notes/context
router.patch(
  '/:id',
  protect,
  requireAdminPortal,
  requirePermission('did:update'),
  updateDid
);

// DELETE /api/v1/dids/:id         — soft-delete DID
router.delete(
  '/:id',
  protect,
  requireAdminPortal,
  requirePermission('did:delete'),
  deleteDid
);

// POST /api/v1/dids/:id/assign    — assign DID to a company { company_id }
router.post(
  '/:id/assign',
  protect,
  requireAdminPortal,
  requirePermission('did:assign'),
  assignDid
);

// POST /api/v1/dids/:id/release   — release DID back to pool
router.post(
  '/:id/release',
  protect,
  requireAdminPortal,
  requirePermission('did:release'),
  releaseDid
);

export default router;
