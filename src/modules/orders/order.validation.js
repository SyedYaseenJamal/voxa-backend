import { body, param, validationResult } from 'express-validator';
import { error as apiError } from '../../utils/ApiResponse.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return apiError(res, 400, 'Validation Error', errors.array());
  }
  next();
};

export const validateCreateOrder = [
  body('customerDetails').isObject().withMessage('customerDetails is required'),
  body('customerDetails.name').isString().notEmpty().withMessage('customerDetails.name is required'),
  body('customerDetails.email').optional().isEmail(),
  body('customerDetails.phone').optional().isString(),
  
  body('shippingDetails').optional().isObject(),
  body('shippingDetails.address').optional().isString(),
  body('shippingDetails.city').optional().isString(),
  body('shippingDetails.state').optional().isString(),
  body('shippingDetails.zip').optional().isString(),
  body('shippingDetails.country').optional().isString(),
  body('shippingDetails.method').optional().isString(),
  
  body('shippingDate').optional().isISO8601().toDate(),
  body('deliveryDate').optional().isISO8601().toDate(),
  
  body('items').optional().isArray(),
  body('items.*.productName').optional().isString().notEmpty(),
  body('items.*.sku').optional().isString(),
  body('items.*.quantity').optional().isInt({ min: 1 }),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }),
  
  body('pricing').optional().isObject(),
  body('pricing.subtotal').optional().isFloat({ min: 0 }),
  body('pricing.tax').optional().isFloat({ min: 0 }),
  body('pricing.shippingCost').optional().isFloat({ min: 0 }),
  body('pricing.totalAmount').optional().isFloat({ min: 0 }),
  
  body('status').optional().isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'failed', 'refunded']),
  
  validateRequest
];

export const validateUpdateOrder = [
  param('id').isMongoId().withMessage('Invalid order ID'),
  
  body('customerDetails').optional().isObject(),
  body('customerDetails.name').optional().isString().notEmpty(),
  body('customerDetails.email').optional().isEmail(),
  body('customerDetails.phone').optional().isString(),
  
  body('shippingDetails').optional().isObject(),
  body('shippingDetails.address').optional().isString(),
  body('shippingDetails.city').optional().isString(),
  body('shippingDetails.state').optional().isString(),
  body('shippingDetails.zip').optional().isString(),
  body('shippingDetails.country').optional().isString(),
  body('shippingDetails.method').optional().isString(),
  
  body('shippingDate').optional().isISO8601().toDate(),
  body('deliveryDate').optional().isISO8601().toDate(),
  
  body('items').optional().isArray(),
  
  body('pricing').optional().isObject(),
  
  body('status').optional().isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
  body('paymentStatus').optional().isIn(['pending', 'paid', 'failed', 'refunded']),
  
  validateRequest
];

export const validateOrderIdParam = [
  param('id').isMongoId().withMessage('Invalid order ID'),
  validateRequest
];
