import mongoose from 'mongoose';

const RoleSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String },
  scope:       { type: String, enum: ['voxa', 'company'], required: true },
  companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  permissions: [{ type: String }],  // Array of permission name keys
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:   { type: Date, default: null } // null = not deleted (soft delete)
}, { timestamps: true });

// Ensure role names are unique within their scope (either globally for voxa, or per company)
RoleSchema.index({ name: 1, scope: 1, companyId: 1 }, { unique: true });

export default mongoose.model('Role', RoleSchema);
