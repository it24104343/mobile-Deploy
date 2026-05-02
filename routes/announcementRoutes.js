const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement
} = require('../controllers/classAnnouncementController');

const idVal = [param('id').isMongoId().withMessage('Invalid announcement ID')];

const createVal = [
  body('classId').isMongoId().withMessage('Invalid class ID'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
];

router.use(protect);

router.get('/', getAnnouncements);
router.post('/', authorize('ADMIN', 'TEACHER'), createVal, validateRequest, createAnnouncement);
router.put('/:id', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, updateAnnouncement);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, deleteAnnouncement);

module.exports = router;
