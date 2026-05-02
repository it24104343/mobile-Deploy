const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Class, Teacher, Student, Hall } = require('../models');

dotenv.config();

const halls = [
  { name: 'Main Hall A', code: 'HALL-A', capacity: 50, notes: 'Large lecture hall with projector', resources: 'Projector, Whiteboard, AC' },
  { name: 'Room B1', code: 'ROOM-B1', capacity: 25, notes: 'Standard classroom', resources: 'Whiteboard, AC' },
  { name: 'Room B2', code: 'ROOM-B2', capacity: 25, notes: 'Standard classroom', resources: 'Whiteboard, AC' },
  { name: 'Room C3', code: 'ROOM-C3', capacity: 20, notes: 'Seminar room', resources: 'Whiteboard, Projector' },
  { name: 'Computer Lab', code: 'COMP-LAB', capacity: 20, notes: 'Computer laboratory', resources: '20 PCs, Projector, AC' },
  { name: 'Science Lab', code: 'SCI-LAB', capacity: 18, notes: 'Science laboratory', resources: 'Lab equipment, Whiteboard' },
  { name: 'Room D4', code: 'ROOM-D4', capacity: 30, notes: 'Medium classroom', resources: 'Whiteboard, AC' }
];

const teachers = [
  { name: 'John Smith', email: 'john.smith@tuition.com', phone: '+94771234567', subjects: ['Mathematics', 'Physics'] },
  { name: 'Sarah Johnson', email: 'sarah.johnson@tuition.com', phone: '+94772345678', subjects: ['English', 'Literature'] },
  { name: 'Michael Brown', email: 'michael.brown@tuition.com', phone: '+94773456789', subjects: ['Chemistry', 'Biology'] },
  { name: 'Emily Davis', email: 'emily.davis@tuition.com', phone: '+94774567890', subjects: ['Computer Science', 'Mathematics'] },
  { name: 'David Wilson', email: 'david.wilson@tuition.com', phone: '+94775678901', subjects: ['History', 'Geography'] }
];

const students = [
  { name: 'Alice Anderson', email: 'alice@student.com', grade: '10', phone: '+94711111111', parentName: 'Mr. Anderson', parentPhone: '+94712222222' },
  { name: 'Bob Baker', email: 'bob@student.com', grade: '10', phone: '+94713333333', parentName: 'Mrs. Baker', parentPhone: '+94714444444' },
  { name: 'Carol Chen', email: 'carol@student.com', grade: '11', phone: '+94715555555', parentName: 'Mr. Chen', parentPhone: '+94716666666' },
  { name: 'Daniel Dias', email: 'daniel@student.com', grade: '11', phone: '+94717777777', parentName: 'Mrs. Dias', parentPhone: '+94718888888' },
  { name: 'Eva Evans', email: 'eva@student.com', grade: '9', phone: '+94719999999', parentName: 'Mr. Evans', parentPhone: '+94710000000' },
  { name: 'Frank Fernando', email: 'frank@student.com', grade: '9', phone: '+94721111111', parentName: 'Mrs. Fernando', parentPhone: '+94722222222' },
  { name: 'Grace Garcia', email: 'grace@student.com', grade: '12', phone: '+94723333333', parentName: 'Mr. Garcia', parentPhone: '+94724444444' },
  { name: 'Henry Harris', email: 'henry@student.com', grade: '12', phone: '+94725555555', parentName: 'Mrs. Harris', parentPhone: '+94726666666' },
  { name: 'Iris Ibrahim', email: 'iris@student.com', grade: '10', phone: '+94727777777', parentName: 'Mr. Ibrahim', parentPhone: '+94728888888' },
  { name: 'Jack Jackson', email: 'jack@student.com', grade: '11', phone: '+94729999999', parentName: 'Mrs. Jackson', parentPhone: '+94720000000' },
  { name: 'Kate Kumar', email: 'kate@student.com', grade: '9', phone: '+94731111111', parentName: 'Mr. Kumar', parentPhone: '+94732222222' },
  { name: 'Liam Lee', email: 'liam@student.com', grade: '12', phone: '+94733333333', parentName: 'Mrs. Lee', parentPhone: '+94734444444' },
  { name: 'Mia Miller', email: 'mia@student.com', grade: '10', phone: '+94735555555', parentName: 'Mr. Miller', parentPhone: '+94736666666' },
  { name: 'Noah Noor', email: 'noah@student.com', grade: '11', phone: '+94737777777', parentName: 'Mrs. Noor', parentPhone: '+94738888888' },
  { name: 'Olivia Perera', email: 'olivia@student.com', grade: '12', phone: '+94739999999', parentName: 'Mr. Perera', parentPhone: '+94730000000' }
];

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');

    // Clear existing data
    await Promise.all([
      Class.deleteMany({}),
      Teacher.deleteMany({}),
      Student.deleteMany({}),
      Hall.deleteMany({})
    ]);
    console.log('Existing data cleared');

    // Insert halls
    const createdHalls = await Hall.insertMany(halls);
    console.log(`${createdHalls.length} halls created`);

    // Insert teachers
    const createdTeachers = await Teacher.insertMany(teachers);
    console.log(`${createdTeachers.length} teachers created`);

    // Insert students
    const createdStudents = await Student.insertMany(students);
    console.log(`${createdStudents.length} students created`);

    // Helper to get hall by code
    const getHall = (code) => createdHalls.find(h => h.code === code)?._id;

    // Create classes with new fields
    const classes = [
      {
        className: 'Advanced Mathematics',
        grade: '12',
        subject: 'Mathematics',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 3000,
        teacher: createdTeachers[0]._id,
        students: [createdStudents[6]._id, createdStudents[7]._id, createdStudents[11]._id, createdStudents[14]._id],
        capacity: 20,
        startTime: '08:00',
        endTime: '10:00',
        dayOfWeek: 'Monday',
        hall: getHall('HALL-A')
      },
      {
        className: 'Physics Fundamentals',
        grade: '11',
        subject: 'Physics',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2500,
        teacher: createdTeachers[0]._id,
        students: [createdStudents[2]._id, createdStudents[3]._id, createdStudents[9]._id, createdStudents[13]._id],
        capacity: 25,
        startTime: '10:30',
        endTime: '12:30',
        dayOfWeek: 'Monday',
        hall: getHall('ROOM-B2')
      },
      {
        className: 'English Literature',
        grade: '10',
        subject: 'English',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2000,
        teacher: createdTeachers[1]._id,
        students: [createdStudents[0]._id, createdStudents[1]._id, createdStudents[8]._id, createdStudents[12]._id],
        capacity: 15,
        startTime: '08:00',
        endTime: '10:00',
        dayOfWeek: 'Tuesday',
        hall: getHall('ROOM-C3')
      },
      {
        className: 'Creative Writing - Paper',
        grade: '11',
        subject: 'Literature',
        classType: 'PAPER',
        mode: 'PHYSICAL',
        monthlyFee: 1500,
        teacher: createdTeachers[1]._id,
        students: [createdStudents[2]._id, createdStudents[9]._id, createdStudents[13]._id],
        capacity: 12,
        startTime: '14:00',
        endTime: '16:00',
        dayOfWeek: 'Wednesday',
        hall: getHall('ROOM-C3')
      },
      {
        className: 'Chemistry Lab',
        grade: '12',
        subject: 'Chemistry',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 3500,
        teacher: createdTeachers[2]._id,
        students: [createdStudents[6]._id, createdStudents[7]._id, createdStudents[11]._id, createdStudents[14]._id],
        capacity: 18,
        startTime: '09:00',
        endTime: '11:00',
        dayOfWeek: 'Tuesday',
        hall: getHall('SCI-LAB')
      },
      {
        className: 'Biology Basics',
        grade: '9',
        subject: 'Biology',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2000,
        teacher: createdTeachers[2]._id,
        students: [createdStudents[4]._id, createdStudents[5]._id, createdStudents[10]._id],
        capacity: 20,
        startTime: '13:00',
        endTime: '15:00',
        dayOfWeek: 'Thursday',
        hall: getHall('SCI-LAB')
      },
      {
        className: 'Computer Programming',
        grade: '10',
        subject: 'Computer Science',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2500,
        teacher: createdTeachers[3]._id,
        students: [createdStudents[0]._id, createdStudents[1]._id, createdStudents[8]._id, createdStudents[12]._id],
        capacity: 20,
        startTime: '10:00',
        endTime: '12:00',
        dayOfWeek: 'Wednesday',
        hall: getHall('COMP-LAB')
      },
      {
        className: 'Data Structures - Revision',
        grade: '12',
        subject: 'Computer Science',
        classType: 'REVISION',
        mode: 'ONLINE',
        monthlyFee: 1000,
        teacher: createdTeachers[3]._id,
        students: [createdStudents[6]._id, createdStudents[7]._id, createdStudents[11]._id],
        capacity: 15,
        startTime: '08:00',
        endTime: '10:00',
        dayOfWeek: 'Friday',
        onlineMeetingLink: 'https://zoom.us/j/example-data-structures',
        onlineMeetingDetails: 'Meeting ID: 123-456-789, Passcode: ds2024'
      },
      {
        className: 'World History',
        grade: '11',
        subject: 'History',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2000,
        teacher: createdTeachers[4]._id,
        students: [createdStudents[2]._id, createdStudents[3]._id, createdStudents[9]._id, createdStudents[13]._id],
        capacity: 25,
        startTime: '14:00',
        endTime: '16:00',
        dayOfWeek: 'Thursday',
        hall: getHall('ROOM-D4')
      },
      {
        className: 'Geography Studies',
        grade: '9',
        subject: 'Geography',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2000,
        teacher: createdTeachers[4]._id,
        students: [createdStudents[4]._id, createdStudents[5]._id, createdStudents[10]._id],
        capacity: 22,
        startTime: '10:00',
        endTime: '12:00',
        dayOfWeek: 'Friday',
        hall: getHall('ROOM-D4')
      },
      {
        className: 'Mathematics Foundation',
        grade: '9',
        subject: 'Mathematics',
        classType: 'THEORY',
        mode: 'PHYSICAL',
        monthlyFee: 2500,
        teacher: createdTeachers[0]._id,
        students: [createdStudents[4]._id, createdStudents[5]._id, createdStudents[10]._id],
        capacity: 25,
        startTime: '08:00',
        endTime: '10:00',
        dayOfWeek: 'Saturday',
        hall: getHall('HALL-A')
      },
      {
        className: 'Math Paper Practice',
        grade: '12',
        subject: 'Mathematics',
        classType: 'PAPER',
        mode: 'ONLINE',
        monthlyFee: 1500,
        teacher: createdTeachers[0]._id,
        students: [createdStudents[6]._id, createdStudents[7]._id, createdStudents[11]._id, createdStudents[14]._id],
        capacity: 20,
        startTime: '14:00',
        endTime: '16:00',
        dayOfWeek: 'Saturday',
        onlineMeetingLink: 'https://teams.microsoft.com/l/meetup-join/example',
        onlineMeetingDetails: 'MS Teams link - accessible via student portal'
      }
    ];

    const createdClasses = await Class.insertMany(classes);
    console.log(`${createdClasses.length} classes created`);

    console.log('\n✅ Database seeded successfully!');
    console.log('\nSummary:');
    console.log(`  - Halls: ${createdHalls.length}`);
    console.log(`  - Teachers: ${createdTeachers.length}`);
    console.log(`  - Students: ${createdStudents.length}`);
    console.log(`  - Classes: ${createdClasses.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedData();
