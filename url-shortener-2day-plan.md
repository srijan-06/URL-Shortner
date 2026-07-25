# 2-Day Build Plan: Scalable URL Shortener

**Goal:** A deployed, interview-defensible URL shortener with caching, rate limiting, and analytics — built in 2 days using Claude as a pair-programmer.

**Target role:** SDE (campus placements)

**Why this project:** It maps directly onto system design and DSA interview topics — base62 encoding, cache-aside pattern, rate limiting algorithms, read/write path separation, and scaling discussions. Every feature is a potential interview talking point.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express (or Spring Boot) | Fast to build, widely known; pick whichever matches your resume language |
| Database | PostgreSQL | Relational integrity for URL mappings, auto-increment IDs for base62 encoding |
| Cache | Redis | Cache-aside for hot redirects; also backs the rate limiter |
| Frontend | React (minimal) | Single page: shorten + view stats |
| Deployment | Render/Railway (backend), Vercel (frontend), Supabase + Upstash (managed DB/Redis free tiers) | Live demo link on resume |
| Testing | Jest (or JUnit) | Unit tests for encoding + rate limiter — a differentiator few students bother with |

---

## Day 1 — Core Backend

### Morning (3–4 hours): Setup + core logic

**Tasks**
1. Scaffold project structure (ask Claude to generate the skeleton: routes, services, db layer, config).
2. Set up local PostgreSQL and Redis (Docker Compose recommended — one command, and it's another resume-friendly skill).
3. Implement `POST /shorten`:
   - Insert long URL into Postgres, get auto-increment ID.
   - Encode ID to base62 for the short code.
   - Return short URL.
4. Implement `GET /:code`:
   - Check Redis first (cache-aside).
   - On miss, decode base62 → query Postgres → populate cache → redirect (HTTP 301 vs 302: know the difference and pick deliberately).

**Key design decision to internalize (interview talking point):**
> Why base62 of an auto-increment ID instead of hashing the URL?
> Guaranteed uniqueness with no collision-check loop, shorter codes, O(1) generation. Trade-off: codes are sequential/guessable — mention you could add a bijective scramble or random offset if privacy mattered.

**Checkpoint:** Shorten + redirect working locally via curl/Postman.

### Afternoon (3–4 hours): Depth features (what separates this from a tutorial)

**Tasks**
1. **Link expiry (TTL):** optional `expiresAt` on creation; expired links return 410 Gone. Set matching TTL on the Redis key.
2. **Rate limiting:** implement token bucket (or sliding window) yourself on top of Redis — do NOT use a library. This is a classic interview algorithm; be able to whiteboard it.
3. **Click analytics:** on each redirect, record timestamp + referrer. Write asynchronously (fire-and-forget or a simple queue) so analytics writes never slow down the redirect path. Talking point: separating the latency-critical read path from the write-heavy analytics path.
4. **Unit tests:** base62 encode/decode round-trip, rate limiter behavior (allows N, blocks N+1, refills over time).

**Checkpoint:** All endpoints working, rate limiting demonstrable, tests passing.

---

## Day 2 — Frontend, Deployment, Polish

### Morning (2–3 hours): Minimal frontend

**Tasks**
1. Single React page:
   - Input field → shortened URL with copy button.
   - Optional expiry selector.
   - Stats view: click count + recent clicks for a given code.
2. Keep it clean and functional — do not over-invest here. Ask Claude to generate it fast; your depth budget belongs to the backend.

**Checkpoint:** End-to-end flow working locally.

### Afternoon (3 hours): Deploy + document

**Tasks**
1. Deploy:
   - Backend → Render or Railway.
   - Postgres → Supabase; Redis → Upstash (free tiers).
   - Frontend → Vercel.
   - Set environment variables; verify the live link works.
2. README (this is what reviewers actually read):
   - One-paragraph pitch + live demo link.
   - Architecture diagram (request flow: client → API → Redis → Postgres).
   - **Design Decisions section** — the differentiator:
     - Why base62 over random hash + collision check.
     - Why cache-aside; what happens on cache miss/eviction.
     - Why token bucket; how the parameters were chosen.
     - 301 vs 302 choice and its caching implications.
     - "How I'd scale this": read replicas, sharding by ID range, CDN-level redirects, hot-key mitigation.
   - How to run locally (Docker Compose).
3. GitHub hygiene: meaningful commit history (not one giant commit), .env.example, no secrets committed.

### Evening (1 hour): Interview prep — highest ROI hour

Ask Claude to grill you:
- "Why base62 and not MD5-truncation?"
- "Your Redis goes down — what happens?"
- "How does this behave at 1M req/sec? Where does it break first?"
- "How do you handle a celebrity link (hot key)?"
- "Why 301 vs 302 for redirects?"
- "How would you delete/expire billions of old links efficiently?"

Write short answers in the README or a personal notes doc. Being able to answer these fluently is what converts the project into interview points.

---

## Resume Bullet (draft)

> Built and deployed a scalable URL shortener (Node.js, PostgreSQL, Redis) featuring base62 encoding, cache-aside caching, a custom token-bucket rate limiter, and asynchronous click analytics; wrote unit tests and documented design trade-offs and scaling strategy.

---

## Scope Guardrails

- **Cut if behind schedule:** analytics dashboard UI (keep the API), expiry selector in UI (keep backend support).
- **Never cut:** deployment, README design-decisions section, rate limiter, tests.
- **Do not add:** auth/user accounts, custom aliases, QR codes — nice-to-haves that eat time without adding interview depth. Mention them in README as "future work."
