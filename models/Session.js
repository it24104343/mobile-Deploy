const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    date: {
      type: Date,
      required: [true, 'Session date is required']
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required']
    },
    endTime: {
      type: String,
      required: [true, 'End time is required']
    },
    topic: {
      type: String,
      trim: true,
      default: ''
    },
    chapterName: {
      type: String,
      trim: true,
      default: ''
    },
    documentUrl: {
      type: String,
      trim: true,
      default: ''
    },
    documentName: {
      type: String,
      trim: true,
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    conductedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
      default: 'SCHEDULED'
    },
    isExtraSession: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

sessionSchema.index({ class: 1, date: 1 });
sessionSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('Session', sessionSchema);
