const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('../user/user.model');
const redisService = require('../../services/redis.service');

/**
 * Optional Authentication Middleware
 */
async function optionalProtect(req, res, next) {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      req.user = null;
      return next();
    }

    const isBlacklisted = await redisService.exists(`bl:${token}`);
    if (isBlacklisted) {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      req.user = null;
      return next();
    }

    if (!decoded || !decoded.id) {
      req.user = null;
      return next();
    }

    const cacheKey = `user:${decoded.id}`;
    let cachedUser = await redisService.get(cacheKey);

    if (cachedUser) {
      if (cachedUser.isActive !== false) {
        req.user = cachedUser;
        req.token = token;
      } else {
        req.user = null;
      }
      return next();
    }

    const user = await User.findById(decoded.id).select('-password');
    if (user && user.isActive) {
      const userJson = user.toJSON();
      await redisService.set(cacheKey, userJson, 600);
      req.user = userJson;
      req.token = token;
    } else {
      req.user = null;
    }

    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * Validate Create Design Payload
 */
function validateCreateDesign(req, res, next) {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Design title is required.',
    });
  }

  // Check if at least one image is uploaded or imageUrls are provided
  const hasImageFiles =
    req.files &&
    ((req.files.images && req.files.images.length > 0) ||
      (req.files.photos && req.files.photos.length > 0) ||
      (req.files.designImages && req.files.designImages.length > 0) ||
      (req.files.cover && req.files.cover.length > 0) ||
      (req.files.thumbnail && req.files.thumbnail.length > 0) ||
      (req.files.file && req.files.file.length > 0) ||
      (req.files.files && req.files.files.length > 0) ||
      (Array.isArray(req.files) && req.files.length > 0) ||
      (req.file && (req.file.mimetype?.startsWith('image/') || req.file.buffer)));

  const hasImageUrls =
    req.body.images ||
    req.body.imageUrls ||
    req.body.imageUrl ||
    req.body.coverImage ||
    req.body.photos ||
    req.body['images[]'] ||
    req.body['imageUrls[]'];

  if (!hasImageFiles && !hasImageUrls) {
    return res.status(400).json({
      success: false,
      message: 'At least one design image is required.',
    });
  }

  next();
}

/**
 * Validate Update Design Payload
 */
function validateUpdateDesign(req, res, next) {
  if (req.body.title !== undefined && (typeof req.body.title !== 'string' || req.body.title.trim().length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'Design title cannot be empty.',
    });
  }

  next();
}

/**
 * Validate Direct Booking Payload from Design
 */
function validateBookDesign(req, res, next) {
  const { addressId, bookingSlots } = req.body;

  if (!addressId) {
    return res.status(400).json({
      success: false,
      message: 'addressId is required to book this design.',
    });
  }

  if (!bookingSlots) {
    return res.status(400).json({
      success: false,
      message: 'bookingSlots array with appointment date and time is required.',
    });
  }

  next();
}

module.exports = {
  optionalProtect,
  validateCreateDesign,
  validateUpdateDesign,
  validateBookDesign,
};
