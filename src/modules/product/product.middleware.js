const Product = require('./product.model');
const mongoose = require('mongoose');

/**
 * Validate incoming Product payload
 */
function validateProductInput(req, res, next) {
  const { name, price, category, rating, purchaseCount } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "name" is required and must be a valid string.',
    });
  }

  if (price === undefined || typeof price !== 'number' || price < 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "price" is required and must be a positive number.',
    });
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "category" is required.',
    });
  }

  if (rating !== undefined && (typeof rating !== 'number' || rating < 0 || rating > 5)) {
    return res.status(400).json({
      success: false,
      message: 'Product "rating" must be a number between 0 and 5.',
    });
  }

  if (purchaseCount !== undefined && (typeof purchaseCount !== 'number' || purchaseCount < 0)) {
    return res.status(400).json({
      success: false,
      message: 'Product "purchaseCount" must be a non-negative integer.',
    });
  }

  next();
}

/**
 * Ensure user owns the product before deleting
 */
async function checkProductOwnership(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    const currentUserId = (req.user._id || req.user.id).toString();
    const productOwnerId = product.user.toString();

    if (currentUserId !== productOwnerId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only delete products created by your account.',
      });
    }

    req.product = product;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateProductInput,
  checkProductOwnership,
};
