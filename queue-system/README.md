# Queue Management System (Token System)

A hospital-style token queue system, built for Bellcorp Studio Assignment 15. The core problem the assignment asks you to solve is concurrency — if five people request a token in the same instant, everyone still needs a unique, sequential number with no duplicates and no gaps. That constraint shaped most of the design decisions below.

**Stack:** React + Vite on the frontend, Node/Express on the backend, PostgreSQL as the primary transactional store, MongoDB for activity logs, and Redis for caching and locking.

## What it does

There are three kinds of users:

- **Patients** can register, log in, take a token, and check their position in the queue.
- **Staff** can open/close the counter, call the next token, reset the queue, and view all tokens and activity logs.
- **Anyone** (no login needed) can view the live "now serving" board.

## The concurrency problem, and how it's handled

This was the part I spent the most time on, since it's also the most heavily weighted in the rubric.

I used two layers of protection:

1. **A Redis distributed lock** (`SET queue:token_issue_lock <value> NX PX 5000`) — this makes sure that even across multiple Node processes, only one token-generation request is actually being processed at a time.
2. **A PostgreSQL row lock** (`SELECT ... FOR UPDATE`) on the single `queue_state` row, inside a transaction, before reading and incrementing `last_token_number`. Even if Redis were down, this alone guarantees the increment can't race.

So if five requests land at the exact same millisecond, they get serialized — first one through gets #1, the next gets #2, and so on, with nothing skipped or duplicated.

For advancing the queue (`POST /api/queue/next`), I used `FOR UPDATE SKIP LOCKED` so that if two staff members click "Next" at the same moment, the queue doesn't get double-advanced.

## Project structure

```
queue-system/
├── docker-compose.yml          # Postgres + MongoDB + Redis
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── server.js           # entry point
│       ├── app.js              # Express app setup
│       ├── config/
│       │   ├── db.js           # Postgres pool
│       │   ├── mongo.js        # Mongoose connection
│       │   ├── redis.js        # ioredis client
│       │   └── migrate.js      # schema migration script
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── tokenController.js
│       │   └── queueController.js
│       ├── middleware/
│       │   ├── auth.js         # JWT authenticate + requireStaff
│       │   ├── errorHandler.js
│       │   ├── validate.js
│       │   └── rateLimiter.js
│       ├── models/
│       │   └── ActivityLog.js  # Mongoose model
│       ├── routes/
│       │   ├── auth.js
│       │   ├── tokens.js
│       │   └── queue.js
│       └── utils/
│           └── logger.js       # writes to MongoDB
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/                # axios instance + API calls
        ├── context/            # AuthContext
        ├── components/         # Navbar, Alert, Spinner, TokenCard
        ├── pages/
        └── styles/
```

## Prerequisites

- Node.js v18+
- Docker Desktop (for the three databases — Postgres, MongoDB, Redis)
- npm

## Running it locally

**1. Start the databases**

```bash
docker compose up -d
```

This brings up Postgres on `5432`, MongoDB on `27017`, and Redis on `6379`. Check they're actually healthy before moving on:

```bash
docker compose ps
```

**2. Backend**

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate   # creates tables, seeds the queue_state row
npm run dev           # nodemon, auto-reloads on changes
```

Runs on `http://localhost:5000`. `GET /health` is a quick way to confirm it's up.

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:3000`. Vite's dev server proxies `/api/*` straight to `localhost:5000`, so there's no CORS setup needed in development.

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill these in (defaults already match `docker-compose.yml`):

| Variable | Default | What it's for |
|----------|---------|----------------|
| `PORT` | `5000` | Express server port |
| `NODE_ENV` | `development` | Environment |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |
| `PG_HOST` | `localhost` | Postgres host |
| `PG_PORT` | `5432` | Postgres port |
| `PG_USER` | `queueuser` | Postgres user |
| `PG_PASSWORD` | `queuepass` | Postgres password |
| `PG_DATABASE` | `queuedb` | Postgres database name |
| `MONGO_URI` | `mongodb://mongouser:mongopass@localhost:27017/queue_logs?authSource=admin` | MongoDB connection string — note `authSource=admin`, since the Mongo user is created as a root user |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `redispass` | Redis password |
| `JWT_SECRET` | *(change this)* | Signs the JWTs |
| `JWT_EXPIRES_IN` | `24h` | Token expiry |

To generate a real JWT secret instead of a placeholder:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## API reference

**Auth**

| Method | Endpoint | Auth | What it does |
|--------|----------|------|----------------|
| POST | `/api/auth/register` | — | Register a new user |
| POST | `/api/auth/login` | — | Log in, returns a JWT |
| GET | `/api/auth/me` | user | Get the logged-in user's profile |

**Tokens**

| Method | Endpoint | Auth | What it does |
|--------|----------|------|----------------|
| POST | `/api/tokens/generate` | user | Issue a new token (rate-limited) |
| GET | `/api/tokens/my` | user | Get your own active token |
| GET | `/api/tokens` | staff | List all tokens, paginated |

**Queue**

| Method | Endpoint | Auth | What it does |
|--------|----------|------|----------------|
| GET | `/api/queue/status` | — | Current queue state (Redis-cached) |
| POST | `/api/queue/next` | staff | Advance to the next token |
| POST | `/api/queue/reset` | staff | Reset the whole queue |
| PATCH | `/api/queue/toggle` | staff | Open or close the counter |
| GET | `/api/queue/logs` | staff | Activity logs from MongoDB, paginated |

**Quick example — register, log in, get a token:**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"staff1","email":"staff@example.com","password":"pass123","role":"staff"}'

curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@example.com","password":"pass123"}'

curl -X POST http://localhost:5000/api/tokens/generate \
  -H "Authorization: Bearer <jwt_from_login>"
```

## Database schema

**PostgreSQL**
```sql
users (id, username, email, password [hashed], role, created_at)

-- single row, this is what gets locked with FOR UPDATE
queue_state (id=1, last_token_number, current_serving, is_open, opened_at, updated_at)

tokens (id, token_number [UNIQUE], user_id FK, status, issued_at, served_at)
-- status: waiting | serving | served | skipped
```

**MongoDB** — one document per action in `activity_logs` (`TOKEN_ISSUED`, `QUEUE_ADVANCED`, `USER_LOGIN`, etc.), with a flexible `details` field. Kept separate from Postgres since it's high-volume, append-only, and doesn't need relational integrity.

**Redis keys**

| Key | Purpose | TTL |
|-----|---------|-----|
| `queue:status` | Cached queue status JSON | 5s |
| `queue:token_issue_lock` | Distributed lock for issuing tokens | 5s (auto-expires) |
| `queue:last_token_number` | Invalidated whenever a new token is issued | — |

## Where Redis fits in

- **Caching** — `GET /api/queue/status` gets hammered constantly since every waiting patient's screen polls it. The response is cached for 5 seconds and explicitly invalidated the moment the queue state changes.
- **Locking** — the `NX PX` lock backs up the Postgres row lock at the application layer, so two Node processes can't both think they're free to issue a token.
- **Rate limiting** — `express-rate-limit` caps token generation at 10/min per IP, and auth endpoints at 20/15min per IP.

## Scaling this beyond a single counter

If traffic went up significantly, here's what I'd change:

- Run multiple Node instances behind a load balancer — the Redis lock already works across processes, so this doesn't require touching the concurrency logic.
- Add Postgres read replicas for read-heavy queries, and PgBouncer for connection pooling.
- Move Redis to a Cluster/Sentinel setup for high availability.
- Turn MongoDB into a replica set, and add a TTL index so old logs expire automatically instead of growing forever.
- Swap the rate limiter's in-memory store for `rate-limit-redis`, since the current one doesn't share state across multiple app instances.

## Known limitations

- The rate limiter is in-memory, so it resets if the server restarts and doesn't share state across multiple instances.
- No WebSockets/SSE — the live board polls every 3 seconds instead of getting pushed updates. Would be a nicer real-time experience with SSE.
- No email verification on registration.
- JWT is stored in `localStorage` for simplicity; a production version would use `httpOnly` cookies instead.

## Stopping everything

```bash
docker compose down       # stop containers, keep the data
docker compose down -v    # stop containers and wipe all data
```
