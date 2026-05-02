const Class = require('../models/Class');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const Exam = require('../models/Exam');
const ServiceRequest = require('../models/ServiceRequest');
const Notification = require('../models/Notification');

/**
 * @desc    Admin dashboard stats
 * @route   GET /api/dashboard/admin
 */
const getAdminDashboard = async (req, res, next) => {
  try {
    const [
      totalClasses, totalStudents, totalTeachers,
      activeEnrollments, totalPayments, pendingRequests,
      totalSessions, totalExams
    ] = await Promise.all([
      Class.countDocuments({ isActive: true }),
      Student.countDocuments(),
      Teacher.countDocuments(),
      Enrollment.countDocuments({ isActive: true }),
      Payment.aggregate([
        { $match: { status: 'COMPLETED' } },
        { 
          $group: { 
            _id: null, 
            totalIncome: { 
              $sum: { 
                $cond: [{ $in: ['$paymentType', ['CLASS_FEE', 'TEACHER_REGISTRATION']] }, '$amount', 0] 
              } 
            },
            totalOutcome: { 
              $sum: { 
                $cond: [{ $eq: ['$paymentType', 'TEACHER_SALARY'] }, '$amount', 0] 
              } 
            }
          } 
        }
      ]),
      ServiceRequest.countDocuments({ status: 'PENDING' }),
      Session.countDocuments({ status: 'COMPLETED' }),
      Exam.countDocuments()
    ]);

    // Recent payments (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentRevenue = await Payment.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    // Monthly revenue trend (last 6 months) - optimized
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyTrend = await Payment.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Recent enrollments - optimized with field selection
    const recentEnrollments = await Enrollment.find({ isActive: true })
      .populate('student', 'name email')
      .populate('class', 'className subject')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalClasses, totalStudents, totalTeachers,
          activeEnrollments,
          totalRevenue: totalPayments[0]?.totalIncome || 0,
          totalIncome: totalPayments[0]?.totalIncome || 0,
          totalOutcome: totalPayments[0]?.totalOutcome || 0,
          pendingRequests, totalSessions, totalExams
        },
        recentRevenue: {
          amount: recentRevenue[0]?.total || 0,
          count: recentRevenue[0]?.count || 0
        },
        monthlyTrend,
        recentEnrollments
      }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Teacher dashboard stats
 * @route   GET /api/dashboard/teacher
 */
const getTeacherDashboard = async (req, res, next) => {
  try {
    // Find teacher profile
    const teacher = await Teacher.findOne({ email: req.user.email }).lean().exec();
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher profile not found' });

    const classes = await Class.find({ teacher: teacher._id, isActive: true }).select('_id className subject grade').lean().exec();
    const classIds = classes.map(c => c._id);

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = days[new Date().getDay()];

    const [totalEnrollments, completedSessions, todaySessions, activeExams] = await Promise.all([
      Enrollment.countDocuments({ class: { $in: classIds }, isActive: true }),
      Session.countDocuments({ class: { $in: classIds }, status: 'COMPLETED' }),
      Class.countDocuments({ 
        _id: { $in: classIds }, 
        dayOfWeek: todayDay,
        isActive: true
      }),
      Exam.countDocuments({ class: { $in: classIds } })
    ]);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcomingSessionsList = await Session.find({ 
      class: { $in: classIds },
      date: { $gte: now }
    })
      .populate({
        path: 'class',
        select: 'className subject hall',
        populate: { path: 'hall', select: 'name' }
      })
      .sort({ date: 1, startTime: 1 })
      .limit(5)
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalClasses: classes.length,
          totalEnrollments,
          completedSessions,
          todaySessions,
          activeExams
        },
        classes: classes.map(c => ({ _id: c._id, className: c.className, subject: c.subject, grade: c.grade })),
        upcomingSessions: upcomingSessionsList
      }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Student dashboard stats
 * @route   GET /api/dashboard/student
 */
const getStudentDashboard = async (req, res, next) => {
  try {
    let student;
    if (req.user.profileId) {
      student = await Student.findById(req.user.profileId).lean().exec();
    } else {
      student = await Student.findOne({ email: req.user.email }).lean().exec();
    }

    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    // Get student's active enrollments - optimized with field selection
    const enrollments = await Enrollment.find({ student: student._id, isActive: true })
      .populate({
        path: 'class',
        select: 'className subject grade dayOfWeek startTime endTime teacher monthlyFee capacity students mode classType targetMonth targetYear',
        populate: { path: 'teacher', select: 'name' }
      })
      .lean()
      .exec();
    const classIds = enrollments.map(e => e.class?._id).filter(Boolean);

    // Get payment status (current month only)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const monthNameToNumber = (monthName) => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return months.indexOf(monthName) + 1;
    };

    // Batch fetch payments for all enrollments at once
    const enrollmentIds = enrollments.map(e => e._id);
    const allPayments = await Payment.find({
      enrollment: { $in: enrollmentIds }
    }).select('enrollment month year status').lean().exec();

    const paymentMap = {};
    allPayments.forEach(p => {
      paymentMap[p.enrollment.toString()] = p;
    });

    const enrichedEnrollments = enrollments.map((enrollment) => {
      const classTargetMonthNum = enrollment.class?.targetMonth ? monthNameToNumber(enrollment.class.targetMonth) : currentMonth;
      
      const payment = paymentMap[enrollment._id.toString()];
      const enrolledAt = new Date(enrollment.enrolledAt);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const inFreePeriod = !payment && enrolledAt >= sevenDaysAgo;

      return {
        ...enrollment,
        currentMonthPayment: payment || null,
        inFreePeriod
      };
    });

    const [totalSessions, attendedSessions, upcomingExams, pendingPayments, unreadNotifications] = await Promise.all([
      Session.countDocuments({ class: { $in: classIds }, status: 'COMPLETED' }),
      Attendance.countDocuments({ student: student._id, status: { $in: ['PRESENT', 'LATE'] } }),
      Exam.countDocuments({ class: { $in: classIds }, isPublished: true }),
      Payment.countDocuments({ enrollment: { $in: enrollmentIds }, status: 'PENDING' }),
      Notification.countDocuments({
        isActive: true,
        'readBy.user': { $ne: req.user._id },
        $or: [{ targetRole: 'ALL' }, { targetRole: 'STUDENT' }, { targetUsers: req.user._id }]
      })
    ]);

    const attendancePercentage = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 0;

    // Get available classes - optimized with field selection
    const allClasses = await Class.find({ 
      isActive: true,
      _id: { $nin: classIds } 
    })
      .populate('teacher', 'name')
      .select('className subject grade dayOfWeek startTime endTime monthlyFee capacity students mode classType')
      .lean()
      .limit(10)
      .exec();

    const availableClasses = allClasses.map(c => ({
      ...c,
      enrolledCount: c.students ? c.students.length : 0,
      remainingSeats: c.capacity - (c.students ? c.students.length : 0),
      students: undefined
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          enrolledClasses: enrollments.length,
          attendancePercentage,
          upcomingExams,
          pendingPayments,
          unreadNotifications
        },
        enrollments: enrichedEnrollments,
        availableClasses,
        studentId: student._id
      }
    });
  } catch (error) { next(error); }
};

module.exports = { getAdminDashboard, getTeacherDashboard, getStudentDashboard };
