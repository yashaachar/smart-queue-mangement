/**
 * Quebee Fresh Demo Reset Script
 *
 * Resets the entire system to a pristine, clean state for Hackathon live demos:
 * - Empties all test tokens
 * - Resets service sequence counters to 0
 * - Resets global queue state to 0 (Now Serving: none, 0 in line)
 * - Sets all counter desks to Idle
 * - Clears in-memory Redis cache & locks
 * - Clears MongoDB activity logs
 * - Ensures ready-to-use demo accounts (staff1@test.com, patient1@test.com, patient2@test.com)
 * - Broadcasts real-time SSE reset signal to any open browsers
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { pool, connectPostgres } = require('../config/db');
const { connectRedis, getRedis } = require('../config/redis');
const { connectMongo } = require('../config/mongo');
const ActivityLog = require('../models/ActivityLog');
const { notifyQueueUpdate } = require('../services/sseHub');

async function resetFreshDemo() {
  console.log('='.repeat(65));
  console.log('  QUEBEE HACKATHON DEMO: PRISTINE DATABASE RESET');
  console.log('='.repeat(65));

  try {
    await connectPostgres();
    connectRedis();
    await connectMongo();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      console.log('1. Clearing test tokens...');
      await client.query('DELETE FROM tokens');

      console.log('2. Resetting service sequences to 0...');
      await client.query('UPDATE service_token_sequences SET last_number = 0, updated_at = NOW()');
      await client.query('DELETE FROM queue_sessions');

      console.log('3. Resetting global queue state to 0...');
      await client.query(`
        UPDATE queue_state 
        SET last_token_number = 0, current_serving = 0, is_open = TRUE, opened_at = NOW(), updated_at = NOW() 
        WHERE id = 1
      `);

      console.log('4. Resetting all counter desks to Idle...');
      await client.query(`
        UPDATE counters 
        SET status = 'idle', current_token_id = NULL, updated_at = NOW()
      `);

      console.log('5. Ensuring verified demo users...');
      const hashedPassword = await bcrypt.hash('pass123', 10);

      // Upsert Staff 1
      await client.query(`
        INSERT INTO users (username, email, password, role)
        VALUES ('staff1', 'staff1@test.com', $1, 'staff')
        ON CONFLICT (email) DO UPDATE SET password = $1, role = 'staff'
      `, [hashedPassword]);

      // Upsert Patient 1
      await client.query(`
        INSERT INTO users (username, email, password, role)
        VALUES ('patient1', 'patient1@test.com', $1, 'user')
        ON CONFLICT (email) DO UPDATE SET password = $1, role = 'user'
      `, [hashedPassword]);

      // Upsert Patient 2
      await client.query(`
        INSERT INTO users (username, email, password, role)
        VALUES ('patient2', 'patient2@test.com', $1, 'user')
        ON CONFLICT (email) DO UPDATE SET password = $1, role = 'user'
      `, [hashedPassword]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 6. Redis Flush
    console.log('6. Flushing Redis cache keys...');
    try {
      const redis = getRedis();
      if (redis) {
        await redis.del('queue:status');
        await redis.del('queue:last_token_number');
        await redis.del('queue:token_issue_lock');
      }
    } catch (redisErr) {
      console.warn('   Redis cache flush skipped:', redisErr.message);
    }

    // 7. Mongo Activity Logs Clean
    console.log('7. Clearing MongoDB activity logs...');
    try {
      if (mongoose.connection.readyState === 1) {
        await ActivityLog.deleteMany({});
        await ActivityLog.create({
          action: 'QUEUE_RESET',
          performedBy: { userId: null, username: 'System', role: 'admin' },
          details: { reason: 'Pristine reset for hackathon demo evaluation' },
          ipAddress: '127.0.0.1',
          userAgent: 'DemoInit/1.0',
        });
      }
    } catch (mErr) {
      console.warn('   Mongo log reset skipped:', mErr.message);
    }

    // 8. Broadcast real-time SSE reset to all open browser windows
    notifyQueueUpdate();

    console.log('='.repeat(65));
    console.log('  SUCCESS! QUEBEE IS NOW IN A 100% PRISTINE FRESH STATE');
    console.log('='.repeat(65));
    console.log('  Ready Demo Accounts:');
    console.log('  • Staff:    staff1@test.com   /  pass123');
    console.log('  • Visitor:  patient1@test.com /  pass123');
    console.log('  • Visitor:  patient2@test.com /  pass123');
    console.log('='.repeat(65));
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err);
    process.exit(1);
  }
}

resetFreshDemo();
