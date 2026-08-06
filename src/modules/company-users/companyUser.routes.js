import express from 'express';
import {
  createCompanyUser,
  getCompanyUsers,
  getCompanyUserById,
  updateCompanyUser,
  assignCompanyRole,
  deactivateCompanyUser
} from './companyUser.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireCustomerPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import {
  validateCreateCompanyUser,
  validateUpdateCompanyUser,
  validateAssignCompanyRole,
  validateUserIdParam
} from './companyUser.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Company Users
 *   description: User management within a company (Customer Portal)
 */

// All routes: must be authenticated + customer portal
router.use(protect, requireCustomerPortal);

/**
 * @swagger
 * /company-users:
 *   post:
 *     summary: Create a new user within the company
 *     tags: [Company Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: "agent@acme.com"
 *             fullName: "Agent Smith"
 *             password: "Password123"
 *             username: "agent_smith"
 *             phoneNumber: "+1234567890"
 *             roleId: "64f1a2b3c4d5e6f7a8b9c0d1"
 *     responses:
 *       201:
 *         description: Company user created
 *       400:
 *         description: Validation error or email/username already in use
 */
router.post(
  '/',
  requirePermission('users:create'),
  validateCreateCompanyUser,
  createCompanyUser
);

/**
 * @swagger
 * /company-users:
 *   get:
 *     summary: List all users in the company
 *     tags: [Company Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of company users
 */
router.get(
  '/',
  requirePermission('users:read'),
  getCompanyUsers
);

/**
 * @swagger
 * /company-users/{id}:
 *   get:
 *     summary: Get a company user by ID
 *     tags: [Company Users]
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
 *         description: Company user details
 */
router.get(
  '/:id',
  requirePermission('users:read'),
  validateUserIdParam,
  getCompanyUserById
);

/**
 * @swagger
 * /company-users/{id}:
 *   patch:
 *     summary: Update a company user's profile
 *     tags: [Company Users]
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
 *             fullName: "Agent Smith Jr"
 *             status: "active"
 *     responses:
 *       200:
 *         description: Company user updated
 */
router.patch(
  '/:id',
  requirePermission('users:update'),
  validateUpdateCompanyUser,
  updateCompanyUser
);

/**
 * @swagger
 * /company-users/{id}/role:
 *   patch:
 *     summary: Assign a company role to a company user
 *     tags: [Company Users]
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
  validateAssignCompanyRole,
  assignCompanyRole
);

/**
 * @swagger
 * /company-users/{id}:
 *   delete:
 *     summary: Deactivate a company user
 *     tags: [Company Users]
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
  deactivateCompanyUser
);

export default router;
