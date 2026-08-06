import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

// Create a company user — company admin creates users within their company
// Schema ref: company_users table
export const validateCreateCompanyUser = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('fullName').isString().notEmpty().withMessage('Full name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('username').optional().isString().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('phoneNumber').optional().isString(),
  body('roleId').optional().isMongoId().withMessage('roleId must be a valid Mongo ID'),
  validateRequest
];

export const validateUpdateCompanyUser = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('fullName').optional().isString().notEmpty(),
  body('phoneNumber').optional().isString(),
  body('username').optional().isString().isLength({ min: 3 }),
  body('status').optional().isIn(['active', 'suspended', 'inactive']).withMessage('Invalid status'),
  validateRequest
];

export const validateAssignCompanyRole = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('roleId').isMongoId().withMessage('roleId must be a valid Mongo ID'),
  validateRequest
];

export const validateUserIdParam = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  validateRequest
];
