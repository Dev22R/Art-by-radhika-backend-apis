const express = require('express');
const {
  createProduct,
  getProducts,
  getProductById,
  deleteProduct,
} = require('./product.controller');
const {
  validateProductInput,
  checkProductOwnership,
} = require('./product.middleware');
const { protect } = require('../user/user.middleware');

const { upload, handleMulterError } = require('../../middlewares/upload.middleware');

const router = express.Router();

// Middleware to support either single image or multiple images in multipart/form-data
const productUploadMiddleware = (req, res, next) => {
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'files', maxCount: 10 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    // Flatten req.file and req.files for controller ease
    if (req.files) {
      if (req.files.image && req.files.image[0]) req.file = req.files.image[0];
      else if (req.files.file && req.files.file[0]) req.file = req.files.file[0];

      if (req.files.images) req.files = req.files.images;
      else if (req.files.files) req.files = req.files.files;
      else if (!req.file) req.files = [];
    }
    next();
  });
};

/**
 * @route   POST /api/products
 * @desc    Create a new product with optional image(s) upload (up to 200MB)
 * @access  Private
 */
router.post('/', protect, productUploadMiddleware, validateProductInput, createProduct);

/**
 * @route   GET /api/products
 * @desc    Get all products (Redis cached, query filters supported)
 * @access  Private
 */
router.get('/', protect, getProducts);

/**
 * @route   GET /api/products/:id
 * @desc    Get single product by ID (Redis cached)
 * @access  Private
 */
router.get('/:id', protect, getProductById);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete a product (Only the owner who created it can delete)
 * @access  Private
 */
router.delete('/:id', protect, checkProductOwnership, deleteProduct);

module.exports = router;
