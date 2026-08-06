import express from 'express';
import {
  createPermission,
  getPermissions,
  updatePermission,
  deletePermission
} from './permission.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal } from '../../middlewares/authorizePermission.js';
import { validateCreatePermission, validateUpdatePermission, validatePermissionIdParam } from './permission.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Permissions
 *   description: Dynamic permission management (Super Admin only)
 */

router.use(protect);

// ── GET PERMISSIONS ──────────────────────────────────
// Both Admin and Customer portals need to be able to fetch permissions to display them
// when creating a role. For now we will allow any authenticated user to fetch the list.
/**
 * @swagger
 * /permissions:
 *   get:
 *     summary: Get all available permissions
 *     tags: [Permissions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all permissions
 */
router.get('/', getPermissions);


// ── SUPER ADMIN ONLY ROUTES ──────────────────────────
// Only Super Admin should be able to create, update, or delete the master permission list.
router.use(requireAdminPortal);
// Note: We might want to require a specific permission like `manage_permissions`, 
// but for now, requireAdminPortal ensures only Voxa staff can do it.

/**
 * @swagger
 * /permissions:
 *   post:
 *     summary: Create a new permission
 *     tags: [Permissions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             key: "manage_billing"
 *             description: "Full access to billing"
 *             module: "billing"
 *     responses:
 *       201:
 *         description: Permission created
 */
router.post('/', validateCreatePermission, createPermission);

/**
 * @swagger
 * /permissions/{id}:
 *   patch:
 *     summary: Update permission details (description, module)
 *     tags: [Permissions]
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
 *             description: "Updated description"
 *     responses:
 *       200:
 *         description: Permission updated
 */
router.patch('/:id', validateUpdatePermission, updatePermission);

/**
 * @swagger
 * /permissions/{id}:
 *   delete:
 *     summary: Delete a permission and cascade remove from roles
 *     tags: [Permissions]
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
 *         description: Permission deleted
 */
router.delete('/:id', validatePermissionIdParam, deletePermission);

export default router;
