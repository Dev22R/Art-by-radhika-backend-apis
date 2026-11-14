const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * Global API rate limiter (15 minutes, 100 requests)
 */
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

/**
 * 1. Captcha Generation Rate Limiter
 * Max 25 captcha requests per 5 minutes per IP (prevents bot scraping & Redis memory flooding)
 */
const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  message: {
    success: false,
    message: 'Too many captcha requests from this IP. Please wait 5 minutes before requesting again.',
  },
});

/**
 * 2. Forgot Password Send OTP Rate Limiter
 * Max 5 OTP requests per 15 minutes per IP (prevents inbox bombing & SMTP quota drainage)
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  message: {
    success: false,
    message: 'Too many password reset requests from this IP. Please wait 15 minutes before trying again.',
  },
});

/**
 * 3. Verify OTP Rate Limiter
 * Max 8 verification attempts per 10 minutes per IP (prevents automated 6-digit brute-forcing)
 */
const verifyOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  message: {
    success: false,
    message: 'Too many verification code attempts from this IP. Please wait 10 minutes before trying again.',
  },
});

/**
 * 4. Reset Password Rate Limiter
 * Max 5 password reset submissions per 15 minutes per IP
 */
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  message: {
    success: false,
    message: 'Too many password reset attempts from this IP. Please wait 15 minutes before trying again.',
  },
});

// Attach specialized limiters to default callable middleware for backward compatibility
limiter.captchaLimiter = captchaLimiter;
limiter.forgotPasswordLimiter = forgotPasswordLimiter;
limiter.verifyOtpLimiter = verifyOtpLimiter;
limiter.resetPasswordLimiter = resetPasswordLimiter;

module.exports = limiter;
module.exports.captchaLimiter = captchaLimiter;
module.exports.forgotPasswordLimiter = forgotPasswordLimiter;
module.exports.verifyOtpLimiter = verifyOtpLimiter;
module.exports.resetPasswordLimiter = resetPasswordLimiter;

