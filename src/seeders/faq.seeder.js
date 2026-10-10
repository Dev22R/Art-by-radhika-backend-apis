const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const Faq = require('../modules/faq/faq.model');

async function seedFaqs() {
  try {
    console.log('🔄 Connecting to Database for FAQ Seeding...');
    await connectDB();

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ Admin user not found! Please run "npm run seed:admin" first.');
      process.exit(1);
    }

    const defaultFaqs = [
      {
        question: 'How far in advance should I book my bridal mehndi?',
        answer: 'We strongly recommend booking your bridal mehndi at least 2 to 6 months in advance, especially during the peak wedding season (October to March). This guarantees date availability and allows adequate time for custom design consultations.',
        category: 'bridal',
        tags: ['bridal', 'advance booking', 'wedding dates'],
        isPublished: true,
        sortOrder: 1,
        createdBy: admin._id,
      },
      {
        question: 'What kind of henna/mehndi do you use? Is it safe for sensitive skin?',
        answer: 'We use 100% pure, certified organic Sojat Rajasthani henna mixed exclusively with natural therapeutic essential oils (eucalyptus and tea tree oil). Our henna is completely free from PPD, synthetic chemicals, and preservatives, making it 100% safe for all skin types, including sensitive skin.',
        category: 'mehndi_aftercare',
        tags: ['organic henna', 'skin safe', 'chemical free'],
        isPublished: true,
        sortOrder: 2,
        createdBy: admin._id,
      },
      {
        question: 'How do I get the deepest, darkest mahogany stain on my wedding day?',
        answer: 'To achieve the darkest stain: 1) Keep the henna paste on your skin for 6-8 hours (overnight is best). 2) Apply lemon-sugar syrup 2-3 times while the paste dries. 3) Scrape off the paste gently using coconut/mustard oil (DO NOT wash with water for the first 24 hours). 4) Apply clove steam (laung ka dhuwan) and our complimentary aftercare herbal balm.',
        category: 'mehndi_aftercare',
        tags: ['dark stain', 'aftercare', 'bridal tips'],
        isPublished: true,
        sortOrder: 3,
        createdBy: admin._id,
      },
      {
        question: 'Can I request a custom design featuring our portrait and wedding story?',
        answer: 'Yes, absolutely! Our Master Artist Radhika specializes in personalized 3D portrait artwork, including custom bride-groom faces, wedding hashtags, sacred wedding vows, monuments, and personal love story elements. You can share your reference photos during booking.',
        category: 'bridal',
        tags: ['custom portrait', 'love story mehndi', 'dulha dulhan'],
        isPublished: true,
        sortOrder: 4,
        createdBy: admin._id,
      },
      {
        question: 'What is your cancellation and rescheduling policy?',
        answer: 'You can reschedule your appointment up to 14 days prior to your booked event date subject to slot availability. In case of cancellation, advance token deposits are non-refundable but can be adjusted for future appointments within 6 months.',
        category: 'cancellation',
        tags: ['cancellation', 'rescheduling', 'policy'],
        isPublished: true,
        sortOrder: 5,
        createdBy: admin._id,
      },
      {
        question: 'Do you provide on-location services for destination weddings?',
        answer: 'Yes! We travel worldwide for destination weddings across India (Udaipur, Jaipur, Goa, Kerala, Delhi-NCR) and internationally (Dubai, Thailand, UK, USA). Travel and lodging arrangements are calculated based on location and artist team size.',
        category: 'booking',
        tags: ['destination wedding', 'travel', 'outstation'],
        isPublished: true,
        sortOrder: 6,
        createdBy: admin._id,
      },
      {
        question: 'How do custom pricing plans and quotes work?',
        answer: 'You can explore our standard plans (Basic, Standard, Premium) or submit a Custom Plan Request on our website with your specific guest count, portrait requirements, and budget. Our team will review and send you a customized quotation with a 48-hour price-lock guarantee.',
        category: 'pricing',
        tags: ['custom plans', 'quotation', 'pricing'],
        isPublished: true,
        sortOrder: 7,
        createdBy: admin._id,
      },
    ];

    for (const item of defaultFaqs) {
      const existing = await Faq.findOne({ question: item.question });
      if (existing) {
        Object.assign(existing, item);
        await existing.save();
        console.log(`✅ Updated FAQ: "${item.question.slice(0, 45)}..."`);
      } else {
        await Faq.create(item);
        console.log(`✨ Created FAQ: "${item.question.slice(0, 45)}..."`);
      }
    }

    console.log('🎉 FAQs seeded successfully!');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ FAQ seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedFaqs();
}

module.exports = seedFaqs;
