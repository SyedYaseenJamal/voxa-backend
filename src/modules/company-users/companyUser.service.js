import User from '../auth/auth.model.js';
import Role from '../roles/role.model.js';
import AppError from '../../utils/AppError.js';
import bcrypt from 'bcryptjs';

// Create a company user — scoped to the creating user's company
// Schema ref: company_users table
export const createCompanyUser = async ({ email, fullName, password, username, phoneNumber, roleId }, companyId, createdBy) => {
  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already in use', 400);

  if (username) {
    const existingUsername = await User.findOne({ username });
    if (existingUsername) throw new AppError('Username already taken', 400);
  }

  // Validate role belongs to this company
  if (roleId) {
    const role = await Role.findOne({ _id: roleId, scope: 'company', companyId, deletedAt: null });
    if (!role) throw new AppError('Role not found or does not belong to your company', 404);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return await User.create({
    email,
    fullName,
    username: username || null,
    passwordHash,
    phoneNumber: phoneNumber || null,
    portal: 'customer',
    companyId,
    roleId: roleId || null,
    isActive: true,
    status: 'active',
    createdBy
  });
};

// List all users in the authenticated user's company
// Schema ref: company_users.company_id filter
export const getCompanyUsers = async (companyId) => {
  return await User.find({ companyId, portal: 'customer' })
    .populate('roleId', 'name description permissions status')
    .select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires')
    .sort({ createdAt: -1 });
};

// Get single company user — must belong to same company
export const getCompanyUserById = async (id, companyId) => {
  const user = await User.findOne({ _id: id, companyId, portal: 'customer' })
    .populate('roleId', 'name description permissions status');
  if (!user) throw new AppError('User not found in your company', 404);
  return user;
};

// Update company user — company admin can update users in their company
// Schema ref: company_users — full_name, phone_number, username, status
export const updateCompanyUser = async (id, companyId, updateData) => {
  const user = await User.findOneAndUpdate(
    { _id: id, companyId, portal: 'customer' },
    updateData,
    { new: true, runValidators: true }
  ).select('-passwordHash -refreshToken -passwordResetToken -passwordResetExpires');
  if (!user) throw new AppError('User not found in your company', 404);
  return user;
};

// Assign a company-scoped role to a company user
// Schema ref: company_users.role_id → roles._id (scope=company)
export const assignCompanyRole = async (id, companyId, roleId) => {
  const role = await Role.findOne({ _id: roleId, scope: 'company', companyId, deletedAt: null });
  if (!role) throw new AppError('Role not found or does not belong to your company', 404);

  const user = await User.findOneAndUpdate(
    { _id: id, companyId, portal: 'customer' },
    { roleId },
    { new: true }
  ).populate('roleId', 'name permissions');
  if (!user) throw new AppError('User not found in your company', 404);
  return user;
};

// Deactivate (soft delete) a company user
// Schema ref: company_users.status → suspended | inactive
export const deactivateCompanyUser = async (id, companyId, requesterId) => {
  if (id.toString() === requesterId.toString()) {
    throw new AppError('You cannot deactivate your own account', 400);
  }
  const user = await User.findOneAndUpdate(
    { _id: id, companyId, portal: 'customer' },
    { isActive: false, status: 'inactive' },
    { new: true }
  );
  if (!user) throw new AppError('User not found in your company', 404);
  return true;
};
