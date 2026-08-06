import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  name:                   { type: String, required: true },
  status:                 { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
  billingModel:           { type: String, enum: ['prepaid', 'postpaid'], required: true },
  createdBy:              { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // super_admin who created it
  adminUserId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },  // initial company admin
  aiReceptionistEnabled:  { type: Boolean, default: false },
  bulkAiCallingEnabled:   { type: Boolean, default: false },
  maxConcurrentCalls:     { type: Number },
  stripeCustomerId:       { type: String },
  forceHalt:              { type: Boolean, default: false } // Hard block — no service regardless of plan
}, { timestamps: true });

export default mongoose.model('Company', CompanySchema);
