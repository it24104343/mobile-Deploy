const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Teacher name is required'],
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
    subjects: [
      {
        type: String,
        trim: true
      }
    ],
    address: {
      type: String,
      trim: true,
      default: ''
    },
    profileImage: {
      type: String,
      default: ''
    },
    registrationFee: {
      type: Number,
      default: 0,
      min: [0, 'Fee cannot be negative']
    },
    paymentOption: {
      type: String,
      enum: ['PAY_NOW', 'PAY_LATER'],
      default: 'PAY_NOW'
    },
    registrationPaymentStatus: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'NOT_REQUIRED'],
      default: 'NOT_REQUIRED'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying
teacherSchema.index({ name: 'text' });
teacherSchema.index({ isActive: 1 });

module.exports = mongoose.model('Teacher', teacherSchema);
