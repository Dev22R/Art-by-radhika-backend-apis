const mongoose = require('mongoose');

const planInquirySchema = new mongoose.Schema(
  {
    // Optional logged-in user link
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Contact Information
    name: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },

    // Optional reference to a predefined Pricing Plan
    pricingPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PricingPlan',
      default: null,
    },

    // Type of request: 'plan-inquiry' (asking for standard plan) or 'custom' (user custom requirements)
    requestType: {
      type: String,
      enum: ['plan-inquiry', 'custom'],
      default: 'custom',
      index: true,
    },

    projectTitle: {
      type: String,
      trim: true,
      default: null,
    },

    projectType: {
      type: String,
      trim: true,
      default: 'Other', // e.g. Website, Web App, E-commerce, Mobile App, Mehndi Event, Bridal Package, Custom Artwork
    },

    requirements: {
      type: String,
      trim: true,
      default: null,
    },

    features: [
      {
        type: String,
        trim: true,
      },
    ],

    // Budget range defined by user
    budget: {
      min: {
        type: Number,
        default: null,
      },
      max: {
        type: Number,
        default: null,
      },
      currency: {
        type: String,
        default: 'INR',
        uppercase: true,
      },
    },

    timeline: {
      type: String,
      trim: true,
      default: null, // e.g. '1-2 weeks', '1 month', 'Immediate'
    },

    // Uploaded reference files/docs/images
    attachments: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          default: null,
        },
        originalName: {
          type: String,
          default: null,
        },
      },
    ],

    // Selected Add-ons Snapshot (From Interactive Price Calculator)
    selectedAddons: [
      {
        addon: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PricingAddon',
        },
        name: String,
        price: Number,
        quantity: {
          type: Number,
          default: 1,
        },
        unit: String,
      },
    ],

    // Applied Coupon Snapshot
    appliedCoupon: {
      code: String,
      discountType: String,
      discountValue: Number,
      discountAmount: Number,
    },

    // Calculated / Estimated Total Snapshot
    estimatedTotal: {
      type: Number,
      default: null,
    },

    // Status lifecycle
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'quoted', 'accepted', 'rejected', 'expired', 'completed'],
      default: 'pending',
    },

    // Admin response & quotation
    adminNotes: {
      type: String,
      trim: true,
      default: null,
    },

    quotedPrice: {
      type: Number,
      default: null,
    },

    adminResponse: {
      type: String,
      trim: true,
      default: null,
    },

    quotedAt: {
      type: Date,
      default: null,
    },

    // Quotation Expiry & Urgency Timer
    validityHours: {
      type: Number,
      default: 48, // Default 48 hours validity
    },

    validUntil: {
      type: Date,
      default: null, // Set when quote is sent: quotedAt + validityHours
      index: true,
    },

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: check if quotation has expired
planInquirySchema.virtual('isExpired').get(function () {
  if (this.status === 'quoted' && this.validUntil) {
    return new Date() > new Date(this.validUntil);
  }
  return false;
});

// Virtual: remaining seconds for countdown timer
planInquirySchema.virtual('remainingSeconds').get(function () {
  if (this.status === 'quoted' && this.validUntil) {
    const diff = Math.floor((new Date(this.validUntil) - Date.now()) / 1000);
    return Math.max(0, diff);
  }
  return 0;
});

planInquirySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PlanInquiry', planInquirySchema);
