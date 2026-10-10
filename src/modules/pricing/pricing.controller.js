const mongoose = require('mongoose');
const slugify = require('slugify');
const PricingPlan = require('./pricingPlan.model');
const PricingAddon = require('./pricingAddon.model');
const Coupon = require('./coupon.model');
const PlanInquiry = require('./planInquiry.model');
const redisService = require('../../services/redis.service');
const { uploadMultipleToCloudinary, deleteFromCloudinary } = require('../../services/cloudinary.service');

/**
 * Invalidate pricing plans & addons Redis cache
 */
async function invalidatePricingCache() {
  try {
    await redisService.delPattern('pricing:*');
  } catch (err) {
    console.warn('[PricingController] Cache invalidation warning:', err.message);
  }
}

// ==========================================
// 1. PRICING PLANS (ADMIN CONTROLLERS)
// ==========================================

/**
 * Create New Pricing Plan (Admin)
 */
async function createPricingPlan(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      name,
      slug,
      description,
      price,
      currency = 'INR',
      billingType = 'one-time',
      features = [],
      limitations = [],
      isPopular = false,
      isActive = true,
      sortOrder = 0,
    } = req.body;

    let parsedFeatures = Array.isArray(features) ? features : [];
    if (typeof features === 'string') {
      try {
        parsedFeatures = JSON.parse(features);
      } catch {
        parsedFeatures = features.split(',').map((f) => f.trim());
      }
    }

    let parsedLimitations = Array.isArray(limitations) ? limitations : [];
    if (typeof limitations === 'string') {
      try {
        parsedLimitations = JSON.parse(limitations);
      } catch {
        parsedLimitations = limitations.split(',').map((l) => l.trim());
      }
    }

    const generatedSlug = slug
      ? slugify(slug, { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

    const existingSlug = await PricingPlan.findOne({ slug: generatedSlug });
    if (existingSlug) {
      return res.status(409).json({
        success: false,
        message: `A pricing plan with slug "${generatedSlug}" already exists.`,
      });
    }

    const plan = new PricingPlan({
      name: name.trim(),
      slug: generatedSlug,
      description: description ? description.trim() : '',
      price: Number(price),
      currency: currency.trim().toUpperCase(),
      billingType,
      features: parsedFeatures,
      limitations: parsedLimitations,
      isPopular: Boolean(isPopular),
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder) || 0,
      createdBy: adminId,
    });

    await plan.save();
    await invalidatePricingCache();

    res.status(201).json({
      success: true,
      message: 'Pricing plan created successfully.',
      data: { plan },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Pricing Plan (Admin)
 */
async function updatePricingPlan(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      description,
      price,
      currency,
      billingType,
      features,
      limitations,
      isPopular,
      isActive,
      sortOrder,
    } = req.body;

    const plan = await PricingPlan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Pricing plan not found.',
      });
    }

    if (name) plan.name = name.trim();
    if (slug) {
      const generatedSlug = slugify(slug, { lower: true, strict: true });
      const existing = await PricingPlan.findOne({ slug: generatedSlug, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Slug "${generatedSlug}" is already taken by another plan.`,
        });
      }
      plan.slug = generatedSlug;
    }

    if (description !== undefined) plan.description = description.trim();
    if (price !== undefined) plan.price = Number(price);
    if (currency) plan.currency = currency.trim().toUpperCase();
    if (billingType) plan.billingType = billingType;

    if (features !== undefined) {
      if (Array.isArray(features)) {
        plan.features = features;
      } else if (typeof features === 'string') {
        try {
          plan.features = JSON.parse(features);
        } catch {
          plan.features = features.split(',').map((f) => f.trim());
        }
      }
    }

    if (limitations !== undefined) {
      if (Array.isArray(limitations)) {
        plan.limitations = limitations;
      } else if (typeof limitations === 'string') {
        try {
          plan.limitations = JSON.parse(limitations);
        } catch {
          plan.limitations = limitations.split(',').map((l) => l.trim());
        }
      }
    }

    if (isPopular !== undefined) plan.isPopular = Boolean(isPopular);
    if (isActive !== undefined) plan.isActive = Boolean(isActive);
    if (sortOrder !== undefined) plan.sortOrder = Number(sortOrder);

    await plan.save();
    await invalidatePricingCache();

    res.json({
      success: true,
      message: 'Pricing plan updated successfully.',
      data: { plan },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Pricing Plan (Admin)
 */
async function deletePricingPlan(req, res, next) {
  try {
    const { id } = req.params;

    const plan = await PricingPlan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Pricing plan not found.',
      });
    }

    await invalidatePricingCache();

    res.json({
      success: true,
      message: 'Pricing plan deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Pricing Plan Status (Admin)
 */
async function togglePlanStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { field } = req.body;

    const plan = await PricingPlan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Pricing plan not found.',
      });
    }

    if (field === 'isPopular') {
      plan.isPopular = !plan.isPopular;
    } else {
      plan.isActive = !plan.isActive;
    }

    await plan.save();
    await invalidatePricingCache();

    res.json({
      success: true,
      message: `Pricing plan ${field || 'isActive'} status updated.`,
      data: {
        id: plan._id,
        isActive: plan.isActive,
        isPopular: plan.isPopular,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Pricing Plans (Admin)
 */
async function getAllPlansAdmin(req, res, next) {
  try {
    const { search, billingType, isActive } = req.query;

    const query = {};
    if (billingType) query.billingType = billingType;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const plans = await PricingPlan.find(query)
      .populate('createdBy', 'name email phone')
      .sort({ sortOrder: 1, createdAt: -1 });

    const totalPlans = plans.length;
    const activePlans = plans.filter((p) => p.isActive).length;

    res.json({
      success: true,
      data: {
        summary: {
          totalPlans,
          activePlans,
          inactivePlans: totalPlans - activePlans,
        },
        plans,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 2. PRICING PLANS (PUBLIC CONTROLLERS)
// ==========================================

/**
 * Get Active Pricing Plans (Public / User - Cached)
 */
async function getActivePlansPublic(req, res, next) {
  try {
    const { billingType } = req.query;
    const cacheKey = `pricing:plans:public:${billingType || 'all'}`;

    const cachedData = await redisService.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        data: {
          plans: cachedData,
          cached: true,
        },
      });
    }

    const query = { isActive: true };
    if (billingType) query.billingType = billingType;

    const plans = await PricingPlan.find(query).sort({ sortOrder: 1, price: 1 }).lean();
    await redisService.set(cacheKey, plans, 300);

    res.json({
      success: true,
      data: {
        plans,
        cached: false,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Single Pricing Plan by Slug or ObjectId (Public)
 */
async function getPlanBySlugOrId(req, res, next) {
  try {
    const { slugOrId } = req.params;

    let query = {};
    if (mongoose.Types.ObjectId.isValid(slugOrId)) {
      query = { _id: slugOrId };
    } else {
      query = { slug: slugOrId.toLowerCase().trim() };
    }

    const plan = await PricingPlan.findOne(query).lean();
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Pricing plan not found.',
      });
    }

    res.json({
      success: true,
      data: { plan },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 3. ADD-ON BUILDER & DYNAMIC CALCULATOR
// ==========================================

/**
 * Create Add-on (Admin)
 */
async function createAddon(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      name,
      slug,
      category = 'other',
      price,
      currency = 'INR',
      unit = 'fixed',
      description,
      icon = 'Sparkles',
      isActive = true,
      sortOrder = 0,
    } = req.body;

    const generatedSlug = slug
      ? slugify(slug, { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

    const existing = await PricingAddon.findOne({ slug: generatedSlug });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `An add-on with slug "${generatedSlug}" already exists.`,
      });
    }

    const addon = new PricingAddon({
      name: name.trim(),
      slug: generatedSlug,
      category,
      price: Number(price),
      currency: currency.trim().toUpperCase(),
      unit,
      description: description ? description.trim() : '',
      icon,
      isActive: Boolean(isActive),
      sortOrder: Number(sortOrder) || 0,
      createdBy: adminId,
    });

    await addon.save();
    await invalidatePricingCache();

    res.status(201).json({
      success: true,
      message: 'Add-on created successfully.',
      data: { addon },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Add-on (Admin)
 */
async function updateAddon(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      category,
      price,
      currency,
      unit,
      description,
      icon,
      isActive,
      sortOrder,
    } = req.body;

    const addon = await PricingAddon.findById(id);
    if (!addon) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found.',
      });
    }

    if (name) addon.name = name.trim();
    if (slug) addon.slug = slugify(slug, { lower: true, strict: true });
    if (category) addon.category = category;
    if (price !== undefined) addon.price = Number(price);
    if (currency) addon.currency = currency.trim().toUpperCase();
    if (unit) addon.unit = unit;
    if (description !== undefined) addon.description = description.trim();
    if (icon) addon.icon = icon;
    if (isActive !== undefined) addon.isActive = Boolean(isActive);
    if (sortOrder !== undefined) addon.sortOrder = Number(sortOrder);

    await addon.save();
    await invalidatePricingCache();

    res.json({
      success: true,
      message: 'Add-on updated successfully.',
      data: { addon },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Add-on (Admin)
 */
async function deleteAddon(req, res, next) {
  try {
    const { id } = req.params;

    const addon = await PricingAddon.findByIdAndDelete(id);
    if (!addon) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found.',
      });
    }

    await invalidatePricingCache();

    res.json({
      success: true,
      message: 'Add-on deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Add-on Status (Admin)
 */
async function toggleAddonStatus(req, res, next) {
  try {
    const { id } = req.params;

    const addon = await PricingAddon.findById(id);
    if (!addon) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found.',
      });
    }

    addon.isActive = !addon.isActive;
    await addon.save();
    await invalidatePricingCache();

    res.json({
      success: true,
      message: `Add-on status toggled to ${addon.isActive ? 'Active' : 'Inactive'}.`,
      data: { id: addon._id, isActive: addon.isActive },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Add-ons (Admin)
 */
async function getAllAddonsAdmin(req, res, next) {
  try {
    const addons = await PricingAddon.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: { addons, total: addons.length },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Active Add-ons (Public / User - Cached)
 */
async function getActiveAddonsPublic(req, res, next) {
  try {
    const cacheKey = 'pricing:addons:public';
    const cached = await redisService.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: { addons: cached, cached: true },
      });
    }

    const addons = await PricingAddon.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean();
    await redisService.set(cacheKey, addons, 300);

    res.json({
      success: true,
      data: { addons, cached: false },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 🧮 Interactive Price Calculator API
 * Computes base plan price + selected add-ons + coupon discount
 */
async function calculateCustomPrice(req, res, next) {
  try {
    const {
      planId,
      planSlug,
      customBasePrice = 0,
      selectedAddons = [],
      couponCode,
      userId,
    } = req.body;

    let basePlan = null;
    let basePrice = Number(customBasePrice) || 0;

    // 1. Fetch base plan if specified
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      basePlan = await PricingPlan.findById(planId);
      if (basePlan) basePrice = basePlan.price;
    } else if (planSlug) {
      basePlan = await PricingPlan.findOne({ slug: planSlug.toLowerCase() });
      if (basePlan) basePrice = basePlan.price;
    }

    // 2. Fetch and calculate selected add-ons
    let addonsTotal = 0;
    const computedAddons = [];

    if (Array.isArray(selectedAddons) && selectedAddons.length > 0) {
      const addonIds = selectedAddons
        .map((a) => a.addonId || a._id || a.id)
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

      const dbAddons = await PricingAddon.find({ _id: { $in: addonIds }, isActive: true });

      selectedAddons.forEach((item) => {
        const targetId = item.addonId || item._id || item.id;
        const matchedAddon = dbAddons.find((a) => a._id.toString() === targetId.toString());

        if (matchedAddon) {
          const qty = Math.max(1, Number(item.quantity) || 1);
          const lineTotal = matchedAddon.price * qty;
          addonsTotal += lineTotal;

          computedAddons.push({
            addonId: matchedAddon._id,
            name: matchedAddon.name,
            slug: matchedAddon.slug,
            category: matchedAddon.category,
            unitPrice: matchedAddon.price,
            quantity: qty,
            unit: matchedAddon.unit,
            lineTotal,
          });
        }
      });
    }

    const subtotal = basePrice + addonsTotal;

    // 3. Validate and apply coupon code if provided
    let discountInfo = null;
    let discountAmount = 0;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const coupon = await Coupon.findOne({
        code: couponCode.trim().toUpperCase(),
        isActive: true,
      });

      if (coupon) {
        const now = new Date();
        const isValidDate = (!coupon.validFrom || now >= coupon.validFrom) && now <= coupon.validUntil;
        const isMinAmountMet = subtotal >= (coupon.minOrderAmount || 0);
        const isUsageAvailable = coupon.usageLimit ? coupon.usedCount < coupon.usageLimit : true;

        if (isValidDate && isMinAmountMet && isUsageAvailable) {
          if (coupon.discountType === 'percentage') {
            let pctDiscount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && pctDiscount > coupon.maxDiscountAmount) {
              pctDiscount = coupon.maxDiscountAmount;
            }
            discountAmount = Math.round(pctDiscount * 100) / 100;
          } else {
            discountAmount = Math.min(subtotal, coupon.discountValue);
          }

          discountInfo = {
            code: coupon.code,
            title: coupon.title,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount,
            savingsMessage: `You saved ₹${discountAmount.toLocaleString()} with promo code ${coupon.code}! 🎉`,
          };
        }
      }
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);

    res.json({
      success: true,
      data: {
        plan: basePlan
          ? {
              id: basePlan._id,
              name: basePlan.name,
              slug: basePlan.slug,
              basePrice,
            }
          : null,
        addons: computedAddons,
        pricingSummary: {
          basePrice,
          addonsTotal,
          subtotal,
          discount: discountInfo,
          discountAmount,
          finalTotal,
          currency: basePlan?.currency || 'INR',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 4. PROMO CODES & COUPONS ENGINE
// ==========================================

/**
 * Create Coupon (Admin)
 */
async function createCoupon(req, res, next) {
  try {
    const adminId = req.user._id || req.user.id;
    const {
      code,
      title,
      description,
      discountType = 'percentage',
      discountValue,
      minOrderAmount = 0,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit,
      perUserLimit = 1,
      applicablePlans = [],
      isActive = true,
    } = req.body;

    const normalizedCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Coupon code "${normalizedCode}" already exists.`,
      });
    }

    const coupon = new Coupon({
      code: normalizedCode,
      title: title.trim(),
      description: description ? description.trim() : '',
      discountType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: new Date(validUntil),
      usageLimit: usageLimit ? Number(usageLimit) : null,
      perUserLimit: Number(perUserLimit) || 1,
      applicablePlans: Array.isArray(applicablePlans) ? applicablePlans : [],
      isActive: Boolean(isActive),
      createdBy: adminId,
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: `Coupon "${coupon.code}" created successfully.`,
      data: { coupon },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Coupon (Admin)
 */
async function updateCoupon(req, res, next) {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit,
      perUserLimit,
      isActive,
    } = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found.',
      });
    }

    if (title) coupon.title = title.trim();
    if (description !== undefined) coupon.description = description.trim();
    if (discountType) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = Number(discountValue);
    if (minOrderAmount !== undefined) coupon.minOrderAmount = Number(minOrderAmount);
    if (maxDiscountAmount !== undefined)
      coupon.maxDiscountAmount = maxDiscountAmount ? Number(maxDiscountAmount) : null;
    if (validFrom) coupon.validFrom = new Date(validFrom);
    if (validUntil) coupon.validUntil = new Date(validUntil);
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
    if (perUserLimit !== undefined) coupon.perUserLimit = Number(perUserLimit);
    if (isActive !== undefined) coupon.isActive = Boolean(isActive);

    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon updated successfully.',
      data: { coupon },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Coupon (Admin)
 */
async function deleteCoupon(req, res, next) {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found.',
      });
    }

    res.json({
      success: true,
      message: 'Coupon deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle Coupon Active Status (Admin)
 */
async function toggleCouponStatus(req, res, next) {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found.',
      });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.json({
      success: true,
      message: `Coupon ${coupon.code} status toggled to ${coupon.isActive ? 'Active' : 'Inactive'}.`,
      data: { id: coupon._id, code: coupon.code, isActive: coupon.isActive },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get All Coupons (Admin)
 */
async function getAllCouponsAdmin(req, res, next) {
  try {
    const coupons = await Coupon.find()
      .populate('applicablePlans', 'name price')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        coupons,
        total: coupons.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Validate Coupon Code (Public / User)
 */
async function validateCouponPublic(req, res, next) {
  try {
    const { code, orderAmount = 0 } = req.body;
    const normalizedCode = code.trim().toUpperCase();

    const coupon = await Coupon.findOne({
      code: normalizedCode,
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or inactive promo coupon code.',
      });
    }

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return res.status(400).json({
        success: false,
        message: `This coupon will become active on ${coupon.validFrom.toLocaleDateString()}.`,
      });
    }

    if (now > coupon.validUntil) {
      return res.status(400).json({
        success: false,
        message: 'This coupon code has expired.',
      });
    }

    const numericAmount = Number(orderAmount) || 0;
    if (coupon.minOrderAmount && numericAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${coupon.minOrderAmount.toLocaleString()} required to use this coupon.`,
      });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has reached its maximum global redemption limit.',
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      let pct = (numericAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && pct > coupon.maxDiscountAmount) {
        pct = coupon.maxDiscountAmount;
      }
      discountAmount = Math.round(pct * 100) / 100;
    } else {
      discountAmount = Math.min(numericAmount, coupon.discountValue);
    }

    const finalPayable = Math.max(0, numericAmount - discountAmount);

    res.json({
      success: true,
      message: `Coupon "${coupon.code}" applied successfully! You save ₹${discountAmount.toLocaleString()}.`,
      data: {
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        originalAmount: numericAmount,
        finalPayable,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 5. PLAN INQUIRIES & CUSTOM REQUESTS
// ==========================================

/**
 * Submit Plan Inquiry OR Custom Plan Requirements (Supports Add-ons, Attachments & Coupons)
 */
async function createPlanInquiry(req, res, next) {
  try {
    const userId = req.user ? (req.user._id || req.user.id) : null;
    const {
      name,
      email,
      phone,
      pricingPlan,
      requestType = 'custom',
      projectTitle,
      projectType = 'Other',
      requirements,
      features,
      budget,
      timeline,
      selectedAddons,
      appliedCoupon,
      estimatedTotal,
      attachments = [],
    } = req.body;

    // Attachments handling
    let finalAttachments = Array.isArray(attachments) ? [...attachments] : [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const uploadResults = await uploadMultipleToCloudinary(req.files, {
        folder: 'rp-inquiries/attachments',
      });
      const uploadedDocs = uploadResults.map((r, idx) => ({
        url: r.secure_url,
        publicId: r.public_id,
        originalName: req.files[idx]?.originalname || 'attachment',
      }));
      finalAttachments = [...finalAttachments, ...uploadedDocs];
    }

    // Parse features
    let parsedFeatures = Array.isArray(features) ? features : [];
    if (typeof features === 'string') {
      try {
        parsedFeatures = JSON.parse(features);
      } catch {
        parsedFeatures = features.split(',').map((f) => f.trim());
      }
    }

    // Parse budget
    let parsedBudget = { min: null, max: null, currency: 'INR' };
    if (typeof budget === 'string') {
      try {
        parsedBudget = JSON.parse(budget);
      } catch {
        parsedBudget = { min: null, max: null, currency: 'INR' };
      }
    } else if (budget && typeof budget === 'object') {
      parsedBudget = {
        min: budget.min ? Number(budget.min) : null,
        max: budget.max ? Number(budget.max) : null,
        currency: budget.currency ? String(budget.currency).toUpperCase() : 'INR',
      };
    }

    // Parse selectedAddons
    let parsedAddons = Array.isArray(selectedAddons) ? selectedAddons : [];
    if (typeof selectedAddons === 'string') {
      try {
        parsedAddons = JSON.parse(selectedAddons);
      } catch {
        parsedAddons = [];
      }
    }

    // Parse appliedCoupon
    let parsedCoupon = appliedCoupon;
    if (typeof appliedCoupon === 'string') {
      try {
        parsedCoupon = JSON.parse(appliedCoupon);
      } catch {
        parsedCoupon = null;
      }
    }

    const inquiry = new PlanInquiry({
      user: userId,
      name: name.trim(),
      email: email ? email.trim().toLowerCase() : null,
      phone: phone.trim(),
      pricingPlan: pricingPlan && mongoose.Types.ObjectId.isValid(pricingPlan) ? pricingPlan : null,
      requestType: requestType || 'custom',
      projectTitle: projectTitle ? projectTitle.trim() : null,
      projectType: projectType ? projectType.trim() : 'Other',
      requirements: requirements ? requirements.trim() : null,
      features: parsedFeatures,
      budget: parsedBudget,
      timeline: timeline ? timeline.trim() : null,
      selectedAddons: parsedAddons,
      appliedCoupon: parsedCoupon || undefined,
      estimatedTotal: estimatedTotal ? Number(estimatedTotal) : null,
      attachments: finalAttachments,
      status: 'pending',
    });

    await inquiry.save();

    // Increment coupon used count if a valid coupon was attached
    if (parsedCoupon && parsedCoupon.code) {
      await Coupon.updateOne(
        { code: parsedCoupon.code },
        {
          $inc: { usedCount: 1 },
          $push: {
            usedBy: {
              userId: userId || undefined,
              usedAt: new Date(),
              discountGiven: parsedCoupon.discountAmount,
            },
          },
        }
      );
    }

    // Publish notification
    await redisService.publish('notifications', {
      event: 'NEW_PLAN_INQUIRY',
      inquiryId: inquiry._id,
      requestType: inquiry.requestType,
      clientName: inquiry.name,
      phone: inquiry.phone,
      projectType: inquiry.projectType,
    });

    res.status(201).json({
      success: true,
      message:
        requestType === 'custom'
          ? 'Your custom plan requirements have been submitted successfully. Our team will review and send you a quotation shortly!'
          : 'Plan inquiry submitted successfully. We will get in touch with you soon.',
      data: { inquiry },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get My Submitted Plan Inquiries (User - Protected)
 * Includes urgency timer and expiration status
 */
async function getMyInquiries(req, res, next) {
  try {
    const userId = req.user._id || req.user.id;
    const { status, requestType, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const query = { user: userId };
    if (status) query.status = status;
    if (requestType) query.requestType = requestType;

    const [inquiries, total] = await Promise.all([
      PlanInquiry.find(query)
        .populate('pricingPlan', 'name price billingType currency')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      PlanInquiry.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        inquiries,
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
 * Get My Single Inquiry Details (User - Protected)
 */
async function getMyInquiryById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid inquiry ID format.',
      });
    }

    const inquiry = await PlanInquiry.findOne({ _id: id, user: userId }).populate(
      'pricingPlan',
      'name price billingType currency features description'
    );

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Plan inquiry not found or does not belong to your account.',
      });
    }

    res.json({
      success: true,
      data: { inquiry },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Respond to Admin Quotation (Accept or Reject Quote) (User - Protected)
 * ⏳ Enforces Quotation Expiry & Urgency Check
 */
async function respondToQuoteUser(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "accept" or "reject".',
      });
    }

    const inquiry = await PlanInquiry.findOne({ _id: id, user: userId });
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Inquiry not found or access denied.',
      });
    }

    if (inquiry.status !== 'quoted') {
      return res.status(400).json({
        success: false,
        message: `Cannot respond to quote because current inquiry status is "${inquiry.status}".`,
      });
    }

    // ⏳ Check Quote Expiration
    if (inquiry.validUntil && new Date() > new Date(inquiry.validUntil)) {
      inquiry.status = 'expired';
      await inquiry.save();

      return res.status(400).json({
        success: false,
        message: `This quotation expired on ${new Date(inquiry.validUntil).toLocaleString()}. Please contact us to request a fresh quotation.`,
        isExpired: true,
      });
    }

    inquiry.status = action === 'accept' ? 'accepted' : 'rejected';
    inquiry.respondedAt = new Date();
    await inquiry.save();

    res.json({
      success: true,
      message: `Quote has been ${inquiry.status} successfully.`,
      data: {
        id: inquiry._id,
        status: inquiry.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// 6. PLAN INQUIRIES & QUOTES (ADMIN CONTROLLERS)
// ==========================================

/**
 * Get All Plan Inquiries & Custom Requests (Admin)
 */
async function getAllInquiriesAdmin(req, res, next) {
  try {
    const {
      status,
      requestType,
      projectType,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status) query.status = status;
    if (requestType) query.requestType = requestType;
    if (projectType) query.projectType = projectType;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { projectTitle: { $regex: search, $options: 'i' } },
        { requirements: { $regex: search, $options: 'i' } },
      ];
    }

    const [inquiries, total] = await Promise.all([
      PlanInquiry.find(query)
        .populate('user', 'name phone email profileImage')
        .populate('pricingPlan', 'name price currency billingType')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      PlanInquiry.countDocuments(query),
    ]);

    const stats = await PlanInquiry.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = {
      pending: 0,
      reviewing: 0,
      quoted: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
      completed: 0,
    };
    stats.forEach((s) => {
      if (statusCounts[s._id] !== undefined) statusCounts[s._id] = s.count;
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalInquiries: total,
          ...statusCounts,
        },
        inquiries,
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
 * Get Single Inquiry Details (Admin)
 */
async function getInquiryDetailsAdmin(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid inquiry ID format.',
      });
    }

    const inquiry = await PlanInquiry.findById(id)
      .populate('user', 'name phone email profileImage createdAt')
      .populate('pricingPlan', 'name price billingType currency features limitations description');

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Plan inquiry not found.',
      });
    }

    res.json({
      success: true,
      data: { inquiry },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Send Quotation with ⏳ Expiry / Validity Timer (Admin)
 */
async function sendAdminQuote(req, res, next) {
  try {
    const { id } = req.params;
    const { quotedPrice, adminResponse, adminNotes, validityHours = 48, validUntil } = req.body;

    const inquiry = await PlanInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Plan inquiry not found.',
      });
    }

    const now = new Date();
    const expiryDate = validUntil
      ? new Date(validUntil)
      : new Date(now.getTime() + (Number(validityHours) || 48) * 3600 * 1000);

    inquiry.quotedPrice = Number(quotedPrice);
    inquiry.adminResponse = adminResponse.trim();
    if (adminNotes !== undefined) inquiry.adminNotes = adminNotes.trim();
    inquiry.validityHours = Number(validityHours) || 48;
    inquiry.validUntil = expiryDate;
    inquiry.quotedAt = now;
    inquiry.status = 'quoted';

    await inquiry.save();

    // Publish notification
    if (inquiry.user) {
      await redisService.publish('notifications', {
        event: 'QUOTE_SENT',
        userId: inquiry.user,
        inquiryId: inquiry._id,
        quotedPrice: inquiry.quotedPrice,
        validUntil: inquiry.validUntil,
      });
    }

    res.json({
      success: true,
      message: `Quotation of ₹${inquiry.quotedPrice.toLocaleString()} sent with ${inquiry.validityHours}h validity timer.`,
      data: { inquiry },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update Inquiry Status (Admin)
 */
async function updateInquiryStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['pending', 'reviewing', 'quoted', 'accepted', 'rejected', 'expired', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
      });
    }

    const inquiry = await PlanInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Plan inquiry not found.',
      });
    }

    if (status) inquiry.status = status;
    if (adminNotes !== undefined) inquiry.adminNotes = adminNotes.trim();

    await inquiry.save();

    res.json({
      success: true,
      message: `Inquiry status updated to "${inquiry.status}".`,
      data: { inquiry },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete Inquiry (Admin)
 */
async function deleteInquiryAdmin(req, res, next) {
  try {
    const { id } = req.params;

    const inquiry = await PlanInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Plan inquiry not found.',
      });
    }

    if (Array.isArray(inquiry.attachments) && inquiry.attachments.length > 0) {
      inquiry.attachments.forEach((att) => {
        if (att.publicId) {
          deleteFromCloudinary(att.publicId, 'raw').catch(() => {});
        }
      });
    }

    await PlanInquiry.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Plan inquiry deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  // 1. Pricing plans - Admin
  createPricingPlan,
  updatePricingPlan,
  deletePricingPlan,
  togglePlanStatus,
  getAllPlansAdmin,

  // 2. Pricing plans - Public
  getActivePlansPublic,
  getPlanBySlugOrId,

  // 3. Add-on Builder & Dynamic Calculator
  createAddon,
  updateAddon,
  deleteAddon,
  toggleAddonStatus,
  getAllAddonsAdmin,
  getActiveAddonsPublic,
  calculateCustomPrice,

  // 4. Promo Codes & Coupons
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getAllCouponsAdmin,
  validateCouponPublic,

  // 5. Plan inquiries - User / Public
  createPlanInquiry,
  getMyInquiries,
  getMyInquiryById,
  respondToQuoteUser,

  // 6. Plan inquiries - Admin
  getAllInquiriesAdmin,
  getInquiryDetailsAdmin,
  sendAdminQuote,
  updateInquiryStatusAdmin,
  deleteInquiryAdmin,
};
