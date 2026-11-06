const { pool } = require('../config/db');

/**
 * GET /api/services
 * Returns all active services with their department and prefix configuration.
 */
const getServices = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.code, s.prefix, s.estimated_duration_min,
             s.priority_weight, s.is_active, s.department_id,
             d.name AS department_name, d.code AS department_code
      FROM services s
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE s.is_active = TRUE
      ORDER BY s.priority_weight DESC, s.name ASC
    `);

    return res.json({
      success: true,
      data: { services: result.rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/services/counters
 * Returns active service counters and their live dispatch status.
 */
const getCounters = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.counter_number, c.name, c.status, c.is_active,
             c.current_token_id, c.department_id,
             u.username AS staff_username,
             t.token_number, t.token_code, t.status AS token_status,
             t.called_at, t.started_at
      FROM counters c
      LEFT JOIN users u ON c.current_staff_id = u.id
      LEFT JOIN tokens t ON c.current_token_id = t.id
      WHERE c.is_active = TRUE
      ORDER BY c.counter_number ASC
    `);

    return res.json({
      success: true,
      data: { counters: result.rows },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getCounters };
