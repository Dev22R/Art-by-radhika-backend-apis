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
