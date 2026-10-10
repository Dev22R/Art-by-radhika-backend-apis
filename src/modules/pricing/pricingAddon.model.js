const mongoose = require('mongoose');
const slugify = require('slugify');

const pricingAddonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Add-on name is required'],
      trim: true,
      maxlength: [100, 'Add-on name cannot exceed 100 characters'],
    },

    slug: {
      type: String,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    category: {
      type: String,
      enum: [
        'guest_service',
        'portrait_art',
        'feet_mehndi',
        'henna_kit',
        'artist_upgrade',
        'speed_service',
        'aftercare',
        'other',
      ],
      default: 'other',
      index: true,
    },

    price: {
      type: Number,
      required: [true, 'Add-on price is required'],
      min: [0, 'Price must be non-negative'],
    },

    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },

    unit: {
      type: String,
      enum: ['fixed', 'per_person', 'per_hour', 'per_side', 'per_item'],
      default: 'fixed',
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    icon: {
      type: String,
      default: 'Sparkles', // Lucide icon name for frontend rendering
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

// Auto-generate slug before validation
pricingAddonSchema.pre('validate', function () {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
});

module.exports = mongoose.model('PricingAddon', pricingAddonSchema);
