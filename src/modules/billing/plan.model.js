import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name:                 { type: String, required: true },
  type:                 { type: String, enum: ['prepaid', 'postpaid'], required: true },
  cost:                 { type: Number, required: true },
  duration_type:        { type: String, enum: ['monthly', 'pay-as-you-go'], required: true },
  tokens:               { type: Number, required: true },
  ai_receptionist:      { type: Boolean, default: false },
  bulk_ai_calling:      { type: Boolean, default: false },
  max_agents:           { type: Number },
  max_concurrent_calls: { type: Number },
  is_custom:            { type: Boolean, default: false },
  is_active:            { type: Boolean, default: true },
  description:          { type: String },
  created_by:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model('Plan', planSchema);
