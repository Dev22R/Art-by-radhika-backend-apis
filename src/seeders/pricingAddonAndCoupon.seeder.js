const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const PricingAddon = require('../modules/pricing/pricingAddon.model');
const Coupon = require('../modules/pricing/coupon.model');

async function seedAddonsAndCoupons() {
  try {
    console.log('🔄 Connecting to Database for Add-ons & Coupons Seeding...');
    await connectDB();

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ Admin user not found! Please run "npm run seed:admin" first.');
      process.exit(1);
    }

    // 1. Seed Add-ons
    const sampleAddons = [
      {
        name: 'Extra Guest Mehndi (Single Hand)',
        slug: 'extra-guest-mehndi',
        category: 'guest_service',
        price: 350,
        currency: 'INR',
        unit: 'per_person',
        description: 'Traditional and Arabic single-side palm design per guest.',
        icon: 'Users',
        isActive: true,
        sortOrder: 1,
        createdBy: admin._id,
      },
      {
        name: '3D Bride & Groom Custom Portrait',
        slug: 'custom-portrait-art',
        category: 'portrait_art',
        price: 3500,
        currency: 'INR',
        unit: 'fixed',
        description: 'Intricate lifelike portrait artwork of bride and groom on palms/arms.',
        icon: 'Brush',
        isActive: true,
        sortOrder: 2,
        createdBy: admin._id,
      },
      {
        name: 'Luxury Feet Mehndi (Up to Mid-Calf)',
        slug: 'luxury-feet-mehndi',
        category: 'feet_mehndi',
        price: 4500,
        currency: 'INR',
        unit: 'fixed',
        description: 'Heavy bridal floral and jaal artwork for feet and calves.',
        icon: 'Sparkles',
        isActive: true,
        sortOrder: 3,
        createdBy: admin._id,
      },
      {
        name: 'Premium Rajasthani Organic Henna Kit (5 Cones)',
        slug: 'organic-henna-kit',
        category: 'henna_kit',
        price: 750,
        currency: 'INR',
        unit: 'per_item',
        description: '100% natural, triple-filtered herbal henna with pure eucalyptus oil.',
        icon: 'Package',
        isActive: true,
        sortOrder: 4,
        createdBy: admin._id,
      },
      {
        name: 'Speed Artist Upgrade (2 Additional Senior Artists)',
        slug: 'speed-artist-upgrade',
        category: 'artist_upgrade',
        price: 3000,
        currency: 'INR',
        unit: 'fixed',
        description: 'Accelerate wedding mehndi event execution with dedicated senior artists.',
        icon: 'Zap',
        isActive: true,
        sortOrder: 5,
        createdBy: admin._id,
      },
      {
        name: 'Bridal Aftercare Herbal Balm & Sealer Spray',
        slug: 'aftercare-kit',
        category: 'aftercare',
        price: 500,
        currency: 'INR',
        unit: 'fixed',
        description: 'Nourishing organic clove-infused balm for darkest mahogany color.',
        icon: 'HeartHandshake',
        isActive: true,
        sortOrder: 6,
        createdBy: admin._id,
      },
    ];

    for (const addon of sampleAddons) {
      const existing = await PricingAddon.findOne({ slug: addon.slug });
      if (existing) {
        Object.assign(existing, addon);
        await existing.save();
        console.log(`✅ Updated add-on: ${addon.name}`);
      } else {
        await PricingAddon.create(addon);
        console.log(`✨ Created add-on: ${addon.name}`);
      }
    }

    // 2. Seed Coupons
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const sampleCoupons = [
      {
        code: 'BRIDAL2026',
        title: 'Bridal Season 15% Off',
        description: 'Special 15% discount for wedding and bridal packages.',
        discountType: 'percentage',
        discountValue: 15,
        minOrderAmount: 8000,
        maxDiscountAmount: 3000,
        validFrom: new Date(),
        validUntil: oneYearLater,
        usageLimit: 500,
        perUserLimit: 2,
        isActive: true,
        createdBy: admin._id,
      },
      {
        code: 'FESTIVE1000',
        title: 'Festive Flat ₹1,000 Off',
        description: 'Flat ₹1,000 discount on bookings above ₹5,000.',
        discountType: 'fixed',
        discountValue: 1000,
        minOrderAmount: 5000,
        maxDiscountAmount: null,
        validFrom: new Date(),
        validUntil: oneYearLater,
        usageLimit: 200,
        perUserLimit: 1,
        isActive: true,
        createdBy: admin._id,
      },
      {
        code: 'RADHIKA10',
        title: 'Radhika Welcome 10% Off',
        description: 'Welcome discount 10% on any custom or standard plan.',
        discountType: 'percentage',
        discountValue: 10,
        minOrderAmount: 3000,
        maxDiscountAmount: 1500,
        validFrom: new Date(),
        validUntil: oneYearLater,
        usageLimit: 1000,
        perUserLimit: 1,
        isActive: true,
        createdBy: admin._id,
      },
    ];

    for (const coupon of sampleCoupons) {
      const existing = await Coupon.findOne({ code: coupon.code });
      if (existing) {
        Object.assign(existing, coupon);
        await existing.save();
        console.log(`✅ Updated coupon: ${coupon.code}`);
      } else {
        await Coupon.create(coupon);
        console.log(`✨ Created coupon: ${coupon.code}`);
      }
    }

    console.log('🎉 Add-ons and Coupons seeded successfully!');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedAddonsAndCoupons();
}

module.exports = seedAddonsAndCoupons;
