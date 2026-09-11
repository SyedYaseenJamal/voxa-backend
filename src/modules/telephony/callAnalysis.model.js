import mongoose from 'mongoose';

const transcriptSegmentSchema = new mongoose.Schema({
  speaker:    { type: String, required: true },
  start_time: { type: Number, required: true },
  end_time:   { type: Number, required: true },
  text:       { type: String, required: true },
  language:   { type: String, default: null },
}, { _id: false });

const callSummarySchema = new mongoose.Schema({
  outcome:          { type: String, enum: ['interested', 'not_interested', 'follow_up_required', 'converted', 'complaint', 'other'], default: 'other' },
  sentiment:        { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  caller_intent:    { type: String, default: '' },
  key_points:       { type: [String], default: [] },
  action_items:     { type: [String], default: [] },
  topics_discussed: { type: [String], default: [] },
  language_notes:   { type: String, default: null },
}, { _id: false });

const callAnalysisSchema = new mongoose.Schema({
  call_id: { type: String, required: true, unique: true, index: true },
  uniqueid: { type: String, index: true },
  callerid: { type: String },
  destination: { type: String },
  recording_filename: { type: String },
  recording_url: { type: String },
  script: { type: String, enum: ['urdu', 'roman_urdu', 'mixed'], default: 'mixed' },
  
  transcript: {
    segments: { type: [transcriptSegmentSchema], default: [] },
    full_text: { type: String, default: '' }
  },
  
  summary: { type: callSummarySchema, default: () => ({}) },
  
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  error_message: { type: String, default: null },
  raw_response: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

export const CallAnalysis = mongoose.model('CallAnalysis', callAnalysisSchema);
