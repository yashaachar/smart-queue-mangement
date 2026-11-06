const { pool } = require('../config/db');
const { estimateWaitTime } = require('../services/waitEstimationEngine');

/**
 * Gathers full queue state with multi-counter status and calibrated wait estimates.
 * Used by both REST GET /api/queue/status and SSE real-time broadcast.
 */
const getQueueStatusPayload = async () => {
  const [stateResult, countsResult, activeCountersResult, serviceCountsResult] = await Promise.all([
    pool.query('SELECT * FROM queue_state WHERE id = 1'),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'waiting')                               AS waiting_count,
        COUNT(*) FILTER (WHERE status IN ('called', 'serving'))                 AS in_service_count,
        COUNT(*) FILTER (WHERE status IN ('served', 'completed'))               AS served_count,
        COUNT(*) FILTER (WHERE status = 'cancelled')                            AS cancelled_count,
        COUNT(*)                                                                 AS total_issued
      FROM tokens
    `),
    pool.query(`
      SELECT c.id, c.counter_number, c.name, c.status,
             t.token_number, t.token_code, t.status AS token_status,
             s.name AS service_name, s.prefix AS service_prefix
      FROM counters c
      LEFT JOIN tokens t ON c.current_token_id = t.id
      LEFT JOIN services s ON t.service_id = s.id
      WHERE c.is_active = TRUE
      ORDER BY c.counter_number ASC
    `),
    pool.query(`
      SELECT s.id, s.name, s.code, s.prefix, s.estimated_duration_min,
             COUNT(t.id) FILTER (WHERE t.status = 'waiting') AS waiting_count
      FROM services s
      LEFT JOIN tokens t ON s.id = t.service_id
      WHERE s.is_active = TRUE
      GROUP BY s.id, s.name, s.code, s.prefix, s.estimated_duration_min
      ORDER BY s.id ASC
    `),
  ]);

  const state = stateResult.rows[0] || { is_open: true, current_serving: 0, last_token_number: 0 };
  const counts = countsResult.rows[0];

  // Find the most recently called or serving token
  const currentPrimaryServing = activeCountersResult.rows.find(
    (c) => c.token_number && ['called', 'serving'].includes(c.token_status)
  );

  // Compute overall system wait estimation
  const systemWaitEstimate = await estimateWaitTime();

  return {
    isOpen: state.is_open,
    currentServing: currentPrimaryServing ? currentPrimaryServing.token_number : state.current_serving,
    currentServingCode: currentPrimaryServing ? currentPrimaryServing.token_code : null,
    lastTokenNumber: state.last_token_number,
    waitingCount: parseInt(counts.waiting_count),
    inServiceCount: parseInt(counts.in_service_count),
    servingCount: parseInt(counts.in_service_count),
    servedCount: parseInt(counts.served_count),
    cancelledCount: parseInt(counts.cancelled_count),
    totalIssued: parseInt(counts.total_issued),
    counters: activeCountersResult.rows,
    services: serviceCountsResult.rows,
    waitEstimate: systemWaitEstimate,
    updatedAt: state.updated_at || new Date(),
  };
};

module.exports = { getQueueStatusPayload };

