# 🔗 Scalable URL Shortener

A production-shaped URL shortener built to be **interview-defensible**, not just a tutorial clone. Every feature maps to a real system-design or DSA talking point: base62 encoding, cache-aside caching, a hand-rolled distributed token-bucket rate limiter, and asynchronous click analytics with a separated read/write path.

**Stack:** Node.js + Express · PostgreSQL · Redis · React (Vite) · Docker Compose · Jest

> **Resume bullet:** Built and deployed a scalable URL shortener (Node.js, PostgreSQL, Redis) featuring base62 encoding, cache-aside caching, a custom token-bucket rate limiter, and asynchronous click analytics; wrote unit tests and documented design trade-offs and scaling strategy.

---

## 📑 Table of Contents

- [What it does](#-what-it-does)
- [Architecture](#-architecture)
- [Request flow (the hot path)](#-request-flow-the-hot-path)
- [API reference](#-api-reference)
- [Data model](#-data-model)
- [Run it locally](#-run-it-locally)
- [Tests](#-tests)
- [Deployment](#-deployment)
- [**Design decisions (interview gold)**](#-design-decisions-interview-gold) ← read this before an interview
- [**Interview Q&A drill**](#-interview-qa-drill) ← practice answers
- [Where the code lives](#-where-the-code-lives)
- [Future work](#-future-work)

---

## ✨ What it does

- **Shorten** a long URL → get a compact `base62` short code.
- **Redirect** `GET /:code` → 302 to the original URL, cache-accelerated.
- **Expiry (TTL):** optional lifetime; expired links return `410 Gone`.
- **Rate limiting:** custom token-bucket limiter (stricter on writes, generous on reads), enforced globally via Redis + a Lua script.
- **Analytics:** every click is recorded (timestamp, referrer, UA, IP) *off the redirect path*, plus an O(1) click counter.
- **Stats API:** total clicks + recent click events for any code.

---

## 🏗 Architecture

```
                         ┌──────────────────────────────┐
     Browser  ──────────▶│   React SPA (Vite)            │
   (end user)            │   shorten form · stats view   │
                         └───────────────┬──────────────┘
                                         │ JSON over HTTP
                                         ▼
                         ┌──────────────────────────────┐
                         │   Express API                 │
                         │  ┌─────────────────────────┐  │
   POST /api/shorten ───▶│  │ rate limiter (write)    │  │
   GET  /:code       ───▶│  │ rate limiter (read ×5)  │  │
   GET  /api/stats/… ───▶│  └─────────────────────────┘  │
                         └───────┬───────────────┬───────┘
                                 │               │
                    cache-aside  │               │  fire-and-forget
                                 ▼               ▼
                         ┌─────────────┐   ┌─────────────┐
                         │   Redis     │   │  PostgreSQL │
                         │  • hot URLs │   │  • urls     │
                         │  • RL state │   │  • clicks   │
                         └─────────────┘   └─────────────┘
```

**Two paths, deliberately separated:**
- **Read path (redirect)** — latency-critical. Cache-first, never blocks on analytics.
- **Write path (analytics)** — throughput-heavy. Fire-and-forget, tolerant of staleness.

---

## 🔄 Request flow (the hot path)

`GET /:code`:

1. **Rate limit** the client (read bucket = 5× the write bucket).
2. **Cache lookup** in Redis (`url:<code>`). Hit → check expiry → done.
3. **Cache miss** → base62-decode the code to an integer id → `SELECT` from Postgres.
4. **Populate cache** with a TTL that never outlives the link's own expiry.
5. **Record the click** — *called without `await`* so a slow analytics write can't add latency.
6. **`302` redirect** with `Cache-Control: no-store`.

Expired link → `410 Gone`. Unknown code → `404`.

---

## 📡 API reference

Base URL (local): `http://localhost:4000`

### `POST /api/shorten`
```jsonc
// request
{ "url": "https://example.com/very/long/path", "ttlSeconds": 3600 }  // ttlSeconds optional

// 201 Created
{
  "code": "3k",
  "shortUrl": "http://localhost:4000/3k",
  "longUrl": "https://example.com/very/long/path",
  "expiresAt": "2026-07-14T12:00:00.000Z"   // null if no TTL
}
```
Errors: `400 validation_error` (missing/invalid URL, non-http(s), bad TTL), `429 rate_limited`.

### `GET /:code`
`302` redirect to the long URL. Errors: `404 not_found`, `410 gone` (expired), `429 rate_limited`.

### `GET /api/stats/:code`
```jsonc
{
  "code": "3k",
  "longUrl": "https://example.com/…",
  "createdAt": "…", "expiresAt": "…", "expired": false,
  "clickCount": 42,
  "recentClicks": [ { "clickedAt": "…", "referrer": "…", "userAgent": "…", "ip": "…" } ]
}
```
Query: `?limit=` (default 20, max 100).

### `GET /health`
`{ "status": "ok" }` — used by Render/compose healthchecks.

**Try it:**
```bash
curl -X POST localhost:4000/api/shorten -H 'Content-Type: application/json' \
     -d '{"url":"https://github.com"}'
curl -i localhost:4000/3k            # 302 → https://github.com
curl localhost:4000/api/stats/3k
```

---

## 🗄 Data model

```sql
urls    ( id BIGSERIAL PK, long_url, created_at, expires_at NULL, click_count )
clicks  ( id BIGSERIAL PK, url_id FK→urls, clicked_at, referrer, user_agent, ip )
```
- `urls.id` is the **BIGSERIAL sequence** we base62-encode into the code.
- `click_count` is **denormalised** so stats never `COUNT(*)` the clicks table.
- Indexes: `(url_id, clicked_at DESC)` for recent-clicks; partial index on `expires_at` for a future TTL-sweep job.

See [`backend/src/db/schema.sql`](backend/src/db/schema.sql). Schema is applied idempotently on boot (`migrate()` in [`server.js`](backend/src/server.js)).

---

## 🚀 Run it locally

### Option A — Docker Compose (everything, one command)
```bash
docker compose up --build
# Backend  → http://localhost:4000
# Frontend → http://localhost:5173
```

### Option B — datastores in Docker, apps with hot reload
```bash
docker compose up postgres redis          # just the datastores

cd backend && cp .env.example .env && npm install && npm run dev   # :4000
cd frontend && cp .env.example .env && npm install && npm run dev  # :5173 (Vite proxies /api → :4000)
```

Config is all env-driven — see [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).

---

## ✅ Tests

```bash
cd backend && npm test
```
Unit tests cover the two pieces most worth defending in an interview:
- **`base62`** — encode/decode round-trip, edge cases ([`base62.test.js`](backend/tests/base62.test.js)).
- **`TokenBucket`** — allows a burst up to capacity, blocks when empty, refills over time ([`tokenBucket.test.js`](backend/tests/tokenBucket.test.js)).
- **`validateUrl`** — accepts http(s), rejects junk/other schemes ([`validateUrl.test.js`](backend/tests/validateUrl.test.js)).

The token bucket is deliberately a **pure, clock-injected class** (no I/O), so its behavior over time is testable without sleeps.

---

## ☁️ Deployment

| Component | Host | Notes |
|---|---|---|
| Backend API | Render / Railway | [`render.yaml`](render.yaml) blueprint; `startCommand: node src/server.js`, health check `/health` |
| Postgres | Supabase (or Render PG) | set `DATABASE_URL`, `PGSSL=true` |
| Redis | Upstash | set `REDIS_URL` (`rediss://…`) |
| Frontend | Vercel | [`frontend/vercel.json`](frontend/vercel.json); set `VITE_API_BASE_URL` to the backend URL |

Set `BASE_URL` to the public API origin so returned short URLs are correct, and `CORS_ORIGIN` to the Vercel URL. Secrets are never committed — only `.env.example` files are.

---

## 🧠 Design decisions (interview gold)

This is the section reviewers actually read. Each decision below is a deliberate trade-off you should be able to defend.

### 1. Base62 of an auto-increment id — *not* a hash of the URL
- **Why:** the DB sequence is unique by construction, so there's **no generate → check-collision → retry loop** that random/hash codes need. Shorter codes (no wasted entropy), and generation is O(1): one `INSERT … RETURNING id` then pure arithmetic.
- **Capacity:** base62 = `[0-9A-Za-z]`, so 6 chars ≈ 56.8B, 7 chars ≈ 3.5T links.
- **Trade-off:** codes are **sequential and guessable** (you can enumerate `/1`, `/2`, …). If privacy mattered, apply a **bijective scramble** before encoding — multiply the id by a large odd constant mod 62ⁿ, or Feistel-encrypt it — still collision-free, no longer monotonic. *We didn't, because for a public shortener enumerability is acceptable and simplicity wins.*
- Code: [`utils/base62.js`](backend/src/utils/base62.js).

### 2. Cache-aside (lazy loading) with Redis
- **Why cache-aside** over write-through/read-through: the app controls the cache, it survives a cold Redis (just repopulates on miss), and it only caches what's actually read (hot links). We **do** warm the cache on create so the first redirect is a hit.
- **Cache-miss path:** decode → Postgres → populate → return. **Eviction/cold Redis:** next read is a miss → Postgres → repopulate. Correctness never depends on the cache.
- **TTL correctness:** a cached entry's TTL is `min(link's remaining lifetime, default cache TTL)` — the cache **must never outlive the link**, or an expired link could still redirect.
- **Fail-soft:** every cache helper swallows Redis errors and falls through to Postgres — a Redis blip degrades latency, never correctness.
- Code: [`services/urlService.js`](backend/src/services/urlService.js).

### 3. `302 Found`, not `301 Moved Permanently`
- **301** is cached aggressively by browsers/proxies/CDNs and is effectively permanent — the client may **never hit our server again**, silently bypassing analytics and making expiry/editing impossible.
- **302** keeps every click flowing through us — exactly what an analytics-bearing, expirable shortener needs. We also send `Cache-Control: no-store`.
- **The lever:** if we wanted CDN-offloaded, un-analytic'd redirects for hot links, 301 with a short `max-age` is how you'd trade analytics for scale.

### 4. Custom token-bucket rate limiter (no library)
- **Algorithm:** bucket holds up to `capacity` tokens, refills continuously at `refillPerSec`. Each request costs 1 token; empty bucket → reject. Gives **burst tolerance up to capacity** *and* a smooth sustained rate — better than a fixed window (boundary bursts) and less shaping than a leaky bucket.
- **Lazy refill:** store only `{ tokens, lastRefill }` and compute refill on each request — no background timer.
- **Distributed correctness:** with multiple API instances, per-process buckets would let a client burst N× (once per instance). State lives in **Redis**, and the refill→check→decrement→persist is run as a **single Lua script** so it's **atomic** — no race between concurrent requests for the same key.
- **Fail-open:** if Redis is down, allow the request. A limiter is *protection*, not correctness — blocking all traffic because the limiter's store blipped is a worse outage than briefly unthrottled traffic. (Contrast with the cache, which fails *soft* to Postgres — same philosophy: the datastore blip shouldn't take down the request.)
- **Different limits per route:** writes (`rl:write`, capacity 20) are stricter than reads (`rl:read`, 5×) because writes are the expensive, abusable path.
- Code: pure algorithm in [`middleware/tokenBucket.js`](backend/src/middleware/tokenBucket.js), distributed wrapper in [`middleware/rateLimiter.js`](backend/src/middleware/rateLimiter.js).

### 5. Separated read/write paths for analytics
- The redirect handler calls `recordClick()` **without `await`** — fire-and-forget. A slow/failing analytics write can never add latency to, or break, the user's redirect.
- Two writes per click: append the raw event **and** bump a denormalised `click_count`, so the stats read stays O(1) instead of `COUNT(*)`-ing a huge table.
- **At scale:** buffer clicks in memory and batch-flush, or push to a queue/stream (Kafka/SQS) and aggregate in a consumer — the API stays a fast producer.
- Code: [`services/analyticsService.js`](backend/src/services/analyticsService.js).

### 6. Expiry as `410 Gone`
`410` (vs `404`) says the resource **existed but is intentionally gone** — semantically honest and tells crawlers to stop retrying. Redis key TTL matches the link so expired links naturally fall out of cache.

---

## 🎤 Interview Q&A drill

Practice saying these out loud. Short, confident answers convert the project into points.

**Q: Why base62 and not MD5-truncation of the URL?**
Auto-increment id + base62 is collision-free by construction — no check-and-retry loop, shorter codes, O(1) generation. Truncated MD5 risks collisions, forcing a uniqueness check on every insert. Cost of base62: guessable sequential codes, fixable with a bijective scramble.

**Q: Your Redis goes down — what happens?**
Two different failure modes, on purpose. **Cache:** fails *soft* — reads fall through to Postgres, slower but correct. **Rate limiter:** fails *open* — requests are allowed, because blocking everything is worse than briefly unthrottled traffic. Nothing 500s just because Redis blipped.

**Q: How does this behave at 1M req/sec? Where does it break first?**
The redirect read path scales well (Redis-fronted, stateless API → horizontal scale + read replicas). First to break: **analytics writes** hammering Postgres. Fix: batch/queue them. Next: a single **hot key** (celebrity link) concentrating load on one Redis shard.

**Q: How do you handle a celebrity link (hot key)?**
It's cached, so Postgres is fine. The pressure is on one Redis node. Options: local in-process LRU in front of Redis (tiny TTL) to absorb repeats, replicate the hot key across nodes, or — since it's a redirect — push it to a **CDN edge** with a short max-age and accept coarser analytics for that link.

**Q: Why 301 vs 302?**
302, so every click keeps hitting us — analytics and expiry require it. 301 is cached forever by clients and would silently bypass us. 301 is the deliberate lever if I ever want CDN-offloaded redirects and can give up per-click analytics.

**Q: How would you delete/expire billions of old links efficiently?**
Don't delete on the read path. A background **batch sweep** (`DELETE … WHERE expires_at < now() LIMIT N` in a loop), supported by the partial index on `expires_at`. Or partition `urls`/`clicks` by time and drop whole partitions — O(1) vs row-by-row deletes.

**Q: Why a denormalised click_count?**
So the stats endpoint is O(1) instead of `COUNT(*)` over a clicks table that could have billions of rows. Trade-off: two writes per click and a tiny window of counter drift — acceptable for an analytics view.

**Q: Is the token bucket safe under concurrency?**
Yes — the refill→check→decrement→persist sequence runs as one **atomic Lua script** in Redis, so concurrent requests for the same client can't race the read-modify-write.

---

## 🗂 Where the code lives

```
backend/
  src/
    app.js                  Express app: CORS, routes, central error handler
    server.js               boot: migrate → listen → graceful shutdown
    config/index.js         all env-driven config
    routes/
      shorten.js            POST /api/shorten   (write limiter)
      redirect.js           GET  /:code         (read limiter, the hot path)
      stats.js              GET  /api/stats/:code
    services/
      urlService.js         create + cache-aside resolve, expiry
      analyticsService.js   fire-and-forget click recording + stats read
    middleware/
      tokenBucket.js        pure token-bucket algorithm (unit-tested)
      rateLimiter.js        distributed limiter: Redis + atomic Lua
    utils/
      base62.js             encode/decode + validity check
      validateUrl.js        URL normalisation + validation
    db/
      schema.sql            urls + clicks tables and indexes
      pool.js               pg connection pool
      migrate.js            idempotent schema apply
    redis/client.js         ioredis client + health tracking
  tests/                    base62, tokenBucket, validateUrl
frontend/
  src/
    App.jsx, api.js, styles.css
    components/  ShortenForm.jsx · ResultCard.jsx · StatsView.jsx
docker-compose.yml          postgres + redis + backend + frontend
render.yaml                 backend deploy blueprint
```

---

## 🔮 Future work

Deliberately **out of scope** (would eat time without adding interview depth):
- User accounts / auth, custom aliases, QR codes.
- Analytics dashboard charts (the stats **API** already exists).
- Bijective code scrambling for non-enumerable codes (design is ready; see [Design decision #1](#1-base62-of-an-auto-increment-id--not-a-hash-of-the-url)).
- Batched/queued analytics ingestion for high throughput.

---

*Built in 2 days as a campus-placement SDE project. The [2-day plan](url-shortener-2day-plan.md) has the full build log and rationale.*
