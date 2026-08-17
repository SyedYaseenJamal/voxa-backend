import mongoose from 'mongoose';

const MetaFormSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  formName: { type: String, required: true },
  metaFormId: { type: String, required: true, unique: true },
  pageId: { type: String, required: true },
  adAccountId: { type: String },
  questions: { type: Array, default: [] }
}, { timestamps: true });

export default mongoose.model('MetaForm', MetaFormSchema);
