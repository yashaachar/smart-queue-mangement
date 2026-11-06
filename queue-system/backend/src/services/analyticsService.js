/**
 * QUEBEE ANALYTICS & BOTTLENECK OPTIMIZATION ENGINE
 * Specifications: PS-13 Outcomes 4 & 5
 *
 * Provides real database-driven peak-hour identification,
 * counter utilization, service duration analysis, and evidence-based
 * operational recommendations.
 */

const { pool } = require('../config/db');

/**
 * Retrieves comprehensive analytics metrics.
 *
 * @param {object} options
 * @param {string} [options.startDate] - Filter start date (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filter end date (YYYY-MM-DD)
 * @param {number} [options.serviceId] - Optional service filter
 */
const getAnalyticsData = async ({ startDate, endDate, serviceId } = {}) => {
  // Date conditions (defaults to current date or all available records)
  let dateFilter = '1=1';
  const filterParams = [];

  if (startDate) {
    filterParams.push(startDate);
    dateFilter += ` AND DATE(t.issued_at) >= $${filterParams.length}`;
  }
  if (endDate) {
    filterParams.push(endDate);
    dateFilter += ` AND DATE(t.issued_at) <= $${filterParams.length}`;
  }
  if (serviceId) {
    filterParams.push(serviceId);
    dateFilter += ` AND t.service_id = $${filterParams.length}`;
  }

  // ── 1. Summary High-Level KPIs ─────────────────────────────────────────────
  const kpiQuery = `
    SELECT
      COUNT(*)                                                                AS total_tokens,
      COUNT(*) FILTER (WHERE t.status IN ('served', 'completed'))             AS completed_tokens,
      COUNT(*) FILTER (WHERE t.status = 'cancelled')                           AS cancelled_tokens,
      COUNT(*) FILTER (WHERE t.status = 'skipped')                             AS skipped_tokens,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.called_at - t.issued_at)) / 60.0)::numeric, 1) AS avg_wait_minutes,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0)::numeric, 1) AS avg_service_minutes
    FROM tokens t
    WHERE ${dateFilter}
  `;
  const kpiRes = await pool.query(kpiQuery, filterParams);
  const kpi = kpiRes.rows[0];

  // ── 2. Hourly Volume & Wait Time Distribution ──────────────────────────────
  const hourlyQuery = `
    SELECT
      EXTRACT(HOUR FROM t.issued_at)::int AS hour_of_day,
      COUNT(*)                            AS token_volume,
      COUNT(*) FILTER (WHERE t.status IN ('served', 'completed')) AS completed_count,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.called_at - t.issued_at)) / 60.0)::numeric, 1) AS avg_wait_min,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0)::numeric, 1) AS avg_service_min
    FROM tokens t
    WHERE ${dateFilter}
    GROUP BY hour_of_day
    ORDER BY hour_of_day ASC
  `;
  const hourlyRes = await pool.query(hourlyQuery, filterParams);

  // ── 3. Counter Workload & Utilization ───────────────────────────────────────
  const counterQuery = `
    SELECT
      c.id, c.counter_number, c.name AS counter_name,
      COUNT(t.id) FILTER (WHERE t.status IN ('served', 'completed')) AS tokens_served,
      ROUND(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0)::numeric, 1) AS total_serving_minutes,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0)::numeric, 1) AS avg_duration_min
    FROM counters c
    LEFT JOIN tokens t ON c.id = t.counter_id AND ${dateFilter}
    WHERE c.is_active = TRUE
    GROUP BY c.id, c.counter_number, c.name
    ORDER BY c.counter_number ASC
  `;
  const counterRes = await pool.query(counterQuery, filterParams);

  // ── 4. Service Breakdown & Target Performance ───────────────────────────────
  const serviceQuery = `
    SELECT
      s.id, s.name, s.code, s.prefix, s.estimated_duration_min AS target_duration,
      COUNT(t.id) AS total_requests,
      COUNT(t.id) FILTER (WHERE t.status IN ('served', 'completed')) AS completed_count,
      COUNT(t.id) FILTER (WHERE t.status = 'cancelled') AS cancelled_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.called_at - t.issued_at)) / 60.0)::numeric, 1) AS actual_avg_wait,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0)::numeric, 1) AS actual_avg_duration
    FROM services s
    LEFT JOIN tokens t ON s.id = t.service_id AND ${dateFilter}
    WHERE s.is_active = TRUE
    GROUP BY s.id, s.name, s.code, s.prefix, s.estimated_duration_min
    ORDER BY total_requests DESC
  `;
  const serviceRes = await pool.query(serviceQuery, filterParams);

  // ── 5. Generate Evidence-Based Operational Recommendations (Outcome 5) ──────
  const recommendations = [];

  // Rule A: Peak-Hour Surge Detection
  const sortedHours = [...hourlyRes.rows].sort((a, b) => b.token_volume - a.token_volume);
  if (sortedHours.length > 0 && sortedHours[0].token_volume >= 2) {
    const peakHour = sortedHours[0];
    const peakTimeLabel = `${peakHour.hour_of_day}:00–${peakHour.hour_of_day + 1}:00`;
    recommendations.push({
      id: 'rec-peak-hour',
      type: 'staffing',
      priority: 'high',
      title: `Allocate Additional Counter During Peak Surge (${peakTimeLabel})`,
      message: `Customer arrival volume surges to ${peakHour.token_volume} requests during ${peakTimeLabel}. Average wait time peaks at ${peakHour.avg_wait_min || 0} minutes.`,
      action: 'Open Counter 02 or Counter 03 prior to this surge window to absorb queue demand.',
      metric: `${peakHour.token_volume} tokens / hour`,
    });
  }

  // Rule B: Service Processing Bottleneck Detection
  for (const s of serviceRes.rows) {
    if (s.actual_avg_duration && s.target_duration) {
      const actual = parseFloat(s.actual_avg_duration);
      const target = parseFloat(s.target_duration);
      if (actual > target * 1.25 && s.completed_count >= 2) {
        const excessPct = Math.round(((actual - target) / target) * 100);
        recommendations.push({
          id: `rec-bottleneck-${s.id}`,
          type: 'bottleneck',
          priority: 'medium',
          title: `Service Duration Bottleneck: ${s.name}`,
          message: `Actual consultation duration (${actual} min) exceeds target benchmark (${target} min) by ${excessPct}%.`,
          action: 'Review intake questions or triage prerequisites for this service to decrease handling time.',
          metric: `+${excessPct}% over target`,
        });
      }
    }
  }

  // Rule C: Counter Workload Imbalance
  if (counterRes.rows.length >= 2) {
    const activeServed = counterRes.rows.map((c) => parseInt(c.tokens_served) || 0);
    const maxServed = Math.max(...activeServed);
    const minServed = Math.min(...activeServed);
    if (maxServed >= 3 && minServed === 0) {
      recommendations.push({
        id: 'rec-workload-balance',
        type: 'allocation',
        priority: 'medium',
        title: 'Counter Workload Imbalance Detected',
        message: `Certain active counters handled no customers while others processed ${maxServed} consultations.`,
        action: 'Configure automated round-robin routing across all operating counters to distribute workload evenly.',
        metric: `Disparity: ${maxServed} vs ${minServed}`,
      });
    }
  }

  // Default Positive Recommendation if system is performing smoothly
  if (recommendations.length === 0) {
    recommendations.push({
      id: 'rec-optimal',
      type: 'optimization',
      priority: 'low',
      title: 'Queue Throughput Optimal',
      message: 'Current waiting times and counter allocations are balanced within configured thresholds.',
      action: 'Maintain active counter schedule and continue monitoring real-time arrival velocity.',
      metric: 'Balanced',
    });
  }

  return {
    kpis: {
      totalTokens: parseInt(kpi.total_tokens) || 0,
      completedTokens: parseInt(kpi.completed_tokens) || 0,
      cancelledTokens: parseInt(kpi.cancelled_tokens) || 0,
      skippedTokens: parseInt(kpi.skipped_tokens) || 0,
      avgWaitMinutes: parseFloat(kpi.avg_wait_minutes) || 0,
      avgServiceMinutes: parseFloat(kpi.avg_service_minutes) || 0,
      completionRate: kpi.total_tokens > 0 ? Math.round((kpi.completed_tokens / kpi.total_tokens) * 100) : 100,
    },
    hourlyDistribution: hourlyRes.rows,
    counterUtilization: counterRes.rows,
    servicePerformance: serviceRes.rows,
    recommendations,
  };
};

/**
 * Generates CSV string of raw token service records for export.
 */
const exportTokensCsv = async () => {
  const query = `
    SELECT
      t.id,
      t.token_number,
      t.token_code,
      s.name AS service_name,
      t.customer_name,
      c.name AS counter_name,
      t.status,
      t.priority,
      t.issued_at,
      t.called_at,
      t.started_at,
      t.completed_at,
      ROUND(EXTRACT(EPOCH FROM (t.called_at - t.issued_at)) / 60.0, 2) AS waiting_time_min,
      ROUND(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 60.0, 2) AS service_time_min
    FROM tokens t
    LEFT JOIN services s ON t.service_id = s.id
    LEFT JOIN counters c ON t.counter_id = c.id
    ORDER BY t.id DESC
  `;
  const result = await pool.query(query);

  const headers = [
    'Token ID',
    'Token Number',
    'Token Code',
    'Service',
    'Customer',
    'Counter',
    'Status',
    'Priority',
    'Issued At',
    'Called At',
    'Started At',
    'Completed At',
    'Waiting Time (min)',
    'Service Time (min)',
  ];

  const rows = result.rows.map((r) => [
    r.id,
    r.token_number,
    `"${r.token_code || ''}"`,
    `"${r.service_name || 'General'}"`,
    `"${r.customer_name || 'Guest'}"`,
    `"${r.counter_name || 'N/A'}"`,
    r.status,
    r.priority,
    r.issued_at ? new Date(r.issued_at).toISOString() : '',
    r.called_at ? new Date(r.called_at).toISOString() : '',
    r.started_at ? new Date(r.started_at).toISOString() : '',
    r.completed_at ? new Date(r.completed_at).toISOString() : '',
    r.waiting_time_min || '',
    r.service_time_min || '',
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
};

module.exports = { getAnalyticsData, exportTokensCsv };

