const express = require('express');
const estimatorController = require('./estimator.controller');
const { protect, authorize } = require('../user/user.middleware');
const { optionalProtect } = require('../testimonials/testimonial.middleware');
const {
  validateCalculate,
  validateEnquiry,
  validateAdminConfig,
  validateAdminPreview,
} = require('./estimator.validation');
const {
  calculateLimiter,
  enquiryLimiter,
  requireActiveEstimator,
  sanitizeEstimatorInput,
} = require('./estimator.middleware');

// Public Router (mounted at /estimator)
const publicRouter = express.Router();

/**
 * @route   GET /api/v1/estimator/config
 * @desc    Get active coverages (id, label), maxGuests, currency, maintenance status.
 * @access  Public (No prices exposed)
 */
publicRouter.get('/config', requireActiveEstimator, estimatorController.getPublicConfig);

/**
 * @route   POST /api/v1/estimator/calculate
 * @desc    Calculate package price, duration range, and detailed breakdown.
 * @access  Public (Rate limited: ~60/min)
 */
publicRouter.post(
  '/calculate',
  calculateLimiter,
  sanitizeEstimatorInput,
  validateCalculate,
  requireActiveEstimator,
  estimatorController.calculateQuote
);

/**
 * @route   POST /api/v1/estimator/enquiry
 * @desc    Submit customer enquiry with server-recalculated immutable quote.
 * @access  Public / Optional Auth (Rate limited: ~5/min)
 */
publicRouter.post(
  '/enquiry',
  enquiryLimiter,
  optionalProtect,
  sanitizeEstimatorInput,
  validateEnquiry,
  requireActiveEstimator,
  estimatorController.submitEnquiry
);

// Admin Router (mounted at /admin/estimator and aliased at /estimator/admin)
const adminRouter = express.Router();

// Enforce Admin Authentication & Role
adminRouter.use(protect, authorize('admin'));

/**
 * @route   GET /api/v1/admin/estimator/config
 * @desc    Admin: Get complete pricing & duration rules configuration
 * @access  Private (Admin)
 */
adminRouter.get('/config', estimatorController.getAdminConfig);

/**
 * @route   PUT /api/v1/admin/estimator/config
 * @desc    Admin: Full config update with optimistic locking (version) & audit diff log
 * @access  Private (Admin)
 */
adminRouter.put(
  '/config',
  sanitizeEstimatorInput,
  validateAdminConfig,
  estimatorController.updateAdminConfig
);

/**
 * @route   GET /api/v1/admin/estimator/config/history
 * @desc    Admin: Get version change history and audit diff log
 * @access  Private (Admin)
 */
adminRouter.get('/config/history', estimatorController.getConfigHistory);

/**
 * @route   POST /api/v1/admin/estimator/config/rollback/:version
 * @desc    Admin: Rollback to previous config version
 * @access  Private (Admin)
 */
adminRouter.post('/config/rollback/:version', estimatorController.rollbackConfigVersion);

/**
 * @route   POST /api/v1/admin/estimator/preview
 * @desc    Admin: Test calculate against a draft config without saving to database
 * @access  Private (Admin)
 */
adminRouter.post(
  '/preview',
  sanitizeEstimatorInput,
  validateAdminPreview,
  estimatorController.previewDraftConfig
);

module.exports = {
  publicRouter,
  adminRouter,
};
