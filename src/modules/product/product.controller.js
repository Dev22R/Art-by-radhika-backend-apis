const Product = require('./product.model');
const redisService = require('../../services/redis.service');
const { uploadToCloudinary, uploadMultipleToCloudinary } = require('../../services/cloudinary.service');

/**
 * Helper to invalidate all product-related Redis caches
 */
async function invalidateProductCaches(productId = null) {
  try {
    // 1. Delete list caches
    await redisService.delPattern('products:list:*');
    await redisService.del('products:all');

    // 2. Delete specific product cache if provided
    if (productId) {
      await redisService.del(`product:${productId}`);
    }
  } catch (err) {
    console.error('[ProductCache] Invalidation error:', err.message);
  }
}

/**
 * Create a new product (Authenticated User)
 */
async function createProduct(req, res, next) {
  try {
    const { name, price, rating, purchaseCount, category, image, images } = req.body;
    const userId = req.user._id || req.user.id;

    let finalImage = image || null;
    let finalImages = Array.isArray(images) ? images : (images ? [images] : []);

    // Handle single file upload
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'rp-products',
      });
      finalImage = uploadResult.secure_url;
      finalImages.push(uploadResult.secure_url);
    }

    // Handle multiple file uploads
    if (req.files && req.files.length) {
      const uploadResults = await uploadMultipleToCloudinary(req.files, {
        folder: 'rp-products',
      });
      const uploadedUrls = uploadResults.map((r) => r.secure_url);
      finalImages = [...finalImages, ...uploadedUrls];
      if (!finalImage && uploadedUrls.length) {
        finalImage = uploadedUrls[0];
      }
    }

    const product = new Product({
      name: name.trim(),
      price: Number(price),
      rating: rating !== undefined ? Number(rating) : 0,
      purchaseCount: purchaseCount !== undefined ? Number(purchaseCount) : 0,
      category: category.trim(),
      image: finalImage,
      images: finalImages,
      user: userId,
    });

    const savedProduct = await product.save();

    // Invalidate Redis cache so subsequent GET requests see new product
    await invalidateProductCaches();

    res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      data: savedProduct,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all products (with Redis caching and optional filtering)
 */
async function getProducts(req, res, next) {
  try {
    const { category, minPrice, maxPrice, search } = req.query;

    // Cache key incorporates all query parameters
    const cacheKey = `products:list:${JSON.stringify(req.query || {})}`;

    // 1. Check Redis Cache
    const cachedProducts = await redisService.get(cacheKey);
    if (cachedProducts !== null) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', cacheKey);
      return res.json({
        success: true,
        source: 'redis-cache',
        count: cachedProducts.length,
        data: cachedProducts,
      });
    }

    // 2. Query Database (Cache MISS)
    const filter = {};
    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const products = await Product.find(filter)
      .populate('user', 'name email number')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Store in Redis cache for 120 seconds
    await redisService.set(cacheKey, products, 120);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', cacheKey);
    res.json({
      success: true,
      source: 'database',
      count: products.length,
      data: products,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get single product by ID (with Redis caching)
 */
async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;

    // 1. Check Redis
    const cached = await redisService.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json({
        success: true,
        source: 'redis-cache',
        data: cached,
      });
    }

    // 2. Query DB
    const product = await Product.findById(id).populate('user', 'name email number').lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    // 3. Cache for 5 minutes (300s)
    await redisService.set(cacheKey, product, 300);

    res.setHeader('X-Cache', 'MISS');
    res.json({
      success: true,
      source: 'database',
      data: product,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a product (Creator only, verified by checkProductOwnership middleware)
 */
async function deleteProduct(req, res, next) {
  try {
    const product = req.product; // Attached by checkProductOwnership middleware
    const productId = product._id.toString();

    await Product.findByIdAndDelete(productId);

    // Invalidate Redis caches
    await invalidateProductCaches(productId);

    res.json({
      success: true,
      message: `Product "${product.name}" (ID: ${productId}) has been deleted successfully.`,
      deletedProductId: productId,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  deleteProduct,
};
