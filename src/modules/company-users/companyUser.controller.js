import * as companyUserService from './companyUser.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const createCompanyUser = async (req, res) => {
  try {
    const { email, fullName, password, username, phoneNumber, roleId } = req.body;
    
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to create company users');
    }

    const user = await companyUserService.createCompanyUser(
      { email, fullName, password, username, phoneNumber, roleId },
      req.user.companyId,
      req.user.userId
    );
    
    return success(res, {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
      username: user.username,
      portal: user.portal,
      companyId: user.companyId,
      roleId: user.roleId,
      isActive: user.isActive,
      status: user.status,
    }, 'Company user created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getCompanyUsers = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to view company users');
    }
    const users = await companyUserService.getCompanyUsers(req.user.companyId);
    return success(res, users, 'Company users fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getCompanyUserById = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to view company users');
    }
    const user = await companyUserService.getCompanyUserById(req.params.id, req.user.companyId);
    return success(res, user, 'Company user fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateCompanyUser = async (req, res) => {
  try {
    const { fullName, phoneNumber, username, status } = req.body;
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to update company users');
    }
    const user = await companyUserService.updateCompanyUser(
      req.params.id, 
      req.user.companyId, 
      { fullName, phoneNumber, username, status }
    );
    return success(res, user, 'Company user updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const assignCompanyRole = async (req, res) => {
  try {
    const { roleId } = req.body;
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to assign roles');
    }
    const user = await companyUserService.assignCompanyRole(req.params.id, req.user.companyId, roleId);
    return success(res, user, 'Role assigned successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deactivateCompanyUser = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return apiError(res, 403, 'You must belong to a company to deactivate users');
    }
    await companyUserService.deactivateCompanyUser(req.params.id, req.user.companyId, req.user.userId);
    return success(res, null, 'Company user deactivated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
