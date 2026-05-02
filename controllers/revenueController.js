const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const InstituteSettings = require('../models/InstituteSettings');

/**
 * @desc    Admin revenue report
 * @route   GET /api/revenue/summary
 */
const getRevenueSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, year, month } = req.query;

    const match = { status: 'COMPLETED' };
    if (startDate && endDate) {
      match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (year) {
      const y = parseInt(year, 10);
      const m = month ? parseInt(month, 10) - 1 : 0;
      const start = month ? new Date(y, m, 1) : new Date(y, 0, 1);
      const end = month ? new Date(y, m + 1, 0, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);
      match.createdAt = { $gte: start, $lte: end };
    }

    // Overall totals
    const totals = await Payment.aggregate([
      { $match: match },
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, totalPayments: { $sum: 1 } } }
    ]);

    // By payment method
    const byMethod = await Payment.aggregate([
      { $match: match },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    // By month
    const byMonth = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
          total: { $sum: '$amount' }, count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // By class
    const byClassPipeline = await Payment.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'enrollments', localField: 'enrollment', foreignField: '_id', as: 'enrollmentData'
        }
      },
      { $unwind: '$enrollmentData' },
      {
        $lookup: {
          from: 'classes', localField: 'enrollmentData.class', foreignField: '_id', as: 'classData'
        }
      },
      { $unwind: '$classData' },
      {
        $group: {
          _id: '$classData._id',
          className: { $first: '$classData.className' },
          subject: { $first: '$classData.subject' },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totals: { amount: totals[0]?.totalAmount || 0, count: totals[0]?.totalPayments || 0 },
        byMethod, byMonth, byClass: byClassPipeline
      }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Teacher earnings report
 * @route   GET /api/revenue/teacher-earnings
 */
const getTeacherEarnings = async (req, res, next) => {
  try {
    const { year, month } = req.query;

    // Get settings for revenue share percentages
    const settings = await InstituteSettings.findOne();
    const defaultTeacherShare = 70; // Default 70% to teacher

    // Get all classes with teachers
    const classes = await Class.find({ isActive: true })
      .populate('teacher', 'name email')
      .lean();

    const match = { status: 'COMPLETED' };
    if (year) {
      const y = parseInt(year, 10);
      const m = month ? parseInt(month, 10) - 1 : 0;
      const start = month ? new Date(y, m, 1) : new Date(y, 0, 1);
      const end = month ? new Date(y, m + 1, 0, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);
      match.createdAt = { $gte: start, $lte: end };
    }

    // Revenue per class
    const classRevenue = await Payment.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'enrollments', localField: 'enrollment', foreignField: '_id', as: 'enrollment'
        }
      },
      { $unwind: '$enrollment' },
      {
        $group: {
          _id: '$enrollment.class',
          totalRevenue: { $sum: '$amount' },
          paymentCount: { $sum: 1 }
        }
      }
    ]);

    // Build teacher earnings
    const teacherEarnings = {};
    for (const cls of classes) {
      if (!cls.teacher) continue;
      const revenue = classRevenue.find(r => r._id.toString() === cls._id.toString());
      if (!revenue) continue;

      // Check for custom revenue config
      const config = settings?.revenueConfigs?.find(rc => rc.class?.toString() === cls._id.toString());
      const teacherPercent = config?.teacherPercentage || defaultTeacherShare;

      const teacherId = cls.teacher._id.toString();
      if (!teacherEarnings[teacherId]) {
        teacherEarnings[teacherId] = {
          teacher: cls.teacher,
          classes: [],
          totalRevenue: 0,
          totalEarnings: 0
        };
      }

      const earnings = Math.round(revenue.totalRevenue * teacherPercent / 100);
      teacherEarnings[teacherId].classes.push({
        classId: cls._id,
        className: cls.className,
        subject: cls.subject,
        revenue: revenue.totalRevenue,
        teacherPercent,
        earnings
      });
      teacherEarnings[teacherId].totalRevenue += revenue.totalRevenue;
      teacherEarnings[teacherId].totalEarnings += earnings;
    }

    const result = Object.values(teacherEarnings).sort((a, b) => b.totalEarnings - a.totalEarnings);

    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

module.exports = { getRevenueSummary, getTeacherEarnings };
