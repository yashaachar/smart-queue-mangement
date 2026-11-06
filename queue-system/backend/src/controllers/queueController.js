const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { logActivity, getRequestMeta } = require('../utils/logger');

const REDIS_QUEUE_STATUS_KEY = 'queue:status';
const CACHE_TTL_SECONDS = 5; // short TTL — queue status changes frequently

/**
 * GET /api/queue/status
 *
 * Returns current queue state: which token is being served, how many are
 * waiting, total issued, etc.
 *
 * Redis caching strategy:
 *   - Cache the full status object for 5 seconds (hot read, called by all
 *     waiting users polling the display board).
 *   - Invalidated immediately whenever the queue advances or resets.
 */
const getQueueStatus = async (req, res, next) => {
  try {
    const redis = getRedis();

    // ── Cache hit ─────────────────────────────────────────────────────────────
    const cached = await redis.get(REDIS_QUEUE_STATUS_KEY);
    if (cached) {
      return res.json({
        success: true,
        source: 'cache',
        data: JSON.parse(cached),
      });
    }

    // ── Cache miss — query PostgreSQL ─────────────────────────────────────────
    const [stateResult, countsResult] = await Promise.all([
      pool.query('SELECT * FROM queue_state WHERE id = 1'),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'waiting')  AS waiting_count,
          COUNT(*) FILTER (WHERE status = 'serving')  AS serving_count,
          COUNT(*) FILTER (WHERE status = 'served')   AS served_count,
          COUNT(*)                                     AS total_issued
        FROM tokens
      `),
    ]);

    const state = stateResult.rows[0];
    const counts = countsResult.rows[0];

    const payload = {
      isOpen: state.is_open,
      currentServing: state.current_serving,
      lastTokenNumber: state.last_token_number,
      waitingCount: parseInt(counts.waiting_count),
      servingCount: parseInt(counts.serving_count),
      servedCount: parseInt(counts.served_count),
      totalIssued: parseInt(counts.total_issued),
      updatedAt: state.updated_at,
    };

    // Cache for 5 seconds
    await redis.setex(REDIS_QUEUE_STATUS_KEY, CACHE_TTL_SECONDS, JSON.stringify(payload));

    return res.json({ success: true, source: 'db', data: payload });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/queue/next   (staff only)
 *
 * Advances the queue to the next waiting token.
 * Uses a PostgreSQL transaction to:
 *   1. Mark the currently-serving token as 'served'
 *   2. Find the next 'waiting' token in order
 *   3. Mark it as 'serving' and update queue_state.current_serving
 *   All atomically — no race between two staff members clicking Next.
 */
const advanceQueue = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mark current serving token as 'served'
    await client.query(`
      UPDATE tokens
      SET status = 'served', served_at = NOW()
      WHERE status = 'serving'
    `);

    // Find the next waiting token (lowest token_number)
    const nextResult = await client.query(`
      SELECT id, token_number
      FROM tokens
      WHERE status = 'waiting'
      ORDER BY token_number ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    let nextToken = null;

    if (nextResult.rows.length > 0) {
      nextToken = nextResult.rows[0];

      // Mark it as serving
      await client.query(
        `UPDATE tokens SET status = 'serving' WHERE id = $1`,
        [nextToken.id]
      );

      // Update queue_state
      await client.query(
        `UPDATE queue_state SET current_serving = $1, updated_at = NOW() WHERE id = 1`,
        [nextToken.token_number]
      );
    } else {
      // No more waiting tokens — reset current_serving to 0
      await client.query(
        `UPDATE queue_state SET current_serving = 0, updated_at = NOW() WHERE id = 1`
      );
    }

    await client.query('COMMIT');

    // Invalidate cache — queue state has changed
    await getRedis().del(REDIS_QUEUE_STATUS_KEY);

    await logActivity('QUEUE_ADVANCED', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      details: { nowServing: nextToken?.token_number || null },
      ...getRequestMeta(req),
    });

    return res.json({
      success: true,
      message: nextToken
        ? `Now serving Token #${nextToken.token_number}`
        : 'Queue is empty — no more tokens waiting',
      data: { nowServing: nextToken?.token_number || null },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/queue/reset   (staff only)
 * Resets the entire queue: clears all tokens and resets counter to 0.
 * Intended for start-of-day / end-of-day use.
 */
const resetQueue = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM tokens');
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

    // Invalidate all queue-related Redis keys
    const redis = getRedis();
    await redis.del(REDIS_QUEUE_STATUS_KEY);
    await redis.del('queue:last_token_number');
    await redis.del('queue:current_serving');

    await logActivity('QUEUE_RESET', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      ...getRequestMeta(req),
    });

    return res.json({ success: true, message: 'Queue has been reset successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/queue/toggle   (staff only)
 * Opens or closes the queue counter.
 */
const toggleQueue = async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE queue_state
       SET is_open = NOT is_open,
           opened_at = CASE WHEN NOT is_open THEN NOW() ELSE opened_at END,
           updated_at = NOW()
       WHERE id = 1
       RETURNING is_open`,
    );

    const { is_open } = result.rows[0];

    await getRedis().del(REDIS_QUEUE_STATUS_KEY);

    return res.json({
      success: true,
      message: is_open ? 'Queue is now open' : 'Queue is now closed',
      data: { isOpen: is_open },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/queue/logs   (staff only)
 * Returns recent activity logs from MongoDB (paginated).
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

module.exports = { getQueueStatus, advanceQueue, resetQueue, toggleQueue, getActivityLogs };
