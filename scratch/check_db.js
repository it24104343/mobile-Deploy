const mongoose = require('mongoose');
require('dotenv').config();

const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  isActive: Boolean
});

const studentSchema = new mongoose.Schema({
  name: String,
  email: String
});

const classSchema = new mongoose.Schema({
  className: String,
  isActive: Boolean
});

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
const Student = mongoose.model('Student', studentSchema);
const Class = mongoose.model('Class', classSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const enrollments = await Enrollment.find({ isActive: true })
      .populate('student', 'name email')
      .populate('class', 'className isActive');
    
    console.log('Total Active Enrollments:', enrollments.length);
    enrollments.forEach(e => {
      console.log(`Student: ${e.student?.name} (${e.student?.email}) -> Class: ${e.class?.className} (Class Active: ${e.class?.isActive})`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
