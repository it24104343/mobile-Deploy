const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  selectedOption: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  writtenAnswer: {
    type: String,
    trim: true,
    default: ''
  },
  marksAwarded: {
    type: Number,
    default: null
  },
  feedback: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: true });

const attemptSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required']
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam is required']
    },
    answers: [answerSchema],
    autoScore: {
      type: Number,
      default: 0
    },
    manualScore: {
      type: Number,
      default: null
    },
    finalScore: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'SUBMITTED', 'GRADED', 'REVIEWED'],
      default: 'IN_PROGRESS'
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    submittedAt: {
      type: Date,
      default: null
    },
    gradedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// One attempt per student per exam
attemptSchema.index({ student: 1, exam: 1 }, { unique: true });
attemptSchema.index({ exam: 1, status: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
