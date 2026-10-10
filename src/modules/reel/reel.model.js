const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema(
  {
    // ==========================================
    // BASIC INFORMATION
    // ==========================================
    title: {
      type: String,
      required: [true, 'Reel title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    // ==========================================
    // MEDIA ASSETS (VIDEO & THUMBNAIL)
    // ==========================================
    video: {
      url: {
        type: String,
        required: [true, 'Video URL is required'],
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

    thumbnail: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
    },

    // ==========================================
    // ADMIN DESIGN ATTACHED (BOOK THIS DESIGN)
    // ==========================================
    adminDesign: {
      designName: {
        type: String,
        required: [true, 'Design name is required for reel'],
        trim: true,
      },
      designCode: {
        type: String,
        trim: true,
        default: null,
      },
      category: {
        type: String,
        trim: true,
        default: 'bridal',
      },
      price: {
        type: Number,
        default: 0,
        min: 0,
      },
      discountedPrice: {
        type: Number,
        default: null,
        min: 0,
      },
      estimatedTime: {
        type: String,
        default: '2-3 hours',
      },
      images: [
        {
          type: String, // Photo URLs of the design
        },
      ],
      description: {
        type: String,
        default: '',
      },
      isBookable: {
        type: Boolean,
        default: true,
      },
    },

    // ==========================================
    // PUBLISHING & STATUS
    // ==========================================
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },

    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: Date.now,
    },

    // ==========================================
    // USER ENGAGEMENT: LIKES
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

    // ==========================================
    // USER ENGAGEMENT: VIEWS (KISNE DEKHA / WATCH TRACKING)
    // ==========================================
    views: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        userPhone: {
          type: String,
          default: null,
        },
        userName: {
          type: String,
          default: null,
        },
        ip: {
          type: String,
          default: null,
        },
        userAgent: {
          type: String,
          default: null,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
        watchDuration: {
          type: Number, // in seconds
          default: 0,
        },
      },
    ],

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    uniqueViewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // USER ENGAGEMENT: SHARES
    // ==========================================
    shares: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        platform: {
          type: String,
          default: 'direct', // whatsapp, instagram, copy_link, etc.
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // USER ENGAGEMENT: COMMENTS
    // ==========================================
    comments: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        text: {
          type: String,
          required: [true, 'Comment text is required'],
          trim: true,
          maxlength: [1000, 'Comment cannot exceed 1000 characters'],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    commentCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // CONVERSIONS / BOOKINGS GENERATED
    // ==========================================
    bookingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // CREATOR AUDIT
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

// Compound Indexes for fast feed queries
reelSchema.index({ isPublished: 1, status: 1, createdAt: -1 });
reelSchema.index({ isPublished: 1, likeCount: -1 });
reelSchema.index({ isPublished: 1, viewCount: -1 });
reelSchema.index({ tags: 1, isPublished: 1 });
reelSchema.index({ 'likes.userId': 1 });
reelSchema.index({ 'views.userId': 1 });

module.exports = mongoose.model('Reel', reelSchema);
