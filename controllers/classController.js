const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Hall = require('../models/Hall');
const Session = require('../models/Session');

/**
 * @desc    Get all classes with pagination and filters
 * @route   GET /api/classes
 * @access  Public
 */
const getClasses = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      grade,
      subject,
      teacher,
      dayOfWeek,
      classType,
      mode,
      targetMonth,
      targetYear,
      includeInactive = false,
      isExtraClass
    } = req.query;

    // Build filter object
    const filter = {};

    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    if (grade) filter.grade = grade;
    if (subject) filter.subject = { $regex: subject, $options: 'i' };
    if (teacher) filter.teacher = teacher;
    if (dayOfWeek) filter.dayOfWeek = dayOfWeek;
    if (classType) filter.classType = classType;
    if (mode) filter.mode = mode;
    if (targetMonth) filter.targetMonth = targetMonth;
    if (targetYear) filter.targetYear = parseInt(targetYear, 10);
    if (isExtraClass !== undefined) filter.isExtraClass = isExtraClass === 'true';

    // Filter by student enrollment if student ID is provided
    if (req.query.student) {
      filter.students = req.query.student;
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const [classes, total] = await Promise.all([
      Class.find(filter)
        .populate('teacher', 'name email')
        .populate('students', 'name email grade')
        .populate('hall', 'name code capacity')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Class.countDocuments(filter)
    ]);

    // Add computed fields
    const classesWithCounts = classes.map((cls) => ({
      ...cls,
      enrolledCount: cls.students ? cls.students.length : 0,
      remainingSeats: cls.capacity - (cls.students ? cls.students.length : 0)
    }));

    res.status(200).json({
      success: true,
      data: classesWithCounts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single class by ID
 * @route   GET /api/classes/:id
 * @access  Public
 */
const getClassById = async (req, res, next) => {
  try {
    const classDoc = await Class.findById(req.params.id)
      .populate('teacher', 'name email phone subjects')
      .populate('students', 'name email grade phone')
      .populate('hall', 'name code capacity notes resources');

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    const [sessionStats] = await Promise.all([
      Session.aggregate([
        { $match: { class: classDoc._id } },
        { 
          $group: { 
            _id: null, 
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
            upcoming: { $sum: { $cond: [{ $eq: ["$status", "SCHEDULED"] }, 1, 0] } }
          } 
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...classDoc.toObject(),
        enrolledCount: classDoc.students.length,
        remainingSeats: classDoc.capacity - classDoc.students.length,
        sessionStats: sessionStats[0] || { total: 0, completed: 0, upcoming: 0 }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create new class
 * @route   POST /api/classes
 * @access  Private (Admin, Teacher)
 */
const createClass = async (req, res, next) => {
  try {
    const {
      className,
      grade,
      subject,
      classType,
      mode,
      monthlyFee,
      teacher,
      students,
      capacity,
      startTime,
      endTime,
      dayOfWeek,
      hall,
      classroom,
      onlineMeetingLink,
      onlineMeetingDetails,
      isExtraClass,
      parentClass,
      extraClassDate,
      targetMonth,
      targetYear,
      paymentRequiredFromWeek
    } = req.body;

    // Validate teacher exists if provided
    if (teacher) {
      const teacherExists = await Teacher.findById(teacher);
      if (!teacherExists) {
        return res.status(400).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      // Check for teacher time conflict
      const teacherConflict = await Class.checkTeacherConflict(
        teacher,
        dayOfWeek,
        startTime,
        endTime
      );

      if (teacherConflict) {
        return res.status(400).json({
          success: false,
          message: `Teacher is already assigned to "${teacherConflict.className}" on ${dayOfWeek} from ${teacherConflict.startTime} to ${teacherConflict.endTime}`,
          conflictingClass: teacherConflict
        });
      }
    }

    // Validate hall for physical classes
    if (mode === 'PHYSICAL' && hall) {
      const hallDoc = await Hall.findById(hall);
      if (!hallDoc) {
        return res.status(400).json({
          success: false,
          message: 'Hall not found'
        });
      }

      if (!hallDoc.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Selected hall is inactive'
        });
      }

      // Check for hall time conflict
      const hallConflict = await Class.checkHallConflict(
        hall,
        dayOfWeek,
        startTime,
        endTime
      );

      if (hallConflict) {
        return res.status(400).json({
          success: false,
          message: `Hall is already booked for "${hallConflict.className}" on ${dayOfWeek} from ${hallConflict.startTime} to ${hallConflict.endTime}`,
          conflictingClass: hallConflict
        });
      }

      // Warn if capacity exceeds hall capacity
      if (capacity > hallDoc.capacity) {
        console.warn(`Warning: Class capacity (${capacity}) exceeds hall capacity (${hallDoc.capacity})`);
      }
    }

    // Validate students exist and check capacity
    if (students && students.length > 0) {
      if (students.length > capacity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add ${students.length} students. Class capacity is ${capacity}`
        });
      }

      const uniqueStudents = [...new Set(students)];
      if (uniqueStudents.length !== students.length) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate students in the list'
        });
      }

      const existingStudents = await Student.find({ _id: { $in: students } });
      if (existingStudents.length !== students.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more students not found'
        });
      }
    }

    const newClass = await Class.create({
      className,
      grade,
      subject,
      classType,
      mode,
      monthlyFee,
      teacher: teacher || null,
      students: students || [],
      capacity,
      startTime,
      endTime,
      dayOfWeek,
      hall: mode === 'PHYSICAL' ? (hall || null) : null,
      classroom: classroom || '',
      onlineMeetingLink: mode === 'ONLINE' ? (onlineMeetingLink || '') : '',
      onlineMeetingDetails: mode === 'ONLINE' ? (onlineMeetingDetails || '') : '',
      isExtraClass: isExtraClass || false,
      parentClass: isExtraClass ? (parentClass || null) : null,
      extraClassDate: isExtraClass ? (extraClassDate || null) : null,
      createdBy: req.user ? req.user._id : null,
      targetMonth,
      targetYear,
      paymentRequiredFromWeek
    });

    const populatedClass = await Class.findById(newClass._id)
      .populate('teacher', 'name email')
      .populate('students', 'name email grade')
      .populate('hall', 'name code capacity');

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: populatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update class
 * @route   PUT /api/classes/:id
 * @access  Private (Admin, Teacher)
 */
const updateClass = async (req, res, next) => {
  try {
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    const {
      className,
      grade,
      subject,
      classType,
      mode,
      monthlyFee,
      teacher,
      capacity,
      startTime,
      endTime,
      dayOfWeek,
      hall,
      classroom,
      onlineMeetingLink,
      onlineMeetingDetails,
      targetMonth,
      targetYear,
      paymentRequiredFromWeek
    } = req.body;

    const effectiveDayOfWeek = dayOfWeek || classDoc.dayOfWeek;
    const effectiveStartTime = startTime || classDoc.startTime;
    const effectiveEndTime = endTime || classDoc.endTime;

    // Check teacher conflict if teacher or schedule is changing
    if (teacher && teacher !== classDoc.teacher?.toString()) {
      const teacherExists = await Teacher.findById(teacher);
      if (!teacherExists) {
        return res.status(400).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      const conflict = await Class.checkTeacherConflict(
        teacher,
        effectiveDayOfWeek,
        effectiveStartTime,
        effectiveEndTime,
        req.params.id
      );

      if (conflict) {
        return res.status(400).json({
          success: false,
          message: `Teacher is already assigned to "${conflict.className}" on ${conflict.dayOfWeek} from ${conflict.startTime} to ${conflict.endTime}`,
          conflictingClass: conflict
        });
      }
    }

    // Check if schedule changed for existing teacher
    if ((dayOfWeek && dayOfWeek !== classDoc.dayOfWeek) ||
        (startTime && startTime !== classDoc.startTime) ||
        (endTime && endTime !== classDoc.endTime)) {
      const teacherToCheck = teacher || classDoc.teacher;
      if (teacherToCheck) {
        const conflict = await Class.checkTeacherConflict(
          teacherToCheck,
          effectiveDayOfWeek,
          effectiveStartTime,
          effectiveEndTime,
          req.params.id
        );

        if (conflict) {
          return res.status(400).json({
            success: false,
            message: `Teacher is already assigned to "${conflict.className}" on ${conflict.dayOfWeek} from ${conflict.startTime} to ${conflict.endTime}`,
            conflictingClass: conflict
          });
        }
      }
    }

    // Check hall conflict if hall or schedule is changing
    const effectiveMode = mode || classDoc.mode;
    const effectiveHall = hall !== undefined ? hall : classDoc.hall;

    if (effectiveMode === 'PHYSICAL' && effectiveHall) {
      const hallDoc = await Hall.findById(effectiveHall);
      if (!hallDoc) {
        return res.status(400).json({
          success: false,
          message: 'Hall not found'
        });
      }

      const hallConflict = await Class.checkHallConflict(
        effectiveHall,
        effectiveDayOfWeek,
        effectiveStartTime,
        effectiveEndTime,
        req.params.id
      );

      if (hallConflict) {
        return res.status(400).json({
          success: false,
          message: `Hall is already booked for "${hallConflict.className}" on ${hallConflict.dayOfWeek} from ${hallConflict.startTime} to ${hallConflict.endTime}`,
          conflictingClass: hallConflict
        });
      }
    }

    // Check capacity vs current students
    if (capacity && capacity < classDoc.students.length) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce capacity to ${capacity}. There are currently ${classDoc.students.length} students enrolled.`
      });
    }

    // Update fields
    if (className) classDoc.className = className;
    if (grade) classDoc.grade = grade;
    if (subject) classDoc.subject = subject;
    if (classType) classDoc.classType = classType;
    if (mode) classDoc.mode = mode;
    if (monthlyFee !== undefined) classDoc.monthlyFee = monthlyFee;
    if (teacher !== undefined) classDoc.teacher = teacher || null;
    if (capacity) classDoc.capacity = capacity;
    if (startTime) classDoc.startTime = startTime;
    if (endTime) classDoc.endTime = endTime;
    if (dayOfWeek) classDoc.dayOfWeek = dayOfWeek;
    if (hall !== undefined) classDoc.hall = classDoc.mode === 'PHYSICAL' ? (hall || null) : null;
    if (classroom !== undefined) classDoc.classroom = classroom;
    if (onlineMeetingLink !== undefined) classDoc.onlineMeetingLink = onlineMeetingLink;
    if (onlineMeetingDetails !== undefined) classDoc.onlineMeetingDetails = onlineMeetingDetails;
    if (targetMonth !== undefined) classDoc.targetMonth = targetMonth;
    if (targetYear !== undefined) classDoc.targetYear = targetYear;
    if (paymentRequiredFromWeek !== undefined) classDoc.paymentRequiredFromWeek = paymentRequiredFromWeek;

    await classDoc.save();

    const updatedClass = await Class.findById(classDoc._id)
      .populate('teacher', 'name email')
      .populate('students', 'name email grade')
      .populate('hall', 'name code capacity');

    res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      data: updatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete class (soft delete)
 * @route   DELETE /api/classes/:id
 * @access  Private/Admin
 */
const deleteClass = async (req, res, next) => {
  try {
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    const hasStudents = classDoc.students && classDoc.students.length > 0;

    classDoc.isActive = false;
    await classDoc.save();

    res.status(200).json({
      success: true,
      message: hasStudents
        ? `Class deleted. Note: ${classDoc.students.length} student(s) were enrolled.`
        : 'Class deleted successfully',
      hadEnrolledStudents: hasStudents,
      enrolledCount: classDoc.students.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Assign teacher to class
 * @route   PUT /api/classes/:id/assign-teacher
 * @access  Private/Admin
 */
const assignTeacher = async (req, res, next) => {
  try {
    const { teacherId } = req.body;
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    if (teacherId) {
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) {
        return res.status(400).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      const conflict = await Class.checkTeacherConflict(
        teacherId,
        classDoc.dayOfWeek,
        classDoc.startTime,
        classDoc.endTime,
        req.params.id
      );

      if (conflict) {
        return res.status(400).json({
          success: false,
          message: `Teacher is already assigned to "${conflict.className}" on ${conflict.dayOfWeek} from ${conflict.startTime} to ${conflict.endTime}`,
          conflictingClass: conflict
        });
      }
    }

    classDoc.teacher = teacherId || null;
    await classDoc.save();

    const updatedClass = await Class.findById(classDoc._id)
      .populate('teacher', 'name email')
      .populate('students', 'name email grade')
      .populate('hall', 'name code capacity');

    res.status(200).json({
      success: true,
      message: teacherId ? 'Teacher assigned successfully' : 'Teacher removed from class',
      data: updatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add students to class
 * @route   PUT /api/classes/:id/add-students
 * @access  Private (Admin, Teacher)
 */
const addStudents = async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide student IDs to add'
      });
    }

    const currentStudentIds = classDoc.students.map((s) => s.toString());
    const newStudentIds = studentIds.filter((id) => !currentStudentIds.includes(id));

    if (currentStudentIds.length + newStudentIds.length > classDoc.capacity) {
      return res.status(400).json({
        success: false,
        message: `Cannot add ${newStudentIds.length} students. Class has ${classDoc.capacity - currentStudentIds.length} remaining seats.`,
        remainingSeats: classDoc.capacity - currentStudentIds.length
      });
    }

    // Warn if hall capacity is exceeded
    if (classDoc.hall) {
      const hallDoc = await Hall.findById(classDoc.hall);
      if (hallDoc && (currentStudentIds.length + newStudentIds.length) > hallDoc.capacity) {
        console.warn(`Warning: Student count (${currentStudentIds.length + newStudentIds.length}) exceeds hall capacity (${hallDoc.capacity})`);
      }
    }

    const existingStudents = await Student.find({ _id: { $in: newStudentIds } });
    if (existingStudents.length !== newStudentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more students not found'
      });
    }

    const alreadyEnrolled = studentIds.filter((id) => currentStudentIds.includes(id));
    if (alreadyEnrolled.length > 0) {
      console.log(`${alreadyEnrolled.length} student(s) already enrolled, skipping duplicates`);
    }

    classDoc.students = [...new Set([...currentStudentIds, ...newStudentIds])];
    await classDoc.save();

    const updatedClass = await Class.findById(classDoc._id)
      .populate('teacher', 'name email')
      .populate('students', 'name email grade')
      .populate('hall', 'name code capacity');

    res.status(200).json({
      success: true,
      message: `${newStudentIds.length} student(s) added successfully`,
      skippedDuplicates: alreadyEnrolled.length,
      data: updatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove students from class
 * @route   PUT /api/classes/:id/remove-students
 * @access  Private (Admin, Teacher)
 */
const removeStudents = async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide student IDs to remove'
      });
    }

    const currentStudentIds = classDoc.students.map((s) => s.toString());
    const removedCount = studentIds.filter((id) => currentStudentIds.includes(id)).length;

    classDoc.students = currentStudentIds.filter((id) => !studentIds.includes(id));
    await classDoc.save();

    const updatedClass = await Class.findById(classDoc._id)
      .populate('teacher', 'name email')
      .populate('students', 'name email grade')
      .populate('hall', 'name code capacity');

    res.status(200).json({
      success: true,
      message: `${removedCount} student(s) removed successfully`,
      data: updatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get timetable data (all classes grouped by day)
 * @route   GET /api/classes/timetable
 * @access  Public
 */
const getTimetable = async (req, res, next) => {
  try {
    const { teacher, grade, subject, classType, mode } = req.query;

    const filter = { isActive: true };

    if (teacher) filter.teacher = teacher;
    if (req.query.student) filter.students = req.query.student;
    if (grade) filter.grade = grade;
    if (subject) filter.subject = { $regex: subject, $options: 'i' };
    if (classType) filter.classType = classType;
    if (mode) filter.mode = mode;

    const classes = await Class.find(filter)
      .populate('teacher', 'name')
      .populate('hall', 'name code')
      .sort({ startTime: 1 })
      .lean();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // Get session counts for each class
    const sessionCounts = await Session.aggregate([
      { $match: { class: { $in: classes.map(c => c._id) } } },
      { $group: { _id: '$class', count: { $sum: 1 } } }
    ]);

    const sessionCountMap = {};
    sessionCounts.forEach(s => {
      sessionCountMap[s._id.toString()] = s.count;
    });

    const timetable = {};

    days.forEach((day) => {
      timetable[day] = classes
        .filter((cls) => cls.dayOfWeek === day)
        .map((cls) => ({
          _id: cls._id,
          className: cls.className,
          subject: cls.subject,
          grade: cls.grade,
          classType: cls.classType,
          mode: cls.mode,
          monthlyFee: cls.monthlyFee,
          teacher: cls.teacher?.name || 'Unassigned',
          startTime: cls.startTime,
          endTime: cls.endTime,
          hall: cls.hall?.name || cls.classroom || (cls.mode === 'ONLINE' ? 'Online' : 'N/A'),
          enrolledCount: cls.students?.length || 0,
          capacity: cls.capacity,
          sessionCount: sessionCountMap[cls._id.toString()] || 0
        }));
    });

    res.status(200).json({
      success: true,
      data: timetable
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get unique grades, subjects, and class types for filters
 * @route   GET /api/classes/filter-options
 * @access  Public
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const [grades, subjects] = await Promise.all([
      Class.distinct('grade', { isActive: true }),
      Class.distinct('subject', { isActive: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        grades: grades.sort(),
        subjects: subjects.sort(),
        classTypes: ['THEORY', 'PAPER', 'REVISION'],
        modes: ['PHYSICAL', 'ONLINE']
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check teacher availability
 * @route   POST /api/classes/check-availability
 * @access  Private
 */
const checkTeacherAvailability = async (req, res, next) => {
  try {
    const { teacherId, dayOfWeek, startTime, endTime, excludeClassId } = req.body;

    if (!teacherId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide teacherId, dayOfWeek, startTime, and endTime'
      });
    }

    const conflict = await Class.checkTeacherConflict(
      teacherId,
      dayOfWeek,
      startTime,
      endTime,
      excludeClassId
    );

    res.status(200).json({
      success: true,
      available: !conflict,
      conflictingClass: conflict || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create extra class (by teacher, no admin approval needed)
 * @route   POST /api/classes/extra
 * @access  Private (Teacher)
 */
const createExtraClass = async (req, res, next) => {
  try {
    const {
      className,
      grade,
      subject,
      classType,
      mode,
      monthlyFee,
      capacity,
      startTime,
      endTime,
      dayOfWeek,
      hall,
      classroom,
      onlineMeetingLink,
      onlineMeetingDetails,
      parentClass,
      extraClassDate
    } = req.body;

    const teacherId = req.user.profileId;
    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Teacher profile not found for this user'
      });
    }

    // Check teacher time conflict
    const teacherConflict = await Class.checkTeacherConflict(
      teacherId,
      dayOfWeek,
      startTime,
      endTime
    );

    if (teacherConflict) {
      return res.status(400).json({
        success: false,
        message: `You already have "${teacherConflict.className}" scheduled on ${dayOfWeek} from ${teacherConflict.startTime} to ${teacherConflict.endTime}`,
        conflictingClass: teacherConflict
      });
    }

    // Validate hall for physical classes
    if (mode === 'PHYSICAL' && hall) {
      const hallDoc = await Hall.findById(hall);
      if (!hallDoc || !hallDoc.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Hall not found or inactive'
        });
      }

      const hallConflict = await Class.checkHallConflict(hall, dayOfWeek, startTime, endTime);
      if (hallConflict) {
        return res.status(400).json({
          success: false,
          message: `Hall is already booked for "${hallConflict.className}" on ${dayOfWeek} from ${hallConflict.startTime} to ${hallConflict.endTime}`,
          conflictingClass: hallConflict
        });
      }
    }

    const newClass = await Class.create({
      className,
      grade,
      subject,
      classType: classType || 'THEORY',
      mode: mode || 'PHYSICAL',
      monthlyFee: monthlyFee || 0,
      teacher: teacherId,
      students: [],
      capacity,
      startTime,
      endTime,
      dayOfWeek,
      hall: mode === 'PHYSICAL' ? (hall || null) : null,
      classroom: classroom || '',
      onlineMeetingLink: mode === 'ONLINE' ? (onlineMeetingLink || '') : '',
      onlineMeetingDetails: mode === 'ONLINE' ? (onlineMeetingDetails || '') : '',
      isExtraClass: true,
      parentClass: parentClass || null,
      extraClassDate: extraClassDate || null,
      createdBy: req.user._id
    });

    const populatedClass = await Class.findById(newClass._id)
      .populate('teacher', 'name email')
      .populate('hall', 'name code capacity');

    res.status(201).json({
      success: true,
      message: 'Extra class created successfully',
      data: populatedClass
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle manual enrollment for a class
 * @route   PUT /api/classes/:id/toggle-enrollment
 * @access  Private (Admin, Teacher)
 */
const toggleManualEnrollment = async (req, res, next) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    classDoc.allowManualEnrollment = !classDoc.allowManualEnrollment;
    await classDoc.save();

    res.status(200).json({
      success: true,
      message: `Manual enrollment ${classDoc.allowManualEnrollment ? 'enabled' : 'disabled'} for ${classDoc.className}`,
      data: { allowManualEnrollment: classDoc.allowManualEnrollment }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  assignTeacher,
  addStudents,
  removeStudents,
  getTimetable,
  getFilterOptions,
  checkTeacherAvailability,
  createExtraClass,
  toggleManualEnrollment
};
