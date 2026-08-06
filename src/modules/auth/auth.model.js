import mongoose from 'mongoose';

// Unified User model for both super_admins (admin portal) and company_users (customer portal)
// The schema maps to both the super_admins and company_users tables in VOXA schema.
const UserSchema = new mongoose.Schema({
  email:              { type: String, required: true, unique: true },
  fullName:           { type: String, required: true },
  username:           { type: String, unique: true, sparse: true }, // Optional login username (company_users)
  passwordHash:       { type: String, required: true },
  portal:             { type: String, enum: ['admin', 'customer'], required: true },
  companyId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  roleId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  phoneNumber:        { type: String },
  isActive:           { type: Boolean, default: true },
  status:             { type: String, enum: ['active', 'suspended', 'inactive'], default: 'active' },
  twoFaEnabled:       { type: Boolean, default: false },           // super_admins.two_fa_enabled
  passwordExpiresAt:  { type: Date },                              // super_admins.password_expires_at
  lastLoginAt:        { type: Date },
  createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  refreshToken:       { type: String },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
