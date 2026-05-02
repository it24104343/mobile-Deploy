const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getHalls,
  getHallById,
  createHall,
  updateHall,
  deleteHall,
  checkHallAvailability,
  getHallSchedule,
  getWeeklyAvailability
} = require('../controllers/hallController');

// Validation rules
const hallValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Hall name is required')
    .isLength({ max: 100 })
    .withMessage('Hall name cannot exceed 100 characters'),
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Hall code is required')
    .isLength({ max: 20 })
    .withMessage('Hall code cannot exceed 20 characters'),
  body('capacity')
    .notEmpty()
    .withMessage('Capacity is required')
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('resources')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Resources cannot exceed 500 characters')
];

const updateHallValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Hall name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Hall name cannot exceed 100 characters'),
  body('code')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Hall code cannot be empty')
    .isLength({ max: 20 })
    .withMessage('Hall code cannot exceed 20 characters'),
  body('capacity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Capacity must be a positive integer'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('resources')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Resources cannot exceed 500 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid hall ID')
];

const availabilityCheckValidation = [
  body('hallId')
    .isMongoId()
    .withMessage('Invalid hall ID'),
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

// All routes require authentication
router.use(protect);

// Hall availability check
router.post('/check-availability', availabilityCheckValidation, validateRequest, checkHallAvailability);

// Weekly availability for all halls
router.get('/weekly-availability', getWeeklyAvailability);

// Hall schedule
router.get('/:id/schedule', idValidation, validateRequest, getHallSchedule);

// CRUD routes
router.route('/')
  .get(getHalls)
  .post(authorize('ADMIN'), hallValidation, validateRequest, createHall);

router.route('/:id')
  .get(idValidation, validateRequest, getHallById)
  .put(authorize('ADMIN'), idValidation, updateHallValidation, validateRequest, updateHall)
  .delete(authorize('ADMIN'), idValidation, validateRequest, deleteHall);

module.exports = router;
