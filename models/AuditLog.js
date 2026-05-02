const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['USER_CREATION', 'USER_UPDATED', 'USER_DELETED', 'OTP_REQUEST', 'PASSWORD_RESET_SUCCESS', 'PASSWORD_RESET_FAILED', 'LOGIN_SUCCESS', 'LOGIN_FAILED']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Might be null if the user is not found during a failed login/reset
  },
  details: {
    type: String,
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  }
}, { timestamps: true });

auditLogSchema.index({ action: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
