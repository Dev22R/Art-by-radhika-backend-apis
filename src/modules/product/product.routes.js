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

const router = express.Router();

/**
 * @route   POST /api/products
 * @desc    Create a new product (Authenticated user required)
 * @access  Private
 */
router.post('/', protect, validateProductInput, createProduct);

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
