import { verifyAccessToken } from '../utils/jwt.js';
import { error as apiError } from '../utils/ApiResponse.js';

/**
 * Middleware: Verify JWT access token from Authorization header.
 * Attaches req.user = { userId, role } on success.
 */
export const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiError(res, 401, 'Authorization token missing or malformed');
    }
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return apiError(res, 401, 'Invalid or expired access token');
  }
};
