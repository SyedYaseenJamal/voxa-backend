import express from 'express';
import {
  createVoxaRole,
  getVoxaRoles,
  updateVoxaRole,
  deleteVoxaRole,
  createCompanyRole,
  getCompanyRoles,
  updateCompanyRole,
  deleteCompanyRole
} from './role.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requireCustomerPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import { validateCreateRole, validateUpdateRole, validateRoleIdParam } from './role.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management for Voxa staff and Companies
 */

router.use(protect); // All routes require authentication

// ── VOXA ROLES (Admin Portal Only) ──────────────────────────────────

/**
 * @swagger
 * /roles:
 *   post:
 *     summary: Create a Voxa internal role
 *     tags: [Roles]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions]
 *             properties:
 *               name:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *           example:
 *             name: "DID Manager"
 *             permissions: ["did:create", "did:read"]
 *     responses:
 *       201:
 *         description: Role created
 */
router.post(
  '/',
  requireAdminPortal,
  requirePermission('roles:create'),
  validateCreateRole,
  createVoxaRole
);

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Get all Voxa internal roles
 *     tags: [Roles]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get(
  '/',
  requireAdminPortal,
  requirePermission('roles:read'),
  getVoxaRoles
);

/**
 * @swagger
 * /roles/{id}:
 *   patch:
 *     summary: Update a Voxa role
 *     tags: [Roles]
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
 *             name: "Senior DID Manager"
 *     responses:
 *       200:
 *         description: Role updated
 */
router.patch(
  '/:id',
  requireAdminPortal,
  requirePermission('roles:update'),
  validateUpdateRole,
  updateVoxaRole
);

/**
 * @swagger
 * /roles/{id}:
 *   delete:
 *     summary: Delete a Voxa role
 *     tags: [Roles]
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
 *         description: Role deleted
 */
router.delete(
  '/:id',
  requireAdminPortal,
  requirePermission('roles:delete'),
  validateRoleIdParam,
  deleteVoxaRole
);

// ── COMPANY ROLES (Customer Portal Only) ─────────────────────────────

/**
 * @swagger
 * /roles/company:
 *   post:
 *     summary: Create a Company role
 *     tags: [Roles]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: "Billing Manager"
 *             permissions: ["billing:read", "billing:update"]
 *     responses:
 *       201:
 *         description: Role created
 */
router.post(
  '/company',
  requireCustomerPortal,
  requirePermission('roles:create'),
  validateCreateRole,
  createCompanyRole
);

/**
 * @swagger
 * /roles/company:
 *   get:
 *     summary: Get all roles for the authenticated user's company
 *     tags: [Roles]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get(
  '/company',
  requireCustomerPortal,
  requirePermission('roles:read'),
  getCompanyRoles
);

/**
 * @swagger
 * /roles/company/{id}:
 *   patch:
 *     summary: Update a Company role
 *     tags: [Roles]
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
 *             permissions: ["billing:read", "billing:update", "did:read"]
 *     responses:
 *       200:
 *         description: Role updated
 */
router.patch(
  '/company/:id',
  requireCustomerPortal,
  requirePermission('roles:update'),
  validateUpdateRole,
  updateCompanyRole
);

/**
 * @swagger
 * /roles/company/{id}:
 *   delete:
 *     summary: Delete a Company role
 *     tags: [Roles]
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
 *         description: Role deleted
 */
router.delete(
  '/company/:id',
  requireCustomerPortal,
  requirePermission('roles:delete'),
  validateRoleIdParam,
  deleteCompanyRole
);

export default router;
