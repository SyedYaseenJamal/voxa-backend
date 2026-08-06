import express from 'express';
import {
  createAdminUser,
  getAdminUsers,
  getAdminUserById,
  updateAdminUser,
  assignAdminRole,
  deactivateAdminUser
} from './adminUser.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import {
  validateCreateAdminUser,
  validateUpdateAdminUser,
  validateAssignAdminRole,
  validateUserIdParam
} from './adminUser.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin Users
 *   description: Voxa internal staff management (Super Admin only)
 */

// All routes: must be authenticated + admin portal
router.use(protect, requireAdminPortal);

/**
 * @swagger
 * /admin-users:
 *   post:
 *     summary: Create a new Voxa staff member
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: "did.manager@voxa.com"
 *             fullName: "David Smith"
 *             password: "Staff@1234"
 *             roleId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       201:
 *         description: Admin user created
 *       400:
 *         description: Validation error or email already in use
 */
router.post(
  '/',
  requirePermission('users:create'),
  validateCreateAdminUser,
  createAdminUser
);

/**
 * @swagger
 * /admin-users:
 *   get:
 *     summary: List all Voxa staff members
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of admin users
 */
router.get(
  '/',
  requirePermission('users:read'),
  getAdminUsers
);

/**
 * @swagger
 * /admin-users/{id}:
 *   get:
 *     summary: Get a Voxa staff member by ID
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Admin user details
 */
router.get(
  '/:id',
  requirePermission('users:read'),
  validateUserIdParam,
  getAdminUserById
);

/**
 * @swagger
 * /admin-users/{id}:
 *   patch:
 *     summary: Update a Voxa staff member's profile
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             fullName: "David R. Smith"
 *             twoFaEnabled: true
 *     responses:
 *       200:
 *         description: Admin user updated
 */
router.patch(
  '/:id',
  requirePermission('users:update'),
  validateUpdateAdminUser,
  updateAdminUser
);

/**
 * @swagger
 * /admin-users/{id}/role:
 *   patch:
 *     summary: Assign a Voxa role to a staff member
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             roleId: "64f1a2b3c4d5e6f7a8b9c0d2"
 *     responses:
 *       200:
 *         description: Role assigned
 */
router.patch(
  '/:id/role',
  requirePermission('users:update'),
  validateAssignAdminRole,
  assignAdminRole
);

/**
 * @swagger
 * /admin-users/{id}:
 *   delete:
 *     summary: Deactivate a Voxa staff member
 *     tags: [Admin Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 */
router.delete(
  '/:id',
  requirePermission('users:delete'),
  validateUserIdParam,
  deactivateAdminUser
);

export default router;
