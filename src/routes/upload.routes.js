const express = require('express');
const { uploadSingleFile, uploadMultipleFiles, deleteFile } = require('../controllers/upload.controller');
const { upload, handleMulterError } = require('../middlewares/upload.middleware');
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
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'profileImage', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      if (req.files) {
        if (req.files.file && req.files.file[0]) req.file = req.files.file[0];
        else if (req.files.image && req.files.image[0]) req.file = req.files.image[0];
        else if (req.files.profileImage && req.files.profileImage[0]) req.file = req.files.profileImage[0];
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
    upload.fields([
      { name: 'files', maxCount: 10 },
      { name: 'images', maxCount: 10 },
    ])(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      if (req.files) {
        const filesList = [
          ...(req.files.files || []),
          ...(req.files.images || []),
        ];
        req.files = filesList;
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
