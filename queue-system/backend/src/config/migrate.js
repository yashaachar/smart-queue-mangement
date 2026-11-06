/**
 * PostgreSQL schema migration script for Quebee.
 * Supports universal multi-industry queues, accurate service time tracking,
 * session-based non-destructive resets, and multi-counter management.
 *
 * Run: node src/config/migrate.js
 */
require('dotenv').config();
const { pool } = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Users Table (Preserved & Enhanced) ─────────────────────────────────
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

    // ── 2. Organizations Table (Multi-Industry) ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        industry    VARCHAR(50)  NOT NULL DEFAULT 'general',
        slug        VARCHAR(80)  NOT NULL UNIQUE,
        settings    JSONB        DEFAULT '{}'::jsonb,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── 3. Queue Sessions (Non-destructive Reset & Historical Analytics) ───────
    await client.query(`
      CREATE TABLE IF NOT EXISTS queue_sessions (
        id               SERIAL PRIMARY KEY,
        organization_id  INT REFERENCES organizations(id) ON DELETE CASCADE,
        session_code     VARCHAR(60) NOT NULL UNIQUE,
        session_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        is_active        BOOLEAN NOT NULL DEFAULT TRUE,
        started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at        TIMESTAMPTZ
      );
    `);

    // ── 4. Departments Table ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id               SERIAL PRIMARY KEY,
        organization_id  INT REFERENCES organizations(id) ON DELETE CASCADE,
        name             VARCHAR(100) NOT NULL,
        code             VARCHAR(20)  NOT NULL,
        description      TEXT,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── 5. Services Table (Prefix, Duration, Priority Weight) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id                     SERIAL PRIMARY KEY,
        department_id          INT REFERENCES departments(id) ON DELETE SET NULL,
        name                   VARCHAR(100) NOT NULL,
        code                   VARCHAR(20)  NOT NULL,
        prefix                 VARCHAR(10)  NOT NULL DEFAULT 'A',
        estimated_duration_min INT          NOT NULL DEFAULT 5,
        priority_weight        INT          NOT NULL DEFAULT 0,
        is_active              BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── 6. Service Token Sequences (Transactional Gapless Numbering) ──────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS service_token_sequences (
        service_id    INT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
        last_number   INT NOT NULL DEFAULT 0,
        session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 7. Counters Table (Multi-Counter Staff Terminals) ─────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS counters (
        id                SERIAL PRIMARY KEY,
        department_id     INT REFERENCES departments(id) ON DELETE SET NULL,
        counter_number    INT NOT NULL,
        name              VARCHAR(80) NOT NULL,
        current_staff_id  INT REFERENCES users(id) ON DELETE SET NULL,
        current_token_id  INT,
        status            VARCHAR(20) NOT NULL DEFAULT 'idle',
        is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 8. Queue State (Preserved for Backwards-Compatibility) ─────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS queue_state (
        id                INT          PRIMARY KEY DEFAULT 1,
        last_token_number INT          NOT NULL DEFAULT 0,
        current_serving   INT          NOT NULL DEFAULT 0,
        is_open           BOOLEAN      NOT NULL DEFAULT TRUE,
        opened_at         TIMESTAMPTZ,
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);

    await client.query(`
      INSERT INTO queue_state (id, last_token_number, current_serving, is_open, opened_at)
      VALUES (1, 0, 0, TRUE, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── 9. Tokens Table (Enriched with 4 Exact Timestamps & Service FKs) ───────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id           SERIAL       PRIMARY KEY,
        token_number INT          NOT NULL,
        user_id      INT          REFERENCES users(id) ON DELETE SET NULL,
        status       VARCHAR(20)  NOT NULL DEFAULT 'waiting',
        issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        served_at    TIMESTAMPTZ
      );
    `);

    // Ensure columns exist on tokens for universal operation & precision timestamps
    await client.query(`
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS session_id INT REFERENCES queue_sessions(id) ON DELETE SET NULL;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS service_id INT REFERENCES services(id) ON DELETE SET NULL;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS counter_id INT REFERENCES counters(id) ON DELETE SET NULL;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS token_code VARCHAR(30);
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
      ALTER TABLE tokens ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    // Drop and re-create status check to support full queue lifecycle state machine
    await client.query(`
      ALTER TABLE tokens DROP CONSTRAINT IF EXISTS status_check;
      ALTER TABLE tokens ADD CONSTRAINT status_check 
        CHECK (status IN ('waiting', 'called', 'serving', 'completed', 'served', 'skipped', 'cancelled', 'no_show'));
    `);

    // Drop legacy global unique constraint on token_number if present so token numbers can be per-service or per-session
    await client.query(`
      ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_token_number_key;
    `);

    // ── 10. Performance & Integrity Indexes ───────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_status       ON tokens (status);
      CREATE INDEX IF NOT EXISTS idx_tokens_token_number ON tokens (token_number);
      CREATE INDEX IF NOT EXISTS idx_tokens_user_id      ON tokens (user_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_service_id   ON tokens (service_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_counter_id   ON tokens (counter_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_session_id   ON tokens (session_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_issued_at    ON tokens (issued_at);
      CREATE INDEX IF NOT EXISTS idx_counters_status     ON counters (status);
      CREATE INDEX IF NOT EXISTS idx_services_active     ON services (is_active);
    `);

    // ── 11. Seed Default Data (Out-of-the-box Multi-Industry Setup) ───────────
    // Seed Organization
    const orgRes = await client.query(`
      INSERT INTO organizations (name, industry, slug, settings)
      VALUES (
        'Quebee Universal Service Center',
        'general',
        'quebee-main',
        '{"allowWalkins": true, "maxTokensPerUser": 1, "autoRecallLimit": 3}'::jsonb
      )
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    // Seed Active Session for today
    const sessionRes = await client.query(`
      INSERT INTO queue_sessions (organization_id, session_code, session_date, is_active)
      VALUES (
        $1,
        CONCAT('SESS-', TO_CHAR(CURRENT_DATE, 'YYYYMMDD'), '-001'),
        CURRENT_DATE,
        TRUE
      )
      ON CONFLICT (session_code) DO UPDATE SET is_active = TRUE
      RETURNING id;
    `, [orgId]);
    const sessionId = sessionRes.rows[0].id;

    // Seed Departments
    const dept1 = await client.query(`
      INSERT INTO departments (organization_id, name, code, description)
      VALUES ($1, 'Customer Care & General Desk', 'CARE', 'First-contact customer support and general registration')
      ON CONFLICT DO NOTHING
      RETURNING id;
    `, [orgId]);
    const deptId = dept1.rows[0]?.id || 1;

    // Seed Services
    const s1 = await client.query(`
      INSERT INTO services (department_id, name, code, prefix, estimated_duration_min, priority_weight, is_active)
      VALUES 
        ($1, 'General Inquiries & Intake', 'GEN', 'A', 5, 0, TRUE),
        ($1, 'Express Document Verification', 'EXP', 'B', 3, 0, TRUE),
        ($1, 'Consultation & Account Desk', 'CON', 'C', 10, 0, TRUE),
        ($1, 'Priority & Assisted Access', 'PRI', 'P', 7, 1, TRUE)
      ON CONFLICT DO NOTHING
      RETURNING id;
    `, [deptId]);

    // Initialize Service Token Sequences
    await client.query(`
      INSERT INTO service_token_sequences (service_id, last_number, session_date)
      SELECT id, 0, CURRENT_DATE FROM services
      ON CONFLICT (service_id) DO NOTHING;
    `);

    // Seed Multi-Counters
    await client.query(`
      INSERT INTO counters (department_id, counter_number, name, status, is_active)
      VALUES
        ($1, 1, 'Counter 01 — General Intake', 'idle', TRUE),
        ($1, 2, 'Counter 02 — Express Desk', 'idle', TRUE),
        ($1, 3, 'Counter 03 — Priority & Consultations', 'idle', TRUE)
      ON CONFLICT DO NOTHING;
    `, [deptId]);

    await client.query('COMMIT');
    console.log('[Migration] Quebee multi-industry schema evolved & verified successfully.');
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
