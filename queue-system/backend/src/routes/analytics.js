const express = require('express');
const { getAnalytics, exportCsv } = require('../controllers/analyticsController');
const { authenticate, requireStaff } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/analytics
 * Operational KPIs, peak hours, counter utilization, and evidence-based recommendations.
 */
router.get('/', authenticate, requireStaff, getAnalytics);

/**
 * GET /api/analytics/export
 * Download CSV dataset of service durations and wait times.
 */
router.get('/export', authenticate, requireStaff, exportCsv);

module.exports = router;
