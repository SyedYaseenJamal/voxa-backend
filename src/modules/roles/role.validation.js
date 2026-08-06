import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';
import { validatePermissions } from '../../lib/getPermissions.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

// Uses the shared DB-driven validator — no hardcoded permission list needed.
const validatePermissionsDb = async (permissions) => {
  if (!Array.isArray(permissions)) return true;
  await validatePermissions(permissions); // throws if any are invalid
  return true;
};

export const validateCreateRole = [
  body('name').notEmpty().withMessage('Role name is required').isString(),
  body('permissions').isArray().withMessage('Permissions must be an array').custom(validatePermissionsDb),
  validateRequest
];

export const validateUpdateRole = [
  param('id').isMongoId().withMessage('Invalid role ID'),
  body('name').optional().isString().notEmpty().withMessage('Role name cannot be empty'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array').custom(validatePermissionsDb),
  validateRequest
];

export const validateRoleIdParam = [
  param('id').isMongoId().withMessage('Invalid role ID'),
  validateRequest
];
