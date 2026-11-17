const mongoose = require('mongoose');
const Testimonial = require('./testimonial.model');
const redisService = require('../../services/redis.service');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../../services/cloudinary.service');

/**
 * Invalidate all Testimonials Redis caches
 */
async function invalidateTestimonialCache() {
  try {
    await redisService.delPattern('testimonials:*');
  } catch (err) {
    console.warn('[TestimonialController] Redis cache invalidation warning:', err.message);
  }
}

/**
 * Helper: Extract avatar from Multer file upload or body URL
 */
async function extractOrUploadAvatar(req, currentAvatar = null) {
  let fileToUpload = null;

  if (req.file) {
    fileToUpload = req.file;
  } else if (req.files) {
    if (req.files.avatar && req.files.avatar[0]) fileToUpload = req.files.avatar[0];
    else if (req.files.image && req.files.image[0]) fileToUpload = req.files.image[0];
    else if (req.files.file && req.files.file[0]) fileToUpload = req.files.file[0];
    else if (Array.isArray(req.files) && req.files[0]) fileToUpload = req.files[0];
  }

  // 1. If a new file was uploaded via multipart/form-data
  if (fileToUpload) {
    try {
      if (currentAvatar && currentAvatar.publicId) {
        deleteFromCloudinary(currentAvatar.publicId, 'image').catch((e) =>
          console.warn('[Testimonial] Cleanup previous avatar warning:', e.message)
        );
      }
      const uploadRes = await uploadToCloudinary(fileToUpload.buffer, {
        folder: 'rp-testimonials',
        resource_type: 'image',
      });
      return {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
      };
    } catch (err) {
      console.error('[Testimonial] Cloudinary upload error:', err.message);
      // If Cloudinary fails or not configured, return fallback if available
      return currentAvatar || { url: null, publicId: null };
    }
  }

  // 2. If an avatar string URL was provided in req.body
  if (req.body.avatar) {
    if (typeof req.body.avatar === 'string' && req.body.avatar.trim().length > 0) {
      return {
        url: req.body.avatar.trim(),
        publicId: null,
      };
    }
    if (typeof req.body.avatar === 'object' && req.body.avatar.url) {
      return {
        url: req.body.avatar.url,
        publicId: req.body.avatar.publicId || null,
      };
    }
  }

  return currentAvatar || { url: null, publicId: null };
}

// ==========================================
// 1. PUBLIC CONTROLLERS (Visitors & Users)
// ==========================================

/**
 * Get Published & Active Testimonials (Public / User - Cached in Redis)
 * Supports pagination, rating filter, featured filter, and sorting
 */
async function getTestimonialsPublic(req, res, next) {
  try {
    const {
      page = 1,
      limit = 10,
      rating,
      featured,
      sort = 'latest',
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Cache key for Redis
    const cacheKey = `testimonials:public:${rating || 'all'}:${featured || 'all'}:${sort || 'latest'}:${search || 'none'}:${pageNum}:${limitNum}`;
    
    // Check Redis cache first (unless search query is present)
    if (!search) {
      const cachedData = await redisService.get(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          cached: true,
          ...cachedData,
        });
      }
    }

    // Public query: ONLY active AND approved
    const query = {
      isActive: true,
      status: 'approved',
    };

    if (rating && !isNaN(Number(rating))) {
      query.rating = Number(rating);
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { designation: searchRegex },
        { company: searchRegex },
        { message: searchRegex },
      ];
    }

    // Sort order
    let sortOptions = { sortOrder: 1, createdAt: -1 };
    if (sort === 'oldest') {
      sortOptions = { createdAt: 1 };
    } else if (sort === 'rating_high') {
      sortOptions = { rating: -1, createdAt: -1 };
    } else if (sort === 'rating_low') {
      sortOptions = { rating: 1, createdAt: -1 };
    } else if (sort === 'featured') {
      sortOptions = { isFeatured: -1, sortOrder: 1, createdAt: -1 };
    }

    const [testimonials, total, statsAgg] = await Promise.all([
      Testimonial.find(query)
        .populate('user', 'name profileImage')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Testimonial.countDocuments(query),

      // Overall rating statistics for active & approved testimonials
      Testimonial.aggregate([
        { $match: { isActive: true, status: 'approved' } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
            fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
            fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            oneStars: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = statsAgg[0] || {
      avgRating: 5,
      totalReviews: 0,
      fiveStars: 0,
      fourStars: 0,
      threeStars: 0,
      twoStars: 0,
      oneStars: 0,
    };

    const responsePayload = {
      data: {
        testimonials,
        stats: {
          averageRating: Number((stats.avgRating || 5).toFixed(1)),
          totalReviews: stats.totalReviews || 0,
          distribution: {
            5: stats.fiveStars || 0,
            4: stats.fourStars || 0,
            3: stats.threeStars || 0,
            2: stats.twoStars || 0,
            1: stats.oneStars || 0,
          },
        },
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      },
    };

    // Cache in Redis for 5 minutes (300 seconds)
    if (!search) {
      await redisService.set(cacheKey, responsePayload, 300);
    }

    res.json({
      success: true,
      cached: false,
      ...responsePayload,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Testimonial by ID (Public - Only approved & active)
 */
async function getTestimonialByIdPublic(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id)
      .populate('user', 'name profileImage')
      .lean();

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    const currentUserId = req.user?._id || req.user?.id;
    const isOwner = currentUserId && String(testimonial.user?._id || testimonial.user) === String(currentUserId);
    const isAdmin = req.user?.role === 'admin';

    // If not active or not approved, only owner or admin can view
    if ((!testimonial.isActive || testimonial.status !== 'approved') && !isOwner && !isAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found or not published yet.',
      });
    }

    res.json({
      success: true,
      data: { testimonial },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 2. USER FEEDBACK CONTROLLERS (Authenticated)
// ==========================================

/**
 * User Submits Feedback / Testimonial
 * Saved with status: 'pending' (Awaits Admin approval)
 */
async function submitFeedbackUser(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const {
      name,
      designation,
      company,
      rating,
      message,
    } = req.body;

    // Check if user already has an active pending feedback to avoid spam
    const existingPending = await Testimonial.findOne({
      user: userId,
      status: 'pending',
    });

    if (existingPending) {
      return res.status(409).json({
        success: false,
        message: 'You already have a feedback pending review. You can update your pending feedback or wait for admin approval.',
        data: {
          existingFeedbackId: existingPending._id,
          status: 'pending',
        },
      });
    }

    // Process avatar (uploaded file, string url, or user's existing profileImage)
    let avatar = await extractOrUploadAvatar(req);
    if (!avatar.url && req.user.profileImage) {
      avatar = {
        url: req.user.profileImage,
        publicId: null,
      };
    }

    const clientName = (name && name.trim()) || req.user.name || 'Verified Client';
    const clientDesignation = (designation && designation.trim()) || 'Client';
    const clientCompany = (company && company.trim()) || '';
    const clientRating = rating !== undefined ? Math.min(5, Math.max(1, Number(rating))) : 5;

    const testimonial = new Testimonial({
      name: clientName,
      designation: clientDesignation,
      company: clientCompany,
      rating: clientRating,
      message: message.trim(),
      avatar,
      user: userId,
      createdBy: userId,
      source: 'user',
      status: 'pending', // Starts in pending stage until admin approves
      isActive: true,
      isFeatured: false,
    });

    await testimonial.save();

    res.status(201).json({
      success: true,
      message: 'Thank you! Your feedback has been submitted successfully and is currently pending admin approval.',
      data: {
        testimonial,
        status: 'pending',
        canEdit: true,
        canDelete: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User views their own submitted feedbacks
 * Shows status (pending, approved, rejected) and editing rights
 */
async function getMyFeedbacksUser(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;

    const feedbacks = await Testimonial.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    const formattedFeedbacks = feedbacks.map((item) => {
      const isPending = item.status === 'pending';
      const isApproved = item.status === 'approved';
      const isRejected = item.status === 'rejected';

      let statusInfo = '';
      if (isPending) {
        statusInfo = 'Your feedback is under review by the admin team. You can still edit or delete it.';
      } else if (isApproved) {
        statusInfo = 'Your feedback is approved and visible to everyone! Editing is closed, but you may delete it anytime.';
      } else if (isRejected) {
        statusInfo = `Your feedback was not approved. Reason: ${item.rejectionReason || 'Did not meet publishing guidelines'}. You may delete it.`;
      }

      return {
        ...item,
        canEdit: isPending, // User can ONLY edit while in pending stage!
        canDelete: true,    // User can delete at any stage
        statusInfo,
      };
    });

    res.json({
      success: true,
      count: formattedFeedbacks.length,
      data: {
        feedbacks: formattedFeedbacks,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User updates their own feedback
 * RULE: Allowed ONLY when status === 'pending'.
 * Once approved, updating is closed! (Only delete is allowed)
 */
async function updateFeedbackUser(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found.',
      });
    }

    // Verify ownership
    if (!testimonial.user || String(testimonial.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this feedback. You can only update your own feedback.',
      });
    }

    // STRICT REQUIREMENT CHECK:
    // "jab tk uska feedback pending stage pe he vo update kar sakega agr approvd hua wese hi updating close ho jayegi... fir bss vo delete kar sakega..."
    if (testimonial.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'This feedback has already been approved and cannot be updated. Updating is closed once approved. You can only delete it.',
        canEdit: false,
        canDelete: true,
        status: 'approved',
      });
    }

    if (testimonial.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This feedback is currently in "${testimonial.status}" status and cannot be updated. Only pending feedback can be updated.`,
        canEdit: false,
        canDelete: true,
        status: testimonial.status,
      });
    }

    // Update allowed fields
    const { message, rating, name, designation, company } = req.body;

    if (message) testimonial.message = message.trim();
    if (rating !== undefined && !isNaN(Number(rating))) {
      testimonial.rating = Math.min(5, Math.max(1, Number(rating)));
    }
    if (name !== undefined) testimonial.name = name.trim();
    if (designation !== undefined) testimonial.designation = designation.trim();
    if (company !== undefined) testimonial.company = company.trim();

    // Check for avatar upload / update
    const updatedAvatar = await extractOrUploadAvatar(req, testimonial.avatar);
    if (updatedAvatar && updatedAvatar.url) {
      testimonial.avatar = updatedAvatar;
    }

    await testimonial.save();

    res.json({
      success: true,
      message: 'Your pending feedback has been updated successfully.',
      data: {
        testimonial,
        status: 'pending',
        canEdit: true,
        canDelete: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User deletes their own feedback
 * RULE: Allowed at ANY stage (pending, approved, or rejected)
 */
async function deleteFeedbackUser(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found.',
      });
    }

    // Verify ownership
    if (!testimonial.user || String(testimonial.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this feedback.',
      });
    }

    // Delete image from Cloudinary if uploaded
    if (testimonial.avatar && testimonial.avatar.publicId) {
      deleteFromCloudinary(testimonial.avatar.publicId, 'image').catch((e) =>
        console.warn('[Testimonial] Cleanup avatar warning:', e.message)
      );
    }

    const wasApproved = testimonial.status === 'approved' && testimonial.isActive;

    await Testimonial.findByIdAndDelete(id);

    // If it was public & approved, invalidate cache
    if (wasApproved) {
      await invalidateTestimonialCache();
    }

    res.json({
      success: true,
      message: 'Your feedback has been deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 3. ADMIN CONTROLLERS (Protected - Admin)
// ==========================================

/**
 * Admin creates a Testimonial directly (Showcase / Marketing review)
 * Defaults to status: 'approved', source: 'admin'
 */
async function createTestimonialAdmin(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      name,
      designation = 'Client',
      company = '',
      rating = 5,
      message,
      status = 'approved',
      isActive = true,
      isFeatured = false,
      sortOrder = 0,
      adminNotes = null,
    } = req.body;

    const avatar = await extractOrUploadAvatar(req);

    const isApprovedStatus = status === 'approved';

    const testimonial = new Testimonial({
      name: name.trim(),
      designation: designation ? designation.trim() : 'Client',
      company: company ? company.trim() : '',
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      message: message.trim(),
      avatar,
      source: 'admin',
      status,
      isActive: Boolean(isActive),
      isFeatured: Boolean(isFeatured),
      sortOrder: Number(sortOrder) || 0,
      adminNotes: adminNotes ? adminNotes.trim() : null,
      createdBy: adminId,
      approvedBy: isApprovedStatus ? adminId : null,
      approvedAt: isApprovedStatus ? new Date() : null,
    });

    await testimonial.save();
    await invalidateTestimonialCache();

    res.status(201).json({
      success: true,
      message: 'Testimonial created successfully by admin.',
      data: { testimonial },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Get All Testimonials with advanced filtering, search, and metrics
 */
async function getAllTestimonialsAdmin(req, res, next) {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'all',
      isActive = 'all',
      source = 'all',
      rating,
      featured,
      search,
      sort = 'latest',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (isActive !== 'all' && (isActive === 'true' || isActive === 'false')) {
      query.isActive = isActive === 'true';
    }

    if (source && source !== 'all') {
      query.source = source;
    }

    if (rating && !isNaN(Number(rating))) {
      query.rating = Number(rating);
    }

    if (featured === 'true' || featured === 'false') {
      query.isFeatured = featured === 'true';
    }

    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { designation: searchRegex },
        { company: searchRegex },
        { message: searchRegex },
      ];
    }

    let sortOptions = { createdAt: -1 };
    if (sort === 'oldest') {
      sortOptions = { createdAt: 1 };
    } else if (sort === 'rating_high') {
      sortOptions = { rating: -1, createdAt: -1 };
    } else if (sort === 'rating_low') {
      sortOptions = { rating: 1, createdAt: -1 };
    } else if (sort === 'pending_first') {
      sortOptions = { status: -1, createdAt: -1 };
    } else if (sort === 'sortOrder') {
      sortOptions = { sortOrder: 1, createdAt: -1 };
    }

    const [testimonials, total, summaryAgg] = await Promise.all([
      Testimonial.find(query)
        .populate('user', 'name phone email profileImage')
        .populate('approvedBy', 'name email')
        .populate('createdBy', 'name email')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Testimonial.countDocuments(query),

      Testimonial.aggregate([
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejectedCount: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            activeCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
            inactiveCount: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
            userSubmittedCount: { $sum: { $cond: [{ $eq: ['$source', 'user'] }, 1, 0] } },
            adminCreatedCount: { $sum: { $cond: [{ $eq: ['$source', 'admin'] }, 1, 0] } },
            averageRating: { $avg: '$rating' },
          },
        },
      ]),
    ]);

    const summary = summaryAgg[0] || {
      totalCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      userSubmittedCount: 0,
      adminCreatedCount: 0,
      averageRating: 5,
    };

    res.json({
      success: true,
      data: {
        summary: {
          total: summary.totalCount || 0,
          pending: summary.pendingCount || 0,
          approved: summary.approvedCount || 0,
          rejected: summary.rejectedCount || 0,
          active: summary.activeCount || 0,
          inactive: summary.inactiveCount || 0,
          userSubmitted: summary.userSubmittedCount || 0,
          adminCreated: summary.adminCreatedCount || 0,
          averageRating: Number((summary.averageRating || 5).toFixed(1)),
        },
        testimonials,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Get Single Testimonial details
 */
async function getTestimonialByIdAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id)
      .populate('user', 'name phone email profileImage')
      .populate('approvedBy', 'name email')
      .populate('createdBy', 'name email')
      .lean();

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    res.json({
      success: true,
      data: { testimonial },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Update Testimonial (Full update)
 */
async function updateTestimonialAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    const {
      name,
      designation,
      company,
      rating,
      message,
      status,
      isActive,
      isFeatured,
      sortOrder,
      adminNotes,
      rejectionReason,
    } = req.body;

    if (name) testimonial.name = name.trim();
    if (designation !== undefined) testimonial.designation = designation.trim();
    if (company !== undefined) testimonial.company = company.trim();
    if (message) testimonial.message = message.trim();

    if (rating !== undefined && !isNaN(Number(rating))) {
      testimonial.rating = Math.min(5, Math.max(1, Number(rating)));
    }

    // Handle Status Transition
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      if (status === 'approved' && testimonial.status !== 'approved') {
        testimonial.approvedBy = adminId;
        testimonial.approvedAt = new Date();
        testimonial.rejectionReason = null;
      } else if (status === 'rejected') {
        testimonial.rejectionReason = rejectionReason || adminNotes || 'Feedback did not meet publishing guidelines.';
      } else if (status === 'pending') {
        testimonial.approvedBy = null;
        testimonial.approvedAt = null;
      }
      testimonial.status = status;
    }

    if (isActive !== undefined) testimonial.isActive = Boolean(isActive);
    if (isFeatured !== undefined) testimonial.isFeatured = Boolean(isFeatured);
    if (sortOrder !== undefined) testimonial.sortOrder = Number(sortOrder) || 0;
    if (adminNotes !== undefined) testimonial.adminNotes = adminNotes ? adminNotes.trim() : null;
    if (rejectionReason !== undefined) testimonial.rejectionReason = rejectionReason ? rejectionReason.trim() : null;

    // Check for avatar upload / update
    const updatedAvatar = await extractOrUploadAvatar(req, testimonial.avatar);
    if (updatedAvatar && updatedAvatar.url) {
      testimonial.avatar = updatedAvatar;
    }

    await testimonial.save();
    await invalidateTestimonialCache();

    res.json({
      success: true,
      message: 'Testimonial updated successfully by admin.',
      data: { testimonial },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Update Testimonial Moderation Status (Approve / Reject / Pending)
 * "admin dekhega agar sahi lagega to approve karega or vo bhi baki user ko dikhega"
 */
async function updateTestimonialStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user._id || req.user.id;
    const { status, adminNotes, rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    if (status === 'approved') {
      testimonial.status = 'approved';
      testimonial.approvedBy = adminId;
      testimonial.approvedAt = new Date();
      testimonial.rejectionReason = null;
      if (adminNotes) testimonial.adminNotes = adminNotes.trim();
    } else if (status === 'rejected') {
      testimonial.status = 'rejected';
      testimonial.rejectionReason = rejectionReason || adminNotes || 'Feedback did not meet publishing guidelines.';
      if (adminNotes) testimonial.adminNotes = adminNotes.trim();
    } else if (status === 'pending') {
      testimonial.status = 'pending';
      testimonial.approvedBy = null;
      testimonial.approvedAt = null;
      if (adminNotes) testimonial.adminNotes = adminNotes.trim();
    }

    await testimonial.save();
    await invalidateTestimonialCache();

    res.json({
      success: true,
      message: `Testimonial status has been updated to "${status}".${status === 'approved' ? ' It is now live for all users.' : ''}`,
      data: {
        testimonial,
        status: testimonial.status,
        isActive: testimonial.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Toggle Active / Inactive Status
 */
async function toggleActiveStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    testimonial.isActive = !testimonial.isActive;
    await testimonial.save();
    await invalidateTestimonialCache();

    res.json({
      success: true,
      message: `Testimonial is now ${testimonial.isActive ? 'active' : 'inactive'}.`,
      data: {
        id: testimonial._id,
        isActive: testimonial.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Toggle Featured Status
 */
async function toggleFeaturedStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    testimonial.isFeatured = !testimonial.isFeatured;
    await testimonial.save();
    await invalidateTestimonialCache();

    res.json({
      success: true,
      message: `Testimonial is now ${testimonial.isFeatured ? 'featured' : 'unfeatured'}.`,
      data: {
        id: testimonial._id,
        isFeatured: testimonial.isFeatured,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Delete Testimonial
 */
async function deleteTestimonialAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid testimonial ID format.',
      });
    }

    const testimonial = await Testimonial.findById(id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: 'Testimonial not found.',
      });
    }

    // Clean avatar from Cloudinary
    if (testimonial.avatar && testimonial.avatar.publicId) {
      deleteFromCloudinary(testimonial.avatar.publicId, 'image').catch((e) =>
        console.warn('[Testimonial] Cleanup avatar warning:', e.message)
      );
    }

    await Testimonial.findByIdAndDelete(id);
    await invalidateTestimonialCache();

    res.json({
      success: true,
      message: 'Testimonial deleted successfully by admin.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Public
  getTestimonialsPublic,
  getTestimonialByIdPublic,

  // User Feedbacks
  submitFeedbackUser,
  getMyFeedbacksUser,
  updateFeedbackUser,
  deleteFeedbackUser,

  // Admin
  createTestimonialAdmin,
  getAllTestimonialsAdmin,
  getTestimonialByIdAdmin,
  updateTestimonialAdmin,
  updateTestimonialStatusAdmin,
  toggleActiveStatusAdmin,
  toggleFeaturedStatusAdmin,
  deleteTestimonialAdmin,
};
