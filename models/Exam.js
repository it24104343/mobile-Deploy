const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true
    },
    term: {
      type: String,
      enum: ['TERM_1', 'TERM_2', 'TERM_3', 'MID_TERM', 'FINAL', 'QUIZ', 'OTHER'],
      default: 'OTHER'
    },
    paperType: {
      type: String,
      enum: ['MCQ', 'WRITTEN', 'MIXED'],
      default: 'MIXED'
    },
    totalMarks: {
      type: Number,
      required: [true, 'Total marks is required'],
      min: [1, 'Total marks must be at least 1']
    },
    passingMarks: {
      type: Number,
      default: 0,
      min: 0
    },
    duration: {
      type: Number,
      default: 60,
      min: [1, 'Duration must be at least 1 minute']
    },
    scheduledDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    },
    startTime: {
      type: String,
      default: ''
    },
    endTime: {
      type: String,
      default: ''
    },
    isPublished: {
      type: Boolean,
      default: false
    },
    resultsPublished: {
      type: Boolean,
      default: false
    },
    resultsPublishedAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
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

examSchema.index({ class: 1, isActive: 1 });
examSchema.index({ isPublished: 1, scheduledDate: -1 });

module.exports = mongoose.model('Exam', examSchema);
