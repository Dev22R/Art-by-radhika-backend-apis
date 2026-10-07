const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./env');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Redis Node.js Production API',
      version: '1.0.0',
      description: 'API with Redis Caching, Pub/Sub, and BullMQ Message Queue Support',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local Development Server',
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
