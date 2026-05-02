const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['SYSTEM', 'MANUAL', 'ATTENDANCE', 'PAYMENT', 'EXAM', 'ANNOUNCEMENT'],
      default: 'SYSTEM'
    },
    category: {
      type: String,
      enum: ['INFO', 'WARNING', 'ALERT', 'REMINDER', 'SUCCESS'],
      default: 'INFO'
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      trim: true
    },
    targetRole: {
      type: String,
      enum: ['ALL', 'ADMIN', 'TEACHER', 'STUDENT', 'PAPER_PANEL'],
      default: 'ALL'
    },
    targetUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    targetClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    readBy: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      readAt: { type: Date, default: Date.now }
    }],
    deletedBy: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      deletedAt: { type: Date, default: Date.now }
    }],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ targetRole: 1, isActive: 1, createdAt: -1 });
notificationSchema.index({ 'readBy.user': 1 });

module.exports = mongoose.model('Notification', notificationSchema);
