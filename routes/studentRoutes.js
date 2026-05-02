const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getGrades,
  payRegistrationFee,
  exportStudents
} = require('../controllers/studentController');

// Validation rules
const studentValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('phone')
    .optional()
    .trim(),
  body('grade')
    .optional()
    .trim(),
  body('parentName')
    .optional()
    .trim(),
  body('parentPhone')
    .optional()
    .trim()
];

const updateStudentValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('phone')
    .optional()
    .trim(),
  body('grade')
    .optional()
    .trim(),
  body('parentName')
    .optional()
    .trim(),
  body('parentPhone')
    .optional()
    .trim()
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid student ID')
];

// Routes
router.use(protect); // All routes below require authentication

router.get('/grades', getGrades);
router.get('/export', authorize('ADMIN'), exportStudents);

router.route('/')
  .get(getStudents)
  .post(authorize('ADMIN'), studentValidation, validateRequest, createStudent);

router.route('/:id')
  .get(idValidation, validateRequest, getStudentById)
  .put(authorize('ADMIN', 'TEACHER'), idValidation, updateStudentValidation, validateRequest, updateStudent)
  .delete(authorize('ADMIN'), idValidation, validateRequest, deleteStudent);

router.put('/:id/pay-registration', authorize('ADMIN'), idValidation, validateRequest, payRegistrationFee);

module.exports = router;
