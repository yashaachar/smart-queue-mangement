
**Assignment:** Queue Management System (Token System)  
**Stack:** React · Node.js · Express · PostgreSQL · MongoDB · Redis  
**Author:** Yasha V  
**Date:** August 2026

---

## 1. Problem Understanding & Assumptions

### Problem
Build a hospital-style token queue system where:
- Users take a numbered token and wait in a single queue
- Tokens are assigned sequentially (1, 2, 3, ...)
- Staff call the next token to serve patients in strict order
- The system shows which token is currently being served

### Key Challenge
When the counter opens, multiple people request tokens simultaneously within the same second. Every token number must be **unique and strictly sequential** — no duplicates, no gaps — even under concurrent load.

### Assumptions
- Single queue (one counter)
- Tokens reset at the start of each day (staff resets manually)
- Any registered user can take a token; only staff can advance the queue
- The display board is public (no login required to view)
- A user can hold only one active token at a time
- Redis is available but the system degrades gracefully if it goes down (PostgreSQL lock alone is sufficient)

---

## 2. High-Level Design (HLD)

```
┌─────────────────────────────────────────────────────┐
│                    React Frontend                    │
│  Display Board │ Take Token │ Staff Dashboard │ Logs │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (REST API)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Node.js + Express API Server            │
│                                                      │
│  /api/auth    /api/tokens    /api/queue              │
│                                                      │
│  Middleware: JWT Auth · Rate Limiter · Validator     │
└──────┬───────────────┬──────────────────┬───────────┘
       │               │                  │
       ▼               ▼                  ▼
┌──────────┐   ┌──────────────┐   ┌─────────────┐
│ PostgreSQL│   │    Redis     │   │   MongoDB   │
│           │   │              │   │             │
│ users     │   │ queue:status │   │ activity_   │
│ tokens    │   │ (5s cache)   │   │ logs        │
│queue_state│   │ token_lock   │   │             │
└──────────┘   └──────────────┘   └─────────────┘
```

**Request flow for token generation:**
1. Client sends `POST /api/tokens/generate`
2. Rate limiter checks (10 req/min per IP)
3. JWT middleware verifies user identity
4. Controller acquires Redis distributed lock (`SET NX PX 5000`)
5. Opens PostgreSQL transaction, runs `SELECT ... FOR UPDATE` on `queue_state`
6. Increments `last_token_number`, inserts new token row, commits
7. Releases Redis lock, invalidates Redis cache
8. Logs action to MongoDB asynchronously
9. Returns new token to client

---

## 3. Database Schema

### Why PostgreSQL for core data?
Tokens and queue state require **ACID transactions** and **row-level locking**. PostgreSQL's `SELECT ... FOR UPDATE` guarantees that concurrent requests cannot read the same counter value and produce duplicate token numbers. This is the transactional core of the system.

### Why MongoDB for logs?
Activity logs are **write-heavy**, **schema-flexible**, and do not need relational integrity. Each log entry has a different `details` payload depending on the action type — MongoDB's document model handles this naturally without ALTER TABLE migrations.

### Why Redis for caching and locking?
The queue status endpoint is the **hottest read** — every patient's browser polls it every 3 seconds. Caching the response in Redis for 5 seconds reduces PostgreSQL load significantly. Redis also provides a fast distributed lock primitive (`SET NX`) that serialises concurrent token requests at the application layer.

### PostgreSQL Tables

**users**
```
id          SERIAL PRIMARY KEY
username    VARCHAR(80) UNIQUE NOT NULL
email       VARCHAR(255) UNIQUE NOT NULL
password    VARCHAR(255) NOT NULL          -- bcrypt hashed
role        VARCHAR(20) DEFAULT 'user'     -- user | staff | admin
created_at  TIMESTAMPTZ DEFAULT NOW()
```

**queue_state** (single row, id=1)
```
id                INT PRIMARY KEY DEFAULT 1
last_token_number INT DEFAULT 0            -- highest token issued
current_serving   INT DEFAULT 0            -- token currently being served
is_open           BOOLEAN DEFAULT TRUE     -- counter open/closed flag
opened_at         TIMESTAMPTZ
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

**tokens**
```
id           SERIAL PRIMARY KEY
token_number INT UNIQUE NOT NULL           -- sequential, never duplicated
user_id      INT REFERENCES users(id)
status       VARCHAR(20) DEFAULT 'waiting' -- waiting|serving|served|skipped
issued_at    TIMESTAMPTZ DEFAULT NOW()
served_at    TIMESTAMPTZ
```

**Indexes:**
```sql
CREATE INDEX idx_tokens_status        ON tokens (status);
CREATE INDEX idx_tokens_token_number  ON tokens (token_number);
CREATE INDEX idx_tokens_user_id       ON tokens (user_id);
```

### MongoDB Collection

**activity_logs**
```json
{
  "_id": ObjectId,
  "action": "TOKEN_ISSUED | QUEUE_ADVANCED | USER_LOGIN | ...",
  "performedBy": {
    "userId": 1,
    "username": "patient1",
    "role": "user"
  },
  "details": { "tokenNumber": 5, "tokenId": 12 },
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```
Indexes: `{ createdAt: -1 }`, `{ action: 1, createdAt: -1 }`

---

## 4. API Contract

### Auth

| Method | Endpoint | Auth | Request Body | Response |
|--------|----------|------|-------------|----------|
| POST | `/api/auth/register` | — | `{ username, email, password, role }` | `{ user, token }` |
| POST | `/api/auth/login` | — | `{ email, password }` | `{ user, token }` |
| GET | `/api/auth/me` | User | — | `{ user }` |

### Tokens

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/api/tokens/generate` | User | — | `{ token: { id, token_number, status, issued_at } }` |
| GET | `/api/tokens/my` | User | — | `{ token }` |
| GET | `/api/tokens` | Staff | `?page&limit&status` | `{ tokens[], pagination }` |

### Queue

| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| GET | `/api/queue/status` | — | — | `{ isOpen, currentServing, waitingCount, servedCount, totalIssued }` |
| POST | `/api/queue/next` | Staff | — | `{ nowServing: 2 }` |
| POST | `/api/queue/reset` | Staff | — | `{ message }` |
| PATCH | `/api/queue/toggle` | Staff | — | `{ isOpen: false }` |
| GET | `/api/queue/logs` | Staff | `?page&limit` | `{ logs[], pagination }` |

### Error Responses
All errors return:
```json
{ "success": false, "message": "Human-readable error" }
```
- `400` — Bad request / queue closed
- `401` — Missing or invalid JWT
- `403` — Insufficient role (not staff)
- `404` — Resource not found
- `409` — Conflict (duplicate)
- `422` — Validation failed (with `errors[]` array)
- `429` — Rate limit exceeded
- `500` — Internal server error (no stack trace exposed)

---

## 5. Concurrency Solution

### The Problem
When 5 patients click "Get Token" simultaneously, all 5 requests read `last_token_number = 0` before any of them can write, causing all 5 to try inserting token #1 — creating duplicates.

### Solution: Dual-Layer Locking

**Layer 1 — Redis Distributed Lock**
```
SET queue:token_issue_lock <unique_value> NX PX 5000
```
- `NX` — only succeeds if the key does not exist (atomic)
- `PX 5000` — auto-expires after 5 seconds (prevents deadlocks)
- Only one request acquires the lock; others receive HTTP 429
- Lock is released immediately after the DB transaction commits
- The unique value prevents a request from accidentally releasing another request's lock

**Layer 2 — PostgreSQL Row-Level Lock**
```sql
BEGIN;
SELECT last_token_number, is_open
FROM queue_state WHERE id = 1
FOR UPDATE;          -- blocks all other transactions here
-- increment and insert
COMMIT;
```
- `FOR UPDATE` locks the `queue_state` row for the duration of the transaction
- Any other transaction attempting the same lock will block (wait) until the first commits
- This guarantees atomicity at the database level even if Redis is unavailable

**Result:** 5 simultaneous requests → tokens #1, #2, #3, #4, #5. Unique, sequential, no gaps.

**Queue advancement** uses `FOR UPDATE SKIP LOCKED`:
```sql
SELECT id, token_number FROM tokens
WHERE status = 'waiting'
ORDER BY token_number ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```
`SKIP LOCKED` means if two staff members click "Next" simultaneously, the second request skips the row already locked by the first — preventing double-advancement.

---

## 6. Redis Usage Plan

| Redis Key | Purpose | TTL | Invalidation |
|-----------|---------|-----|-------------|
| `queue:status` | Cached JSON of full queue status | 5 seconds | On every queue mutation (next, reset, toggle) |
| `queue:token_issue_lock` | Distributed lock for token generation | 5 seconds (auto-expire) | Deleted immediately after transaction commits |
| `queue:last_token_number` | Invalidation signal for token count | — | Deleted on every new token |

**Cache strategy for `GET /api/queue/status`:**
- This is the hottest endpoint — every waiting patient polls it every 3 seconds
- Cache hit returns instantly from Redis, bypassing PostgreSQL entirely
- Cache miss queries PostgreSQL, stores result, returns to client
- 5-second TTL balances freshness vs. DB load
- Invalidated immediately on any state change so staff actions reflect instantly

**Rate limiting:**
- Token generation: 10 requests/minute per IP (`express-rate-limit`)
- Auth endpoints: 20 requests/15 minutes per IP

---

## 7. Security Approach

- **Passwords** — hashed with bcrypt (12 salt rounds), never stored in plain text
- **Authentication** — JWT tokens signed with `HS256`, expire in 24 hours, stored in `localStorage`
- **Authorization** — role-based middleware (`authenticate` + `requireStaff`) on all protected routes
- **Input validation** — `express-validator` on all POST body fields; validation errors return 422 with field-level messages
- **SQL injection** — prevented by parameterized queries (`$1, $2` placeholders via `pg` library), never string interpolation
- **NoSQL injection** — prevented by Mongoose schema enforcement and typed fields
- **Secrets** — all credentials in `.env` file, never hardcoded, `.env` in `.gitignore`
- **HTTP security headers** — `helmet` middleware sets CSP, X-Frame-Options, HSTS, etc.
- **CORS** — restricted to `FRONTEND_URL` environment variable only
- **Request size limit** — Express body parser capped at 10kb to prevent payload attacks
- **Rate limiting** — on token generation and auth endpoints to prevent brute force and abuse

---

## 8. Scalability & Performance

### Current optimizations
- PostgreSQL indexes on `tokens.status`, `tokens.token_number`, `tokens.user_id`
- Redis caching of the hottest read endpoint (queue status)
- Pagination on all list endpoints (no unbounded queries)
- MongoDB indexes on `createdAt` and `action` for fast log queries
- PostgreSQL connection pool (max 20 connections via `pg-pool`)

### Horizontal scaling to 100x traffic

| Layer | Strategy |
|-------|----------|
| App servers | Multiple Node.js instances behind nginx load balancer. Redis lock already works cross-process. |
| PostgreSQL | Read replicas for queue status reads. PgBouncer for connection pooling. Partition `tokens` table by date for archival. |
| Redis | Redis Cluster or Sentinel for HA. Switch rate limiter to `rate-limit-redis` for cross-instance consistency. |
| MongoDB | Replica set for logs. TTL index to auto-expire logs older than 90 days. |
| Frontend | CDN for static assets. |

---

## 9. Known Limitations & Trade-offs

| Trade-off | What was done | What to do with more time |
|-----------|--------------|--------------------------|
| Rate limiter | In-memory store (single instance only) | Switch to `rate-limit-redis` for cross-instance state |
| Real-time updates | 3-second polling on display board | Replace with Server-Sent Events (SSE) for true push |
| JWT storage | `localStorage` (XSS risk) | Move to `httpOnly` cookies |
| Single queue | Only one queue supported | Add multi-counter support with queue routing |
| No email verification | Users register without email confirmation | Add nodemailer-based verification flow |
| Redis unavailability | PostgreSQL lock alone handles it | Add circuit breaker pattern with proper fallback logging |
| Token history | Old tokens stay in DB forever | Add archival job to move served tokens to cold storage daily |
