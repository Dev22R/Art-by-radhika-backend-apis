const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('../user/user.model');
const redisService = require('../../services/redis.service');

/**
 * Optional Authentication Middleware
 * If Bearer token is present and valid, attaches `req.user` and `req.token`.
 * If no token is provided or invalid, proceeds gracefully without throwing 401 (req.user remains null).
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

    // Check blacklist in Redis
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

    // Check Redis user cache
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
 * Validate Reel Creation Payload
 */
function validateCreateReel(req, res, next) {
  const { title, videoUrl, adminDesign } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Reel title is required.',
    });
  }

  // Check if video file or videoUrl is provided
  const hasVideoFile = req.files && (req.files.video || req.files.file || req.file);
  if (!hasVideoFile && !videoUrl) {
    return res.status(400).json({
      success: false,
      message: 'Reel video file or videoUrl is required.',
    });
  }

  // Parse adminDesign if JSON string
  let parsedDesign = adminDesign;
  if (typeof adminDesign === 'string') {
    try {
      parsedDesign = JSON.parse(adminDesign);
      req.body.adminDesign = parsedDesign;
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid adminDesign JSON format.',
      });
    }
  }

  if (parsedDesign && !parsedDesign.designName) {
    return res.status(400).json({
      success: false,
      message: 'adminDesign.designName is required.',
    });
  }

  next();
}

/**
 * Validate Reel Comment
 */
function validateComment(req, res, next) {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Comment text cannot be empty.',
    });
  }

  if (text.trim().length > 1000) {
    return res.status(400).json({
      success: false,
      message: 'Comment cannot exceed 1000 characters.',
    });
  }

  req.body.text = text.trim();
  next();
}

/**
 * Validate Book Design from Reel payload
 */
function validateBookReelDesign(req, res, next) {
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
  validateCreateReel,
  validateComment,
  validateBookReelDesign,
};
