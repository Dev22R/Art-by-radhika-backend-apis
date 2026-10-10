const mongoose = require('mongoose');
const slugify = require('slugify');

const pricingPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Pricing plan name is required'],
      trim: true,
      maxlength: [100, 'Plan name cannot exceed 100 characters'],
    },

    slug: {
      type: String,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },

    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: [0, 'Price must be non-negative'],
    },

    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },

    billingType: {
      type: String,
      enum: ['one-time', 'monthly', 'yearly'],
      default: 'one-time',
    },

    features: [
      {
        type: String,
        trim: true,
      },
    ],

    limitations: [
      {
        type: String,
        trim: true,
      },
    ],

    isPopular: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
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

// Auto-generate slug before validation/save if not explicitly provided
pricingPlanSchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

module.exports = mongoose.model('PricingPlan', pricingPlanSchema);
