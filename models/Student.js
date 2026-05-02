const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      trim: true
    },
    grade: {
      type: String,
      trim: true
    },
    parentName: {
      type: String,
      trim: true
    },
    parentPhone: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isRegistrationFeePaid: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying
studentSchema.index({ name: 'text' });
studentSchema.index({ grade: 1 });
studentSchema.index({ isActive: 1 });

module.exports = mongoose.model('Student', studentSchema);
