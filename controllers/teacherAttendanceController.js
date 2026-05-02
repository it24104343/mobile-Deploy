const TeacherAttendance = require('../models/TeacherAttendance');
const Teacher = require('../models/Teacher');

/**
 * @desc    Get all teachers with their attendance for a specific date
 * @route   GET /api/teacher-attendance/daily?date=YYYY-MM-DD
 * @access  Private (Admin)
 */
const getDailyAttendance = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Get all active teachers
    const teachers = await Teacher.find({ isActive: true }).sort({ name: 1 }).lean();

    // Get attendance records for this date
    const records = await TeacherAttendance.find({
      date: { $gte: dayStart, $lte: dayEnd }
    }).lean();

    // Build a map of teacherId -> record
    const attendanceMap = {};
    records.forEach(r => {
      attendanceMap[r.teacher.toString()] = r;
    });

    // Merge: each teacher gets their attendance (or null)
    const data = teachers.map(t => ({
      teacher: { _id: t._id, name: t.name, email: t.email, phone: t.phone, subjects: t.subjects },
      attendance: attendanceMap[t._id.toString()] || null
    }));

    res.status(200).json({ success: true, date, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Bulk mark/update teacher attendance for a date
 * @route   POST /api/teacher-attendance/bulk
 * @access  Private (Admin)
 */
const markBulkAttendance = async (req, res, next) => {
  try {
    const { date, records } = req.body;
    // records: [{ teacherId, status, notes? }]

    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Date and records array are required' });
    }

    const dayDate = new Date(date);
    dayDate.setHours(0, 0, 0, 0);

    const operations = records.map(r => ({
      updateOne: {
        filter: { teacher: r.teacherId, date: dayDate },
        update: {
          $set: {
            teacher: r.teacherId,
            date: dayDate,
            status: r.status,
            notes: r.notes || '',
            markedBy: req.user._id,
            markedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    await TeacherAttendance.bulkWrite(operations);

    res.status(200).json({
      success: true,
      message: `Attendance saved for ${records.length} teacher(s)`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark single teacher attendance (keep for session-based marking)
 * @route   POST /api/teacher-attendance
 * @access  Private (Admin)
 */
const markTeacherAttendance = async (req, res, next) => {
  try {
    const { teacherId, classId, sessionId, date, status, notes } = req.body;

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const filter = { teacher: teacherId };
    if (sessionId) {
      filter.session = sessionId;
    } else {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      filter.date = dayStart;
    }

    const attendanceData = {
      teacher: teacherId,
      class: classId || null,
      session: sessionId || null,
      date: new Date(date),
      status,
      notes: notes || '',
      markedBy: req.user?._id || null,
      markedAt: new Date()
    };

    const attendance = await TeacherAttendance.findOneAndUpdate(
      filter,
      attendanceData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Teacher attendance marked successfully',
      data: attendance
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get teacher attendance records (filterable)
 * @route   GET /api/teacher-attendance
 * @access  Private (Admin, Teacher)
 */
const getTeacherAttendance = async (req, res, next) => {
  try {
    const { teacherId, classId, sessionId, startDate, endDate } = req.query;

    const filter = {};
    if (teacherId) filter.teacher = teacherId;
    if (classId) filter.class = classId;
    if (sessionId) filter.session = sessionId;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (req.user.role === 'TEACHER' && req.user.profileId) {
      filter.teacher = req.user.profileId;
    }

    const records = await TeacherAttendance.find(filter)
      .populate('teacher', 'name email')
      .populate('class', 'className subject grade')
      .populate('session', 'date startTime endTime topic')
      .populate('markedBy', 'username')
      .sort({ date: -1 });

    res.status(200).json({ success: true, count: records.length, data: records });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete single attendance record
 * @route   DELETE /api/teacher-attendance/:id
 * @access  Private (Admin)
 */
const deleteAttendanceRecord = async (req, res, next) => {
  try {
    const record = await TeacherAttendance.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    res.status(200).json({ success: true, message: 'Attendance record deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete ALL attendance records for a specific date (entire day sheet)
 * @route   DELETE /api/teacher-attendance/date/:date
 * @access  Private (Admin)
 */
const deleteDayAttendance = async (req, res, next) => {
  try {
    const dayStart = new Date(req.params.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(req.params.date);
    dayEnd.setHours(23, 59, 59, 999);

    const result = await TeacherAttendance.deleteMany({
      date: { $gte: dayStart, $lte: dayEnd }
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} record(s) for ${req.params.date}`
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  markTeacherAttendance,
  getTeacherAttendance,
  getDailyAttendance,
  markBulkAttendance,
  deleteAttendanceRecord,
  deleteDayAttendance
};
