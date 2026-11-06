# QUEBEE — Smart Queue & Service-Time Optimization Platform

> **"Smart queues. Better experiences"**
> Academic & Professional Engineering Specification: **PS-13 — Smart Queue and Service-Time Optimization Platform**

Quebee is a high-reliability, universal queue management and service-time optimization platform designed for modern organizations. It eliminates unmanaged customer congestion, guarantees concurrency-safe sequential token issuance, provides calibrated waiting-time estimates, delivers real-time display synchronization via Server-Sent Events (SSE), and surfaces actionable bottleneck analytics.

---

## 1. PS-13 Official Expected Outcomes Matrix

| # | PS-13 Outcome | Quebee Implementation Status | Core Technical Component |
|---|---------------|------------------------------|--------------------------|
| **1** | **Digital Queue Token Generation** | **Fully Implemented & Verified** | Dual-layer concurrency lock (Redis `SET NX PX` + PostgreSQL `FOR UPDATE` on `service_token_sequences`), gapless sequencing (`A-101`, `B-102`), multi-service routing, idempotent lifecycle states. |
| **2** | **Waiting-Time Estimation** | **Fully Implemented & Verified** | Mathematical + Exponential Moving Average (EMA) engine using empirical `(completed_at - started_at)` intervals, active counter throughput, calibrated confidence levels, and user disclaimers. |
| **3** | **Queue Status & Progress Dashboard** | **Fully Implemented & Verified** | Real-time Server-Sent Events (SSE) stream (`/api/queue/stream`), multi-counter digital display board with audio chimes, customer mobile ticket tracker, and staff terminal with consultation timer. |
| **4** | **Peak-Hour & Bottleneck Identification** | **Fully Implemented & Verified** | Hourly arrival volume distribution, wait vs. service time variance benchmarks, counter utilization metrics, and automated service congestion flags. |
| **5** | **Service Analytics & Optimization** | **Fully Implemented & Verified** | Algorithmic staffing recommendations, CSV export for executive audits, and a privacy-conscious grounded AI Queue Assistant with medical guardrails. |

---

## 2. System Architecture

```
                       ┌────────────────────────────────────────┐
                       │          Client Applications           │
                       │  • Live Board (Multi-Counter Display)  │
                       │  • Customer Mobile Ticket Tracker      │
                       │  • Staff Terminal & Consultation Desk  │
                       │  • Operations Analytics Dashboard      │
                       └───────────────────┬────────────────────┘
                                           │
                           REST API / SSE (HTTP/1.1)
                                           │
                       ┌───────────────────▼────────────────────┐
                       │       Quebee Node/Express Core         │
                       │  • Distributed Concurrency Engine      │
                       │  • Waiting-Time Estimation Engine      │
                       │  • SSE Real-Time Event Hub             │
                       │  • Operational Analytics Engine        │
                       │  • Grounded AI Assistant Service       │
                       └──────┬────────────┬─────────────┬──────┘
                              │            │             │
        ┌─────────────────────┘            │             └─────────────────────┐
        ▼                                  ▼                                   ▼
┌───────────────────────┐      ┌───────────────────────┐      ┌────────────────────────┐
│ PostgreSQL 18         │      │ Redis 7               │      │ MongoDB 6+             │
│ (Authoritative Relational) │  │ (Cache & Distributed Lock) │ │ (Append-Only Audit Logs)│
│ • organizations       │      │ • queue:token_issue_lock │   │ • activity_logs        │
│ • departments         │      │ • queue:status cache  │      │ • security & lifecycle │
│ • services & sequences│      │ • atomic sequence keys│      │   event metadata       │
│ • counters & staff    │      └───────────────────────┘      └────────────────────────┘
│ • tokens (4-timestamps)│
│ • queue_sessions      │
└───────────────────────┘
```

---

## 3. High-Concurrency Token Generation Architecture

Under burst traffic (e.g. 20+ clients requesting tokens at the exact same millisecond), token generation must guarantee:
1. **Zero duplicate token numbers.**
2. **Zero duplicate token codes.**
3. **Strictly gapless sequencing** within each service line.

### Dual-Layer Protection Mechanism

1. **Distributed Spin-Lock (Redis Layer):**
   ```javascript
   // Acquires distributed mutual exclusion across multi-process clusters with spin-wait retry
   redis.set('queue:token_issue_lock', lockValue, 'PX', 5000, 'NX');
   ```
2. **Row-Level Transactional Lock (PostgreSQL Layer):**
   ```sql
   -- Strict row lock inside transaction ensures gapless serialization
   SELECT last_number FROM service_token_sequences WHERE service_id = $1 FOR UPDATE;
   UPDATE service_token_sequences SET last_number = last_number + 1 WHERE service_id = $1;
   ```
3. **Non-Blocking Counter Calls:**
   ```sql
   -- Staff advancing queue locks only one waiting token without blocking other counters
   SELECT id FROM tokens WHERE status = 'waiting' ORDER BY priority DESC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
   ```

---

## 4. Accurate 4-Timestamp Lifecycle Model

Quebee tracks four discrete timestamps for every token to compute genuine wait times, call delays, and consultation durations:

```
[issued_at] ────────► [called_at] ────────► [started_at] ────────► [completed_at]
   ▲                      ▲                      ▲                       ▲
   │                      │                      │                       │
Customer takes        Staff desk calls      Customer arrives        Staff completes
digital token         token to counter      at counter desk         service at desk
                      (Waiting Time =       (Desk Delay =           (Service Duration =
                      called - issued)      started - called)       completed - started)
```

- **Waiting Time:** `called_at - issued_at`
- **Call-to-Desk Delay:** `started_at - called_at`
- **Net Service Duration:** `completed_at - started_at`

### Safe Session Archiving
Quebee **never deletes historical token records** on reset. Resetting a queue archives the current session in `queue_sessions`, resets active sequence counters for the new business day, and keeps 100% of historical records intact for operational reporting.

---

## 5. Technology Stack

- **Frontend:** React 18, Vite 5, React Router 6, Lucide React icons, CSS variables / design tokens.
- **Backend:** Node.js 18+ (tested up to Node 24), Express 4.19, Helmet, CORS, Compression.
- **Relational Store:** PostgreSQL 18 with connection pooling and ACID transactional row locking.
- **In-Memory Cache & Lock:** Redis 7 with ioredis client.
- **Audit Store:** MongoDB 6+ with Mongoose schema models.
- **Streaming:** Server-Sent Events (SSE) with heartbeat keep-alive.

---

## 6. Project Directory Structure

```
queue-system/
├── docker-compose.yml          # Container configuration for Postgres, Redis, and Mongo
├── README.md                   # System documentation
├── backend/
│   ├── .env.example            # Environment template
│   ├── package.json
│   ├── src/
│   │   ├── server.js           # Server bootstrap and database verification
│   │   ├── app.js              # Express middleware and route mounting
│   │   ├── config/
│   │   │   ├── db.js           # PostgreSQL connection pool
│   │   │   ├── mongo.js        # MongoDB connection with credential fallback
│   │   │   ├── redis.js        # Redis client
│   │   │   └── migrate.js      # Relational schema migrations and initial seed data
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── tokenController.js
│   │   │   ├── queueController.js
│   │   │   ├── serviceController.js
│   │   │   ├── analyticsController.js
│   │   │   └── aiController.js
│   │   ├── services/
│   │   │   ├── waitEstimationEngine.js   # PS-13 Outcome 2: Waiting-Time Engine
│   │   │   ├── sseHub.js                 # PS-13 Outcome 3: Real-Time SSE Hub
│   │   │   ├── analyticsService.js       # PS-13 Outcome 4 & 5: Bottleneck Analytics
│   │   │   └── aiAssistantService.js     # PS-13 Outcome 5: Grounded Queue AI
│   │   ├── middleware/
│   │   │   ├── auth.js                   # JWT verification & role authorization
│   │   │   ├── rateLimiter.js            # Abuse prevention
│   │   │   ├── validate.js
│   │   │   └── errorHandler.js
│   │   ├── models/
│   │   │   └── ActivityLog.js            # MongoDB audit log model
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── tokens.js
│   │   │   ├── queue.js
│   │   │   ├── services.js
│   │   │   ├── analytics.js
│   │   │   └── ai.js
│   │   └── utils/
│   │       ├── logger.js
│   │       └── queueStateHelper.js
│   └── tests/
│       └── concurrencyTest.js            # Automated 16-request burst concurrency test
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                       # Client routes and global assistant widget
        ├── api/                          # Axios clients and SSE subscriber
        ├── context/                      # AuthContext
        ├── components/
        │   ├── common/                   # BrandLogo, Button, Badge, Card, StatCard, Modal
        │   ├── Navbar.jsx                # Responsive navigation bar
        │   └── QueueAssistantWidget.jsx  # Floating conversational queue assistant
        ├── pages/
        │   ├── LandingPage.jsx           # Minimal SaaS showcase with industry preview
        │   ├── DisplayBoard.jsx          # Real-time multi-counter public display board
        │   ├── TakeTokenPage.jsx         # Customer digital ticket tracker & wait estimates
        │   ├── StaffDashboard.jsx        # Staff desk terminal & consultation timer
        │   ├── AnalyticsPage.jsx         # Bottlenecks, peak hours & staffing suggestions
        │   ├── ActivityLogsPage.jsx      # Audit logging viewer
        │   └── LoginPage.jsx / RegisterPage.jsx
        └── styles/
            └── global.css                # Minimal SaaS design tokens (Linear/Stripe style)
```

---

## 7. Local Setup & Installation

### Step 1: Start Database Services
You can run PostgreSQL, Redis, and MongoDB locally or via Docker:

```bash
docker compose up -d
```
Verify containers are healthy:
```bash
docker compose ps
```

### Step 2: Backend Setup & Migration
```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate        # Executes migrations, creates indexes, seeds default services
npm run dev               # Starts API server on http://localhost:5000 with nodemon
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
npm run dev               # Starts Vite dev server on http://localhost:3000
```

---

## 8. Automated Verification & Concurrency Testing

Quebee includes an automated concurrency validation suite that fires 16 simultaneous burst requests across different services and verifies zero race conditions, gapless sequencing, and 4-timestamp integrity:

```bash
cd backend
npm run test:concurrency
```

**Expected Sample Output:**
```
======================================================================
  QUEBEE CONCURRENCY & INTEGRITY TEST (PS-13 OUTCOME 1)
======================================================================
[PostgreSQL] Connected successfully
[Redis] Connected successfully
[Test] Target Service A: "General Inquiries & Intake" (Prefix: A, ID: 1)
[Test] Target Service B: "Express Document Verification" (Prefix: B, ID: 2)
[Test] Ephemeral test server active on port 51575
[Test] Authenticating test client as User "patient1" (ID: 1)

[Test] Launching 16 SIMULTANEOUS token generation requests...

--- BATCH RESULTS ---
  Req # 1: HTTP 201 | Code: A-11   | Num: #19   | Service: General Inquiries & Intake | Latency: 308ms
  ...
  Req #16: HTTP 201 | Code: B-16   | Num: #34   | Service: Express Document Verification | Latency: 987ms

--- VERIFICATION ASSERTIONS ---
- Total Requests Sent:     16
- Successfully Issued:    16
- Failed / Rejected:      0
[Assertion 1] 100% Success Rate:            PASSED (✓)
[Assertion 2] Zero Duplicate Token Numbers:   PASSED (✓) (16/16 unique)
[Assertion 3] Zero Duplicate Token Codes:     PASSED (✓) (16/16 unique)
[Assertion 4] Gapless Sequence for Service A: PASSED (✓) (11, 12, 13, 14, 15, 16, 17, 18)
[Assertion 5] Accurate 4-Timestamp Model:      PASSED (✓)
======================================================================
  CONCURRENCY VALIDATION: ALL CRITICAL PS-13 OUTCOMES VERIFIED
======================================================================
```

---

## 9. Comprehensive API Reference

### Authentication
- `POST /api/auth/register` — Register customer or staff user.
- `POST /api/auth/login` — Sign in and receive JSON Web Token.
- `GET /api/auth/me` — Retrieve current authenticated profile.

### Digital Tokens (PS-13 Outcome 1)
- `POST /api/tokens/generate` — Generate sequential digital token with dual concurrency lock.
- `GET /api/tokens/my` — Fetch caller's active token and wait-time estimate.
- `GET /api/tokens` *(Staff)* — Paginated token ledger with status and service filters.
- `POST /api/tokens/:id/cancel` — Cancel a waiting token before being called.

### Real-Time Streaming & Queue Management (PS-13 Outcomes 2 & 3)
- `GET /api/queue/stream` — **Server-Sent Events (SSE)** real-time push stream with heartbeats.
- `GET /api/queue/status` — Cached operational queue state snapshot with multi-counter status.
- `POST /api/queue/next` *(Staff)* — Call the next waiting token to an active counter desk (`called_at = NOW()`).
- `POST /api/queue/start-serving` *(Staff)* — Mark token as actively being served (`started_at = NOW()`).
- `POST /api/queue/complete` *(Staff)* — Mark token consultation complete (`completed_at = NOW()`).
- `POST /api/queue/skip` *(Staff)* — Mark no-show / skipped token.
- `POST /api/queue/reset` *(Staff)* — Safe non-destructive session archiving.
- `PATCH /api/queue/toggle` *(Staff)* — Open or close queue intake.

### Services & Counters
- `GET /api/services` — List configured organization services and prefixes.
- `GET /api/services/counters` — List active counter desks and assigned staff.

### Analytics & Explainable AI (PS-13 Outcomes 4 & 5)
- `GET /api/analytics` *(Staff)* — Hourly volume distribution, wait vs service benchmarks, counter utilization, and staffing suggestions.
- `GET /api/analytics/export` *(Staff)* — Download complete token session audit dataset in CSV format.
- `POST /api/ai/chat` — Conversational grounded customer assistant with medical urgency guardrails.
- `GET /api/ai/insights` *(Staff)* — Executive operational digest and efficiency suggestions.

---

## 10. Multi-Industry Configuration

Quebee is architected as an industry-agnostic queue platform:
- **Healthcare:** Multi-triage lines (Urgent Care, Pharmacy, Lab Sample Intake) with clinical disclaimers.
- **Banking:** Cash Teller, Forex Desk, Priority Wealth Management.
- **Government Services:** Passport Applications, Driving License Verification, Civil Registry.
- **Retail & Tech Support:** Genius Bar Intake, Returns & Exchanges, Online Order Pickup.
- **Higher Education:** Registrar Services, Financial Aid Consultation, Student Visa Advisory.

---

## 11. Security & Production Best Practices

- **Zero Client-Side Authoritative State:** Token sequencing, counter assignments, and session states are calculated exclusively on the server.
- **SQL Injection Prevention:** 100% parameterized queries via `pg` connection pool.
- **XSS & Security Headers:** `helmet` security middleware enforced on all routes.
- **Distributed Lock Auto-Expiration:** Redis locks use strict TTLs (5000ms) to prevent deadlock if a server node crashes mid-transaction.
- **Append-Only Auditing:** MongoDB logs all lifecycle events (`TOKEN_ISSUED`, `TOKEN_CALLED`, `TOKEN_STARTED`, `TOKEN_COMPLETED`, `TOKEN_CANCELLED`) with request IPs and user agents.

---

## 12. License & Academic Attribution
Developed under specification **PS-13: Smart Queue and Service-Time Optimization Platform**.
Copyright © 2026 Quebee. All rights reserved.
