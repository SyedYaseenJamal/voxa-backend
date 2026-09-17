import Permission from './permission.model.js';
import Role from '../roles/role.model.js';
import AppError from '../../utils/AppError.js';

export const createPermission = async (name, module, action, description, isSystem = false, scope = 'both') => {
  const existing = await Permission.findOne({ name });
  if (existing) throw new AppError('Permission with this name already exists', 400);

  return await Permission.create({ name, module, action, description, isSystem, scope });
};

export const getPermissions = async (scope = null) => {
  const filter = {};
  if (scope === 'admin') {
    filter.scope = { $in: ['admin', 'both'] };
  } else if (scope === 'company') {
    filter.scope = { $in: ['company', 'both'] };
  }
  return await Permission.find(filter).sort({ module: 1, name: 1 });
};

export const updatePermission = async (id, updateData) => {
  // Prevent changing the name key as it would break existing Role references
  if (updateData.name) delete updateData.name;

  const permission = await Permission.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  if (!permission) throw new AppError('Permission not found', 404);
  return permission;
};

export const deletePermission = async (id) => {
  const permission = await Permission.findById(id);
  if (!permission) throw new AppError('Permission not found', 404);

  if (permission.isSystem) {
    throw new AppError('System permissions cannot be deleted', 403);
  }

  const permName = permission.name;

  // 1. Delete the permission document
  await permission.deleteOne();

  // 2. Cascade delete: Remove this permission key from ALL existing roles
  await Role.updateMany(
    { permissions: permName },
    { $pull: { permissions: permName } }
  );

  return true;
};
