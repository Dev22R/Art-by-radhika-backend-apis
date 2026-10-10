const express = require('express');
const pricingController = require('./pricing.controller');
const { protect, authorize } = require('../user/user.middleware');
const { optionalProtect } = require('../reel/reel.middleware');
const {
  validateCreatePlan,
  validateUpdatePlan,
  validatePlanInquiry,
  validateAdminQuote,
  validateCreateAddon,
  validateCreateCoupon,
  validateCouponCheck,
} = require('./pricing.middleware');
const { uploadAny, handleMulterError } = require('../../middlewares/upload.middleware');

const router = express.Router();

// ==========================================
// 1. PRICING PLANS ROUTES
// ==========================================

// Public: Get all active pricing plans (Cached)
router.get('/plans', pricingController.getActivePlansPublic);

// Admin: Get all plans (Active & Inactive with analytics)
router.get('/plans/admin', protect, authorize('admin'), pricingController.getAllPlansAdmin);

// Public: Get single plan by slug or ID
router.get('/plans/:slugOrId', pricingController.getPlanBySlugOrId);

// Admin: Create new pricing plan
router.post(
  '/plans',
  protect,
  authorize('admin'),
  validateCreatePlan,
  pricingController.createPricingPlan
);

// Admin: Update pricing plan
router.put(
  '/plans/:id',
  protect,
  authorize('admin'),
  validateUpdatePlan,
  pricingController.updatePricingPlan
);

// Admin: Toggle Plan Status (isActive / isPopular)
router.patch(
  '/plans/:id/toggle',
  protect,
  authorize('admin'),
  pricingController.togglePlanStatus
);

// Admin: Delete pricing plan
router.delete(
  '/plans/:id',
  protect,
  authorize('admin'),
  pricingController.deletePricingPlan
);

// ==========================================
// 2. ADD-ON BUILDER & DYNAMIC PRICE CALCULATOR
// ==========================================

// Public: Get all active add-ons for customizer (Cached)
router.get('/addons', pricingController.getActiveAddonsPublic);

// Public / User: 🧮 Interactive Dynamic Price Calculator (Plan + Add-ons + Coupon)
router.post('/calculate', optionalProtect, pricingController.calculateCustomPrice);

// Admin: Get all add-ons
router.get('/addons/admin', protect, authorize('admin'), pricingController.getAllAddonsAdmin);

// Admin: Create add-on
router.post(
  '/addons',
  protect,
  authorize('admin'),
  validateCreateAddon,
  pricingController.createAddon
);

// Admin: Update add-on
router.put(
  '/addons/:id',
  protect,
  authorize('admin'),
  pricingController.updateAddon
);

// Admin: Toggle add-on status
router.patch(
  '/addons/:id/toggle',
  protect,
  authorize('admin'),
  pricingController.toggleAddonStatus
);

// Admin: Delete add-on
router.delete(
  '/addons/:id',
  protect,
  authorize('admin'),
  pricingController.deleteAddon
);

// ==========================================
// 3. PROMO CODES & FESTIVE COUPON ENGINE
// ==========================================

// Public / User: Validate promo coupon against order/plan amount
router.post(
  '/coupons/validate',
  optionalProtect,
  validateCouponCheck,
  pricingController.validateCouponPublic
);

// Admin: Get all coupons with usage statistics
router.get('/coupons/admin', protect, authorize('admin'), pricingController.getAllCouponsAdmin);

// Admin: Create promo coupon
router.post(
  '/coupons',
  protect,
  authorize('admin'),
  validateCreateCoupon,
  pricingController.createCoupon
);

// Admin: Update promo coupon
router.put(
  '/coupons/:id',
  protect,
  authorize('admin'),
  pricingController.updateCoupon
);

// Admin: Toggle promo coupon active status
router.patch(
  '/coupons/:id/toggle',
  protect,
  authorize('admin'),
  pricingController.toggleCouponStatus
);

// Admin: Delete promo coupon
router.delete(
  '/coupons/:id',
  protect,
  authorize('admin'),
  pricingController.deleteCoupon
);

// ==========================================
// 4. PLAN INQUIRIES & CUSTOM REQUESTS (With ⏳ Expiry Timer)
// ==========================================

// Public / User: Submit Plan Inquiry OR Custom Plan Requirements (Supports Attachments, Add-ons & Coupons)
router.post(
  '/inquiries',
  optionalProtect,
  uploadAny(),
  handleMulterError,
  validatePlanInquiry,
  pricingController.createPlanInquiry
);

// User: Get my submitted inquiries & custom requests
router.get('/inquiries/my', protect, pricingController.getMyInquiries);

// User: Get single inquiry details & admin quote (with expiry timer)
router.get('/inquiries/my/:id', protect, pricingController.getMyInquiryById);

// User: Accept or Reject Admin Quote (Enforces Expiration Check)
router.patch('/inquiries/my/:id/respond', protect, pricingController.respondToQuoteUser);

// Admin: Get all submitted plan inquiries & custom requests
router.get(
  '/inquiries/admin',
  protect,
  authorize('admin'),
  pricingController.getAllInquiriesAdmin
);

// Admin: Get full details of an inquiry
router.get(
  '/inquiries/admin/:id',
  protect,
  authorize('admin'),
  pricingController.getInquiryDetailsAdmin
);

// Admin: Send Quotation to Client with ⏳ Validity Timer
router.patch(
  '/inquiries/admin/:id/quote',
  protect,
  authorize('admin'),
  validateAdminQuote,
  pricingController.sendAdminQuote
);

// Admin: Update inquiry status & internal notes
router.patch(
  '/inquiries/admin/:id/status',
  protect,
  authorize('admin'),
  pricingController.updateInquiryStatusAdmin
);

// Admin: Delete inquiry
router.delete(
  '/inquiries/admin/:id',
  protect,
  authorize('admin'),
  pricingController.deleteInquiryAdmin
);

module.exports = router;
