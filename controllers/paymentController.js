const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

/**
 * @desc    Get payments with filters
 * @route   GET /api/payments
 * @access  Private
 */
const getPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, student, classId, month, year, status, paymentType } = req.query;

    const filter = {};
    if (student) filter.student = student;
    if (classId) filter.class = classId;
    if (month) filter.month = parseInt(month, 10);
    if (year) filter.year = parseInt(year, 10);
    if (status) filter.status = status;
    if (paymentType) filter.paymentType = paymentType;

    // If teacher role, restrict based on payment type
    if (req.user.role === 'TEACHER') {
      const teacherProfileId = req.user.profileId;
      
      if (paymentType === 'TEACHER_SALARY') {
        filter.teacher = teacherProfileId;
      } else {
        // For student fees, restrict to their own classes
        const teacherClasses = await Class.find({ teacher: teacherProfileId }).select('_id');
        const teacherClassIds = teacherClasses.map(c => c._id);
        
        if (filter.class) {
          if (!teacherClassIds.some(id => id.toString() === filter.class.toString())) {
            return res.status(200).json({ success: true, data: [], pagination: { currentPage: parseInt(page, 10), totalPages: 0, totalItems: 0, itemsPerPage: parseInt(limit, 10) } });
          }
        } else {
          filter.class = { $in: teacherClassIds };
        }
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('student', 'name email grade')
        .populate('teacher', 'name email phone')
        .populate('class', 'className subject monthlyFee')
        .populate('enrollment', 'enrolledAt')
        .populate('recordedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Payment.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: payments,
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
 * @desc    Get payments for a specific student
 * @route   GET /api/payments/student/:studentId
 * @access  Private
 */
const getStudentPayments = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const filter = { student: req.params.studentId };
    if (month) filter.month = parseInt(month, 10);
    if (year) filter.year = parseInt(year, 10);

    const payments = await Payment.find(filter)
      .populate('class', 'className subject monthlyFee')
      .sort({ year: -1, month: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: payments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payment summary for a class (monthly)
 * @route   GET /api/payments/class/:classId/summary
 * @access  Private
 */
const getClassPaymentSummary = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const classId = req.params.classId;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    // Get all enrollments for this class (including inactive ones)
    const enrollments = await Enrollment.find({ class: classId })
      .populate('student', 'name email grade')
      .lean();

    // Get payments for this class/month/year
    const payments = await Payment.find({ class: classId, month: monthNum, year: yearNum })
      .lean();

    const paymentMap = {};
    payments.forEach((p) => {
      paymentMap[p.enrollment.toString()] = p;
    });

    const summary = enrollments.map((enrollment) => {
      const payment = paymentMap[enrollment._id.toString()];
      const enrolledAt = new Date(enrollment.enrolledAt);
      const now = new Date();
      const daysSince = Math.floor((now - enrolledAt) / (1000 * 60 * 60 * 24));

      return {
        enrollment: enrollment._id,
        student: enrollment.student,
        admissionFeePaid: enrollment.admissionFeePaid,
        inFreePeriod: daysSince <= 7,
        payment: payment || null,
        isPaid: payment?.status === 'COMPLETED',
        isActive: enrollment.isActive,
        status: payment ? payment.status : (daysSince <= 7 ? 'FREE_PERIOD' : 'UNPAID')
      };
    });

    const classDoc = await Class.findById(classId).select('className monthlyFee').lean();

    res.status(200).json({
      success: true,
      data: {
        class: classDoc,
        month: monthNum,
        year: yearNum,
        totalEnrolled: enrollments.length,
        totalPaid: summary.filter((s) => s.isPaid).length,
        totalUnpaid: summary.filter((s) => !s.isPaid && s.status !== 'FREE_PERIOD').length,
        totalFreePeriod: summary.filter((s) => s.status === 'FREE_PERIOD').length,
        students: summary
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Record a payment (admin manual / cash)
 * @route   POST /api/payments
 * @access  Private (Admin)
 */
const recordPayment = async (req, res, next) => {
  try {
    const { enrollmentId, month, year, amount, paymentMethod = 'CASH', notes } = req.body;
    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : '';

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('class', 'monthlyFee');
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    if (!enrollment.isActive) {
      return res.status(400).json({ success: false, message: 'Enrollment is not active' });
    }

    // Use class monthly fee if amount not specified
    const paymentAmount = amount || enrollment.class.monthlyFee;

    let payment = await Payment.findOne({
      enrollment: enrollmentId,
      month,
      year
    });

    if (payment) {
      if (['COMPLETED', 'PENDING'].includes(payment.status)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Payment already exists for this enrollment in the given month/year' 
        });
      }
      // Overwrite existing FAILED or REFUNDED payment
      payment.amount = paymentAmount;
      payment.paymentMethod = paymentMethod;
      payment.status = 'COMPLETED';
      payment.paidAt = new Date();
      payment.recordedBy = req.user?._id || null;
      payment.receiptUrl = receiptUrl || payment.receiptUrl;
      payment.notes = notes || '';
      await payment.save();
    } else {
      payment = await Payment.create({
        enrollment: enrollmentId,
        student: enrollment.student,
        class: enrollment.class._id,
        amount: paymentAmount,
        month,
        year,
        paymentMethod,
        status: 'COMPLETED',
        paidAt: new Date(),
        recordedBy: req.user?._id || null,
        notes: notes || '',
        receiptUrl
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('student', 'name email')
      .populate('class', 'className subject');

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this enrollment in the given month/year'
      });
    }
    next(error);
  }
};

/**
 * @desc    Process payment via dummy gateway
 * @route   POST /api/payments/gateway
 * @access  Private (Student)
 */
const processGatewayPayment = async (req, res, next) => {
  try {
    const { enrollmentId, month, year, cardNumber } = req.body;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('class', 'monthlyFee className');
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    if (!enrollment.isActive) {
      return res.status(400).json({ success: false, message: 'Enrollment is not active' });
    }

    const paymentAmount = enrollment.class.monthlyFee;

    // --- DUMMY GATEWAY SIMULATION ---
    // Simulate processing delay
    const gatewayRef = `GW-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

    // Simulate 90% success rate
    const isSuccessful = Math.random() > 0.1;

    if (!isSuccessful) {
      // Handle failed payment
      let failedPayment = await Payment.findOne({ enrollment: enrollmentId, month, year });
      if (failedPayment) {
        if (['COMPLETED', 'PENDING'].includes(failedPayment.status)) {
           return res.status(400).json({ success: false, message: 'Payment already exists for this enrollment in the given month/year' });
        }
        failedPayment.amount = paymentAmount;
        failedPayment.paymentMethod = 'GATEWAY';
        failedPayment.status = 'FAILED';
        failedPayment.gatewayRef = gatewayRef;
        failedPayment.notes = 'Gateway declined the transaction';
        await failedPayment.save();
      } else {
        await Payment.create({
          enrollment: enrollmentId,
          student: enrollment.student,
          class: enrollment.class._id,
          amount: paymentAmount,
          month,
          year,
          paymentMethod: 'GATEWAY',
          status: 'FAILED',
          gatewayRef,
          notes: 'Gateway declined the transaction'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Payment was declined by the gateway. Please try again.',
        gatewayRef
      });
    }

    let payment = await Payment.findOne({ enrollment: enrollmentId, month, year });
    if (payment) {
      if (['COMPLETED', 'PENDING'].includes(payment.status)) {
         return res.status(400).json({ success: false, message: 'Payment already exists for this enrollment in the given month/year' });
      }
      payment.amount = paymentAmount;
      payment.paymentMethod = 'GATEWAY';
      payment.status = 'COMPLETED';
      payment.gatewayRef = gatewayRef;
      payment.paidAt = new Date();
      payment.notes = `Card ending ${cardNumber ? cardNumber.slice(-4) : '****'}`;
      await payment.save();
    } else {
      payment = await Payment.create({
        enrollment: enrollmentId,
        student: enrollment.student,
        class: enrollment.class._id,
        amount: paymentAmount,
        month,
        year,
        paymentMethod: 'GATEWAY',
        status: 'COMPLETED',
        gatewayRef,
        paidAt: new Date(),
        notes: `Card ending ${cardNumber ? cardNumber.slice(-4) : '****'}`
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('student', 'name email')
      .populate('class', 'className subject');

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      data: populated,
      gatewayRef
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this enrollment in the given month/year'
      });
    }
    next(error);
  }
};

/**
 * @desc    Mark payment as refunded
 * @route   PUT /api/payments/:id/refund
 * @access  Private (Admin)
 */
const refundPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Only completed payments can be refunded' });
    }

    payment.status = 'REFUNDED';
    payment.notes = `${payment.notes} | Refunded by admin on ${new Date().toISOString()}`;
    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit bank transfer payment with receipt
 * @route   POST /api/payments/bank-transfer
 * @access  Private (Student)
 */
const submitBankTransfer = async (req, res, next) => {
  try {
    const { enrollmentId, month, year } = req.body;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate('class', 'monthlyFee className');
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    if (!enrollment.isActive) {
      return res.status(400).json({ success: false, message: 'Enrollment is not active' });
    }

    // Verify student owns this enrollment
    const student = await Student.findOne({ email: req.user.email });
    if (!student || enrollment.student.toString() !== student._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only submit payments for your own enrollments' });
    }

    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : '';
    if (!receiptUrl) {
      return res.status(400).json({ success: false, message: 'Receipt image is required' });
    }

    let payment = await Payment.findOne({ enrollment: enrollmentId, month, year });
    if (payment) {
      if (['COMPLETED', 'PENDING'].includes(payment.status)) {
        return res.status(400).json({ success: false, message: 'Payment already exists for this enrollment in the given month/year' });
      }
      payment.amount = enrollment.class.monthlyFee;
      payment.paymentMethod = 'BANK_TRANSFER';
      payment.status = 'PENDING';
      payment.receiptUrl = receiptUrl;
      payment.notes = 'Bank transfer - awaiting admin approval';
      await payment.save();
    } else {
      payment = await Payment.create({
        enrollment: enrollmentId,
        student: student._id,
        class: enrollment.class._id,
        amount: enrollment.class.monthlyFee,
        month,
        year,
        paymentMethod: 'BANK_TRANSFER',
        status: 'PENDING',
        receiptUrl,
        notes: 'Bank transfer - awaiting admin approval'
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('student', 'name email')
      .populate('class', 'className subject');

    res.status(201).json({
      success: true,
      message: 'Bank transfer receipt submitted. Awaiting admin approval.',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Payment already exists for this enrollment in the given month/year', duplicateKey: error.keyValue });
    }
    next(error);
  }
};

/**
 * @desc    Approve or reject bank transfer payment
 * @route   PUT /api/payments/:id/approve-transfer
 * @access  Private (Admin)
 */
const approveBankTransfer = async (req, res, next) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (payment.status !== 'PENDING' || payment.paymentMethod !== 'BANK_TRANSFER') {
      return res.status(400).json({ success: false, message: 'Only pending bank transfer payments can be approved/rejected' });
    }

    if (action === 'approve') {
      payment.status = 'COMPLETED';
      payment.paidAt = new Date();
      payment.recordedBy = req.user._id;
      payment.notes = `Bank transfer approved by admin on ${new Date().toISOString()}`;
      await payment.save();

      if (payment.paymentType === 'TEACHER_REGISTRATION' && payment.teacher) {
        await Teacher.findByIdAndUpdate(payment.teacher, { registrationPaymentStatus: 'COMPLETED' });
      }

      res.status(200).json({ success: true, message: 'Bank transfer payment approved', data: payment });
    } else if (action === 'reject') {
      payment.status = 'FAILED';
      payment.notes = `Bank transfer rejected by admin on ${new Date().toISOString()}`;
      await payment.save();

      res.status(200).json({ success: true, message: 'Bank transfer payment rejected', data: payment });
    } else {
      return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject"' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Process teacher registration payment via gateway
 * @route   POST /api/payments/teacher/gateway
 * @access  Private (Teacher)
 */
const processTeacherGatewayPayment = async (req, res, next) => {
  try {
    const { cardNumber } = req.body;
    const teacherId = req.user.profileId;

    const teacher = await Teacher.findById(teacherId);
    
    if (!teacher || !teacher.isActive) {
      return res.status(404).json({ success: false, message: 'Teacher not found or inactive' });
    }

    if (teacher.registrationPaymentStatus === 'COMPLETED' || teacher.registrationPaymentStatus === 'NOT_REQUIRED') {
      return res.status(400).json({ success: false, message: 'Registration payment already completed or not required' });
    }

    const paymentAmount = teacher.registrationFee;

    // --- DUMMY GATEWAY SIMULATION ---
    const gatewayRef = `GW-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const isSuccessful = Math.random() > 0.1;

    if (!isSuccessful) {
      await Payment.create({
        paymentType: 'TEACHER_REGISTRATION',
        teacher: teacher._id,
        amount: paymentAmount,
        paymentMethod: 'GATEWAY',
        status: 'FAILED',
        gatewayRef,
        notes: 'Gateway declined the transaction'
      });
      return res.status(400).json({ success: false, message: 'Payment was declined by the gateway. Please try again.', gatewayRef });
    }

    const payment = await Payment.create({
      paymentType: 'TEACHER_REGISTRATION',
      teacher: teacher._id,
      amount: paymentAmount,
      paymentMethod: 'GATEWAY',
      status: 'COMPLETED',
      gatewayRef,
      paidAt: new Date(),
      notes: `Registration Fee. Card ending ${cardNumber ? cardNumber.slice(-4) : '****'}`
    });

    teacher.registrationPaymentStatus = 'COMPLETED';
    await teacher.save();

    res.status(201).json({
      success: true,
      message: 'Registration payment processed successfully',
      data: payment,
      gatewayRef
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit bank transfer receipt for teacher registration
 * @route   POST /api/payments/teacher/bank-transfer
 * @access  Private (Teacher)
 */
const submitTeacherBankTransfer = async (req, res, next) => {
  try {
    const teacherId = req.user.profileId;

    const teacher = await Teacher.findById(teacherId);

    if (!teacher || !teacher.isActive) {
      return res.status(404).json({ success: false, message: 'Teacher not found or inactive' });
    }

    if (teacher.registrationPaymentStatus === 'COMPLETED' || teacher.registrationPaymentStatus === 'NOT_REQUIRED') {
      return res.status(400).json({ success: false, message: 'Registration payment already completed or not required' });
    }

    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : '';
    if (!receiptUrl) {
      return res.status(400).json({ success: false, message: 'Receipt image is required' });
    }

    const existingPayment = await Payment.findOne({
      paymentType: 'TEACHER_REGISTRATION',
      teacher: teacher._id,
      status: 'PENDING'
    });

    if (existingPayment) {
      existingPayment.receiptUrl = receiptUrl;
      existingPayment.paymentMethod = 'BANK_TRANSFER';
      await existingPayment.save();
      
      return res.status(201).json({
        success: true,
        message: 'Bank transfer receipt updated. Awaiting admin approval.',
        data: existingPayment
      });
    }

    const payment = await Payment.create({
      paymentType: 'TEACHER_REGISTRATION',
      teacher: teacher._id,
      amount: teacher.registrationFee,
      paymentMethod: 'BANK_TRANSFER',
      status: 'PENDING',
      receiptUrl,
      notes: 'Initial Registration - Bank transfer awaiting admin approval'
    });

    res.status(201).json({
      success: true,
      message: 'Bank transfer receipt submitted. Awaiting admin approval.',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a payment record
 * @route   PUT /api/payments/:id
 * @access  Private (Admin)
 */
const updatePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const { amount, paymentMethod, status, notes } = req.body;
    
    // Store original status to detect transitions
    const originalStatus = payment.status;

    if (amount !== undefined) payment.amount = amount;
    if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;
    if (status !== undefined) payment.status = status;
    if (notes !== undefined) payment.notes = notes;

    await payment.save();

    // Sync Teacher registrationPaymentStatus if applicable
    if (payment.paymentType === 'TEACHER_REGISTRATION' && payment.teacher) {
      if (originalStatus !== 'COMPLETED' && payment.status === 'COMPLETED') {
        const Teacher = require('../models/Teacher');
        await Teacher.findByIdAndUpdate(payment.teacher, { registrationPaymentStatus: 'COMPLETED' });
      } else if (originalStatus === 'COMPLETED' && payment.status !== 'COMPLETED') {
        const Teacher = require('../models/Teacher');
        await Teacher.findByIdAndUpdate(payment.teacher, { registrationPaymentStatus: 'PENDING' });
      }
    }

    res.status(200).json({ success: true, message: 'Payment updated successfully', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a payment record
 * @route   DELETE /api/payments/:id
 * @access  Private (Admin)
 */
const deletePayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const paymentType = payment.paymentType;
    const teacherId = payment.teacher;
    const status = payment.status;

    await payment.deleteOne();

    // If deleting a completed teacher registration payment, revert their status
    if (paymentType === 'TEACHER_REGISTRATION' && teacherId && status === 'COMPLETED') {
        const Teacher = require('../models/Teacher');
        await Teacher.findByIdAndUpdate(teacherId, { registrationPaymentStatus: 'PENDING' });
    }

    res.status(200).json({ success: true, message: 'Payment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Record teacher salary (admin manual)
 * @route   POST /api/payments/teacher-salary
 * @access  Private (Admin)
 */
const recordTeacherSalary = async (req, res, next) => {
  try {
    const { teacherId, month, year, amount, paymentMethod = 'CASH', notes } = req.body;
    const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : '';

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const payment = await Payment.create({
      paymentType: 'TEACHER_SALARY',
      teacher: teacherId,
      amount,
      month,
      year,
      paymentMethod,
      status: 'COMPLETED',
      paidAt: new Date(),
      recordedBy: req.user?._id || null,
      notes: notes || 'Monthly Salary',
      receiptUrl
    });

    res.status(201).json({
      success: true,
      message: 'Teacher salary recorded successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get teacher salary summary (monthly)
 * @route   GET /api/payments/teacher-salary/summary
 * @access  Private (Admin)
 */
const getTeacherSalarySummary = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Month and year are required' });
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    const teachers = await Teacher.find({ isActive: true }).select('name email phone').lean();
    const payments = await Payment.find({
      paymentType: 'TEACHER_SALARY',
      month: monthNum,
      year: yearNum,
      status: 'COMPLETED'
    }).lean();

    const paymentMap = {};
    payments.forEach(p => {
      if (p.teacher) {
        paymentMap[p.teacher.toString()] = p;
      }
    });

    const summary = teachers.map(t => {
      const payment = paymentMap[t._id.toString()];
      return {
        teacher: t,
        isPaid: !!payment,
        payment: payment || null
      };
    });

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPayments,
  getStudentPayments,
  getClassPaymentSummary,
  recordPayment,
  processGatewayPayment,
  refundPayment,
  submitBankTransfer,
  approveBankTransfer,
  processTeacherGatewayPayment,
  submitTeacherBankTransfer,
  updatePayment,
  deletePayment,
  recordTeacherSalary,
  getTeacherSalarySummary
};
