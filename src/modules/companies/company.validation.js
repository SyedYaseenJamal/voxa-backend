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
  body('billingModel').isIn(['prepaid', 'postpaid']).withMessage('billingModel must be prepaid or postpaid'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required for the initial company admin'),
  body('adminFullName').isString().notEmpty().withMessage('Admin full name is required'),
  body('maxConcurrentCalls').optional().isInt({ min: 1 }),
  body('aiReceptionistEnabled').optional().isBoolean(),
  body('bulkAiCallingEnabled').optional().isBoolean(),
  validateRequest
];

export const validateUpdateCompany = [
  param('id').isMongoId().withMessage('Invalid company ID'),
  body('name').optional().isString().notEmpty(),
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
