const { uploadToCloudinary, uploadMultipleToCloudinary, deleteFromCloudinary } = require('../services/cloudinary.service');

/**
 * Upload single file to Cloudinary
 * @route POST /api/upload/single
 */
async function uploadSingleFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided. Please attach a file in the form-data under key "file" or "image".',
      });
    }

    const folder = req.body.folder || 'rp-uploads';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: req.body.resourceType || 'auto',
      original_filename: req.file.originalname,
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully to Cloudinary.',
      data: {
        url: result.secure_url,
        secure_url: result.secure_url,
        publicId: result.public_id,
        public_id: result.public_id,
        format: result.format,
        bytes: result.bytes,
        resourceType: result.resource_type,
        width: result.width,
        height: result.height,
        originalName: req.file.originalname,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Upload multiple files to Cloudinary
 * @route POST /api/upload/multiple
 */
async function uploadMultipleFiles(req, res, next) {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({
        success: false,
        message: 'No files provided. Please attach files in the form-data under key "files" or "images".',
      });
    }

    const folder = req.body.folder || 'rp-uploads';
    const results = await uploadMultipleToCloudinary(req.files, {
      folder,
      resource_type: req.body.resourceType || 'auto',
    });

    const formattedData = results.map((result, idx) => ({
      url: result.secure_url,
      secure_url: result.secure_url,
      publicId: result.public_id,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes,
      resourceType: result.resource_type,
      originalName: req.files[idx] ? req.files[idx].originalname : null,
    }));

    res.status(201).json({
      success: true,
      message: `${results.length} files uploaded successfully to Cloudinary.`,
      count: results.length,
      data: formattedData,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete file from Cloudinary
 * @route DELETE /api/upload
 */
async function deleteFile(req, res, next) {
  try {
    const publicId = req.params.publicId || req.body.publicId || req.query.publicId;
    const resourceType = req.body.resourceType || req.query.resourceType || 'image';

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required to delete an asset from Cloudinary.',
      });
    }

    const result = await deleteFromCloudinary(publicId, resourceType);

    res.json({
      success: true,
      message: 'Asset removed from Cloudinary successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadSingleFile,
  uploadMultipleFiles,
  deleteFile,
};
