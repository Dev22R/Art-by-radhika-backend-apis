const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },

    paymentId: {
      type: String,
      unique: true,
      sparse: true,
    },

    orderPaymentId: {
      type: String,
      default: null,
    },

    provider: {
      type: String,
      enum: ['razorpay', 'stripe', 'cash', 'other'],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: 'INR',
    },

    status: {
      type: String,
      enum: [
        'created',
        'pending',
        'paid',
        'failed',
        'refunded',
        'partially_refunded',
      ],
      default: 'created',
    },

    method: {
      type: String,
      default: null,
    },

    transactionId: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundAmount: {
      type: Number,
      default: 0,
    },

    refundAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
