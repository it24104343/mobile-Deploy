const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { logAudit } = require('../utils/auditLogger');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// @desc    Get user's own profile
// @route   GET /api/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('profileId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // We don't want to expose passwords
    user.password = undefined;

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update user's own profile
// @route   PUT /api/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { name, email, phone, currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent email duplication
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email is already taken' });
      }
      user.email = email;
    }

    // Password Update
    if (currentPassword && newPassword) {
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Incorrect current password' });
      }
      user.password = newPassword;
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    // Update associated profile
    if (user.profileId) {
      if (user.profileModel === 'Student') {
        const student = await Student.findById(user.profileId);
        if (student) {
          if (name) student.name = name;
          if (email) student.email = email;
          if (phone !== undefined) student.phone = phone;
          await student.save();
        }
      } else if (user.profileModel === 'Teacher') {
        const teacher = await Teacher.findById(user.profileId);
        if (teacher) {
          if (name) teacher.name = name;
          if (email) teacher.email = email;
          if (phone !== undefined) teacher.phone = phone;
          await teacher.save();
        }
      }
    }

    // Re-fetch populated user
    const updatedUser = await User.findById(req.user._id).populate('profileId');
    updatedUser.password = undefined; // Hide it again

    await logAudit(req, 'PROFILE_UPDATED', req.user._id, 'User updated their personal profile');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete user's own profile
// @route   DELETE /api/profile
// @access  Private
const deleteProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete associated profile model
    if (user.profileId) {
      if (user.profileModel === 'Student') {
        await Student.findByIdAndDelete(user.profileId);
      } else if (user.profileModel === 'Teacher') {
        await Teacher.findByIdAndDelete(user.profileId);
      }
    }

    // Delete profile image if exists
    if (user.profileImage) {
      const imagePath = path.join(__dirname, '..', user.profileImage);
      if (fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (e) { console.error('Error deleting image:', e); }
      }
    }

    await User.findByIdAndDelete(user._id);
    await logAudit(req, 'PROFILE_DELETED', req.user._id, 'User permanently deleted their account');

    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete old image if it exists
    if (user.profileImage) {
      const oldImagePath = path.join(__dirname, '..', user.profileImage);
      if (fs.existsSync(oldImagePath)) {
        try { fs.unlinkSync(oldImagePath); } catch (e) { console.error('Error deleting old image:', e); }
      }
    }

    // Set the image path
    user.profileImage = `/uploads/profiles/${req.file.filename}`;
    await user.save();

    res.json({
      success: true,
      message: 'Profile image updated successfully',
      data: { profileImage: user.profileImage }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const deleteImage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.profileImage) {
      const imagePath = path.join(__dirname, '..', user.profileImage);
      if (fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (e) { console.error('Error deleting image:', e); }
      }
      user.profileImage = undefined;
      await user.save();
    }

    res.json({
      success: true,
      message: 'Profile image removed successfully'
    });
  } catch (error) {
    console.error('Error deleting profile image:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  deleteProfile,
  uploadImage,
  deleteImage
};
