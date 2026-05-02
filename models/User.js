const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['ADMIN', 'TEACHER', 'STUDENT', 'PAPER_PANEL'],
    required: true
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'profileModel',
    required: false // Admin might not have a profile, or they could all be linked
  },
  profileModel: {
    type: String,
    required: false,
    enum: ['Student', 'Teacher']
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String,
    default: ''
  },
  resetOtp: {
    type: String,
    select: false
  },
  resetOtpExpires: {
    type: Date,
    select: false
  },
  pendingRegistrationPayment: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active'
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to verify password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);
