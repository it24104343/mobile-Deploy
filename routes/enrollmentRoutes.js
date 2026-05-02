const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getEnrollments,
  getStudentEnrollments,
  getClassEnrollments,
  createEnrollment,
  unenrollStudent,
  updateEnrollment,
  bulkEnroll,
  studentSelfEnroll
} = require('../controllers/enrollmentController');

const enrollValidation = [
  body('studentId')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('classId')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('payAdmissionFee')
    .optional()
    .isBoolean()
    .withMessage('payAdmissionFee must be a boolean'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const selfEnrollValidation = [
  body('classId')
    .isMongoId()
    .withMessage('Invalid class ID')
];

const bulkEnrollValidation = [
  body('studentIds')
    .isArray({ min: 1 })
    .withMessage('Student IDs must be a non-empty array'),
  body('studentIds.*')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('classId')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('payAdmissionFee')
    .optional()
    .isBoolean()
    .withMessage('payAdmissionFee must be a boolean')
];

const idValidation = [
  param('id').isMongoId().withMessage('Invalid enrollment ID')
];

const studentIdValidation = [
  param('studentId').isMongoId().withMessage('Invalid student ID')
];

const classIdValidation = [
  param('classId').isMongoId().withMessage('Invalid class ID')
];

router.use(protect);

router.get('/', authorize('ADMIN', 'TEACHER'), getEnrollments);
router.get('/student/:studentId', studentIdValidation, validateRequest, getStudentEnrollments);
router.get('/class/:classId', classIdValidation, validateRequest, getClassEnrollments);

router.post('/', authorize('ADMIN', 'TEACHER'), enrollValidation, validateRequest, createEnrollment);
router.post('/self-enroll', authorize('STUDENT'), selfEnrollValidation, validateRequest, studentSelfEnroll);
router.post('/bulk', authorize('ADMIN'), bulkEnrollValidation, validateRequest, bulkEnroll);

router.put('/:id/unenroll', authorize('ADMIN'), idValidation, validateRequest, unenrollStudent);
router.put('/:id', authorize('ADMIN'), idValidation, validateRequest, updateEnrollment);

module.exports = router;
