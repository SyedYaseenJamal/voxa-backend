import express from 'express';
import {
  createCompany,
  getNextTenantId,
  getCompanies,
  getCompanyById,
  updateCompany,
  updateCompanyStatus,
  updateTenant
} from './company.controller.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import {
  validateCreateCompany,
  validateUpdateCompany,
  validateUpdateCompanyStatus,
  validateCompanyIdParam,
  validateUpdateTenant
} from './company.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Companies
 *   description: Company management by Voxa Admin Portal
 */

// All routes require the user to be logged in to the Admin Portal
// and possess the MANAGE_COMPANIES or VIEW_COMPANIES permission accordingly.
router.use(protect, requireAdminPortal);

/**
 * @swagger
 * /companies/next-tenant-id:
 *   get:
 *     summary: Get auto-generated next tenant ID (Voxa-tenant-001 format)
 *     tags: [Companies]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Next tenant ID
 */
router.get(
  '/next-tenant-id',
  requirePermission('companies:create'),
  getNextTenantId
);

/**
 * @swagger
 * /companies:
 *   post:
 *     summary: Create a new company and onboard its initial admin
 *     tags: [Companies]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: "Acme Corp"
 *             billingModel: "prepaid"
 *             adminEmail: "admin@acme.com"
 *             adminFullName: "John Doe"
 *             maxConcurrentCalls: 10
 *             aiReceptionistEnabled: false
 *             bulkAiCallingEnabled: false
 *     responses:
 *       201:
 *         description: Company created with temp password
 */
router.post(
  '/',
  requirePermission('companies:create'),
  validateCreateCompany,
  createCompany
);

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: Get all companies
 *     tags: [Companies]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of companies
 */
router.get(
  '/',
  requirePermission('companies:read'),
  getCompanies
);

/**
 * @swagger
 * /companies/{id}:
 *   get:
 *     summary: Get company by ID
 *     tags: [Companies]
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
 *         description: Company details
 */
router.get(
  '/:id',
  requirePermission('companies:read'),
  validateCompanyIdParam,
  getCompanyById
);

/**
 * @swagger
 * /companies/{id}:
 *   patch:
 *     summary: Update company details
 *     tags: [Companies]
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
 *             name: "Acme Corporation"
 *     responses:
 *       200:
 *         description: Company updated
 */
router.patch(
  '/:id',
  requirePermission('companies:update'),
  validateUpdateCompany,
  updateCompany
);

/**
 * @swagger
 * /companies/{id}/status:
 *   patch:
 *     summary: Change company status (active, suspended, inactive)
 *     tags: [Companies]
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
 *             status: "suspended"
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch(
  '/:id/status',
  requirePermission('companies:update'),
  validateUpdateCompanyStatus,
  updateCompanyStatus
);

/**
 * @swagger
 * /companies/{id}/tenant:
 *   post:
 *     summary: Update company tenant information (soft delete old, create new)
 *     tags: [Companies]
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
 *             tenant_id: "TENANT-123"
 *             contact_name: "Jane Doe"
 *             contact_email: "jane@acme.com"
 *     responses:
 *       200:
 *         description: Tenant info updated
 */
router.post(
  '/:id/tenant',
  requirePermission('companies:update'),
  validateUpdateTenant,
  updateTenant
);

export default router;
