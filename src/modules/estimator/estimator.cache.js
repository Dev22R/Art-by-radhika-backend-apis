const { EstimatorConfig } = require('./estimator.model');
const redisService = require('../../services/redis.service');

// Fast in-process memory cache
let inMemoryConfig = null;
let inMemoryExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

/**
 * Retrieve the active estimator config with two-tier caching:
 * Tier 1: In-Memory (0ms latency, 60s TTL)
 * Tier 2: Upstash / Redis (Distributed cache across instances)
 * Tier 3: MongoDB Database fallback
 *
 * @returns {Promise<Object|null>}
 */
async function getActiveConfig() {
  const now = Date.now();

  // Tier 1: In-Memory cache check
  if (inMemoryConfig && now < inMemoryExpiresAt) {
    return inMemoryConfig;
  }

  // Tier 2: Redis distributed cache check
  try {
    const redisCached = await redisService.get('estimator:config:active');
    if (redisCached) {
      inMemoryConfig = redisCached;
      inMemoryExpiresAt = now + CACHE_TTL_MS;
      return redisCached;
    }
  } catch (err) {
    console.warn('[EstimatorCache] Redis get error:', err.message);
  }

  // Tier 3: Database lookup
  const dbConfig = await EstimatorConfig.findOne({ key: 'active' }).lean();

  if (dbConfig) {
    inMemoryConfig = dbConfig;
    inMemoryExpiresAt = now + CACHE_TTL_MS;

    try {
      await redisService.set('estimator:config:active', dbConfig, 60);
    } catch (err) {
      console.warn('[EstimatorCache] Redis set error:', err.message);
    }
  }

  return dbConfig;
}

/**
 * Invalidate all active config caches (In-Memory + Redis)
 */
async function invalidateConfigCache() {
  inMemoryConfig = null;
  inMemoryExpiresAt = 0;

  try {
    await redisService.del('estimator:config:active');
  } catch (err) {
    console.warn('[EstimatorCache] Redis cache delete error:', err.message);
  }
}

/**
 * Reset cache directly (useful for tests)
 */
function resetLocalCache() {
  inMemoryConfig = null;
  inMemoryExpiresAt = 0;
}

module.exports = {
  getActiveConfig,
  invalidateConfigCache,
  resetLocalCache,
  CACHE_TTL_MS,
};
