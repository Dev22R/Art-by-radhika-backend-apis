const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const {
  EstimatorConfig,
  EstimatorConfigHistory,
} = require('../modules/estimator/estimator.model');

/**
 * Default Henna Time & Cost Estimator configuration
 * All currency values are stored as INTEGERS in paise (₹1 = 100 paise).
 */
const DEFAULT_ESTIMATOR_CONFIG = {
  key: 'active',
  currency: 'INR',
  coverages: [
    {
      id: 'wrist',
      label: 'Wrist & Palms',
      description: 'Intricate design extending from fingertips to wrists on both palms.',
      basePrice: 250000, // ₹2,500 = 250,000 paise
      baseMinutes: 60,
      active: true,
      sortOrder: 1,
    },
    {
      id: 'forearm',
      label: 'Forearms Both Sides',
      description: 'Traditional motifs covering palms, wrists, and halfway up both forearms.',
      basePrice: 450000, // ₹4,500 = 450,000 paise
      baseMinutes: 120,
      active: true,
      sortOrder: 2,
    },
    {
      id: 'full-elbow',
      label: 'Full Elbow Bridal',
      description: 'Signature bridal layout covering fingers to elbows on both sides with custom elements.',
      basePrice: 700000, // ₹7,000 = 700,000 paise
      baseMinutes: 180,
      active: true,
      sortOrder: 3,
    },
    {
      id: 'full-bridal-feet',
      label: 'Royal Arms + Feet',
      description: 'Royal bridal package: full elbow mehndi on both arms plus matching intricate bridal feet work.',
      basePrice: 1100000, // ₹11,000 = 1,100,000 paise
      baseMinutes: 300,
      active: true,
      sortOrder: 4,
    },
  ],
  guestRules: {
    pricePerGuest: 50000, // ₹500 = 50,000 paise
    minutesPerGuest: 30, // 30 minutes per guest
    maxGuests: 15, // Up to 15 guests
  },
  bulkDiscounts: [
    {
      minGuests: 5,
      percent: 10, // 10% discount on guest charges for 5+ guests
    },
    {
      minGuests: 10,
      percent: 15, // 15% discount on guest charges for 10+ guests
    },
  ],
  minimumTotal: 0,
  tax: {
    percent: 0,
    inclusive: false,
  },
  timeBufferPercent: 15, // 15% buffer range (e.g. 3 - 3.5 hrs)
  includesText:
    'Includes 100% pure Rajasthani organic Sojat henna, essential aftercare kit, clove steam, and dark stain guarantee.',
  enabled: true,
  version: 1,
  changeNote: 'Initial default seed configuration',
};

async function seedEstimator() {
  try {
    console.log('🔄 Connecting to Database for Estimator Seeding...');
    await connectDB();

    // 1. Idempotency Check: if config exists, do not overwrite admin custom rules
    const existing = await EstimatorConfig.findOne({ key: 'active' });
    if (existing) {
      console.log(`ℹ️ Estimator configuration already exists (Version ${existing.version}).`);
      console.log('   Preserving existing admin rules. Seeding skipped.');
      await disconnectDB();
      process.exit(0);
    }

    // 2. Find admin user to assign createdBy/updatedBy
    const admin = await User.findOne({ role: 'admin' });
    const adminId = admin ? admin._id : null;

    const configDoc = new EstimatorConfig({
      ...DEFAULT_ESTIMATOR_CONFIG,
      updatedBy: adminId,
    });

    await configDoc.save();

    // 3. Create initial history record
    const historyDoc = new EstimatorConfigHistory({
      version: 1,
      snapshot: configDoc.toObject(),
      diff: null,
      changeNote: 'Initial default seed configuration',
      updatedBy: adminId,
    });

    await historyDoc.save();

    console.log('✅ Henna Time & Cost Estimator seeded successfully (Version 1).');
    console.log('   - 4 Coverage Options: Wrist, Forearm, Full-Elbow, Royal Arms+Feet');
    console.log('   - Guest Rules: ₹500/guest, 30 min/guest, max 15');
    console.log('   - Bulk Discounts: 5+ guests 10%, 10+ guests 15%');
    console.log('   - Time Buffer: 15%');
    console.log('   - Money stored as integer paise.');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during Estimator Seeding:', error);
    await disconnectDB();
    process.exit(1);
  }
}

// Allow direct execution or module export
if (require.main === module) {
  seedEstimator();
}

module.exports = {
  seedEstimator,
  DEFAULT_ESTIMATOR_CONFIG,
};
