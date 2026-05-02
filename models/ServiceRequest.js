const mongoose = require('mongoose');

const serviceRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required']
    },
    type: {
      type: String,
      enum: ['CERTIFICATE', 'ID_CARD_REISSUE', 'SCHEDULE_CHANGE', 'FEE_INQUIRY', 'COMPLAINT', 'LEAVE', 'OTHER'],
      required: [true, 'Request type is required']
    },
    recipient: {
      type: String,
      enum: ['ADMIN', 'TEACHER'],
      default: 'ADMIN'
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null
    },
    targetTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'APPROVED', 'RESOLVED', 'REJECTED'],
      default: 'PENDING'
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH'],
      default: 'NORMAL'
    },
    requestDate: {
      type: Date,
      default: null
    },
    adminNotes: {
      type: String,
      trim: true,
      default: ''
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

serviceRequestSchema.index({ student: 1, status: 1 });
serviceRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
