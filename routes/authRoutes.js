const express = require('express');
const {
  login,
  register,
  firstLoginReset,
  requestOtp,
  verifyOtp,
  resetPassword,
  createAdmin,
  demoLogin
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/demo-login', demoLogin);
router.post('/first-login-reset', protect, firstLoginReset);
router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

router.post('/demo-admin', createAdmin);

module.exports = router;
