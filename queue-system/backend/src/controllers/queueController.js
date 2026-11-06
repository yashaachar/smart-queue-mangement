const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { logActivity, getRequestMeta } = require('../utils/logger');

const REDIS_QUEUE_STATUS_KEY = 'queue:status';
const CACHE_TTL_SECONDS = 3;

/**
 * GET /api/queue/status
 * Public queue state: now-serving tokens, active counters, waiting workload per service.
 */
const getQueueStatus = async (req, res, next) => {
  let redis = null;
  try {
    redis = getRedis();
  } catch (_) {}

  try {
    // Check Redis cache
    if (redis) {
      try {
        const cached = await redis.get(REDIS_QUEUE_STATUS_KEY);
        if (cached) {
          return res.json({ success: true, source: 'cache', data: JSON.parse(cached) });
        }
      } catch (_) {}
    }

    // Cache miss — Query authoritative PostgreSQL
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
               s.name AS service_name
        FROM counters c
        LEFT JOIN tokens t ON c.current_token_id = t.id
        LEFT JOIN services s ON t.service_id = s.id
        WHERE c.is_active = TRUE
        ORDER BY c.counter_number ASC
      `),
      pool.query(`
        SELECT s.id, s.name, s.code, s.prefix,
               COUNT(t.id) FILTER (WHERE t.status = 'waiting') AS waiting_count
        FROM services s
        LEFT JOIN tokens t ON s.id = t.service_id
        WHERE s.is_active = TRUE
        GROUP BY s.id, s.name, s.code, s.prefix
        ORDER BY s.id ASC
      `),
    ]);

    const state = stateResult.rows[0];
    const counts = countsResult.rows[0];

    // Find the latest called or serving token for primary display board
    const currentPrimaryServing = activeCountersResult.rows.find(
      (c) => c.token_number && ['called', 'serving'].includes(c.token_status)
    );

    const payload = {
      isOpen: state.is_open,
      currentServing: currentPrimaryServing ? currentPrimaryServing.token_number : state.current_serving,
      currentServingCode: currentPrimaryServing ? currentPrimaryServing.token_code : null,
      lastTokenNumber: state.last_token_number,
      waitingCount: parseInt(counts.waiting_count),
      inServiceCount: parseInt(counts.in_service_count),
      servingCount: parseInt(counts.in_service_count), // backwards compatibility
      servedCount: parseInt(counts.served_count),
      cancelledCount: parseInt(counts.cancelled_count),
      totalIssued: parseInt(counts.total_issued),
      counters: activeCountersResult.rows,
      services: serviceCountsResult.rows,
      updatedAt: state.updated_at,
    };

    if (redis) {
      try {
        await redis.setex(REDIS_QUEUE_STATUS_KEY, CACHE_TTL_SECONDS, JSON.stringify(payload));
      } catch (_) {}
    }

    return res.json({ success: true, source: 'db', data: payload });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/queue/next (Call Next Token)
 * Staff calls next waiting token to an assigned counter.
 * Atomically transitions waiting -> called.
 * Sets called_at = NOW().
 */
const advanceQueue = async (req, res, next) => {
  const counterId = parseInt(req.body.counter_id) || 1;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify counter exists
    const counterRes = await client.query(
      'SELECT id, counter_number, name, status, current_token_id FROM counters WHERE id = $1 FOR UPDATE',
      [counterId]
    );

    if (!counterRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Counter not found' });
    }

    const counter = counterRes.rows[0];

    // If counter had a previously active token, mark it completed to free the counter
    if (counter.current_token_id) {
      await client.query(
        `UPDATE tokens
         SET status = 'completed', completed_at = NOW(), served_at = NOW()
         WHERE id = $1 AND status IN ('called', 'serving')`,
        [counter.current_token_id]
      );
    }

    // Select next waiting token using FOR UPDATE SKIP LOCKED
    // Priority order: highest priority first, then earliest issued_at
    const nextTokenRes = await client.query(`
      SELECT id, token_number, token_code, service_id, customer_name
      FROM tokens
      WHERE status = 'waiting'
      ORDER BY priority DESC, issued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    let nextToken = null;

    if (nextTokenRes.rows.length > 0) {
      nextToken = nextTokenRes.rows[0];

      // Mark token as called with exact timestamp
      await client.query(
        `UPDATE tokens 
         SET status = 'called', counter_id = $1, called_at = NOW() 
         WHERE id = $2`,
        [counterId, nextToken.id]
      );

      // Update counter status
      await client.query(
        `UPDATE counters 
         SET status = 'calling', current_token_id = $1, current_staff_id = $2, updated_at = NOW() 
         WHERE id = $3`,
        [nextToken.id, req.user.id, counterId]
      );

      // Update queue_state primary serving indicator
      await client.query(
        `UPDATE queue_state SET current_serving = $1, updated_at = NOW() WHERE id = 1`,
        [nextToken.token_number]
      );
    } else {
      // No more waiting customers
      await client.query(
        `UPDATE counters SET status = 'idle', current_token_id = NULL, updated_at = NOW() WHERE id = $1`,
        [counterId]
      );
      await client.query(
        `UPDATE queue_state SET current_serving = 0, updated_at = NOW() WHERE id = 1`
      );
    }

    await client.query('COMMIT');

    // Invalidate status cache
    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    await logActivity('QUEUE_ADVANCED', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      details: {
        counterId,
        counterNumber: counter.counter_number,
        nowServing: nextToken?.token_number || null,
        tokenCode: nextToken?.token_code || null,
      },
      ...getRequestMeta(req),
    });

    return res.json({
      success: true,
      message: nextToken
        ? `Now calling Token ${nextToken.token_code || '#' + nextToken.token_number} to ${counter.name}`
        : 'All queues are clear — no customers waiting.',
      data: {
        token: nextToken,
        counterId,
        nowServing: nextToken?.token_number || null,
        tokenCode: nextToken?.token_code || null,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/queue/start-serving
 * Staff marks customer as seated/service in progress.
 * Transitions called -> serving.
 * Sets started_at = NOW() to calculate dispatch delay (started_at - called_at).
 */
const startServing = async (req, res, next) => {
  const counterId = parseInt(req.body.counter_id) || 1;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const counterRes = await client.query(
      'SELECT id, name, current_token_id FROM counters WHERE id = $1 FOR UPDATE',
      [counterId]
    );

    const counter = counterRes.rows[0];
    if (!counter || !counter.current_token_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No customer currently assigned to this counter' });
    }

    const tokenRes = await client.query(
      `UPDATE tokens 
       SET status = 'serving', started_at = NOW() 
       WHERE id = $1 AND status = 'called'
       RETURNING id, token_number, token_code, called_at, started_at`,
      [counter.current_token_id]
    );

    if (!tokenRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Token is not in called state' });
    }

    await client.query(
      `UPDATE counters SET status = 'serving', updated_at = NOW() WHERE id = $1`,
      [counterId]
    );

    await client.query('COMMIT');

    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    return res.json({
      success: true,
      message: `Service started for ${tokenRes.rows[0].token_code || '#' + tokenRes.rows[0].token_number}`,
      data: { token: tokenRes.rows[0] },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/queue/complete
 * Staff marks service as completed.
 * Transitions serving -> completed.
 * Sets completed_at = NOW(), served_at = NOW().
 * Calculates actual service duration: completed_at - started_at.
 */
const completeService = async (req, res, next) => {
  const counterId = parseInt(req.body.counter_id) || 1;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const counterRes = await client.query(
      'SELECT id, name, current_token_id FROM counters WHERE id = $1 FOR UPDATE',
      [counterId]
    );

    const counter = counterRes.rows[0];
    if (!counter || !counter.current_token_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No customer currently assigned to this counter' });
    }

    const tokenRes = await client.query(
      `UPDATE tokens 
       SET status = 'completed', completed_at = NOW(), served_at = NOW() 
       WHERE id = $1 AND status IN ('called', 'serving')
       RETURNING id, token_number, token_code, issued_at, called_at, started_at, completed_at`,
      [counter.current_token_id]
    );

    await client.query(
      `UPDATE counters SET status = 'idle', current_token_id = NULL, updated_at = NOW() WHERE id = $1`,
      [counterId]
    );

    await client.query('COMMIT');

    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    await logActivity('TOKEN_SERVED', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      details: {
        tokenId: tokenRes.rows[0]?.id,
        tokenCode: tokenRes.rows[0]?.token_code,
        counterId,
      },
      ...getRequestMeta(req),
    });

    return res.json({
      success: true,
      message: `Service completed for ${tokenRes.rows[0]?.token_code || '#' + tokenRes.rows[0]?.token_number}`,
      data: { token: tokenRes.rows[0] },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/queue/skip
 * Customer is a no-show or skipped.
 */
const skipToken = async (req, res, next) => {
  const counterId = parseInt(req.body.counter_id) || 1;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const counterRes = await client.query(
      'SELECT id, current_token_id FROM counters WHERE id = $1 FOR UPDATE',
      [counterId]
    );

    const counter = counterRes.rows[0];
    if (!counter || !counter.current_token_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No token currently assigned to skip' });
    }

    await client.query(
      `UPDATE tokens SET status = 'skipped' WHERE id = $1`,
      [counter.current_token_id]
    );

    await client.query(
      `UPDATE counters SET status = 'idle', current_token_id = NULL, updated_at = NOW() WHERE id = $1`,
      [counterId]
    );

    await client.query('COMMIT');

    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    return res.json({ success: true, message: 'Token marked as skipped' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/queue/reset (Non-Destructive Session Archiving)
 * CRITICAL FIX: Closes the current active session and creates a fresh session.
 * Does NOT run DELETE FROM tokens — all historical service records are preserved for analytics.
 */
const resetQueue = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Close current active session
    await client.query(`
      UPDATE queue_sessions 
      SET is_active = FALSE, closed_at = NOW() 
      WHERE is_active = TRUE
    `);

    // 2. Start new session for Quebee
    const newSession = await client.query(`
      INSERT INTO queue_sessions (session_code, session_date, is_active)
      VALUES (CONCAT('SESS-', TO_CHAR(CURRENT_DATE, 'YYYYMMDD'), '-', SUBSTRING(MD5(RANDOM()::text), 1, 6)), CURRENT_DATE, TRUE)
      RETURNING id, session_code
    `);

    // 3. Reset per-service sequence counters
    await client.query(`
      UPDATE service_token_sequences 
      SET last_number = 100, updated_at = NOW()
    `);

    // 4. Mark remaining waiting tokens from old session as cancelled so queue starts clear
    await client.query(`
      UPDATE tokens 
      SET status = 'cancelled', cancelled_at = NOW(), notes = 'Session concluded/reset by staff'
      WHERE status IN ('waiting', 'called')
    `);

    // 5. Reset counters to idle
    await client.query(`
      UPDATE counters 
      SET status = 'idle', current_token_id = NULL, updated_at = NOW()
    `);

    // 6. Reset legacy queue_state indicators
    await client.query(`
      UPDATE queue_state
      SET last_token_number = 0,
          current_serving = 0,
          is_open = TRUE,
          opened_at = NOW(),
          updated_at = NOW()
      WHERE id = 1
    `);

    await client.query('COMMIT');

    // Invalidate Redis cache
    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
      await redis.del('queue:last_token_number');
      await redis.del('queue:current_serving');
    } catch (_) {}

    await logActivity('QUEUE_RESET', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      details: { newSessionId: newSession.rows[0].id, newSessionCode: newSession.rows[0].session_code },
      ...getRequestMeta(req),
    });

    return res.json({
      success: true,
      message: 'Queue session closed and archived. Fresh session initialized (Historical data preserved).',
      data: { session: newSession.rows[0] },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/queue/toggle (Open / Suspend Counter Dispatch)
 */
const toggleQueue = async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE queue_state
       SET is_open = NOT is_open,
           opened_at = CASE WHEN NOT is_open THEN NOW() ELSE opened_at END,
           updated_at = NOW()
       WHERE id = 1
       RETURNING is_open`
    );

    const { is_open } = result.rows[0];

    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    return res.json({
      success: true,
      message: is_open ? 'Queue is now open for token requests' : 'Queue is now suspended',
      data: { isOpen: is_open },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/queue/logs (Activity Logs from MongoDB)
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const ActivityLog = require('../models/ActivityLog');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ActivityLog.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(),
    ]);

    return res.json({
      success: true,
      data: {
        logs,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getQueueStatus,
  advanceQueue,
  startServing,
  completeService,
  skipToken,
  resetQueue,
  toggleQueue,
  getActivityLogs,
};
