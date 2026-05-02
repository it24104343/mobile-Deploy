const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');

/**
 * @desc    Get exams with filters
 * @route   GET /api/exams
 */
const getExams = async (req, res, next) => {
  try {
    const { classId, term, isPublished, page = 1, limit = 20 } = req.query;
    let filter = { isActive: true };

    const role = req.user?.role;
    let studentProfileId = req.user?.profileId;

    if (role === 'STUDENT') {
      // Fallback: If profileId is missing, try to find student by email
      if (!studentProfileId) {
        const student = await Student.findOne({ email: req.user.email });
        if (student) studentProfileId = student._id;
      }

      if (!studentProfileId) {
        return res.status(404).json({ success: false, message: 'Student profile not linked' });
      }
      
      const enrollments = await Enrollment.find({ student: studentProfileId, isActive: true }).select('class');
      const classIds = enrollments.map(e => e.class);
      
      filter.class = { $in: classIds };
      filter.isPublished = true;
    } else if (role === 'TEACHER') {
      if (studentProfileId) {
        const teacherClasses = await Class.find({ teacher: studentProfileId }).select('_id');
        filter.class = { $in: teacherClasses.map(c => c._id) };
      }
    }

    if (classId) filter.class = classId;
    if (term) filter.term = term;
    if (isPublished !== undefined && role !== 'STUDENT') filter.isPublished = isPublished === 'true';

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;

    const [exams, total] = await Promise.all([
      Exam.find(filter)
        .populate('class', 'className subject grade')
        .populate('createdBy', 'username')
        .sort({ scheduledDate: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Exam.countDocuments(filter)
    ]);

    // Enrich with question count and attempt count/status for student
    const enriched = await Promise.all(exams.map(async (exam) => {
      try {
        const [questionCount, attemptCount, myAttempt] = await Promise.all([
          Question.countDocuments({ exam: exam._id }),
          Attempt.countDocuments({ exam: exam._id }),
          (role === 'STUDENT' && studentProfileId) 
            ? Attempt.findOne({ exam: exam._id, student: studentProfileId }).lean() 
            : null
        ]);
        return { ...exam, questionCount, attemptCount, myAttempt };
      } catch (err) {
        return { ...exam, questionCount: 0, attemptCount: 0, myAttempt: null };
      }
    }));

    res.status(200).json({
      success: true,
      data: enriched,
      pagination: { currentPage: pageNum, totalPages: Math.ceil(total / limitNum), totalItems: total }
    });
  } catch (error) {
    console.error('CRITICAL: getExams Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error fetching exams', error: error.message });
  }
};

/**
 * @desc    Get single exam with questions
 * @route   GET /api/exams/:id
 */
const getExamById = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('class', 'className subject grade')
      .populate('createdBy', 'username');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const questions = await Question.find({ exam: exam._id }).sort({ questionNumber: 1 }).lean();
    const attemptCount = await Attempt.countDocuments({ exam: exam._id });

    res.status(200).json({
      success: true,
      data: { exam, questions, attemptCount }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Create exam
 * @route   POST /api/exams
 */
const createExam = async (req, res, next) => {
  try {
    const { classId, title, description, subject, term, paperType, totalMarks, passingMarks, duration, scheduledDate, endDate, startTime, endTime } = req.body;

    const classDoc = await Class.findById(classId);
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });

    const exam = await Exam.create({
      class: classId,
      title, description, subject: subject || classDoc.subject,
      term, paperType, totalMarks, passingMarks, duration,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      startTime: startTime || '', endTime: endTime || '',
      createdBy: req.user?._id || null
    });

    res.status(201).json({ success: true, message: 'Exam created', data: exam });
  } catch (error) { next(error); }
};

/**
 * @desc    Update exam
 * @route   PUT /api/exams/:id
 */
const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const fields = ['title', 'description', 'subject', 'term', 'paperType', 'totalMarks', 'passingMarks', 'duration', 'scheduledDate', 'endDate', 'startTime', 'endTime'];
    fields.forEach(f => { if (req.body[f] !== undefined) exam[f] = req.body[f]; });

    await exam.save();
    res.status(200).json({ success: true, message: 'Exam updated', data: exam });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete exam (soft)
 * @route   DELETE /api/exams/:id
 */
const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const attemptCount = await Attempt.countDocuments({ exam: exam._id });
    if (attemptCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete exam with ${attemptCount} attempt(s). Archive it instead.` });
    }

    exam.isActive = false;
    await exam.save();
    res.status(200).json({ success: true, message: 'Exam deleted' });
  } catch (error) { next(error); }
};

/**
 * @desc    Publish/unpublish exam
 * @route   PUT /api/exams/:id/publish
 */
const togglePublish = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (!exam.isPublished) {
      const qCount = await Question.countDocuments({ exam: exam._id });
      if (qCount === 0) return res.status(400).json({ success: false, message: 'Cannot publish exam with no questions' });
    }

    exam.isPublished = !exam.isPublished;
    await exam.save();
    res.status(200).json({ success: true, message: `Exam ${exam.isPublished ? 'published' : 'unpublished'}`, data: exam });
  } catch (error) { next(error); }
};

/**
 * @desc    Publish/unpublish results (teacher controlled)
 * @route   PUT /api/exams/:id/results
 */
const toggleResultsPublish = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    exam.resultsPublished = !exam.resultsPublished;
    exam.resultsPublishedAt = exam.resultsPublished ? new Date() : null;
    await exam.save();
    res.status(200).json({ success: true, message: `Results ${exam.resultsPublished ? 'published' : 'hidden'}`, data: exam });
  } catch (error) { next(error); }
};

// ─── QUESTIONS ───

/**
 * @desc    Add question to exam
 * @route   POST /api/exams/:id/questions
 */
const addQuestion = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const existingCount = await Question.countDocuments({ exam: exam._id });

    const { type, content, options, marks, lineCount, explanation } = req.body;

    const question = await Question.create({
      exam: exam._id,
      questionNumber: existingCount + 1,
      type, content, marks,
      options: type === 'MCQ' ? options : [],
      lineCount: type === 'WRITTEN' ? (lineCount || 5) : undefined,
      explanation: explanation || ''
    });

    res.status(201).json({ success: true, message: 'Question added', data: question });
  } catch (error) { next(error); }
};

/**
 * @desc    Update question
 * @route   PUT /api/exams/:examId/questions/:questionId
 */
const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findOne({ _id: req.params.questionId, exam: req.params.id });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const fields = ['content', 'options', 'marks', 'lineCount', 'explanation', 'type'];
    fields.forEach(f => { if (req.body[f] !== undefined) question[f] = req.body[f]; });

    await question.save();
    res.status(200).json({ success: true, message: 'Question updated', data: question });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete question
 * @route   DELETE /api/exams/:examId/questions/:questionId
 */
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findOneAndDelete({ _id: req.params.questionId, exam: req.params.id });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    // Re-number remaining questions
    const remaining = await Question.find({ exam: req.params.id }).sort({ questionNumber: 1 });
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].questionNumber = i + 1;
      await remaining[i].save();
    }

    res.status(200).json({ success: true, message: 'Question deleted' });
  } catch (error) { next(error); }
};

/**
 * @desc    Get exam results
 * @route   GET /api/exams/:id/results
 */
const getExamResults = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('class', 'className subject grade');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const attempts = await Attempt.find({ exam: exam._id })
      .populate('student', 'name email grade')
      .sort({ finalScore: -1 })
      .lean();

    const stats = {
      totalAttempts: attempts.length,
      graded: attempts.filter(a => a.status === 'GRADED' || a.status === 'REVIEWED').length,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      passCount: 0
    };

    const gradedAttempts = attempts.filter(a => a.finalScore != null);
    if (gradedAttempts.length > 0) {
      const scores = gradedAttempts.map(a => a.finalScore);
      stats.averageScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10;
      stats.highestScore = Math.max(...scores);
      stats.lowestScore = Math.min(...scores);
      stats.passCount = gradedAttempts.filter(a => Number(a.finalScore) >= Number(exam.passingMarks || 0)).length;
    }

    res.status(200).json({
      success: true,
      data: { exam, attempts, stats }
    });
  } catch (error) {
    console.error('CRITICAL: getExamResults Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error fetching results', error: error.message });
  }
};

/**
 * @desc    Get student marks for all exams in a class
 * @route   GET /api/exams/class/:classId/student-marks
 * @access  Private (Student)
 */
const getStudentMarks = async (req, res, next) => {
  try {
    const studentId = req.user.profileId;
    if (!studentId) return res.status(404).json({ success: false, message: 'Student profile not linked' });

    const exams = await Exam.find({ class: req.params.classId, isActive: true, isPublished: true })
      .sort({ scheduledDate: -1 })
      .lean();

    const marksData = await Promise.all(
      exams.map(async (exam) => {
        try {
          const attempt = await Attempt.findOne({ exam: exam._id, student: studentId }).lean();
          return {
            _id: exam._id,
            title: exam.title,
            term: exam.term,
            totalMarks: exam.totalMarks,
            passingMarks: exam.passingMarks,
            scheduledDate: exam.scheduledDate,
            resultsPublished: exam.resultsPublished,
            attempt: attempt ? {
              status: attempt.status,
              autoScore: attempt.autoScore,
              manualScore: attempt.manualScore,
              finalScore: attempt.finalScore,
              submittedAt: attempt.submittedAt
            } : null
          };
        } catch (err) {
          return { _id: exam._id, title: exam.title, attempt: null };
        }
      })
    );

    res.status(200).json({ success: true, data: marksData });
  } catch (error) {
    console.error('CRITICAL: getStudentMarks Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error fetching marks', error: error.message });
  }
};

module.exports = {
  getExams, getExamById, createExam, updateExam, deleteExam,
  togglePublish, toggleResultsPublish,
  addQuestion, updateQuestion, deleteQuestion,
  getExamResults, getStudentMarks
};
