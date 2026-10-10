/**
 * Category & Subcategory Validation Middlewares
 */

function validateCreateCategory(req, res, next) {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Category name is required.',
    });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Category name cannot exceed 100 characters.',
    });
  }

  req.body.name = name.trim();
  next();
}

function validateUpdateCategory(req, res, next) {
  const { name } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Category name cannot be empty.',
      });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Category name cannot exceed 100 characters.',
      });
    }
    req.body.name = name.trim();
  }

  next();
}

function validateCreateSubcategory(req, res, next) {
  const { name, categoryId } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Subcategory name is required.',
    });
  }

  if (!categoryId) {
    return res.status(400).json({
      success: false,
      message: 'Parent categoryId is required.',
    });
  }

  req.body.name = name.trim();
  next();
}

function validateUpdateSubcategory(req, res, next) {
  const { name } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Subcategory name cannot be empty.',
      });
    }
    req.body.name = name.trim();
  }

  next();
}

function validateReorder(req, res, next) {
  const { orders } = req.body;

  if (!Array.isArray(orders) || orders.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Orders array containing [{ id, sortOrder }] is required.',
    });
  }

  next();
}

module.exports = {
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateSubcategory,
  validateUpdateSubcategory,
  validateReorder,
};
