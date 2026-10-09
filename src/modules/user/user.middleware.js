const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('./user.model');
const redisService = require('../../services/redis.service');

/**
 * Validate phone number format (standard 10-15 digits, supports optional + country code)
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleanPhone = phone.trim().replace(/[\s-]/g, '');
  // Allows 10-digit (e.g. 9876543210) or international format (+919876543210)
  const phoneRegex = /^(\+?[1-9]\d{0,3})?[6-9]\d{9}$|^[0-9]{10,15}$/;
  return phoneRegex.test(cleanPhone);
}

/**
 * Middleware to strictly validate Signup payload (phone and password only)
 */
function validateSignup(req, res, next) {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'Mobile number (phone) and password are required.',
    });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid 10-digit mobile number.',
    });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.',
    });
  }

  // Normalize phone
  req.body.phone = phone.trim().replace(/[\s-]/g, '');
  next();
}

/**
 * Middleware to strictly validate Login payload (phone and password only)
 */
function validateLogin(req, res, next) {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'Mobile number (phone) and password are required.',
    });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid mobile number.',
    });
  }

  req.body.phone = phone.trim().replace(/[\s-]/g, '');
  next();
}

/**
 * Middleware to validate Profile Completion payload
 */
function validateCompleteProfile(req, res, next) {
  const { name, email, profileImage } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required to complete profile.',
    });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Name cannot exceed 100 characters.',
    });
  }

  if (email) {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }
  }

  req.body.name = name.trim();
  if (email) req.body.email = email.trim().toLowerCase();
  next();
}

/**
 * Middleware to validate User Address payload
 */
function validateAddress(req, res, next) {
  const { addressLine, city, label, pincode } = req.body;

  if (!addressLine || !city) {
    return res.status(400).json({
      success: false,
      message: 'addressLine and city are required fields.',
    });
  }

  const validLabels = ['home', 'office', 'wedding', 'other'];
  if (label && !validLabels.includes(label.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid label. Allowed values: ${validLabels.join(', ')}`,
    });
  }

  next();
}

/**
 * Protect middleware: Ensures request has a valid Bearer token and checks Redis blacklist & user cache
 */
async function protect(req, res, next) {
  try {
    let token = null;

    // 1. Extract from Authorization header or Cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a Bearer token in Authorization header.',
      });
    }

    // 2. Check token blacklist in Redis (e.g. after logout)
    const isBlacklisted = await redisService.exists(`bl:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated (Logged out). Please log in again.',
      });
    }

    // 3. Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token expired. Please refresh your token or log in again.',
          tokenExpired: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid access token.',
      });
    }

    // 4. Fetch user from Redis cache first for high performance, fallback to DB
    const cacheKey = `user:${decoded.id}`;
    let cachedUser = await redisService.get(cacheKey);

    if (cachedUser) {
      if (cachedUser.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.',
        });
      }
      req.user = cachedUser;
      req.token = token;
      return next();
    }

    // Fallback to database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    // Cache user profile in Redis for 10 minutes (600s)
    await redisService.set(cacheKey, user.toJSON(), 600);

    req.user = user.toJSON();
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Authorize middleware: checks if req.user has one of the required roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access requires one of the following roles: [${roles.join(', ')}]. Current role: '${req.user?.role || 'none'}'.`,
      });
    }
    next();
  };
}

/**
 * Middleware to validate Admin Login payload (supports email or phone + password)
 */
function validateAdminLogin(req, res, next) {
  const { email, phone, identifier, password } = req.body;
  const loginIdentifier = email || phone || identifier;

  if (!loginIdentifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Admin email/phone and password are required.',
    });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.',
    });
  }

  if (email) req.body.email = email.trim().toLowerCase();
  if (phone) req.body.phone = phone.trim().replace(/[\s-]/g, '');
  if (identifier) req.body.identifier = identifier.trim();

  next();
}

/**
 * Middleware to validate Change Password payload (single newPassword field)
 */
function validateChangePassword(req, res, next) {
  const { newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'newPassword is required.',
    });
  }

  if (newPassword.trim().length < 6) {
    return res.status(400).json({
      success: false,
      message: 'newPassword must be at least 6 characters long.',
    });
  }

  req.body.newPassword = newPassword.trim();
  next();
}

module.exports = {
  isValidPhone,
  validateSignup,
  validateLogin,
  validateAdminLogin,
  validateChangePassword,
  validateCompleteProfile,
  validateAddress,
  protect,
  authorize,
};
