const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
      maxlength: [120, 'Name cannot exceed 120 characters'],
    },

    designation: {
      type: String,
      trim: true,
      maxlength: [120, 'Designation cannot exceed 120 characters'],
      default: 'Client',
    },

    company: {
      type: String,
      trim: true,
      maxlength: [120, 'Company/Event cannot exceed 120 characters'],
      default: '',
    },

    rating: {
      type: Number,
      required: [true, 'Rating is required (1 to 5)'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      default: 5,
      index: true,
    },

    message: {
      type: String,
      required: [true, 'Testimonial feedback message is required'],
      trim: true,
      minlength: [5, 'Feedback message must be at least 5 characters'],
      maxlength: [2000, 'Feedback message cannot exceed 2000 characters'],
    },

    avatar: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
    },

    // Reference to User if submitted by an authenticated client
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Who created this record ('user' via feedback submission or 'admin' directly)
    source: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },

    // Moderation status: pending -> approved / rejected
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Visibility toggle (active / inactive) controlled by Admin
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Spotlight / featured testimonial on landing page
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Internal admin remarks / rejection feedback for the user
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Admin note cannot exceed 500 characters'],
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal querying
testimonialSchema.index({ isActive: 1, status: 1, sortOrder: 1, createdAt: -1 });
testimonialSchema.index({ user: 1, createdAt: -1 });
testimonialSchema.index({ status: 1, createdAt: -1 });
testimonialSchema.index({ rating: -1, createdAt: -1 });

module.exports = mongoose.model('Testimonial', testimonialSchema);
