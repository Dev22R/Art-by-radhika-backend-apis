const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const Design = require('../modules/design/design.model');
const Reel = require('../modules/reel/reel.model');

const sampleDesigns = [
  {
    title: 'Royal Marwar Bridal Mehndi',
    slug: 'royal-marwar-bridal-mehndi-101',
    designCode: 'DES-BR-101',
    description:
      'Ultra intricate Rajasthani Marwar bridal mehndi featuring traditional dulha-dulhan portrait, peacock motifs, elephant procession, and delicate jaal work covering elbow to fingertips.',
    category: 'bridal',
    subCategory: 'Full Hand & Forearm',
    tags: ['bridal', 'marwari', 'portrait', 'dulha-dulhan', 'intricate', 'wedding'],
    complexity: 'masterpiece',
    placement: ['front_hand', 'back_hand', 'full_arm'],
    estimatedTime: '4-5 hours',
    price: 15000,
    discountedPrice: 12999,
    currency: 'INR',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1599818499218-55ed400708b8?q=80&w=1200&auto=format&fit=crop',
        caption: 'Detailed Bridal Palm Portrait & Jaal',
        isCover: true,
        sortOrder: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1200&auto=format&fit=crop',
        caption: 'Backhand Mandala & Symphony',
        isCover: false,
        sortOrder: 1,
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1599818499218-55ed400708b8?q=80&w=1200&auto=format&fit=crop',
    video: {
      url: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-an-indian-bride-with-henna-and-jewelry-41372-large.mp4',
      duration: 18,
      format: 'mp4',
    },
    showInReelFeed: true,
    isPublished: true,
    isFeatured: true,
    isTrending: true,
    isBookable: true,
    sortOrder: 1,
    likeCount: 42,
    viewCount: 310,
    bookingCount: 14,
  },
  {
    title: 'Modern Indo-Arabic Floral Fusion',
    slug: 'modern-indo-arabic-floral-fusion-102',
    designCode: 'DES-AR-102',
    description:
      'A contemporary blend of flowing Arabic leafy vines with fine Indian shading. Perfect for sangeet, engagement, and stylish bridesmaids.',
    category: 'indo-arabic',
    subCategory: 'Front & Back Palms',
    tags: ['indo-arabic', 'floral', 'vines', 'modern', 'sangeet', 'engagement'],
    complexity: 'medium',
    placement: ['front_hand', 'back_hand'],
    estimatedTime: '1.5-2 hours',
    price: 4500,
    discountedPrice: 3999,
    currency: 'INR',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
        caption: 'Flowing Arabic Trails',
        isCover: true,
        sortOrder: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1583089892943-e02e5b017b6a?q=80&w=1200&auto=format&fit=crop',
        caption: 'Backhand Shaded Vines',
        isCover: false,
        sortOrder: 1,
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
    video: {
      url: 'https://assets.mixkit.co/videos/preview/mixkit-delicate-henna-drawings-on-the-hands-of-an-indian-woman-41370-large.mp4',
      duration: 15,
      format: 'mp4',
    },
    showInReelFeed: true,
    isPublished: true,
    isFeatured: true,
    isTrending: false,
    isBookable: true,
    sortOrder: 2,
    likeCount: 28,
    viewCount: 195,
    bookingCount: 8,
  },
  {
    title: 'Minimalist Bohemian Mandala',
    slug: 'minimalist-bohemian-mandala-103',
    designCode: 'DES-MN-103',
    description:
      'Clean geometric symmetry centered around a celestial mandala with fingertip accents. Chic, fast application, and aesthetically stunning.',
    category: 'minimal',
    subCategory: 'Center Palm & Cuff',
    tags: ['minimal', 'mandala', 'boho', 'chic', 'fast', 'festive'],
    complexity: 'simple',
    placement: ['front_hand'],
    estimatedTime: '45 mins',
    price: 2500,
    discountedPrice: 1999,
    currency: 'INR',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?q=80&w=1200&auto=format&fit=crop',
        caption: 'Clean Mandala Focus',
        isCover: true,
        sortOrder: 0,
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?q=80&w=1200&auto=format&fit=crop',
    showInReelFeed: false,
    isPublished: true,
    isFeatured: false,
    isTrending: true,
    isBookable: true,
    sortOrder: 3,
    likeCount: 19,
    viewCount: 140,
    bookingCount: 5,
  },
  {
    title: 'Regal Payal & Feet Bridal Artistry',
    slug: 'regal-payal-feet-bridal-artistry-104',
    designCode: 'DES-FT-104',
    description:
      'Intricate ankle cuffs mimicking bridal jewelry (payal) with delicate toe rings and symmetrical lotus foot lace.',
    category: 'feet',
    subCategory: 'Feet & Ankles',
    tags: ['feet', 'bridal', 'payal', 'lotus', 'wedding', 'feet-mehndi'],
    complexity: 'intricate',
    placement: ['feet', 'ankles'],
    estimatedTime: '2-3 hours',
    price: 6000,
    discountedPrice: 4999,
    currency: 'INR',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1200&auto=format&fit=crop',
        caption: 'Bridal Anklet Payal Pattern',
        isCover: true,
        sortOrder: 0,
      },
    ],
    coverImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1200&auto=format&fit=crop',
    showInReelFeed: false,
    isPublished: true,
    isFeatured: true,
    isTrending: false,
    isBookable: true,
    sortOrder: 4,
    likeCount: 35,
    viewCount: 220,
    bookingCount: 9,
  },
];

async function seedDesigns() {
  try {
    console.log('🔄 Connecting to Database...');
    await connectDB();

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('👑 Creating default Admin for designs...');
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

    console.log('🧹 Cleaning existing sample designs...');
    await Design.deleteMany({ designCode: { $in: sampleDesigns.map((d) => d.designCode) } });

    console.log(`✨ Seeding ${sampleDesigns.length} Mehndi Designs...`);

    for (const item of sampleDesigns) {
      const design = new Design({
        ...item,
        createdBy: admin._id,
      });

      // If showInReelFeed is true, create linked Reel
      if (item.showInReelFeed && item.video && item.video.url) {
        const reel = new Reel({
          title: item.title,
          description: item.description,
          tags: item.tags,
          video: item.video,
          thumbnail: {
            url: item.coverImage,
          },
          adminDesign: {
            designName: item.title,
            designCode: item.designCode,
            category: item.category,
            price: item.price,
            discountedPrice: item.discountedPrice,
            estimatedTime: item.estimatedTime,
            images: item.images.map((img) => img.url),
            description: item.description,
            isBookable: item.isBookable,
          },
          status: 'published',
          isPublished: true,
          publishedAt: new Date(),
          createdBy: admin._id,
        });

        await reel.save();
        design.linkedReelId = reel._id;
      }

      await design.save();
      console.log(`  ✅ Inserted design: ${design.title} (${design.designCode}) [Reel Feed: ${design.showInReelFeed}]`);
    }

    console.log('\n🎉 Designs seeded successfully!\n');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Design seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDesigns();
}

module.exports = seedDesigns;
