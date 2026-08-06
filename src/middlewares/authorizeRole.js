import { error as apiError } from '../utils/ApiResponse.js';

/**
 * Middleware factory: restrict access to specific roles.
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'customer')
 */
export const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return apiError(res, 403, `Access denied. Required role(s): ${roles.join(', ')}`);
    }
    next();
  };
};
