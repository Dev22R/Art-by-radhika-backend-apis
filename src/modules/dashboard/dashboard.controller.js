const mongoose = require('mongoose');
const Booking = require('../booking/booking.model');
const Design = require('../design/design.model');
const Reel = require('../reel/reel.model');
const User = require('../user/user.model');
const { Category, Subcategory } = require('../category/category.model');
const PlanInquiry = require('../pricing/planInquiry.model');
const redisService = require('../../services/redis.service');

// Status color mapping for charts
const STATUS_COLORS = {
  completed: '#10B981', // Emerald green
  confirmed: '#3B82F6', // Royal blue
  artist_assigned: '#8B5CF6', // Purple
  in_progress: '#06B6D4', // Cyan
  pending: '#F59E0B', // Amber
  awaiting_payment: '#EC4899', // Pink
  cancelled: '#EF4444', // Red
  rejected: '#6B7280', // Gray
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Helper to calculate growth percentage
 */
function calculateGrowth(current, previous) {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

// ==========================================
// 1. DASHBOARD STATS & COUNTS CONTROLLER
// ==========================================

/**
 * Get comprehensive Dashboard Statistics & Counts (Admin)
 * Endpoint: GET /api/admin/dashboard/stats or GET /api/dashboard/stats
 */
async function getDashboardStats(req, res, next) {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Start dates for comparisons
    const startOfThisMonth = new Date(currentYear, currentMonth, 1);
    const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfLastMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    const startOfThisWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfThisWeek.setHours(0, 0, 0, 0);

    // 1. Run all counts and aggregations concurrently for high performance
    const [
      // Booking Counts by Status
      bookingStatusCounts,
      totalBookingsCount,
      thisMonthBookingsCount,
      lastMonthBookingsCount,

      // Revenue Aggregations
      revenueStats,
      thisMonthRevenueStats,
      lastMonthRevenueStats,

      // User Counts
      totalUsersCount,
      thisMonthUsersCount,
      lastMonthUsersCount,

      // Designs Counts
      totalDesignsCount,
      publishedDesignsCount,
      featuredDesignsCount,

      // Reels & Engagement Aggregation
      reelsStats,

      // Inquiries Counts
      inquiryCounts,

      // Categories
      categoriesCount,
      subcategoriesCount,

      // Recent 5 Bookings
      recentBookings,

      // Recent 5 Inquiries
      recentInquiries,

      // Top 5 Popular Designs
      topDesigns,
    ] = await Promise.all([
      // Bookings grouped by status
      Booking.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
          },
        },
      ]),

      // Total bookings
      Booking.countDocuments(),

      // This month bookings
      Booking.countDocuments({ createdAt: { $gte: startOfThisMonth } }),

      // Last month bookings
      Booking.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      // Total Revenue (all-time completed/paid or confirmed)
      Booking.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [{ $in: ['$status', ['completed', 'confirmed', 'artist_assigned', 'in_progress']] }, '$totalAmount', 0],
              },
            },
            totalPaidAmount: { $sum: '$paidAmount' },
            pendingPaymentAmount: { $sum: '$remainingAmount' },
          },
        },
      ]),

      // This Month Revenue
      Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfThisMonth },
            status: { $nin: ['cancelled', 'rejected'] },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalAmount' },
          },
        },
      ]),

      // Last Month Revenue
      Booking.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            status: { $nin: ['cancelled', 'rejected'] },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$totalAmount' },
          },
        },
      ]),

      // Total Clients/Users (excluding admins)
      User.countDocuments({ role: { $ne: 'admin' } }),

      // This month new clients
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: startOfThisMonth } }),

      // Last month new clients
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

      // Total Designs
      Design.countDocuments(),
      Design.countDocuments({ isPublished: true }),
      Design.countDocuments({ isFeatured: true }),

      // Total Reels & Engagement
      Reel.aggregate([
        {
          $group: {
            _id: null,
            totalReels: { $sum: 1 },
            publishedReels: { $sum: { $cond: ['$isPublished', 1, 0] } },
            totalViews: { $sum: '$viewCount' },
            totalLikes: { $sum: '$likeCount' },
            totalShares: { $sum: '$shareCount' },
            totalComments: { $sum: '$commentCount' },
          },
        },
      ]),

      // Inquiries
      PlanInquiry.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),

      // Categories
      Category.countDocuments(),
      Subcategory.countDocuments(),

      // Recent 5 Bookings with user & address snapshot
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'name phone email profileImage')
        .select('bookingNumber bookingType brideName totalAmount status paymentStatus createdAt bookingSlots selectedDesigns addressSnapshot')
        .lean(),

      // Recent 5 Inquiries
      PlanInquiry.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name phone email projectTitle status quotedPrice createdAt requestType')
        .lean(),

      // Top 5 Popular Designs
      Design.find({ isPublished: true })
        .sort({ bookingCount: -1, likeCount: -1 })
        .limit(5)
        .select('title slug designCode category price coverImage bookingCount likeCount viewCount complexity')
        .lean(),
    ]);

    // Format Status Map
    const statusMap = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      in_progress: 0,
      artist_assigned: 0,
      awaiting_payment: 0,
    };

    bookingStatusCounts.forEach((s) => {
      if (s._id) {
        statusMap[s._id] = s.count || 0;
      }
    });

    // Format Inquiries Map
    const inquiryMap = {
      pending: 0,
      quoted: 0,
      accepted: 0,
      rejected: 0,
      converted: 0,
      total: 0,
    };

    inquiryCounts.forEach((iq) => {
      inquiryMap[iq._id || 'pending'] = iq.count;
      inquiryMap.total += iq.count;
    });

    // Revenue calculations
    const totalRevenue = revenueStats[0]?.totalRevenue || 0;
    const totalPaidAmount = revenueStats[0]?.totalPaidAmount || 0;
    const pendingPayment = revenueStats[0]?.pendingPaymentAmount || 0;
    const thisMonthRevenue = thisMonthRevenueStats[0]?.revenue || 0;
    const lastMonthRevenue = lastMonthRevenueStats[0]?.revenue || 0;

    const reelData = reelsStats[0] || {
      totalReels: 0,
      publishedReels: 0,
      totalViews: 0,
      totalLikes: 0,
      totalShares: 0,
      totalComments: 0,
    };

    const stats = {
      // 1. Overall Key Metric Cards
      metrics: {
        bookings: {
          total: totalBookingsCount,
          pending: statusMap.pending + (statusMap.awaiting_payment || 0),
          confirmed: statusMap.confirmed + (statusMap.artist_assigned || 0) + (statusMap.in_progress || 0),
          completed: statusMap.completed,
          cancelled: statusMap.cancelled,
          thisMonth: thisMonthBookingsCount,
          lastMonth: lastMonthBookingsCount,
          growthPercentage: calculateGrowth(thisMonthBookingsCount, lastMonthBookingsCount),
        },
        revenue: {
          total: totalRevenue,
          totalPaid: totalPaidAmount,
          pendingPayment: pendingPayment,
          thisMonth: thisMonthRevenue,
          lastMonth: lastMonthRevenue,
          growthPercentage: calculateGrowth(thisMonthRevenue, lastMonthRevenue),
          currency: 'INR',
        },
        clients: {
          total: totalUsersCount,
          thisMonth: thisMonthUsersCount,
          lastMonth: lastMonthUsersCount,
          growthPercentage: calculateGrowth(thisMonthUsersCount, lastMonthUsersCount),
        },
        designs: {
          total: totalDesignsCount,
          published: publishedDesignsCount,
          featured: featuredDesignsCount,
          unpublished: totalDesignsCount - publishedDesignsCount,
        },
        reels: {
          total: reelData.totalReels,
          published: reelData.publishedReels,
          totalViews: reelData.totalViews,
          totalLikes: reelData.totalLikes,
          totalShares: reelData.totalShares,
          totalComments: reelData.totalComments,
        },
        inquiries: {
          total: inquiryMap.total,
          pending: inquiryMap.pending || 0,
          quoted: inquiryMap.quoted || 0,
          accepted: inquiryMap.accepted || 0,
        },
        catalogs: {
          categories: categoriesCount,
          subcategories: subcategoriesCount,
        },
      },

      // 2. Recent Live Activity
      recentBookings,
      recentInquiries,
      topDesigns,
    };

    return res.status(200).json({
      success: true,
      message: 'Dashboard statistics fetched successfully.',
      data: stats,
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 2. DASHBOARD CHARTS & ANALYTICS CONTROLLER
// ==========================================

/**
 * Get Comprehensive Chart & Graph Datasets for Admin Dashboard
 * Endpoint: GET /api/admin/dashboard/charts or GET /api/dashboard/charts
 * Query Params:
 *  - range: '6months' | '12months' | '30days' | 'year' (default: '12months')
 *  - year: e.g. 2026 (default: current year)
 */
async function getDashboardCharts(req, res, next) {
  try {
    const { range = '12months', year } = req.query;
    const now = new Date();
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();

    // 1. REVENUE & BOOKINGS MONTHLY TREND (Past 12 Months)
    const monthsCount = range === '6months' ? 6 : 12;
    const startDate = new Date(targetYear, now.getMonth() - monthsCount + 1, 1);

    const monthlyAggregate = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          totalRevenue: {
            $sum: {
              $cond: [{ $not: [{ $in: ['$status', ['cancelled', 'rejected']] }] }, '$totalAmount', 0],
            },
          },
          completedRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, '$totalAmount', 0],
            },
          },
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
            },
          },
          cancelledBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0],
            },
          },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    // Build continuous monthly series (filling missing months with 0)
    const revenueTrends = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1; // 1-indexed
      const monthLabel = `${MONTH_NAMES[d.getMonth()]} ${String(y).slice(-2)}`;

      const found = monthlyAggregate.find((item) => item._id.year === y && item._id.month === m);

      revenueTrends.push({
        label: monthLabel,
        month: MONTH_NAMES[d.getMonth()],
        year: y,
        revenue: found ? found.totalRevenue : 0,
        completedRevenue: found ? found.completedRevenue : 0,
        bookings: found ? found.totalBookings : 0,
        completedBookings: found ? found.completedBookings : 0,
        cancelledBookings: found ? found.cancelledBookings : 0,
      });
    }

    // 2. BOOKING STATUS DISTRIBUTION (Pie / Donut Chart)
    const statusAggregate = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
    ]);

    const totalAllBookings = statusAggregate.reduce((sum, s) => sum + s.count, 0);

    const bookingStatusDistribution = statusAggregate.map((s) => {
      const statusKey = s._id || 'pending';
      const formattedName = statusKey
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      return {
        key: statusKey,
        name: formattedName,
        value: s.count,
        totalAmount: s.totalAmount,
        percentage: totalAllBookings > 0 ? Number(((s.count / totalAllBookings) * 100).toFixed(1)) : 0,
        color: STATUS_COLORS[statusKey] || '#9CA3AF',
      };
    });

    // 3. CATEGORY POPULARITY & PERFORMANCE (Bar / Radar Chart)
    const [categoryBookings, categoryDesigns] = await Promise.all([
      // Bookings grouped by category (from selectedDesigns or package)
      Booking.aggregate([
        { $unwind: '$selectedDesigns' },
        {
          $lookup: {
            from: 'designs',
            localField: 'selectedDesigns.designId',
            foreignField: '_id',
            as: 'designInfo',
          },
        },
        {
          $unwind: { path: '$designInfo', preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: { $toLower: { $ifNull: ['$designInfo.category', 'bridal'] } },
            bookingsCount: { $sum: 1 },
            revenue: { $sum: '$selectedDesigns.price' },
          },
        },
      ]),

      // Total designs count per category
      Design.aggregate([
        {
          $group: {
            _id: { $toLower: '$category' },
            designsCount: { $sum: 1 },
            totalLikes: { $sum: '$likeCount' },
            totalViews: { $sum: '$viewCount' },
          },
        },
      ]),
    ]);

    // Merge categories
    const categoryMap = new Map();

    categoryDesigns.forEach((cd) => {
      const cat = cd._id || 'other';
      categoryMap.set(cat, {
        category: cat.charAt(0).toUpperCase() + cat.slice(1),
        categorySlug: cat,
        designsCount: cd.designsCount || 0,
        totalLikes: cd.totalLikes || 0,
        totalViews: cd.totalViews || 0,
        bookingsCount: 0,
        revenue: 0,
      });
    });

    categoryBookings.forEach((cb) => {
      const cat = cb._id || 'other';
      const existing = categoryMap.get(cat) || {
        category: cat.charAt(0).toUpperCase() + cat.slice(1),
        categorySlug: cat,
        designsCount: 0,
        totalLikes: 0,
        totalViews: 0,
        bookingsCount: 0,
        revenue: 0,
      };
      existing.bookingsCount += cb.bookingsCount;
      existing.revenue += cb.revenue;
      categoryMap.set(cat, existing);
    });

    const categoryPerformance = Array.from(categoryMap.values()).sort((a, b) => b.bookingsCount - a.bookingsCount);

    // 4. USER ACQUISITION GROWTH (Monthly Registrations)
    const userGrowthAggregate = await User.aggregate([
      {
        $match: {
          role: { $ne: 'admin' },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          newUsers: { $sum: 1 },
        },
      },
    ]);

    const clientGrowthTrends = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = userGrowthAggregate.find((item) => item._id.year === y && item._id.month === m);

      clientGrowthTrends.push({
        label: `${MONTH_NAMES[d.getMonth()]} ${String(y).slice(-2)}`,
        month: MONTH_NAMES[d.getMonth()],
        newClients: found ? found.newUsers : 0,
      });
    }

    // 5. WEEKDAY BOOKING DISTRIBUTION (Sunday - Saturday heat/bar)
    const weekdayAggregate = await Booking.aggregate([
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' }, // 1 = Sunday, 7 = Saturday
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      {
        $sort: { '_id': 1 },
      },
    ]);

    const weekdayDistribution = DAY_NAMES.map((day, idx) => {
      const found = weekdayAggregate.find((w) => w._id === idx + 1);
      return {
        day,
        bookings: found ? found.count : 0,
        revenue: found ? found.revenue : 0,
      };
    });

    // 6. TOP 5 PERFORMING REELS (Engagement Bar)
    const topPerformingReels = await Reel.find({ isPublished: true })
      .sort({ viewCount: -1, likeCount: -1 })
      .limit(6)
      .select('title viewCount likeCount shareCount commentCount thumbnail createdAt')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Dashboard chart analytics fetched successfully.',
      data: {
        timeframe: {
          range,
          year: targetYear,
        },
        revenueTrends,
        bookingStatusDistribution,
        categoryPerformance,
        clientGrowthTrends,
        weekdayDistribution,
        topPerformingReels,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 3. COMBINED DASHBOARD OVERVIEW (ALL-IN-ONE)
// ==========================================

/**
 * Get Combined Stats + Charts in a single roundtrip (Fast initial dashboard load)
 * Endpoint: GET /api/admin/dashboard/overview or GET /api/dashboard/overview
 */
async function getDashboardOverview(req, res, next) {
  try {
    // Run both stats & charts logic
    // We can call internal handlers or run them in parallel
    req.query.range = req.query.range || '12months';

    let statsData = null;
    let chartsData = null;

    // Create mock res objects to gather data
    const fakeResStats = {
      status: () => fakeResStats,
      json: (payload) => {
        statsData = payload.data;
      },
    };

    const fakeResCharts = {
      status: () => fakeResCharts,
      json: (payload) => {
        chartsData = payload.data;
      },
    };

    await Promise.all([
      getDashboardStats(req, fakeResStats, next),
      getDashboardCharts(req, fakeResCharts, next),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Complete Dashboard Overview fetched successfully.',
      data: {
        stats: statsData,
        charts: chartsData,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getDashboardCharts,
  getDashboardOverview,
};
