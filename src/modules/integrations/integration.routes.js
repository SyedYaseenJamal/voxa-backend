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
import {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getAdSets,
  createAdSet,
  updateAdSet,
  deleteAdSet,
  uploadCreativeImage,
  uploadAdImageMulter,
  createAdCreative,
  getAdCreatives,
  deleteAdCreative,
  getAds,
  createAd,
  updateAd,
  deleteAd
} from './campaigns.controller.js';

import { requirePermission } from '../../middlewares/authorizePermission.js';

const router = Router();

// ─── ADMIN ROUTES (Platform-wide Omnichannel overview & Company Drill-down) ──
router.get('/admin/overview', protect, requirePermission('integrations:read'), getAdminOverview);
router.get('/admin/company/:companyId', protect, requirePermission('integrations:read'), getAdminCompanyIntegrations);

// ─── PUBLIC WEBHOOK ROUTES (Meta subscription & capture) ───────────────
// Both standard global webhook and company-specific webhook are supported.
router.get('/webhook/meta', verifyWebhook);
router.get('/webhook/meta/:companyId', verifyWebhook);

router.post('/webhook/meta', receiveWebhook);
router.post('/webhook/meta/:companyId', receiveWebhook);

// ─── PROTECTED ROUTES (Requires authentication) ────────────────────────
router.get('/config/:platformType', protect, requirePermission('integrations:read'), getConfig);
router.post('/config/:platformType', protect, requirePermission('integrations:manage'), saveConfig);
router.delete('/config/:platformType', protect, requirePermission('integrations:manage'), deleteConfig);

router.get('/meta/forms', protect, requirePermission('forms:read'), getMetaForms);
router.post('/meta/forms', protect, requirePermission('forms:create'), createMetaForm);
router.get('/meta/leads', protect, requirePermission('leads:read'), getMetaLeads);
router.get('/meta/forms/:formId/leads', protect, requirePermission('leads:read'), getLeadsByFormId);

// ─── MESSENGER ROUTES ───────────────────────────────────────────────────
router.get('/messages', protect, requirePermission('messages:read'), getMessages);
router.get('/messages/:psid', protect, requirePermission('messages:read'), getMessagesByPsid);
router.post('/messages/send', protect, requirePermission('messages:send'), sendMessengerMessage);

// ─── META CAMPAIGNS ROUTES (CAMPAIGNS_API.md) ───────────────────────────
router.get('/campaigns', protect, requirePermission('campaigns:read'), getCampaigns);
router.post('/campaigns/create', protect, requirePermission('campaigns:create'), createCampaign);
router.get('/campaigns/:id', protect, requirePermission('campaigns:read'), getCampaignById);
router.patch('/campaigns/:id', protect, requirePermission('campaigns:update'), updateCampaign);
router.delete('/campaigns/:id', protect, requirePermission('campaigns:delete'), deleteCampaign);

router.get('/adsets', protect, requirePermission('campaigns:read'), getAdSets);
router.post('/adsets/create', protect, requirePermission('campaigns:create'), createAdSet);
router.patch('/adsets/:id', protect, requirePermission('campaigns:update'), updateAdSet);
router.delete('/adsets/:id', protect, requirePermission('campaigns:delete'), deleteAdSet);

router.post('/adcreatives/upload-image', protect, requirePermission('campaigns:create'), uploadAdImageMulter.single('image'), uploadCreativeImage);
router.post('/adcreatives/create', protect, requirePermission('campaigns:create'), createAdCreative);
router.get('/adcreatives', protect, requirePermission('campaigns:read'), getAdCreatives);
router.delete('/adcreatives/:id', protect, requirePermission('campaigns:delete'), deleteAdCreative);

router.get('/ads', protect, requirePermission('campaigns:read'), getAds);
router.post('/ads/create', protect, requirePermission('campaigns:create'), createAd);
router.patch('/ads/:id', protect, requirePermission('campaigns:update'), updateAd);
router.delete('/ads/:id', protect, requirePermission('campaigns:delete'), deleteAd);

export default router;

