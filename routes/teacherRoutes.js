const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  confirmTeacherPayment,
  exportTeachers
} = require('../controllers/teacherController');

// Validation rules
const teacherValidation = [
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
  body('subjects')
    .optional()
    .isArray()
    .withMessage('Subjects must be an array')
];

const updateTeacherValidation = [
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
  body('subjects')
    .optional()
    .isArray()
    .withMessage('Subjects must be an array')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid teacher ID')
];

// Routes
router.use(protect); // All routes below require authentication

router.get('/export', authorize('ADMIN'), exportTeachers);

router.route('/')
  .get(authorize('ADMIN', 'TEACHER', 'STUDENT'), getTeachers)
  .post(authorize('ADMIN'), teacherValidation, validateRequest, createTeacher);

router.route('/:id')
  .get(authorize('ADMIN', 'TEACHER', 'STUDENT'), idValidation, validateRequest, getTeacherById)
  .put(authorize('ADMIN'), idValidation, updateTeacherValidation, validateRequest, updateTeacher)
  .delete(authorize('ADMIN'), idValidation, validateRequest, deleteTeacher);

router.put('/:id/confirm-payment', authorize('ADMIN'), idValidation, validateRequest, confirmTeacherPayment);

module.exports = router;
