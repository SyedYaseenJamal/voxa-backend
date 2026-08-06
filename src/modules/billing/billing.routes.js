import express from 'express';
import Plan from './plan.model.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';
import { protect } from '../../middlewares/authenticate.js';

const router = express.Router();

/**
 * @swagger
 * /billing/plans:
 *   get:
 *     summary: Get all billing plans
 *     tags: [Billing]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/plans', protect, async (req, res) => {
  try {
    const plans = await Plan.find().lean();
    return success(res, plans, 'Plans fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
});

import { requireAdminPortal, requirePermission } from '../../middlewares/authorizePermission.js';

router.post('/plans', protect, requireAdminPortal, requirePermission('billing:update'), async (req, res) => {
  try {
    const { name, type, cost, duration_type, tokens, ai_receptionist, bulk_ai_calling, max_agents, max_concurrent_calls, is_custom, is_active, description } = req.body;
    const plan = await Plan.create({ 
      name, type, cost, duration_type, tokens, ai_receptionist, bulk_ai_calling, 
      max_agents, max_concurrent_calls, is_custom, is_active, description,
      created_by: req.user.userId
    });
    return success(res, plan, 'Plan created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
});

router.put('/plans/:id', protect, requireAdminPortal, requirePermission('billing:update'), async (req, res) => {
  try {
    const { name, type, cost, duration_type, tokens, ai_receptionist, bulk_ai_calling, max_agents, max_concurrent_calls, is_custom, is_active, description } = req.body;
    const plan = await Plan.findByIdAndUpdate(
      req.params.id, 
      { name, type, cost, duration_type, tokens, ai_receptionist, bulk_ai_calling, max_agents, max_concurrent_calls, is_custom, is_active, description }, 
      { new: true }
    );
    if (!plan) return apiError(res, 404, 'Plan not found');
    return success(res, plan, 'Plan updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
});

router.delete('/plans/:id', protect, requireAdminPortal, requirePermission('billing:update'), async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) return apiError(res, 404, 'Plan not found');
    return success(res, null, 'Plan deleted successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
});

export default router;
