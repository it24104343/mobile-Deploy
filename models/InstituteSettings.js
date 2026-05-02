const mongoose = require('mongoose');

const revenueConfigSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  instituteRetainedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: true });

const instituteSettingsSchema = new mongoose.Schema(
  {
    admissionFee: {
      type: Number,
      default: 0,
      min: [0, 'Admission fee cannot be negative']
    },
    attendanceThresholdPercent: {
      type: Number,
      default: 75,
      min: [0, 'Threshold cannot be negative'],
      max: [100, 'Threshold cannot exceed 100']
    },
    allowTeacherThresholdOverride: {
      type: Boolean,
      default: false
    },
    instituteName: {
      type: String,
      trim: true,
      default: 'Tuition Institute'
    },
    contactEmail: {
      type: String,
      trim: true,
      default: ''
    },
    contactPhone: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    revenueConfigs: [revenueConfigSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('InstituteSettings', instituteSettingsSchema);
