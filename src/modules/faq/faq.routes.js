const express = require('express');
const faqController = require('./faq.controller');
const { protect, authorize } = require('../user/user.middleware');
const {
  optionalProtect,
  validateCreateFaq,
  validateUpdateFaq,
  validateVoteFaq,
} = require('./faq.middleware');

const router = express.Router();

// ==========================================
// PUBLIC / USER ROUTES
// ==========================================

// Get All Published FAQs (supports category, search, grouped=true, and user vote status if authenticated)
router.get('/', optionalProtect, faqController.getFaqsPublic);

// Get Single FAQ by ID (includes user vote status)
router.get('/:id', optionalProtect, faqController.getFaqById);

// Vote FAQ as Helpful or Not Helpful (Protected)
router.post('/:id/vote', protect, validateVoteFaq, faqController.voteFaqHelpful);

// ==========================================
// ADMIN ROUTES (Protected)
// ==========================================

// Get All FAQs (Admin - includes unpublished, metrics, and voters list)
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  faqController.getAllFaqsAdmin
);

// Get Voters Details for a Specific FAQ (Admin)
router.get(
  '/admin/:id/votes',
  protect,
  authorize('admin'),
  faqController.getFaqVotesAdmin
);

// Batch Reorder FAQs (Admin)
router.patch(
  '/admin/reorder',
  protect,
  authorize('admin'),
  faqController.reorderFaqs
);

// Create New FAQ (Admin)
router.post(
  '/',
  protect,
  authorize('admin'),
  validateCreateFaq,
  faqController.createFaq
);

// Update FAQ (Admin)
router.put(
  '/:id',
  protect,
  authorize('admin'),
  validateUpdateFaq,
  faqController.updateFaq
);

// Toggle FAQ Publish / Unpublish Status (Admin)
router.patch(
  '/:id/publish',
  protect,
  authorize('admin'),
  faqController.togglePublishFaq
);

// Delete FAQ (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  faqController.deleteFaq
);

module.exports = router;
