const multer = require('multer');
const config = require('../config/env');

// Use memoryStorage for serverless & stream efficiency
const storage = multer.memoryStorage();

// File filter (accept common images, documents, audio, videos)
const fileFilter = (req, file, cb) => {
  // Allow all standard safe file mime types
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Videos / Audio (under 200MB)
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
  ];

  if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types include JPG, PNG, WEBP, GIF, PDF, MP4, etc.`), false);
  }
};

// Base Multer Instance configured with 200MB size limit
const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes, // 200MB limit
    files: 10, // Max 10 files per request
  },
  fileFilter,
});

/**
 * Single File Upload Middleware
 * @param {string} fieldName - Form field name (e.g. 'image', 'profileImage', 'file')
 */
function uploadSingle(fieldName = 'file') {
  return upload.single(fieldName);
}

/**
 * Multiple Files Upload Middleware (Same field)
 * @param {string} fieldName - Form field name
 * @param {number} maxCount - Max number of files (default 10)
 */
function uploadArray(fieldName = 'files', maxCount = 10) {
  return upload.array(fieldName, maxCount);
}

/**
 * Multiple Fields Upload Middleware
 * @param {Array<{name: string, maxCount: number}>} fields
 */
function uploadFields(fields) {
  return upload.fields(fields);
}

/**
 * Any Fields Upload Middleware (Accepts any file field name dynamically)
 */
function uploadAny() {
  return upload.any();
}

/**
 * Multer Error Handling Middleware
 */
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File size exceeds the maximum limit of ${config.upload.maxFileSizeMb}MB.`,
        error: err.code,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded in a single request.',
        error: err.code,
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      error: err.code,
    });
  }

  if (err && err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
}

module.exports = {
  upload,
  uploadSingle,
  uploadArray,
  uploadFields,
  uploadAny,
  handleMulterError,
};
