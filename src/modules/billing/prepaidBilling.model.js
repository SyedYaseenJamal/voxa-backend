import mongoose from 'mongoose';

const prepaidBillingSchema = new mongoose.Schema({
  company_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  plan_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount_charged: { type: Number, required: true },
  tokens_cap:     { type: Number, required: true },
  billing_lock:   { type: Boolean, default: false },
  status:         { type: String, enum: ['active', 'exhausted', 'expired', 'cancelled'], required: true },
  purchased_at:   { type: Date, required: true },
  period_start:   { type: Date, required: true },
  period_end:     { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('PrepaidBilling', prepaidBillingSchema);
