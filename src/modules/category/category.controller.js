const mongoose = require('mongoose');
const { Category, Subcategory } = require('./category.model');
const Design = require('../design/design.model');
const redisService = require('../../services/redis.service');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../../services/cloudinary.service');

/**
 * Invalidate Redis caches related to categories and designs
 */
async function invalidateCategoryCache() {
  try {
    await Promise.all([
      redisService.delPattern('categories:*'),
      redisService.delPattern('designs:*'),
    ]);
  } catch (err) {
    console.error('[CategoryController] Cache invalidation warning:', err.message);
  }
}

/**
 * Helper to generate URL-safe slug
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

// ==========================================
// CATEGORY CONTROLLERS (ADMIN)
// ==========================================

/**
 * Create Category (Admin)
 */
async function createCategory(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      name,
      slug: customSlug,
      description = '',
      icon = null,
      sortOrder = 0,
      isPublished = true,
      isFeatured = false,
      imageUrl,
    } = req.body;

    let baseSlug = customSlug ? slugify(customSlug) : slugify(name);
    let finalSlug = baseSlug;

    // Check slug uniqueness
    const existing = await Category.findOne({ slug: finalSlug });
    if (existing) {
      finalSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // Process image
    let imageData = {
      url: imageUrl || null,
      publicId: null,
    };

    if (req.file || (req.files && (req.files.image || req.files.file))) {
      const fileToUpload = req.file || (req.files.image ? req.files.image[0] : req.files.file[0]);
      const uploadRes = await uploadToCloudinary(fileToUpload.buffer, {
        folder: 'rp-categories/main',
      });
      imageData = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    }

    const category = new Category({
      name: name.trim(),
      slug: finalSlug,
      description: description.trim(),
      image: imageData,
      icon: icon ? icon.trim() : null,
      sortOrder: Number(sortOrder) || 0,
      isPublished: isPublished !== undefined ? isPublished === true || isPublished === 'true' : true,
      isFeatured: isFeatured === true || isFeatured === 'true',
      createdBy: adminId,
    });

    await category.save();
    await invalidateCategoryCache();

    res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: { category },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Category (Admin)
 */
async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      slug: customSlug,
      description,
      icon,
      sortOrder,
      isPublished,
      isFeatured,
      imageUrl,
    } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    if (name && name.trim() !== category.name) {
      category.name = name.trim();
      if (!customSlug) {
        const baseSlug = slugify(name);
        const existing = await Category.findOne({ slug: baseSlug, _id: { $ne: id } });
        category.slug = existing ? `${baseSlug}-${Math.floor(100 + Math.random() * 900)}` : baseSlug;
      }
    }

    if (customSlug) {
      category.slug = slugify(customSlug);
    }

    if (description !== undefined) category.description = description.trim();
    if (icon !== undefined) category.icon = icon ? icon.trim() : null;
    if (sortOrder !== undefined) category.sortOrder = Number(sortOrder);
    if (isPublished !== undefined)
      category.isPublished = isPublished === true || isPublished === 'true';
    if (isFeatured !== undefined)
      category.isFeatured = isFeatured === true || isFeatured === 'true';

    // Handle Image upload / update
    if (req.file || (req.files && (req.files.image || req.files.file))) {
      const fileToUpload = req.file || (req.files.image ? req.files.image[0] : req.files.file[0]);
      if (category.image && category.image.publicId) {
        deleteFromCloudinary(category.image.publicId, 'image').catch((e) =>
          console.warn('Old category image delete warning:', e.message)
        );
      }
      const uploadRes = await uploadToCloudinary(fileToUpload.buffer, {
        folder: 'rp-categories/main',
      });
      category.image = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    } else if (imageUrl) {
      category.image = {
        url: imageUrl,
        publicId: null,
      };
    }

    await category.save();
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Category updated successfully.',
      data: { category },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Category (Admin)
 */
async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    // Check if any designs are using this category
    const linkedDesignsCount = await Design.countDocuments({
      $or: [{ categoryId: id }, { category: category.slug }],
    });

    if (linkedDesignsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category because ${linkedDesignsCount} design(s) are attached to it. Reassign or delete those designs first.`,
      });
    }

    // Delete category image from Cloudinary
    if (category.image && category.image.publicId) {
      deleteFromCloudinary(category.image.publicId, 'image').catch((e) =>
        console.warn('Category image delete warning:', e.message)
      );
    }

    // Delete subcategories under this category
    await Subcategory.deleteMany({ categoryId: id });

    await Category.findByIdAndDelete(id);
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Category and its subcategories deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Publish / Unpublish Category (Admin)
 */
async function togglePublishCategory(req, res, next) {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    category.isPublished = !category.isPublished;
    await category.save();
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: `Category has been ${category.isPublished ? 'published' : 'unpublished'} successfully.`,
      data: {
        id: category._id,
        isPublished: category.isPublished,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Featured Category (Admin)
 */
async function toggleFeaturedCategory(req, res, next) {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    category.isFeatured = !category.isFeatured;
    await category.save();
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: `Category ${category.isFeatured ? 'marked as featured' : 'removed from featured'}.`,
      data: {
        id: category._id,
        isFeatured: category.isFeatured,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Batch Reorder Categories (Admin)
 */
async function reorderCategories(req, res, next) {
  try {
    const { orders } = req.body;

    const bulkOps = orders.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: Number(item.sortOrder) || 0 } },
      },
    }));

    await Category.bulkWrite(bulkOps);
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Categories reordered successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Categories (Admin - includes counts & unpublished)
 */
async function getAllCategoriesAdmin(req, res, next) {
  try {
    const { search, isPublished } = req.query;

    const query = {};
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const categories = await Category.find(query)
      .populate('createdBy', 'name email phone')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    // Attach real-time subcategory count & design count
    const categoryIds = categories.map((c) => c._id);

    const [subCounts, designCounts] = await Promise.all([
      Subcategory.aggregate([
        { $match: { categoryId: { $in: categoryIds } } },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      ]),
      Design.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    const subCountMap = {};
    subCounts.forEach((s) => {
      subCountMap[s._id.toString()] = s.count;
    });

    const designCountMap = {};
    designCounts.forEach((d) => {
      designCountMap[d._id] = d.count;
    });

    const enrichedCategories = categories.map((cat) => ({
      ...cat,
      subcategoriesCount: subCountMap[cat._id.toString()] || 0,
      designCount: designCountMap[cat.slug] || cat.designCount || 0,
    }));

    res.json({
      success: true,
      data: {
        total: enrichedCategories.length,
        categories: enrichedCategories,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// SUBCATEGORY CONTROLLERS (ADMIN)
// ==========================================

/**
 * Create Subcategory (Admin)
 */
async function createSubcategory(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      name,
      categoryId,
      slug: customSlug,
      description = '',
      sortOrder = 0,
      isPublished = true,
      imageUrl,
    } = req.body;

    const parentCategory = await Category.findById(categoryId);
    if (!parentCategory) {
      return res.status(404).json({
        success: false,
        message: 'Parent category not found.',
      });
    }

    let baseSlug = customSlug ? slugify(customSlug) : slugify(name);
    let finalSlug = baseSlug;

    const existing = await Subcategory.findOne({ categoryId, slug: finalSlug });
    if (existing) {
      finalSlug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    let imageData = {
      url: imageUrl || null,
      publicId: null,
    };

    if (req.file || (req.files && (req.files.image || req.files.file))) {
      const fileToUpload = req.file || (req.files.image ? req.files.image[0] : req.files.file[0]);
      const uploadRes = await uploadToCloudinary(fileToUpload.buffer, {
        folder: 'rp-categories/sub',
      });
      imageData = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    }

    const subcategory = new Subcategory({
      name: name.trim(),
      slug: finalSlug,
      categoryId,
      description: description.trim(),
      image: imageData,
      sortOrder: Number(sortOrder) || 0,
      isPublished: isPublished !== undefined ? isPublished === true || isPublished === 'true' : true,
      createdBy: adminId,
    });

    await subcategory.save();
    await invalidateCategoryCache();

    res.status(201).json({
      success: true,
      message: 'Subcategory created successfully.',
      data: { subcategory },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Subcategory (Admin)
 */
async function updateSubcategory(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      categoryId,
      slug: customSlug,
      description,
      sortOrder,
      isPublished,
      imageUrl,
    } = req.body;

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found.',
      });
    }

    if (categoryId && categoryId.toString() !== subcategory.categoryId.toString()) {
      const parentExists = await Category.findById(categoryId);
      if (!parentExists) {
        return res.status(404).json({
          success: false,
          message: 'Target parent category not found.',
        });
      }
      subcategory.categoryId = categoryId;
    }

    if (name && name.trim() !== subcategory.name) {
      subcategory.name = name.trim();
      if (!customSlug) {
        subcategory.slug = slugify(name);
      }
    }

    if (customSlug) {
      subcategory.slug = slugify(customSlug);
    }

    if (description !== undefined) subcategory.description = description.trim();
    if (sortOrder !== undefined) subcategory.sortOrder = Number(sortOrder);
    if (isPublished !== undefined)
      subcategory.isPublished = isPublished === true || isPublished === 'true';

    // Handle image upload
    if (req.file || (req.files && (req.files.image || req.files.file))) {
      const fileToUpload = req.file || (req.files.image ? req.files.image[0] : req.files.file[0]);
      if (subcategory.image && subcategory.image.publicId) {
        deleteFromCloudinary(subcategory.image.publicId, 'image').catch((e) =>
          console.warn('Old subcategory image delete warning:', e.message)
        );
      }
      const uploadRes = await uploadToCloudinary(fileToUpload.buffer, {
        folder: 'rp-categories/sub',
      });
      subcategory.image = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    } else if (imageUrl) {
      subcategory.image = {
        url: imageUrl,
        publicId: null,
      };
    }

    await subcategory.save();
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Subcategory updated successfully.',
      data: { subcategory },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Subcategory (Admin)
 */
async function deleteSubcategory(req, res, next) {
  try {
    const { id } = req.params;

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found.',
      });
    }

    // Clean Cloudinary image
    if (subcategory.image && subcategory.image.publicId) {
      deleteFromCloudinary(subcategory.image.publicId, 'image').catch((e) =>
        console.warn('Subcategory image delete warning:', e.message)
      );
    }

    await Subcategory.findByIdAndDelete(id);
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Subcategory deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Publish / Unpublish Subcategory (Admin)
 */
async function togglePublishSubcategory(req, res, next) {
  try {
    const { id } = req.params;

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'Subcategory not found.',
      });
    }

    subcategory.isPublished = !subcategory.isPublished;
    await subcategory.save();
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: `Subcategory has been ${subcategory.isPublished ? 'published' : 'unpublished'}.`,
      data: {
        id: subcategory._id,
        isPublished: subcategory.isPublished,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Batch Reorder Subcategories (Admin)
 */
async function reorderSubcategories(req, res, next) {
  try {
    const { orders } = req.body;

    const bulkOps = orders.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: Number(item.sortOrder) || 0 } },
      },
    }));

    await Subcategory.bulkWrite(bulkOps);
    await invalidateCategoryCache();

    res.json({
      success: true,
      message: 'Subcategories reordered successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Subcategories (Admin)
 */
async function getAllSubcategoriesAdmin(req, res, next) {
  try {
    const { categoryId, search, isPublished } = req.query;

    const query = {};
    if (categoryId) query.categoryId = categoryId;
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const subcategories = await Subcategory.find(query)
      .populate('categoryId', 'name slug isPublished')
      .populate('createdBy', 'name email phone')
      .sort({ sortOrder: 1, createdAt: -1 });

    res.json({
      success: true,
      data: {
        total: subcategories.length,
        subcategories,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// PUBLIC / USER CONTROLLERS
// ==========================================

/**
 * Get Public Categories (Hierarchical with active Subcategories nested)
 */
async function getPublicCategories(req, res, next) {
  try {
    const cacheKey = 'categories:public:tree';
    const cached = await redisService.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          categories: cached,
          cached: true,
        },
      });
    }

    const [categories, subcategories, designCounts] = await Promise.all([
      Category.find({ isPublished: true }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
      Subcategory.find({ isPublished: true }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
      Design.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = {};
    designCounts.forEach((d) => {
      countMap[d._id] = d.count;
    });

    const subcategoryMap = {};
    subcategories.forEach((sub) => {
      const pId = sub.categoryId.toString();
      if (!subcategoryMap[pId]) subcategoryMap[pId] = [];
      subcategoryMap[pId].push(sub);
    });

    const result = categories.map((cat) => ({
      ...cat,
      designCount: countMap[cat.slug] || 0,
      subcategories: subcategoryMap[cat._id.toString()] || [],
    }));

    await redisService.set(cacheKey, result, 300); // 5 mins cache

    res.json({
      success: true,
      data: {
        categories: result,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Category Details by Slug or ID (Public)
 */
async function getPublicCategoryBySlugOrId(req, res, next) {
  try {
    const { idOrSlug } = req.params;

    let categoryQuery = { isPublished: true };
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      categoryQuery = { $or: [{ _id: idOrSlug }, { slug: idOrSlug }], isPublished: true };
    } else {
      categoryQuery.slug = idOrSlug;
    }

    const category = await Category.findOne(categoryQuery).lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    // Fetch active subcategories
    const subcategories = await Subcategory.find({
      categoryId: category._id,
      isPublished: true,
    })
      .sort({ sortOrder: 1 })
      .lean();

    // Fetch top 6 designs in this category
    const topDesigns = await Design.find({
      category: category.slug,
      isPublished: true,
    })
      .select('title slug coverImage price discountedPrice complexity likeCount')
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(6)
      .lean();

    const totalDesigns = await Design.countDocuments({
      category: category.slug,
      isPublished: true,
    });

    res.json({
      success: true,
      data: {
        category: {
          ...category,
          designCount: totalDesigns,
          subcategories,
        },
        topDesigns,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Subcategories for a given Category (Public)
 */
async function getPublicSubcategories(req, res, next) {
  try {
    const { categorySlugOrId } = req.params;

    let parentCategory;
    if (mongoose.Types.ObjectId.isValid(categorySlugOrId)) {
      parentCategory = await Category.findById(categorySlugOrId);
    } else {
      parentCategory = await Category.findOne({ slug: categorySlugOrId });
    }

    if (!parentCategory) {
      return res.status(404).json({
        success: false,
        message: 'Parent category not found.',
      });
    }

    const subcategories = await Subcategory.find({
      categoryId: parentCategory._id,
      isPublished: true,
    }).sort({ sortOrder: 1 });

    res.json({
      success: true,
      data: {
        category: {
          id: parentCategory._id,
          name: parentCategory.name,
          slug: parentCategory.slug,
        },
        subcategories,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Admin Category
  createCategory,
  updateCategory,
  deleteCategory,
  togglePublishCategory,
  toggleFeaturedCategory,
  reorderCategories,
  getAllCategoriesAdmin,

  // Admin Subcategory
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  togglePublishSubcategory,
  reorderSubcategories,
  getAllSubcategoriesAdmin,

  // Public / User
  getPublicCategories,
  getPublicCategoryBySlugOrId,
  getPublicSubcategories,
};
