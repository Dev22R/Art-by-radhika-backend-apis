const streamifier = require('stream');
const cloudinary = require('../config/cloudinary');
const config = require('../config/env');

/**
 * Upload a Buffer (from Multer memoryStorage) directly to Cloudinary via upload_stream
 *
 * @param {Buffer} buffer - File buffer from multer
 * @param {Object} options - Cloudinary upload options (folder, resource_type, public_id, transformation)
 * @returns {Promise<Object>} Cloudinary upload response { secure_url, public_id, format, bytes, resource_type, width, height }
 */
async function uploadToCloudinary(buffer, options = {}) {
  if (!config.cloudinary.isConfigured && (!config.cloudinary.cloudName || !config.cloudinary.apiKey)) {
    throw new Error('Cloudinary credentials are not configured in environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
  }

  const defaultOptions = {
    folder: options.folder || 'rp-uploads',
    resource_type: options.resource_type || 'auto',
  };

  const uploadOptions = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Upload stream error:', error);
          return reject(error);
        }
        resolve({
          url: result.secure_url,
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          resource_type: result.resource_type,
          bytes: result.bytes,
          width: result.width || null,
          height: result.height || null,
          created_at: result.created_at,
        });
      }
    );

    // Write buffer directly to stream
    uploadStream.end(buffer);
  });
}

/**
 * Upload multiple files to Cloudinary concurrently
 *
 * @param {Array<Object>} files - Array of multer file objects
 * @param {Object} options - Cloudinary upload options
 * @returns {Promise<Array<Object>>} Array of upload results
 */
async function uploadMultipleToCloudinary(files, options = {}) {
  if (!files || !files.length) return [];

  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file.buffer, {
      folder: options.folder || 'rp-uploads',
      resource_type: options.resource_type || 'auto',
      original_filename: file.originalname,
    })
  );

  return Promise.all(uploadPromises);
}

/**
 * Delete an asset from Cloudinary by public_id
 *
 * @param {string} publicId - Cloudinary asset public_id
 * @param {string} resourceType - 'image' | 'video' | 'raw' (default 'image')
 * @returns {Promise<Object>} Result from Cloudinary deletion
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!config.cloudinary.isConfigured) {
    throw new Error('Cloudinary is not configured.');
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error(`[Cloudinary] Failed to delete asset (${publicId}):`, error.message);
    throw error;
  }
}

module.exports = {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
};
