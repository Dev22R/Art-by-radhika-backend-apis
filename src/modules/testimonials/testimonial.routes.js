const express = require('express');
const testimonialController = require('./testimonial.controller');
const { protect, authorize } = require('../user/user.middleware');
const {
  optionalProtect,
  testimonialUpload,
  validateCreateFeedbackUser,
  validateUpdateFeedbackUser,
  validateAdminCreateTestimonial,
  validateAdminUpdateTestimonial,
  validateStatusUpdate,
} = require('./testimonial.middleware');

const router = express.Router();

// ==========================================
// 1. PUBLIC ROUTES (Visitors & All Users)
// ==========================================

/**
 * @route   GET /api/testimonials
 * @desc    Get all active & approved testimonials (Cached in Redis)
 * @access  Public
 */
router.get('/', optionalProtect, testimonialController.getTestimonialsPublic);

// ==========================================
// 2. USER FEEDBACK ROUTES (Authenticated User)
// ==========================================

/**
 * @route   POST /api/testimonials/feedback
 * @alias   POST /api/testimonials
 * @desc    User submits their feedback (Starts in 'pending' status for admin approval)
 * @access  Private (User)
 */
router.post(
  '/feedback',
  protect,
  testimonialUpload,
  validateCreateFeedbackUser,
  testimonialController.submitFeedbackUser
);

/**
 * @route   GET /api/testimonials/my
 * @desc    User views all their submitted feedbacks with current approval status
 * @access  Private (User)
 */
router.get('/my', protect, testimonialController.getMyFeedbacksUser);

/**
 * @route   PUT /api/testimonials/my/:id
 * @desc    User updates their pending feedback (BLOCKED if status is 'approved')
 * @access  Private (User)
 */
router.put(
  '/my/:id',
  protect,
  testimonialUpload,
  validateUpdateFeedbackUser,
  testimonialController.updateFeedbackUser
);

/**
 * @route   DELETE /api/testimonials/my/:id
 * @desc    User deletes their feedback (Allowed anytime: pending, approved, or rejected)
 * @access  Private (User)
 */
router.delete('/my/:id', protect, testimonialController.deleteFeedbackUser);

// ==========================================
// 3. ADMIN ROUTES (Protected - Admin Only)
// ==========================================

/**
 * @route   GET /api/testimonials/admin/all
 * @desc    Admin: Get all testimonials (all statuses, pagination, filters, metrics)
 * @access  Private (Admin)
 */
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  testimonialController.getAllTestimonialsAdmin
);

/**
 * @route   POST /api/testimonials/admin
 * @desc    Admin: Directly create a new testimonial (defaults to approved)
 * @access  Private (Admin)
 */
router.post(
  '/admin',
  protect,
  authorize('admin'),
  testimonialUpload,
  validateAdminCreateTestimonial,
  testimonialController.createTestimonialAdmin
);

/**
 * @route   GET /api/testimonials/admin/:id
 * @desc    Admin: Get full details of a testimonial
 * @access  Private (Admin)
 */
router.get(
  '/admin/:id',
  protect,
  authorize('admin'),
  testimonialController.getTestimonialByIdAdmin
);

/**
 * @route   PUT /api/testimonials/admin/:id
 * @desc    Admin: Update testimonial
 * @access  Private (Admin)
 */
router.put(
  '/admin/:id',
  protect,
  authorize('admin'),
  testimonialUpload,
  validateAdminUpdateTestimonial,
  testimonialController.updateTestimonialAdmin
);

/**
 * @route   PATCH /api/testimonials/admin/:id/status
 * @desc    Admin: Approve, reject, or set pending on a testimonial/user feedback
 * @access  Private (Admin)
 */
router.patch(
  '/admin/:id/status',
  protect,
  authorize('admin'),
  validateStatusUpdate,
  testimonialController.updateTestimonialStatusAdmin
);

/**
 * @route   PATCH /api/testimonials/admin/:id/toggle-active
 * @desc    Admin: Toggle Active / Inactive status
 * @access  Private (Admin)
 */
router.patch(
  '/admin/:id/toggle-active',
  protect,
  authorize('admin'),
  testimonialController.toggleActiveStatusAdmin
);

/**
 * @route   PATCH /api/testimonials/admin/:id/toggle-featured
 * @desc    Admin: Toggle Featured spotlight status
 * @access  Private (Admin)
 */
router.patch(
  '/admin/:id/toggle-featured',
  protect,
  authorize('admin'),
  testimonialController.toggleFeaturedStatusAdmin
);

/**
 * @route   DELETE /api/testimonials/admin/:id
 * @desc    Admin: Delete any testimonial
 * @access  Private (Admin)
 */
router.delete(
  '/admin/:id',
  protect,
  authorize('admin'),
  testimonialController.deleteTestimonialAdmin
);

// ==========================================
// 4. POLITE FALLBACK & SINGLE ITEM ROUTES
// ==========================================

/**
 * Direct POST /api/testimonials fallback for authenticated user or admin
 */
router.post(
  '/',
  protect,
  testimonialUpload,
  (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
      return validateAdminCreateTestimonial(req, res, () =>
        testimonialController.createTestimonialAdmin(req, res, next)
      );
    }
    return validateCreateFeedbackUser(req, res, () =>
      testimonialController.submitFeedbackUser(req, res, next)
    );
  }
);

/**
 * Direct PUT /api/testimonials/:id fallback
 * If admin -> admin update; if normal user -> user feedback update (with approval block check)
 */
router.put(
  '/:id',
  protect,
  testimonialUpload,
  (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
      return validateAdminUpdateTestimonial(req, res, () =>
        testimonialController.updateTestimonialAdmin(req, res, next)
      );
    }
    return validateUpdateFeedbackUser(req, res, () =>
      testimonialController.updateFeedbackUser(req, res, next)
    );
  }
);

/**
 * Direct DELETE /api/testimonials/:id fallback
 * If admin -> admin delete; if normal user -> user feedback delete
 */
router.delete('/:id', protect, (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return testimonialController.deleteTestimonialAdmin(req, res, next);
  }
  return testimonialController.deleteFeedbackUser(req, res, next);
});

/**
 * @route   GET /api/testimonials/:id
 * @desc    Get single approved testimonial by ID
 * @access  Public
 */
router.get('/:id', optionalProtect, testimonialController.getTestimonialByIdPublic);

module.exports = router;
