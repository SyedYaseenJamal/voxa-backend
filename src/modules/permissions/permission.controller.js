import * as permissionService from './permission.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const createPermission = async (req, res) => {
  try {
    const { name, module, action, description, isSystem } = req.body;
    const permission = await permissionService.createPermission(name, module, action, description, isSystem);
    return success(res, permission, 'Permission created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getPermissions = async (req, res) => {
  try {
    const permissions = await permissionService.getPermissions();
    return success(res, permissions, 'Permissions fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, module } = req.body;
    const permission = await permissionService.updatePermission(id, { description, module });
    return success(res, permission, 'Permission updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;
    await permissionService.deletePermission(id);
    return success(res, null, 'Permission deleted and cascade removed from all roles');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
