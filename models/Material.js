const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    type: {
      type: String,
      enum: ['NOTE', 'SLIDE', 'VIDEO', 'LINK', 'DOCUMENT', 'RECORDING', 'OTHER'],
      default: 'DOCUMENT'
    },
    fileUrl: {
      type: String,
      trim: true,
      default: ''
    },
    fileName: {
      type: String,
      trim: true,
      default: ''
    },
    externalLink: {
      type: String,
      trim: true,
      default: ''
    },
    week: {
      type: Number,
      default: null
    },
    month: {
      type: Number,
      min: 1,
      max: 12,
      default: null
    },
    year: {
      type: Number,
      default: null
    },
    uploadedBy: {
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

materialSchema.index({ class: 1, isActive: 1, createdAt: -1 });
materialSchema.index({ class: 1, type: 1 });

module.exports = mongoose.model('Material', materialSchema);
