const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const InstituteSettings = require('../models/InstituteSettings');

/**
 * @desc    Create a session for a class
 * @route   POST /api/attendance/sessions
 * @access  Private (Admin, Teacher)
 */
const createSession = async (req, res, next) => {
  try {
    const { classId, date, startTime, endTime, topic, chapterName, documentUrl, documentName, notes, isExtraSession } = req.body;

    const classDoc = await Class.findById(classId);
    if (!classDoc || !classDoc.isActive) {
      return res.status(404).json({ success: false, message: 'Class not found or inactive' });
    }

    // Check for teacher conflict across all their classes
    const teacherId = classDoc.teacher;
    if (teacherId) {
      const teacherClasses = await Class.find({ teacher: teacherId }).select('_id');
      const teacherClassIds = teacherClasses.map(c => c._id);

      const sessionDateStart = new Date(date);
      sessionDateStart.setHours(0, 0, 0, 0);
      const sessionDateEnd = new Date(date);
      sessionDateEnd.setHours(23, 59, 59, 999);

      const sTime = startTime || classDoc.startTime;
      const eTime = endTime || classDoc.endTime;

      const conflict = await Session.findOne({
        class: { $in: teacherClassIds },
        date: { $gte: sessionDateStart, $lte: sessionDateEnd },
        status: { $ne: 'CANCELLED' },
        $or: [
          { startTime: { $lte: sTime }, endTime: { $gt: sTime } },
          { startTime: { $lt: eTime }, endTime: { $gte: eTime } },
          { startTime: { $gte: sTime }, endTime: { $lte: eTime } }
        ]
      }).populate('class', 'className');

      if (conflict) {
        return res.status(400).json({
          success: false,
          message: `Teacher conflict: Already has a session for "${conflict.class.className}" at ${conflict.startTime} - ${conflict.endTime}`
        });
      }
    }

    const session = await Session.create({
      class: classId,
      date: new Date(date),
      startTime: startTime || classDoc.startTime,
      endTime: endTime || classDoc.endTime,
      topic: topic || '',
      chapterName: chapterName || '',
      documentUrl: documentUrl || '',
      documentName: documentName || '',
      notes: notes || '',
      conductedBy: req.user?._id || null,
      isExtraSession: isExtraSession || false
    });

    // Auto-create attendance records for all enrolled students (marked ABSENT by default)
    const enrollments = await Enrollment.find({ class: classId, isActive: true });
    const attendanceRecords = enrollments.map((enrollment) => ({
      session: session._id,
      student: enrollment.student,
      class: classId,
      status: 'ABSENT'
    }));

    if (attendanceRecords.length > 0) {
      await Attendance.insertMany(attendanceRecords);
    }

    res.status(201).json({
      success: true,
      message: `Session created with ${attendanceRecords.length} attendance records`,
      data: session
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get sessions for a class
 * @route   GET /api/attendance/sessions
 * @access  Private
 */
const getSessions = async (req, res, next) => {
  try {
    const { classId, startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (classId) filter.class = classId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [sessions, total] = await Promise.all([
      Session.find(filter)
        .populate({
          path: 'class',
          select: 'className subject grade dayOfWeek',
          populate: { path: 'teacher', select: 'name email' }
        })
        .populate('conductedBy', 'username')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Session.countDocuments(filter)
    ]);

    // Enrich with attendance counts
    const enriched = await Promise.all(
      sessions.map(async (session) => {
        const counts = await Attendance.aggregate([
          { $match: { session: session._id } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const attendanceSummary = { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        counts.forEach((c) => {
          attendanceSummary[c._id] = c.count;
          attendanceSummary.total += c.count;
        });
        return { ...session, attendanceSummary };
      })
    );

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance for a specific session
 * @route   GET /api/attendance/sessions/:sessionId
 * @access  Private
 */
const getSessionAttendance = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.sessionId)
      .populate({
        path: 'class',
        select: 'className subject grade',
        populate: { path: 'teacher', select: 'name email' }
      })
      .populate('conductedBy', 'username');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const [attendance, teacherAttendance] = await Promise.all([
      Attendance.find({ session: session._id })
        .populate('student', 'name email grade phone')
        .populate('markedBy', 'username')
        .sort({ 'student.name': 1 })
        .lean(),
      require('../models/TeacherAttendance').findOne({ session: session._id })
        .populate('markedBy', 'username')
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        session,
        attendance,
        teacherAttendance,
        summary: {
          total: attendance.length,
          present: attendance.filter((a) => a.status === 'PRESENT').length,
          absent: attendance.filter((a) => a.status === 'ABSENT').length,
          late: attendance.filter((a) => a.status === 'LATE').length,
          excused: attendance.filter((a) => a.status === 'EXCUSED').length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark/update attendance for a session (batch)
 * @route   PUT /api/attendance/sessions/:sessionId/mark
 * @access  Private (Admin, Teacher)
 */
const markAttendance = async (req, res, next) => {
  try {
    const { records } = req.body;
    // records: [{ studentId, status, notes? }]

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'Attendance records are required' });
    }

    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const results = { updated: 0, errors: [] };

    for (const record of records) {
      try {
        await Attendance.findOneAndUpdate(
          { session: session._id, student: record.studentId },
          {
            status: record.status,
            markedBy: req.user?._id || null,
            markedAt: new Date(),
            notes: record.notes || ''
          },
          { upsert: true, new: true }
        );
        results.updated++;
      } catch (err) {
        results.errors.push({ studentId: record.studentId, error: err.message });
      }
    }

    // Mark session as completed
    if (session.status === 'SCHEDULED') {
      session.status = 'COMPLETED';
      await session.save();
    }

    res.status(200).json({
      success: true,
      message: `${results.updated} attendance record(s) updated`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update session details
 * @route   PUT /api/attendance/sessions/:sessionId
 * @access  Private (Admin, Teacher)
 */
const updateSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const { topic, chapterName, documentUrl, documentName, notes, status, startTime, endTime } = req.body;
    if (topic !== undefined) session.topic = topic;
    if (chapterName !== undefined) session.chapterName = chapterName;
    if (documentUrl !== undefined) session.documentUrl = documentUrl;
    if (documentName !== undefined) session.documentName = documentName;
    if (notes !== undefined) session.notes = notes;
    if (status) session.status = status;
    
    if (startTime || endTime) {
      const sTime = startTime || session.startTime;
      const eTime = endTime || session.endTime;
      
      const classDoc = await Class.findById(session.class);
      if (classDoc && classDoc.teacher) {
        const teacherClasses = await Class.find({ teacher: classDoc.teacher }).select('_id');
        const teacherClassIds = teacherClasses.map(c => c._id);
        
        const sessionDateStart = new Date(session.date);
        sessionDateStart.setHours(0, 0, 0, 0);
        const sessionDateEnd = new Date(session.date);
        sessionDateEnd.setHours(23, 59, 59, 999);
        
        const conflict = await Session.findOne({
          _id: { $ne: session._id },
          class: { $in: teacherClassIds },
          date: { $gte: sessionDateStart, $lte: sessionDateEnd },
          status: { $ne: 'CANCELLED' },
          $or: [
            { startTime: { $lte: sTime }, endTime: { $gt: sTime } },
            { startTime: { $lt: eTime }, endTime: { $gte: eTime } },
            { startTime: { $gte: sTime }, endTime: { $lte: eTime } }
          ]
        }).populate('class', 'className');

        if (conflict) {
          return res.status(400).json({
            success: false,
            message: `Teacher conflict: Already has a session for "${conflict.class.className}" at ${conflict.startTime} - ${conflict.endTime}`
          });
        }
      }
      
      if (startTime) session.startTime = startTime;
      if (endTime) session.endTime = endTime;
    }

    await session.save();

    res.status(200).json({
      success: true,
      message: 'Session updated',
      data: session
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete/cancel a session
 * @route   DELETE /api/attendance/sessions/:sessionId
 * @access  Private (Admin)
 */
const cancelSession = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // Permanently remove the session
    await Session.findByIdAndDelete(req.params.sessionId);

    // Remove attendance records for this session
    await Attendance.deleteMany({ session: session._id });

    res.status(200).json({
      success: true,
      message: 'Session permanently deleted and attendance records removed'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance report for a student across all classes
 * @route   GET /api/attendance/report/student/:studentId
 * @access  Private
 */
const getStudentAttendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const studentId = req.params.studentId;

    const matchFilter = { student: new (require('mongoose').Types.ObjectId)(studentId) };

    // Get all attendance records for this student
    const records = await Attendance.find(matchFilter)
      .populate({
        path: 'session',
        match: {
          status: { $ne: 'CANCELLED' },
          ...(startDate || endDate ? {
            date: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {})
            }
          } : {})
        },
        select: 'date class status'
      })
      .lean();

    // Filter out records where session didn't match
    const validRecords = records.filter((r) => r.session);

    // Group by class
    const classMap = {};
    for (const record of validRecords) {
      const classId = record.class.toString();
      if (!classMap[classId]) {
        classMap[classId] = { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
      }
      classMap[classId].total++;
      classMap[classId][record.status]++;
    }

    // Get class details and calculate percentages
    const classIds = Object.keys(classMap);
    const classes = await Class.find({ _id: { $in: classIds } })
      .select('className subject grade')
      .lean();

    // Get threshold
    const settings = await InstituteSettings.findOne().lean();
    const threshold = settings?.attendanceThresholdPercent || 75;

    const report = classes.map((cls) => {
      const stats = classMap[cls._id.toString()];
      const attended = stats.PRESENT + stats.LATE;
      const percentage = stats.total > 0 ? Math.round((attended / stats.total) * 100) : 0;

      // Collect specific records for this class
      const classRecords = validRecords
        .filter((r) => r.class.toString() === cls._id.toString())
        .map((r) => ({
          date: r.session.date,
          status: r.status,
          sessionStatus: r.session.status
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      return {
        class: cls,
        stats,
        attendedCount: attended,
        percentage,
        meetsThreshold: percentage >= threshold,
        threshold,
        records: classRecords
      };
    });

    res.status(200).json({
      success: true,
      data: {
        studentId,
        overallStats: {
          totalSessions: validRecords.length,
          present: validRecords.filter((r) => r.status === 'PRESENT').length,
          late: validRecords.filter((r) => r.status === 'LATE').length,
          absent: validRecords.filter((r) => r.status === 'ABSENT').length,
          excused: validRecords.filter((r) => r.status === 'EXCUSED').length
        },
        classes: report
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance report for a class
 * @route   GET /api/attendance/report/class/:classId
 * @access  Private
 */
const getClassAttendanceReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const classId = req.params.classId;

    // Get all non-cancelled sessions
    const sessionFilter = { class: classId, status: { $ne: 'CANCELLED' } };
    if (startDate || endDate) {
      sessionFilter.date = {};
      if (startDate) sessionFilter.date.$gte = new Date(startDate);
      if (endDate) sessionFilter.date.$lte = new Date(endDate);
    }

    const sessions = await Session.find(sessionFilter).sort({ date: 1 }).lean();
    const sessionIds = sessions.map((s) => s._id);

    // Get all attendance records for these sessions
    const attendanceRecords = await Attendance.find({ session: { $in: sessionIds } })
      .populate('student', 'name email grade')
      .lean();

    // Group by student
    const studentMap = {};
    for (const record of attendanceRecords) {
      const sid = record.student?._id?.toString();
      if (!sid) continue;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          student: record.student,
          total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0
        };
      }
      studentMap[sid].total++;
      studentMap[sid][record.status]++;
    }

    const settings = await InstituteSettings.findOne().lean();
    const threshold = settings?.attendanceThresholdPercent || 75;

    const classDoc = await Class.findById(classId).select('className subject grade').lean();

    const studentReport = Object.values(studentMap).map((entry) => {
      const attended = entry.PRESENT + entry.LATE;
      const percentage = entry.total > 0 ? Math.round((attended / entry.total) * 100) : 0;
      return {
        ...entry,
        attendedCount: attended,
        percentage,
        meetsThreshold: percentage >= threshold
      };
    });

    // Sort by percentage ascending (worst attendance first)
    studentReport.sort((a, b) => a.percentage - b.percentage);

    res.status(200).json({
      success: true,
      data: {
        class: classDoc,
        totalSessions: sessions.length,
        threshold,
        students: studentReport,
        belowThreshold: studentReport.filter((s) => !s.meetsThreshold).length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSession,
  getSessions,
  getSessionAttendance,
  markAttendance,
  updateSession,
  cancelSession,
  getStudentAttendanceReport,
  getClassAttendanceReport
};
