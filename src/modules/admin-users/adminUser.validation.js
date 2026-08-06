import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

// Create a new Voxa staff member (admin portal user)
export const validateCreateAdminUser = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('fullName').isString().notEmpty().withMessage('Full name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('roleId').optional().isMongoId().withMessage('roleId must be a valid Mongo ID'),
  validateRequest
];

export const validateUpdateAdminUser = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('fullName').optional().isString().notEmpty(),
  body('isActive').optional().isBoolean(),
  body('twoFaEnabled').optional().isBoolean(),
  validateRequest
];

export const validateAssignAdminRole = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  body('roleId').isMongoId().withMessage('roleId must be a valid Mongo ID'),
  validateRequest
];

export const validateUserIdParam = [
  param('id').isMongoId().withMessage('Invalid user ID'),
  validateRequest
];
