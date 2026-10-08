const mongoose = require('mongoose');
const config = require('./env');

let cachedPromise = null;

/**
 * Connect to MongoDB database (with serverless connection caching)
 */
async function connectDB() {
  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If currently connecting, wait for existing promise
  if (mongoose.connection.readyState === 2 && cachedPromise) {
    return cachedPromise;
  }

  if (!config.db.uri) {
    console.warn('[MongoDB] MONGO_URI is not set. Skipping DB connection.');
    return;
  }

  try {
    cachedPromise = mongoose.connect(config.db.uri, {
      serverSelectionTimeoutMS: 5000,
    });

    await cachedPromise;
    return mongoose.connection;
  } catch (error) {
    cachedPromise = null;
    console.error(`[MongoDB] Connection error: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected gracefully.');
  } catch (err) {
    console.error('[MongoDB] Error disconnecting:', err.message);
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  isDBConnected: () => mongoose.connection.readyState === 1,
};
