const Student = require('../models/Student');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { sendWelcomeEmail } = require('../utils/emailService');
const { logAudit } = require('../utils/auditLogger');
const { format } = require('fast-csv');

/**
 * @desc    Get all students
 * @route   GET /api/students
 * @access  Public
 */
const getStudents = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, grade, classId, includeInactive = false } = req.query;

    const pipeline = [];
    const match = {};

    if (!includeInactive || includeInactive === 'false') {
      match.isActive = true;
    }

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (grade) {
      match.grade = grade;
    }

    pipeline.push({ $match: match });

    // Lookup enrollments
    pipeline.push({
      $lookup: {
        from: 'enrollments',
        localField: '_id',
        foreignField: 'student',
        as: 'enrollments'
      }
    });

    // Filter active enrollments
    pipeline.push({
      $addFields: {
        enrollments: {
          $filter: {
            input: '$enrollments',
            as: 'enrollment',
            cond: { $eq: ['$$enrollment.isActive', true] }
          }
        }
      }
    });

    // If classId is provided, filter students who have an active enrollment in that class
    if (classId) {
      pipeline.push({
        $match: {
          'enrollments.class': new mongoose.Types.ObjectId(classId)
        }
      });
    }

    // Lookup class details for the active enrollments
    pipeline.push({
      $lookup: {
        from: 'classes',
        localField: 'enrollments.class',
        foreignField: '_id',
        as: 'enrolledClasses'
      }
    });

    // Sort by name
    pipeline.push({ $sort: { name: 1 } });

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Apply pagination using $facet
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limitNum }]
      }
    });

    const result = await Student.aggregate(pipeline);
    const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
    const students = result[0].data;

    res.status(200).json({
      success: true,
      data: students,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single student
 * @route   GET /api/students/:id
 * @access  Public
 */
const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Fetch active enrollments with class details
    const [enrollments, attendanceStats] = await Promise.all([
      mongoose.model('Enrollment').find({ student: student._id, isActive: true })
        .populate('class', 'className subject grade monthlyFee dayOfWeek startTime endTime hall')
        .lean(),
      mongoose.model('Attendance').aggregate([
        { $match: { student: student._id } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } } } }
      ])
    ]);

    const attendancePercentage = attendanceStats[0] && attendanceStats[0].total > 0
      ? Math.round((attendanceStats[0].present / attendanceStats[0].total) * 100)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        ...student,
        enrolledClasses: enrollments.map(e => e.class).filter(Boolean),
        attendancePercentage
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create student
 * @route   POST /api/students
 * @access  Public
 */
const createStudent = async (req, res, next) => {
  try {
    const { name, email, phone, grade, parentName, parentPhone, isRegistrationFeePaid = false } = req.body;

    // Check if email already exists in Student
    const existingStudent = await Student.findOne({ email: email.toLowerCase() });
    if (existingStudent) {
      if (!existingStudent.isActive) {
        // Automatically cleanup a soft-deleted student so they can be re-registered freshly
        await Student.findByIdAndDelete(existingStudent._id);
        await User.findOneAndDelete({ email: email.toLowerCase() });
      } else {
        return res.status(400).json({
          success: false,
          message: 'A student with this email already exists'
        });
      }
    }

    // Check if email already exists in User collection (in case of orphan or non-student)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.role === 'STUDENT' || existingUser.profileModel === 'Student') {
        // This is an orphaned student User record
        await User.findByIdAndDelete(existingUser._id);
      } else {
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists'
        });
      }
    }

    const student = await Student.create({
      name,
      email,
      phone,
      grade,
      parentName,
      parentPhone,
      isRegistrationFeePaid
    });

    // Generate unique username and temp password
    const username = name.replace(/\s+/g, '').toLowerCase() + Math.floor(1000 + Math.random() * 9000);
    const tempPassword = crypto.randomBytes(4).toString('hex');

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password: tempPassword,
      role: 'STUDENT',
      profileId: student._id,
      profileModel: 'Student',
      isFirstLogin: true
    });

    // Logging without req object because it might not be strictly an auth request
    await logAudit(req, 'USER_CREATION', user._id, `Student user created: ${username}`);
    await sendWelcomeEmail(user.email, student.name, username, tempPassword);

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: student
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update student
 * @route   PUT /api/students/:id
 * @access  Public
 */
const updateStudent = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const { name, email, phone, grade, parentName, parentPhone } = req.body;

    // Check if new email already exists
    if (email && email !== student.email) {
      const existingStudent = await Student.findOne({ email: email.toLowerCase() });
      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: 'A student with this email already exists'
        });
      }
    }

    if (name) student.name = name;
    if (email) student.email = email;
    if (phone !== undefined) student.phone = phone;
    if (grade !== undefined) student.grade = grade;
    if (parentName !== undefined) student.parentName = parentName;
    if (parentPhone !== undefined) student.parentPhone = parentPhone;

    await student.save();

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: student
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete student
 * @route   DELETE /api/students/:id
 * @access  Public
 */
const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Hard delete the student
    await Student.findByIdAndDelete(req.params.id);
    
    // Delete associated User account if it exists
    await User.findOneAndDelete({ profileId: student._id, profileModel: 'Student' });

    res.status(200).json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get unique grades for filters
 * @route   GET /api/students/grades
 * @access  Public
 */
const getGrades = async (req, res, next) => {
  try {
    const grades = await Student.distinct('grade', { isActive: true });

    res.status(200).json({
      success: true,
      data: grades.filter(Boolean).sort()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark student registration fee as paid
 * @route   PUT /api/students/:id/pay-registration
 * @access  Private (Admin)
 */
const payRegistrationFee = async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    student.isRegistrationFeePaid = true;
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Registration fee marked as paid',
      data: student
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export students to CSV
 * @route   GET /api/students/export
 * @access  Private/Admin
 */
const exportStudents = async (req, res, next) => {
  try {
    const { search, grade, classId, includeInactive = false } = req.query;

    const pipeline = [];
    const match = {};

    if (!includeInactive || includeInactive === 'false') {
      match.isActive = true;
    }

    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (grade) {
      match.grade = grade;
    }

    pipeline.push({ $match: match });

    // Lookup enrollments just to fetch data, but we might not need all logic from getStudents if we only want basic student data
    // Let's include class data
    pipeline.push({
      $lookup: {
        from: 'enrollments',
        localField: '_id',
        foreignField: 'student',
        as: 'enrollments'
      }
    });

    pipeline.push({
      $addFields: {
        enrollments: {
          $filter: {
            input: '$enrollments',
            as: 'enrollment',
            cond: { $eq: ['$$enrollment.isActive', true] }
          }
        }
      }
    });

    if (classId) {
      pipeline.push({
        $match: {
          'enrollments.class': new mongoose.Types.ObjectId(classId)
        }
      });
    }

    pipeline.push({ $sort: { name: 1 } });

    const students = await Student.aggregate(pipeline);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=students_export.csv');

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    students.forEach(student => {
      csvStream.write({
        ID: student._id.toString(),
        Name: student.name,
        Email: student.email,
        Phone: student.phone || '-',
        Grade: student.grade || '-',
        ParentName: student.parentName || '-',
        ParentPhone: student.parentPhone || '-',
        Status: student.isActive ? 'Active' : 'Inactive',
        CreatedAt: student.createdAt ? student.createdAt.toISOString() : ''
      });
    });

    csvStream.end();

  } catch (err) {
    console.error('Error exporting students:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getGrades,
  payRegistrationFee,
  exportStudents
};
