import mongoose from 'mongoose';

const ivrCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['Broadcast', 'DTMF', 'broadcast', 'dtmf'], required: true },
  audioFile: { type: String },
  csvFile: { type: String },
  description: { type: String },
  status: { type: String, default: 'pending', enum: ['pending', 'completed', 'active', 'failed'] },
  schedule: { type: Date, default: Date.now },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  createdBy: { type: String, default: 'admin' }
}, { timestamps: true });

export const IvrCampaign = mongoose.model('IvrCampaign', ivrCampaignSchema);
