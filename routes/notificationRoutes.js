const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getNotifications, getNotificationById, createNotification, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications
} = require('../controllers/notificationController');

router.use(protect);

router.get('/', getNotifications);
router.get('/:id', [param('id').isMongoId()], validateRequest, getNotificationById);
router.post('/', authorize('ADMIN', 'TEACHER'),
  [body('title').trim().notEmpty(), body('content').trim().notEmpty()],
  validateRequest, createNotification);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', [param('id').isMongoId()], validateRequest, markAsRead);
router.delete('/delete-all', deleteAllNotifications);
router.delete('/:id', [param('id').isMongoId()], validateRequest, deleteNotification);

module.exports = router;
