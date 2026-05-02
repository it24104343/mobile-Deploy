const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getRevenueSummary, getTeacherEarnings } = require('../controllers/revenueController');

router.use(protect);
router.use(authorize('ADMIN'));

router.get('/summary', getRevenueSummary);
router.get('/teacher-earnings', getTeacherEarnings);

module.exports = router;
