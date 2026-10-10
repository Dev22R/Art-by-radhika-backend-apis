const express = require('express');
const categoryController = require('./category.controller');
const { protect, authorize } = require('../user/user.middleware');
const {
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateSubcategory,
  validateUpdateSubcategory,
  validateReorder,
} = require('./category.middleware');
const { uploadAny, handleMulterError } = require('../../middlewares/upload.middleware');

const router = express.Router();

/**
 * Flexible Multer upload for category images
 */
const categoryUpload = (req, res, next) => {
  uploadAny()(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
};

// ==========================================
// ADMIN ROUTES - CATEGORIES
// ==========================================

// Get All Categories (Admin - includes counts & unpublished)
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  categoryController.getAllCategoriesAdmin
);

// Create Category (Admin)
router.post(
  '/',
  protect,
  authorize('admin'),
  categoryUpload,
  handleMulterError,
  validateCreateCategory,
  categoryController.createCategory
);

// Update Category (Admin)
router.put(
  '/:id',
  protect,
  authorize('admin'),
  categoryUpload,
  handleMulterError,
  validateUpdateCategory,
  categoryController.updateCategory
);

// Batch Reorder Categories (Admin)
router.patch(
  '/admin/reorder',
  protect,
  authorize('admin'),
  validateReorder,
  categoryController.reorderCategories
);

// Toggle Publish / Unpublish Category (Admin)
router.patch(
  '/:id/publish',
  protect,
  authorize('admin'),
  categoryController.togglePublishCategory
);

// Toggle Featured Category (Admin)
router.patch(
  '/:id/featured',
  protect,
  authorize('admin'),
  categoryController.toggleFeaturedCategory
);

// Delete Category (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  categoryController.deleteCategory
);

// ==========================================
// ADMIN ROUTES - SUBCATEGORIES
// ==========================================

// Get All Subcategories (Admin)
router.get(
  '/subcategories/admin/all',
  protect,
  authorize('admin'),
  categoryController.getAllSubcategoriesAdmin
);

// Create Subcategory (Admin)
router.post(
  '/subcategories',
  protect,
  authorize('admin'),
  categoryUpload,
  handleMulterError,
  validateCreateSubcategory,
  categoryController.createSubcategory
);

// Update Subcategory (Admin)
router.put(
  '/subcategories/:id',
  protect,
  authorize('admin'),
  categoryUpload,
  handleMulterError,
  validateUpdateSubcategory,
  categoryController.updateSubcategory
);

// Batch Reorder Subcategories (Admin)
router.patch(
  '/subcategories/admin/reorder',
  protect,
  authorize('admin'),
  validateReorder,
  categoryController.reorderSubcategories
);

// Toggle Publish Subcategory (Admin)
router.patch(
  '/subcategories/:id/publish',
  protect,
  authorize('admin'),
  categoryController.togglePublishSubcategory
);

// Delete Subcategory (Admin)
router.delete(
  '/subcategories/:id',
  protect,
  authorize('admin'),
  categoryController.deleteSubcategory
);

// ==========================================
// PUBLIC & USER ROUTES
// ==========================================

// Get Public Categories Tree (Categories + nested active Subcategories)
router.get('/', categoryController.getPublicCategories);

// Get Subcategories for a specific category
router.get('/:categorySlugOrId/subcategories', categoryController.getPublicSubcategories);

// Get Single Category by ID or Slug (with top designs & subcategories)
router.get('/:idOrSlug', categoryController.getPublicCategoryBySlugOrId);

module.exports = router;
