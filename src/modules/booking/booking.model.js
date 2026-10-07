const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    // ==========================================
    // BOOKING IDENTIFICATION
    // ==========================================
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ==========================================
    // BOOKING TYPE
    // ==========================================
    bookingType: {
      type: String,
      enum: ['mehndi', 'wedding', 'engagement', 'party', 'other'],
      default: 'wedding',
    },

    // ==========================================
    // SELECTED ADMIN DESIGN
    // ==========================================
    selectedDesigns: [
      {
        designId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MehndiDesign',
          required: true,
        },

        // Snapshot at booking time
        designName: {
          type: String,
          required: true,
        },

        designImage: {
          type: String,
          default: null,
        },

        price: {
          type: Number,
          default: 0,
          min: 0,
        },

        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },

        notes: {
          type: String,
          trim: true,
          default: null,
        },
      },
    ],

    // ==========================================
    // WEDDING PACKAGE
    // ==========================================
    selectedPackage: {
      packageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WeddingPackage',
        default: null,
      },

      // Snapshot
      packageName: {
        type: String,
        default: null,
      },

      description: {
        type: String,
        default: null,
      },

      price: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // ==========================================
    // CUSTOM / REFERENCE PHOTOS
    // User can upload multiple images
    // ==========================================
    referencePhotos: [
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

        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ==========================================
    // CUSTOMER REQUIREMENTS
    // ==========================================
    customerRequirements: {
      type: String,
      trim: true,
      default: null,
    },

    specialInstructions: {
      type: String,
      trim: true,
      default: null,
    },

    // ==========================================
    // BOOKING DATES / SLOTS
    // ==========================================
    bookingSlots: [
      {
        date: {
          type: Date,
          required: true,
        },

        startTime: {
          type: String,
          required: true,
        },

        endTime: {
          type: String,
          default: null,
        },

        // Number of artists required
        artistCount: {
          type: Number,
          default: 1,
          min: 1,
        },

        // Assigned artists
        artistIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Artist',
          },
        ],

        status: {
          type: String,
          enum: [
            'pending',
            'confirmed',
            'artist_assigned',
            'in_progress',
            'completed',
            'cancelled',
          ],
          default: 'pending',
        },
      },
    ],

    // ==========================================
    // SERVICE LOCATION
    // ==========================================
    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserAddress',
      required: true,
    },

    // Important:
    // Preserve address at booking time
    addressSnapshot: {
      addressLine: String,
      area: String,
      city: String,
      state: String,
      pincode: String,
      landmark: String,
      latitude: Number,
      longitude: Number,
    },

    // ==========================================
    // GUEST / EVENT INFORMATION
    // ==========================================
    eventName: {
      type: String,
      trim: true,
      default: null,
    },

    brideName: {
      type: String,
      trim: true,
      default: null,
    },

    groomName: {
      type: String,
      trim: true,
      default: null,
    },

    numberOfPeople: {
      type: Number,
      default: 1,
      min: 1,
    },

    // ==========================================
    // PRICE
    // ==========================================
    subtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    packageAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    designAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    artistCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    travelCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    tax: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // ==========================================
    // PAYMENT STATUS
    // ==========================================
    paymentStatus: {
      type: String,
      enum: [
        'pending',
        'partial',
        'paid',
        'failed',
        'refunded',
        'partially_refunded',
      ],
      default: 'pending',
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // MAIN BOOKING STATUS
    // ==========================================
    status: {
      type: String,
      enum: [
        'pending',
        'awaiting_payment',
        'confirmed',
        'artist_assignment_pending',
        'artist_assigned',
        'in_progress',
        'completed',
        'cancelled',
        'rejected',
        'rescheduled',
      ],
      default: 'pending',
      index: true,
    },

    // ==========================================
    // CANCELLATION
    // ==========================================
    cancellation: {
      cancelledBy: {
        type: String,
        enum: ['user', 'admin', 'artist', null],
        default: null,
      },

      reason: {
        type: String,
        default: null,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },
    },

    // ==========================================
    // ADMIN NOTES
    // ==========================================
    adminNotes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Booking', bookingSchema);
