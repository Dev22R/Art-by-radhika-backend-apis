const cloudinary = require('cloudinary').v2;
const config = require('./env');

// Configure Cloudinary SDK
if (config.cloudinary.isConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  console.log('[Cloudinary] Configured successfully for cloud:', config.cloudinary.cloudName);
} else {
  console.warn('[Cloudinary] Credentials not fully configured in environment. File uploads will require valid credentials.');
}

module.exports = cloudinary;
