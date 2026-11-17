const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');
const Testimonial = require('../modules/testimonials/testimonial.model');

async function seedTestimonials() {
  try {
    console.log('🔄 Connecting to Database for Testimonial Seeding...');
    await connectDB();

    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ Admin user not found! Please run "npm run seed:admin" first.');
      process.exit(1);
    }

    // Try to find a normal user for sample feedback submission
    let normalUser = await User.findOne({ role: 'user' });
    if (!normalUser) {
      normalUser = admin;
    }

    console.log('🧹 Clearing existing seed testimonials...');
    await Testimonial.deleteMany({});

    const defaultTestimonials = [
      {
        name: 'Aarti Sharma',
        designation: 'Bridal Client',
        company: 'Destination Wedding, Udaipur',
        rating: 5,
        message: 'Radhika and her team made my bridal mehndi an unforgettable experience! The portrait detailing of my husband and me was breathtaking. The color stayed dark and rich throughout all the wedding functions. 10/10 recommend!',
        avatar: {
          url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=250',
          publicId: null,
        },
        source: 'admin',
        status: 'approved',
        isActive: true,
        isFeatured: true,
        sortOrder: 1,
        createdBy: admin._id,
        approvedBy: admin._id,
        approvedAt: new Date(),
      },
      {
        name: 'Priyanka Verma',
        designation: 'Bride',
        company: 'Jaipur Palace Wedding',
        rating: 5,
        message: 'The organic Rajasthani henna had zero chemicals and smelled divine with eucalyptus oil. My stain was deep mahogany dark. Super professional artists and very gentle handling.',
        avatar: {
          url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250',
          publicId: null,
        },
        source: 'admin',
        status: 'approved',
        isActive: true,
        isFeatured: true,
        sortOrder: 2,
        createdBy: admin._id,
        approvedBy: admin._id,
        approvedAt: new Date(),
      },
      {
        name: 'Meera Patel',
        designation: 'Sister of the Bride',
        company: 'Sangeet Function',
        rating: 5,
        message: 'Booked their team for 25 family members during sangeet night. They were punctual, fast, and maintained flawless intricate design quality across everyone. All relatives loved their hands!',
        avatar: {
          url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=250',
          publicId: null,
        },
        source: 'user',
        user: normalUser._id,
        status: 'approved',
        isActive: true,
        isFeatured: false,
        sortOrder: 3,
        createdBy: normalUser._id,
        approvedBy: admin._id,
        approvedAt: new Date(),
      },
      {
        name: 'Sneha Kulkarni',
        designation: 'Client',
        company: 'Engagement Ceremony',
        rating: 4,
        message: 'Beautiful designs and very neat application. The aftercare clove steam kit was super helpful. Looking forward to booking again for my main wedding ceremony!',
        avatar: {
          url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
          publicId: null,
        },
        source: 'user',
        user: normalUser._id,
        status: 'pending', // Pending review for admin to approve
        isActive: true,
        isFeatured: false,
        sortOrder: 4,
        createdBy: normalUser._id,
      },
    ];

    const inserted = await Testimonial.insertMany(defaultTestimonials);

    console.log(`✅ Testimonials seeded successfully (${inserted.length} testimonials created).`);
    console.log('   - 3 Approved (Visible publicly in GET /api/testimonials)');
    console.log('   - 1 Pending (Ready for Admin review in GET /api/testimonials/admin/all?status=pending)');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during Testimonial Seeding:', error);
    await disconnectDB();
    process.exit(1);
  }
}

seedTestimonials();
