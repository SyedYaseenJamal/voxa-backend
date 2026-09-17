import express from 'express';
import {
  createCampaign,
  getCampaigns,
  getObdCampaigns,
  upload,
  getCampaignById,
  getObdCampaignDetailHandler,
  startObdCampaignHandler,
  uploadAudioHandler,
  listAudioHandler,
  audioUpload
} from './ivrCampaign.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requirePermission } from '../../middlewares/authorizePermission.js';

const router = express.Router();

router.use(protect);

// Local DB campaigns
router.get('/', requirePermission('campaigns:read'), getCampaigns);

// Create campaign — accepts multipart/form-data (csv_file field)
router.post('/', requirePermission('campaigns:create'), upload.single('csv_file'), createCampaign);

// Proxy: fetch campaigns list from OBD CMS
router.get('/obd', requirePermission('campaigns:read'), getObdCampaigns);

// ── Audio routes ──────────────────────────────────────────────────────────────
// List all audio files from OBD CMS
router.get('/audio', requirePermission('campaigns:read'), listAudioHandler);

// Upload an audio file to OBD CMS (field name: "audio")
router.post('/audio/upload', requirePermission('campaigns:create'), audioUpload.single('audio'), uploadAudioHandler);

// Local campaign by ID
router.get('/:id', requirePermission('campaigns:read'), getCampaignById);

// Proxy: fetch campaign details from OBD CMS
router.get('/:id/obd-detail', requirePermission('campaigns:read'), getObdCampaignDetailHandler);

// Start campaign manually
router.get('/:id/start', requirePermission('campaigns:update'), startObdCampaignHandler);

export default router;
