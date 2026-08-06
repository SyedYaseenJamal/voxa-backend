import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

export const validateCreatePermission = [
  body('name').isString().notEmpty().withMessage('Permission name is required (e.g., users:create)'),
  body('module')
    .isString().notEmpty()
    .isIn(['users', 'reports', 'billing', 'calls', 'agents', 'campaigns', 'roles', 'permissions', 'companies', 'did', 'logs'])
    .withMessage('Invalid module'),
  body('action')
    .isString().notEmpty()
    .isIn(['create', 'read', 'update', 'delete', 'export'])
    .withMessage('Action must be one of: create, read, update, delete, export'),
  body('description').optional().isString(),
  body('isSystem').optional().isBoolean(),
  validateRequest
];

export const validateUpdatePermission = [
  param('id').isMongoId().withMessage('Invalid permission ID'),
  body('description').optional().isString().notEmpty(),
  body('module').optional().isString().notEmpty(),
  validateRequest
];

export const validatePermissionIdParam = [
  param('id').isMongoId().withMessage('Invalid permission ID'),
  validateRequest
];
