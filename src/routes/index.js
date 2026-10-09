const express = require('express');
const healthRoutes = require('./health.routes');
const redisRoutes = require('./redis.routes');
const userRoutes = require('../modules/user/user.routes');
const productRoutes = require('../modules/product/product.routes');
const bookingRoutes = require('../modules/booking/booking.routes');
const reelRoutes = require('../modules/reel/reel.routes');
const uploadRoutes = require('./upload.routes');

const router = express.Router();

router.use('/auth', userRoutes);
router.use('/bookings', bookingRoutes);
router.use('/reels', reelRoutes);
router.use('/products', productRoutes);
router.use('/upload', uploadRoutes);
router.use('/health', healthRoutes);
router.use('/redis', redisRoutes);

module.exports = router;
