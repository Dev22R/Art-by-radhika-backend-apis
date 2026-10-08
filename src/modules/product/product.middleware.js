const Product = require('./product.model');
const mongoose = require('mongoose');

/**
 * Validate incoming Product payload
 */
function validateProductInput(req, res, next) {
  let { name, price, category, rating, purchaseCount } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "name" is required and must be a valid string.',
    });
  }

  const numPrice = Number(price);
  if (price === undefined || isNaN(numPrice) || numPrice < 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "price" is required and must be a positive number.',
    });
  }
  req.body.price = numPrice;

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Product "category" is required.',
    });
  }

  if (rating !== undefined) {
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 0 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Product "rating" must be a number between 0 and 5.',
      });
    }
    req.body.rating = numRating;
  }

  if (purchaseCount !== undefined) {
    const numPurchase = Number(purchaseCount);
    if (isNaN(numPurchase) || numPurchase < 0) {
      return res.status(400).json({
        success: false,
        message: 'Product "purchaseCount" must be a non-negative integer.',
      });
    }
    req.body.purchaseCount = numPurchase;
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
