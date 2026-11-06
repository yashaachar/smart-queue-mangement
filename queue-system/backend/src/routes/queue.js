const express = require('express');
const {
  getQueueStatus,
  advanceQueue,
  resetQueue,
  toggleQueue,
  getActivityLogs,
} = require('../controllers/queueController');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/queue/status
 * Public — anyone (even unauthenticated) can see the display board.
 * Results are cached in Redis for 5 seconds.
 */
router.get('/status', getQueueStatus);

/**
 * POST /api/queue/next   — staff only: advance to next token
 */
router.post('/next', authenticate, requireStaff, advanceQueue);

/**
 * POST /api/queue/reset  — staff only: reset entire queue
 */
router.post('/reset', authenticate, requireStaff, resetQueue);

/**
 * PATCH /api/queue/toggle  — staff only: open/close the counter
 */
router.patch('/toggle', authenticate, requireStaff, toggleQueue);

/**
 * GET /api/queue/logs  — staff only: recent activity logs from MongoDB
 */
router.get('/logs', authenticate, requireStaff, getActivityLogs);

module.exports = router;
