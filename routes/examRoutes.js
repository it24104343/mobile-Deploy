const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getExams, getExamById, createExam, updateExam, deleteExam,
  togglePublish, toggleResultsPublish,
  addQuestion, updateQuestion, deleteQuestion,
  getExamResults, getStudentMarks
} = require('../controllers/examController');
const { startAttempt, submitAttempt, getAttempt, gradeAttempt } = require('../controllers/attemptController');

const idVal = [param('id').isMongoId().withMessage('Invalid exam ID')];

const createExamVal = [
  body('classId').isMongoId().withMessage('Invalid class ID'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('totalMarks').isInt({ min: 1 }).withMessage('Total marks must be at least 1'),
  body('paperType').optional().isIn(['MCQ', 'WRITTEN', 'MIXED']),
  body('term').optional().isIn(['TERM_1', 'TERM_2', 'TERM_3', 'MID_TERM', 'FINAL', 'QUIZ', 'OTHER']),
  body('duration').optional().isInt({ min: 1 }),
  body('passingMarks').optional().isInt({ min: 0 })
];

const addQuestionVal = [
  body('type').isIn(['MCQ', 'WRITTEN']).withMessage('Type must be MCQ or WRITTEN'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('marks').isFloat({ min: 0.5 }).withMessage('Marks must be at least 0.5')
];

router.use(protect);

// Exams
router.get('/', getExams);
router.get('/:id', idVal, validateRequest, getExamById);
router.post('/', authorize('ADMIN', 'TEACHER'), createExamVal, validateRequest, createExam);
router.put('/:id', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, updateExam);
router.delete('/:id', authorize('ADMIN'), idVal, validateRequest, deleteExam);
router.put('/:id/publish', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, togglePublish);
router.put('/:id/results', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, toggleResultsPublish);
router.get('/:id/results', authorize('ADMIN', 'TEACHER', 'PAPER_PANEL'), idVal, validateRequest, getExamResults);

// Student marks
router.get('/class/:classId/student-marks', authorize('STUDENT'), getStudentMarks);

// Questions
router.post('/:id/questions', authorize('ADMIN', 'TEACHER'), idVal, addQuestionVal, validateRequest, addQuestion);
router.put('/:id/questions/:questionId', authorize('ADMIN', 'TEACHER'), updateQuestion);
router.delete('/:id/questions/:questionId', authorize('ADMIN', 'TEACHER'), deleteQuestion);

// Attempts
router.post('/:examId/attempt', authorize('ADMIN', 'TEACHER', 'STUDENT'), startAttempt);
router.put('/:examId/attempt/submit', authorize('ADMIN', 'TEACHER', 'STUDENT'), submitAttempt);
router.get('/:examId/attempt/:studentId', authorize('ADMIN', 'TEACHER', 'PAPER_PANEL', 'STUDENT'), getAttempt);
router.put('/:examId/attempt/:studentId/grade', authorize('ADMIN', 'TEACHER', 'PAPER_PANEL'), gradeAttempt);

module.exports = router;
