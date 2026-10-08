const { createClient } = require('redis');
const { Redis: UpstashRedis } = require('@upstash/redis');
const config = require('./env');

let redisClient = null;
let upstashClient = null;
let isReady = false;

// Initialize Upstash REST client if configured
if (config.upstash && config.upstash.isConfigured) {
  try {
    upstashClient = new UpstashRedis({
      url: config.upstash.url,
      token: config.upstash.token,
    });
    console.log(`[Upstash] REST Client configured for ${config.upstash.host}`);
  } catch (err) {
    console.error('[Upstash] Initialization error:', err.message);
  }
}

/**
 * Initialize and configure the Redis client
 */
function initializeRedis() {
  const socketOptions = {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Max reconnection attempts reached.');
        return new Error('Redis connection retry limit exhausted');
      }
      const delay = Math.min(retries * 200, 3000);
      console.warn(`[Redis] Reconnecting in ${delay}ms (attempt #${retries})...`);
      return delay;
    },
  };

  if (config.redis.tls) {
    socketOptions.tls = true;
  }

  const clientOptions = {
    url: config.redis.url,
    socket: socketOptions,
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
    if (upstashClient) {
      // Test Upstash REST connectivity
      const pingRes = await upstashClient.ping();
      isReady = pingRes === 'PONG' || pingRes === 'OK';
      console.log(`[Upstash] Ping verified: ${pingRes}`);
    }

    if (!redisClient) {
      initializeRedis();
    }
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error.message);
    return null;
  }
}

/**
 * Helper to check if Redis is currently healthy and responsive
 */
async function checkRedisHealth() {
  // 1. Check Upstash REST client if available
  if (upstashClient) {
    try {
      const pingResponse = await upstashClient.ping();
      return {
        status: 'healthy',
        provider: 'upstash-rest',
        host: config.upstash.host,
        ping: pingResponse,
      };
    } catch (err) {
      console.warn('[Redis Health] Upstash REST ping failed:', err.message);
    }
  }

  // 2. Check standard Redis client
  if (!redisClient || !redisClient.isOpen) {
    return { status: 'down', message: 'Client is not connected' };
  }
  try {
    const pingResponse = await redisClient.ping();
    return { status: 'healthy', provider: 'redis-tcp', ping: pingResponse };
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
  getUpstashClient: () => upstashClient,
  connectRedis,
  checkRedisHealth,
  disconnectRedis,
  isRedisReady: () => isReady,
};
