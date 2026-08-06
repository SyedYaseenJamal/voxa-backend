import User from '../auth/auth.model.js';
import Role from '../roles/role.model.js';
import AppError from '../../utils/AppError.js';
import bcrypt from 'bcryptjs';

// Create a new Voxa staff user (admin portal)
// Schema ref: super_admins table
export const createAdminUser = async ({ email, fullName, password, roleId }, createdBy) => {
  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already in use', 400);

  // Validate role belongs to voxa scope if provided
  if (roleId) {
    const role = await Role.findOne({ _id: roleId, scope: 'voxa', deletedAt: null });
    if (!role) throw new AppError('Role not found or not a valid Voxa role', 404);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return await User.create({
    email,
    fullName,
    passwordHash,
    portal: 'admin',
    roleId: roleId || null,
    companyId: null,
    isActive: true,
    status: 'active',
    createdBy
  });
};

// List all voxa staff members
// Schema ref: super_admins table — all portal=admin users
export const getAdminUsers = async () => {
  return await User.find({ portal: 'admin' })
    .populate('roleId', 'name description permissions status')
    .select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires')
    .sort({ createdAt: -1 });
};

// Get single admin user
export const getAdminUserById = async (id) => {
  const user = await User.findOne({ _id: id, portal: 'admin' })
    .populate('roleId', 'name description permissions status');
  if (!user) throw new AppError('Admin user not found', 404);
  return user;
};

// Update admin user profile
// Schema ref: super_admins — full_name, is_active, two_fa_enabled
export const updateAdminUser = async (id, updateData) => {
  const user = await User.findOneAndUpdate(
    { _id: id, portal: 'admin' },
    updateData,
    { new: true, runValidators: true }
  ).select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires');
  if (!user) throw new AppError('Admin user not found', 404);
  return user;
};

// Assign a Voxa-scoped role to an admin user
// Schema ref: super_admins.role_id → roles._id
export const assignAdminRole = async (id, roleId) => {
  const role = await Role.findOne({ _id: roleId, scope: 'voxa', deletedAt: null });
  if (!role) throw new AppError('Role not found or not a valid Voxa role', 404);

  const user = await User.findOneAndUpdate(
    { _id: id, portal: 'admin' },
    { roleId },
    { new: true }
  ).populate('roleId', 'name permissions');
  if (!user) throw new AppError('Admin user not found', 404);
  return user;
};

// Deactivate (soft delete) an admin user
export const deactivateAdminUser = async (id, requesterId) => {
  if (id.toString() === requesterId.toString()) {
    throw new AppError('You cannot deactivate your own account', 400);
  }
  const user = await User.findOneAndUpdate(
    { _id: id, portal: 'admin' },
    { isActive: false, status: 'inactive' },
    { new: true }
  );
  if (!user) throw new AppError('Admin user not found', 404);
  return true;
};
