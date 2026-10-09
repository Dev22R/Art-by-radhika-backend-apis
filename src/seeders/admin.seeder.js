const { connectDB, disconnectDB } = require('../config/db');
const User = require('../modules/user/user.model');

async function seedAdmin() {
  try {
    console.log('🔄 Connecting to Database...');
    await connectDB();

    const adminEmail = 'admin@artbyradhika.com';
    const adminPassword = 'ABR@123456';
    const adminPhone = '9999999999';

    // 1. Check if an admin with this email or phone already exists
    let admin = await User.findOne({
      $or: [{ email: adminEmail.toLowerCase() }, { phone: adminPhone }],
    });

    if (admin) {
      console.log(`ℹ️ Existing Admin record found (_id: ${admin._id}). Updating credentials...`);
      admin.email = adminEmail.toLowerCase();
      admin.phone = adminPhone;
      admin.name = 'Art By Radhika Admin';
      admin.password = adminPassword; // Will be hashed by pre-save hook
      admin.role = 'admin';
      admin.isPhoneVerified = true;
      admin.isProfileCompleted = true;
      admin.isActive = true;

      await admin.save();
      console.log('✅ Admin credentials and role updated successfully!');
    } else {
      console.log('✨ Creating new Admin account...');
      admin = new User({
        name: 'Art By Radhika Admin',
        email: adminEmail.toLowerCase(),
        phone: adminPhone,
        password: adminPassword,
        role: 'admin',
        isPhoneVerified: true,
        isProfileCompleted: true,
        isActive: true,
      });

      await admin.save();
      console.log('✅ Admin account created successfully!');
    }

    console.log('\n=========================================');
    console.log('👑 ADMIN CREDENTIALS STORED IN DB:');
    console.log(`   Email:    ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Phone:    ${adminPhone}`);
    console.log(`   Role:     ${admin.role}`);
    console.log(`   Admin ID: ${admin._id}`);
    console.log('=========================================\n');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('❌ Admin seeding failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedAdmin();
}

module.exports = seedAdmin;
