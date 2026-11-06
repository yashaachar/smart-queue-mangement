const { getAnalyticsData, exportTokensCsv } = require('../services/analyticsService');

/**
 * GET /api/analytics
 * Returns peak-hour metrics, counter utilization, and evidence-based recommendations.
 */
const getAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate, serviceId } = req.query;
    const data = await getAnalyticsData({ startDate, endDate, serviceId });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/analytics/export
 * Downloads CSV of token service and wait time records.
 */
const exportCsv = async (req, res, next) => {
  try {
    const csvData = await exportTokensCsv();
    const filename = `quebee_analytics_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAnalytics, exportCsv };
