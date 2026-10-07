const express = require('express');
const healthRoutes = require('./health.routes');
const redisRoutes = require('./redis.routes');
const userRoutes = require('../modules/user/user.routes');
const productRoutes = require('../modules/product/product.routes');
const bookingRoutes = require('../modules/booking/booking.routes');

const router = express.Router();

router.use('/auth', userRoutes);
router.use('/bookings', bookingRoutes);
router.use('/products', productRoutes);
router.use('/health', healthRoutes);
router.use('/redis', redisRoutes);

module.exports = router;
