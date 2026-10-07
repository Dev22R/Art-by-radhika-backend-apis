const express = require('express');
const {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  getAllBookingsAdmin,
  updateBookingStatusAdmin,
  assignArtistsAdmin,
  updatePaymentStatusAdmin,
  updateAdminNotes,
} = require('./booking.controller');
const {
  validateCreateBooking,
  validateBookingStatus,
  validatePaymentUpdate,
} = require('./booking.middleware');
const { protect, authorize } = require('../user/user.middleware');

const router = express.Router();

// ==========================================
// ADMIN BOOKING ROUTES (Role: admin)
// (Placed before parameterized :id routes)
// ==========================================

/**
 * @route   GET /api/bookings/admin/all
 * @desc    Get all bookings with filters, search, pagination
 * @access  Private (Admin only)
 */
router.get('/admin/all', protect, authorize('admin'), getAllBookingsAdmin);

/**
 * @route   PATCH /api/bookings/admin/:id/status
 * @desc    Update booking status (pending -> confirmed -> completed / cancelled / rejected)
 * @access  Private (Admin only)
 */
router.patch('/admin/:id/status', protect, authorize('admin'), validateBookingStatus, updateBookingStatusAdmin);

/**
 * @route   PATCH /api/bookings/admin/:id/assign-artists
 * @desc    Assign mehndi artists to booking slot
 * @access  Private (Admin only)
 */
router.patch('/admin/:id/assign-artists', protect, authorize('admin'), assignArtistsAdmin);

/**
 * @route   PATCH /api/bookings/admin/:id/payment
 * @desc    Update booking payment status & paid amount
 * @access  Private (Admin only)
 */
router.patch('/admin/:id/payment', protect, authorize('admin'), validatePaymentUpdate, updatePaymentStatusAdmin);

/**
 * @route   PATCH /api/bookings/admin/:id/admin-notes
 * @desc    Update internal admin notes for booking
 * @access  Private (Admin only)
 */
router.patch('/admin/:id/admin-notes', protect, authorize('admin'), updateAdminNotes);

// ==========================================
// CUSTOMER / USER BOOKING ROUTES
// ==========================================

/**
 * @route   POST /api/bookings
 * @desc    Create a new mehndi booking request
 * @access  Private (Authenticated User)
 */
router.post('/', protect, validateCreateBooking, createBooking);

/**
 * @route   GET /api/bookings
 * @desc    Get current logged in user's bookings (Redis Cached)
 * @access  Private (Authenticated User)
 */
router.get('/', protect, getMyBookings);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get single booking details (Owner or Admin)
 * @access  Private (Owner or Admin)
 */
router.get('/:id', protect, getBookingById);

/**
 * @route   PATCH /api/bookings/:id/cancel
 * @desc    Cancel booking by user
 * @access  Private (Owner)
 */
router.patch('/:id/cancel', protect, cancelBooking);

module.exports = router;
