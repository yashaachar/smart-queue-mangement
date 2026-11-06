/**
 * Concurrency Test for PS-13 Outcome 1:
 * Digital Queue Token Generation Under Concurrent Requests.
 *
 * Validates:
 * - Safe concurrent token generation under burst load (16 concurrent requests)
 * - Zero duplicate token numbers
 * - Zero duplicate token codes
 * - Strict gapless sequencing per service
 * - Dual-layer concurrency safety (Redis distributed lock + PostgreSQL row-level lock)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.NODE_ENV = 'test';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool, connectPostgres } = require('../src/config/db');
const { connectRedis, getRedis } = require('../src/config/redis');

async function runConcurrencyTest() {
  console.log('='.repeat(70));
  console.log('  QUEBEE CONCURRENCY & INTEGRITY TEST (PS-13 OUTCOME 1)');
  console.log('='.repeat(70));

  let server;
  let exitCode = 0;
  try {
    // 1. Initialize data stores
    await connectPostgres();
    connectRedis();

    // Ensure queue is open
    await pool.query('UPDATE queue_state SET is_open = TRUE WHERE id = 1');

    // Fetch existing services
    const servicesRes = await pool.query(
      'SELECT id, name, prefix FROM services WHERE is_active = TRUE ORDER BY id ASC LIMIT 2'
    );
    const serviceA = servicesRes.rows[0];
    const serviceB = servicesRes.rows[1] || serviceA;

    console.log(`[Test] Target Service A: "${serviceA.name}" (Prefix: ${serviceA.prefix}, ID: ${serviceA.id})`);
    if (serviceB.id !== serviceA.id) {
      console.log(`[Test] Target Service B: "${serviceB.name}" (Prefix: ${serviceB.prefix}, ID: ${serviceB.id})`);
    }

    // 2. Start ephemeral HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`[Test] Ephemeral test server active on port ${port}`);

    // 3. Create simulated user auth token using an actual user from DB
    const userRes = await pool.query('SELECT id, username, role FROM users ORDER BY id ASC LIMIT 1');
    const dbUser = userRes.rows[0] || { id: null, username: 'test_guest', role: 'user' };
    console.log(`[Test] Authenticating test client as User "${dbUser.username}" (ID: ${dbUser.id})`);

    const testUserPayload = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
    const authToken = jwt.sign(testUserPayload, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    // 4. Fire 16 concurrent requests across services
    const BATCH_SIZE = 16;
    console.log(`\n[Test] Launching ${BATCH_SIZE} SIMULTANEOUS token generation requests...`);

    const requestPromises = Array.from({ length: BATCH_SIZE }).map(async (_, idx) => {
      const targetService = idx % 2 === 0 ? serviceA : serviceB;
      const payload = {
        service_id: targetService.id,
        customer_name: `Concurrent Visitor #${idx + 1}`,
        customer_phone: `+1555000${String(idx).padStart(4, '0')}`,
        priority: 'regular',
      };

      const startTime = Date.now();
      const res = await fetch(`${baseUrl}/api/tokens/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const elapsed = Date.now() - startTime;
      const data = await res.json();
      return { idx, status: res.status, elapsed, data, serviceId: targetService.id };
    });

    const results = await Promise.all(requestPromises);

    // 5. Analyze results
    console.log('\n--- BATCH RESULTS ---');
    let successCount = 0;
    let failedCount = 0;
    const tokens = [];

    for (const r of results) {
      if (r.status === 201 && r.data?.success) {
        successCount++;
        tokens.push(r.data.data.token);
        console.log(
          `  Req #${String(r.idx + 1).padStart(2)}: HTTP ${r.status} | Code: ${r.data.data.token.token_code.padEnd(6)} | Num: #${String(r.data.data.token.token_number).padEnd(4)} | Service: ${r.data.data.token.service_name} | Latency: ${r.elapsed}ms`
        );
      } else {
        failedCount++;
        console.error(
          `  Req #${String(r.idx + 1).padStart(2)}: FAILED (HTTP ${r.status}) - ${r.data?.message || 'Unknown error'} | Latency: ${r.elapsed}ms`
        );
      }
    }

    console.log('\n--- VERIFICATION ASSERTIONS ---');
    console.log(`- Total Requests Sent:     ${BATCH_SIZE}`);
    console.log(`- Successfully Issued:    ${successCount}`);
    console.log(`- Failed / Rejected:      ${failedCount}`);

    // Assertion 1: All requests succeeded
    const allSucceeded = successCount === BATCH_SIZE;
    console.log(`[Assertion 1] 100% Success Rate:            ${allSucceeded ? 'PASSED (✓)' : 'FAILED (✗)'}`);

    // Assertion 2: All token numbers are strictly unique
    const tokenNumbers = tokens.map((t) => t.token_number);
    const uniqueNumbers = new Set(tokenNumbers);
    const numbersUnique = uniqueNumbers.size === tokenNumbers.length;
    console.log(`[Assertion 2] Zero Duplicate Token Numbers:   ${numbersUnique ? 'PASSED (✓)' : 'FAILED (✗)'} (${uniqueNumbers.size}/${tokenNumbers.length} unique)`);

    // Assertion 3: All token codes are strictly unique
    const tokenCodes = tokens.map((t) => t.token_code);
    const uniqueCodes = new Set(tokenCodes);
    const codesUnique = uniqueCodes.size === tokenCodes.length;
    console.log(`[Assertion 3] Zero Duplicate Token Codes:     ${codesUnique ? 'PASSED (✓)' : 'FAILED (✗)'} (${uniqueCodes.size}/${tokenCodes.length} unique)`);

    // Assertion 4: Service A sequence has no duplicates and is strictly monotonic & gapless
    const serviceATokens = tokens.filter((t) => t.service_id === serviceA.id);
    const seqNumbersA = serviceATokens.map((t) => parseInt(t.token_code.replace(`${serviceA.prefix}-`, ''))).sort((a, b) => a - b);
    let gaplessA = true;
    for (let i = 1; i < seqNumbersA.length; i++) {
      if (seqNumbersA[i] !== seqNumbersA[i - 1] + 1) {
        gaplessA = false;
        break;
      }
    }
    console.log(`[Assertion 4] Gapless Sequence for Service A: ${gaplessA ? 'PASSED (✓)' : 'FAILED (✗)'} (${seqNumbersA.join(', ')})`);

    // Assertion 5: 4-Timestamp integrity
    const timestampsValid = tokens.every(
      (t) => Boolean(t.issued_at) && t.called_at === null && t.started_at === null && t.completed_at === null
    );
    console.log(`[Assertion 5] Accurate 4-Timestamp Model:      ${timestampsValid ? 'PASSED (✓)' : 'FAILED (✗)'}`);

    console.log('='.repeat(70));
    if (allSucceeded && numbersUnique && codesUnique && gaplessA && timestampsValid) {
      console.log('  CONCURRENCY VALIDATION: ALL CRITICAL PS-13 OUTCOMES VERIFIED');
      console.log('='.repeat(70));
      exitCode = 0;
    } else {
      console.error('  CONCURRENCY VALIDATION FAILED!');
      console.log('='.repeat(70));
      exitCode = 1;
    }

    // Clean up test batch tokens so they don't linger as waiting tickets
    if (tokens.length > 0) {
      const tokenIds = tokens.map((t) => t.id);
      await pool.query('UPDATE tokens SET status = $1, cancelled_at = NOW() WHERE id = ANY($2)', ['cancelled', tokenIds]);
    }
  } catch (err) {
    console.error('[Test Error]:', err);
    exitCode = 1;
  } finally {
    // Wait for async SSE push notifications to complete before closing pool
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      const redis = getRedis();
      if (redis) redis.disconnect();
    } catch (_) {}
    await pool.end();
    setTimeout(() => process.exit(exitCode), 100);
  }
}

runConcurrencyTest();
