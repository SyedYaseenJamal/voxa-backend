import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import {
  getConfig,
  saveConfig,
  deleteConfig,
  getMetaForms,
  createMetaForm,
  getMetaLeads,
  getLeadsByFormId,
  getMessages,
  getMessagesByPsid,
  sendMessengerMessage,
  verifyWebhook,
  receiveWebhook,
  getAdminOverview,
  getAdminCompanyIntegrations
} from './integration.controller.js';

const router = Router();

// ─── ADMIN ROUTES (Platform-wide Omnichannel overview & Company Drill-down) ──
router.get('/admin/overview', protect, getAdminOverview);
router.get('/admin/company/:companyId', protect, getAdminCompanyIntegrations);

// ─── PUBLIC WEBHOOK ROUTES (Meta subscription & capture) ───────────────
// Both standard global webhook and company-specific webhook are supported.
router.get('/webhook/meta', verifyWebhook);
router.get('/webhook/meta/:companyId', verifyWebhook);

router.post('/webhook/meta', receiveWebhook);
router.post('/webhook/meta/:companyId', receiveWebhook);

// ─── PROTECTED ROUTES (Requires authentication) ────────────────────────
router.get('/config/:platformType', protect, getConfig);
router.post('/config/:platformType', protect, saveConfig);
router.delete('/config/:platformType', protect, deleteConfig);

router.get('/meta/forms', protect, getMetaForms);
router.post('/meta/forms', protect, createMetaForm);
router.get('/meta/leads', protect, getMetaLeads);
router.get('/meta/forms/:formId/leads', protect, getLeadsByFormId);

// ─── MESSENGER ROUTES ───────────────────────────────────────────────────
router.get('/messages', protect, getMessages);
router.get('/messages/:psid', protect, getMessagesByPsid);
router.post('/messages/send', protect, sendMessengerMessage);

export default router;

