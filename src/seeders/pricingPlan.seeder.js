const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const PricingPlan = require('../modules/pricing/pricingPlan.model');

async function seedPricingPlans() {
  try {
    console.log('🔄 Connecting to Database for Pricing Plans Seeding...');
    await connectDB();

    // Find admin user
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ Admin user not found! Please run "npm run seed:admin" first.');
      process.exit(1);
    }

    const defaultPlans = [
      {
        name: 'Basic',
        slug: 'basic',
        description: 'Perfect for small events and simple minimalist artistic styling.',
        price: 4999,
        currency: 'INR',
        billingType: 'one-time',
        features: [
          'Single side both hands mehndi',
          'Traditional and Arabic floral designs',
          'Organic certified dark-stain henna cones',
          '1 Dedicated Certified Artist',
          'Complimentary aftercare herbal oil',
        ],
        limitations: [
          'No portrait figures included',
          'Maximum 2 hours service time',
        ],
        isPopular: false,
        isActive: true,
        sortOrder: 1,
        createdBy: admin._id,
      },
      {
        name: 'Standard',
        slug: 'standard',
        description: 'Our most popular choice for engagements, festivals, and family celebrations.',
        price: 9999,
        currency: 'INR',
        billingType: 'one-time',
        features: [
          'Full hands up to elbows (Front & Back)',
          'Intricate Indo-Arabic and Mandala styling',
          'Feet mehndi up to ankles included',
          '2 Dedicated Master Artists',
          'Natural Henna + Lemon Sugar seal spray',
          'Priority date scheduling',
        ],
        limitations: [
          'Custom customized portrait requires add-on',
        ],
        isPopular: true,
        isActive: true,
        sortOrder: 2,
        createdBy: admin._id,
      },
      {
        name: 'Premium',
        slug: 'premium',
        description: 'Complete luxury bridal package with customized storytelling motifs.',
        price: 18999,
        currency: 'INR',
        billingType: 'one-time',
        features: [
          'Complete Royal Bridal Full Hand & Feet artwork',
          'Custom Dulha-Dulhan portrait & wedding storytelling elements',
          'Full arms up to upper elbows + legs up to mid-calf',
          '3 Master Senior Artists lead by Radhika',
          'Premium Organic Rajasthani Henna with guarantee of deep mahogany stain',
          'Bridal aftercare luxury gift kit',
          'Complimentary touch-ups on wedding morning',
        ],
        limitations: [],
        isPopular: false,
        isActive: true,
        sortOrder: 3,
        createdBy: admin._id,
      },
    ];

    for (const planData of defaultPlans) {
      const existing = await PricingPlan.findOne({ slug: planData.slug });
      if (existing) {
        Object.assign(existing, planData);
        await existing.save();
        console.log(`✅ Updated existing plan: ${planData.name} (slug: ${planData.slug})`);
      } else {
        await PricingPlan.create(planData);
        console.log(`✨ Created new plan: ${planData.name} (slug: ${planData.slug})`);
      }
    }

    console.log('🎉 Pricing plans seeded successfully!');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Pricing plans seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedPricingPlans();
}

module.exports = seedPricingPlans;
