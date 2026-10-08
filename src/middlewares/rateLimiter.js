const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  message: {
    success: false,
    message: 'Too many requests from IP, please try again after 15 minutes.',
  },
});

module.exports = limiter;
