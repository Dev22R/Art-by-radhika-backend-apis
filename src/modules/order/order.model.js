const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
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

    // Multiple booking dates
    bookings: [
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
        },

        artistIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Artist',
          },
        ],

        addressId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'UserAddress',
          required: true,
        },

        // Snapshot of address at booking time
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

    items: [
      {
        designId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MehndiDesign',
        },

        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Service',
        },

        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },

        price: {
          type: Number,
          required: true,
          min: 0,
        },

        total: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    subtotal: {
      type: Number,
      required: true,
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

    deliveryOrVisitCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: [
        'pending',
        'partial',
        'paid',
        'failed',
        'refunded',
      ],
      default: 'pending',
    },

    orderStatus: {
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

    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Order', orderSchema);
