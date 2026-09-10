// ─── AI Agents Routes ─────────────────────────────────────────────────────────
// Mounted at /api/v1/ai-agents

import { Router } from 'express';
import express from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requireCustomerPortal } from '../../middlewares/authorizePermission.js';
import {
  // Admin
  adminListConfigs,
  adminGetConfig,
  adminCreateConfig,
  adminUpdateConfig,
  adminDeleteConfig,
  adminListCalls,
  adminGetCall,
  adminTriggerCall,
  // Company
  companyListConfigs,
  companyCreateConfig,
  companyUpdateConfig,
  companyDeleteConfig,
  companyListCalls,
  companyGetCall,
  companyTriggerCall,
  // Webhook
  receiveWebhook,
} from './aiAgent.controller.js';

const router = Router();

// ── PUBLIC: Webhook (must come first — no auth, HMAC-verified internally) ─────
// POST /api/v1/ai-agents/webhook
router.post(
  '/webhook',
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  }),
  receiveWebhook,
);

// ── COMPANY routes ─────────────────────────────────────────────────────────────

// Agent configs
router.get(    '/company/configs',      protect, requireCustomerPortal, companyListConfigs);
router.post(   '/company/configs',      protect, requireCustomerPortal, companyCreateConfig);
router.put(    '/company/configs/:id',  protect, requireCustomerPortal, companyUpdateConfig);
router.delete( '/company/configs/:id',  protect, requireCustomerPortal, companyDeleteConfig);

// Calls
router.get(    '/company/calls',        protect, requireCustomerPortal, companyListCalls);
router.post(   '/company/calls/trigger',protect, requireCustomerPortal, companyTriggerCall);
router.get(    '/company/calls/:id',    protect, requireCustomerPortal, companyGetCall);

// ── ADMIN routes ───────────────────────────────────────────────────────────────

// Agent configs
router.get(    '/configs',      protect, requireAdminPortal, adminListConfigs);
router.post(   '/configs',      protect, requireAdminPortal, adminCreateConfig);
router.get(    '/configs/:id',  protect, requireAdminPortal, adminGetConfig);
router.put(    '/configs/:id',  protect, requireAdminPortal, adminUpdateConfig);
router.delete( '/configs/:id',  protect, requireAdminPortal, adminDeleteConfig);

// Calls
router.get(    '/calls',         protect, requireAdminPortal, adminListCalls);
router.post(   '/calls/trigger', protect, requireAdminPortal, adminTriggerCall);
router.get(    '/calls/:id',     protect, requireAdminPortal, adminGetCall);

export default router;
