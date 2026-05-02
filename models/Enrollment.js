const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required']
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    admissionFeePaid: {
      type: Boolean,
      default: false
    },
    admissionFeeAmount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Ensure unique enrollment per student-class pair
enrollmentSchema.index({ student: 1, class: 1 }, { unique: true });
enrollmentSchema.index({ student: 1, isActive: 1 });
enrollmentSchema.index({ class: 1, isActive: 1 });
enrollmentSchema.index({ createdAt: -1 });  // For sorting
enrollmentSchema.index({ isActive: 1, createdAt: -1 });  // Compound for dashboard

module.exports = mongoose.model('Enrollment', enrollmentSchema);
