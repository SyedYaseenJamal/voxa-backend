import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  threadId: { type: String, required: true },
  psid: { type: String, required: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  content: { type: String, required: true },
  senderId: { type: String },
  senderName: { type: String },
  recipientId: { type: String },
  metaMessageId: { type: String },
  sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

MessageSchema.index({ companyId: 1, psid: 1, sentAt: 1 });

export default mongoose.model('Message', MessageSchema);
