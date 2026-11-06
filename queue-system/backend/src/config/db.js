const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'queueuser',
  password: process.env.PG_PASSWORD || 'queuepass',
  database: process.env.PG_DATABASE || 'queuedb',
  max: 20,                  // max pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected client error:', err.message);
});

const connectPostgres = async () => {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('[PostgreSQL] Connected successfully');
};

module.exports = { pool, connectPostgres };
