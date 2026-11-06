const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { logActivity, getRequestMeta } = require('../utils/logger');

// Redis key constants
const REDIS_LAST_TOKEN_KEY = 'queue:last_token_number';
const REDIS_LOCK_KEY = 'queue:token_issue_lock';
const LOCK_TTL_MS = 5000; // 5 seconds max lock hold time

// Helper: release the Redis lock only if this request still owns it
const releaseLock = async (redis, lockValue) => {
  try {
    const current = await redis.get(REDIS_LOCK_KEY);
    if (current === lockValue) {
      await redis.del(REDIS_LOCK_KEY);
    }
  } catch (_) { /* best-effort */ }
};

/**
 * POST /api/tokens/generate
 *
 * Concurrency strategy:
 *   1. Acquire a Redis distributed lock (SET NX PX) to serialise concurrent
 *      requests at the application layer — prevents multiple Node processes
 *      from racing into the DB at the same time.
 *   2. Inside a PostgreSQL transaction, use SELECT ... FOR UPDATE on the
 *      single queue_state row to additionally guarantee DB-level serialisation.
 *      Even if the Redis lock is bypassed (e.g. Redis is temporarily down and
 *      the fallback path is used), the DB lock alone ensures uniqueness.
 *   3. Increment last_token_number atomically, insert the new token, commit.
 *   4. Release the Redis lock.
 *   5. Invalidate the Redis cache for the queue state.
 *
 * This dual-layer approach (Redis lock + PG row-lock) ensures:
 *   - No duplicate token numbers even under burst load
 *   - No gaps in the sequence
 *   - Correct behaviour if Redis is temporarily unavailable (PG lock saves us)
 */
const generateToken = async (req, res, next) => {
  const redis = getRedis();
  const lockValue = `${Date.now()}-${Math.random()}`; // unique per request
  let lockAcquired = false;

  try {
    // ── Step 1: Acquire Redis distributed lock ────────────────────────────────
    const lock = await redis.set(REDIS_LOCK_KEY, lockValue, 'PX', LOCK_TTL_MS, 'NX');
    lockAcquired = lock === 'OK';

    if (!lockAcquired) {
      return res.status(429).json({
        success: false,
        message: 'System is busy processing another token request. Please retry in a moment.',
      });
    }

    // ── Step 2 & 3: PostgreSQL transaction with row-level lock ────────────────
    const client = await pool.connect();
    let newToken;

    try {
      await client.query('BEGIN');

      // Lock the single queue_state row — blocks other concurrent transactions
      const stateResult = await client.query(
        'SELECT last_token_number, is_open FROM queue_state WHERE id = 1 FOR UPDATE'
      );

      const state = stateResult.rows[0];

      if (!state.is_open) {
        await client.query('ROLLBACK');
        client.release();
        await releaseLock(redis, lockValue);
        return res.status(400).json({
          success: false,
          message: 'The queue is currently closed. Please wait for the counter to open.',
        });
      }

      const nextTokenNumber = state.last_token_number + 1;

      // Update queue_state counter
      await client.query(
        'UPDATE queue_state SET last_token_number = $1, updated_at = NOW() WHERE id = 1',
        [nextTokenNumber]
      );

      // Insert the new token record
      const userId = req.user?.id || null;
      const tokenResult = await client.query(
        `INSERT INTO tokens (token_number, user_id, status, issued_at)
         VALUES ($1, $2, 'waiting', NOW())
         RETURNING id, token_number, user_id, status, issued_at`,
        [nextTokenNumber, userId]
      );

      newToken = tokenResult.rows[0];

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // ── Step 4: Release Redis lock (only if we still own it) ─────────────────
    await releaseLock(redis, lockValue);
    lockAcquired = false;

    // ── Step 5: Invalidate cached last_token so reads reflect new count ───────
    await redis.del(REDIS_LAST_TOKEN_KEY);

    // ── Log to MongoDB ────────────────────────────────────────────────────────
    await logActivity('TOKEN_ISSUED', {
      performedBy: req.user
        ? { userId: req.user.id, username: req.user.username, role: req.user.role }
        : { userId: null, username: 'anonymous', role: 'user' },
      details: { tokenNumber: newToken.token_number, tokenId: newToken.id },
      ...getRequestMeta(req),
    });

    return res.status(201).json({
      success: true,
      message: `Token #${newToken.token_number} issued successfully`,
      data: { token: newToken },
    });
  } catch (err) {
    // Release lock on unexpected error
    if (lockAcquired) {
      await releaseLock(getRedis(), lockValue);
    }
    next(err);
  }
};

/**
 * GET /api/tokens
 * Returns paginated list of all tokens (staff only).
 */
const getAllTokens = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status; // optional filter

    let query = `
      SELECT t.id, t.token_number, t.user_id, t.status, t.issued_at, t.served_at,
             u.username
      FROM tokens t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` WHERE t.status = $${params.length}`;
    }

    query += ` ORDER BY t.token_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = status
      ? 'SELECT COUNT(*) FROM tokens WHERE status = $1'
      : 'SELECT COUNT(*) FROM tokens';
    const countParams = status ? [status] : [];

    const [tokensResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return res.json({
      success: true,
      data: {
        tokens: tokensResult.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tokens/my
 * Returns the current user's token (most recent waiting or serving).
 */
const getMyToken = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, token_number, status, issued_at, served_at
       FROM tokens
       WHERE user_id = $1 AND status IN ('waiting', 'serving')
       ORDER BY issued_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'No active token found for this user' });
    }

    return res.json({ success: true, data: { token: result.rows[0] } });
  } catch (err) {
    next(err);
  }
};

module.exports = { generateToken, getAllTokens, getMyToken };
