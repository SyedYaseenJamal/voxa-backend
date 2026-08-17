import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  leadListId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadList' },
  phoneE164: { type: String, required: true },
  fullName: { type: String },
  email: { type: String },
  sourcePayload: { type: mongoose.Schema.Types.Mixed }, // Raw payload from source
  globalStatus: { type: String, enum: ['new', 'active', 'converted', 'dnc'], default: 'new' },
  dncAt: { type: Date },
  lastCallId: { type: mongoose.Schema.Types.ObjectId },
  preferredCallTime: { type: String }
}, { timestamps: true });

export default mongoose.model('Lead', LeadSchema);
