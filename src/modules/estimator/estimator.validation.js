const Joi = require('joi');

/**
 * Standard error formatter for Joi validation results
 * Matches project error convention: { error: { code, message, details } }
 */
function formatJoiError(joiError) {
  const details = joiError.details.map((d) => ({
    message: d.message,
    path: d.path.join('.'),
    type: d.type,
  }));

  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: joiError.details[0]?.message || 'Invalid request payload.',
      details,
    },
  };
}

/**
 * Schema: Public Calculate Request
 */
const calculateSchema = Joi.object({
  coverageId: Joi.string().trim().min(1).max(100).required().messages({
    'any.required': 'coverageId is required.',
    'string.empty': 'coverageId cannot be empty.',
  }),
  guests: Joi.number().integer().min(1).max(1000).required().messages({
    'any.required': 'guests is required.',
    'number.base': 'guests must be a valid number.',
    'number.integer': 'guests must be an integer.',
    'number.min': 'guests must be at least 1.',
  }),
}).options({ stripUnknown: false });

/**
 * Schema: Public Enquiry Request
 */
const enquirySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'any.required': 'Customer name is required.',
    'string.min': 'Name must be at least 2 characters long.',
  }),
  phone: Joi.string().trim().min(7).max(20).required().messages({
    'any.required': 'Mobile phone number is required.',
  }),
  email: Joi.string().trim().email().allow(null, '').optional(),
  eventDate: Joi.date().iso().allow(null, '').optional(),
  location: Joi.string().trim().max(200).allow(null, '').optional(),
  notes: Joi.string().trim().max(1000).allow(null, '').optional(),
  coverageId: Joi.string().trim().min(1).max(100).required(),
  guests: Joi.number().integer().min(1).max(1000).required(),
  clientAmount: Joi.any().optional(), // Silently accepted and discarded by server
  clientQuote: Joi.any().optional(),
}).options({ stripUnknown: true });

/**
 * Schema: Coverage Item in Admin Config
 */
const coverageItemSchema = Joi.object({
  id: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9_-]+$/)
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Coverage id must contain only lowercase alphanumeric characters, dashes, or underscores.',
    }),
  label: Joi.string().trim().min(1).max(150).required(),
  description: Joi.string().trim().max(500).allow(null, '').default(''),
  basePrice: Joi.number().integer().min(0).required().messages({
    'number.min': 'Coverage basePrice cannot be negative.',
    'number.integer': 'Coverage basePrice must be an integer in paise.',
  }),
  baseMinutes: Joi.number().integer().min(0).required().messages({
    'number.min': 'Coverage baseMinutes cannot be negative.',
  }),
  guestOverride: Joi.object({
    pricePerGuest: Joi.number().integer().min(0).allow(null).optional(),
    minutesPerGuest: Joi.number().integer().min(0).allow(null).optional(),
  })
    .allow(null)
    .optional(),
  active: Joi.boolean().default(true),
  sortOrder: Joi.number().integer().default(0),
});

/**
 * Schema: Bulk Discount Item in Admin Config
 */
const bulkDiscountItemSchema = Joi.object({
  minGuests: Joi.number().integer().min(1).required(),
  percent: Joi.number().min(0).max(100).required().messages({
    'number.min': 'Discount percent cannot be negative.',
    'number.max': 'Discount percent cannot exceed 100%.',
  }),
});

/**
 * Schema: Full Admin Config Update (with Optimistic Lock Version & Cross-Field Checks)
 */
const adminConfigUpdateSchema = Joi.object({
  key: Joi.string().trim().optional(),
  _id: Joi.any().optional(),
  createdAt: Joi.any().optional(),
  updatedAt: Joi.any().optional(),
  updatedBy: Joi.any().optional(),
  __v: Joi.any().optional(),
  version: Joi.number().integer().min(1).required().messages({
    'any.required': 'Current version is required for optimistic concurrency control.',
    'number.base': 'version must be an integer.',
  }),
  currency: Joi.string().trim().uppercase().length(3).default('INR'),
  coverages: Joi.array().items(coverageItemSchema).min(1).required().messages({
    'array.min': 'At least one coverage option is required.',
  }),
  guestRules: Joi.object({
    pricePerGuest: Joi.number().integer().min(0).required(),
    minutesPerGuest: Joi.number().integer().min(0).required(),
    maxGuests: Joi.number().integer().min(1).max(1000).required(),
  }).required(),
  bulkDiscounts: Joi.array().items(bulkDiscountItemSchema).default([]),
  minimumTotal: Joi.number().integer().min(0).default(0),
  tax: Joi.object({
    percent: Joi.number().min(0).max(100).default(0),
    inclusive: Joi.boolean().default(false),
  }).default({ percent: 0, inclusive: false }),
  timeBufferPercent: Joi.number().min(0).max(100).default(15),
  includesText: Joi.string().trim().max(500).allow('').default(''),
  enabled: Joi.boolean().default(true),
  changeNote: Joi.string().trim().max(500).allow('').default(''),
})
  .custom((value, helpers) => {
    // 1. Check duplicate coverage IDs
    const coverageIds = new Set();
    for (const c of value.coverages) {
      const lower = c.id.toLowerCase();
      if (coverageIds.has(lower)) {
        return helpers.message(`Duplicate coverage id "${c.id}" found. Coverage ids must be unique.`);
      }
      coverageIds.add(lower);
    }

    // 2. Check duplicate discount minGuests & bounds
    const discountGuests = new Set();
    const maxGuests = value.guestRules.maxGuests;

    if (Array.isArray(value.bulkDiscounts)) {
      for (const d of value.bulkDiscounts) {
        if (discountGuests.has(d.minGuests)) {
          return helpers.message(
            `Duplicate discount minGuests "${d.minGuests}" found. Discount slabs must have unique minGuests.`
          );
        }
        discountGuests.add(d.minGuests);

        if (d.minGuests > maxGuests) {
          return helpers.message(
            `Discount minGuests (${d.minGuests}) cannot be greater than maxGuests (${maxGuests}).`
          );
        }
      }
    }

    return value;
  })
  .options({ stripUnknown: false });

/**
 * Middleware: Validate Calculate Request
 */
function validateCalculate(req, res, next) {
  const { error, value } = calculateSchema.validate(req.body);
  if (error) {
    return res.status(400).json(formatJoiError(error));
  }
  req.body = value;
  next();
}

/**
 * Middleware: Validate Enquiry Request
 */
function validateEnquiry(req, res, next) {
  const { error, value } = enquirySchema.validate(req.body);
  if (error) {
    return res.status(400).json(formatJoiError(error));
  }
  req.body = value;
  next();
}

/**
 * Middleware: Validate Admin Config Update
 */
function validateAdminConfig(req, res, next) {
  const { error, value } = adminConfigUpdateSchema.validate(req.body);
  if (error) {
    return res.status(400).json(formatJoiError(error));
  }
  req.body = value;
  next();
}

/**
 * Middleware: Validate Admin Preview Request
 */
function validateAdminPreview(req, res, next) {
  const previewSchema = Joi.object({
    config: adminConfigUpdateSchema
      .fork(['version'], (schema) => schema.optional())
      .optional(),
    coverageId: Joi.string().trim().required(),
    guests: Joi.number().integer().min(1).required(),
  });

  const { error, value } = previewSchema.validate(req.body);
  if (error) {
    return res.status(400).json(formatJoiError(error));
  }
  req.body = value;
  next();
}

module.exports = {
  validateCalculate,
  validateEnquiry,
  validateAdminConfig,
  validateAdminPreview,
  adminConfigUpdateSchema,
  formatJoiError,
};
