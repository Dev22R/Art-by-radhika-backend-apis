const express = require('express');
const faqController = require('./faq.controller');
const { protect, authorize } = require('../user/user.middleware');
const { validateCreateFaq, validateUpdateFaq } = require('./faq.middleware');

const router = express.Router();

// ==========================================
// PUBLIC / USER ROUTES
// ==========================================

// Get All Published FAQs (Cached in Redis - supports category, search, and grouped=true)
router.get('/', faqController.getFaqsPublic);

// Get Single FAQ by ID
router.get('/:id', faqController.getFaqById);

// Vote FAQ as Helpful or Not Helpful
router.post('/:id/vote', faqController.voteFaqHelpful);

// ==========================================
// ADMIN ROUTES (Protected)
// ==========================================

// Get All FAQs (Admin - includes unpublished with metrics)
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  faqController.getAllFaqsAdmin
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
