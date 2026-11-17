const rateLimit = require('express-rate-limit');
const { getActiveConfig } = require('./estimator.cache');

/**
 * 1. Rate Limiter for Calculate endpoint (~60 requests/minute per IP)
 */
const calculateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    default: false,
  },
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many calculate requests. Please try again in a minute.',
      },
    });
  },
});

/**
 * 2. Rate Limiter for Enquiry endpoint (~5 requests/minute per IP)
 */
const enquiryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many enquiry submissions from this IP. Please wait a minute.',
      },
    });
  },
});

/**
 * 3. Guard: Require Active Estimator Config
 * If no config exists or enabled === false, gracefully return 503 Service Unavailable.
 */
async function requireActiveEstimator(req, res, next) {
  try {
    const config = await getActiveConfig();

    if (!config) {
      return res.status(503).json({
        error: {
          code: 'ESTIMATOR_NOT_CONFIGURED',
          message: 'Henna Time & Cost Estimator is not configured yet. Please check back later.',
        },
      });
    }

    if (config.enabled === false) {
      return res.status(503).json({
        error: {
          code: 'ESTIMATOR_MAINTENANCE',
          message: 'Henna Time & Cost Estimator is currently disabled for maintenance. Please contact us directly.',
        },
      });
    }

    // Attach active config to request
    req.estimatorConfig = config;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Helper: Strip hazardous HTML / script injection characters
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * 4. Input Sanitizer against XSS for string inputs
 */
function sanitizeEstimatorInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const sanitizeRecursive = (obj) => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          obj[key] = sanitizeString(val);
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          sanitizeRecursive(val);
        } else if (Array.isArray(val)) {
          val.forEach((item) => {
            if (typeof item === 'string') {
              // mutate in place
            } else if (item && typeof item === 'object') {
              sanitizeRecursive(item);
            }
          });
        }
      }
    };

    sanitizeRecursive(req.body);
  }

  next();
}

module.exports = {
  calculateLimiter,
  enquiryLimiter,
  requireActiveEstimator,
  sanitizeEstimatorInput,
};
