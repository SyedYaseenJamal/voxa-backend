import express from 'express';
import { createCampaign, getCampaigns, getObdCampaigns, upload, getCampaignById, getObdCampaignDetailHandler, startObdCampaignHandler } from './ivrCampaign.controller.js';

const router = express.Router();

// Local DB campaigns
router.get('/', getCampaigns);

// Create campaign — accepts multipart/form-data (csv_file field)
router.post('/', upload.single('csv_file'), createCampaign);

// Proxy: fetch campaigns list from OBD CMS
router.get('/obd', getObdCampaigns);

// Local campaign by ID
router.get('/:id', getCampaignById);

// Proxy: fetch campaign details from OBD CMS
router.get('/:id/obd-detail', getObdCampaignDetailHandler);

// Start campaign manually
router.get('/:id/start', startObdCampaignHandler);

export default router;
