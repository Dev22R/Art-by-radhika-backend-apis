const { createClient } = require('redis');
const config = require('./env');

let redisClient = null;
let isReady = false;

/**
 * Initialize and configure the Redis client
 */
function initializeRedis() {
  const clientOptions = {
    url: config.redis.url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[Redis] Max reconnection attempts reached.');
          return new Error('Redis connection retry limit exhausted');
        }
        // Exponential backoff with a cap of 3000ms
        const delay = Math.min(retries * 200, 3000);
        console.warn(`[Redis] Reconnecting in ${delay}ms (attempt #${retries})...`);
        return delay;
      },
    },
  };

  if (config.redis.password) {
    clientOptions.password = config.redis.password;
  }

  redisClient = createClient(clientOptions);

  redisClient.on('connect', () => {
    console.log('[Redis] Client connecting to server...');
  });

  redisClient.on('ready', () => {
    isReady = true;
    console.log(`[Redis] Connection ready at ${config.redis.host}:${config.redis.port}`);
  });

  redisClient.on('error', (err) => {
    isReady = false;
    console.error('[Redis] Client Error:', err.message);
  });

  redisClient.on('end', () => {
    isReady = false;
    console.warn('[Redis] Connection closed.');
  });

  return redisClient;
}

/**
 * Connect to Redis instance
 */
async function connectRedis() {
  try {
    if (!redisClient) {
      initializeRedis();
    }
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error.message);
    // Do not crash server, return client instance or null so app can run with graceful fallback
    return null;
  }
}

/**
 * Helper to check if Redis is currently healthy and responsive
 */
async function checkRedisHealth() {
  if (!redisClient || !redisClient.isOpen) {
    return { status: 'down', message: 'Client is not connected' };
  }
  try {
    const pingResponse = await redisClient.ping();
    return { status: 'healthy', ping: pingResponse };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Gracefully disconnect Redis client
 */
async function disconnectRedis() {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      isReady = false;
      console.log('[Redis] Client disconnected gracefully.');
    } catch (err) {
      console.error('[Redis] Error during disconnect:', err.message);
    }
  }
}

module.exports = {
  getRedisClient: () => {
    if (!redisClient) {
      return initializeRedis();
    }
    return redisClient;
  },
  connectRedis,
  checkRedisHealth,
  disconnectRedis,
  isRedisReady: () => isReady,
};
