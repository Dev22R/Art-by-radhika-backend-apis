/**
 * Global Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Multer file upload limit errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds the maximum limit of 200MB.',
        error: err.code,
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      error: err.code,
    });
  }

  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.stack || err.message);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}

module.exports = errorHandler;
