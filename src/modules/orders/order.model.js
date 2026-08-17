import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  sku: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }
});

const OrderSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  customerDetails: {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String }
  },
  shippingDetails: {
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String },
    method: { type: String }
  },
  shippingDate: { type: Date },
  deliveryDate: { type: Date },
  items: [OrderItemSchema],
  pricing: {
    subtotal: { type: Number, required: true, default: 0 },
    tax: { type: Number, default: 0 },
    shippingCost: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 }
  },
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], 
    default: 'pending' 
  },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'paid', 'failed', 'refunded'], 
    default: 'pending' 
  }
}, { timestamps: true });

export default mongoose.model('Order', OrderSchema);
