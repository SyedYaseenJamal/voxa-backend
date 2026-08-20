import multer from 'multer';
import { IvrCampaign } from './ivrCampaign.model.js';
import { createCampaign as obdCreateCampaign, getCampaigns as obdGetCampaigns, startCampaign as obdStartCampaign, getCampaignDetail as obdGetCampaignDetail } from './obdCms.service.js';

// ── Multer: keep CSV in memory as a Buffer ────────────────────────────────────
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'csv_file' && file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only .csv files are allowed for csv_file'));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ── Create Campaign ───────────────────────────────────────────────────────────
export const createCampaign = async (req, res) => {
  try {
    const {
      name,
      type,
      audioFile,
      description,
      schedule,
      // OBD-specific fields
      campaign_type,
      audio_id,
      schedule_time,
      dtmfOptions,       // JSON string or array from multipart
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Name and Type are required.' });
    }

    console.log('[Controller] req.body:', JSON.stringify(req.body, null, 2));

    // Parse dtmfOptions if sent as JSON string (multipart form)
    let parsedDtmfOptions = [];
    if (dtmfOptions) {
      try {
        const raw = typeof dtmfOptions === 'string' ? JSON.parse(dtmfOptions) : dtmfOptions;
        // Map snake_case from frontend JSON to camelCase for Mongoose DB
        parsedDtmfOptions = raw.map(opt => ({
          digit: opt.digit,
          optionText: opt.option_text || opt.optionText || '',
          replyAudio: opt.reply_audio || opt.replyAudio || ''
        }));
      } catch {
        parsedDtmfOptions = [];
      }
    }

    // ── 1. Save to local MongoDB ─────────────────────────────────────────────
    const csvFilename = req.file?.originalname || '';

    const campaign = new IvrCampaign({
      name,
      type: type.toLowerCase(),
      audioFile: audioFile || '',
      csvFile:   csvFilename,
      description,
      status:    'pending',
      createdBy: 'admin',
      schedule:  schedule ? new Date(schedule) : undefined,
      // OBD fields
      campaignType:  campaign_type || type.toLowerCase(),
      audioId:       audio_id || undefined,
      scheduleTime:  schedule_time ? new Date(schedule_time) : undefined,
      dtmfOptions:   parsedDtmfOptions,
    });

    await campaign.save();

    // ── 2. Sync to OBD CMS before responding ────────────────────────────────
    let obdResult = null;
    if (req.file?.buffer) {
      try {
        console.log('[OBD CMS] Initiating sync for campaign:', name);
        const obdPayload = {
          campaign_name:  name,
          campaign_type:  (campaign_type || type).toLowerCase(),
          audio_id:       audio_id || '',
          schedule_time:  schedule_time || (schedule ? new Date(schedule).toISOString().slice(0, 16) : ''),
          description,
          dtmfOptions:    parsedDtmfOptions, // now mapped to camelCase
        };

        obdResult = await obdCreateCampaign(obdPayload, req.file.buffer, req.file.originalname);
        console.log('[OBD CMS] Campaign created successfully:', obdResult);
        
        campaign.obdCampaignId = obdResult.obdCampaignId;
        
        if (obdResult.success && obdResult.obdCampaignId) {
          try {
            console.log(`[OBD CMS] Starting campaign ${obdResult.obdCampaignId}...`);
            await obdStartCampaign(obdResult.obdCampaignId);
            campaign.obdStatus = 'started';
            console.log(`[OBD CMS] Campaign ${obdResult.obdCampaignId} started successfully.`);
          } catch (startErr) {
            console.error(`[OBD CMS] Failed to start campaign ${obdResult.obdCampaignId}:`, startErr.message);
            campaign.obdStatus = 'synced'; // fallback if start fails
          }
        } else {
          campaign.obdStatus = 'failed';
        }

        await campaign.save(); // update with OBD ID and status
      } catch (obdErr) {
        console.error('[OBD CMS] FULL ERROR during campaign sync:');
        console.error(obdErr);
        campaign.obdStatus = 'failed';
        await campaign.save();
        return res.status(500).json({ success: false, message: 'Saved locally, but failed to sync to OBD CMS', error: obdErr.message });
      }
    } else {
      console.warn('[OBD CMS] No CSV file provided — skipping OBD CMS sync.');
    }

    // ── 3. Respond immediately with local DB record ──────────────────────────
    res.status(201).json({ 
      success: true, 
      message: 'Campaign created successfully', 
      data: campaign,
      obdCampaignId: campaign.obdCampaignId,
      obdStatus: campaign.obdStatus
    });

  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── Get Campaigns (local DB) ──────────────────────────────────────────────────
export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await IvrCampaign.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── Get Campaigns from OBD CMS ────────────────────────────────────────────────
export const getObdCampaigns = async (req, res) => {
  try {
    const campaigns = await obdGetCampaigns();
    res.status(200).json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching OBD campaigns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch OBD campaigns', error: error.message });
  }
};

// ── Get Campaign by ID (local DB) ─────────────────────────────────────────────
export const getCampaignById = async (req, res) => {
  try {
    const campaign = await IvrCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── Get OBD Campaign Detail ───────────────────────────────────────────────────
export const getObdCampaignDetailHandler = async (req, res) => {
  try {
    const campaign = await IvrCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Local campaign not found' });
    if (!campaign.obdCampaignId) return res.status(400).json({ success: false, message: 'No OBD Campaign ID associated' });

    const detail = await obdGetCampaignDetail(campaign.obdCampaignId);
    res.status(200).json({ success: true, data: detail });
  } catch (error) {
    console.error('Error fetching OBD campaign detail:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch OBD campaign detail', error: error.message });
  }
};

// ── Start Campaign ────────────────────────────────────────────────────────────
export const startObdCampaignHandler = async (req, res) => {
  try {
    const campaign = await IvrCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Local campaign not found' });
    if (!campaign.obdCampaignId) return res.status(400).json({ success: false, message: 'No OBD Campaign ID associated' });

    console.log(`[OBD CMS] Manually starting campaign ${campaign.obdCampaignId}...`);
    const success = await obdStartCampaign(campaign.obdCampaignId);
    if (success) {
      campaign.obdStatus = 'started';
      await campaign.save();
      res.status(200).json({ success: true, message: 'Campaign started successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Failed to start campaign in OBD CMS' });
    }
  } catch (error) {
    console.error('Error starting OBD campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to start OBD campaign', error: error.message });
  }
};
