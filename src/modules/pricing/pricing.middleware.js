const mongoose = require('mongoose');

/**
 * Validate Create Pricing Plan Payload
 */
function validateCreatePlan(req, res, next) {
  const { name, price, billingType } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Plan name is required.',
    });
  }

  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
    return res.status(400).json({
      success: false,
      message: 'Plan price must be a valid non-negative number.',
    });
  }

  if (billingType && !['one-time', 'monthly', 'yearly'].includes(billingType)) {
    return res.status(400).json({
      success: false,
      message: 'billingType must be one of: "one-time", "monthly", "yearly".',
    });
  }

  next();
}

/**
 * Validate Update Pricing Plan Payload
 */
function validateUpdatePlan(req, res, next) {
  const { price, billingType } = req.body;

  if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
    return res.status(400).json({
      success: false,
      message: 'Plan price must be a valid non-negative number.',
    });
  }

  if (billingType && !['one-time', 'monthly', 'yearly'].includes(billingType)) {
    return res.status(400).json({
      success: false,
      message: 'billingType must be one of: "one-time", "monthly", "yearly".',
    });
  }

  next();
}

/**
 * Validate Plan Inquiry / Custom Plan Request Payload
 */
function validatePlanInquiry(req, res, next) {
  const { name, phone, email, pricingPlan, requestType } = req.body;
  const user = req.user;

  // Auto-fill from logged-in user if available
  if (!name && user && user.name) {
    req.body.name = user.name;
  }
  if (!phone && user && user.phone) {
    req.body.phone = user.phone;
  }
  if (!email && user && user.email) {
    req.body.email = user.email;
  }

  if (!req.body.name || typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Contact name is required.',
    });
  }

  if (!req.body.phone || typeof req.body.phone !== 'string' || req.body.phone.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Contact phone number is required.',
    });
  }

  if (pricingPlan && !mongoose.Types.ObjectId.isValid(pricingPlan)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid pricingPlan ID format.',
    });
  }

  if (requestType && !['plan-inquiry', 'custom'].includes(requestType)) {
    return res.status(400).json({
      success: false,
      message: 'requestType must be either "plan-inquiry" or "custom".',
    });
  }

  next();
}

/**
 * Validate Admin Quote Submission
 */
function validateAdminQuote(req, res, next) {
  const { quotedPrice, adminResponse } = req.body;

  if (quotedPrice === undefined || quotedPrice === null || isNaN(Number(quotedPrice)) || Number(quotedPrice) < 0) {
    return res.status(400).json({
      success: false,
      message: 'quotedPrice must be a valid positive number.',
    });
  }

  if (!adminResponse || typeof adminResponse !== 'string' || adminResponse.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'adminResponse / quotation message is required.',
    });
  }

  next();
}

/**
 * Validate Create Add-on Payload
 */
function validateCreateAddon(req, res, next) {
  const { name, price, category, unit } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Add-on name is required.',
    });
  }

  if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
    return res.status(400).json({
      success: false,
      message: 'Add-on price must be a valid non-negative number.',
    });
  }

  const validCategories = [
    'guest_service',
    'portrait_art',
    'feet_mehndi',
    'henna_kit',
    'artist_upgrade',
    'speed_service',
    'aftercare',
    'other',
  ];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Allowed values: ${validCategories.join(', ')}`,
    });
  }

  const validUnits = ['fixed', 'per_person', 'per_hour', 'per_side', 'per_item'];
  if (unit && !validUnits.includes(unit)) {
    return res.status(400).json({
      success: false,
      message: `Invalid unit. Allowed values: ${validUnits.join(', ')}`,
    });
  }

  next();
}

/**
 * Validate Create Coupon Payload
 */
function validateCreateCoupon(req, res, next) {
  const { code, title, discountType, discountValue, validUntil } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Coupon code is required.',
    });
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Coupon title is required.',
    });
  }

  if (!discountType || !['percentage', 'fixed'].includes(discountType)) {
    return res.status(400).json({
      success: false,
      message: 'discountType must be either "percentage" or "fixed".',
    });
  }

  if (discountValue === undefined || isNaN(Number(discountValue)) || Number(discountValue) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'discountValue must be a positive number greater than 0.',
    });
  }

  if (discountType === 'percentage' && Number(discountValue) > 100) {
    return res.status(400).json({
      success: false,
      message: 'Percentage discount cannot exceed 100%.',
    });
  }

  if (!validUntil) {
    return res.status(400).json({
      success: false,
      message: 'Coupon expiry date (validUntil) is required.',
    });
  }

  const expiryDate = new Date(validUntil);
  if (isNaN(expiryDate.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid validUntil date format.',
    });
  }

  if (expiryDate <= new Date()) {
    return res.status(400).json({
      success: false,
      message: 'validUntil must be a future date/time.',
    });
  }

  req.body.code = code.trim().toUpperCase();
  next();
}

/**
 * Validate Validate-Coupon / Validate-Price-Calculator Request
 */
function validateCouponCheck(req, res, next) {
  const { code } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Coupon code is required.',
    });
  }

  req.body.code = code.trim().toUpperCase();
  next();
}

module.exports = {
  validateCreatePlan,
  validateUpdatePlan,
  validatePlanInquiry,
  validateAdminQuote,
  validateCreateAddon,
  validateCreateCoupon,
  validateCouponCheck,
};
