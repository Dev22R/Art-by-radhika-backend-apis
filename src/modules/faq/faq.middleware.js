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
  validateCreateFaq,
  validateUpdateFaq,
};
