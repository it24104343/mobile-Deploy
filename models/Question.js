const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: true });

const questionSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam is required']
    },
    questionNumber: {
      type: Number,
      required: [true, 'Question number is required'],
      min: 1
    },
    type: {
      type: String,
      enum: ['MCQ', 'WRITTEN'],
      required: [true, 'Question type is required']
    },
    content: {
      type: String,
      required: [true, 'Question content is required'],
      trim: true
    },
    options: [optionSchema],
    marks: {
      type: Number,
      required: [true, 'Marks is required'],
      min: [0.5, 'Marks must be at least 0.5']
    },
    lineCount: {
      type: Number,
      default: 5,
      min: 1
    },
    explanation: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

questionSchema.index({ exam: 1, questionNumber: 1 });

module.exports = mongoose.model('Question', questionSchema);
