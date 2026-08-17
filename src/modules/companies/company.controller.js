import * as companyService from './company.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const createCompany = async (req, res) => {
  try {
    const { name, businessType, billingModel, adminEmail, adminFullName, maxConcurrentCalls, aiReceptionistEnabled, bulkAiCallingEnabled, forceHalt, tenant, planId } = req.body;
    const result = await companyService.createCompany(
      { name, businessType, billingModel, maxConcurrentCalls, aiReceptionistEnabled, bulkAiCallingEnabled, forceHalt },
      adminEmail,
      adminFullName,
      tenant,
      planId,
      req.user.userId
    );
    return success(res, result, 'Company and initial admin user created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantData = req.body;
    const result = await companyService.updateTenant(id, tenantData);
    return success(res, result, 'Tenant info updated successfully', 200);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getCompanies = async (req, res) => {
  try {
    const companies = await companyService.getCompanies();
    return success(res, companies, 'Companies fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await companyService.getCompanyById(id);
    return success(res, company, 'Company fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const company = await companyService.updateCompany(id, updateData);
    return success(res, company, 'Company updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const company = await companyService.updateCompanyStatus(id, status);
    return success(res, company, `Company status updated to ${status}`);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
