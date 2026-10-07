const mongoose = require('mongoose');
const config = require('./env');

/**
 * Connect to MongoDB database
 */
async function connectDB() {
  try {
    if (!config.db.uri) {
      console.warn('[MongoDB] MONGO_URI is not set. Skipping DB connection.');
      return;
    }

    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] Connected successfully to database');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected from database');
    });

    await mongoose.connect(config.db.uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s if MongoDB isn't running locally
    });
  } catch (error) {
    console.warn(`[MongoDB] Could not establish connection (${error.message}). App will proceed without DB.`);
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
