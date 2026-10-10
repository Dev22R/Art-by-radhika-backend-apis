const mongoose = require('mongoose');
const Faq = require('./faq.model');
const redisService = require('../../services/redis.service');

/**
 * Invalidate FAQ Redis cache
 */
async function invalidateFaqCache() {
  try {
    await redisService.delPattern('faqs:*');
  } catch (err) {
    console.warn('[FaqController] Cache invalidation warning:', err.message);
  }
}

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * Create New FAQ (Admin)
 */
async function createFaq(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      question,
      answer,
      category = 'general',
      tags = [],
      isPublished = true,
      sortOrder = 0,
    } = req.body;

    let parsedTags = Array.isArray(tags) ? tags : [];
    if (typeof tags === 'string') {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = tags.split(',').map((t) => t.trim().toLowerCase());
      }
    }

    const faq = new Faq({
      question: question.trim(),
      answer: answer.trim(),
      category: category.toLowerCase().trim(),
      tags: parsedTags,
      isPublished: Boolean(isPublished),
      sortOrder: Number(sortOrder) || 0,
      createdBy: adminId,
    });

    await faq.save();
    await invalidateFaqCache();

    res.status(201).json({
      success: true,
      message: 'FAQ created successfully.',
      data: { faq },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update FAQ (Admin)
 */
async function updateFaq(req, res, next) {
  try {
    const { id } = req.params;
    const {
      question,
      answer,
      category,
      tags,
      isPublished,
      sortOrder,
    } = req.body;

    const faq = await Faq.findById(id);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    if (question) faq.question = question.trim();
    if (answer) faq.answer = answer.trim();
    if (category) faq.category = category.toLowerCase().trim();

    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        faq.tags = tags.map((t) => String(t).trim().toLowerCase());
      } else if (typeof tags === 'string') {
        try {
          faq.tags = JSON.parse(tags);
        } catch {
          faq.tags = tags.split(',').map((t) => t.trim().toLowerCase());
        }
      }
    }

    if (isPublished !== undefined) faq.isPublished = Boolean(isPublished);
    if (sortOrder !== undefined) faq.sortOrder = Number(sortOrder);

    await faq.save();
    await invalidateFaqCache();

    res.json({
      success: true,
      message: 'FAQ updated successfully.',
      data: { faq },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle FAQ Publish / Unpublish Status (Admin)
 */
async function togglePublishFaq(req, res, next) {
  try {
    const { id } = req.params;

    const faq = await Faq.findById(id);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    faq.isPublished = !faq.isPublished;
    await faq.save();
    await invalidateFaqCache();

    res.json({
      success: true,
      message: `FAQ has been ${faq.isPublished ? 'published' : 'unpublished'} successfully.`,
      data: {
        id: faq._id,
        isPublished: faq.isPublished,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete FAQ (Admin)
 */
async function deleteFaq(req, res, next) {
  try {
    const { id } = req.params;

    const faq = await Faq.findByIdAndDelete(id);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    await invalidateFaqCache();

    res.json({
      success: true,
      message: 'FAQ deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All FAQs (Admin - Overview with unpublished & metrics)
 */
async function getAllFaqsAdmin(req, res, next) {
  try {
    const { category, isPublished, search, page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (category) query.category = category.toLowerCase();
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';

    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const [faqs, total] = await Promise.all([
      Faq.find(query)
        .populate('createdBy', 'name email')
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Faq.countDocuments(query),
    ]);

    // Aggregate category counts
    const categoryStats = await Faq.aggregate([
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          published: {
            $sum: { $cond: [{ $eq: ['$isPublished', true] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalFaqs: total,
          categoryBreakdown: categoryStats,
        },
        faqs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Batch Reorder FAQs (Admin)
 */
async function reorderFaqs(req, res, next) {
  try {
    const { orders } = req.body; // Array of { id, sortOrder }

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orders must be a non-empty array of { id, sortOrder } objects.',
      });
    }

    const updatePromises = orders.map((item) =>
      Faq.findByIdAndUpdate(item.id, { sortOrder: Number(item.sortOrder) || 0 })
    );

    await Promise.all(updatePromises);
    await invalidateFaqCache();

    res.json({
      success: true,
      message: 'FAQs reordered successfully.',
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// USER / PUBLIC CONTROLLERS
// ==========================================

/**
 * Get Published FAQs (Public / User - Cached)
 * Supports category filtering, search, and grouped view
 */
async function getFaqsPublic(req, res, next) {
  try {
    const { category, search, grouped = 'false' } = req.query;
    const cacheKey = `faqs:public:${category || 'all'}:${search || 'none'}:${grouped}`;

    if (!search) {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: {
            ...cachedData,
            cached: true,
          },
        });
      }
    }

    const query = { isPublished: true };
    if (category) query.category = category.toLowerCase().trim();

    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const faqs = await Faq.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean();

    let responseData = { faqs, total: faqs.length };

    // Group by category if requested
    if (grouped === 'true') {
      const groupedFaqs = {};
      faqs.forEach((item) => {
        if (!groupedFaqs[item.category]) {
          groupedFaqs[item.category] = [];
        }
        groupedFaqs[item.category].push(item);
      });
      responseData = {
        groupedFaqs,
        total: faqs.length,
      };
    }

    if (!search) {
      await redisService.set(cacheKey, responseData, 300); // 5 minutes cache
    }

    res.json({
      success: true,
      data: {
        ...responseData,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single FAQ by ID (Public)
 */
async function getFaqById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FAQ ID format.',
      });
    }

    const faq = await Faq.findById(id).lean();
    if (!faq || (!faq.isPublished && req.user?.role !== 'admin')) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    res.json({
      success: true,
      data: { faq },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Vote FAQ (Helpful / Not Helpful) (Public / User)
 */
async function voteFaqHelpful(req, res, next) {
  try {
    const { id } = req.params;
    const { isHelpful } = req.body; // boolean

    if (typeof isHelpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isHelpful must be a boolean (true or false).',
      });
    }

    const updateField = isHelpful ? { $inc: { helpfulCount: 1 } } : { $inc: { notHelpfulCount: 1 } };
    const faq = await Faq.findByIdAndUpdate(id, updateField, { new: true });

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    res.json({
      success: true,
      message: 'Thank you for your feedback!',
      data: {
        id: faq._id,
        helpfulCount: faq.helpfulCount,
        notHelpfulCount: faq.notHelpfulCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Admin controllers
  createFaq,
  updateFaq,
  togglePublishFaq,
  deleteFaq,
  getAllFaqsAdmin,
  reorderFaqs,

  // Public / User controllers
  getFaqsPublic,
  getFaqById,
  voteFaqHelpful,
};
