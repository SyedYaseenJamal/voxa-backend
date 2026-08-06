import Role from './role.model.js';
import User from '../auth/auth.model.js';
import AppError from '../../utils/AppError.js';

// ── VOXA ROLES ──────────────────────────────────────────────────────

export const createVoxaRole = async (name, description, permissions, createdBy) => {
  const existing = await Role.findOne({ name, scope: 'voxa', deletedAt: null });
  if (existing) throw new AppError('Voxa role with this name already exists', 400);

  return await Role.create({ name, description, scope: 'voxa', companyId: null, permissions, createdBy });
};

export const getVoxaRoles = async () => {
  return await Role.find({ scope: 'voxa', deletedAt: null })
    .populate('createdBy', 'email fullName');
};

export const updateVoxaRole = async (roleId, updateData) => {
  const role = await Role.findOneAndUpdate(
    { _id: roleId, scope: 'voxa', deletedAt: null },
    updateData,
    { new: true, runValidators: true }
  );
  if (!role) throw new AppError('Voxa role not found', 404);
  return role;
};

export const deleteVoxaRole = async (roleId) => {
  // Soft delete — set deletedAt instead of removing the document
  const role = await Role.findOneAndUpdate(
    { _id: roleId, scope: 'voxa', deletedAt: null },
    { deletedAt: new Date(), status: 'inactive' },
    { new: true }
  );
  if (!role) throw new AppError('Voxa role not found', 404);
  return true;
};

// ── COMPANY ROLES ────────────────────────────────────────────────────

export const createCompanyRole = async (name, description, permissions, companyId, createdBy) => {
  const existing = await Role.findOne({ name, scope: 'company', companyId, deletedAt: null });
  if (existing) throw new AppError('Role with this name already exists in your company', 400);

  return await Role.create({ name, description, scope: 'company', companyId, permissions, createdBy });
};

export const getCompanyRoles = async (companyId) => {
  return await Role.find({ scope: 'company', companyId, deletedAt: null })
    .populate('createdBy', 'email fullName');
};

export const updateCompanyRole = async (roleId, companyId, updateData) => {
  const role = await Role.findOneAndUpdate(
    { _id: roleId, scope: 'company', companyId, deletedAt: null },
    updateData,
    { new: true, runValidators: true }
  );
  if (!role) throw new AppError('Company role not found or unauthorized', 404);
  return role;
};

export const deleteCompanyRole = async (roleId, companyId) => {
  const role = await Role.findOneAndUpdate(
    { _id: roleId, scope: 'company', companyId, deletedAt: null },
    { deletedAt: new Date(), status: 'inactive' },
    { new: true }
  );
  if (!role) throw new AppError('Company role not found or unauthorized', 404);
  return true;
};
