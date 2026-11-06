/**
 * PostgreSQL schema migration script.
 * Run once: node src/config/migrate.js
 */
require('dotenv').config();
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── users table ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        username    VARCHAR(80)  NOT NULL UNIQUE,
        email       VARCHAR(255) NOT NULL UNIQUE,
        password    VARCHAR(255) NOT NULL,
        role        VARCHAR(20)  NOT NULL DEFAULT 'user',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── queue_state table (single-row state for the active queue) ─────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS queue_state (
        id               INT          PRIMARY KEY DEFAULT 1,
        last_token_number INT         NOT NULL DEFAULT 0,
        current_serving   INT         NOT NULL DEFAULT 0,
        is_open           BOOLEAN     NOT NULL DEFAULT TRUE,
        opened_at         TIMESTAMPTZ,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);

    // Seed the single queue_state row if it doesn't exist
    await client.query(`
      INSERT INTO queue_state (id, last_token_number, current_serving, is_open, opened_at)
      VALUES (1, 0, 0, TRUE, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── tokens table ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id           SERIAL       PRIMARY KEY,
        token_number INT          NOT NULL UNIQUE,
        user_id      INT          REFERENCES users(id) ON DELETE SET NULL,
        status       VARCHAR(20)  NOT NULL DEFAULT 'waiting',
        issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        served_at    TIMESTAMPTZ,
        CONSTRAINT status_check CHECK (status IN ('waiting', 'serving', 'served', 'skipped'))
      );
    `);

    // ── indexes ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_status       ON tokens (status);
      CREATE INDEX IF NOT EXISTS idx_tokens_token_number ON tokens (token_number);
      CREATE INDEX IF NOT EXISTS idx_tokens_user_id      ON tokens (user_id);
    `);

    await client.query('COMMIT');
    console.log('[Migration] All tables created/verified successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migration] Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
