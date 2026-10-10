const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'FAQ question is required'],
      trim: true,
      maxlength: [500, 'Question cannot exceed 500 characters'],
    },

    answer: {
      type: String,
      required: [true, 'FAQ answer is required'],
      trim: true,
      maxlength: [5000, 'Answer cannot exceed 5000 characters'],
    },

    category: {
      type: String,
      enum: [
        'general',
        'booking',
        'pricing',
        'bridal',
        'mehndi_aftercare',
        'products',
        'cancellation',
        'other',
      ],
      default: 'general',
      index: true,
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    notHelpfulCount: {
      type: Number,
      default: 0,
      min: 0,
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

faqSchema.index({ isPublished: 1, category: 1, sortOrder: 1 });

module.exports = mongoose.model('Faq', faqSchema);
