const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      maxlength: [100, 'Class name cannot exceed 100 characters']
    },
    grade: {
      type: String,
      required: [true, 'Grade is required'],
      trim: true
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true
    },
    classType: {
      type: String,
      required: [true, 'Class type is required'],
      enum: {
        values: ['THEORY', 'PAPER', 'REVISION'],
        message: '{VALUE} is not a valid class type'
      }
    },
    mode: {
      type: String,
      required: [true, 'Class mode is required'],
      enum: {
        values: ['PHYSICAL', 'ONLINE'],
        message: '{VALUE} is not a valid class mode'
      }
    },
    monthlyFee: {
      type: Number,
      required: [true, 'Monthly fee is required'],
      min: [0, 'Monthly fee cannot be negative']
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      default: null
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
      }
    ],
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Capacity must be an integer'
      }
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required']
    },
    endTime: {
      type: String,
      required: [true, 'End time is required']
    },
    dayOfWeek: {
      type: String,
      required: [true, 'Day of week is required'],
      enum: {
        values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        message: '{VALUE} is not a valid day'
      }
    },
    // Hall reference (required for PHYSICAL, not for ONLINE)
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hall',
      default: null
    },
    // Keep classroom as a fallback/label field
    classroom: {
      type: String,
      trim: true,
      default: ''
    },
    // Online class fields
    onlineMeetingLink: {
      type: String,
      trim: true,
      default: ''
    },
    onlineMeetingDetails: {
      type: String,
      trim: true,
      default: ''
    },
    recordingLink: {
      type: String,
      trim: true,
      default: ''
    },
    // Extra class support
    isExtraClass: {
      type: Boolean,
      default: false
    },
    parentClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null
    },
    extraClassDate: {
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
    },
    allowManualEnrollment: {
      type: Boolean,
      default: true
    },
    targetMonth: {
      type: String,
      enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      required: [true, 'Target month is required']
    },
    targetYear: {
      type: Number,
      required: [true, 'Target year is required']
    },
    paymentRequiredFromWeek: {
      type: Number,
      min: 1,
      max: 5,
      default: 2,
      required: [true, 'Payment required from week is required']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for enrolled student count
classSchema.virtual('enrolledCount').get(function () {
  return this.students ? this.students.length : 0;
});

// Virtual for remaining seats
classSchema.virtual('remainingSeats').get(function () {
  return this.capacity - (this.students ? this.students.length : 0);
});

// Indexes
classSchema.index({ grade: 1, subject: 1 });
classSchema.index({ teacher: 1, dayOfWeek: 1 });
classSchema.index({ isActive: 1 });
classSchema.index({ classType: 1 });
classSchema.index({ mode: 1 });
classSchema.index({ hall: 1, dayOfWeek: 1 });
classSchema.index({ createdAt: -1 });  // For sorting
classSchema.index({ isActive: 1, createdAt: -1 });  // Compound for dashboard

// Pre-save validation
classSchema.pre('save', function (next) {
  // Time validation
  if (this.startTime && this.endTime) {
    const start = this.startTime.replace(':', '');
    const end = this.endTime.replace(':', '');
    if (parseInt(start) >= parseInt(end)) {
      const error = new Error('End time must be after start time');
      error.statusCode = 400;
      return next(error);
    }
  }

  // Physical classes must have a hall
  if (this.mode === 'PHYSICAL' && !this.hall && !this.classroom) {
    const error = new Error('Physical classes must have a hall or classroom assigned');
    error.statusCode = 400;
    return next(error);
  }

  next();
});

// Static method to check for teacher time conflict
classSchema.statics.checkTeacherConflict = async function (teacherId, dayOfWeek, startTime, endTime, excludeClassId = null) {
  if (!teacherId) return null;

  const query = {
    teacher: teacherId,
    dayOfWeek: dayOfWeek,
    isActive: true
  };

  if (excludeClassId) {
    query._id = { $ne: excludeClassId };
  }

  const conflictingClasses = await this.find(query);

  for (const existingClass of conflictingClasses) {
    const newStart = parseInt(startTime.replace(':', ''));
    const newEnd = parseInt(endTime.replace(':', ''));
    const existingStart = parseInt(existingClass.startTime.replace(':', ''));
    const existingEnd = parseInt(existingClass.endTime.replace(':', ''));

    if (newStart < existingEnd && newEnd > existingStart) {
      return existingClass;
    }
  }

  return null;
};

// Static method to check for hall time conflict
classSchema.statics.checkHallConflict = async function (hallId, dayOfWeek, startTime, endTime, excludeClassId = null) {
  if (!hallId) return null;

  const query = {
    hall: hallId,
    dayOfWeek: dayOfWeek,
    isActive: true
  };

  if (excludeClassId) {
    query._id = { $ne: excludeClassId };
  }

  const conflictingClasses = await this.find(query);

  for (const existingClass of conflictingClasses) {
    const newStart = parseInt(startTime.replace(':', ''));
    const newEnd = parseInt(endTime.replace(':', ''));
    const existingStart = parseInt(existingClass.startTime.replace(':', ''));
    const existingEnd = parseInt(existingClass.endTime.replace(':', ''));

    if (newStart < existingEnd && newEnd > existingStart) {
      return existingClass;
    }
  }

  return null;
};

// Static method to check capacity
classSchema.statics.checkCapacity = async function (classId, additionalStudentsCount = 1) {
  const classDoc = await this.findById(classId);
  if (!classDoc) {
    throw new Error('Class not found');
  }

  const currentEnrolled = classDoc.students ? classDoc.students.length : 0;
  const newTotal = currentEnrolled + additionalStudentsCount;

  return {
    hasCapacity: newTotal <= classDoc.capacity,
    currentEnrolled,
    capacity: classDoc.capacity,
    remainingSeats: classDoc.capacity - currentEnrolled
  };
};

module.exports = mongoose.model('Class', classSchema);
