const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  exportUsers
} = require('../controllers/userController');

// All user management routes are restricted to ADMIN only
router.use(protect);
router.use(authorize('ADMIN'));

router.get('/export', exportUsers); // This needs to be before /:id

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/:id')
  .put(updateUser)
  .delete(deleteUser);

module.exports = router;
