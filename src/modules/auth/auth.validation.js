import { body, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

export const validateSignup = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('fullName').isString().notEmpty().withMessage('Full name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('portal').isIn(['admin', 'customer']).withMessage('Portal must be admin or customer'),
  validateRequest
];

export const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('portal').isIn(['admin', 'customer']).withMessage('Portal must be admin or customer'),
  validateRequest
];

export const validateChangePassword = [
  body('oldPassword').notEmpty().withMessage('Old password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
  validateRequest
];

export const validateForgotPassword = [
  body('email').isEmail().withMessage('Valid email is required'),
  validateRequest
];

export const validateResetPassword = [
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
  validateRequest
];
