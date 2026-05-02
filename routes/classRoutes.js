const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  assignTeacher,
  addStudents,
  removeStudents,
  getTimetable,
  getFilterOptions,
  checkTeacherAvailability,
  createExtraClass,
  toggleManualEnrollment
} = require('../controllers/classController');

// Validation rules
const classValidation = [
  body('className')
    .trim()
    .notEmpty()
    .withMessage('Class name is required')
    .isLength({ max: 100 })
    .withMessage('Class name cannot exceed 100 characters'),
  body('grade')
    .trim()
    .notEmpty()
    .withMessage('Grade is required'),
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required'),
  body('classType')
    .notEmpty()
    .withMessage('Class type is required')
    .isIn(['THEORY', 'PAPER', 'REVISION'])
    .withMessage('Class type must be THEORY, PAPER, or REVISION'),
  body('mode')
    .notEmpty()
    .withMessage('Class mode is required')
    .isIn(['PHYSICAL', 'ONLINE'])
    .withMessage('Mode must be PHYSICAL or ONLINE'),
  body('monthlyFee')
    .notEmpty()
    .withMessage('Monthly fee is required')
    .isFloat({ min: 0 })
    .withMessage('Monthly fee must be a non-negative number'),
  body('capacity')
    .notEmpty()
    .withMessage('Capacity is required')
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('startTime')
    .notEmpty()
    .withMessage('Start time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .notEmpty()
    .withMessage('End time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('dayOfWeek')
    .notEmpty()
    .withMessage('Day of week is required')
    .isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .withMessage('Invalid day of week'),
  body('teacher')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('hall')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('Invalid hall ID'),
  body('students')
    .optional()
    .isArray()
    .withMessage('Students must be an array'),
  body('students.*')
    .optional()
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('classroom')
    .optional()
    .trim(),
  body('onlineMeetingLink')
    .optional()
    .trim(),
  body('onlineMeetingDetails')
    .optional()
    .trim()
];

const updateClassValidation = [
  body('className')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Class name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Class name cannot exceed 100 characters'),
  body('grade')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Grade cannot be empty'),
  body('subject')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Subject cannot be empty'),
  body('classType')
    .optional()
    .isIn(['THEORY', 'PAPER', 'REVISION'])
    .withMessage('Class type must be THEORY, PAPER, or REVISION'),
  body('mode')
    .optional()
    .isIn(['PHYSICAL', 'ONLINE'])
    .withMessage('Mode must be PHYSICAL or ONLINE'),
  body('monthlyFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly fee must be a non-negative number'),
  body('capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('startTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('dayOfWeek')
    .optional()
    .isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .withMessage('Invalid day of week'),
  body('teacher')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      return /^[0-9a-fA-F]{24}$/.test(value);
    })
    .withMessage('Invalid teacher ID'),
  body('hall')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      return /^[0-9a-fA-F]{24}$/.test(value);
    })
    .withMessage('Invalid hall ID'),
  body('classroom')
    .optional()
    .trim(),
  body('onlineMeetingLink')
    .optional()
    .trim(),
  body('onlineMeetingDetails')
    .optional()
    .trim()
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid class ID')
];

const studentIdsValidation = [
  body('studentIds')
    .isArray({ min: 1 })
    .withMessage('Student IDs must be a non-empty array'),
  body('studentIds.*')
    .isMongoId()
    .withMessage('Invalid student ID')
];

const teacherAssignValidation = [
  body('teacherId')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      return /^[0-9a-fA-F]{24}$/.test(value);
    })
    .withMessage('Invalid teacher ID')
];

const availabilityCheckValidation = [
  body('teacherId')
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('dayOfWeek')
    .isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .withMessage('Invalid day of week'),
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('excludeClassId')
    .optional()
    .isMongoId()
    .withMessage('Invalid exclude class ID')
];

// Routes
router.use(protect);

router.get('/timetable', getTimetable);
router.get('/filter-options', getFilterOptions);
router.post('/check-availability', authorize('ADMIN', 'TEACHER'), availabilityCheckValidation, validateRequest, checkTeacherAvailability);

// Extra class creation (teachers only, no admin approval)
router.post('/extra', authorize('TEACHER'), classValidation, validateRequest, createExtraClass);

router.route('/')
  .get(getClasses)
  .post(authorize('ADMIN', 'TEACHER'), classValidation, validateRequest, createClass);

router.route('/:id')
  .get(idValidation, validateRequest, getClassById)
  .put(authorize('ADMIN', 'TEACHER'), idValidation, updateClassValidation, validateRequest, updateClass)
  .delete(authorize('ADMIN'), idValidation, validateRequest, deleteClass);

router.put('/:id/assign-teacher', authorize('ADMIN'), idValidation, teacherAssignValidation, validateRequest, assignTeacher);
router.put('/:id/add-students', authorize('ADMIN', 'TEACHER'), idValidation, studentIdsValidation, validateRequest, addStudents);
router.put('/:id/remove-students', authorize('ADMIN', 'TEACHER'), idValidation, studentIdsValidation, validateRequest, removeStudents);
router.put('/:id/toggle-enrollment', authorize('ADMIN', 'TEACHER'), idValidation, validateRequest, toggleManualEnrollment);

module.exports = router;
