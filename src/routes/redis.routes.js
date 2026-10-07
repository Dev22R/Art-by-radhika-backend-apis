const express = require('express');
const {
  setKey,
  getKey,
  deleteKey,
  getSlowData,
  triggerQueueJob,
  publishMessage,
} = require('../controllers/redisDemo.controller');
const cacheMiddleware = require('../middlewares/cache.middleware');

const router = express.Router();

// 1. Basic Key-Value Caching Operations
router.post('/cache', setKey);
router.get('/cache/:key', getKey);
router.delete('/cache/:key', deleteKey);

// 2. Route Response Caching Demo (cached for 60 seconds)
router.get('/cached-data', cacheMiddleware(60, 'api-slow-data'), getSlowData);

// 3. BullMQ Distributed Queue Task Trigger
router.post('/queue-job', triggerQueueJob);

// 4. Redis Pub/Sub Publish
router.post('/publish', publishMessage);

module.exports = router;
