const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('../user/user.model');
const redisService = require('../../services/redis.service');

/**
 * Optional Authentication Middleware
 * If a valid Bearer token or cookie is provided, populates req.user.
 * If token is missing, expired, or invalid, sets req.user = null and continues without error.
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
      const userObj = user.toJSON();
      await redisService.set(cacheKey, userObj, 600);
      req.user = userObj;
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
 * Validate Vote FAQ Payload
 */
function validateVoteFaq(req, res, next) {
  const { isHelpful } = req.body;

  if (typeof isHelpful !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'isHelpful must be a boolean (true or false).',
    });
  }

  next();
}

/**
 * Validate Create FAQ Payload
 */
function validateCreateFaq(req, res, next) {
  const { question, answer, category } = req.body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'FAQ question is required.',
    });
  }

  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'FAQ answer is required.',
    });
  }

  const validCategories = [
    'general',
    'booking',
    'pricing',
    'bridal',
    'mehndi_aftercare',
    'products',
    'cancellation',
    'other',
  ];
  if (category && !validCategories.includes(category.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Allowed values: ${validCategories.join(', ')}`,
    });
  }

  req.body.question = question.trim();
  req.body.answer = answer.trim();
  if (category) req.body.category = category.toLowerCase().trim();

  next();
}

/**
 * Validate Update FAQ Payload
 */
function validateUpdateFaq(req, res, next) {
  const { question, answer, category } = req.body;

  if (question !== undefined && (typeof question !== 'string' || question.trim().length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'FAQ question cannot be empty.',
    });
  }

  if (answer !== undefined && (typeof answer !== 'string' || answer.trim().length === 0)) {
    return res.status(400).json({
      success: false,
      message: 'FAQ answer cannot be empty.',
    });
  }

  const validCategories = [
    'general',
    'booking',
    'pricing',
    'bridal',
    'mehndi_aftercare',
    'products',
    'cancellation',
    'other',
  ];
  if (category && !validCategories.includes(category.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Allowed values: ${validCategories.join(', ')}`,
    });
  }

  if (question) req.body.question = question.trim();
  if (answer) req.body.answer = answer.trim();
  if (category) req.body.category = category.toLowerCase().trim();

  next();
}

module.exports = {
  optionalProtect,
  validateVoteFaq,
  validateCreateFaq,
  validateUpdateFaq,
};
