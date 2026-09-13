import mongoose from 'mongoose';

const CallNoteSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  callId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  note: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

export const CallNote = mongoose.model('CallNote', CallNoteSchema);
