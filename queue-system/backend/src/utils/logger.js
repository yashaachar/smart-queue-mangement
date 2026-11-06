const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

/**
 * Fire-and-forget activity logger to MongoDB.
 * Never throws — a logging failure must never break the main request.
 * If MongoDB is not connected, fails silently without buffering delays.
 */
const logActivity = async (action, options = {}) => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  try {
    await ActivityLog.create({
      action,
      performedBy: options.performedBy || {},
      details: options.details || {},
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    });
  } catch (err) {
    console.error('[ActivityLog] Failed to write log:', err.message);
  }
};

/**
 * Extracts caller metadata from an Express request object.
 */
const getRequestMeta = (req) => ({
  ipAddress: req.ip || req.socket?.remoteAddress || null,
  userAgent: req.headers?.['user-agent'] || null,
});

module.exports = { logActivity, getRequestMeta };
