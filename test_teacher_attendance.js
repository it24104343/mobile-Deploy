const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

const Teacher = require('./models/Teacher');
const Class = require('./models/Class');
const Session = require('./models/Session');
const TeacherAttendance = require('./models/TeacherAttendance');
const User = require('./models/User');

const runTest = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a teacher
    const teacher = await Teacher.findOne();
    if (!teacher) {
      console.log('No teacher found. Please seed some data first.');
      process.exit(1);
    }

    // Find a class assigned to this teacher
    let classDoc = await Class.findOne({ teacher: teacher._id });
    if (!classDoc) {
      console.log('No class found for this teacher. Creating/Assigning one...');
      classDoc = await Class.findOne();
      if (!classDoc) {
        console.log('No class found.');
        process.exit(1);
      }
      classDoc.teacher = teacher._id;
      await classDoc.save();
    }

    // Create a session
    const session = await Session.create({
      class: classDoc._id,
      date: new Date(),
      startTime: '10:00',
      endTime: '12:00',
      topic: 'Test Teacher Attendance'
    });
    console.log('Created test session:', session._id);

    // Mock User
    const admin = await User.findOne({ role: 'ADMIN' });

    // Mark attendance
    const attendance = await TeacherAttendance.create({
      teacher: teacher._id,
      class: classDoc._id,
      session: session._id,
      date: session.date,
      status: 'PRESENT',
      markedBy: admin ? admin._id : null
    });
    console.log('Marked teacher attendance:', attendance.status);

    // Verify
    const found = await TeacherAttendance.findOne({ session: session._id });
    console.log('Verification Success:', found.status === 'PRESENT');

    // Cleanup
    await TeacherAttendance.deleteOne({ _id: attendance._id });
    await Session.deleteOne({ _id: session._id });
    console.log('Cleanup done');

    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
};

runTest();
