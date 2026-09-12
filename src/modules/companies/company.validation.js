import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

export const validateCreateCompany = [
  body('name').isString().notEmpty().withMessage('Company name is required'),
  body('businessType').optional().isIn(['ecommerce', 'hospital', 'restaurant', 'other']).withMessage('businessType must be one of ecommerce, hospital, restaurant, other'),
  body('billingModel').isIn(['prepaid', 'postpaid']).withMessage('billingModel must be prepaid or postpaid'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required for the initial company admin'),
  body('adminFullName').isString().notEmpty().withMessage('Admin full name is required'),
  body('maxConcurrentCalls').optional().isInt({ min: 1 }),
  body('aiReceptionistEnabled').optional().isBoolean(),
  body('bulkAiCallingEnabled').optional().isBoolean(),
  body('forceHalt').optional().isBoolean(),
  body('planId').isMongoId().withMessage('Valid plan ID is required'),
  body('tenant').isObject().withMessage('Tenant info is required'),
  body('tenant.tenant_id').optional().isString(),
  body('tenant.region').optional().isString(),
  body('tenant.province').optional().isString(),
  body('tenant.address').optional().isString(),
  body('tenant.contact_name').isString().notEmpty().withMessage('Tenant contact name is required'),
  body('tenant.contact_email').isEmail().withMessage('Valid tenant contact email is required'),
  validateRequest
];

export const validateUpdateCompany = [
  param('id').isMongoId().withMessage('Invalid company ID'),
  body('name').optional().isString().notEmpty(),
  body('businessType').optional().isIn(['ecommerce', 'hospital', 'restaurant', 'other']),
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('address').optional().isString(),
  validateRequest
];

export const validateUpdateCompanyStatus = [
  param('id').isMongoId().withMessage('Invalid company ID'),
  body('status').isIn(['active', 'suspended', 'inactive']).withMessage('Status must be active, suspended, or inactive'),
  validateRequest
];

export const validateCompanyIdParam = [
  param('id').isMongoId().withMessage('Invalid company ID'),
  validateRequest
];
export const validateUpdateTenant = [
  param('id').isMongoId().withMessage('Invalid company ID'),
  body('tenant_id').isString().notEmpty().withMessage('Tenant ID is required'),
  body('region').optional().isString(),
  body('province').optional().isString(),
  body('address').optional().isString(),
  body('contact_name').isString().notEmpty().withMessage('Tenant contact name is required'),
  body('contact_email').isEmail().withMessage('Valid tenant contact email is required'),
  validateRequest
];
