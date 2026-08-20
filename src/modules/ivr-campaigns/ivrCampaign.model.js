import mongoose from 'mongoose';

const dtmfOptionSchema = new mongoose.Schema({
  digit:      { type: String },
  optionText: { type: String },
  replyAudio: { type: String },
}, { _id: false });

const ivrCampaignSchema = new mongoose.Schema({
  // ── Existing fields ──────────────────────────────────────────────────────────
  name:        { type: String, required: true },
  type:        { type: String, enum: ['Broadcast', 'DTMF', 'broadcast', 'dtmf'], required: true },
  audioFile:   { type: String },
  csvFile:     { type: String },
  description: { type: String },
  status:      { type: String, default: 'pending', enum: ['pending', 'completed', 'active', 'failed'] },
  schedule:    { type: Date, default: Date.now },
  companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  createdBy:   { type: String, default: 'admin' },

  // ── OBD CMS fields ───────────────────────────────────────────────────────────
  campaignType:   { type: String, enum: ['broadcast', 'dtmf'] },   // OBD type (lowercase)
  audioId:        { type: String },                                  // OBD audio file name
  scheduleTime:   { type: Date },                                    // Scheduled datetime for OBD
  obdCampaignId:  { type: String },                                  // ID returned by OBD CMS after creation
  obdStatus:      { type: String },                                  // Status from OBD CMS
  dtmfOptions:    { type: [dtmfOptionSchema], default: [] },         // DTMF options (dtmf type only)
}, { timestamps: true });

export const IvrCampaign = mongoose.model('IvrCampaign', ivrCampaignSchema);
