import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrder, deleteOrder } from './order.controller.js';
import { validateCreateOrder, validateUpdateOrder, validateOrderIdParam } from './order.validation.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireCustomerPortal, requirePermission } from '../../middlewares/authorizePermission.js';

const router = Router();

// Orders are primarily for company users (customers)
router.use(protect, requireCustomerPortal);

router.route('/')
  .post(requirePermission('orders:create'), validateCreateOrder, createOrder)
  .get(requirePermission('orders:read'), getOrders);

router.route('/:id')
  .get(requirePermission('orders:read'), validateOrderIdParam, getOrderById)
  .patch(requirePermission('orders:update'), validateUpdateOrder, updateOrder)
  .delete(requirePermission('orders:delete'), validateOrderIdParam, deleteOrder);

export default router;
