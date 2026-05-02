const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  markTeacherAttendance,
  getTeacherAttendance,
  getDailyAttendance,
  markBulkAttendance,
  deleteAttendanceRecord,
  deleteDayAttendance
} = require('../controllers/teacherAttendanceController');

const markValidation = [
  body('teacherId').isMongoId().withMessage('Invalid teacher ID'),
  body('classId').optional().isMongoId().withMessage('Invalid class ID'),
  body('sessionId').optional().isMongoId().withMessage('Invalid session ID'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('status').isIn(['PRESENT', 'ABSENT', 'LATE']).withMessage('Invalid status'),
  body('notes').optional().trim()
];

const bulkValidation = [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('records').isArray({ min: 1 }).withMessage('Records array required')
];

const getValidation = [
  query('teacherId').optional().isMongoId().withMessage('Invalid teacher ID'),
  query('classId').optional().isMongoId().withMessage('Invalid class ID'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date'),
  query('endDate').optional().isISO8601().withMessage('Invalid end date')
];

router.use(protect);

// Daily attendance view (all teachers for a date)
router.get('/daily', authorize('ADMIN'), getDailyAttendance);

// General filtered query
router.get('/', authorize('ADMIN', 'TEACHER'), getValidation, validateRequest, getTeacherAttendance);

// Single mark
router.post('/', authorize('ADMIN'), markValidation, validateRequest, markTeacherAttendance);

// Bulk mark for a date
router.post('/bulk', authorize('ADMIN'), bulkValidation, validateRequest, markBulkAttendance);

// Delete entire day
router.delete('/date/:date', authorize('ADMIN'), deleteDayAttendance);

// Delete single record
router.delete('/:id', authorize('ADMIN'), deleteAttendanceRecord);

module.exports = router;
