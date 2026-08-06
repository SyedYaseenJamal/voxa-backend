import * as roleService from './role.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

// VOXA ROLES
export const createVoxaRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const role = await roleService.createVoxaRole(name, description, permissions, req.user.userId);
    return success(res, role, 'Voxa role created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getVoxaRoles = async (req, res) => {
  try {
    const roles = await roleService.getVoxaRoles();
    return success(res, roles, 'Voxa roles fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateVoxaRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, status } = req.body;
    const role = await roleService.updateVoxaRole(id, { name, description, permissions, status });
    return success(res, role, 'Voxa role updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deleteVoxaRole = async (req, res) => {
  try {
    const { id } = req.params;
    await roleService.deleteVoxaRole(id);
    return success(res, null, 'Voxa role deleted successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

// COMPANY ROLES
export const createCompanyRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    if (!req.user.companyId) return apiError(res, 403, 'User does not belong to a company');
    const role = await roleService.createCompanyRole(name, description, permissions, req.user.companyId, req.user.userId);
    return success(res, role, 'Company role created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getCompanyRoles = async (req, res) => {
  try {
    if (!req.user.companyId) return apiError(res, 403, 'User does not belong to a company');
    const roles = await roleService.getCompanyRoles(req.user.companyId);
    return success(res, roles, 'Company roles fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateCompanyRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, status } = req.body;
    if (!req.user.companyId) return apiError(res, 403, 'User does not belong to a company');
    const role = await roleService.updateCompanyRole(id, req.user.companyId, { name, description, permissions, status });
    return success(res, role, 'Company role updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deleteCompanyRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user.companyId) return apiError(res, 403, 'User does not belong to a company');
    await roleService.deleteCompanyRole(id, req.user.companyId);
    return success(res, null, 'Company role deleted successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
