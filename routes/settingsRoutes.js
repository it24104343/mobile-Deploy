const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getSettings,
  updateSettings,
  updateRevenueConfig,
  deleteRevenueConfig
} = require('../controllers/settingsController');

const updateSettingsValidation = [
  body('admissionFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Admission fee must be non-negative'),
  body('attendanceThresholdPercent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Threshold must be between 0 and 100'),
  body('allowTeacherThresholdOverride')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean'),
  body('instituteName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Institute name cannot be empty'),
  body('contactEmail')
    .optional()
    .trim(),
  body('contactPhone')
    .optional()
    .trim(),
  body('address')
    .optional()
    .trim()
];

const revenueConfigValidation = [
  body('classId')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('instituteRetainedAmount')
    .isFloat({ min: 0 })
    .withMessage('Retained amount must be non-negative'),
  body('notes')
    .optional()
    .trim()
];

const classIdValidation = [
  param('classId').isMongoId().withMessage('Invalid class ID')
];

router.use(protect);

router.get('/', getSettings);
router.put('/', authorize('ADMIN'), updateSettingsValidation, validateRequest, updateSettings);
router.put('/revenue-config', authorize('ADMIN'), revenueConfigValidation, validateRequest, updateRevenueConfig);
router.delete('/revenue-config/:classId', authorize('ADMIN'), classIdValidation, validateRequest, deleteRevenueConfig);

module.exports = router;
