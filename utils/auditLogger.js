const AuditLog = require('../models/AuditLog');

/**
 * Log an audit action
 * @param {Object} req - Express request object (optional, for IP)
 * @param {String} action - Action enum (e.g., 'USER_CREATION')
 * @param {ObjectId} userId - User ID (optional)
 * @param {String} details - Additional details
 */
const logAudit = async (req, action, userId = null, details = '') => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null;
    
    await AuditLog.create({
      action,
      userId,
      details,
      ipAddress
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};

module.exports = {
  logAudit
};
