const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('../user/user.model');
const redisService = require('../../services/redis.service');
const { uploadAny, handleMulterError } = require('../../middlewares/upload.middleware');

/**
 * Optional Authentication Middleware
 * Populates req.user if valid token provided; does not fail if unauthenticated.
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
 * Multer wrapper for testimonial avatar/image uploads
 */
const testimonialUpload = (req, res, next) => {
  uploadAny()(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    next();
  });
};

/**
 * Validate User Feedback submission payload
 */
function validateCreateFeedbackUser(req, res, next) {
  const { message, feedback, content, rating, designation, company, name } = req.body;
  const feedbackMsg = message || feedback || content;

  if (!feedbackMsg || typeof feedbackMsg !== 'string' || feedbackMsg.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Feedback message is required.',
    });
  }

  if (feedbackMsg.trim().length < 5) {
    return res.status(400).json({
      success: false,
      message: 'Feedback message must be at least 5 characters long.',
    });
  }

  if (feedbackMsg.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      message: 'Feedback message cannot exceed 2000 characters.',
    });
  }

  if (rating !== undefined && rating !== null) {
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5.',
      });
    }
  }

  if (name && (typeof name !== 'string' || name.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Name cannot exceed 120 characters.',
    });
  }

  if (designation && (typeof designation !== 'string' || designation.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Designation cannot exceed 120 characters.',
    });
  }

  if (company && (typeof company !== 'string' || company.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Company/Event cannot exceed 120 characters.',
    });
  }

  // Normalize message property
  req.body.message = feedbackMsg.trim();

  next();
}

/**
 * Validate User Feedback update payload
 */
function validateUpdateFeedbackUser(req, res, next) {
  const { message, feedback, content, rating, designation, company, name } = req.body;
  const feedbackMsg = message || feedback || content;

  if (feedbackMsg !== undefined) {
    if (typeof feedbackMsg !== 'string' || feedbackMsg.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message must be at least 5 characters long.',
      });
    }
    if (feedbackMsg.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message cannot exceed 2000 characters.',
      });
    }
    req.body.message = feedbackMsg.trim();
  }

  if (rating !== undefined && rating !== null) {
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5.',
      });
    }
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Name cannot exceed 120 characters.',
    });
  }

  if (designation !== undefined && (typeof designation !== 'string' || designation.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Designation cannot exceed 120 characters.',
    });
  }

  if (company !== undefined && (typeof company !== 'string' || company.trim().length > 120)) {
    return res.status(400).json({
      success: false,
      message: 'Company/Event cannot exceed 120 characters.',
    });
  }

  next();
}

/**
 * Validate Admin Create Testimonial payload
 */
function validateAdminCreateTestimonial(req, res, next) {
  const { name, message, feedback, content, rating, status, isActive, isFeatured } = req.body;
  const feedbackMsg = message || feedback || content;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Client name is required.',
    });
  }

  if (!feedbackMsg || typeof feedbackMsg !== 'string' || feedbackMsg.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Testimonial message is required.',
    });
  }

  if (feedbackMsg.trim().length < 5) {
    return res.status(400).json({
      success: false,
      message: 'Testimonial message must be at least 5 characters.',
    });
  }

  if (rating !== undefined && rating !== null) {
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5.',
      });
    }
  }

  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Allowed values are: pending, approved, rejected.',
    });
  }

  req.body.message = feedbackMsg.trim();
  next();
}

/**
 * Validate Admin Update Testimonial payload
 */
function validateAdminUpdateTestimonial(req, res, next) {
  const { message, feedback, content, rating, status } = req.body;
  const feedbackMsg = message || feedback || content;

  if (feedbackMsg !== undefined) {
    if (typeof feedbackMsg !== 'string' || feedbackMsg.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Testimonial message must be at least 5 characters.',
      });
    }
    req.body.message = feedbackMsg.trim();
  }

  if (rating !== undefined && rating !== null) {
    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be a number between 1 and 5.',
      });
    }
  }

  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Allowed values are: pending, approved, rejected.',
    });
  }

  next();
}

/**
 * Validate Status Update payload for Admin (approve / reject / pending)
 */
function validateStatusUpdate(req, res, next) {
  const { status, rejectionReason, adminNotes } = req.body;

  if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status is required and must be one of: pending, approved, rejected.',
    });
  }

  if (status === 'rejected' && (!rejectionReason && !adminNotes)) {
    // Optional, but good practice to provide reason
  }

  next();
}

module.exports = {
  optionalProtect,
  testimonialUpload,
  validateCreateFeedbackUser,
  validateUpdateFeedbackUser,
  validateAdminCreateTestimonial,
  validateAdminUpdateTestimonial,
  validateStatusUpdate,
};
