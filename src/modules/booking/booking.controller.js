const mongoose = require('mongoose');
const Booking = require('./booking.model');
const UserAddress = require('../user/userAddress.model');
const redisService = require('../../services/redis.service');
const { uploadToCloudinary, uploadMultipleToCloudinary } = require('../../services/cloudinary.service');

/**
 * Generate a clean, unique booking reference number
 * e.g., BK-261007-8492
 */
function generateBookingNumber() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `BK-${dateStr}-${randomSuffix}`;
}

/**
 * Helper to invalidate booking caches for a user and admin
 */
async function invalidateBookingCache(userId) {
  try {
    await redisService.delPattern(`bookings:user:${userId}:*`);
    await redisService.delPattern(`bookings:admin:*`);
  } catch (err) {
    console.error('[BookingController] Cache invalidation warning:', err.message);
  }
}

// ==========================================
// USER CONTROLLERS
// ==========================================

/**
 * Create a new Booking (User)
 */
async function createBooking(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const {
      bookingType,
      selectedDesigns,
      selectedPackage,
      referencePhotos,
      customerRequirements,
      specialInstructions,
      bookingSlots,
      addressId,
      eventName,
      brideName,
      groomName,
      numberOfPeople,
      artistCharge = 0,
      travelCharge = 0,
      discount = 0,
      tax = 0,
      notes,
    } = req.body;

    // 1. Fetch and preserve address snapshot
    const address = await UserAddress.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Selected address not found or does not belong to your account.',
      });
    }

    const addressSnapshot = {
      addressLine: address.addressLine,
      area: address.area,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark,
      latitude: address.latitude,
      longitude: address.longitude,
    };

    // Parse JSON fields if coming from multipart/form-data
    let parsedDesigns = selectedDesigns;
    if (typeof selectedDesigns === 'string') {
      try { parsedDesigns = JSON.parse(selectedDesigns); } catch { parsedDesigns = []; }
    }

    let parsedPackage = selectedPackage;
    if (typeof selectedPackage === 'string') {
      try { parsedPackage = JSON.parse(selectedPackage); } catch { parsedPackage = null; }
    }

    let parsedSlots = bookingSlots;
    if (typeof bookingSlots === 'string') {
      try { parsedSlots = JSON.parse(bookingSlots); } catch { parsedSlots = []; }
    }

    let finalReferencePhotos = Array.isArray(referencePhotos) ? [...referencePhotos] : (referencePhotos ? [referencePhotos] : []);

    // Upload any attached reference photos to Cloudinary
    if (req.files && req.files.length) {
      const uploadResults = await uploadMultipleToCloudinary(req.files, {
        folder: 'rp-bookings',
      });
      const uploadedPhotos = uploadResults.map((r, idx) => ({
        url: r.secure_url,
        publicId: r.public_id,
        originalName: req.files[idx] ? req.files[idx].originalname : 'reference-photo',
        uploadedAt: new Date(),
      }));
      finalReferencePhotos = [...finalReferencePhotos, ...uploadedPhotos];
    } else if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'rp-bookings',
      });
      finalReferencePhotos.push({
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalName: req.file.originalname,
        uploadedAt: new Date(),
      });
    }

    // 2. Calculate Pricing
    let designAmount = 0;
    if (Array.isArray(parsedDesigns) && parsedDesigns.length > 0) {
      designAmount = parsedDesigns.reduce((sum, item) => {
        const itemPrice = Number(item.price) || 0;
        const itemQty = Number(item.quantity) || 1;
        return sum + itemPrice * itemQty;
      }, 0);
    }

    const packageAmount = parsedPackage && parsedPackage.price ? Number(parsedPackage.price) : 0;
    const numericArtistCharge = Number(artistCharge) || 0;
    const numericTravelCharge = Number(travelCharge) || 0;
    const numericDiscount = Number(discount) || 0;
    const numericTax = Number(tax) || 0;

    const subtotal = designAmount + packageAmount + numericArtistCharge + numericTravelCharge;
    const totalAmount = Math.max(0, subtotal - numericDiscount + numericTax);

    // 3. Format Booking Slots
    const formattedSlots = (parsedSlots || []).map((slot) => ({
      date: new Date(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime || null,
      artistCount: Number(slot.artistCount) || 1,
      artistIds: slot.artistIds || [],
      status: 'pending',
    }));

    // 4. Create and Save Booking
    const booking = new Booking({
      bookingNumber: generateBookingNumber(),
      userId,
      bookingType: bookingType || 'wedding',
      selectedDesigns: parsedDesigns || [],
      selectedPackage: parsedPackage || null,
      referencePhotos: finalReferencePhotos,
      customerRequirements: customerRequirements || null,
      specialInstructions: specialInstructions || notes || null,
      bookingSlots: formattedSlots,
      addressId,
      addressSnapshot,
      eventName: eventName || null,
      brideName: brideName || null,
      groomName: groomName || null,
      numberOfPeople: Number(numberOfPeople) || 1,
      subtotal,
      packageAmount,
      designAmount,
      artistCharge: numericArtistCharge,
      travelCharge: numericTravelCharge,
      discount: numericDiscount,
      tax: numericTax,
      totalAmount,
      paymentStatus: 'pending',
      paidAmount: 0,
      remainingAmount: totalAmount,
      status: 'pending',
    });

    await booking.save();

    // 5. Invalidate caches & notify
    await invalidateBookingCache(userId);
    await redisService.publish('notifications', {
      event: 'NEW_BOOKING',
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      userId,
      totalAmount,
    });

    res.status(201).json({
      success: true,
      message: 'Booking request created successfully. Status: Pending confirmation.',
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get My Bookings (User)
 */
async function getMyBookings(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { status, bookingType, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const cacheKey = `bookings:user:${userId}:${pageNum}:${limitNum}:${status || 'all'}:${bookingType || 'all'}`;

    // 1. Try Redis cache
    const cachedData = await redisService.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        data: {
          ...cachedData,
          cached: true,
        },
      });
    }

    // 2. Build Query
    const query = { userId };
    if (status) query.status = status;
    if (bookingType) query.bookingType = bookingType;

    const [bookings, total] = await Promise.all([
      Booking.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Booking.countDocuments(query),
    ]);

    const result = {
      bookings,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };

    // 3. Cache in Redis for 120s
    await redisService.set(cacheKey, result, 120);

    res.json({
      success: true,
      data: {
        ...result,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Booking Details (User or Admin)
 */
async function getBookingById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID format.',
      });
    }

    const booking = await Booking.findById(id).populate('userId', 'name phone email profileImage');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    // Authorization check
    if (!isAdmin && booking.userId._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view this booking.',
      });
    }

    res.json({
      success: true,
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel Booking (User)
 */
async function cancelBooking(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const { reason } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or does not belong to your account.',
      });
    }

    const nonCancellableStatuses = ['in_progress', 'completed', 'cancelled', 'rejected'];
    if (nonCancellableStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking cannot be cancelled because its current status is '${booking.status}'.`,
      });
    }

    booking.status = 'cancelled';
    booking.cancellation = {
      cancelledBy: 'user',
      reason: reason || 'Cancelled by customer',
      cancelledAt: new Date(),
    };

    // Update slots status
    booking.bookingSlots.forEach((slot) => {
      slot.status = 'cancelled';
    });

    await booking.save();
    await invalidateBookingCache(userId);

    res.json({
      success: true,
      message: 'Booking has been cancelled successfully.',
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * Get All Bookings (Admin - with search, filtering, and pagination)
 */
async function getAllBookingsAdmin(req, res, next) {
  try {
    const {
      status,
      bookingType,
      paymentStatus,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status) {
      // Support comma-separated statuses: ?status=pending,confirmed
      const statuses = status.split(',').map((s) => s.trim());
      query.status = { $in: statuses };
    }

    if (bookingType) query.bookingType = bookingType;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    if (search) {
      query.$or = [
        { bookingNumber: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { brideName: { $regex: search, $options: 'i' } },
        { groomName: { $regex: search, $options: 'i' } },
        { 'addressSnapshot.city': { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('userId', 'name phone email profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Booking.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Booking Status (Admin: confirm, complete, cancel, reject, reschedule, etc.)
 */
async function updateBookingStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason, adminNotes } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    booking.status = status;

    if (adminNotes !== undefined) {
      booking.adminNotes = adminNotes;
    }

    // Handle cancellation / rejection reasons
    if (status === 'cancelled' || status === 'rejected') {
      booking.cancellation = {
        cancelledBy: 'admin',
        reason: reason || `Booking marked as ${status} by admin`,
        cancelledAt: new Date(),
      };
      booking.bookingSlots.forEach((slot) => {
        slot.status = 'cancelled';
      });
    } else if (status === 'confirmed') {
      booking.bookingSlots.forEach((slot) => {
        if (slot.status === 'pending') slot.status = 'confirmed';
      });
    } else if (status === 'completed') {
      booking.bookingSlots.forEach((slot) => {
        slot.status = 'completed';
      });
    }

    await booking.save();
    await invalidateBookingCache(booking.userId);

    res.json({
      success: true,
      message: `Booking status updated to '${status}' successfully.`,
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Assign Artists to Booking Slots (Admin)
 */
async function assignArtistsAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { slotIndex = 0, artistIds } = req.body;

    if (!Array.isArray(artistIds) || artistIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'artistIds must be a non-empty array of artist ObjectIds.',
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    if (!booking.bookingSlots[slotIndex]) {
      return res.status(400).json({
        success: false,
        message: `Booking slot at index ${slotIndex} does not exist.`,
      });
    }

    // Update artists on slot
    booking.bookingSlots[slotIndex].artistIds = artistIds;
    booking.bookingSlots[slotIndex].status = 'artist_assigned';

    // If all slots have artists assigned, update main status
    const allAssigned = booking.bookingSlots.every((s) => s.artistIds && s.artistIds.length > 0);
    if (allAssigned) {
      booking.status = 'artist_assigned';
    }

    await booking.save();
    await invalidateBookingCache(booking.userId);

    res.json({
      success: true,
      message: 'Artists assigned to booking slot successfully.',
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Payment Details (Admin)
 */
async function updatePaymentStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { paymentStatus, paidAmount } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    if (paymentStatus) booking.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) {
      booking.paidAmount = Number(paidAmount);
      booking.remainingAmount = Math.max(0, booking.totalAmount - booking.paidAmount);
    }

    await booking.save();
    await invalidateBookingCache(booking.userId);

    res.json({
      success: true,
      message: 'Payment information updated successfully.',
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Admin Internal Notes (Admin)
 */
async function updateAdminNotes(req, res, next) {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      id,
      { $set: { adminNotes } },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found.',
      });
    }

    await invalidateBookingCache(booking.userId);

    res.json({
      success: true,
      message: 'Admin notes updated.',
      data: {
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  getAllBookingsAdmin,
  updateBookingStatusAdmin,
  assignArtistsAdmin,
  updatePaymentStatusAdmin,
  updateAdminNotes,
};
