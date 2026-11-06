const ActivityLog = require('../models/ActivityLog');

/**
 * Fire-and-forget activity logger to MongoDB.
 * Never throws — a logging failure must never break the main request.
 *
 * @param {string} action   - One of the enum values in ActivityLog schema
 * @param {object} options
 * @param {object} [options.performedBy]  - { userId, username, role }
 * @param {object} [options.details]      - Arbitrary payload
 * @param {string} [options.ipAddress]
 * @param {string} [options.userAgent]
 */
const logActivity = async (action, options = {}) => {
  try {
    await ActivityLog.create({
      action,
      performedBy: options.performedBy || {},
      details: options.details || {},
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    });
  } catch (err) {
    // Log to console but swallow — never propagate to caller
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
