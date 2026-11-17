const mongoose = require('mongoose');

// Coverage Subschema
const coverageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: [true, 'Coverage slug ID is required'],
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      required: [true, 'Coverage label is required'],
      trim: true,
      maxlength: [150, 'Label cannot exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price in paise is required'],
      min: [0, 'Base price cannot be negative'],
    },
    baseMinutes: {
      type: Number,
      required: [true, 'Base duration in minutes is required'],
      min: [0, 'Base minutes cannot be negative'],
    },
    guestOverride: {
      pricePerGuest: {
        type: Number,
        min: [0, 'Guest price override cannot be negative'],
        default: null,
      },
      minutesPerGuest: {
        type: Number,
        min: [0, 'Guest minutes override cannot be negative'],
        default: null,
      },
    },
    active: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

// Bulk Discount Subschema
const bulkDiscountSchema = new mongoose.Schema(
  {
    minGuests: {
      type: Number,
      required: [true, 'Minimum guests for discount is required'],
      min: [1, 'Minimum guests must be at least 1'],
    },
    percent: {
      type: Number,
      required: [true, 'Discount percent is required'],
      min: [0, 'Discount percent cannot be negative'],
      max: [100, 'Discount percent cannot exceed 100%'],
    },
  },
  { _id: false }
);

// Main Estimator Configuration Schema
const estimatorConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'active',
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
      maxlength: 3,
    },
    coverages: [coverageSchema],
    guestRules: {
      pricePerGuest: {
        type: Number,
        required: [true, 'Global price per guest (paise) is required'],
        min: [0, 'Price per guest cannot be negative'],
        default: 50000, // 500 INR = 50,000 paise
      },
      minutesPerGuest: {
        type: Number,
        required: [true, 'Global minutes per guest is required'],
        min: [0, 'Minutes per guest cannot be negative'],
        default: 30,
      },
      maxGuests: {
        type: Number,
        required: [true, 'Maximum guests allowed is required'],
        min: [1, 'Maximum guests must be at least 1'],
        default: 15,
      },
    },
    bulkDiscounts: [bulkDiscountSchema],
    minimumTotal: {
      type: Number,
      default: 0,
      min: [0, 'Minimum total cannot be negative'],
    },
    tax: {
      percent: {
        type: Number,
        default: 0,
        min: [0, 'Tax percent cannot be negative'],
        max: [100, 'Tax percent cannot exceed 100%'],
      },
      inclusive: {
        type: Boolean,
        default: false,
      },
    },
    timeBufferPercent: {
      type: Number,
      default: 15,
      min: [0, 'Time buffer percent cannot be negative'],
      max: [100, 'Time buffer percent cannot exceed 100%'],
    },
    includesText: {
      type: String,
      trim: true,
      default: 'Includes 100% organic Rajasthani henna, clove steam & aftercare essential balm',
      maxlength: [500, 'Includes text cannot exceed 500 characters'],
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      required: true,
      index: true,
    },
    changeNote: {
      type: String,
      trim: true,
      default: 'Initial configuration',
      maxlength: [500, 'Change note cannot exceed 500 characters'],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Estimator Config Version History Schema (Immutable audit log)
const estimatorConfigHistorySchema = new mongoose.Schema(
  {
    version: {
      type: Number,
      required: true,
      index: true,
    },
    snapshot: {
      type: Object,
      required: true,
    },
    diff: {
      type: Object,
      default: null,
    },
    changeNote: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

estimatorConfigHistorySchema.index({ version: -1, createdAt: -1 });

// Estimator Enquiry Schema (Audit snapshot of quote & customer details)
const estimatorEnquirySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    eventDate: {
      type: Date,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
      maxlength: [200, 'Location cannot exceed 200 characters'],
    },
    notes: {
      type: String,
      trim: true,
      default: null,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    coverageId: {
      type: String,
      required: [true, 'Coverage ID is required'],
      trim: true,
      lowercase: true,
    },
    guests: {
      type: Number,
      required: [true, 'Number of guests is required'],
      min: [1, 'At least 1 person is required'],
    },
    // The immutable server-calculated quote snapshot
    quote: {
      type: Object,
      required: true,
    },
    configVersion: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'booked', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

estimatorEnquirySchema.index({ createdAt: -1, status: 1 });

const EstimatorConfig = mongoose.model('EstimatorConfig', estimatorConfigSchema);
const EstimatorConfigHistory = mongoose.model(
  'EstimatorConfigHistory',
  estimatorConfigHistorySchema
);
const EstimatorEnquiry = mongoose.model('EstimatorEnquiry', estimatorEnquirySchema);

module.exports = {
  EstimatorConfig,
  EstimatorConfigHistory,
  EstimatorEnquiry,
};
