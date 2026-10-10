const express = require('express');
const reelController = require('./reel.controller');
const { protect, authorize } = require('../user/user.middleware');
const {
  optionalProtect,
  validateCreateReel,
  validateComment,
  validateBookReelDesign,
} = require('./reel.middleware');
const { uploadAny, handleMulterError } = require('../../middlewares/upload.middleware');

const router = express.Router();

/**
 * Flexible Multer upload middleware for reels.
 * Accepts ANY file field names (e.g. video, file, media, thumbnail, cover, image, designImages, photos)
 * and normalizes them into structured req.files object without LIMIT_UNEXPECTED_FILE errors.
 */
const reelUpload = (req, res, next) => {
  uploadAny()(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);

    if (Array.isArray(req.files) && req.files.length > 0) {
      const organized = {
        video: [],
        thumbnail: [],
        designImages: [],
      };

      req.files.forEach((file) => {
        const field = (file.fieldname || '').toLowerCase();
        const mime = (file.mimetype || '').toLowerCase();

        if (
          field === 'video' ||
          field === 'videofile' ||
          field === 'media' ||
          mime.startsWith('video/')
        ) {
          organized.video.push(file);
        } else if (
          field === 'thumbnail' ||
          field === 'thumb' ||
          field === 'cover' ||
          field === 'poster' ||
          field === 'thumbnailimage'
        ) {
          organized.thumbnail.push(file);
        } else if (
          field === 'designimages' ||
          field === 'designphotos' ||
          field === 'images' ||
          field === 'photos'
        ) {
          organized.designImages.push(file);
        } else if (mime.startsWith('image/')) {
          if (organized.thumbnail.length === 0) {
            organized.thumbnail.push(file);
          } else {
            organized.designImages.push(file);
          }
        } else {
          // Fallback for general file
          organized.video.push(file);
        }
      });

      req.files = organized;
    }

    next();
  });
};

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get All Reels (Admin overview with analytics & filters)
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  reelController.getAllReelsAdmin
);

// Get Comprehensive Reel Details (Admin - Who liked, who commented, who watched, bookings)
router.get(
  '/admin/:id/details',
  protect,
  authorize('admin'),
  reelController.getReelDetailsAdmin
);

// Create / Upload Reel (Admin) - Supports POST /, POST /create, POST /admin, POST /admin/create
router.post(
  ['/', '/create', '/admin', '/admin/create'],
  protect,
  authorize('admin'),
  reelUpload,
  validateCreateReel,
  reelController.createReel
);

// Update Reel (Admin)
router.put(
  '/:id',
  protect,
  authorize('admin'),
  reelUpload,
  reelController.updateReel
);

// Toggle Publish / Unpublish (Admin)
router.patch(
  '/:id/publish',
  protect,
  authorize('admin'),
  reelController.togglePublishReel
);

// Delete Reel (Admin)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  reelController.deleteReel
);

// Admin Delete Any Comment
router.delete(
  '/:id/comments/:commentId/admin',
  protect,
  authorize('admin'),
  reelController.deleteCommentAdmin
);

// ==========================================
// USER / PUBLIC ROUTES
// ==========================================

// Get Reels Feed (Public with optional user personalization)
router.get('/', optionalProtect, reelController.getReelFeed);

// Get Single Reel by ID
router.get('/:id', optionalProtect, reelController.getReelById);

// Track Reel Play / View ("jese hi reel play ho user token se dekho kisne dekha")
router.post('/:id/view', optionalProtect, reelController.trackReelView);

// Toggle Like / Unlike Reel (User)
router.post('/:id/like', protect, reelController.toggleReelLike);

// Track Share (User / Public)
router.post('/:id/share', optionalProtect, reelController.trackReelShare);

// Add Comment on Reel (User)
router.post(
  '/:id/comments',
  protect,
  validateComment,
  reelController.addReelComment
);

// Get Comments of a Reel (Public)
router.get('/:id/comments', reelController.getReelComments);

// Delete User's Own Comment (User)
router.delete(
  '/:id/comments/:commentId',
  protect,
  reelController.deleteUserComment
);

// "Book This Design" From Reel (User)
router.post(
  '/:id/book',
  protect,
  validateBookReelDesign,
  reelController.bookDesignFromReel
);

module.exports = router;
