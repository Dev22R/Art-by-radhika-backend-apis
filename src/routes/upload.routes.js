const express = require('express');
const { uploadSingleFile, uploadMultipleFiles, deleteFile } = require('../controllers/upload.controller');
const { uploadSingle, uploadArray, handleMulterError } = require('../middlewares/upload.middleware');
const { protect } = require('../modules/user/user.middleware');

const router = express.Router();

/**
 * @route   POST /api/upload/single
 * @desc    Upload a single file/image to Cloudinary (up to 200MB)
 * @access  Private / Public
 */
router.post(
  '/single',
  (req, res, next) => {
    // Support either 'file' or 'image' field name
    uploadSingle('file')(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      if (!req.file) {
        // Try 'image' field as fallback
        return uploadSingle('image')(req, res, (err2) => {
          if (err2) return handleMulterError(err2, req, res, next);
          next();
        });
      }
      next();
    });
  },
  uploadSingleFile
);

/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple files/images to Cloudinary (up to 10 files, 200MB each)
 * @access  Private / Public
 */
router.post(
  '/multiple',
  (req, res, next) => {
    uploadArray('files', 10)(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      if (!req.files || !req.files.length) {
        return uploadArray('images', 10)(req, res, (err2) => {
          if (err2) return handleMulterError(err2, req, res, next);
          next();
        });
      }
      next();
    });
  },
  uploadMultipleFiles
);

/**
 * @route   DELETE /api/upload/:publicId
 * @desc    Delete an asset from Cloudinary
 * @access  Private
 */
router.delete('/:publicId', protect, deleteFile);
router.delete('/', protect, deleteFile);

module.exports = router;
