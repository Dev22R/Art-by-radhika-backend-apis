const { checkRedisHealth } = require('../config/redis');
const { isDBConnected } = require('../config/db');

async function getHealth(req, res) {
  const redisHealth = await checkRedisHealth();
  const dbConnected = isDBConnected();

  const isHealthy = redisHealth.status === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    services: {
      server: {
        status: 'healthy',
        uptime: process.uptime(),
      },
      redis: redisHealth,
      database: {
        status: dbConnected ? 'connected' : 'disconnected',
      },
    },
  });
}

module.exports = {
  getHealth,
};
