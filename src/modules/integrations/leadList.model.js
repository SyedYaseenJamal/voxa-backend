import mongoose from 'mongoose';

const LeadListSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  source: { type: String, enum: ['meta', 'whatsapp', 'sms', 'email', 'shopify', 'instagram', 'tiktok', 'csv', 'manual', 'api'], required: true },
  sourceRefId: { type: String }, // e.g. Meta Form ID
  integrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformIntegration' },
  totalLeads: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model('LeadList', LeadListSchema);
