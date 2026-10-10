const { getRedisClient, getUpstashClient } = require('../config/redis');
const config = require('../config/env');

class RedisService {
  /**
   * Safe getter for Upstash REST client
   */
  getUpstash() {
    return getUpstashClient();
  }

  /**
   * Safe getter for standard Redis client
   */
  getClient() {
    return getRedisClient();
  }

  /**
   * Set a key-value pair in Redis with optional TTL (in seconds)
   */
  async set(key, value, ttlSeconds = config.redis.defaultTtl) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        if (ttlSeconds && ttlSeconds > 0) {
          await upstash.set(key, value, { ex: ttlSeconds });
        } else {
          await upstash.set(key, value);
        }
        return true;
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return false;

      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);

      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, serialized, { EX: ttlSeconds });
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error(`[RedisService] Error setting key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Get value by key from Redis
   */
  async get(key) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        const data = await upstash.get(key);
        return data !== undefined ? data : null;
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return null;

      const data = await client.get(key);
      if (!data) return null;

      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    } catch (error) {
      console.error(`[RedisService] Error getting key "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Delete one or multiple keys
   */
  async del(keys) {
    try {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      if (keysArray.length === 0) return 0;

      const upstash = this.getUpstash();
      if (upstash) {
        return await upstash.del(...keysArray);
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return 0;

      return await client.del(keysArray);
    } catch (error) {
      console.error('[RedisService] Error deleting keys:', error.message);
      return 0;
    }
  }

  /**
   * Delete all keys matching a specific pattern (e.g., 'user:*')
   */
  async delPattern(pattern) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        const keys = await upstash.keys(pattern);
        if (keys && keys.length > 0) {
          return await upstash.del(...keys);
        }
        return 0;
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return 0;

      const keys = await client.keys(pattern);
      if (keys && keys.length > 0) {
        return await client.del(keys);
      }
      return 0;
    } catch (error) {
      console.error(`[RedisService] Error deleting pattern "${pattern}":`, error.message);
      return 0;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        const count = await upstash.exists(key);
        return count > 0;
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return false;
      const count = await client.exists(key);
      return count > 0;
    } catch (error) {
      console.error(`[RedisService] Error checking exists for key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Set expiration time on key in seconds
   */
  async expire(key, seconds) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        return await upstash.expire(key, seconds);
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return false;
      return await client.expire(key, seconds);
    } catch (error) {
      console.error(`[RedisService] Error setting expire on key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Get Time To Live (TTL) of a key in seconds
   */
  async ttl(key) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        return await upstash.ttl(key);
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return -2;
      return await client.ttl(key);
    } catch (error) {
      console.error(`[RedisService] Error getting TTL for key "${key}":`, error.message);
      return -2;
    }
  }

  /**
   * Increment a numerical key
   */
  async incr(key) {
    try {
      const upstash = this.getUpstash();
      if (upstash) {
        return await upstash.incr(key);
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return null;
      return await client.incr(key);
    } catch (error) {
      console.error(`[RedisService] Error incrementing key "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Publish a message to a Redis Pub/Sub channel
   */
  async publish(channel, message) {
    try {
      const payload = typeof message === 'object' ? JSON.stringify(message) : String(message);

      const upstash = this.getUpstash();
      if (upstash) {
        return await upstash.publish(channel, payload);
      }

      const client = this.getClient();
      if (!client || !client.isOpen) return 0;

      return await client.publish(channel, payload);
    } catch (error) {
      console.error(`[RedisService] Error publishing to channel "${channel}":`, error.message);
      return 0;
    }
  }

  /**
   * Subscribe to a Redis Pub/Sub channel
   */
  async subscribe(channel, callback) {
    try {
      const baseClient = this.getClient();
      if (!baseClient || !baseClient.isOpen) {
        console.warn('[RedisService] Socket client not open for subscription.');
        return null;
      }
      const subscriber = baseClient.duplicate();
      subscriber.on('error', (err) => {
        console.warn(`[Redis Subscriber] Socket notice (${channel}):`, err.message);
      });
      await subscriber.connect();

      await subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch {
          callback(message);
        }
      });

      console.log(`[RedisService] Subscribed to channel: ${channel}`);
      return subscriber;
    } catch (error) {
      console.error(`[RedisService] Error subscribing to channel "${channel}":`, error.message);
      return null;
    }
  }
}

module.exports = new RedisService();
