const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendWelcomeEmail } = require('../utils/emailService');
const { logAudit } = require('../utils/auditLogger');
const { format } = require('fast-csv');

// @desc    Get all users (with pagination, search, and filtering)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, role, status } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (status) query.status = status;

    // To search by name (if applicable), we might need to populate or search in profiles if name is required.
    // However, User model doesn't have a 'name' field, it has 'username' and 'email'. Let's adjust search logic:
    let baseQuery = {};
    if (search) {
      baseQuery.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) baseQuery.role = role;
    if (status) baseQuery.status = status;


    const usersQuery = User.find(baseQuery)
      .populate('profileId', 'name phone subjects grade')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(baseQuery);
    const users = await usersQuery;

    res.json({
      success: true,
      data: users,
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });

  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Create a new user (with optional profile linkage)
// @route   POST /api/users
// @access  Private/Admin
const createUser = async (req, res) => {
  try {
    const { email, role, name, phone, grade, subjects, parentName, parentPhone } = req.body;

    if (!email || !role || !name) {
      return res.status(400).json({ success: false, message: 'Email, Role, and Name are required' });
    }

    // Validate name is English letters, spaces, and basic punctuation only
    if (!/^[A-Za-z\s.'-]+$/.test(name)) {
      return res.status(400).json({ success: false, message: 'Name must contain only English letters' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Generate credentials
    const username = name.toLowerCase().replace(/[^a-z]/g, '') + Math.floor(1000 + Math.random() * 9000);
    const temporaryPassword = crypto.randomBytes(4).toString('hex');

    let profileId = null;
    let profileModel = null;

    // If role implies a specific profile, create it first
    if (role === 'STUDENT') {
      // Drop stale studentId index if it exists
      try {
        const indexes = await Student.collection.indexes();
        const hasStaleIndex = indexes.some(idx => idx.name === 'studentId_1');
        if (hasStaleIndex) {
          await Student.collection.dropIndex('studentId_1');
        }
      } catch (idxErr) { /* index may not exist, ignore */ }

      const student = await Student.create({
        name, email, phone: phone || '',
        grade: grade || '',
        parentName: parentName || '',
        parentPhone: parentPhone || ''
      });
      profileId = student._id;
      profileModel = 'Student';
    } else if (role === 'TEACHER') {
      const teacher = await Teacher.create({
        name, email, phone: phone || '',
        subjects: subjects || []
      });
      profileId = teacher._id;
      profileModel = 'Teacher';
    }

    // Create the User
    const user = await User.create({
      username,
      email,
      password: temporaryPassword,
      role,
      profileId,
      profileModel,
      isFirstLogin: true,
      status: 'active'
    });

    try {
      await logAudit(req, 'USER_CREATION', req.user._id, JSON.stringify({ targetUserId: user._id, role }));
    } catch {}
    try {
      await sendWelcomeEmail(email, name, username, temporaryPassword);
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr.message);
    }

    res.status(201).json({ success: true, data: user, message: 'User created successfully' });

  } catch (err) {
    console.error('Error creating user:', err);
    // Handle duplicate key errors gracefully
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(400).json({ success: false, message: `Duplicate value for ${field}. Please try again.` });
    }
    res.status(500).json({ success: false, message: err.message || 'Server Error' });
  }
};

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const { username, email, role, status } = req.body;

    let user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email is already taken by another user' });
      }
    }

    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        return res.status(400).json({ success: false, message: 'Username is already taken by another user' });
      }
    }

    user.username = username || user.username;
    user.email = email || user.email;
    user.role = role || user.role;
    user.status = status || user.status;

    await user.save();

    await logAudit(req, 'USER_UPDATED', req.user._id, JSON.stringify({ targetUserId: user._id, updates: { username, email, role, status } }));

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Optional: Also delete associated profile (Student/Teacher)
    if (user.profileModel === 'Student' && user.profileId) {
      await Student.findByIdAndDelete(user.profileId);
    } else if (user.profileModel === 'Teacher' && user.profileId) {
      await Teacher.findByIdAndDelete(user.profileId);
    }

    await User.findByIdAndDelete(req.params.id);

    await logAudit(req, 'USER_DELETED', req.user._id, JSON.stringify({ targetUserId: req.params.id }));

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Export users to CSV
// @route   GET /api/users/export
// @access  Private/Admin
const exportUsers = async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role.split(',');
    if (status) query.status = status;

    const users = await User.find(query)
      .populate('profileId', 'name phone')
      .sort({ createdAt: -1 });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    users.forEach(user => {
      csvStream.write({
        ID: user._id.toString(),
        Username: user.username,
        Email: user.email,
        Role: user.role,
        Status: user.status,
        Name: user.profileId ? user.profileId.name : '-',
        Phone: user.profileId ? user.profileId.phone : '-',
        CreatedAt: user.createdAt.toISOString()
      });
    });

    csvStream.end();

  } catch (err) {
    console.error('Error exporting users:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  exportUsers
};
