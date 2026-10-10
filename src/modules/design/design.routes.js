const express = require('express');
const designController = require('./design.controller');
const { protect, authorize } = require('../user/user.middleware');
const {
  optionalProtect,
  validateCreateDesign,
  validateUpdateDesign,
  validateBookDesign,
} = require('./design.middleware');
const { uploadAny, handleMulterError } = require('../../middlewares/upload.middleware');

const router = express.Router();

/**
 * Flexible Multer upload middleware for designs.
 * Accepts ANY file field names (e.g. images, photos, cover, thumbnail, video, reel, file)
 * and normalizes them into structured req.files object.
 */
const designUpload = (req, res, next) => {
  console.log('📦 [Design Route] Entering designUpload middleware...');
  uploadAny()(req, res, (err) => {
    if (err) {
      console.error('❌ [Design Route] Multer upload error:', err);
      return handleMulterError(err, req, res, next);
    }

    const organized = {
      images: [],
      video: [],
      cover: [],
      photos: [],
      designImages: [],
      thumbnail: [],
    };

    if (Array.isArray(req.files) && req.files.length > 0) {
      req.files.forEach((file) => {
        const field = (file.fieldname || '').toLowerCase();
        const mime = (file.mimetype || '').toLowerCase();

        if (
          field === 'video' ||
          field === 'reel' ||
          field === 'videofile' ||
          mime.startsWith('video/')
        ) {
          organized.video.push(file);
        } else if (
          field === 'cover' ||
          field === 'thumbnail' ||
          field === 'coverimage' ||
          field === 'poster'
        ) {
          organized.cover.push(file);
          organized.thumbnail.push(file);
          organized.images.unshift(file);
        } else if (mime.startsWith('image/')) {
          organized.images.push(file);
        } else {
          organized.images.push(file);
        }
      });
    }

    req.files = organized;
    console.log(`✅ [Design Route] designUpload completed. Files parsed: ${organized.images.length} images, ${organized.video.length} videos`);
    next();
  });
};

// ==========================================
// ADMIN ROUTES (/api/designs/admin/*)
// ==========================================

// Get All Designs (Admin overview with analytics & filters)
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  designController.getAllDesignsAdmin
);

// Get Comprehensive Design Details (Admin)
router.get(
  '/admin/:id/details',
  protect,
  authorize('admin'),
  designController.getDesignDetailsAdmin
);

// Create / Upload Design (Admin) - Supports multiple endpoints: POST /, POST /create, POST /admin, POST /admin/create
router.post(
  ['/', '/create', '/admin', '/admin/create'],
  protect,
  authorize('admin'),
  designUpload,
  validateCreateDesign,
  designController.createDesign
);

// Update Design (Admin)
router.put(
  '/:id',
  protect,
  authorize('admin'),
  designUpload,
  validateUpdateDesign,
  designController.updateDesign
);

// Toggle Publish / Unpublish (Admin)
router.patch(
  '/:id/publish',
  protect,
  authorize('admin'),
  designController.togglePublishDesign
);

// Toggle Featured Status (Admin)
router.patch(
  '/:id/featured',
  protect,
  authorize('admin'),
  designController.toggleFeaturedDesign
);

// Toggle Reel Feed Sync Status (Admin)
router.patch(
  '/:id/reel-feed',
  protect,
  authorize('admin'),
  designController.toggleReelFeedSync
);

// Delete Specific Image from Design (Admin)
router.delete(
  '/:id/images/:imageId',
  protect,
  authorize('admin'),
  designController.deleteDesignImage
);

// Delete Design (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  designController.deleteDesign
);

// ==========================================
// PUBLIC & USER ROUTES (/api/designs/*)
// ==========================================

// Get Public Design Catalog (with filters, pagination, sorting)
router.get('/', optionalProtect, designController.getDesignCatalog);

// Get Featured / Trending Designs
router.get('/featured', optionalProtect, designController.getFeaturedDesigns);

// Get Design Categories summary with counts
router.get('/categories', designController.getDesignCategories);

// Get All Unique Design Tags
router.get('/tags', designController.getDesignTags);

// Get Single Design by ID or Slug (Public details + related designs)
router.get('/:idOrSlug', optionalProtect, designController.getDesignByIdOrSlug);

// Like / Unlike Design (User)
router.post('/:id/like', protect, designController.toggleDesignLike);

// Direct Booking Flow: "Book This Design" (User)
router.post(
  '/:id/book',
  protect,
  validateBookDesign,
  designController.bookDesign
);

module.exports = router;
