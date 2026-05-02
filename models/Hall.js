const mongoose = require('mongoose');

const hallSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hall name is required'],
      trim: true,
      maxlength: [100, 'Hall name cannot exceed 100 characters']
    },
    code: {
      type: String,
      required: [true, 'Hall code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Hall code cannot exceed 20 characters']
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Capacity must be an integer'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    pricePerHour: {
      type: Number,
      required: [true, 'Price per hour is required'],
      min: [0, 'Price per hour cannot be negative'],
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Indexes
hallSchema.index({ name: 'text', code: 'text' });
hallSchema.index({ isActive: 1 });

module.exports = mongoose.model('Hall', hallSchema);
