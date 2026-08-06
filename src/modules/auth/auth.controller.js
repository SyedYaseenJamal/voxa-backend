import {
  signupUser,
  loginUser,
  refreshAuthToken,
  changeUserPassword,
  requestPasswordReset,
  resetUserPassword,
} from './auth.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const signup = async (req, res) => {
  try {
    const { email, fullName, password, portal } = req.body;
    const user = await signupUser(email, fullName, password, portal);
    return success(res, {
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
      portal: user.portal,
    }, 'User registered successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, portal } = req.body;
    const { user, accessToken, refreshToken } = await loginUser(email, password, portal);
    return success(res, {
      accessToken,
      refreshToken,
      user: {
        userId: user._id,
        email: user.email,
        fullName: user.fullName,
        portal: user.portal,
        companyId: user.companyId,
        roleId: user.roleId,
        permissions: user.roleId ? user.roleId.permissions : []
      },
    }, 'Login successful');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    const tokens = await refreshAuthToken(token);
    return success(res, tokens, 'Tokens refreshed');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const logout = async (req, res) => {
  try {
    return success(res, null, 'Logged out successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await changeUserPassword(req.user.userId, oldPassword, newPassword);
    return success(res, null, 'Password changed successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await requestPasswordReset(email);
    return success(res, null, 'Password reset instructions sent (check console logs)');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

// Reset password — requires bearer token (user must be authenticated)
export const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    await resetUserPassword(req.user.userId, newPassword);
    return success(res, null, 'Password has been reset successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
