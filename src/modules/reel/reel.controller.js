const mongoose = require('mongoose');
const Reel = require('./reel.model');
const Booking = require('../booking/booking.model');
const UserAddress = require('../user/userAddress.model');
const redisService = require('../../services/redis.service');
const {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
} = require('../../services/cloudinary.service');

/**
 * Invalidate Redis caches related to reels
 */
async function invalidateReelCache() {
  try {
    await redisService.delPattern('reels:*');
  } catch (err) {
    console.error('[ReelController] Cache invalidation warning:', err.message);
  }
}

/**
 * Helper to generate booking reference number
 */
function generateBookingNumber() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `BK-REEL-${dateStr}-${randomSuffix}`;
}

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * Upload / Create a new Reel (Admin)
 */
async function createReel(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      title,
      description,
      tags,
      videoUrl,
      thumbnailUrl,
      adminDesign,
      isPublished = true,
      status = 'published',
    } = req.body;

    let videoData = {
      url: videoUrl || null,
      publicId: null,
      duration: 0,
      format: 'mp4',
      bytes: 0,
    };

    let thumbnailData = {
      url: thumbnailUrl || null,
      publicId: null,
    };

    // 1. Handle Video Upload if file is present
    if (req.files) {
      if (req.files.video && req.files.video[0]) {
        const videoFile = req.files.video[0];
        const uploadRes = await uploadToCloudinary(videoFile.buffer, {
          folder: 'rp-reels/videos',
          resource_type: 'video',
        });
        videoData = {
          url: uploadRes.secure_url,
          publicId: uploadRes.public_id,
          duration: uploadRes.duration || 0,
          format: uploadRes.format || 'mp4',
          bytes: uploadRes.bytes || videoFile.size,
          width: uploadRes.width || null,
          height: uploadRes.height || null,
        };
      } else if (req.file && req.file.mimetype.startsWith('video/')) {
        const uploadRes = await uploadToCloudinary(req.file.buffer, {
          folder: 'rp-reels/videos',
          resource_type: 'video',
        });
        videoData = {
          url: uploadRes.secure_url,
          publicId: uploadRes.public_id,
          duration: uploadRes.duration || 0,
          format: uploadRes.format || 'mp4',
          bytes: uploadRes.bytes || req.file.size,
          width: uploadRes.width || null,
          height: uploadRes.height || null,
        };
      }

      // Handle Thumbnail file upload
      if (req.files.thumbnail && req.files.thumbnail[0]) {
        const thumbFile = req.files.thumbnail[0];
        const uploadThumbRes = await uploadToCloudinary(thumbFile.buffer, {
          folder: 'rp-reels/thumbnails',
          resource_type: 'image',
        });
        thumbnailData = {
          url: uploadThumbRes.secure_url,
          publicId: uploadThumbRes.public_id,
        };
      }
    }

    if (!videoData.url) {
      return res.status(400).json({
        success: false,
        message: 'Video file or videoUrl is required to create a reel.',
      });
    }

    // 2. Parse tags
    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map((t) => String(t).trim().toLowerCase());
    } else if (typeof tags === 'string') {
      try {
        const jsonTags = JSON.parse(tags);
        parsedTags = Array.isArray(jsonTags)
          ? jsonTags.map((t) => String(t).trim().toLowerCase())
          : tags.split(',').map((t) => t.trim().toLowerCase());
      } catch {
        parsedTags = tags.split(',').map((t) => t.trim().toLowerCase());
      }
    }

    // 3. Parse Admin Design details
    let parsedDesign = adminDesign;
    if (typeof adminDesign === 'string') {
      try {
        parsedDesign = JSON.parse(adminDesign);
      } catch {
        parsedDesign = {};
      }
    }
    parsedDesign = parsedDesign || {};

    // If design images are attached in multipart
    if (req.files && req.files.designImages && req.files.designImages.length > 0) {
      const designUploads = await uploadMultipleToCloudinary(req.files.designImages, {
        folder: 'rp-reels/designs',
      });
      const uploadedImageUrls = designUploads.map((d) => d.secure_url);
      parsedDesign.images = [
        ...(Array.isArray(parsedDesign.images) ? parsedDesign.images : []),
        ...uploadedImageUrls,
      ];
    }

    const reel = new Reel({
      title: title.trim(),
      description: description ? description.trim() : '',
      tags: parsedTags,
      video: videoData,
      thumbnail: thumbnailData,
      adminDesign: {
        designName: parsedDesign.designName || title.trim(),
        designCode: parsedDesign.designCode || null,
        category: parsedDesign.category || 'bridal',
        price: Number(parsedDesign.price) || 0,
        discountedPrice: parsedDesign.discountedPrice ? Number(parsedDesign.discountedPrice) : null,
        estimatedTime: parsedDesign.estimatedTime || '2-3 hours',
        images: Array.isArray(parsedDesign.images) ? parsedDesign.images : [],
        description: parsedDesign.description || '',
        isBookable: parsedDesign.isBookable !== undefined ? Boolean(parsedDesign.isBookable) : true,
      },
      status: status || 'published',
      isPublished: isPublished !== undefined ? isPublished : true,
      publishedAt: new Date(),
      createdBy: adminId,
    });

    await reel.save();
    await invalidateReelCache();

    res.status(201).json({
      success: true,
      message: 'Reel created and published successfully.',
      data: { reel },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Reel (Admin)
 */
async function updateReel(req, res, next) {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      tags,
      videoUrl,
      thumbnailUrl,
      adminDesign,
      status,
      isPublished,
    } = req.body;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    if (title) reel.title = title.trim();
    if (description !== undefined) reel.description = description.trim();

    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        reel.tags = tags.map((t) => String(t).trim().toLowerCase());
      } else if (typeof tags === 'string') {
        try {
          const jsonTags = JSON.parse(tags);
          reel.tags = Array.isArray(jsonTags)
            ? jsonTags.map((t) => String(t).trim().toLowerCase())
            : tags.split(',').map((t) => t.trim().toLowerCase());
        } catch {
          reel.tags = tags.split(',').map((t) => t.trim().toLowerCase());
        }
      }
    }

    if (status) reel.status = status;
    if (isPublished !== undefined) reel.isPublished = Boolean(isPublished);

    if (videoUrl) {
      reel.video.url = videoUrl;
    }

    if (thumbnailUrl) {
      reel.thumbnail.url = thumbnailUrl;
    }

    // Handle file replacements
    if (req.files) {
      if (req.files.video && req.files.video[0]) {
        const videoFile = req.files.video[0];
        const uploadRes = await uploadToCloudinary(videoFile.buffer, {
          folder: 'rp-reels/videos',
          resource_type: 'video',
        });
        reel.video = {
          url: uploadRes.secure_url,
          publicId: uploadRes.public_id,
          duration: uploadRes.duration || 0,
          format: uploadRes.format || 'mp4',
          bytes: uploadRes.bytes || videoFile.size,
          width: uploadRes.width || null,
          height: uploadRes.height || null,
        };
      }

      if (req.files.thumbnail && req.files.thumbnail[0]) {
        const thumbFile = req.files.thumbnail[0];
        const uploadThumbRes = await uploadToCloudinary(thumbFile.buffer, {
          folder: 'rp-reels/thumbnails',
          resource_type: 'image',
        });
        reel.thumbnail = {
          url: uploadThumbRes.secure_url,
          publicId: uploadThumbRes.public_id,
        };
      }
    }

    // Parse adminDesign
    if (adminDesign !== undefined) {
      let parsedDesign = adminDesign;
      if (typeof adminDesign === 'string') {
        try {
          parsedDesign = JSON.parse(adminDesign);
        } catch {
          parsedDesign = {};
        }
      }

      if (parsedDesign.designName) reel.adminDesign.designName = parsedDesign.designName;
      if (parsedDesign.designCode !== undefined) reel.adminDesign.designCode = parsedDesign.designCode;
      if (parsedDesign.category) reel.adminDesign.category = parsedDesign.category;
      if (parsedDesign.price !== undefined) reel.adminDesign.price = Number(parsedDesign.price);
      if (parsedDesign.discountedPrice !== undefined)
        reel.adminDesign.discountedPrice = parsedDesign.discountedPrice ? Number(parsedDesign.discountedPrice) : null;
      if (parsedDesign.estimatedTime) reel.adminDesign.estimatedTime = parsedDesign.estimatedTime;
      if (parsedDesign.description !== undefined) reel.adminDesign.description = parsedDesign.description;
      if (parsedDesign.isBookable !== undefined) reel.adminDesign.isBookable = Boolean(parsedDesign.isBookable);
      if (Array.isArray(parsedDesign.images)) reel.adminDesign.images = parsedDesign.images;
    }

    await reel.save();
    await invalidateReelCache();

    res.json({
      success: true,
      message: 'Reel updated successfully.',
      data: { reel },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Reel (Admin)
 */
async function deleteReel(req, res, next) {
  try {
    const { id } = req.params;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    // Clean up Cloudinary assets if publicIds are present
    if (reel.video && reel.video.publicId) {
      deleteFromCloudinary(reel.video.publicId, 'video').catch((e) =>
        console.warn('Video deletion from Cloudinary failed:', e.message)
      );
    }
    if (reel.thumbnail && reel.thumbnail.publicId) {
      deleteFromCloudinary(reel.thumbnail.publicId, 'image').catch((e) =>
        console.warn('Thumbnail deletion from Cloudinary failed:', e.message)
      );
    }

    await Reel.findByIdAndDelete(id);
    await invalidateReelCache();

    res.json({
      success: true,
      message: 'Reel deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Publish / Unpublish Status (Admin)
 */
async function togglePublishReel(req, res, next) {
  try {
    const { id } = req.params;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    reel.isPublished = !reel.isPublished;
    reel.status = reel.isPublished ? 'published' : 'draft';
    if (reel.isPublished && !reel.publishedAt) {
      reel.publishedAt = new Date();
    }

    await reel.save();
    await invalidateReelCache();

    res.json({
      success: true,
      message: `Reel has been ${reel.isPublished ? 'published' : 'unpublished'} successfully.`,
      data: {
        id: reel._id,
        isPublished: reel.isPublished,
        status: reel.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Reels (Admin - with metrics, filters, pagination)
 */
async function getAllReelsAdmin(req, res, next) {
  try {
    const { status, isPublished, tag, category, search, page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status) query.status = status;
    if (isPublished !== undefined) query.isPublished = isPublished === 'true';
    if (tag) query.tags = tag.toLowerCase();
    if (category) query['adminDesign.category'] = category;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'adminDesign.designName': { $regex: search, $options: 'i' } },
      ];
    }

    const [reels, total] = await Promise.all([
      Reel.find(query)
        .populate('createdBy', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Reel.countDocuments(query),
    ]);

    // Aggregate overall metrics
    const stats = await Reel.aggregate([
      {
        $group: {
          _id: null,
          totalReels: { $sum: 1 },
          totalViews: { $sum: '$viewCount' },
          totalLikes: { $sum: '$likeCount' },
          totalComments: { $sum: '$commentCount' },
          totalShares: { $sum: '$shareCount' },
          totalBookings: { $sum: '$bookingCount' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: stats[0] || {
          totalReels: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          totalBookings: 0,
        },
        reels,
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
 * Get Comprehensive Reel Details & Analytics (Admin)
 * Shows:
 * 1. Kisne like kiya (Users list with profile, phone, email, likedAt)
 * 2. Kya kya comment kiya (All comments with users and timestamps)
 * 3. Kisne kisne dekha (Viewers list with user info, IP, watch duration, timestamps)
 * 4. Shares breakdown
 * 5. Bookings made from this reel
 */
async function getReelDetailsAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reel ID format.',
      });
    }

    const reel = await Reel.findById(id)
      .populate('createdBy', 'name email phone')
      .populate('likes.userId', 'name phone email profileImage')
      .populate('comments.userId', 'name phone email profileImage')
      .populate('views.userId', 'name phone email profileImage')
      .populate('shares.userId', 'name phone email profileImage');

    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    // Find all bookings generated with this reel's design
    const relatedBookings = await Booking.find({
      'selectedDesigns.designName': reel.adminDesign.designName,
    })
      .populate('userId', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(20);

    // Group & clean viewers list
    const registeredViewers = [];
    const anonymousViewers = [];

    reel.views.forEach((v) => {
      if (v.userId) {
        registeredViewers.push({
          user: v.userId,
          viewedAt: v.viewedAt,
          watchDuration: v.watchDuration,
          ip: v.ip,
          userAgent: v.userAgent,
        });
      } else {
        anonymousViewers.push({
          ip: v.ip,
          viewedAt: v.viewedAt,
          watchDuration: v.watchDuration,
          userAgent: v.userAgent,
        });
      }
    });

    res.json({
      success: true,
      data: {
        reel: {
          _id: reel._id,
          title: reel.title,
          description: reel.description,
          tags: reel.tags,
          video: reel.video,
          thumbnail: reel.thumbnail,
          adminDesign: reel.adminDesign,
          isPublished: reel.isPublished,
          status: reel.status,
          publishedAt: reel.publishedAt,
          createdBy: reel.createdBy,
          createdAt: reel.createdAt,
          updatedAt: reel.updatedAt,
        },
        analytics: {
          totalViews: reel.viewCount,
          uniqueViews: reel.uniqueViewCount,
          totalLikes: reel.likeCount,
          totalComments: reel.commentCount,
          totalShares: reel.shareCount,
          totalBookings: reel.bookingCount,
        },
        engagementDetails: {
          // Kisne like kiya
          likedByUsers: reel.likes.map((l) => ({
            user: l.userId,
            likedAt: l.likedAt,
          })),

          // Kya kya comment kiya
          comments: reel.comments.map((c) => ({
            _id: c._id,
            user: c.userId,
            text: c.text,
            createdAt: c.createdAt,
          })),

          // Kisne kisne dekha
          viewers: {
            registeredCount: registeredViewers.length,
            anonymousCount: anonymousViewers.length,
            registeredViewers,
            anonymousViewers: anonymousViewers.slice(0, 50), // cap sample anonymous views
          },

          // Shares
          shares: reel.shares,

          // Bookings generated
          bookings: relatedBookings,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Any Comment (Admin)
 */
async function deleteCommentAdmin(req, res, next) {
  try {
    const { id, commentId } = req.params;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const commentIndex = reel.comments.findIndex(
      (c) => c._id.toString() === commentId.toString()
    );

    if (commentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found on this reel.',
      });
    }

    reel.comments.splice(commentIndex, 1);
    reel.commentCount = Math.max(0, reel.comments.length);
    await reel.save();

    res.json({
      success: true,
      message: 'Comment deleted successfully by admin.',
      data: {
        commentCount: reel.commentCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// USER / PUBLIC CONTROLLERS
// ==========================================

/**
 * Get Reel Feed (Public / Authenticated)
 * Supports pagination, tag filter, category, search, sorting
 * If user is authenticated, annotates `isLiked` and `hasViewed`
 */
async function getReelFeed(req, res, next) {
  try {
    const userId = req.user ? (req.user._id || req.user.id) : null;
    const {
      tag,
      category,
      search,
      sort = 'latest', // latest, trending, popular, most_booked
      page = 1,
      limit = 10,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Cache key for guests
    const cacheKey = `reels:feed:${tag || 'all'}:${category || 'all'}:${sort}:${pageNum}:${limitNum}`;
    if (!userId && !search) {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: {
            ...cached,
            cached: true,
          },
        });
      }
    }

    const query = {
      isPublished: true,
      status: 'published',
    };

    if (tag) {
      query.tags = tag.toLowerCase().trim();
    }

    if (category) {
      query['adminDesign.category'] = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
        { 'adminDesign.designName': { $regex: search, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'trending' || sort === 'popular') {
      sortOption = { likeCount: -1, viewCount: -1, createdAt: -1 };
    } else if (sort === 'most_booked') {
      sortOption = { bookingCount: -1, createdAt: -1 };
    }

    const [rawReels, total] = await Promise.all([
      Reel.find(query)
        .select('-views') // Exclude heavy views array from feed for speed
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Reel.countDocuments(query),
    ]);

    // Annotate user specific flags: isLiked, hasViewed
    const reels = rawReels.map((r) => {
      let isLiked = false;
      if (userId && Array.isArray(r.likes)) {
        isLiked = r.likes.some((l) => l.userId && l.userId.toString() === userId.toString());
      }

      // Hide internal raw likes array from light feed
      delete r.likes;

      return {
        ...r,
        isLiked,
      };
    });

    const result = {
      reels,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };

    if (!userId && !search) {
      await redisService.set(cacheKey, result, 60); // cache for 60s
    }

    res.json({
      success: true,
      data: {
        ...result,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Reel by ID (Public / Authenticated)
 */
async function getReelById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user ? (req.user._id || req.user.id) : null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reel ID format.',
      });
    }

    const reel = await Reel.findById(id)
      .populate('createdBy', 'name profileImage')
      .populate({
        path: 'comments.userId',
        select: 'name profileImage',
      })
      .lean();

    if (!reel || (!reel.isPublished && req.user?.role !== 'admin')) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    let isLiked = false;
    let hasViewed = false;

    if (userId) {
      if (Array.isArray(reel.likes)) {
        isLiked = reel.likes.some((l) => l.userId && l.userId.toString() === userId.toString());
      }
      if (Array.isArray(reel.views)) {
        hasViewed = reel.views.some((v) => v.userId && v.userId.toString() === userId.toString());
      }
    }

    // Exclude views raw list from public endpoint for user privacy
    delete reel.views;
    delete reel.likes;

    res.json({
      success: true,
      data: {
        reel: {
          ...reel,
          isLiked,
          hasViewed,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Track Reel Play / View (Optional Auth / User Token)
 * "jese hi reel play ho user token se dekho ki kisne dekha hai kisne nahi....."
 */
async function trackReelView(req, res, next) {
  try {
    const { id } = req.params;
    const { watchDuration = 0 } = req.body;
    const user = req.user;
    const userId = user ? (user._id || user.id) : null;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reel ID format.',
      });
    }

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const viewEntry = {
      userId: userId || null,
      userName: user ? user.name : null,
      userPhone: user ? user.phone : null,
      ip: clientIp,
      userAgent,
      viewedAt: new Date(),
      watchDuration: Number(watchDuration) || 0,
    };

    let isFirstTimeView = false;
    if (userId) {
      const alreadyViewed = reel.views.some(
        (v) => v.userId && v.userId.toString() === userId.toString()
      );
      if (!alreadyViewed) {
        isFirstTimeView = true;
        reel.uniqueViewCount += 1;
      }
    } else {
      const alreadyViewedByIp = reel.views.some((v) => v.ip && v.ip === clientIp);
      if (!alreadyViewedByIp) {
        reel.uniqueViewCount += 1;
      }
    }

    reel.views.push(viewEntry);
    reel.viewCount += 1;

    await reel.save();

    res.json({
      success: true,
      message: 'View recorded successfully.',
      data: {
        reelId: reel._id,
        viewCount: reel.viewCount,
        uniqueViewCount: reel.uniqueViewCount,
        isIdentifiedUser: Boolean(userId),
        isFirstTimeView,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Like / Unlike Reel (User)
 */
async function toggleReelLike(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reel ID format.',
      });
    }

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const likeIndex = reel.likes.findIndex(
      (l) => l.userId && l.userId.toString() === userId.toString()
    );

    let isLiked = false;
    if (likeIndex > -1) {
      // Unlike
      reel.likes.splice(likeIndex, 1);
      reel.likeCount = Math.max(0, reel.likes.length);
      isLiked = false;
    } else {
      // Like
      reel.likes.push({
        userId,
        likedAt: new Date(),
      });
      reel.likeCount = reel.likes.length;
      isLiked = true;
    }

    await reel.save();

    res.json({
      success: true,
      message: isLiked ? 'Reel liked.' : 'Reel unliked.',
      data: {
        reelId: reel._id,
        isLiked,
        likeCount: reel.likeCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Track Reel Share (Public / Authenticated)
 */
async function trackReelShare(req, res, next) {
  try {
    const { id } = req.params;
    const { platform = 'direct' } = req.body;
    const userId = req.user ? (req.user._id || req.user.id) : null;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    reel.shares.push({
      userId: userId || null,
      platform: platform.trim(),
      sharedAt: new Date(),
    });
    reel.shareCount += 1;

    await reel.save();

    res.json({
      success: true,
      message: 'Share logged successfully.',
      data: {
        reelId: reel._id,
        shareCount: reel.shareCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Add Comment on Reel (User)
 */
async function addReelComment(req, res, next) {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id || req.user.id;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      text: text.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    reel.comments.push(newComment);
    reel.commentCount = reel.comments.length;

    await reel.save();

    res.status(201).json({
      success: true,
      message: 'Comment added successfully.',
      data: {
        comment: {
          _id: newComment._id,
          text: newComment.text,
          createdAt: newComment.createdAt,
          user: {
            _id: req.user._id || req.user.id,
            name: req.user.name,
            profileImage: req.user.profileImage,
          },
        },
        commentCount: reel.commentCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Reel Comments (Public)
 */
async function getReelComments(req, res, next) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const reel = await Reel.findById(id)
      .populate('comments.userId', 'name profileImage')
      .lean();

    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const sortedComments = (reel.comments || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const paginatedComments = sortedComments.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data: {
        comments: paginatedComments,
        pagination: {
          total: sortedComments.length,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(sortedComments.length / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete User's Own Comment
 */
async function deleteUserComment(req, res, next) {
  try {
    const { id, commentId } = req.params;
    const userId = req.user._id || req.user.id;

    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    const comment = reel.comments.find(
      (c) => c._id.toString() === commentId.toString()
    );

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found.',
      });
    }

    // Check ownership
    if (comment.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only delete your own comment.',
      });
    }

    reel.comments = reel.comments.filter(
      (c) => c._id.toString() !== commentId.toString()
    );
    reel.commentCount = reel.comments.length;

    await reel.save();

    res.json({
      success: true,
      message: 'Comment deleted successfully.',
      data: {
        commentCount: reel.commentCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * "BOOK THIS DESIGN" From Reel (User)
 * Directly creates a booking with the design featured in the Reel!
 */
async function bookDesignFromReel(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      addressId,
      bookingSlots,
      bookingType = 'mehndi',
      eventName,
      brideName,
      groomName,
      numberOfPeople = 1,
      customerRequirements,
      specialInstructions,
      artistCharge = 0,
      travelCharge = 0,
      discount = 0,
      tax = 0,
    } = req.body;

    // 1. Fetch Reel and verify design is bookable
    const reel = await Reel.findById(id);
    if (!reel) {
      return res.status(404).json({
        success: false,
        message: 'Reel not found.',
      });
    }

    if (!reel.adminDesign || !reel.adminDesign.isBookable) {
      return res.status(400).json({
        success: false,
        message: 'The design featured in this reel is currently not available for direct booking.',
      });
    }

    // 2. Fetch User Address Snapshot
    const address = await UserAddress.findOne({ _id: addressId, userId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Selected address not found or does not belong to your account.',
      });
    }

    const addressSnapshot = {
      addressLine: address.addressLine,
      area: address.area,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark,
      latitude: address.latitude,
      longitude: address.longitude,
    };

    // 3. Format Selected Design from Reel
    const designPrice =
      reel.adminDesign.discountedPrice && reel.adminDesign.discountedPrice > 0
        ? reel.adminDesign.discountedPrice
        : reel.adminDesign.price || 0;

    const designImage =
      reel.adminDesign.images && reel.adminDesign.images.length > 0
        ? reel.adminDesign.images[0]
        : reel.thumbnail?.url || reel.video?.url || null;

    const selectedDesigns = [
      {
        designId: reel._id, // References the Reel ID as design identifier
        designName: reel.adminDesign.designName || reel.title,
        designImage,
        price: designPrice,
        quantity: 1,
        notes: `Booked from Reel: "${reel.title}" (Code: ${reel.adminDesign.designCode || 'N/A'})`,
      },
    ];

    // 4. Parse Slots
    let parsedSlots = bookingSlots;
    if (typeof bookingSlots === 'string') {
      try {
        parsedSlots = JSON.parse(bookingSlots);
      } catch {
        parsedSlots = [];
      }
    }

    const formattedSlots = (parsedSlots || []).map((slot) => ({
      date: new Date(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime || null,
      artistCount: Number(slot.artistCount) || 1,
      artistIds: [],
      status: 'pending',
    }));

    // 5. Calculate Pricing
    const designAmount = designPrice;
    const numericArtistCharge = Number(artistCharge) || 0;
    const numericTravelCharge = Number(travelCharge) || 0;
    const numericDiscount = Number(discount) || 0;
    const numericTax = Number(tax) || 0;

    const subtotal = designAmount + numericArtistCharge + numericTravelCharge;
    const totalAmount = Math.max(0, subtotal - numericDiscount + numericTax);

    // 6. Create Booking Document
    const booking = new Booking({
      bookingNumber: generateBookingNumber(),
      userId,
      bookingType: bookingType || 'mehndi',
      selectedDesigns,
      selectedPackage: null,
      referencePhotos: designImage ? [{ url: designImage, originalName: reel.title }] : [],
      customerRequirements: customerRequirements || `Booked directly from Reel: ${reel.title}`,
      specialInstructions: specialInstructions || null,
      bookingSlots: formattedSlots,
      addressId,
      addressSnapshot,
      eventName: eventName || null,
      brideName: brideName || null,
      groomName: groomName || null,
      numberOfPeople: Number(numberOfPeople) || 1,
      subtotal,
      packageAmount: 0,
      designAmount,
      artistCharge: numericArtistCharge,
      travelCharge: numericTravelCharge,
      discount: numericDiscount,
      tax: numericTax,
      totalAmount,
      paymentStatus: 'pending',
      paidAmount: 0,
      remainingAmount: totalAmount,
      status: 'pending',
      adminNotes: `Source: Reel #${reel._id} - ${reel.title}`,
    });

    await booking.save();

    // 7. Increment reel booking conversion count
    reel.bookingCount += 1;
    await reel.save();

    // 8. Invalidate Caches & Publish Notification
    try {
      await redisService.delPattern(`bookings:user:${userId}:*`);
      await redisService.delPattern(`bookings:admin:*`);
      await redisService.publish('notifications', {
        event: 'NEW_REEL_BOOKING',
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        reelId: reel._id,
        reelTitle: reel.title,
        userId,
        totalAmount,
      });
    } catch (cacheErr) {
      console.warn('Booking cache/pub warning:', cacheErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Design "${reel.adminDesign.designName}" successfully booked from reel. Status: Pending confirmation.`,
      data: {
        booking,
        reel: {
          id: reel._id,
          title: reel.title,
          design: reel.adminDesign,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Admin controllers
  createReel,
  updateReel,
  deleteReel,
  togglePublishReel,
  getAllReelsAdmin,
  getReelDetailsAdmin,
  deleteCommentAdmin,

  // User / Public controllers
  getReelFeed,
  getReelById,
  trackReelView,
  toggleReelLike,
  trackReelShare,
  addReelComment,
  getReelComments,
  deleteUserComment,
  bookDesignFromReel,
};
