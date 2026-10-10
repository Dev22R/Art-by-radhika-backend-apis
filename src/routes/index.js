const express = require('express');
const healthRoutes = require('./health.routes');
const redisRoutes = require('./redis.routes');
const userRoutes = require('../modules/user/user.routes');
const productRoutes = require('../modules/product/product.routes');
const bookingRoutes = require('../modules/booking/booking.routes');
const reelRoutes = require('../modules/reel/reel.routes');
const pricingRoutes = require('../modules/pricing/pricing.routes');
const faqRoutes = require('../modules/faq/faq.routes');
const designRoutes = require('../modules/design/design.routes');
const categoryRoutes = require('../modules/category/category.routes');
const uploadRoutes = require('./upload.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');

const router = express.Router();

router.use('/auth', userRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin/dashboard', dashboardRoutes);
router.use('/bookings', bookingRoutes);
router.use('/categories', categoryRoutes);
router.use('/designs', designRoutes);
router.use('/design', designRoutes);
router.use('/reels', reelRoutes);
router.use('/pricing', pricingRoutes);
router.use('/faqs', faqRoutes);
router.use('/products', productRoutes);
router.use('/upload', uploadRoutes);
router.use('/health', healthRoutes);
router.use('/redis', redisRoutes);

module.exports = router;
