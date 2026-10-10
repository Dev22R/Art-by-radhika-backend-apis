const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },

    title: {
      type: String,
      trim: true,
      required: [true, 'Coupon title is required'],
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'discountType is required ("percentage" or "fixed")'],
      default: 'percentage',
    },

    discountValue: {
      type: Number,
      required: [true, 'discountValue is required'],
      min: [1, 'discountValue must be at least 1'],
    },

    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxDiscountAmount: {
      type: Number,
      default: null, // Cap for percentage discount (e.g. max ₹3000 off)
      min: 0,
    },

    validFrom: {
      type: Date,
      default: Date.now,
    },

    validUntil: {
      type: Date,
      required: [true, 'Coupon expiry date (validUntil) is required'],
      index: true,
    },

    usageLimit: {
      type: Number,
      default: null, // Total global usage limit (null = unlimited)
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1, // Number of times a single user can redeem this coupon
      min: 1,
    },

    usedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        orderAmount: Number,
        discountGiven: Number,
      },
    ],

    applicablePlans: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PricingPlan',
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ code: 1, isActive: 1, validUntil: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
