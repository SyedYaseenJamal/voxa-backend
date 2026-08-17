import mongoose from 'mongoose';

const PlatformIntegrationSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  platformType: { type: String, enum: ['meta', 'whatsapp', 'sms', 'email'], required: true },
  credentials: {
    metaAppId: { type: String },
    metaAppSecret: { type: String },
    metaPageAccessToken: { type: String },
    metaPageId: { type: String },
    metaAdAccountId: { type: String }
  },
  status: { type: String, enum: ['active', 'disconnected', 'error'], default: 'active' },
  leadsReceivedCount: { type: Number, default: 0 },
  lastSyncAt: { type: Date },
  connectedAt: { type: Date, default: Date.now },
  connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Compound unique index so each company can have at most one integration per platform
PlatformIntegrationSchema.index({ companyId: 1, platformType: 1 }, { unique: true });

export default mongoose.model('PlatformIntegration', PlatformIntegrationSchema);
