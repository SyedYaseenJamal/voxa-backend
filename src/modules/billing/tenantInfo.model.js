import mongoose from 'mongoose';

const tenantInfoSchema = new mongoose.Schema({
  company_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  tenant_id:     { type: String, required: true },
  region:        { type: String },
  province:      { type: String },
  address:       { type: String },
  contact_name:  { type: String, required: true },
  contact_email: { type: String, required: true },
  is_active:     { type: Boolean, default: true },
  effective_from:{ type: Date, required: true },
  effective_to:  { type: Date }
}, { timestamps: true });

export default mongoose.model('TenantInfo', tenantInfoSchema);
