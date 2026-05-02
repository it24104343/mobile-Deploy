const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  createSession,
  getSessions,
  getSessionAttendance,
  markAttendance,
  updateSession,
  cancelSession,
  getStudentAttendanceReport,
  getClassAttendanceReport
} = require('../controllers/attendanceController');

const createSessionValidation = [
  body('classId')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('date')
    .isISO8601()
    .withMessage('Valid date is required'),
  body('startTime')
    .optional()
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .optional()
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('End time must be in HH:MM format'),
  body('topic')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Topic cannot exceed 200 characters'),
  body('notes')
    .optional()
    .trim(),
  body('isExtraSession')
    .optional()
    .isBoolean()
];

const markAttendanceValidation = [
  param('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID'),
  body('records')
    .isArray({ min: 1 })
    .withMessage('Records must be a non-empty array'),
  body('records.*.studentId')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('records.*.status')
    .isIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
    .withMessage('Status must be PRESENT, ABSENT, LATE, or EXCUSED')
];

const sessionIdValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID')
];

const studentIdValidation = [
  param('studentId').isMongoId().withMessage('Invalid student ID')
];

const classIdValidation = [
  param('classId').isMongoId().withMessage('Invalid class ID')
];

router.use(protect);

// Sessions
router.get('/sessions', getSessions);
router.post('/sessions', authorize('ADMIN', 'TEACHER'), createSessionValidation, validateRequest, createSession);
router.get('/sessions/:sessionId', sessionIdValidation, validateRequest, getSessionAttendance);
router.put('/sessions/:sessionId', authorize('ADMIN', 'TEACHER'), sessionIdValidation, validateRequest, updateSession);
router.delete('/sessions/:sessionId', authorize('ADMIN', 'TEACHER'), sessionIdValidation, validateRequest, cancelSession);

// Mark attendance
router.put('/sessions/:sessionId/mark', authorize('ADMIN', 'TEACHER'), markAttendanceValidation, validateRequest, markAttendance);

// Reports
router.get('/report/student/:studentId', studentIdValidation, validateRequest, getStudentAttendanceReport);
router.get('/report/class/:classId', classIdValidation, validateRequest, getClassAttendanceReport);

module.exports = router;
