import { error as apiError } from '../utils/ApiResponse.js';

/**
 * Middleware factory: restrict access based on permissions.
 * @param {...string} requiredPermissions - Permissions required to access the route
 */
export const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const userPermissions = req.user?.permissions || [];
    
    // Check if user has ALL required permissions
    const hasPermissions = requiredPermissions.every(perm => userPermissions.includes(perm));
    
    if (!hasPermissions) {
      return apiError(res, 403, `Access denied. Missing required permissions: ${requiredPermissions.join(', ')}`);
    }
    
    next();
  };
};

/**
 * Middleware: ensure user belongs to the admin portal
 */
export const requireAdminPortal = (req, res, next) => {
  if (req.user?.portal !== 'admin') {
    return apiError(res, 403, 'Access denied. Admin portal only.');
  }
  next();
};

/**
 * Middleware: ensure user belongs to the customer portal
 */
export const requireCustomerPortal = (req, res, next) => {
  if (req.user?.portal !== 'customer') {
    return apiError(res, 403, 'Access denied. Customer portal only.');
  }
  next();
};
