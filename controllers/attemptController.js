const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Enrollment = require('../models/Enrollment');

/**
 * @desc    Start/get an attempt for a student
 * @route   POST /api/exams/:examId/attempt
 */
const startAttempt = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.profileId; // Use profileId from auth middleware

    if (!studentId && req.user.role === 'STUDENT') {
      return res.status(403).json({ success: false, message: 'Student profile not linked to user account' });
    }

    const exam = await Exam.findById(examId);
    if (!exam || !exam.isPublished) {
      return res.status(404).json({ success: false, message: 'Exam not found or not published' });
    }

    // Time Enforcement
    const now = new Date();
    if (exam.scheduledDate) {
      const startTime = new Date(exam.scheduledDate);
      if (exam.startTime) {
        const [hours, minutes] = exam.startTime.split(':');
        startTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
      }
      
      if (now < startTime) {
        return res.status(403).json({ 
          success: false, 
          message: `Exam has not started yet. It starts at ${startTime.toLocaleString()}` 
        });
      }
    }

    if (exam.endDate || (exam.scheduledDate && exam.endTime)) {
      const endTime = exam.endDate ? new Date(exam.endDate) : new Date(exam.scheduledDate);
      if (exam.endTime) {
        const [hours, minutes] = exam.endTime.split(':');
        endTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
      } else if (exam.duration) {
        // Fallback to duration if endTime not set
        const startTime = new Date(exam.scheduledDate);
        if (exam.startTime) {
          const [hours, minutes] = exam.startTime.split(':');
          startTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0);
        }
        endTime.setTime(startTime.getTime() + exam.duration * 60000);
      }

      if (now > endTime) {
        return res.status(403).json({ 
          success: false, 
          message: 'Exam has already ended and is no longer available.' 
        });
      }
    }

    // Check enrollment
    const enrollment = await Enrollment.findOne({ student: studentId, class: exam.class, isActive: true });
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Student not enrolled in this class' });
    }

    // Check existing attempt
    let attempt = await Attempt.findOne({ student: studentId, exam: examId });
    if (attempt) {
      return res.status(200).json({ success: true, data: attempt, message: 'Attempt already exists' });
    }

    // Get questions and create empty answers
    const questions = await Question.find({ exam: examId }).sort({ questionNumber: 1 });
    const answers = questions.map(q => ({
      question: q._id,
      selectedOption: null,
      writtenAnswer: '',
      marksAwarded: null
    }));

    attempt = await Attempt.create({
      student: studentId,
      exam: examId,
      answers,
      status: 'IN_PROGRESS'
    });

    res.status(201).json({ success: true, data: attempt });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Attempt already exists' });
    }
    next(error);
  }
};

/**
 * @desc    Submit attempt answers
 * @route   PUT /api/exams/:examId/attempt/submit
 */
const submitAttempt = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const { answers } = req.body;
    const studentId = req.user.profileId;

    const attempt = await Attempt.findOne({ student: studentId, exam: examId });
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }
    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(400).json({ success: false, message: 'Attempt already submitted' });
    }

    // Update answers
    if (answers && Array.isArray(answers)) {
      for (const ans of answers) {
        const existing = attempt.answers.find(a => a.question.toString() === ans.questionId);
        if (existing) {
          if (ans.selectedOption) existing.selectedOption = ans.selectedOption;
          if (ans.writtenAnswer !== undefined) existing.writtenAnswer = ans.writtenAnswer;
        }
      }
    }

    // Auto-score MCQ questions
    const questions = await Question.find({ exam: examId }).lean();
    let autoScore = 0;

    for (const answer of attempt.answers) {
      const question = questions.find(q => q._id.toString() === answer.question.toString());
      if (!question) continue;

      if (question.type === 'MCQ' && answer.selectedOption) {
        const correctOption = question.options.find(o => o.isCorrect);
        if (correctOption && correctOption._id.toString() === answer.selectedOption.toString()) {
          answer.marksAwarded = question.marks;
          autoScore += question.marks;
        } else {
          answer.marksAwarded = 0;
        }
      }
    }

    attempt.autoScore = autoScore;
    attempt.status = 'SUBMITTED';
    attempt.submittedAt = new Date();

    // If all questions are MCQ, auto-grade fully
    const hasWritten = questions.some(q => q.type === 'WRITTEN');
    if (!hasWritten) {
      attempt.finalScore = autoScore;
      attempt.status = 'GRADED';
      attempt.gradedAt = new Date();
    }

    await attempt.save();

    res.status(200).json({
      success: true,
      message: hasWritten ? 'Exam submitted. Written questions await grading.' : 'Exam submitted and auto-graded.',
      data: attempt
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Get student's attempt for an exam
 * @route   GET /api/exams/:examId/attempt/:studentId
 */
const getAttempt = async (req, res, next) => {
  try {
    const attempt = await Attempt.findOne({ student: req.params.studentId, exam: req.params.examId })
      .populate('student', 'name email grade')
      .populate({
        path: 'answers.question',
        select: 'questionNumber type content options marks lineCount explanation'
      });

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    res.status(200).json({ success: true, data: attempt });
  } catch (error) { next(error); }
};

/**
 * @desc    Grade an attempt manually (written answers)
 * @route   PUT /api/exams/:examId/attempt/:studentId/grade
 * @access  Private (Admin, Teacher, Paper Panel)
 */
const gradeAttempt = async (req, res, next) => {
  try {
    const { examId, studentId } = req.params;
    const { marks } = req.body; // Array: [{ questionId, marksAwarded, feedback }]

    const attempt = await Attempt.findOne({ student: studentId, exam: examId });
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    if (!Array.isArray(marks)) {
      return res.status(400).json({ success: false, message: 'Marks array is required' });
    }

    let manualScore = attempt.manualScore || 0;

    for (const markData of marks) {
      const answer = attempt.answers.find(a => a.question.toString() === markData.questionId);
      if (answer) {
        // Remove previous manual marks awarded for this question if re-grading
        if (answer.marksAwarded != null) {
            manualScore -= answer.marksAwarded;
        }

        answer.marksAwarded = Number(markData.marksAwarded) || 0;
        if (markData.feedback !== undefined) {
          answer.feedback = markData.feedback;
        }

        manualScore += answer.marksAwarded;
      }
    }

    attempt.manualScore = manualScore;
    attempt.finalScore = attempt.autoScore + attempt.manualScore;
    attempt.status = 'GRADED';
    attempt.gradedAt = new Date();

    await attempt.save();

    res.status(200).json({
      success: true,
      message: 'Attempt graded successfully',
      data: attempt
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  startAttempt,
  submitAttempt,
  getAttempt,
  gradeAttempt
};
