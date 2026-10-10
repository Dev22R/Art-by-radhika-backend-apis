const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const { Category, Subcategory } = require('../modules/category/category.model');

const sampleCategories = [
  {
    name: 'Bridal Mehndi',
    slug: 'bridal',
    description: 'Extravagant, high-density masterpiece mehndi designs tailored for modern and traditional brides.',
    icon: 'crown',
    image: {
      url: 'https://images.unsplash.com/photo-1599818499218-55ed400708b8?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: true,
    sortOrder: 1,
    subcategories: [
      {
        name: 'Full Hand to Elbow',
        slug: 'full-hand-to-elbow',
        description: 'Complete coverage from fingertips up to the elbow with dense traditional jaal work.',
        sortOrder: 1,
      },
      {
        name: 'Dulha-Dulhan Portrait',
        slug: 'dulha-dulhan-portrait',
        description: 'Realistic or stylized couple portraits embedded inside bridal mandalas.',
        sortOrder: 2,
      },
      {
        name: 'Royal Marwar Architecture',
        slug: 'royal-marwar-architecture',
        description: 'Heritage Rajasthani palace arches, elephant processions, and dancing peacocks.',
        sortOrder: 3,
      },
    ],
  },
  {
    name: 'Arabic Mehndi',
    slug: 'arabic',
    description: 'Free-flowing diagonal floral vines, bold outlines, and elegant negative space.',
    icon: 'sparkles',
    image: {
      url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: true,
    sortOrder: 2,
    subcategories: [
      {
        name: 'Flowing Bel & Vine Trails',
        slug: 'flowing-bel-vine-trails',
        description: 'Diagonal trails starting from index finger running gracefully across the wrist.',
        sortOrder: 1,
      },
      {
        name: 'Bold Silhouette Shading',
        slug: 'bold-silhouette-shading',
        description: 'Contrast-heavy filled petals and leafy vines.',
        sortOrder: 2,
      },
    ],
  },
  {
    name: 'Indo-Arabic Mehndi',
    slug: 'indo-arabic',
    description: 'Seamless harmony of fine Indian intricate fillings with bold Arabic flowing borders.',
    icon: 'feather',
    image: {
      url: 'https://images.unsplash.com/photo-1583089892943-e02e5b017b6a?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: true,
    sortOrder: 3,
    subcategories: [
      {
        name: 'Front & Back Palms Fusion',
        slug: 'front-back-palms-fusion',
        description: 'Balanced front palm jaal with stylish modern backhand vines.',
        sortOrder: 1,
      },
      {
        name: 'Checkered Jaal with Arabic Trails',
        slug: 'checkered-jaal-arabic-trails',
        description: 'Delicate gridlines paired with prominent leafy trail headers.',
        sortOrder: 2,
      },
    ],
  },
  {
    name: 'Minimalist Mehndi',
    slug: 'minimal',
    description: 'Clean, contemporary, fast application designs for modern aesthetics and office wear.',
    icon: 'sun',
    image: {
      url: 'https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: false,
    sortOrder: 4,
    subcategories: [
      {
        name: 'Center Palm Mandala',
        slug: 'center-palm-mandala',
        description: 'Precise geometric circular mandala surrounded by fingertip caps.',
        sortOrder: 1,
      },
      {
        name: 'Jewelry Finger Ring Accents',
        slug: 'jewelry-finger-ring-accents',
        description: 'Minimal chain-like ring and wrist bracelet patterns.',
        sortOrder: 2,
      },
    ],
  },
  {
    name: 'Feet & Legs Mehndi',
    slug: 'feet',
    description: 'Captivating bridal foot jewelry patterns, intricate payal bands, and toe accents.',
    icon: 'heart',
    image: {
      url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: true,
    sortOrder: 5,
    subcategories: [
      {
        name: 'Bridal Payal & Anklets',
        slug: 'bridal-payal-anklets',
        description: 'Cuff patterns around ankles resembling royal gold and silver payal ornaments.',
        sortOrder: 1,
      },
      {
        name: 'Intricate Lotus Foot Lace',
        slug: 'intricate-lotus-foot-lace',
        description: 'Symmetrical lotus flowers and webbed lace across the bridge of the feet.',
        sortOrder: 2,
      },
    ],
  },
  {
    name: 'Portrait Mehndi',
    slug: 'portrait',
    description: 'Bespoke hand-drawn portraits of the bride, groom, parents, or divine deities.',
    icon: 'user',
    image: {
      url: 'https://images.unsplash.com/photo-1599818499218-55ed400708b8?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: false,
    sortOrder: 6,
    subcategories: [
      {
        name: 'Custom Couple Figures',
        slug: 'custom-couple-figures',
        description: 'Varmala, Sindoor, or romantic moments illustrated in henna.',
        sortOrder: 1,
      },
    ],
  },
  {
    name: 'Traditional Mehndi',
    slug: 'traditional',
    description: 'Centuries-old folk motifs including dholak, shehnai, kalash, and peacock jaal.',
    icon: 'bell',
    image: {
      url: 'https://images.unsplash.com/photo-1583089892943-e02e5b017b6a?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: false,
    sortOrder: 7,
    subcategories: [
      {
        name: 'Rajasthani Folk & Shehnai',
        slug: 'rajasthani-folk-shehnai',
        description: 'Festive musical instruments and cultural symbols.',
        sortOrder: 1,
      },
    ],
  },
  {
    name: 'Party & Festive Mehndi',
    slug: 'party',
    description: 'Speedy, charming mehndi designs perfect for bridesmaids, Teej, Karwa Chauth, and Diwali.',
    icon: 'gift',
    image: {
      url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
    },
    isPublished: true,
    isFeatured: false,
    sortOrder: 8,
    subcategories: [
      {
        name: 'Bridesmaid Quick Glam',
        slug: 'bridesmaid-quick-glam',
        description: '10-15 minute trendy palms and backhand highlights.',
        sortOrder: 1,
      },
    ],
  },
];

async function seedCategories() {
  try {
    console.log('🔄 Connecting to Database...');
    await connectDB();

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('👑 Creating default Admin for categories...');
      admin = new User({
        name: 'Art By Radhika Admin',
        email: 'admin@artbyradhika.com',
        phone: '9999999999',
        password: 'ABR@123456',
        role: 'admin',
        isPhoneVerified: true,
        isProfileCompleted: true,
        isActive: true,
      });
      await admin.save();
    }

    console.log('🧹 Cleaning existing categories and subcategories...');
    await Category.deleteMany({ slug: { $in: sampleCategories.map((c) => c.slug) } });
    await Subcategory.deleteMany({});

    console.log(`✨ Seeding ${sampleCategories.length} Categories and their Subcategories...`);

    for (const catData of sampleCategories) {
      const { subcategories, ...catFields } = catData;

      const category = new Category({
        ...catFields,
        createdBy: admin._id,
      });

      await category.save();
      console.log(`  📂 Inserted Category: ${category.name} (${category.slug})`);

      if (Array.isArray(subcategories) && subcategories.length > 0) {
        for (const subData of subcategories) {
          const subcategory = new Subcategory({
            ...subData,
            categoryId: category._id,
            createdBy: admin._id,
          });
          await subcategory.save();
          console.log(`     ↳ 📄 Subcategory: ${subcategory.name} (${subcategory.slug})`);
        }
      }
    }

    console.log('\n🎉 Categories and Subcategories seeded successfully!\n');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Category seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedCategories();
}

module.exports = seedCategories;
