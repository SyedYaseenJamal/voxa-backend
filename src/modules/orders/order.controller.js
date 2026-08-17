import Order from './order.model.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const createOrder = async (req, res) => {
  try {
    const orderData = req.body;
    orderData.companyId = req.user.companyId;
    
    // Auto-calculate subtotal and totalAmount if items exist
    if (orderData.items && orderData.items.length > 0) {
      const subtotal = orderData.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
      orderData.pricing = orderData.pricing || {};
      orderData.pricing.subtotal = subtotal;
      orderData.pricing.totalAmount = subtotal + (orderData.pricing.tax || 0) + (orderData.pricing.shippingCost || 0);
    }
    
    const order = await Order.create(orderData);
    return success(res, order, 'Order created successfully', 201);
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ companyId: req.user.companyId }).sort({ createdAt: -1 });
    return success(res, orders, 'Orders fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, companyId: req.user.companyId });
    if (!order) return apiError(res, 404, 'Order not found');
    
    return success(res, order, 'Order fetched successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const order = await Order.findOneAndUpdate(
      { _id: id, companyId: req.user.companyId },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!order) return apiError(res, 404, 'Order not found');
    
    return success(res, order, 'Order updated successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!order) return apiError(res, 404, 'Order not found');
    
    return success(res, null, 'Order deleted successfully');
  } catch (err) {
    return apiError(res, err.statusCode || 500, err.message);
  }
};
