const mongoose = require('mongoose');

/**
 * MongoDB schema for activity / audit logs.
 * Write-heavy, unstructured — perfect fit for Mongo.
 */
const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'TOKEN_ISSUED',
        'TOKEN_SERVED',
        'TOKEN_SKIPPED',
        'QUEUE_ADVANCED',
        'QUEUE_RESET',
        'USER_REGISTERED',
        'USER_LOGIN',
        'USER_LOGIN_FAILED',
      ],
    },
    performedBy: {
      userId: { type: Number, default: null },   // PostgreSQL user id
      username: { type: String, default: 'anonymous' },
      role: { type: String, default: 'user' },
    },
    details: {
      type: mongoose.Schema.Types.Mixed,         // flexible payload per action
      default: {},
    },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: true,   // adds createdAt, updatedAt automatically
    collection: 'activity_logs',
  }
);

// Index for querying recent logs quickly
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;
