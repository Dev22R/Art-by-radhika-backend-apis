const mongoose = require('mongoose');
const Design = require('./design.model');
const { Category, Subcategory } = require('../category/category.model');
const Reel = require('../reel/reel.model');
const Booking = require('../booking/booking.model');
const UserAddress = require('../user/userAddress.model');
const redisService = require('../../services/redis.service');
const {
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
} = require('../../services/cloudinary.service');

/**
 * Invalidate Redis caches related to designs & reels
 */
async function invalidateDesignCache() {
  try {
    await Promise.all([
      redisService.delPattern('designs:*'),
      redisService.delPattern('reels:*'),
    ]);
  } catch (err) {
    console.error('[DesignController] Cache invalidation warning:', err.message);
  }
}

/**
 * Helper to generate URL-safe slug
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
}

/**
 * Helper to generate unique design code
 */
function generateDesignCode(category = 'DES') {
  const prefix = (category || 'DES').slice(0, 3).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${random}`;
}

/**
 * Helper to generate booking reference number
 */
function generateBookingNumber() {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `BK-DES-${dateStr}-${randomSuffix}`;
}

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * Create a new Design (Admin)
 * Supports multiple image uploads, optional video/reel upload,
 * and optional toggle to sync the video to the main Reels feed.
 */
async function createDesign(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    console.log('🚀 [DesignController] createDesign invoked. AdminId:', adminId, 'Body:', req.body);
    const {
      title,
      description,
      designCode,
      category = 'bridal',
      subCategory = 'Full Hand',
      tags,
      complexity = 'intricate',
      placement,
      estimatedTime = '2-3 hours',
      price = 0,
      discountedPrice,
      currency = 'INR',
      showInReelFeed = false,
      isPublished = true,
      isFeatured = false,
      isTrending = false,
      isBookable = true,
      sortOrder = 0,
      imageUrls,
      videoUrl,
    } = req.body;

    // 1. Process Images from URLs (supports imageUrls, images, imageUrl, photos, coverImage)
    let processedImages = [];
    const incomingUrls =
      imageUrls ||
      req.body.images ||
      req.body.imageUrl ||
      req.body.coverImage ||
      req.body.photos ||
      req.body['images[]'] ||
      req.body['imageUrls[]'];

    if (incomingUrls) {
      let rawUrls = [];
      if (Array.isArray(incomingUrls)) {
        rawUrls = incomingUrls;
      } else if (typeof incomingUrls === 'string') {
        try {
          const parsed = JSON.parse(incomingUrls);
          rawUrls = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rawUrls = incomingUrls.split(',').map((u) => u.trim());
        }
      }

      rawUrls.forEach((url, idx) => {
        if (url) {
          const itemUrl = typeof url === 'string' ? url : (url.url || url.secure_url || url.image || '');
          if (itemUrl && typeof itemUrl === 'string' && itemUrl.trim().length > 0) {
            processedImages.push({
              url: itemUrl.trim(),
              publicId: url.publicId || null,
              caption: url.caption || '',
              isCover: processedImages.length === 0 && idx === 0,
              sortOrder: processedImages.length + idx,
            });
          }
        }
      });
    }

    // Upload image files if present
    if (req.files || req.file) {
      const filesToUpload = [
        ...(Array.isArray(req.files) ? req.files : []),
        ...(req.files?.images || []),
        ...(req.files?.photos || []),
        ...(req.files?.designImages || []),
        ...(req.files?.cover || []),
        ...(req.files?.thumbnail || []),
        ...(req.files?.file || []),
        ...(req.files?.files || []),
      ];

      if (req.file && !filesToUpload.includes(req.file)) {
        filesToUpload.push(req.file);
      }

      // Filter only image files for design images
      const imageFilesOnly = filesToUpload.filter((f) => {
        const mime = (f.mimetype || '').toLowerCase();
        const field = (f.fieldname || '').toLowerCase();
        return !field.includes('video') && !field.includes('reel') && !mime.startsWith('video/');
      });

      if (imageFilesOnly.length > 0) {
        const uploadResults = await uploadMultipleToCloudinary(imageFilesOnly, {
          folder: 'rp-designs/images',
        });

        uploadResults.forEach((up, idx) => {
          processedImages.push({
            url: up.secure_url,
            publicId: up.public_id,
            originalName: imageFilesOnly[idx]?.originalname || null,
            isCover: processedImages.length === 0 && idx === 0,
            sortOrder: processedImages.length + idx,
          });
        });
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one design image is required.',
      });
    }

    // Determine cover image
    const coverObj = processedImages.find((img) => img.isCover) || processedImages[0];
    const coverImage = coverObj ? coverObj.url : null;

    // 2. Process Video
    let videoData = {
      url: videoUrl || null,
      publicId: null,
      duration: 0,
      format: 'mp4',
      bytes: 0,
    };

    const videoFile =
      req.files?.video?.[0] ||
      req.files?.reel?.[0] ||
      (req.file && (req.file.fieldname === 'video' || req.file.mimetype?.startsWith('video/')) ? req.file : null);

    if (videoFile && videoFile.buffer) {
      const uploadRes = await uploadToCloudinary(videoFile.buffer, {
        folder: 'rp-designs/videos',
        resource_type: 'video',
      });
      videoData = {
        url: uploadRes.secure_url,
        publicId: uploadRes.public_id,
        duration: uploadRes.duration || 0,
        format: uploadRes.format || 'mp4',
        bytes: uploadRes.bytes || videoFile.size || 0,
        width: uploadRes.width || null,
        height: uploadRes.height || null,
      };
    }

    // 3. Parse tags
    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map((t) => String(t).trim().toLowerCase());
    } else if (typeof tags === 'string') {
      try {
        const jsonTags = JSON.parse(tags);
        parsedTags = Array.isArray(jsonTags)
          ? jsonTags.map((t) => String(t).trim().toLowerCase())
          : tags.split(',').map((t) => t.trim().toLowerCase());
      } catch {
        parsedTags = tags.split(',').map((t) => t.trim().toLowerCase());
      }
    }

    // 4. Parse placements
    let parsedPlacements = [];
    if (Array.isArray(placement)) {
      parsedPlacements = placement.map((p) => String(p).trim().toLowerCase());
    } else if (typeof placement === 'string') {
      try {
        const jsonP = JSON.parse(placement);
        parsedPlacements = Array.isArray(jsonP)
          ? jsonP.map((p) => String(p).trim().toLowerCase())
          : placement.split(',').map((p) => p.trim().toLowerCase());
      } catch {
        parsedPlacements = placement.split(',').map((p) => p.trim().toLowerCase());
      }
    }

    // 5. Dynamic Category & Subcategory resolution
    let resolvedCategoryId = null;
    let resolvedCategorySlug = (category || 'bridal').toString().trim().toLowerCase();

    if (req.body.categoryId && mongoose.Types.ObjectId.isValid(req.body.categoryId)) {
      const catDoc = await Category.findById(req.body.categoryId);
      if (catDoc) {
        resolvedCategoryId = catDoc._id;
        resolvedCategorySlug = catDoc.slug;
      }
    } else if (category) {
      const catDoc = await Category.findOne({
        $or: [
          { slug: slugify(category) },
          { name: new RegExp(`^${category.trim()}$`, 'i') },
        ],
      });
      if (catDoc) {
        resolvedCategoryId = catDoc._id;
        resolvedCategorySlug = catDoc.slug;
      }
    }

    if (!resolvedCategorySlug) {
      resolvedCategorySlug = 'bridal';
    }

    let resolvedSubCategoryId = null;
    let resolvedSubCategoryName = (subCategory || 'Full Hand').toString().trim();

    if (req.body.subCategoryId && mongoose.Types.ObjectId.isValid(req.body.subCategoryId)) {
      const subDoc = await Subcategory.findById(req.body.subCategoryId);
      if (subDoc) {
        resolvedSubCategoryId = subDoc._id;
        resolvedSubCategoryName = subDoc.name;
        if (!resolvedCategoryId) {
          resolvedCategoryId = subDoc.categoryId;
        }
      }
    } else if (subCategory && resolvedCategoryId) {
      const subDoc = await Subcategory.findOne({
        categoryId: resolvedCategoryId,
        $or: [
          { slug: slugify(subCategory) },
          { name: new RegExp(`^${subCategory.trim()}$`, 'i') },
        ],
      });
      if (subDoc) {
        resolvedSubCategoryId = subDoc._id;
        resolvedSubCategoryName = subDoc.name;
      }
    }

    // 6. Generate Slug with collision check
    let baseSlug = slugify(title);
    if (!baseSlug || baseSlug.trim().length === 0) {
      baseSlug = 'mehndi-design';
    }
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    let finalSlug = `${baseSlug}-${randomCode}`;
    const slugExists = await Design.findOne({ slug: finalSlug });
    if (slugExists) {
      finalSlug = `${baseSlug}-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    }

    // 7. Ensure Unique Design Code
    let finalDesignCode = designCode ? String(designCode).toUpperCase().trim() : '';
    if (finalDesignCode) {
      const codeExists = await Design.findOne({ designCode: finalDesignCode });
      if (codeExists) {
        finalDesignCode = `${finalDesignCode}-${Math.floor(100 + Math.random() * 900)}`;
      }
    } else {
      let isCodeUnique = false;
      let attempts = 0;
      while (!isCodeUnique && attempts < 10) {
        attempts++;
        finalDesignCode = generateDesignCode(resolvedCategorySlug);
        const codeExists = await Design.findOne({ designCode: finalDesignCode });
        if (!codeExists) {
          isCodeUnique = true;
        }
      }
      if (!isCodeUnique) {
        finalDesignCode = `${(resolvedCategorySlug || 'DES').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
      }
    }

    const shouldShowInReelFeed =
      showInReelFeed === true ||
      showInReelFeed === 'true' ||
      showInReelFeed === 1 ||
      showInReelFeed === '1';

    // 8. Create Design Document
    const design = new Design({
      title: title.trim(),
      slug: finalSlug,
      designCode: finalDesignCode,
      description: description ? description.trim() : '',
      categoryId: resolvedCategoryId,
      category: resolvedCategorySlug,
      subCategoryId: resolvedSubCategoryId,
      subCategory: resolvedSubCategoryName,
      tags: parsedTags,
      complexity,
      placement: parsedPlacements,
      estimatedTime: estimatedTime ? estimatedTime.trim() : '2-3 hours',
      price: Number(price) || 0,
      discountedPrice: discountedPrice ? Number(discountedPrice) : null,
      currency: currency || 'INR',
      images: processedImages,
      coverImage,
      video: videoData.url ? videoData : undefined,
      showInReelFeed: shouldShowInReelFeed,
      isPublished: isPublished !== undefined ? isPublished === true || isPublished === 'true' : true,
      isFeatured: isFeatured === true || isFeatured === 'true',
      isTrending: isTrending === true || isTrending === 'true',
      isBookable: isBookable !== undefined ? isBookable === true || isBookable === 'true' : true,
      sortOrder: Number(sortOrder) || 0,
      createdBy: adminId,
    });

    // 9. If video is present and showInReelFeed is true, automatically create & sync to Reel Feed
    if (videoData.url && shouldShowInReelFeed) {
      try {
        const reel = new Reel({
          title: design.title,
          description: design.description || `Mehndi Design: ${design.title}`,
          tags: design.tags,
          video: videoData,
          thumbnail: {
            url: coverImage,
            publicId: coverObj ? coverObj.publicId || null : null,
          },
          adminDesign: {
            designName: design.title,
            designCode: design.designCode,
            category: design.category,
            price: design.price,
            discountedPrice: design.discountedPrice,
            estimatedTime: design.estimatedTime,
            images: design.images.map((img) => img.url),
            description: design.description,
            isBookable: design.isBookable,
          },
          status: design.isPublished ? 'published' : 'draft',
          isPublished: design.isPublished,
          publishedAt: new Date(),
          createdBy: adminId,
        });

        await reel.save();
        design.linkedReelId = reel._id;
      } catch (reelErr) {
        console.error('[DesignController] Reel auto-sync warning:', reelErr.message);
      }
    }

    await design.save();
    await invalidateDesignCache();

    return res.status(201).json({
      success: true,
      message: 'Design created successfully.',
      data: { design },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Design (Admin)
 */
async function updateDesign(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user._id || req.user.id;
    const {
      title,
      description,
      designCode,
      category,
      subCategory,
      tags,
      complexity,
      placement,
      estimatedTime,
      price,
      discountedPrice,
      currency,
      showInReelFeed,
      isPublished,
      isFeatured,
      isTrending,
      isBookable,
      sortOrder,
      imageUrls,
      videoUrl,
      coverIndex,
    } = req.body;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    if (title && title.trim() !== design.title) {
      design.title = title.trim();
      const baseSlug = slugify(title);
      design.slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    if (description !== undefined) design.description = description.trim();
    if (designCode !== undefined) design.designCode = designCode.toUpperCase().trim();

    // Category update
    if (req.body.categoryId && mongoose.Types.ObjectId.isValid(req.body.categoryId)) {
      const catDoc = await Category.findById(req.body.categoryId);
      if (catDoc) {
        design.categoryId = catDoc._id;
        design.category = catDoc.slug;
      }
    } else if (category) {
      const catDoc = await Category.findOne({
        $or: [
          { slug: slugify(category) },
          { name: new RegExp(`^${category.trim()}$`, 'i') },
        ],
      });
      if (catDoc) {
        design.categoryId = catDoc._id;
        design.category = catDoc.slug;
      } else {
        design.category = category.trim().toLowerCase();
      }
    }

    // Subcategory update
    if (req.body.subCategoryId && mongoose.Types.ObjectId.isValid(req.body.subCategoryId)) {
      const subDoc = await Subcategory.findById(req.body.subCategoryId);
      if (subDoc) {
        design.subCategoryId = subDoc._id;
        design.subCategory = subDoc.name;
        if (!design.categoryId) {
          design.categoryId = subDoc.categoryId;
        }
      }
    } else if (subCategory) {
      if (design.categoryId) {
        const subDoc = await Subcategory.findOne({
          categoryId: design.categoryId,
          $or: [
            { slug: slugify(subCategory) },
            { name: new RegExp(`^${subCategory.trim()}$`, 'i') },
          ],
        });
        if (subDoc) {
          design.subCategoryId = subDoc._id;
          design.subCategory = subDoc.name;
        } else {
          design.subCategory = subCategory.trim();
        }
      } else {
        design.subCategory = subCategory.trim();
      }
    }

    if (complexity) design.complexity = complexity;
    if (estimatedTime) design.estimatedTime = estimatedTime.trim();
    if (price !== undefined) design.price = Number(price);
    if (discountedPrice !== undefined)
      design.discountedPrice = discountedPrice ? Number(discountedPrice) : null;
    if (currency) design.currency = currency;
    if (sortOrder !== undefined) design.sortOrder = Number(sortOrder);
    if (isPublished !== undefined)
      design.isPublished = isPublished === true || isPublished === 'true';
    if (isFeatured !== undefined)
      design.isFeatured = isFeatured === true || isFeatured === 'true';
    if (isTrending !== undefined)
      design.isTrending = isTrending === true || isTrending === 'true';
    if (isBookable !== undefined)
      design.isBookable = isBookable === true || isBookable === 'true';

    // Parse Tags
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        design.tags = tags.map((t) => String(t).trim().toLowerCase());
      } else if (typeof tags === 'string') {
        try {
          const jsonTags = JSON.parse(tags);
          design.tags = Array.isArray(jsonTags)
            ? jsonTags.map((t) => String(t).trim().toLowerCase())
            : tags.split(',').map((t) => t.trim().toLowerCase());
        } catch {
          design.tags = tags.split(',').map((t) => t.trim().toLowerCase());
        }
      }
    }

    // Parse Placements
    if (placement !== undefined) {
      if (Array.isArray(placement)) {
        design.placement = placement.map((p) => String(p).trim().toLowerCase());
      } else if (typeof placement === 'string') {
        try {
          const jsonP = JSON.parse(placement);
          design.placement = Array.isArray(jsonP)
            ? jsonP.map((p) => String(p).trim().toLowerCase())
            : placement.split(',').map((p) => p.trim().toLowerCase());
        } catch {
          design.placement = placement.split(',').map((p) => p.trim().toLowerCase());
        }
      }
    }

    // Append new uploaded images if present
    if (req.files) {
      const filesToUpload = [
        ...(req.files.images || []),
        ...(req.files.photos || []),
        ...(req.files.designImages || []),
      ];

      if (filesToUpload.length > 0) {
        const uploadResults = await uploadMultipleToCloudinary(filesToUpload, {
          folder: 'rp-designs/images',
        });

        uploadResults.forEach((up, idx) => {
          design.images.push({
            url: up.secure_url,
            publicId: up.public_id,
            originalName: filesToUpload[idx]?.originalname || null,
            isCover: design.images.length === 0 && idx === 0,
            sortOrder: design.images.length + idx,
          });
        });
      }

      // Handle video replacement
      if (req.files.video && req.files.video[0]) {
        const videoFile = req.files.video[0];
        const uploadRes = await uploadToCloudinary(videoFile.buffer, {
          folder: 'rp-designs/videos',
          resource_type: 'video',
        });
        design.video = {
          url: uploadRes.secure_url,
          publicId: uploadRes.public_id,
          duration: uploadRes.duration || 0,
          format: uploadRes.format || 'mp4',
          bytes: uploadRes.bytes || videoFile.size,
          width: uploadRes.width || null,
          height: uploadRes.height || null,
        };
      }
    }

    if (videoUrl) {
      design.video = {
        url: videoUrl,
        publicId: null,
        duration: 0,
        format: 'mp4',
      };
    }

    // Set cover image if requested index
    if (coverIndex !== undefined && design.images[Number(coverIndex)]) {
      design.images.forEach((img, i) => {
        img.isCover = i === Number(coverIndex);
      });
      design.coverImage = design.images[Number(coverIndex)].url;
    } else if (design.images.length > 0) {
      const coverObj = design.images.find((img) => img.isCover) || design.images[0];
      design.coverImage = coverObj.url;
    }

    // Handle showInReelFeed toggle & reel synchronization
    if (showInReelFeed !== undefined) {
      const shouldShow =
        showInReelFeed === true ||
        showInReelFeed === 'true' ||
        showInReelFeed === 1 ||
        showInReelFeed === '1';

      design.showInReelFeed = shouldShow;

      if (shouldShow && design.video && design.video.url) {
        if (design.linkedReelId) {
          // Update existing reel
          await Reel.findByIdAndUpdate(design.linkedReelId, {
            title: design.title,
            description: design.description,
            tags: design.tags,
            video: design.video,
            thumbnail: {
              url: design.coverImage,
            },
            adminDesign: {
              designName: design.title,
              designCode: design.designCode,
              category: design.category,
              price: design.price,
              discountedPrice: design.discountedPrice,
              estimatedTime: design.estimatedTime,
              images: design.images.map((img) => img.url),
              description: design.description,
              isBookable: design.isBookable,
            },
            status: design.isPublished ? 'published' : 'draft',
            isPublished: design.isPublished,
          });
        } else {
          // Create new linked reel
          const reel = new Reel({
            title: design.title,
            description: design.description || `Mehndi Design: ${design.title}`,
            tags: design.tags,
            video: design.video,
            thumbnail: {
              url: design.coverImage,
            },
            adminDesign: {
              designName: design.title,
              designCode: design.designCode,
              category: design.category,
              price: design.price,
              discountedPrice: design.discountedPrice,
              estimatedTime: design.estimatedTime,
              images: design.images.map((img) => img.url),
              description: design.description,
              isBookable: design.isBookable,
            },
            status: design.isPublished ? 'published' : 'draft',
            isPublished: design.isPublished,
            publishedAt: new Date(),
            createdBy: adminId,
          });
          await reel.save();
          design.linkedReelId = reel._id;
        }
      } else if (!shouldShow && design.linkedReelId) {
        // Hide/unpublish the reel from the feed
        await Reel.findByIdAndUpdate(design.linkedReelId, {
          isPublished: false,
          status: 'draft',
        });
      }
    }

    await design.save();
    await invalidateDesignCache();

    res.json({
      success: true,
      message: 'Design updated successfully.',
      data: { design },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Design (Admin)
 */
async function deleteDesign(req, res, next) {
  try {
    const { id } = req.params;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    // Clean up images from Cloudinary
    if (Array.isArray(design.images)) {
      design.images.forEach((img) => {
        if (img.publicId) {
          deleteFromCloudinary(img.publicId, 'image').catch((e) =>
            console.warn('Image deletion from Cloudinary failed:', e.message)
          );
        }
      });
    }

    // Clean up video from Cloudinary
    if (design.video && design.video.publicId) {
      deleteFromCloudinary(design.video.publicId, 'video').catch((e) =>
        console.warn('Video deletion from Cloudinary failed:', e.message)
      );
    }

    // If linked reel exists, unlink or delete it
    if (design.linkedReelId) {
      await Reel.findByIdAndDelete(design.linkedReelId).catch((e) =>
        console.warn('Linked reel deletion failed:', e.message)
      );
    }

    await Design.findByIdAndDelete(id);
    await invalidateDesignCache();

    res.json({
      success: true,
      message: 'Design deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Publish / Unpublish Status (Admin)
 */
async function togglePublishDesign(req, res, next) {
  try {
    const { id } = req.params;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    design.isPublished = !design.isPublished;

    // Sync with linked reel
    if (design.linkedReelId && design.showInReelFeed) {
      await Reel.findByIdAndUpdate(design.linkedReelId, {
        isPublished: design.isPublished,
        status: design.isPublished ? 'published' : 'draft',
      });
    }

    await design.save();
    await invalidateDesignCache();

    res.json({
      success: true,
      message: `Design has been ${design.isPublished ? 'published' : 'unpublished'} successfully.`,
      data: {
        id: design._id,
        isPublished: design.isPublished,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Featured Status (Admin)
 */
async function toggleFeaturedDesign(req, res, next) {
  try {
    const { id } = req.params;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    design.isFeatured = !design.isFeatured;
    await design.save();
    await invalidateDesignCache();

    res.json({
      success: true,
      message: `Design ${design.isFeatured ? 'marked as featured' : 'removed from featured'} successfully.`,
      data: {
        id: design._id,
        isFeatured: design.isFeatured,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Show In Reel Feed (Admin)
 */
async function toggleReelFeedSync(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user._id || req.user.id;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    if (!design.video || !design.video.url) {
      return res.status(400).json({
        success: false,
        message: 'Cannot sync to reel feed because this design does not have a video attached.',
      });
    }

    design.showInReelFeed = !design.showInReelFeed;

    if (design.showInReelFeed) {
      if (design.linkedReelId) {
        await Reel.findByIdAndUpdate(design.linkedReelId, {
          isPublished: design.isPublished,
          status: design.isPublished ? 'published' : 'draft',
        });
      } else {
        const reel = new Reel({
          title: design.title,
          description: design.description || `Mehndi Design: ${design.title}`,
          tags: design.tags,
          video: design.video,
          thumbnail: {
            url: design.coverImage,
          },
          adminDesign: {
            designName: design.title,
            designCode: design.designCode,
            category: design.category,
            price: design.price,
            discountedPrice: design.discountedPrice,
            estimatedTime: design.estimatedTime,
            images: design.images.map((img) => img.url),
            description: design.description,
            isBookable: design.isBookable,
          },
          status: design.isPublished ? 'published' : 'draft',
          isPublished: design.isPublished,
          publishedAt: new Date(),
          createdBy: adminId,
        });
        await reel.save();
        design.linkedReelId = reel._id;
      }
    } else if (design.linkedReelId) {
      await Reel.findByIdAndUpdate(design.linkedReelId, {
        isPublished: false,
        status: 'draft',
      });
    }

    await design.save();
    await invalidateDesignCache();

    res.json({
      success: true,
      message: `Reel feed sync ${design.showInReelFeed ? 'enabled' : 'disabled'} for this design.`,
      data: {
        id: design._id,
        showInReelFeed: design.showInReelFeed,
        linkedReelId: design.linkedReelId,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a specific image from a design (Admin)
 */
async function deleteDesignImage(req, res, next) {
  try {
    const { id, imageId } = req.params;

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    const imageIndex = design.images.findIndex(
      (img) => (img._id && img._id.toString() === imageId) || img.publicId === imageId
    );

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Image not found on this design.',
      });
    }

    if (design.images.length <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only image of the design. A design must have at least one image.',
      });
    }

    const [deletedImg] = design.images.splice(imageIndex, 1);
    if (deletedImg && deletedImg.publicId) {
      deleteFromCloudinary(deletedImg.publicId, 'image').catch((e) =>
        console.warn('Image deletion warning:', e.message)
      );
    }

    // If deleted image was cover, reassign cover
    if (deletedImg.isCover || design.coverImage === deletedImg.url) {
      design.images[0].isCover = true;
      design.coverImage = design.images[0].url;
    }

    await design.save();
    await invalidateDesignCache();

    res.json({
      success: true,
      message: 'Image removed from design successfully.',
      data: {
        imagesCount: design.images.length,
        coverImage: design.coverImage,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Designs (Admin - with full metrics, pagination, filters)
 */
async function getAllDesignsAdmin(req, res, next) {
  try {
    const {
      category,
      subCategory,
      complexity,
      isPublished,
      isFeatured,
      showInReelFeed,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (category && category.trim() !== '') {
      const cleanCat = category.trim();
      if (mongoose.Types.ObjectId.isValid(cleanCat)) {
        const catDoc = await Category.findById(cleanCat);
        if (catDoc) {
          query.$or = [
            { categoryId: catDoc._id },
            { category: catDoc.slug },
            { category: new RegExp(`^${catDoc.name}$`, 'i') },
          ];
        } else {
          query.$or = [{ categoryId: cleanCat }, { category: cleanCat.toLowerCase() }];
        }
      } else {
        query.category = cleanCat.toLowerCase();
      }
    }

    if (subCategory && subCategory.trim() !== '') {
      const cleanSub = subCategory.trim();
      if (mongoose.Types.ObjectId.isValid(cleanSub)) {
        const subDoc = await Subcategory.findById(cleanSub);
        if (subDoc) {
          query.$or = [
            { subCategoryId: subDoc._id },
            { subCategory: new RegExp(`^${subDoc.name}$`, 'i') },
            { subCategory: subDoc.slug },
          ];
        } else {
          query.$or = [{ subCategoryId: cleanSub }, { subCategory: new RegExp(cleanSub, 'i') }];
        }
      } else {
        query.subCategory = new RegExp(cleanSub, 'i');
      }
    }

    if (complexity && complexity.trim() !== '') query.complexity = complexity.trim().toLowerCase();
    if (isPublished !== undefined && isPublished !== '') query.isPublished = isPublished === 'true';
    if (isFeatured !== undefined && isFeatured !== '') query.isFeatured = isFeatured === 'true';
    if (showInReelFeed !== undefined && showInReelFeed !== '') query.showInReelFeed = showInReelFeed === 'true';

    if (search && search.trim() !== '') {
      const cleanSearch = search.trim();
      query.$or = [
        { title: { $regex: cleanSearch, $options: 'i' } },
        { description: { $regex: cleanSearch, $options: 'i' } },
        { designCode: { $regex: cleanSearch, $options: 'i' } },
        { tags: { $in: [new RegExp(cleanSearch, 'i')] } },
      ];
    }

    const [designs, total] = await Promise.all([
      Design.find(query)
        .populate('createdBy', 'name email phone')
        .populate('categoryId', 'name slug image')
        .populate('subCategoryId', 'name slug image')
        .populate('linkedReelId', 'title video thumbnail viewCount likeCount isPublished')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Design.countDocuments(query),
    ]);

    const stats = await Design.aggregate([
      {
        $group: {
          _id: null,
          totalDesigns: { $sum: 1 },
          totalViews: { $sum: '$viewCount' },
          totalLikes: { $sum: '$likeCount' },
          totalBookings: { $sum: '$bookingCount' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        summary: stats[0] || {
          totalDesigns: 0,
          totalViews: 0,
          totalLikes: 0,
          totalBookings: 0,
        },
        designs,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Comprehensive Design Details (Admin)
 */
async function getDesignDetailsAdmin(req, res, next) {
  try {
    const { id } = req.params;

    let design;
    if (mongoose.Types.ObjectId.isValid(id)) {
      design = await Design.findById(id)
        .populate('createdBy', 'name email phone')
        .populate('linkedReelId')
        .populate('likes.userId', 'name phone email profileImage');
    } else {
      design = await Design.findOne({ slug: id })
        .populate('createdBy', 'name email phone')
        .populate('linkedReelId')
        .populate('likes.userId', 'name phone email profileImage');
    }

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    // Find all bookings made with this design
    const relatedBookings = await Booking.find({
      'selectedDesigns.designName': design.title,
    })
      .populate('userId', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: {
        design,
        analytics: {
          views: design.viewCount,
          likes: design.likeCount,
          bookings: design.bookingCount,
        },
        likedByUsers: design.likes.map((l) => ({
          user: l.userId,
          likedAt: l.likedAt,
        })),
        relatedBookings,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// USER / PUBLIC CONTROLLERS
// ==========================================

/**
 * Get Public Design Catalog / Gallery
 * Supports rich filtering (category, subCategory, tag, complexity, price range, featured),
 * sorting (latest, popular, price_low, price_high, most_booked), search, and pagination.
 */
async function getDesignCatalog(req, res, next) {
  try {
    const userId = req.user ? (req.user._id || req.user.id) : null;
    const {
      category,
      subCategory,
      tag,
      complexity,
      minPrice,
      maxPrice,
      isFeatured,
      isTrending,
      hasVideo,
      search,
      sort = 'latest', // latest, popular, price_low, price_high, most_booked
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Cache key for guests
    const cacheKey = `designs:catalog:${category || 'all'}:${tag || 'all'}:${sort}:${pageNum}:${limitNum}`;
    if (!userId && !search && !minPrice && !maxPrice) {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: {
            ...cached,
            cached: true,
          },
        });
      }
    }

    const query = {
      isPublished: true,
    };

    if (category && category.trim() !== '') {
      const cleanCat = category.trim();
      if (mongoose.Types.ObjectId.isValid(cleanCat)) {
        const catDoc = await Category.findById(cleanCat);
        if (catDoc) {
          query.$or = [
            { categoryId: catDoc._id },
            { category: catDoc.slug },
            { category: new RegExp(`^${catDoc.name}$`, 'i') },
          ];
        } else {
          query.$or = [{ categoryId: cleanCat }, { category: cleanCat.toLowerCase() }];
        }
      } else {
        query.category = cleanCat.toLowerCase();
      }
    }

    if (subCategory && subCategory.trim() !== '') {
      const cleanSub = subCategory.trim();
      if (mongoose.Types.ObjectId.isValid(cleanSub)) {
        const subDoc = await Subcategory.findById(cleanSub);
        if (subDoc) {
          query.$or = [
            { subCategoryId: subDoc._id },
            { subCategory: new RegExp(`^${subDoc.name}$`, 'i') },
            { subCategory: subDoc.slug },
          ];
        } else {
          query.$or = [{ subCategoryId: cleanSub }, { subCategory: new RegExp(cleanSub, 'i') }];
        }
      } else {
        query.subCategory = new RegExp(cleanSub, 'i');
      }
    }

    if (tag && tag.trim() !== '') query.tags = tag.toLowerCase().trim();
    if (complexity && complexity.trim() !== '') query.complexity = complexity.toLowerCase().trim();
    if (isFeatured !== undefined && isFeatured !== '') query.isFeatured = isFeatured === 'true';
    if (isTrending !== undefined && isTrending !== '') query.isTrending = isTrending === 'true';
    if (hasVideo === 'true') query['video.url'] = { $ne: null };

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (search && search.trim() !== '') {
      const cleanSearch = search.trim();
      query.$or = [
        { title: { $regex: cleanSearch, $options: 'i' } },
        { description: { $regex: cleanSearch, $options: 'i' } },
        { tags: { $in: [new RegExp(cleanSearch, 'i')] } },
        { subCategory: { $regex: cleanSearch, $options: 'i' } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'popular' || sort === 'trending') {
      sortOption = { likeCount: -1, viewCount: -1, createdAt: -1 };
    } else if (sort === 'most_booked') {
      sortOption = { bookingCount: -1, createdAt: -1 };
    } else if (sort === 'price_low') {
      sortOption = { price: 1 };
    } else if (sort === 'price_high') {
      sortOption = { price: -1 };
    }

    const [rawDesigns, total] = await Promise.all([
      Design.find(query)
        .select('-likes.userId') // Exclude raw likes array
        .populate('categoryId', 'name slug image')
        .populate('subCategoryId', 'name slug image')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Design.countDocuments(query),
    ]);

    // Annotate isLiked if user is authenticated
    const designs = rawDesigns.map((d) => {
      let isLiked = false;
      if (userId && Array.isArray(d.likes)) {
        isLiked = d.likes.some(
          (l) => l.userId && l.userId.toString() === userId.toString()
        );
      }
      return {
        ...d,
        isLiked,
      };
    });

    const result = {
      designs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };

    if (!userId && !search && !minPrice && !maxPrice) {
      await redisService.set(cacheKey, result, 120); // cache for 120 seconds
    }

    res.json({
      success: true,
      data: {
        ...result,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Featured / Trending Designs
 */
async function getFeaturedDesigns(req, res, next) {
  try {
    const userId = req.user ? (req.user._id || req.user.id) : null;
    const cacheKey = 'designs:featured';

    if (!userId) {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          data: {
            ...cached,
            cached: true,
          },
        });
      }
    }

    const featured = await Design.find({
      isPublished: true,
      $or: [{ isFeatured: true }, { isTrending: true }],
    })
      .sort({ sortOrder: 1, likeCount: -1, createdAt: -1 })
      .limit(10)
      .lean();

    const designs = featured.map((d) => {
      let isLiked = false;
      if (userId && Array.isArray(d.likes)) {
        isLiked = d.likes.some(
          (l) => l.userId && l.userId.toString() === userId.toString()
        );
      }
      return {
        ...d,
        isLiked,
      };
    });

    const result = { designs };

    if (!userId) {
      await redisService.set(cacheKey, result, 300);
    }

    res.json({
      success: true,
      data: {
        ...result,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Category Summary (Categories with active design count)
 */
async function getDesignCategories(req, res, next) {
  try {
    const cacheKey = 'designs:categories:summary';
    const cached = await redisService.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          categories: cached,
          cached: true,
        },
      });
    }

    const categories = await Design.aggregate([
      { $match: { isPublished: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          sampleCover: { $first: '$coverImage' },
        },
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          coverImage: '$sampleCover',
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    await redisService.set(cacheKey, categories, 600);

    res.json({
      success: true,
      data: {
        categories,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Design Tags
 */
async function getDesignTags(req, res, next) {
  try {
    const cacheKey = 'designs:tags:all';
    const cached = await redisService.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: {
          tags: cached,
          cached: true,
        },
      });
    }

    const tags = await Design.distinct('tags', { isPublished: true });
    await redisService.set(cacheKey, tags, 600);

    res.json({
      success: true,
      data: {
        tags,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Design Details by ID or Slug (Public)
 */
async function getDesignByIdOrSlug(req, res, next) {
  try {
    const { idOrSlug } = req.params;
    const userId = req.user ? (req.user._id || req.user.id) : null;

    let query = { isPublished: true };
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      query = { $or: [{ _id: idOrSlug }, { slug: idOrSlug }], isPublished: true };
    } else {
      query.slug = idOrSlug;
    }

    // Increment view count atomically
    const design = await Design.findOneAndUpdate(
      query,
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate('linkedReelId', 'title video thumbnail viewCount likeCount')
      .populate('createdBy', 'name profileImage')
      .lean();

    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    // Check if liked by current user
    let isLiked = false;
    if (userId && Array.isArray(design.likes)) {
      isLiked = design.likes.some(
        (l) => l.userId && l.userId.toString() === userId.toString()
      );
    }

    // Fetch related designs from same category
    const relatedDesigns = await Design.find({
      _id: { $ne: design._id },
      category: design.category,
      isPublished: true,
    })
      .select('title slug coverImage price discountedPrice category complexity likeCount')
      .limit(4)
      .lean();

    res.json({
      success: true,
      data: {
        design: {
          ...design,
          isLiked,
        },
        relatedDesigns,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Like / Unlike Design (User)
 */
async function toggleDesignLike(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid design ID.',
      });
    }

    const design = await Design.findById(id);
    if (!design) {
      return res.status(404).json({
        success: false,
        message: 'Design not found.',
      });
    }

    const existingIndex = design.likes.findIndex(
      (l) => l.userId.toString() === userId.toString()
    );

    let isLiked = false;
    if (existingIndex > -1) {
      // Unlike
      design.likes.splice(existingIndex, 1);
      isLiked = false;
    } else {
      // Like
      design.likes.push({ userId, likedAt: new Date() });
      isLiked = true;
    }

    design.likeCount = design.likes.length;
    await design.save();

    res.json({
      success: true,
      message: isLiked ? 'Design liked.' : 'Design unliked.',
      data: {
        isLiked,
        likeCount: design.likeCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Direct Booking Flow: "Book This Design" (User)
 * Immediately attaches this design to a new Booking.
 */
async function bookDesign(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const {
      addressId,
      bookingSlots,
      eventName,
      brideName,
      groomName,
      numberOfPeople = 1,
      customerRequirements,
      specialInstructions,
    } = req.body;

    const design = await Design.findById(id);
    if (!design || !design.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Design not found or no longer available for booking.',
      });
    }

    const userAddress = await UserAddress.findOne({ _id: addressId, userId });
    if (!userAddress) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address selected. Address not found for this user.',
      });
    }

    const designPrice =
      design.discountedPrice !== null && design.discountedPrice !== undefined
        ? design.discountedPrice
        : design.price;

    const bookingNumber = generateBookingNumber();

    const formattedSlots = (bookingSlots || []).map((slot) => ({
      date: new Date(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime || null,
      artistCount: Number(slot.artistCount) || 1,
      status: 'pending',
    }));

    const booking = new Booking({
      bookingNumber,
      userId,
      bookingType: design.category === 'bridal' ? 'wedding' : 'mehndi',
      selectedDesigns: [
        {
          designId: design._id,
          designName: design.title,
          designImage: design.coverImage || (design.images[0] && design.images[0].url),
          price: designPrice,
          quantity: 1,
          notes: `Booked directly from design: ${design.title} (${design.designCode || ''})`,
        },
      ],
      addressId: userAddress._id,
      addressSnapshot: {
        addressLine: userAddress.addressLine,
        area: userAddress.area,
        city: userAddress.city,
        state: userAddress.state,
        pincode: userAddress.pincode,
        landmark: userAddress.landmark,
        latitude: userAddress.latitude,
        longitude: userAddress.longitude,
      },
      bookingSlots: formattedSlots,
      eventName: eventName || `${design.title} Mehndi Service`,
      brideName: brideName || null,
      groomName: groomName || null,
      numberOfPeople: Number(numberOfPeople) || 1,
      customerRequirements: customerRequirements || null,
      specialInstructions: specialInstructions || null,
      designAmount: designPrice,
      subtotal: designPrice,
      totalAmount: designPrice,
      status: 'pending',
      paymentStatus: 'pending',
    });

    await booking.save();

    // Increment bookingCount on design
    design.bookingCount = (design.bookingCount || 0) + 1;
    await design.save();

    res.status(201).json({
      success: true,
      message: 'Booking initialized successfully for this design.',
      data: {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        design: {
          id: design._id,
          title: design.title,
          price: designPrice,
        },
        totalAmount: booking.totalAmount,
        status: booking.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // Admin
  createDesign,
  updateDesign,
  deleteDesign,
  togglePublishDesign,
  toggleFeaturedDesign,
  toggleReelFeedSync,
  deleteDesignImage,
  getAllDesignsAdmin,
  getDesignDetailsAdmin,

  // Public / User
  getDesignCatalog,
  getFeaturedDesigns,
  getDesignCategories,
  getDesignTags,
  getDesignByIdOrSlug,
  toggleDesignLike,
  bookDesign,
};
