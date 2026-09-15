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

// ─── META CAMPAIGNS ROUTES (CAMPAIGNS_API.md) ───────────────────────────
router.get('/campaigns', protect, getCampaigns);
router.post('/campaigns/create', protect, createCampaign);
router.get('/campaigns/:id', protect, getCampaignById);
router.patch('/campaigns/:id', protect, updateCampaign);
router.delete('/campaigns/:id', protect, deleteCampaign);

router.get('/adsets', protect, getAdSets);
router.post('/adsets/create', protect, createAdSet);
router.patch('/adsets/:id', protect, updateAdSet);
router.delete('/adsets/:id', protect, deleteAdSet);

router.post('/adcreatives/upload-image', protect, uploadAdImageMulter.single('image'), uploadCreativeImage);
router.post('/adcreatives/create', protect, createAdCreative);
router.get('/adcreatives', protect, getAdCreatives);
router.delete('/adcreatives/:id', protect, deleteAdCreative);

router.get('/ads', protect, getAds);
router.post('/ads/create', protect, createAd);
router.patch('/ads/:id', protect, updateAd);
router.delete('/ads/:id', protect, deleteAd);

export default router;

