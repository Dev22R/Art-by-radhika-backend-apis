const mongoose = require('mongoose');

const validBookingStatuses = [
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
];

const validPaymentStatuses = [
  'pending',
  'partial',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
];

/**
 * Validate Create Booking Payload
 */
function validateCreateBooking(req, res, next) {
  // Parse JSON strings if submitted via multipart/form-data
  if (typeof req.body.bookingSlots === 'string') {
    try { req.body.bookingSlots = JSON.parse(req.body.bookingSlots); } catch (e) {}
  }
  if (typeof req.body.selectedDesigns === 'string') {
    try { req.body.selectedDesigns = JSON.parse(req.body.selectedDesigns); } catch (e) {}
  }
  if (typeof req.body.selectedPackage === 'string') {
    try { req.body.selectedPackage = JSON.parse(req.body.selectedPackage); } catch (e) {}
  }

  const { addressId, bookingSlots, bookingType } = req.body;

  if (!addressId) {
    return res.status(400).json({
      success: false,
      message: 'addressId is required to book a mehndi service.',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid addressId format.',
    });
  }

  if (!bookingSlots || !Array.isArray(bookingSlots) || bookingSlots.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one bookingSlot (with date and startTime) is required.',
    });
  }

  for (let i = 0; i < bookingSlots.length; i++) {
    const slot = bookingSlots[i];
    if (!slot.date || !slot.startTime) {
      return res.status(400).json({
        success: false,
        message: `bookingSlots[${i}] must contain a valid 'date' and 'startTime'.`,
      });
    }
  }

  const allowedBookingTypes = ['mehndi', 'wedding', 'engagement', 'party', 'other'];
  if (bookingType && !allowedBookingTypes.includes(bookingType.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid bookingType. Allowed types: ${allowedBookingTypes.join(', ')}`,
    });
  }

  next();
}

/**
 * Validate Booking Status Update Payload (Admin)
 */
function validateBookingStatus(req, res, next) {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'status is required.',
    });
  }

  if (!validBookingStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Allowed values: ${validBookingStatuses.join(', ')}`,
    });
  }

  next();
}

/**
 * Validate Payment Status Update Payload (Admin)
 */
function validatePaymentUpdate(req, res, next) {
  const { paymentStatus, paidAmount } = req.body;

  if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
    return res.status(400).json({
      success: false,
      message: `Invalid paymentStatus. Allowed values: ${validPaymentStatuses.join(', ')}`,
    });
  }

  if (paidAmount !== undefined && (typeof paidAmount !== 'number' || paidAmount < 0)) {
    return res.status(400).json({
      success: false,
      message: 'paidAmount must be a non-negative number.',
    });
  }

  next();
}

module.exports = {
  validBookingStatuses,
  validPaymentStatuses,
  validateCreateBooking,
  validateBookingStatus,
  validatePaymentUpdate,
};
