import mongoose from 'mongoose';

const postpaidBillingSchema = new mongoose.Schema({
  company_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  plan_id:            { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  tokens_cap:         { type: Number, required: true },
  tokens_used:        { type: Number, default: 0 },
  overuse_active:     { type: Boolean, default: false },
  overage_amount_due: { type: Number, default: 0 },
  status:             { type: String, enum: ['active', 'overage', 'closed'], required: true },
  period_start:       { type: Date, required: true },
  period_end:         { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('PostpaidBilling', postpaidBillingSchema);
