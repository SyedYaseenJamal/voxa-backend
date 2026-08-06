import mongoose from 'mongoose';

const PermissionSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true }, // e.g. 'users:create', 'billing:export'
  module:      { type: String, required: true },               // users | billing | calls | agents | campaigns
  action:      { type: String, required: true },               // create | read | update | delete | export
  description: { type: String },
  isSystem:    { type: Boolean, default: false }               // true = cannot be deleted by anyone
}, { timestamps: true });

export default mongoose.model('Permission', PermissionSchema);
