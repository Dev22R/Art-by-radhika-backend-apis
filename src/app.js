const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const { connectDB } = require('./config/db');
const swaggerSpec = require('./config/swagger');
const rateLimiter = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/error.middleware');
const apiRoutes = require('./routes');

const app = express();

// Trust proxy headers for deployment behind reverse proxies (Vercel, AWS, Render, Nginx)
app.set('trust proxy', 1);

// Security and utility middlewares
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ensure Database is connected (essential for Serverless / Vercel execution)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// Immediate request logger (logs immediately upon receiving request)
app.use((req, res, next) => {
  console.log(`📡 [Incoming] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

// Apply global rate limiting
app.use('/api', rateLimiter);

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    name: config.appName,
    status: 'online',
    version: '1.0.0',
    documentation: '/api-docs',
    healthCheck: '/api/health',
    endpoints: {
      auth: {
        signup: 'POST /api/auth/signup (phone, password)',
        login: 'POST /api/auth/login (phone, password)',
        adminLogin: 'POST /api/auth/admin/login (email / phone, password)',
        adminChangePassword: 'PUT /api/auth/admin/change-password (newPassword) [Admin Bearer Token]',
        changePassword: 'PUT /api/auth/change-password (newPassword) [Bearer Token]',
        completeProfile: 'POST /api/auth/complete-profile (name, email, profileImage) [Bearer Token]',
        updateProfile: 'PUT /api/auth/profile [Bearer Token]',
        me: 'GET /api/auth/me [Bearer Token]',
        refreshToken: 'POST /api/auth/refresh-token (refreshToken)',
        logout: 'POST /api/auth/logout [Bearer Token]',
      },
      addresses: {
        addAddress: 'POST /api/auth/addresses [Bearer Token]',
        getAddresses: 'GET /api/auth/addresses [Bearer Token]',
        updateAddress: 'PUT /api/auth/addresses/:addressId [Bearer Token]',
        deleteAddress: 'DELETE /api/auth/addresses/:addressId [Bearer Token]',
        setDefaultAddress: 'PATCH /api/auth/addresses/:addressId/default [Bearer Token]',
      },
      bookings: {
        create: 'POST /api/bookings [Bearer Token]',
        myBookings: 'GET /api/bookings?status=pending [Bearer Token]',
        getById: 'GET /api/bookings/:id [Bearer Token]',
        cancel: 'PATCH /api/bookings/:id/cancel [Bearer Token]',
        adminAll: 'GET /api/bookings/admin/all [Admin Bearer Token]',
        adminUpdateStatus: 'PATCH /api/bookings/admin/:id/status [Admin Bearer Token]',
        adminAssignArtists: 'PATCH /api/bookings/admin/:id/assign-artists [Admin Bearer Token]',
        adminUpdatePayment: 'PATCH /api/bookings/admin/:id/payment [Admin Bearer Token]',
      },
      categories: {
        getTree: 'GET /api/categories (returns active categories + nested subcategories)',
        getBySlug: 'GET /api/categories/:idOrSlug',
        getSubcategories: 'GET /api/categories/:categorySlugOrId/subcategories',
        adminAllCategories: 'GET /api/categories/admin/all [Admin Bearer Token]',
        adminCreateCategory: 'POST /api/categories (name, slug, description, image, icon) [Admin Bearer Token]',
        adminUpdateCategory: 'PUT /api/categories/:id [Admin Bearer Token]',
        adminTogglePublishCategory: 'PATCH /api/categories/:id/publish [Admin Bearer Token]',
        adminToggleFeaturedCategory: 'PATCH /api/categories/:id/featured [Admin Bearer Token]',
        adminReorderCategories: 'PATCH /api/categories/admin/reorder (orders: [{ id, sortOrder }]) [Admin Bearer Token]',
        adminDeleteCategory: 'DELETE /api/categories/:id [Admin Bearer Token]',
        adminAllSubcategories: 'GET /api/categories/subcategories/admin/all?categoryId=... [Admin Bearer Token]',
        adminCreateSubcategory: 'POST /api/categories/subcategories (name, categoryId, description, image) [Admin Bearer Token]',
        adminUpdateSubcategory: 'PUT /api/categories/subcategories/:id [Admin Bearer Token]',
        adminTogglePublishSubcategory: 'PATCH /api/categories/subcategories/:id/publish [Admin Bearer Token]',
        adminReorderSubcategories: 'PATCH /api/categories/subcategories/admin/reorder [Admin Bearer Token]',
        adminDeleteSubcategory: 'DELETE /api/categories/subcategories/:id [Admin Bearer Token]',
      },
      designs: {
        catalog: 'GET /api/designs?category=bridal&sort=popular [Optional Bearer Token]',
        featured: 'GET /api/designs/featured [Optional Bearer Token]',
        categories: 'GET /api/designs/categories',
        tags: 'GET /api/designs/tags',
        getByIdOrSlug: 'GET /api/designs/:idOrSlug [Optional Bearer Token]',
        toggleLike: 'POST /api/designs/:id/like [Bearer Token]',
        bookDesign: 'POST /api/designs/:id/book (addressId, bookingSlots) [Bearer Token]',
        adminCreate: 'POST /api/designs (images, video, title, tags, showInReelFeed, category, price) [Admin Bearer Token]',
        adminUpdate: 'PUT /api/designs/:id [Admin Bearer Token]',
        adminTogglePublish: 'PATCH /api/designs/:id/publish [Admin Bearer Token]',
        adminToggleFeatured: 'PATCH /api/designs/:id/featured [Admin Bearer Token]',
        adminToggleReelFeed: 'PATCH /api/designs/:id/reel-feed [Admin Bearer Token]',
        adminDeleteImage: 'DELETE /api/designs/:id/images/:imageId [Admin Bearer Token]',
        adminDelete: 'DELETE /api/designs/:id [Admin Bearer Token]',
        adminAll: 'GET /api/designs/admin/all [Admin Bearer Token]',
        adminDetails: 'GET /api/designs/admin/:id/details [Admin Bearer Token]',
      },
      reels: {
        feed: 'GET /api/reels?tag=bridal&sort=trending [Optional Bearer Token]',
        getById: 'GET /api/reels/:id [Optional Bearer Token]',
        trackView: 'POST /api/reels/:id/view [Optional Bearer Token]',
        toggleLike: 'POST /api/reels/:id/like [Bearer Token]',
        trackShare: 'POST /api/reels/:id/share (platform) [Optional Bearer Token]',
        addComment: 'POST /api/reels/:id/comments (text) [Bearer Token]',
        getComments: 'GET /api/reels/:id/comments',
        deleteComment: 'DELETE /api/reels/:id/comments/:commentId [Bearer Token]',
        bookDesign: 'POST /api/reels/:id/book (addressId, bookingSlots) [Bearer Token]',
        adminCreate: 'POST /api/reels (video, thumbnail, designImages, title, tags, adminDesign) [Admin Bearer Token]',
        adminUpdate: 'PUT /api/reels/:id [Admin Bearer Token]',
        adminTogglePublish: 'PATCH /api/reels/:id/publish [Admin Bearer Token]',
        adminDelete: 'DELETE /api/reels/:id [Admin Bearer Token]',
        adminAll: 'GET /api/reels/admin/all [Admin Bearer Token]',
        adminDetails: 'GET /api/reels/admin/:id/details (who liked, who commented, who watched) [Admin Bearer Token]',
        adminDeleteComment: 'DELETE /api/reels/:id/comments/:commentId/admin [Admin Bearer Token]',
      },
      pricing: {
        getPlans: 'GET /api/pricing/plans',
        getPlanBySlug: 'GET /api/pricing/plans/:slugOrId',
        submitInquiryOrCustomRequest: 'POST /api/pricing/inquiries (attachments, budget, requirements, requestType)',
        myInquiries: 'GET /api/pricing/inquiries/my [Bearer Token]',
        myInquiryDetails: 'GET /api/pricing/inquiries/my/:id [Bearer Token]',
        respondToQuote: 'PATCH /api/pricing/inquiries/my/:id/respond (action: accept/reject) [Bearer Token]',
        adminCreatePlan: 'POST /api/pricing/plans (name, price, billingType, features) [Admin Bearer Token]',
        adminUpdatePlan: 'PUT /api/pricing/plans/:id [Admin Bearer Token]',
        adminTogglePlan: 'PATCH /api/pricing/plans/:id/toggle [Admin Bearer Token]',
        adminDeletePlan: 'DELETE /api/pricing/plans/:id [Admin Bearer Token]',
        adminAllPlans: 'GET /api/pricing/plans/admin [Admin Bearer Token]',
        adminAllInquiries: 'GET /api/pricing/inquiries/admin [Admin Bearer Token]',
        adminInquiryDetails: 'GET /api/pricing/inquiries/admin/:id [Admin Bearer Token]',
        adminSendQuote: 'PATCH /api/pricing/inquiries/admin/:id/quote (quotedPrice, adminResponse) [Admin Bearer Token]',
        adminUpdateInquiryStatus: 'PATCH /api/pricing/inquiries/admin/:id/status [Admin Bearer Token]',
        adminDeleteInquiry: 'DELETE /api/pricing/inquiries/admin/:id [Admin Bearer Token]',
      },
      faqs: {
        getFaqs: 'GET /api/faqs?category=bridal&grouped=true',
        getFaqById: 'GET /api/faqs/:id',
        voteFaq: 'POST /api/faqs/:id/vote (isHelpful: true/false)',
        adminCreate: 'POST /api/faqs (question, answer, category, tags) [Admin Bearer Token]',
        adminUpdate: 'PUT /api/faqs/:id [Admin Bearer Token]',
        adminTogglePublish: 'PATCH /api/faqs/:id/publish [Admin Bearer Token]',
        adminDelete: 'DELETE /api/faqs/:id [Admin Bearer Token]',
        adminAll: 'GET /api/faqs/admin/all [Admin Bearer Token]',
        adminReorder: 'PATCH /api/faqs/admin/reorder (orders: [{ id, sortOrder }]) [Admin Bearer Token]',
      },
      products: {
        create: 'POST /api/products',
        getAll: 'GET /api/products',
        getById: 'GET /api/products/:id',
        delete: 'DELETE /api/products/:id',
      },
      upload: {
        single: 'POST /api/upload/single (file / image form-data, max 200MB)',
        multiple: 'POST /api/upload/multiple (files / images form-data, max 10 files, 200MB each)',
        delete: 'DELETE /api/upload/:publicId [Bearer Token]',
      },
      redisCacheDemo: '/api/redis/cached-data',
      redisKeyDemo: '/api/redis/cache',
      bullmqQueueDemo: '/api/redis/queue-job',
    },
  });
});

// Mount Main API Routes
app.use('/api', apiRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
