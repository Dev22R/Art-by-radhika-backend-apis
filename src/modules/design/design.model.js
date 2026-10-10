const mongoose = require('mongoose');

const designSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFORMATION
    // ==========================================
    title: {
      type: String,
      required: [true, 'Design title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    designCode: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [3000, 'Description cannot exceed 3000 characters'],
      default: '',
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },

    category: {
      type: String,
      trim: true,
      lowercase: true,
      default: 'bridal',
      index: true,
    },

    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      default: null,
      index: true,
    },

    subCategory: {
      type: String,
      trim: true,
      default: 'Full Hand',
      index: true,
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    complexity: {
      type: String,
      enum: ['simple', 'medium', 'intricate', 'masterpiece'],
      default: 'intricate',
    },

    placement: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    estimatedTime: {
      type: String,
      default: '2-3 hours',
      trim: true,
    },

    // ==========================================
    // PRICING
    // ==========================================
    price: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative'],
    },

    discountedPrice: {
      type: Number,
      default: null,
      min: [0, 'Discounted price cannot be negative'],
    },

    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },

    // ==========================================
    // MEDIA (MULTIPLE IMAGES + VIDEO / REEL)
    // ==========================================
    images: [
      {
        url: {
          type: String,
          required: [true, 'Image URL is required'],
        },
        publicId: {
          type: String,
          default: null,
        },
        originalName: {
          type: String,
          default: null,
        },
        caption: {
          type: String,
          trim: true,
          default: '',
        },
        isCover: {
          type: Boolean,
          default: false,
        },
        sortOrder: {
          type: Number,
          default: 0,
        },
      },
    ],

    coverImage: {
      type: String,
      default: null,
    },

    video: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
      duration: {
        type: Number, // in seconds
        default: 0,
      },
      format: {
        type: String,
        default: 'mp4',
      },
      bytes: {
        type: Number,
        default: 0,
      },
      width: {
        type: Number,
        default: null,
      },
      height: {
        type: Number,
        default: null,
      },
    },

    // Option to sync this video to the main Reel Feed
    showInReelFeed: {
      type: Boolean,
      default: false,
      index: true,
    },

    linkedReelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reel',
      default: null,
    },

    // ==========================================
    // STATUS & VISIBILITY
    // ==========================================
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    isTrending: {
      type: Boolean,
      default: false,
      index: true,
    },

    isBookable: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    // ==========================================
    // ENGAGEMENT METRICS
    // ==========================================
    likes: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        likedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    likeCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    bookingCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    // ==========================================
    // AUDIT
    // ==========================================
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

// Compound indexes for fast gallery browsing
designSchema.index({ isPublished: 1, category: 1, createdAt: -1 });
designSchema.index({ isPublished: 1, isFeatured: 1 });
designSchema.index({ isPublished: 1, likeCount: -1 });
designSchema.index({ tags: 1, isPublished: 1 });
designSchema.index({ 'likes.userId': 1 });

// Helper to ensure cover image is set before save
designSchema.pre('save', function () {
  if (this.images && this.images.length > 0) {
    const coverObj = this.images.find((img) => img.isCover) || this.images[0];
    if (coverObj && coverObj.url) {
      this.coverImage = coverObj.url;
    }
  }
});

const Design = mongoose.model('Design', designSchema);

// Register alias 'MehndiDesign' if not already registered for legacy Booking schema ref
if (!mongoose.models.MehndiDesign) {
  mongoose.model('MehndiDesign', designSchema);
}

module.exports = Design;
