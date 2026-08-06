import express from 'express';
import {
  signup,
  login,
  refreshToken,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
} from './auth.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import {
  validateSignup,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
} from './auth.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & password management
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *           example:
 *             email: "john.doe@acme.com"
 *             password: "Secure@123"
 *             portal: "admin"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               status: success
 *               message: User registered successfully
 *               data:
 *                 userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                 email: "john.doe@acme.com"
 *                 portal: "admin"
 *       400:
 *         description: Validation error or email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               status: error
 *               message: Email already in use
 */
router.post('/signup', validateSignup, signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login and receive access + refresh tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "john.doe@acme.com"
 *             password: "Secure@123"
 *             portal: "admin"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               status: success
 *               message: Login successful
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   userId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *                   email: "john.doe@acme.com"
 *                   portal: "admin"
 *                   companyId: null
 *                   roleId: null
 *                   permissions: []
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             example:
 *               status: error
 *               message: Invalid credentials
 */
router.post('/login', validateLogin, login);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Get a new access token using a valid refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *           example:
 *             refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Tokens refreshed
 *               data:
 *                 accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout the current user
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Logged out successfully
 *               data: null
 *       401:
 *         description: Unauthorized — missing or invalid token
 */
router.post('/logout', protect, logout);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change current user's password (requires login)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *           example:
 *             oldPassword: "Secure@123"
 *             newPassword: "NewSecure@456"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Password changed successfully
 *               data: null
 *       400:
 *         description: Incorrect old password or validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/change-password', protect, validateChangePassword, changePassword);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset token (sent to console log in dev)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *           example:
 *             email: "john.doe@acme.com"
 *     responses:
 *       200:
 *         description: Reset token sent (check server console in dev mode)
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Password reset token sent (check console logs)
 *               data: null
 *       404:
 *         description: User not found
 */
router.post('/forgot-password', validateForgotPassword, forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token (must be logged in — used inside portal)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *           example:
 *             token: "a3f8c2d1e9b74e6a8f2d3c4b5a6e7f8d9c0b1a2e3d4c5b6a7f8e9d0c1b2a3f4"
 *             newPassword: "Fresh@789"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             example:
 *               status: success
 *               message: Password has been reset successfully
 *               data: null
 *       400:
 *         description: Invalid or expired token
 *       401:
 *         description: Unauthorized — bearer token missing
 */
router.post('/reset-password', protect, validateResetPassword, resetPassword);

export default router;
