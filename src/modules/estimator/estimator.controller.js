const {
  EstimatorConfig,
  EstimatorConfigHistory,
  EstimatorEnquiry,
} = require('./estimator.model');
const { calculateEstimator } = require('./estimator.calculator');
const { getActiveConfig, invalidateConfigCache } = require('./estimator.cache');

/**
 * Compute shallow/deep key diff for audit logs
 * @param {Object} oldObj
 * @param {Object} newObj
 * @returns {Object} Changed fields with old and new values
 */
function computeConfigDiff(oldObj, newObj) {
  const diff = {};
  const ignored = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'version', 'updatedBy', 'key']);
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  for (const key of allKeys) {
    if (ignored.has(key)) continue;
    const oldVal = oldObj ? oldObj[key] : undefined;
    const newVal = newObj ? newObj[key] : undefined;

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = {
        from: oldVal,
        to: newVal,
      };
    }
  }

  return diff;
}

// ==========================================
// PUBLIC CONTROLLERS
// ==========================================

/**
 * GET /api/v1/estimator/config
 * Public configuration retrieval.
 * Strict Privacy: Does NOT expose base prices, discount slabs, or margins.
 */
async function getPublicConfig(req, res, next) {
  try {
    const config = req.estimatorConfig || (await getActiveConfig());

    if (!config || config.enabled === false) {
      return res.status(503).json({
        error: {
          code: 'ESTIMATOR_MAINTENANCE',
          message: 'The Henna Time & Cost Estimator is currently disabled for maintenance.',
        },
      });
    }

    // Filter and sanitize active coverages only
    const coverages = (Array.isArray(config.coverages) ? config.coverages : [])
      .filter((c) => c.active !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description || '',
      }));

    res.json({
      data: {
        coverages,
        maxGuests: config.guestRules?.maxGuests || 15,
        includesText: config.includesText || '',
        currency: config.currency || 'INR',
        enabled: config.enabled,
        configVersion: config.version,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/estimator/calculate
 * Calculate total price, duration, and breakdown for selected package.
 */
async function calculateQuote(req, res, next) {
  try {
    const config = req.estimatorConfig || (await getActiveConfig());
    const { coverageId, guests } = req.body;

    const result = calculateEstimator({
      config,
      coverageId,
      guests,
    });

    res.json({
      data: result,
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 400).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details || null,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/estimator/enquiry
 * Submit customer inquiry with server re-calculated quote.
 * Never trusts client-sent prices; stores immutable quote snapshot.
 */
async function submitEnquiry(req, res, next) {
  try {
    const config = req.estimatorConfig || (await getActiveConfig());
    const {
      name,
      phone,
      email,
      eventDate,
      location,
      notes,
      coverageId,
      guests,
    } = req.body;

    // Server independently recalculates price to prevent tampering
    const quote = calculateEstimator({
      config,
      coverageId,
      guests,
    });

    const enquiry = new EstimatorEnquiry({
      user: req.user?._id || null,
      name,
      phone,
      email: email || null,
      eventDate: eventDate ? new Date(eventDate) : null,
      location: location || null,
      notes: notes || null,
      coverageId: quote.coverage.id,
      guests: quote.guests.total,
      quote,
      configVersion: quote.configVersion,
      status: 'pending',
    });

    await enquiry.save();

    res.status(201).json({
      message: 'Enquiry submitted successfully. Our team will contact you shortly.',
      data: {
        enquiryId: enquiry._id,
        quote: enquiry.quote,
        createdAt: enquiry.createdAt,
      },
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 400).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details || null,
        },
      });
    }
    next(err);
  }
}

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * GET /api/v1/admin/estimator/config
 * Admin: Get full configuration with all prices and rules.
 */
async function getAdminConfig(req, res, next) {
  try {
    const config = await EstimatorConfig.findOne({ key: 'active' })
      .populate('updatedBy', 'name email')
      .lean();

    if (!config) {
      return res.status(404).json({
        error: {
          code: 'CONFIG_NOT_FOUND',
          message: 'No estimator configuration found. Please run seeder or create one.',
        },
      });
    }

    res.json({
      data: config,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/admin/estimator/config
 * Admin: Full configuration update with Optimistic Concurrency Control (version).
 */
async function updateAdminConfig(req, res, next) {
  try {
    const adminId = req.user?._id || req.user?.id || null;
    const incomingData = req.body;

    // 1. Fetch current active configuration
    const currentConfig = await EstimatorConfig.findOne({ key: 'active' });

    if (!currentConfig) {
      return res.status(404).json({
        error: {
          code: 'CONFIG_NOT_FOUND',
          message: 'No active configuration to update. Please seed the database first.',
        },
      });
    }

    // 2. Optimistic Concurrency Control: verify version matches
    if (currentConfig.version !== incomingData.version) {
      return res.status(409).json({
        error: {
          code: 'VERSION_CONFLICT',
          message: `Concurrency Conflict: The configuration was modified by another session (expected version ${incomingData.version}, current server version is ${currentConfig.version}). Please reload before applying changes.`,
          currentVersion: currentConfig.version,
        },
      });
    }

    const previousSnapshot = currentConfig.toObject();
    const diff = computeConfigDiff(previousSnapshot, incomingData);

    // 3. Save snapshot to History Collection
    const historyRecord = new EstimatorConfigHistory({
      version: currentConfig.version,
      snapshot: previousSnapshot,
      diff,
      changeNote: incomingData.changeNote || 'Admin update',
      updatedBy: adminId,
    });
    await historyRecord.save();

    // 4. Increment version and apply update
    const nextVersion = currentConfig.version + 1;

    currentConfig.currency = incomingData.currency || currentConfig.currency;
    currentConfig.coverages = incomingData.coverages;
    currentConfig.guestRules = incomingData.guestRules;
    currentConfig.bulkDiscounts = incomingData.bulkDiscounts || [];
    currentConfig.minimumTotal = incomingData.minimumTotal || 0;
    currentConfig.tax = incomingData.tax || { percent: 0, inclusive: false };
    currentConfig.timeBufferPercent =
      typeof incomingData.timeBufferPercent === 'number'
        ? incomingData.timeBufferPercent
        : 15;
    currentConfig.includesText = incomingData.includesText || '';
    currentConfig.enabled =
      incomingData.enabled !== undefined ? incomingData.enabled : currentConfig.enabled;
    currentConfig.version = nextVersion;
    currentConfig.changeNote = incomingData.changeNote || `Updated to version ${nextVersion}`;
    currentConfig.updatedBy = adminId;

    await currentConfig.save();

    // 5. Invalidate caches immediately
    await invalidateConfigCache();

    res.json({
      message: `Configuration updated successfully to version ${nextVersion}.`,
      data: currentConfig,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/admin/estimator/config/history
 * Admin: Get configuration version history and audit log diffs.
 */
async function getConfigHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      EstimatorConfigHistory.find()
        .populate('updatedBy', 'name email')
        .sort({ version: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EstimatorConfigHistory.countDocuments(),
    ]);

    res.json({
      data: {
        history,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/estimator/config/rollback/:version
 * Admin: Rollback configuration to a historical version.
 */
async function rollbackConfigVersion(req, res, next) {
  try {
    const adminId = req.user?._id || req.user?.id || null;
    const targetVersion = parseInt(req.params.version, 10);

    if (isNaN(targetVersion) || targetVersion < 1) {
      return res.status(400).json({
        error: {
          code: 'INVALID_VERSION',
          message: 'Target version must be a positive integer.',
        },
      });
    }

    // 1. Locate historical snapshot
    const historyItem = await EstimatorConfigHistory.findOne({ version: targetVersion });
    if (!historyItem || !historyItem.snapshot) {
      return res.status(404).json({
        error: {
          code: 'VERSION_NOT_FOUND',
          message: `Version ${targetVersion} was not found in configuration history.`,
        },
      });
    }

    // 2. Fetch current active configuration
    const currentConfig = await EstimatorConfig.findOne({ key: 'active' });
    if (!currentConfig) {
      return res.status(404).json({
        error: {
          code: 'CONFIG_NOT_FOUND',
          message: 'Active configuration not found.',
        },
      });
    }

    const previousSnapshot = currentConfig.toObject();
    const restoredData = historyItem.snapshot;

    // 3. Save current state to history before rollback
    const rollbackDiff = computeConfigDiff(previousSnapshot, restoredData);
    const historyRecord = new EstimatorConfigHistory({
      version: currentConfig.version,
      snapshot: previousSnapshot,
      diff: rollbackDiff,
      changeNote: `Rollback triggered: state before rolling back to version ${targetVersion}`,
      updatedBy: adminId,
    });
    await historyRecord.save();

    // 4. Apply restored snapshot with incremented version
    const nextVersion = currentConfig.version + 1;

    currentConfig.currency = restoredData.currency || 'INR';
    currentConfig.coverages = restoredData.coverages;
    currentConfig.guestRules = restoredData.guestRules;
    currentConfig.bulkDiscounts = restoredData.bulkDiscounts || [];
    currentConfig.minimumTotal = restoredData.minimumTotal || 0;
    currentConfig.tax = restoredData.tax || { percent: 0, inclusive: false };
    currentConfig.timeBufferPercent = restoredData.timeBufferPercent || 15;
    currentConfig.includesText = restoredData.includesText || '';
    currentConfig.enabled = restoredData.enabled !== undefined ? restoredData.enabled : true;
    currentConfig.version = nextVersion;
    currentConfig.changeNote = `Rolled back to settings from version ${targetVersion}`;
    currentConfig.updatedBy = adminId;

    await currentConfig.save();

    // 5. Invalidate caches
    await invalidateConfigCache();

    res.json({
      message: `Configuration successfully rolled back to version ${targetVersion} (now active as version ${nextVersion}).`,
      data: currentConfig,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/admin/estimator/preview
 * Admin: Run calculation against a draft config without saving to database.
 */
async function previewDraftConfig(req, res, next) {
  try {
    const { config: draftConfig, coverageId, guests } = req.body;

    // Fall back to active config if draftConfig is omitted
    const baseConfig = draftConfig || (await getActiveConfig());

    if (!baseConfig) {
      return res.status(404).json({
        error: {
          code: 'CONFIG_NOT_FOUND',
          message: 'No base configuration available for preview.',
        },
      });
    }

    const result = calculateEstimator({
      config: baseConfig,
      coverageId,
      guests,
    });

    res.json({
      data: {
        preview: true,
        calculation: result,
      },
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 400).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details || null,
        },
      });
    }
    next(err);
  }
}

module.exports = {
  getPublicConfig,
  calculateQuote,
  submitEnquiry,
  getAdminConfig,
  updateAdminConfig,
  getConfigHistory,
  rollbackConfigVersion,
  previewDraftConfig,
};
