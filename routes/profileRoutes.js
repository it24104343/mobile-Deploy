const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');
const {
  getProfile,
  updateProfile,
  deleteProfile,
  uploadImage,
  deleteImage
} = require('../controllers/profileController');

router.use(protect);

router.route('/')
  .get(getProfile)
  .put(updateProfile)
  .delete(deleteProfile);

router.route('/image')
  .post(upload.single('profileImage'), uploadImage)
  .delete(deleteImage);

module.exports = router;
