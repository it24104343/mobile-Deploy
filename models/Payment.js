const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentType: {
      type: String,
      enum: ['CLASS_FEE', 'TEACHER_REGISTRATION', 'TEACHER_SALARY'],
      default: 'CLASS_FEE'
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: false
    },
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      required: function() { return this.paymentType === 'CLASS_FEE'; }
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: function() { return this.paymentType === 'CLASS_FEE'; }
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: function() { return this.paymentType === 'CLASS_FEE'; }
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    month: {
      type: Number,
      required: function() { return ['CLASS_FEE', 'TEACHER_SALARY'].includes(this.paymentType); },
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: function() { return ['CLASS_FEE', 'TEACHER_SALARY'].includes(this.paymentType); },
      min: 2020
    },
    paymentMethod: {
      type: String,
      enum: ['GATEWAY', 'CARD', 'CASH', 'BANK_TRANSFER', 'MANUAL'],
      default: 'CARD'
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },
    gatewayRef: {
      type: String,
      trim: true,
      default: ''
    },
    paidAt: {
      type: Date,
      default: null
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    receiptUrl: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Ensure one payment per enrollment per month/year (only for CLASS_FEE)
paymentSchema.index(
  { enrollment: 1, month: 1, year: 1 },
  { unique: true, partialFilterExpression: { paymentType: 'CLASS_FEE', enrollment: { $exists: true } } }
);
paymentSchema.index({ student: 1, status: 1 });
paymentSchema.index({ class: 1, month: 1, year: 1 });
paymentSchema.index({ status: 1, paidAt: -1 });
paymentSchema.index({ createdAt: -1 });  // For sorting
paymentSchema.index({ status: 1, createdAt: -1 });  // Compound for dashboard

module.exports = mongoose.model('Payment', paymentSchema);
