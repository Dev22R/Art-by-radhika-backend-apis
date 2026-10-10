const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./user.model');
const UserAddress = require('./userAddress.model');
const Booking = require('../booking/booking.model');
const Reel = require('../reel/reel.model');
const Design = require('../design/design.model');
const PlanInquiry = require('../pricing/planInquiry.model');
const config = require('../../config/env');
const redisService = require('../../services/redis.service');
const { uploadToCloudinary } = require('../../services/cloudinary.service');

/**
 * Generate Access and Refresh JWT Tokens
 */
function generateTokens(user) {
  const payload = {
    id: user._id || user.id,
    phone: user.phone,
    role: user.role || 'user',
  };

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });

  return { accessToken, refreshToken };
}

/**
 * Register / Signup User with Phone and Password only
 */
async function signup(req, res, next) {
  try {
    const { phone, password } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this mobile number already exists. Please login.',
      });
    }

    // 2. Create new user with phone and password
    const user = new User({
      phone,
      password,
      role: 'user',
      isPhoneVerified: false,
      isProfileCompleted: false,
      isActive: true,
    });

    await user.save();

    // 3. Generate Auth Tokens
    const tokens = generateTokens(user);

    // 4. Store refresh token in Redis (7 days TTL)
    await redisService.set(`rt:${user._id}`, tokens.refreshToken, 7 * 24 * 3600);

    // 5. Cache user profile in Redis
    const userData = user.toJSON();
    await redisService.set(`user:${user._id}`, userData, 600);

    res.status(201).json({
      success: true,
      message: 'Signup successful! Please complete your profile.',
      data: {
        user: userData,
        isProfileCompleted: false,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * User Login with Mobile Number and Password
 */
async function login(req, res, next) {
  try {
    const { phone, password } = req.body;

    // 1. Find user including password
    const user = await User.findOne({ phone }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.',
      });
    }

    // 2. Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid mobile number or password.',
      });
    }

    // 3. Update last login timestamp
    user.lastLoginAt = new Date();
    await user.save();

    // 4. Generate Tokens
    const tokens = generateTokens(user);

    // 5. Save refresh token in Redis
    await redisService.set(`rt:${user._id}`, tokens.refreshToken, 7 * 24 * 3600);

    // 6. Cache user in Redis
    const userData = user.toJSON();
    await redisService.set(`user:${user._id}`, userData, 600);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        user: userData,
        isProfileCompleted: user.isProfileCompleted,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin Login API (Supports email or phone + password)
 */
async function adminLogin(req, res, next) {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginIdentifier = email || phone || identifier;

    // Build query to find admin by email or phone
    const query = {
      $or: [
        { email: loginIdentifier.toLowerCase() },
        { phone: loginIdentifier },
      ],
    };

    // 1. Find user including password
    const user = await User.findOne(query).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.',
      });
    }

    // 2. Strict Admin Role Check
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This portal is restricted to administrators only.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account has been deactivated. Please contact technical support.',
      });
    }

    // 3. Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.',
      });
    }

    // 4. Update last login timestamp
    user.lastLoginAt = new Date();
    await user.save();

    // 5. Generate Admin Tokens
    const tokens = generateTokens(user);

    // 6. Store Refresh Token in Redis (7 days TTL)
    await redisService.set(`rt:${user._id}`, tokens.refreshToken, 7 * 24 * 3600);

    // 7. Cache user in Redis
    const userData = user.toJSON();
    await redisService.set(`user:${user._id}`, userData, 600);

    res.json({
      success: true,
      message: 'Admin login successful.',
      data: {
        user: userData,
        role: user.role,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Change Password API (Single newPassword field)
 */
async function changePassword(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { newPassword } = req.body;

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    // Update password (pre-save hook will hash it with bcrypt)
    user.password = newPassword;
    await user.save();

    // Invalidate user cache in Redis
    await redisService.del(`user:${userId}`);

    res.json({
      success: true,
      message: 'Password has been changed successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Complete Profile API (Dedicated separate endpoint to complete name, email, profile image)
 */
async function completeProfile(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { name, email, profileImage } = req.body;

    // Check email uniqueness if email provided
    if (email) {
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId },
      });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'This email address is already in use by another account.',
        });
      }
    }

    // Handle uploaded file if present
    let finalProfileImage = profileImage;
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'rp-profiles',
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
      });
      finalProfileImage = uploadResult.secure_url;
    }

    // Update user profile
    const updateData = {
      name,
      isProfileCompleted: true,
    };
    if (email !== undefined) updateData.email = email ? email.toLowerCase() : null;
    if (finalProfileImage !== undefined) updateData.profileImage = finalProfileImage;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const userData = updatedUser.toJSON();

    // Invalidate and update Redis user cache
    await redisService.set(`user:${userId}`, userData, 600);

    res.json({
      success: true,
      message: 'Profile completed successfully.',
      data: {
        user: userData,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Profile Details (Partial updates)
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { name, email, profileImage } = req.body;

    const updateFields = {};
    if (name !== undefined) {
      updateFields.name = name ? name.trim() : null;
      if (name && name.trim()) updateFields.isProfileCompleted = true;
    }
    if (email !== undefined) {
      if (email) {
        const existingEmail = await User.findOne({
          email: email.toLowerCase().trim(),
          _id: { $ne: userId },
        });
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: 'Email address is already taken.',
          });
        }
        updateFields.email = email.toLowerCase().trim();
      } else {
        updateFields.email = null;
      }
    }

    // Handle profile image file upload or string URL
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'rp-profiles',
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
      });
      updateFields.profileImage = uploadResult.secure_url;
    } else if (profileImage !== undefined) {
      updateFields.profileImage = profileImage;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const userData = updatedUser.toJSON();
    await redisService.set(`user:${userId}`, userData, 600);

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: userData,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Current User Profile (Checks Redis cache first)
 */
async function getProfile(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `user:${userId}`;

    // Try Redis cache
    let user = await redisService.get(cacheKey);
    if (!user) {
      const dbUser = await User.findById(userId);
      if (!dbUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }
      user = dbUser.toJSON();
      await redisService.set(cacheKey, user, 600);
    }

    res.json({
      success: true,
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Refresh Access Token using Refresh Token
 */
async function refreshTokenHandler(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required.',
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please log in again.',
      });
    }

    // Verify stored refresh token in Redis
    const storedToken = await redisService.get(`rt:${decoded.id}`);
    if (storedToken && storedToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token mismatch or revoked.',
      });
    }

    // Generate new Access Token
    const newAccessToken = jwt.sign(
      { id: decoded.id, phone: decoded.phone, role: decoded.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      success: true,
      message: 'Access token refreshed successfully.',
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Logout User (Blacklists access token & purges user Redis cache)
 */
async function logout(req, res, next) {
  try {
    const token = req.token;
    const userId = req.user?._id || req.user?.id;

    if (token) {
      // Blacklist token in Redis for 1 hour (3600 seconds)
      await redisService.set(`bl:${token}`, 'logged_out', 3600);
    }

    if (userId) {
      // Invalidate refresh token and user cache in Redis
      await redisService.del(`rt:${userId}`);
      await redisService.del(`user:${userId}`);
      await redisService.del(`user:addresses:${userId}`);
    }

    res.json({
      success: true,
      message: 'Logged out successfully. Tokens and sessions invalidated.',
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// USER ADDRESS CONTROLLERS
// ==========================================

/**
 * Add a new delivery / booking address
 */
async function addAddress(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const {
      label,
      addressLine,
      area,
      city,
      state,
      pincode,
      landmark,
      latitude,
      longitude,
      isDefault,
    } = req.body;

    // Check if user has any existing addresses
    const existingCount = await UserAddress.countDocuments({ userId, isActive: true });

    // If marked as default or first address, unset previous defaults
    const shouldBeDefault = isDefault || existingCount === 0;
    if (shouldBeDefault) {
      await UserAddress.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const address = new UserAddress({
      userId,
      label: label || 'home',
      addressLine,
      area,
      city,
      state,
      pincode,
      landmark,
      latitude,
      longitude,
      isDefault: shouldBeDefault,
      isActive: true,
    });

    await address.save();

    // Invalidate address cache in Redis
    await redisService.del(`user:addresses:${userId}`);

    res.status(201).json({
      success: true,
      message: 'Address added successfully.',
      data: {
        address,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all addresses of the logged in user (with Redis caching)
 */
async function getAddresses(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `user:addresses:${userId}`;

    // 1. Try Redis cache
    const cachedAddresses = await redisService.get(cacheKey);
    if (cachedAddresses) {
      return res.json({
        success: true,
        data: {
          addresses: cachedAddresses,
          cached: true,
        },
      });
    }

    // 2. Fetch from MongoDB
    const addresses = await UserAddress.find({ userId, isActive: true }).sort({ isDefault: -1, createdAt: -1 });

    // 3. Cache in Redis for 5 minutes (300s)
    await redisService.set(cacheKey, addresses, 300);

    res.json({
      success: true,
      data: {
        addresses,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing address
 */
async function updateAddress(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;
    const updateData = { ...req.body };

    // If making default, unset others
    if (updateData.isDefault) {
      await UserAddress.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const updated = await UserAddress.findOneAndUpdate(
      { _id: addressId, userId, isActive: true },
      { $set: updateData },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Address not found or unauthorized.',
      });
    }

    // Invalidate Redis cache
    await redisService.del(`user:addresses:${userId}`);

    res.json({
      success: true,
      message: 'Address updated successfully.',
      data: {
        address: updated,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete an address (Soft delete)
 */
async function deleteAddress(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;

    const deleted = await UserAddress.findOneAndUpdate(
      { _id: addressId, userId, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Address not found.',
      });
    }

    // Invalidate Redis cache
    await redisService.del(`user:addresses:${userId}`);

    res.json({
      success: true,
      message: 'Address deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Set an address as default
 */
async function setDefaultAddress(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;

    // Reset all
    await UserAddress.updateMany({ userId }, { $set: { isDefault: false } });

    const updated = await UserAddress.findOneAndUpdate(
      { _id: addressId, userId, isActive: true },
      { $set: { isDefault: true } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Address not found.',
      });
    }

    // Invalidate Redis cache
    await redisService.del(`user:addresses:${userId}`);

    res.json({
      success: true,
      message: 'Default address updated successfully.',
      data: {
        address: updated,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// ADMIN USER MANAGEMENT CONTROLLERS
// ==========================================

/**
 * 1. Get All Users (Admin)
 * Supports pagination, search (name, phone, email), role filter, status filter, and sorting.
 * Endpoint: GET /api/auth/admin/users or GET /api/users/admin/all
 */
async function getAllUsersAdmin(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      role,
      status, // 'active' | 'blocked' | 'all'
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Default: Exclude admin profiles from user/client management list
    const filter = {
      role: { $ne: 'admin' },
    };

    // Role filter
    if (role && role !== 'all') {
      filter.role = role.trim().toLowerCase();
    }

    // Status filter
    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'blocked' || status === 'inactive') {
      filter.isActive = false;
    }

    // Search by Name, Phone, or Email
    if (search && search.trim().length > 0) {
      const cleanSearch = search.trim();
      const regex = new RegExp(cleanSearch, 'i');
      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
      ];
    }

    // Sort definition
    const sortField = ['createdAt', 'name', 'lastLoginAt', 'phone'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    // Fetch users and counts
    const [users, totalUsers, activeCount, blockedCount] = await Promise.all([
      User.find(filter)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
      User.countDocuments({ ...filter, isActive: true }),
      User.countDocuments({ ...filter, isActive: false }),
    ]);

    // Gather aggregate stats for the fetched users (Bookings count, total spent, addresses count)
    const userIds = users.map((u) => u._id);

    const [bookingAggs, addressCounts, likedReelCounts, likedDesignCounts] = await Promise.all([
      // Bookings summary per user
      Booking.aggregate([
        { $match: { userId: { $in: userIds } } },
        {
          $group: {
            _id: '$userId',
            totalBookings: { $sum: 1 },
            completedBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            totalSpent: {
              $sum: {
                $cond: [{ $not: [{ $in: ['$status', ['cancelled', 'rejected']] }] }, '$paidAmount', 0],
              },
            },
          },
        },
      ]),

      // Addresses count per user
      UserAddress.aggregate([
        { $match: { userId: { $in: userIds }, isActive: true } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),

      // Liked Reels count per user
      Reel.aggregate([
        { $match: { 'likes.userId': { $in: userIds } } },
        { $unwind: '$likes' },
        { $match: { 'likes.userId': { $in: userIds } } },
        { $group: { _id: '$likes.userId', count: { $sum: 1 } } },
      ]),

      // Liked Designs count per user
      Design.aggregate([
        { $match: { 'likes.userId': { $in: userIds } } },
        { $unwind: '$likes' },
        { $match: { 'likes.userId': { $in: userIds } } },
        { $group: { _id: '$likes.userId', count: { $sum: 1 } } },
      ]),
    ]);

    // Map aggregates to user records
    const bookingMap = new Map(bookingAggs.map((b) => [String(b._id), b]));
    const addressMap = new Map(addressCounts.map((a) => [String(a._id), a.count]));
    const likedReelsMap = new Map(likedReelCounts.map((r) => [String(r._id), r.count]));
    const likedDesignsMap = new Map(likedDesignCounts.map((d) => [String(d._id), d.count]));

    const enrichedUsers = users.map((u) => {
      const uIdStr = String(u._id);
      const bStats = bookingMap.get(uIdStr) || { totalBookings: 0, completedBookings: 0, totalSpent: 0 };
      return {
        ...u,
        totalBookings: bStats.totalBookings,
        completedBookings: bStats.completedBookings,
        totalSpent: bStats.totalSpent,
        addressesCount: addressMap.get(uIdStr) || 0,
        likedReelsCount: likedReelsMap.get(uIdStr) || 0,
        likedDesignsCount: likedDesignsMap.get(uIdStr) || 0,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully.',
      data: {
        users: enrichedUsers,
        pagination: {
          totalUsers,
          totalPages: Math.ceil(totalUsers / limitNum) || 1,
          currentPage: pageNum,
          limit: limitNum,
          activeUsersCount: activeCount,
          blockedUsersCount: blockedCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 2. Get Comprehensive User 360° Profile Details (Admin)
 * Returns full profile, all saved addresses, all bookings, all liked reels,
 * all liked designs, all reel comments, and all custom quote inquiries.
 * Endpoint: GET /api/auth/admin/users/:userId/details or GET /api/auth/admin/users/:userId
 */
async function getUserDetailsAdmin(req, res, next) {
  try {
    const { userId, id } = req.params;
    const targetUserId = userId || id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    const userObjId = new mongoose.Types.ObjectId(targetUserId);

    // 1. Fetch User Profile
    const user = await User.findById(userObjId).select('-password').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    // 2. Fetch all related collections in parallel for maximum speed
    const [
      addresses,
      bookings,
      likedReelsRaw,
      likedDesignsRaw,
      reelComments,
      inquiries,
    ] = await Promise.all([
      // Saved Addresses
      UserAddress.find({ userId: userObjId, isActive: true })
        .sort({ isDefault: -1, createdAt: -1 })
        .lean(),

      // Bookings History
      Booking.find({ userId: userObjId })
        .sort({ createdAt: -1 })
        .select(
          'bookingNumber bookingType brideName groomName eventName totalAmount paidAmount remainingAmount subtotal status paymentStatus selectedDesigns selectedPackage bookingSlots addressSnapshot createdAt updatedAt'
        )
        .lean(),

      // Liked Reels (populate reel info and user's like timestamp)
      Reel.find({ 'likes.userId': userObjId })
        .select('title description thumbnail video duration likeCount viewCount shareCount commentCount isPublished publishedAt createdAt likes')
        .lean(),

      // Liked Designs
      Design.find({ 'likes.userId': userObjId })
        .select('title slug designCode category subCategory price discountedPrice coverImage images isPublished likeCount viewCount complexity createdAt likes')
        .lean(),

      // Comments by this user on Reels
      Reel.aggregate([
        { $match: { 'comments.userId': userObjId } },
        { $unwind: '$comments' },
        { $match: { 'comments.userId': userObjId } },
        {
          $project: {
            reelId: '$_id',
            reelTitle: '$title',
            reelThumbnail: '$thumbnail.url',
            commentId: '$comments._id',
            text: '$comments.text',
            createdAt: '$comments.createdAt',
            updatedAt: '$comments.updatedAt',
          },
        },
        { $sort: { createdAt: -1 } },
      ]),

      // Custom Plan / Quote Inquiries by this user
      PlanInquiry.find({
        $or: [{ user: userObjId }, { phone: user.phone }],
      })
        .sort({ createdAt: -1 })
        .select('name phone email projectTitle requestType pricingPlan quotedPrice adminResponse status createdAt')
        .lean(),
    ]);

    // Format Liked Reels with likedAt timestamp
    const likedReels = likedReelsRaw.map((r) => {
      const userLikeObj = r.likes?.find((l) => String(l.userId) === String(userObjId));
      return {
        _id: r._id,
        title: r.title,
        description: r.description,
        thumbnail: r.thumbnail?.url || null,
        videoUrl: r.video?.url || null,
        duration: r.video?.duration || 0,
        likeCount: r.likeCount || 0,
        viewCount: r.viewCount || 0,
        shareCount: r.shareCount || 0,
        commentCount: r.commentCount || 0,
        isPublished: r.isPublished,
        likedAt: userLikeObj?.likedAt || r.createdAt,
        createdAt: r.createdAt,
      };
    });

    // Format Liked Designs with likedAt timestamp
    const likedDesigns = likedDesignsRaw.map((d) => {
      const userLikeObj = d.likes?.find((l) => String(l.userId) === String(userObjId));
      return {
        _id: d._id,
        title: d.title,
        slug: d.slug,
        designCode: d.designCode,
        category: d.category,
        subCategory: d.subCategory,
        price: d.price,
        discountedPrice: d.discountedPrice,
        coverImage: d.coverImage,
        isPublished: d.isPublished,
        likeCount: d.likeCount || 0,
        viewCount: d.viewCount || 0,
        complexity: d.complexity,
        likedAt: userLikeObj?.likedAt || d.createdAt,
        createdAt: d.createdAt,
      };
    });

    // Summary calculations
    const totalSpent = bookings.reduce((sum, b) => {
      if (!['cancelled', 'rejected'].includes(b.status)) {
        return sum + (b.paidAmount || b.totalAmount || 0);
      }
      return sum;
    }, 0);

    const pendingPayment = bookings.reduce((sum, b) => {
      if (!['cancelled', 'rejected', 'completed'].includes(b.status)) {
        return sum + (b.remainingAmount || 0);
      }
      return sum;
    }, 0);

    const completedBookingsCount = bookings.filter((b) => b.status === 'completed').length;

    const profile360 = {
      user,
      summary: {
        totalBookings: bookings.length,
        completedBookings: completedBookingsCount,
        totalSpent,
        pendingPayment,
        totalAddresses: addresses.length,
        totalLikedReels: likedReels.length,
        totalLikedDesigns: likedDesigns.length,
        totalComments: reelComments.length,
        totalInquiries: inquiries.length,
      },
      addresses,
      bookings,
      likedReels,
      likedDesigns,
      comments: reelComments,
      inquiries,
    };

    return res.status(200).json({
      success: true,
      message: `360° Profile details for ${user.name || user.phone} fetched successfully.`,
      data: profile360,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 3. Block / Unblock User Account (Admin)
 * Endpoint: PATCH /api/auth/admin/users/:userId/toggle-block or PATCH /api/auth/admin/users/:userId/status
 */
async function toggleBlockUserAdmin(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const { userId, id } = req.params;
    const targetUserId = userId || id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    // Prevent blocking self
    if (String(adminId) === String(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Action not allowed: Admin cannot block their own account.',
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    // Update status
    if (req.body.isActive !== undefined) {
      user.isActive = Boolean(req.body.isActive);
    } else {
      user.isActive = !user.isActive;
    }

    await user.save();

    // Invalidate Redis user session & cache immediately
    try {
      await redisService.del(`user:${targetUserId}`);
    } catch (cacheErr) {
      console.error('[UserAdmin] Cache invalidation warning:', cacheErr.message);
    }

    const actionText = user.isActive ? 'unblocked and activated' : 'blocked and deactivated';

    return res.status(200).json({
      success: true,
      message: `User account (${user.name || user.phone}) has been ${actionText} successfully.`,
      data: {
        userId: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        isActive: user.isActive,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 4. Delete User Account (Admin)
 * Endpoint: DELETE /api/auth/admin/users/:userId
 */
async function deleteUserAccountAdmin(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const { userId, id } = req.params;
    const targetUserId = userId || id;

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    // Prevent deleting self
    if (String(adminId) === String(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Action not allowed: Admin cannot delete their own account.',
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found or already deleted.',
      });
    }

    const deletedUserName = user.name || user.phone;

    // Delete user and associated addresses
    await Promise.all([
      User.findByIdAndDelete(targetUserId),
      UserAddress.deleteMany({ userId: targetUserId }),
      redisService.del(`user:${targetUserId}`),
      redisService.del(`user:addresses:${targetUserId}`),
    ]);

    return res.status(200).json({
      success: true,
      message: `User account '${deletedUserName}' and all associated profile data have been permanently deleted.`,
      data: {
        deletedUserId: targetUserId,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  adminLogin,
  changePassword,
  completeProfile,
  updateProfile,
  getProfile,
  refreshTokenHandler,
  logout,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  // Admin User Controllers
  getAllUsersAdmin,
  getUserDetailsAdmin,
  toggleBlockUserAdmin,
  deleteUserAccountAdmin,
};
