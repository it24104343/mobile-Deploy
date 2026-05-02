const Teacher = require('../models/Teacher');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { sendWelcomeEmail } = require('../utils/emailService');
const { logAudit } = require('../utils/auditLogger');
const { format } = require('fast-csv');

/**
 * @desc    Get all teachers
 * @route   GET /api/teachers
 * @access  Public
 */
const getTeachers = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, includeInactive = false } = req.query;

    const filter = {};

    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'classes',
          localField: '_id',
          foreignField: 'teacher',
          as: 'assignedClasses'
        }
      },
      {
        $addFields: {
          assignedClassesCount: {
            $size: {
              $filter: {
                input: '$assignedClasses',
                as: 'cls',
                cond: { $eq: ['$$cls.isActive', true] }
              }
            }
          }
        }
      },
      { $project: { assignedClasses: 0 } },
      { $sort: { name: 1 } },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limitNum }]
        }
      }
    ];

    const result = await Teacher.aggregate(pipeline);
    const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
    const teachers = result[0].data;

    res.status(200).json({
      success: true,
      data: teachers,
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
 * @desc    Get single teacher
 * @route   GET /api/teachers/:id
 * @access  Public
 */
const getTeacherById = async (req, res, next) => {
  try {
    const teacher = await Teacher.findById(req.params.id).lean();

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Fetch assigned classes
    const assignedClasses = await mongoose.model('Class').find({ teacher: teacher._id, isActive: true })
      .select('className subject dayOfWeek startTime endTime')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        ...teacher,
        assignedClasses
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create teacher
 * @route   POST /api/teachers
 * @access  Public
 */
const createTeacher = async (req, res, next) => {
  try {
    const { name, email, phone, subjects, registrationFee, paymentOption } = req.body;

    // Check if email already exists in Teacher
    const existingTeacher = await Teacher.findOne({ email: email.toLowerCase() });
    if (existingTeacher) {
      if (!existingTeacher.isActive) {
        // Automatically cleanup a soft-deleted teacher so they can be re-registered freshly
        await Teacher.findByIdAndDelete(existingTeacher._id);
        await User.findOneAndDelete({ email: email.toLowerCase() });
      } else {
        return res.status(400).json({
          success: false,
          message: 'A teacher with this email already exists'
        });
      }
    }

    // Check if email already exists in User collection (in case of orphan or non-teacher)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (existingUser.role === 'TEACHER' || existingUser.profileModel === 'Teacher') {
        // This is an orphaned teacher User record (since the Teacher document is missing or was deleted above)
        await User.findByIdAndDelete(existingUser._id);
      } else {
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists'
        });
      }
    }

    // Determine payment status
    let registrationPaymentStatus = 'NOT_REQUIRED';
    const fee = parseFloat(registrationFee) || 0;
    if (fee > 0) {
      registrationPaymentStatus = (paymentOption === 'PAY_NOW') ? 'PENDING' : 'PENDING';
    }

    const teacher = await Teacher.create({
      name,
      email,
      phone,
      subjects: subjects || [],
      registrationFee: fee,
      paymentOption: fee > 0 ? (paymentOption || 'PAY_NOW') : 'PAY_NOW',
      registrationPaymentStatus
    });

    // Generate unique username and temp password
    const username = name.replace(/\s+/g, '').toLowerCase() + Math.floor(1000 + Math.random() * 9000);
    const tempPassword = crypto.randomBytes(4).toString('hex');

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password: tempPassword,
      role: 'TEACHER',
      profileId: teacher._id,
      profileModel: 'Teacher',
      isFirstLogin: true,
      pendingRegistrationPayment: (fee > 0 && paymentOption === 'PAY_LATER')
    });

    await logAudit(req, 'USER_CREATION', user._id, `Teacher user created: ${username}`);
    await sendWelcomeEmail(user.email, teacher.name, username, tempPassword);

    res.status(201).json({
      success: true,
      message: 'Teacher created successfully',
      data: teacher
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update teacher
 * @route   PUT /api/teachers/:id
 * @access  Public
 */
const updateTeacher = async (req, res, next) => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    const { name, email, phone, subjects } = req.body;

    // Check if new email already exists
    if (email && email !== teacher.email) {
      const existingTeacher = await Teacher.findOne({ email: email.toLowerCase() });
      if (existingTeacher) {
        return res.status(400).json({
          success: false,
          message: 'A teacher with this email already exists'
        });
      }
    }

    if (name) teacher.name = name;
    if (email) teacher.email = email;
    if (phone !== undefined) teacher.phone = phone;
    if (subjects) teacher.subjects = subjects;

    await teacher.save();

    res.status(200).json({
      success: true,
      message: 'Teacher updated successfully',
      data: teacher
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete teacher (soft delete)
 * @route   DELETE /api/teachers/:id
 * @access  Public
 */
const deleteTeacher = async (req, res, next) => {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    await Teacher.findByIdAndDelete(req.params.id);
    
    // Delete associated User account if exists
    await User.findOneAndDelete({ profileId: teacher._id, profileModel: 'Teacher' });

    res.status(200).json({
      success: true,
      message: 'Teacher deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm teacher registration payment (admin marks as paid)
 * @route   PUT /api/teachers/:id/confirm-payment
 * @access  Admin
 */
const confirmTeacherPayment = async (req, res, next) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    teacher.registrationPaymentStatus = 'COMPLETED';
    await teacher.save();

    // Also clear the pending flag on the user
    await User.findOneAndUpdate(
      { profileId: teacher._id, profileModel: 'Teacher' },
      { pendingRegistrationPayment: false }
    );

    res.status(200).json({
      success: true,
      message: 'Payment confirmed',
      data: teacher
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export teachers to CSV
 * @route   GET /api/teachers/export
 * @access  Private/Admin
 */
const exportTeachers = async (req, res, next) => {
  try {
    const { search, includeInactive = false } = req.query;
    const filter = {};

    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const teachers = await Teacher.find(filter).sort({ name: 1 }).lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=teachers_export.csv');

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    teachers.forEach(teacher => {
      csvStream.write({
        ID: teacher._id.toString(),
        Name: teacher.name,
        Email: teacher.email,
        Phone: teacher.phone || '-',
        Subjects: Array.isArray(teacher.subjects) ? teacher.subjects.join(', ') : '-',
        RegistrationFee: teacher.registrationFee || 0,
        PaymentOption: teacher.paymentOption || '-',
        PaymentStatus: teacher.registrationPaymentStatus || '-',
        Status: teacher.isActive ? 'Active' : 'Inactive',
        CreatedAt: teacher.createdAt ? teacher.createdAt.toISOString() : ''
      });
    });

    csvStream.end();
  } catch (err) {
    console.error('Error exporting teachers:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  confirmTeacherPayment,
  exportTeachers
};
