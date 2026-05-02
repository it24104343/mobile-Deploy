const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

dotenv.config();

const cleanOrphans = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected...');

    // Find all users with profileModel: 'Teacher'
    const teacherUsers = await User.find({ profileModel: 'Teacher' });
    let deletedCount = 0;

    for (let u of teacherUsers) {
      if (u.profileId) {
        const t = await Teacher.findById(u.profileId);
        if (!t) {
          console.log(`Orphaned teacher user found: ${u.email} - Deleting...`);
          await User.findByIdAndDelete(u._id);
          deletedCount++;
        }
      } else {
        console.log(`Teacher user with no profileId: ${u.email} - Deleting...`);
        await User.findByIdAndDelete(u._id);
        deletedCount++;
      }
    }

    // Also just directly delete the specific test@gmail.com user if it's there, as requested
    const testUser = await User.findOne({ email: 'test@gmail.com' });
    if (testUser) {
      console.log(`Found test@gmail.com user, role: ${testUser.role}, profileModel: ${testUser.profileModel}. Deleting...`);
      await User.findByIdAndDelete(testUser._id);
      deletedCount++;
    }

    console.log(`Deleted ${deletedCount} orphaned user accounts.`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

cleanOrphans();
