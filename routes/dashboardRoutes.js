const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getAdminDashboard, getTeacherDashboard, getStudentDashboard } = require('../controllers/dashboardController');

router.use(protect);

router.get('/admin', authorize('ADMIN'), getAdminDashboard);
router.get('/teacher', authorize('ADMIN', 'TEACHER'), getTeacherDashboard);
router.get('/student', authorize('ADMIN', 'STUDENT'), getStudentDashboard);

module.exports = router;
