const express = require('express');
const {
  getQueueStatus,
  advanceQueue,
  startServing,
  completeService,
  skipToken,
  resetQueue,
  toggleQueue,
  getActivityLogs,
} = require('../controllers/queueController');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/queue/status
 * Public queue state: now serving, active counters, and waiting counts.
 */
router.get('/status', getQueueStatus);

/**
 * POST /api/queue/next
 * Staff: Call next token to counter (transitions waiting -> called, sets called_at).
 */
router.post('/next', authenticate, requireStaff, advanceQueue);

/**
 * POST /api/queue/start-serving
 * Staff: Start customer service (transitions called -> serving, sets started_at).
 */
router.post('/start-serving', authenticate, requireStaff, startServing);

/**
 * POST /api/queue/complete
 * Staff: Complete service (transitions serving -> completed, sets completed_at).
 */
router.post('/complete', authenticate, requireStaff, completeService);

/**
 * POST /api/queue/skip
 * Staff: Mark token as skipped / no-show.
 */
router.post('/skip', authenticate, requireStaff, skipToken);

/**
 * POST /api/queue/reset
 * Staff: Archive session & start new queue day (Preserves all historical records).
 */
router.post('/reset', authenticate, requireStaff, resetQueue);

/**
 * PATCH /api/queue/toggle
 * Staff: Open/suspend queue dispatch.
 */
router.patch('/toggle', authenticate, requireStaff, toggleQueue);

/**
 * GET /api/queue/logs
 * Staff: Activity audit logs from MongoDB.
 */
router.get('/logs', authenticate, requireStaff, getActivityLogs);

module.exports = router;
