const mongoose = require('mongoose');

const classAnnouncementSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required']
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      trim: true
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
      default: 'NORMAL'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    week: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

classAnnouncementSchema.index({ class: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('ClassAnnouncement', classAnnouncementSchema);
