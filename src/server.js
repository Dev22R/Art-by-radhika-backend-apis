const http = require('http');
const { Server: SocketIOServer } = require('socket.io');

const app = require('./app');
const config = require('./config/env');
const { connectRedis, disconnectRedis } = require('./config/redis');
const { connectDB, disconnectDB } = require('./config/db');
const { initQueues, closeQueues } = require('./queues/redisQueue');
const redisService = require('./services/redis.service');

const server = http.createServer(app);

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket.IO] New client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

/**
 * Bootstrap application services
 */
async function startServer() {
  try {
    // 1. Connect to Redis
    console.log('[Bootstrap] Initializing Redis connection...');
    await connectRedis();

    // 2. Initialize BullMQ Queues and background workers
    console.log('[Bootstrap] Initializing BullMQ queues and workers...');
    initQueues();

    // 3. Connect to Database (graceful, non-blocking)
    console.log('[Bootstrap] Initializing Database connection...');
    await connectDB();

    // 4. Setup Redis Pub/Sub listener example
    redisService.subscribe('notifications', (msg) => {
      console.log('[Redis PubSub] Notification received:', msg);
      // Broadcast to connected WebSocket clients
      io.emit('notification', msg);
    });

    // 5. Start HTTP server
    server.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(`🚀 Server running on port http://localhost:${config.port}`);
      console.log(`📖 API Documentation: http://localhost:${config.port}/api-docs`);
      console.log(`🩺 Health Check:      http://localhost:${config.port}/api/health`);
      console.log(`⚡ Redis Host:        ${config.redis.host}:${config.redis.port}`);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('[Bootstrap] Fatal startup error:', error);
    process.exit(1);
  }
}

/**
 * Graceful Shutdown Handler
 */
async function gracefulShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('[Shutdown] HTTP server closed.');

    // Close BullMQ workers and queues
    await closeQueues();

    // Disconnect Redis
    await disconnectRedis();

    // Disconnect DB
    await disconnectDB();

    console.log('[Shutdown] All connections closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown if cleanup takes too long
  setTimeout(() => {
    console.error('[Shutdown] Forced shutdown timed out after 10s.');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
