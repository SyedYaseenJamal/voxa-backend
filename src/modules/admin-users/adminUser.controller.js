import * as adminUserService from './adminUser.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const createAdminUser = async (req, res) => {
  try {
    const { email, fullName, password, roleId } = req.body;
    const user = await adminUserService.createAdminUser(
      { email, fullName, password, roleId },
      req.user.userId
    );
    return success(res, {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
      portal: user.portal,
      roleId: user.roleId,
      isActive: user.isActive,
      status: user.status,
    }, 'Admin user created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getAdminUsers = async (req, res) => {
  try {
    const users = await adminUserService.getAdminUsers();
    return success(res, users, 'Admin users fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getAdminUserById = async (req, res) => {
  try {
    const user = await adminUserService.getAdminUserById(req.params.id);
    return success(res, user, 'Admin user fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateAdminUser = async (req, res) => {
  try {
    const { fullName, isActive, twoFaEnabled } = req.body;
    const user = await adminUserService.updateAdminUser(req.params.id, { fullName, isActive, twoFaEnabled });
    return success(res, user, 'Admin user updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const assignAdminRole = async (req, res) => {
  try {
    const { roleId } = req.body;
    const user = await adminUserService.assignAdminRole(req.params.id, roleId);
    return success(res, user, 'Role assigned successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deactivateAdminUser = async (req, res) => {
  try {
    await adminUserService.deactivateAdminUser(req.params.id, req.user.userId);
    return success(res, null, 'Admin user deactivated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
