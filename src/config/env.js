const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Extract Upstash host from REST URL if available
const rawUpstashUrl = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/^["']|["']$/g, '').trim();
const rawUpstashToken = (process.env.UPSTASH_REDIS_REST_TOKEN || '').replace(/^["']|["']$/g, '').trim();

let upstashHost = '';
if (rawUpstashUrl) {
  try {
    const parsed = new URL(rawUpstashUrl.startsWith('http') ? rawUpstashUrl : `https://${rawUpstashUrl}`);
    upstashHost = parsed.hostname;
  } catch {
    upstashHost = rawUpstashUrl.replace(/^https?:\/\//, '').split('/')[0];
  }
}

const isUpstash = Boolean(upstashHost && rawUpstashToken);

// Determine Redis connection parameters
const redisHost = isUpstash ? upstashHost : (process.env.REDIS_HOST || '127.0.0.1');
const redisPort = isUpstash ? 6379 : parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = isUpstash ? rawUpstashToken : (process.env.REDIS_PASSWORD || undefined);

let redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  if (isUpstash) {
    redisUrl = `rediss://default:${rawUpstashToken}@${upstashHost}:${redisPort}`;
  } else {
    redisUrl = `redis://${redisHost}:${redisPort}`;
  }
} else if (isUpstash && !redisUrl.startsWith('rediss://') && redisUrl.includes('127.0.0.1')) {
  // Override default localhost url if upstash is configured
  redisUrl = `rediss://default:${rawUpstashToken}@${upstashHost}:${redisPort}`;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  appName: process.env.APP_NAME || 'Redis-Express-App',

  upstash: {
    url: rawUpstashUrl,
    token: rawUpstashToken,
    host: upstashHost,
    isConfigured: isUpstash,
  },

  redis: {
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    url: redisUrl,
    tls: isUpstash || redisUrl.startsWith('rediss://'),
    isUpstash,
    defaultTtl: parseInt(process.env.REDIS_DEFAULT_TTL || '300', 10), // in seconds
  },

  db: {
    uri: process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/rp_database',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret_key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret_key',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
    isConfigured: Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ),
  },

  upload: {
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10) * 1024 * 1024, // 200MB default
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10),
  },
};

module.exports = config;
