const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { logActivity, getRequestMeta } = require('../utils/logger');

// Redis key constants
const REDIS_LAST_TOKEN_KEY = 'queue:last_token_number';
const REDIS_LOCK_KEY = 'queue:token_issue_lock';
const REDIS_QUEUE_STATUS_KEY = 'queue:status';
const LOCK_TTL_MS = 5000;

// Helper: release the Redis lock safely
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
 *   1. Acquire a Redis distributed lock (SET NX PX) for cross-process mutual exclusion.
 *   2. In PostgreSQL transaction, acquire row-level lock (FOR UPDATE) on queue_state
 *      and service_token_sequences to guarantee gapless, duplicate-proof tokens.
 *   3. Assign sequential number + formatted token_code (e.g. A-101).
 *   4. Record precision timestamp: issued_at = NOW().
 *   5. Releases lock and invalidates cache.
 */
const generateToken = async (req, res, next) => {
  let redis = null;
  try {
    redis = getRedis();
  } catch (_) {}

  const lockValue = `${Date.now()}-${Math.random()}`;
  let lockAcquired = false;

  try {
    // ── Step 1: Redis distributed lock (with graceful fallback if down) ───────
    if (redis) {
      try {
        const lock = await redis.set(REDIS_LOCK_KEY, lockValue, 'PX', LOCK_TTL_MS, 'NX');
        lockAcquired = lock === 'OK';

        if (!lockAcquired) {
          return res.status(429).json({
            success: false,
            message: 'Quebee is busy processing another token request. Please retry in a moment.',
          });
        }
      } catch (redisErr) {
        // Continue to PostgreSQL row-level lock fallback
        console.warn('[TokenController] Redis lock bypassed:', redisErr.message);
      }
    }

    // ── Step 2: PostgreSQL transactional generation ───────────────────────────
    const client = await pool.connect();
    let newToken;

    try {
      await client.query('BEGIN');

      // 1. Check queue_state and lock it
      const stateResult = await client.query(
        'SELECT last_token_number, is_open FROM queue_state WHERE id = 1 FOR UPDATE'
      );
      const state = stateResult.rows[0];

      if (!state.is_open) {
        await client.query('ROLLBACK');
        client.release();
        if (redis && lockAcquired) await releaseLock(redis, lockValue);
        return res.status(400).json({
          success: false,
          message: 'The queue is currently closed. Please wait for staff to open the session.',
        });
      }

      // 2. Resolve Service
      let serviceId = req.body.service_id ? parseInt(req.body.service_id) : null;
      let serviceResult;
      if (serviceId) {
        serviceResult = await client.query(
          'SELECT id, name, code, prefix, estimated_duration_min FROM services WHERE id = $1 AND is_active = TRUE',
          [serviceId]
        );
      } else {
        serviceResult = await client.query(
          'SELECT id, name, code, prefix, estimated_duration_min FROM services WHERE is_active = TRUE ORDER BY id ASC LIMIT 1'
        );
      }

      if (!serviceResult.rows[0]) {
        await client.query('ROLLBACK');
        client.release();
        if (redis && lockAcquired) await releaseLock(redis, lockValue);
        return res.status(400).json({ success: false, message: 'Invalid or inactive service specified.' });
      }

      const service = serviceResult.rows[0];
      serviceId = service.id;

      // 3. Resolve active session
      let sessionResult = await client.query(
        'SELECT id FROM queue_sessions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
      );
      let sessionId = sessionResult.rows[0]?.id;

      if (!sessionId) {
        // Create an automatic active session if none exists
        const newSess = await client.query(
          `INSERT INTO queue_sessions (session_code, session_date, is_active)
           VALUES (CONCAT('SESS-', TO_CHAR(CURRENT_DATE, 'YYYYMMDD'), '-', SUBSTRING(MD5(RANDOM()::text), 1, 6)), CURRENT_DATE, TRUE)
           RETURNING id`
        );
        sessionId = newSess.rows[0].id;
      }

      // 4. Lock and increment service sequence (Gapless numbering per service)
      const seqLock = await client.query(
        'SELECT last_number FROM service_token_sequences WHERE service_id = $1 FOR UPDATE',
        [serviceId]
      );

      let serviceSeqNumber = 100; // baseline starts at 101
      if (seqLock.rows.length > 0) {
        serviceSeqNumber = seqLock.rows[0].last_number + 1;
        await client.query(
          'UPDATE service_token_sequences SET last_number = $1, updated_at = NOW() WHERE service_id = $2',
          [serviceSeqNumber, serviceId]
        );
      } else {
        serviceSeqNumber = 101;
        await client.query(
          'INSERT INTO service_token_sequences (service_id, last_number, session_date) VALUES ($1, $2, CURRENT_DATE)',
          [serviceId, serviceSeqNumber]
        );
      }

      // Increment global token counter for backwards compatibility
      const nextGlobalTokenNumber = state.last_token_number + 1;
      await client.query(
        'UPDATE queue_state SET last_token_number = $1, updated_at = NOW() WHERE id = 1',
        [nextGlobalTokenNumber]
      );

      // Formatted Token Code (e.g. A-101, B-102)
      const tokenCode = `${service.prefix}-${serviceSeqNumber}`;

      // Calculate initial waiting workload
      const waitAheadResult = await client.query(
        `SELECT COUNT(*) AS count_ahead 
         FROM tokens 
         WHERE status = 'waiting' AND service_id = $1`,
        [serviceId]
      );
      const countAhead = parseInt(waitAheadResult.rows[0].count_ahead);
      const estimatedWaitMin = Math.max(2, countAhead * (service.estimated_duration_min || 5));

      // 5. Insert new token with precision timestamp issued_at
      const userId = req.user?.id || null;
      const customerName = req.body.customer_name || req.user?.username || 'Guest';
      const customerPhone = req.body.customer_phone || null;
      const priority = parseInt(req.body.priority) || 0;
      const notes = req.body.notes || null;

      const tokenInsertResult = await client.query(
        `INSERT INTO tokens (
           token_number, token_code, service_id, session_id, user_id,
           customer_name, customer_phone, priority, notes, status, issued_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'waiting', NOW())
         RETURNING id, token_number, token_code, service_id, session_id,
                   user_id, customer_name, priority, status, issued_at`,
        [
          nextGlobalTokenNumber,
          tokenCode,
          serviceId,
          sessionId,
          userId,
          customerName,
          customerPhone,
          priority,
          notes,
        ]
      );

      newToken = {
        ...tokenInsertResult.rows[0],
        service_name: service.name,
        estimated_wait_min: estimatedWaitMin,
      };

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    // ── Release Redis lock & Invalidate Cache ─────────────────────────────────
    if (redis && lockAcquired) {
      await releaseLock(redis, lockValue);
      await redis.del(REDIS_LAST_TOKEN_KEY);
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    }

    // ── MongoDB Activity Logging ─────────────────────────────────────────────
    await logActivity('TOKEN_ISSUED', {
      performedBy: req.user
        ? { userId: req.user.id, username: req.user.username, role: req.user.role }
        : { userId: null, username: newToken.customer_name, role: 'user' },
      details: {
        tokenId: newToken.id,
        tokenCode: newToken.token_code,
        serviceId: newToken.service_id,
        serviceName: newToken.service_name,
        priority: newToken.priority,
      },
      ...getRequestMeta(req),
    });

    return res.status(201).json({
      success: true,
      message: `Token ${newToken.token_code} (#${newToken.token_number}) issued successfully`,
      data: { token: newToken },
    });
  } catch (err) {
    if (redis && lockAcquired) {
      await releaseLock(redis, lockValue);
    }
    next(err);
  }
};

/**
 * GET /api/tokens
 * Returns paginated list of tokens with filters (staff only).
 */
const getAllTokens = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const serviceId = req.query.service_id ? parseInt(req.query.service_id) : null;

    let query = `
      SELECT t.id, t.token_number, t.token_code, t.status, t.priority,
             t.issued_at, t.called_at, t.started_at, t.completed_at, t.served_at,
             t.customer_name, t.customer_phone, t.notes,
             u.username,
             s.name AS service_name, s.prefix AS service_prefix,
             c.counter_number, c.name AS counter_name
      FROM tokens t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN services s ON t.service_id = s.id
      LEFT JOIN counters c ON t.counter_id = c.id
    `;
    const params = [];

    const conditions = [];
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (serviceId) {
      params.push(serviceId);
      conditions.push(`t.service_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY t.priority DESC, t.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    let countQuery = 'SELECT COUNT(*) FROM tokens t';
    const countParams = [];
    if (conditions.length > 0) {
      const countConds = [];
      if (status) {
        countParams.push(status);
        countConds.push(`t.status = $${countParams.length}`);
      }
      if (serviceId) {
        countParams.push(serviceId);
        countConds.push(`t.service_id = $${countParams.length}`);
      }
      countQuery += ` WHERE ${countConds.join(' AND ')}`;
    }

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
 * Returns caller's active token with live counter and service assignment.
 */
const getMyToken = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.token_number, t.token_code, t.status, t.priority,
              t.issued_at, t.called_at, t.started_at, t.completed_at, t.served_at,
              s.name AS service_name, s.estimated_duration_min,
              c.counter_number, c.name AS counter_name
       FROM tokens t
       LEFT JOIN services s ON t.service_id = s.id
       LEFT JOIN counters c ON t.counter_id = c.id
       WHERE t.user_id = $1 AND t.status IN ('waiting', 'called', 'serving')
       ORDER BY t.issued_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'No active ticket found for this account' });
    }

    const token = result.rows[0];

    // Compute live queue position
    let positionAhead = 0;
    if (token.status === 'waiting') {
      const posRes = await pool.query(
        `SELECT COUNT(*) AS pos
         FROM tokens
         WHERE status = 'waiting'
           AND (priority > $1 OR (priority = $1 AND issued_at < $2))`,
        [token.priority, token.issued_at]
      );
      positionAhead = parseInt(posRes.rows[0].pos);
    }

    return res.json({
      success: true,
      data: {
        token: {
          ...token,
          position_ahead: positionAhead,
          estimated_wait_min: Math.max(2, positionAhead * (token.estimated_duration_min || 5)),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tokens/:id/cancel
 * Cancels a waiting token (Customer self-service or staff).
 */
const cancelToken = async (req, res, next) => {
  const tokenId = parseInt(req.params.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find and lock token
    const tokenRes = await client.query(
      'SELECT id, token_number, token_code, user_id, status FROM tokens WHERE id = $1 FOR UPDATE',
      [tokenId]
    );

    const token = tokenRes.rows[0];
    if (!token) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Token not found' });
    }

    // Permission check: caller must own token or be staff
    if (req.user.role !== 'staff' && req.user.role !== 'admin' && token.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this token' });
    }

    if (token.status !== 'waiting' && token.status !== 'called') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a token that is already ${token.status}`,
      });
    }

    await client.query(
      `UPDATE tokens SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [tokenId]
    );

    await client.query('COMMIT');

    try {
      const redis = getRedis();
      await redis.del(REDIS_QUEUE_STATUS_KEY);
    } catch (_) {}

    await logActivity('TOKEN_CANCELLED', {
      performedBy: { userId: req.user.id, username: req.user.username, role: req.user.role },
      details: { tokenId, tokenCode: token.token_code },
      ...getRequestMeta(req),
    });

    return res.json({
      success: true,
      message: `Token ${token.token_code || '#' + token.token_number} cancelled successfully`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { generateToken, getAllTokens, getMyToken, cancelToken };
