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

/**
 * Helper function: Format FAQ item with current user's vote status
 * Appends:
 * - isVoted: true / false
 * - votedUserId: userId string (if voted) or null
 * - userVote: true (helpful) / false (not helpful) / null
 * - votedAt: timestamp of vote (if voted) or null
 */
function formatFaqItem(faq, currentUserId, isAdmin = false) {
  const plainFaq = faq && faq.toObject ? faq.toObject() : { ...faq };
  const votes = Array.isArray(plainFaq.votes) ? plainFaq.votes : [];
  const userIdStr = currentUserId ? String(currentUserId) : null;

  let isVoted = false;
  let votedUserId = null;
  let userVote = null;
  let votedAt = null;

  if (userIdStr && votes.length > 0) {
    const match = votes.find((v) => {
      const vId = v.user?._id || v.user;
      return String(vId) === userIdStr;
    });

    if (match) {
      isVoted = true;
      votedUserId = userIdStr;
      userVote = Boolean(match.isHelpful);
      votedAt = match.votedAt || null;
    }
  }

  // If not admin, do not expose raw votes array to regular users
  if (!isAdmin) {
    delete plainFaq.votes;
  }

  return {
    ...plainFaq,
    isVoted,
    votedUserId,
    userVote,
    votedAt: isVoted ? votedAt : null,
  };
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
        .populate('votes.user', 'name phone email profileImage')
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

    // Format faqs for admin with voter summary and list
    const formattedFaqs = faqs.map((faq) => {
      const plain = faq.toObject ? faq.toObject() : { ...faq };
      const votes = Array.isArray(plain.votes) ? plain.votes : [];
      return {
        ...plain,
        totalVotes: votes.length,
        voters: votes.map((v) => ({
          user: v.user
            ? {
                _id: v.user._id,
                name: v.user.name,
                phone: v.user.phone,
                email: v.user.email,
                profileImage: v.user.profileImage,
              }
            : null,
          isHelpful: v.isHelpful,
          votedAt: v.votedAt,
        })),
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalFaqs: total,
          categoryBreakdown: categoryStats,
        },
        faqs: formattedFaqs,
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
 * Get Voters Details for a Specific FAQ (Admin)
 */
async function getFaqVotesAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FAQ ID format.',
      });
    }

    const faq = await Faq.findById(id)
      .populate('votes.user', 'name phone email profileImage')
      .populate('createdBy', 'name email')
      .lean();

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    const votes = Array.isArray(faq.votes) ? faq.votes : [];
    const helpfulVoters = [];
    const notHelpfulVoters = [];

    votes.forEach((v) => {
      const voterInfo = {
        user: v.user
          ? {
              _id: v.user._id,
              name: v.user.name,
              phone: v.user.phone,
              email: v.user.email,
              profileImage: v.user.profileImage,
            }
          : null,
        isHelpful: v.isHelpful,
        votedAt: v.votedAt,
      };

      if (v.isHelpful) {
        helpfulVoters.push(voterInfo);
      } else {
        notHelpfulVoters.push(voterInfo);
      }
    });

    res.json({
      success: true,
      data: {
        faqId: faq._id,
        question: faq.question,
        totalVotes: votes.length,
        helpfulCount: faq.helpfulCount,
        notHelpfulCount: faq.notHelpfulCount,
        voters: {
          all: votes.map((v) => ({
            user: v.user
              ? {
                  _id: v.user._id,
                  name: v.user.name,
                  phone: v.user.phone,
                  email: v.user.email,
                  profileImage: v.user.profileImage,
                }
              : null,
            isHelpful: v.isHelpful,
            votedAt: v.votedAt,
          })),
          helpful: helpfulVoters,
          notHelpful: notHelpfulVoters,
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
 * Appends isVoted (true/false) and votedUserId for the authenticated user
 */
async function getFaqsPublic(req, res, next) {
  try {
    const { category, search, grouped = 'false' } = req.query;
    const currentUserId = req.user?._id || req.user?.id || null;
    const isAdmin = req.user?.role === 'admin';

    // Base cache key for raw FAQs (independent of requesting user)
    const cacheKey = `faqs:public:${category || 'all'}:${search || 'none'}`;
    let faqs;

    if (!search) {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData && Array.isArray(cachedData)) {
        faqs = cachedData;
      }
    }

    if (!faqs) {
      const query = { isPublished: true };
      if (category) query.category = category.toLowerCase().trim();

      if (search) {
        query.$or = [
          { question: { $regex: search, $options: 'i' } },
          { answer: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      faqs = await Faq.find(query)
        .populate('createdBy', 'name email')
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();

      if (!search) {
        await redisService.set(cacheKey, faqs, 300); // 5 minutes cache
      }
    }

    // Attach user-specific vote status (isVoted, votedUserId, userVote) dynamically
    const formattedFaqs = faqs.map((faq) => formatFaqItem(faq, currentUserId, isAdmin));

    let responseData = { faqs: formattedFaqs, total: formattedFaqs.length };

    // Group by category if requested
    if (grouped === 'true') {
      const groupedFaqs = {};
      formattedFaqs.forEach((item) => {
        if (!groupedFaqs[item.category]) {
          groupedFaqs[item.category] = [];
        }
        groupedFaqs[item.category].push(item);
      });
      responseData = {
        groupedFaqs,
        total: formattedFaqs.length,
      };
    }

    res.json({
      success: true,
      data: {
        ...responseData,
        cached: Boolean(!search && faqs),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single FAQ by ID (Public / User)
 * Appends isVoted (true/false) and votedUserId for the authenticated user
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

    const currentUserId = req.user?._id || req.user?.id || null;
    const isAdmin = req.user?.role === 'admin';

    let query = Faq.findById(id);
    if (isAdmin) {
      query = query
        .populate('votes.user', 'name phone email profileImage')
        .populate('createdBy', 'name email');
    } else {
      query = query.populate('createdBy', 'name email');
    }

    const faq = await query.lean();
    if (!faq || (!faq.isPublished && !isAdmin)) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    const formattedFaq = formatFaqItem(faq, currentUserId, isAdmin);

    res.json({
      success: true,
      data: { faq: formattedFaq },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Vote FAQ (Helpful / Not Helpful) (Protected - User / Admin)
 * Stores user vote, supports vote toggling (un-vote) and switching
 */
async function voteFaqHelpful(req, res, next) {
  try {
    const { id } = req.params;
    const { isHelpful } = req.body; // boolean
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to vote.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FAQ ID format.',
      });
    }

    if (typeof isHelpful !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isHelpful must be a boolean (true or false).',
      });
    }

    const faq = await Faq.findById(id);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found.',
      });
    }

    if (!Array.isArray(faq.votes)) {
      faq.votes = [];
    }

    const existingVoteIndex = faq.votes.findIndex(
      (v) => String(v.user?._id || v.user) === String(userId)
    );

    let message = '';
    let isVoted = true;
    let userVote = isHelpful;

    if (existingVoteIndex === -1) {
      // 1. New vote
      faq.votes.push({
        user: userId,
        isHelpful,
        votedAt: new Date(),
      });

      if (isHelpful) {
        faq.helpfulCount = (faq.helpfulCount || 0) + 1;
      } else {
        faq.notHelpfulCount = (faq.notHelpfulCount || 0) + 1;
      }
      message = 'Thank you for your feedback!';
    } else if (faq.votes[existingVoteIndex].isHelpful === isHelpful) {
      // 2. Clicked same vote again -> Un-vote / Toggle off
      if (isHelpful) {
        faq.helpfulCount = Math.max(0, (faq.helpfulCount || 0) - 1);
      } else {
        faq.notHelpfulCount = Math.max(0, (faq.notHelpfulCount || 0) - 1);
      }
      faq.votes.splice(existingVoteIndex, 1);
      isVoted = false;
      userVote = null;
      message = 'Your vote has been removed.';
    } else {
      // 3. Switched vote (from helpful to not-helpful or vice versa)
      if (isHelpful) {
        faq.notHelpfulCount = Math.max(0, (faq.notHelpfulCount || 0) - 1);
        faq.helpfulCount = (faq.helpfulCount || 0) + 1;
      } else {
        faq.helpfulCount = Math.max(0, (faq.helpfulCount || 0) - 1);
        faq.notHelpfulCount = (faq.notHelpfulCount || 0) + 1;
      }
      faq.votes[existingVoteIndex].isHelpful = isHelpful;
      faq.votes[existingVoteIndex].votedAt = new Date();
      message = 'Your vote has been updated!';
    }

    await faq.save();
    await invalidateFaqCache();

    res.json({
      success: true,
      message,
      data: {
        id: faq._id,
        isVoted,
        votedUserId: isVoted ? String(userId) : null,
        userVote,
        helpfulCount: faq.helpfulCount,
        notHelpfulCount: faq.notHelpfulCount,
        totalVotes: faq.votes.length,
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
  getFaqVotesAdmin,
  reorderFaqs,

  // Public / User controllers
  getFaqsPublic,
  getFaqById,
  voteFaqHelpful,
};
