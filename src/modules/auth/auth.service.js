import User from './auth.model.js';
import { hashPassword, comparePassword } from '../../utils/bcrypt.js';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt.js';
import AppError from '../../utils/AppError.js';
import crypto from 'crypto';
import { sendMail } from '../../utils/email.js';

export const signupUser = async (email, fullName, password, portal) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('Email already in use', 400);
  }
  const passwordHash = await hashPassword(password);
  const user = await User.create({ email, fullName, passwordHash, portal });
  return user;
};

export const loginUser = async (email, password, portal) => {
  const user = await User.findOne({ email }).populate('roleId');
  if (!user || user.portal !== portal) {
    throw new AppError('Invalid credentials', 401);
  }
  if (!user.isActive || user.status !== 'active') {
    throw new AppError('Account is inactive or suspended', 403);
  }
  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 401);
  }

  const permissions = user.roleId ? user.roleId.permissions : [];

  const payload = {
    userId: user._id,
    portal: user.portal,
    companyId: user.companyId,
    roleId: user.roleId ? user.roleId._id : null,
    permissions
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save();

  return { user, accessToken, refreshToken };
};

export const refreshAuthToken = async (token) => {
  if (!token) throw new AppError('Refresh token required', 401);
  const user = await User.findOne({ refreshToken: token }).populate('roleId');
  if (!user) throw new AppError('Invalid refresh token', 401);
  if (!user.isActive || user.status !== 'active') throw new AppError('Account is inactive', 403);

  const permissions = user.roleId ? user.roleId.permissions : [];

  const payload = {
    userId: user._id,
    portal: user.portal,
    companyId: user.companyId,
    roleId: user.roleId ? user.roleId._id : null,
    permissions
  };
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  user.refreshToken = newRefreshToken;
  await user.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

export const changeUserPassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const isMatch = await comparePassword(oldPassword, user.passwordHash);
  if (!isMatch) throw new AppError('Incorrect old password', 400);

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return true;
};

export const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (!user) throw new AppError('User not found', 404);

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = await hashPassword(resetToken);
  user.passwordResetExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  sendMail(email, 'Password Reset', `Your password reset token is: ${resetToken}`);
  return true;
};

export const resetUserPassword = async (userId, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return true;
};
