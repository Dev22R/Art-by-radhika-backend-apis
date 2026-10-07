const redisService = require('../services/redis.service');

/**
 * Express middleware to cache GET responses in Redis
 * @param {number} durationInSeconds - Cache duration in seconds (default 60s)
 * @param {string} [customKeyPrefix='cache'] - Prefix for the cache key
 */
function cacheMiddleware(durationInSeconds = 60, customKeyPrefix = 'cache') {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `${customKeyPrefix}:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redisService.get(cacheKey);

      if (cachedData !== null) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        return res.status(200).json(cachedData);
      }

      // Cache MISS: Intercept response to store it in Redis
      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Cache only successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisService.set(cacheKey, body, durationInSeconds).catch((err) => {
            console.error('[CacheMiddleware] Failed to cache response:', err.message);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('[CacheMiddleware] Error:', error.message);
      next();
    }
  };
}

module.exports = cacheMiddleware;
