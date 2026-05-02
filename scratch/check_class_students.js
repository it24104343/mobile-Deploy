const mongoose = require('mongoose');
require('dotenv').config();

const classSchema = new mongoose.Schema({
  className: String,
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
});

const Class = mongoose.model('Class', classSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const classes = await Class.find().populate('students', 'name email');
    
    classes.forEach(c => {
      console.log(`Class: ${c.className}`);
      console.log(`Students in array: ${c.students.length}`);
      c.students.forEach(s => {
        console.log(`  - ${s.name} (${s.email})`);
      });
      console.log('---');
    });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
