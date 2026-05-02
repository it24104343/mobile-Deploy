const mongoose = require('mongoose');

const manualMarkEntrySchema = new mongoose.Schema(
  {
    attempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attempt',
      required: [true, 'Attempt is required']
    },
    panelMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Panel member is required']
    },
    questionMarks: [{
      question: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true
      },
      marks: {
        type: Number,
        required: true,
        min: 0
      },
      feedback: {
        type: String,
        trim: true,
        default: ''
      }
    }],
    totalMarks: {
      type: Number,
      default: 0
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
      default: 'DRAFT'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

manualMarkEntrySchema.index({ attempt: 1, panelMember: 1 });

module.exports = mongoose.model('ManualMarkEntry', manualMarkEntrySchema);
