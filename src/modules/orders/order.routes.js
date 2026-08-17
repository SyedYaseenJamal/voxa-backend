import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrder, deleteOrder } from './order.controller.js';
import { validateCreateOrder, validateUpdateOrder, validateOrderIdParam } from './order.validation.js';
import { protect } from '../../middlewares/authenticate.js';
import { requireCustomerPortal } from '../../middlewares/authorizePermission.js';

const router = Router();

// Orders are primarily for company users (customers)
router.use(protect, requireCustomerPortal);

router.route('/')
  .post(validateCreateOrder, createOrder)
  .get(getOrders);

router.route('/:id')
  .get(validateOrderIdParam, getOrderById)
  .patch(validateUpdateOrder, updateOrder)
  .delete(validateOrderIdParam, deleteOrder);

export default router;
