const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const Class = require('../models/Class');
const Student = require('../models/Student');
const InstituteSettings = require('../models/InstituteSettings');

/**
 * @desc    Get all enrollments with filters
 * @route   GET /api/enrollments
 * @access  Private
 */
const getEnrollments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, student, classId, isActive, teacher } = req.query;

    const filter = {};
    if (student) filter.student = student;
    if (classId) filter.class = classId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    // If teacher filter is provided, get all classes for that teacher first
    if (teacher) {
      const teacherClasses = await Class.find({ teacher }).select('_id');
      const classIds = teacherClasses.map(c => c._id);
      
      if (filter.class) {
        // If a specific classId was already requested, ensure it belongs to the teacher
        const classBelongsToTeacher = classIds.some(id => id.toString() === filter.class.toString());
        if (!classBelongsToTeacher) {
          return res.status(200).json({
            success: true,
            data: [],
            pagination: { 
              currentPage: parseInt(page, 10), 
              totalPages: 0, 
              totalItems: 0, 
              itemsPerPage: parseInt(limit, 10) 
            }
          });
        }
      } else {
        filter.class = { $in: classIds };
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [enrollments, total] = await Promise.all([
      Enrollment.find(filter)
        .populate('student', 'name email grade')
        .populate('class', 'className subject grade monthlyFee classType mode')
        .populate('enrolledBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Enrollment.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: enrollments,
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
 * @desc    Get enrollments for a specific student
 * @route   GET /api/enrollments/student/:studentId
 * @access  Private
 */
const getStudentEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ student: req.params.studentId, isActive: true })
      .populate('class', 'className subject grade monthlyFee classType mode dayOfWeek startTime endTime hall')
      .populate({
        path: 'class',
        populate: { path: 'hall', select: 'name code' }
      })
      .sort({ createdAt: -1 })
      .lean();

    // Determine payment status for current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const enriched = await Promise.all(
      enrollments.map(async (enrollment) => {
        let lookupMonth = currentMonth;
        let lookupYear = currentYear;

        if (enrollment.class?.targetMonth) {
          lookupMonth = new Date(`${enrollment.class.targetMonth} 1, 2000`).getMonth() + 1;
        }
        if (enrollment.class?.targetYear) {
          lookupYear = parseInt(enrollment.class.targetYear, 10);
        }

        const payment = await Payment.findOne({
          enrollment: enrollment._id,
          month: lookupMonth,
          year: lookupYear
        }).lean();

        // Week-1 free check: enrolled within last 7 days
        const enrolledAt = new Date(enrollment.enrolledAt);
        const daysSinceEnrollment = Math.floor((now - enrolledAt) / (1000 * 60 * 60 * 24));
        const inFreePeriod = daysSinceEnrollment <= 7;

        return {
          ...enrollment,
          currentMonthPayment: payment || null,
          inFreePeriod
        };
      })
    );

    res.status(200).json({
      success: true,
      data: enriched
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get enrollments for a specific class
 * @route   GET /api/enrollments/class/:classId
 * @access  Private
 */
const getClassEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ class: req.params.classId, isActive: true })
      .populate('student', 'name email grade phone')
      .sort({ enrolledAt: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: enrollments,
      totalEnrolled: enrollments.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Enroll a student in a class
 * @route   POST /api/enrollments
 * @access  Private (Admin, Teacher)
 */
const createEnrollment = async (req, res, next) => {
  try {
    const { studentId, classId, payAdmissionFee = false, notes } = req.body;

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Verify class exists and is active
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!classDoc.isActive) {
      return res.status(400).json({ success: false, message: 'Class is not active' });
    }

    // Check if already enrolled
    const existing = await Enrollment.findOne({ student: studentId, class: classId });
    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ success: false, message: 'Student is already enrolled in this class' });
      }
      // Re-activate existing enrollment
      existing.isActive = true;
      // Only reset enrolledAt if they were inactive for more than 30 days 
      // otherwise keep the old date to prevent grace period exploit
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (!existing.enrolledAt || existing.enrolledAt < thirtyDaysAgo) {
        existing.enrolledAt = new Date();
      }
      
      existing.enrolledBy = req.user?._id || null;
      existing.notes = notes || existing.notes;
      await existing.save();

      // Also add student to class.students array if not already there
      if (!classDoc.students.includes(studentId)) {
        classDoc.students.push(studentId);
        await classDoc.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Student re-enrolled successfully',
        data: existing
      });
    }

    // Check capacity
    const currentEnrolled = await Enrollment.countDocuments({ class: classId, isActive: true });
    if (currentEnrolled >= classDoc.capacity) {
      return res.status(400).json({
        success: false,
        message: `Class is at full capacity (${classDoc.capacity})`
      });
    }

    // Get admission fee from settings
    let admissionFeeAmount = 0;
    if (payAdmissionFee) {
      const settings = await InstituteSettings.findOne();
      admissionFeeAmount = settings?.admissionFee || 0;
    }

    const enrollment = await Enrollment.create({
      student: studentId,
      class: classId,
      admissionFeePaid: payAdmissionFee || admissionFeeAmount <= 0,
      admissionFeeAmount,
      enrolledBy: req.user?._id || null,
      notes: notes || ''
    });

    // Add student to class.students array
    if (!classDoc.students.includes(studentId)) {
      classDoc.students.push(studentId);
      await classDoc.save();
    }

    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'name email grade')
      .populate('class', 'className subject grade monthlyFee');

    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this class'
      });
    }
    next(error);
  }
};

/**
 * @desc    Unenroll a student from a class
 * @route   PUT /api/enrollments/:id/unenroll
 * @access  Private (Admin)
 */
const unenrollStudent = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    enrollment.isActive = false;
    await enrollment.save();

    // Remove student from class.students array
    const classDoc = await Class.findById(enrollment.class);
    if (classDoc) {
      classDoc.students = classDoc.students.filter(
        (s) => s.toString() !== enrollment.student.toString()
      );
      await classDoc.save();
    }

    res.status(200).json({
      success: true,
      message: 'Student unenrolled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update enrollment details (e.g. activation status)
 * @route   PUT /api/enrollments/:id
 * @access  Private (Admin)
 */
const updateEnrollment = async (req, res, next) => {
  try {
    const { isActive, admissionFeePaid, notes } = req.body;
    const enrollment = await Enrollment.findById(req.params.id);
    
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    if (isActive !== undefined) {
      enrollment.isActive = isActive;
      // Sync with class students array
      const classDoc = await Class.findById(enrollment.class);
      if (classDoc) {
        if (isActive && !classDoc.students.includes(enrollment.student)) {
          classDoc.students.push(enrollment.student);
          await classDoc.save();
        } else if (!isActive) {
          classDoc.students = classDoc.students.filter(s => s.toString() !== enrollment.student.toString());
          await classDoc.save();
        }
      }
    }
    
    if (admissionFeePaid !== undefined) enrollment.admissionFeePaid = admissionFeePaid;
    if (notes !== undefined) enrollment.notes = notes;

    await enrollment.save();

    res.status(200).json({
      success: true,
      message: 'Enrollment updated successfully',
      data: enrollment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Bulk enroll students into a class
 * @route   POST /api/enrollments/bulk
 * @access  Private (Admin)
 */
const bulkEnroll = async (req, res, next) => {
  try {
    const { studentIds, classId, payAdmissionFee = false } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Student IDs array is required' });
    }

    const classDoc = await Class.findById(classId);
    if (!classDoc || !classDoc.isActive) {
      return res.status(400).json({ success: false, message: 'Class not found or inactive' });
    }

    const currentEnrolled = await Enrollment.countDocuments({ class: classId, isActive: true });
    if (currentEnrolled + studentIds.length > classDoc.capacity) {
      return res.status(400).json({
        success: false,
        message: `Not enough capacity. Available: ${classDoc.capacity - currentEnrolled}, Requested: ${studentIds.length}`
      });
    }

    let admissionFeeAmount = 0;
    if (payAdmissionFee) {
      const settings = await InstituteSettings.findOne();
      admissionFeeAmount = settings?.admissionFee || 0;
    }

    const results = { enrolled: 0, skipped: 0, errors: [] };

    for (const studentId of studentIds) {
      try {
        const existing = await Enrollment.findOne({ student: studentId, class: classId, isActive: true });
        if (existing) {
          results.skipped++;
          continue;
        }

        await Enrollment.create({
          student: studentId,
          class: classId,
          admissionFeePaid: payAdmissionFee || admissionFeeAmount <= 0,
          admissionFeeAmount,
          enrolledBy: req.user?._id || null
        });

        if (!classDoc.students.includes(studentId)) {
          classDoc.students.push(studentId);
        }

        results.enrolled++;
      } catch (err) {
        results.errors.push({ studentId, error: err.message });
      }
    }

    await classDoc.save();

    res.status(200).json({
      success: true,
      message: `${results.enrolled} student(s) enrolled, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Student self-enroll in a class
 * @route   POST /api/enrollments/self-enroll
 * @access  Private (Student)
 */
const studentSelfEnroll = async (req, res, next) => {
  try {
    const { classId } = req.body;

    // Find student profile by email
    const student = await Student.findOne({ email: req.user.email });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    // Verify class exists and is active
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!classDoc.isActive) {
      return res.status(400).json({ success: false, message: 'Class is not active' });
    }

    // Check if manual enrollment is allowed
    if (!classDoc.allowManualEnrollment) {
      return res.status(403).json({ success: false, message: 'Manual enrollment is disabled for this class. Please contact the teacher or admin.' });
    }

    // Check if already enrolled
    const existing = await Enrollment.findOne({ student: student._id, class: classId });
    if (existing) {
      if (existing.isActive) {
        return res.status(400).json({ success: false, message: 'You are already enrolled in this class' });
      }
      // Re-activate existing enrollment
      existing.isActive = true;
      existing.enrolledAt = new Date();
      existing.enrolledBy = req.user._id;
      await existing.save();

      if (!classDoc.students.includes(student._id)) {
        classDoc.students.push(student._id);
        await classDoc.save();
      }

      return res.status(200).json({ success: true, message: 'Re-enrolled successfully', data: existing });
    }

    // Check capacity
    const currentEnrolled = await Enrollment.countDocuments({ class: classId, isActive: true });
    if (currentEnrolled >= classDoc.capacity) {
      return res.status(400).json({ success: false, message: `Class is at full capacity (${classDoc.capacity})` });
    }

    const enrollment = await Enrollment.create({
      student: student._id,
      class: classId,
      enrolledBy: req.user._id,
      notes: 'Self-enrolled by student'
    });

    if (!classDoc.students.includes(student._id)) {
      classDoc.students.push(student._id);
      await classDoc.save();
    }

    const populated = await Enrollment.findById(enrollment._id)
      .populate('student', 'name email grade')
      .populate('class', 'className subject grade monthlyFee');

    res.status(201).json({
      success: true,
      message: 'Enrolled successfully',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You are already enrolled in this class' });
    }
    next(error);
  }
};

module.exports = {
  getEnrollments,
  getStudentEnrollments,
  getClassEnrollments,
  createEnrollment,
  unenrollStudent,
  updateEnrollment,
  bulkEnroll,
  studentSelfEnroll
};
