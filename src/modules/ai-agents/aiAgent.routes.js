// ─── AI Agents Routes ─────────────────────────────────────────────────────────
// Mounted at /api/v1/ai-agents

import { Router } from 'express';
import express from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { requireAdminPortal, requireCustomerPortal, requirePermission } from '../../middlewares/authorizePermission.js';
import {
  // Admin
  adminListConfigs,
  adminGetConfig,
  adminCreateConfig,
  adminUpdateConfig,
  adminDeleteConfig,
  adminSyncConfig,
  adminListCalls,
  adminGetCall,
  adminTriggerCall,
  adminGetRecording,
  // Company
  companyListConfigs,
  companyCreateConfig,
  companyUpdateConfig,
  companyDeleteConfig,
  companySyncConfig,
  companyListCalls,
  companyGetCall,
  companyTriggerCall,
  companyGetRecording,
  // Company Schemas
  companyListSchemas,
  companyCreateSchema,
  companyUpdateSchema,
  companyDeleteSchema,
  // Admin Schemas
  adminListSchemas,
  adminCreateSchema,
  // Webhook
  receiveWebhook,
} from './aiAgent.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: AI Agents (Company Portal)
 *     description: AI Agent receptionist configuration, outbound calling & call log management for Company accounts
 *   - name: AI Agents (Admin Portal)
 *     description: Global AI Agent management & call logs for Voxa Admins
 *   - name: AI Agents (Webhook)
 *     description: Public webhook receiver for AI Pipeline events
 */

// ── PUBLIC: Webhook ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /ai-agents/webhook:
 *   post:
 *     summary: Webhook receiver for Voxa AI Pipeline call events (HMAC verified)
 *     tags: [AI Agents (Webhook)]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: "call.ended"
 *               call_id:
 *                 type: string
 *                 example: "call_abc123"
 *               status:
 *                 type: string
 *                 example: "completed"
 *               duration_seconds:
 *                 type: number
 *                 example: 45
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Invalid HMAC signature
 */
router.post(
  '/webhook',
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  }),
  receiveWebhook,
);

// ── COMPANY routes ─────────────────────────────────────────────────────────────

/**
 * @swagger
 * /ai-agents/company/configs:
 *   get:
 *     summary: List AI Agent configurations for the logged-in company
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of company AI agent configurations
 *   post:
 *     summary: Create a new AI Agent configuration for company
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, language, voice, script]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Sales Receptionist"
 *               language:
 *                 type: string
 *                 example: "en-US"
 *               voice:
 *                 type: string
 *                 example: "nova"
 *               script:
 *                 type: string
 *                 example: "You are an AI receptionist for Voxa. Greet callers politely."
 *               speak_first:
 *                 type: string
 *                 enum: [agent, caller]
 *                 default: agent
 *               greeting_message:
 *                 type: string
 *                 example: "Hello! Thank you for calling Voxa."
 *               call_recording_enabled:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: AI Agent configuration created
 */
router.get(    '/company/configs',      protect, requireCustomerPortal, requirePermission('agents:read'), companyListConfigs);
router.post(   '/company/configs',      protect, requireCustomerPortal, requirePermission('agents:create'), companyCreateConfig);

/**
 * @swagger
 * /ai-agents/company/configs/{id}:
 *   put:
 *     summary: Update an existing AI Agent configuration
 *     tags: [AI Agents (Company Portal)]
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
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Config updated
 *   delete:
 *     summary: Delete an AI Agent configuration
 *     tags: [AI Agents (Company Portal)]
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
 *         description: Config deleted
 */
router.put(    '/company/configs/:id',  protect, requireCustomerPortal, requirePermission('agents:update'), companyUpdateConfig);
router.delete( '/company/configs/:id',  protect, requireCustomerPortal, requirePermission('agents:delete'), companyDeleteConfig);
router.post(   '/company/configs/:id/sync', protect, requireCustomerPortal, requirePermission('agents:update'), companySyncConfig);

/**
 * @swagger
 * /ai-agents/company/calls:
 *   get:
 *     summary: List AI call logs for the logged-in company
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: "completed"
 *     responses:
 *       200:
 *         description: List of company AI call logs
 */
router.get(    '/company/calls',        protect, requireCustomerPortal, requirePermission('agents:read'), companyListCalls);

/**
 * @swagger
 * /ai-agents/company/calls/trigger:
 *   post:
 *     summary: Trigger an outbound AI call to a phone number
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agent_config_id, phone_number, from_number]
 *             properties:
 *               agent_config_id:
 *                 type: string
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *               phone_number:
 *                 type: string
 *                 example: "+923092836265"
 *               from_number:
 *                 type: string
 *                 example: "1002"
 *     responses:
 *       200:
 *         description: Outbound AI call triggered successfully
 */
router.post(   '/company/calls/trigger',protect, requireCustomerPortal, requirePermission('agents:trigger'), companyTriggerCall);

/**
 * @swagger
 * /ai-agents/company/calls/{id}:
 *   get:
 *     summary: Get details & conversation transcript of a company AI call
 *     tags: [AI Agents (Company Portal)]
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
 *         description: Call log details returned
 */
router.get(    '/company/calls/:id',    protect, requireCustomerPortal, requirePermission('agents:read'), companyGetCall);
router.get(    '/company/calls/:id/recording', protect, requireCustomerPortal, requirePermission('agents:read'), companyGetRecording);

/**
 * @swagger
 * /ai-agents/company/schemas:
 *   get:
 *     summary: List Structured Output Schemas available for the company (including defaults)
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of structured output schemas
 *   post:
 *     summary: Create a custom Structured Output Schema for call transcript extraction
 *     tags: [AI Agents (Company Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, json_schema]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Support Ticket Extraction"
 *               json_schema:
 *                 type: object
 *                 example:
 *                   type: "object"
 *                   properties:
 *                     issue_category: { type: "string" }
 *                     resolved: { type: "boolean" }
 *                   required: ["issue_category", "resolved"]
 *     responses:
 *       201:
 *         description: Schema created
 */
router.get(    '/company/schemas',      protect, requireCustomerPortal, requirePermission('agents:read'), companyListSchemas);
router.post(   '/company/schemas',      protect, requireCustomerPortal, requirePermission('agents:create'), companyCreateSchema);

/**
 * @swagger
 * /ai-agents/company/schemas/{id}:
 *   put:
 *     summary: Update a custom Structured Output Schema
 *     tags: [AI Agents (Company Portal)]
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
 *         description: Schema updated
 *   delete:
 *     summary: Delete a custom Structured Output Schema
 *     tags: [AI Agents (Company Portal)]
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
 *         description: Schema deleted
 */
router.put(    '/company/schemas/:id',  protect, requireCustomerPortal, requirePermission('agents:update'), companyUpdateSchema);
router.delete( '/company/schemas/:id',  protect, requireCustomerPortal, requirePermission('agents:delete'), companyDeleteSchema);

// ── ADMIN routes ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /ai-agents/configs:
 *   get:
 *     summary: List all AI Agent configurations across all companies (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of all AI agent configurations
 *   post:
 *     summary: Create an AI Agent configuration for any company (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, language, voice, script]
 *     responses:
 *       201:
 *         description: Config created
 */
router.get(    '/configs',      protect, requireAdminPortal, requirePermission('agents:read'), adminListConfigs);
router.post(   '/configs',      protect, requireAdminPortal, requirePermission('agents:create'), adminCreateConfig);

/**
 * @swagger
 * /ai-agents/configs/{id}:
 *   get:
 *     summary: Get AI Agent config by ID (Admin)
 *     tags: [AI Agents (Admin Portal)]
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
 *         description: Config details
 *   put:
 *     summary: Update AI Agent config by ID (Admin)
 *     tags: [AI Agents (Admin Portal)]
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
 *         description: Config updated
 *   delete:
 *     summary: Delete AI Agent config (Admin)
 *     tags: [AI Agents (Admin Portal)]
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
 *         description: Config deleted
 */
router.get(    '/configs/:id',  protect, requireAdminPortal, requirePermission('agents:read'), adminGetConfig);
router.put(    '/configs/:id',  protect, requireAdminPortal, requirePermission('agents:update'), adminUpdateConfig);
router.delete( '/configs/:id',  protect, requireAdminPortal, requirePermission('agents:delete'), adminDeleteConfig);
router.post(   '/configs/:id/sync', protect, requireAdminPortal, requirePermission('agents:update'), adminSyncConfig);

/**
 * @swagger
 * /ai-agents/calls:
 *   get:
 *     summary: List global AI call logs across all companies (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of global AI call logs
 */
router.get(    '/calls',         protect, requireAdminPortal, requirePermission('agents:read'), adminListCalls);

/**
 * @swagger
 * /ai-agents/calls/trigger:
 *   post:
 *     summary: Trigger outbound AI call (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agent_config_id, phone_number, from_number]
 *     responses:
 *       200:
 *         description: Call triggered
 */
router.post(   '/calls/trigger', protect, requireAdminPortal, requirePermission('agents:trigger'), adminTriggerCall);

/**
 * @swagger
 * /ai-agents/calls/{id}:
 *   get:
 *     summary: Get global AI call log details by ID (Admin)
 *     tags: [AI Agents (Admin Portal)]
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
 *         description: Call details returned
 */
router.get(    '/calls/:id',     protect, requireAdminPortal, requirePermission('agents:read'), adminGetCall);
router.get(    '/calls/:id/recording', protect, requireAdminPortal, requirePermission('agents:read'), adminGetRecording);

/**
 * @swagger
 * /ai-agents/schemas:
 *   get:
 *     summary: List all Structured Output Schemas (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of schemas
 *   post:
 *     summary: Create a Structured Output Schema (Admin)
 *     tags: [AI Agents (Admin Portal)]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, json_schema]
 *     responses:
 *       201:
 *         description: Schema created
 */
router.get(    '/schemas',       protect, requireAdminPortal, requirePermission('agents:read'), adminListSchemas);
router.post(   '/schemas',       protect, requireAdminPortal, requirePermission('agents:create'), adminCreateSchema);

export default router;
