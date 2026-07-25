'use strict';

const { client, isHealthy } = require('../redis/client');
const { TokenBucket } = require('./tokenBucket');
const config = require('../config');

/**
 * Distributed token-bucket rate limiter backed by Redis.
 *
 * Why Redis + Lua? With multiple API instances, an in-process bucket per
 * instance would let a client burst N× the intended rate (once per instance).
 * Storing the bucket state in Redis makes the limit global. The read-modify-
 * write (refill → check → decrement → persist) must be atomic, so we run it as
 * a single Lua script — Redis executes scripts atomically, eliminating the
 * race between concurrent requests for the same key.
 *
 * State per client: a hash { tokens, ts } at key `rl:<id>`, with a TTL so idle
 * clients are garbage-collected automatically.
 *
 * Fail-open: if Redis is unreachable we allow the request. A rate limiter is a
 * protection mechanism, not correctness-critical; blocking all traffic because
 * the limiter's backing store blipped would be a worse outage than briefly
 * unthrottled traffic.
 */

// KEYS[1] = bucket key
// ARGV[1] = capacity
// ARGV[2] = refillPerSec
// ARGV[3] = now (ms)
// ARGV[4] = cost
// ARGV[5] = ttl (seconds)
// returns { allowed(0|1), remaining, retryAfterMs }
const LUA = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refill     = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local cost       = tonumber(ARGV[4])
local ttl        = tonumber(ARGV[5])

local data   = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

-- lazy refill based on elapsed time
if now > ts then
  local elapsed = (now - ts) / 1000.0
  tokens = math.min(capacity, tokens + elapsed * refill)
  ts = now
end

local allowed = 0
local retry = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  local deficit = cost - tokens
  retry = math.ceil((deficit / refill) * 1000)
end

redis.call('HMSET', key, 'tokens', tokens, 'ts', ts)
redis.call('EXPIRE', key, ttl)

return { allowed, math.floor(tokens), retry }
`;

// Identify the client. Behind a proxy (Render/Railway/Vercel), the real client
// IP is in X-Forwarded-For; fall back to the socket address.
function clientId(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Build an Express middleware. Options override the global config, so different
 * routes can have different limits (e.g. writes stricter than reads).
 */
function rateLimiter(opts = {}) {
  const capacity = opts.capacity ?? config.rateLimit.capacity;
  const refillPerSec = opts.refillPerSec ?? config.rateLimit.refillPerSec;
  const prefix = opts.prefix ?? 'rl';
  // TTL: long enough for the bucket to fully refill from empty, plus slack.
  const ttl = Math.max(60, Math.ceil(capacity / refillPerSec) * 2);

  return async function rateLimitMiddleware(req, res, next) {
    const id = clientId(req);
    const key = `${prefix}:${id}`;
    const now = Date.now();

    try {
      if (!isHealthy()) throw new Error('redis not ready');
      const [allowed, remaining, retryMs] = await client.eval(
        LUA, 1, key, capacity, refillPerSec, now, 1, ttl
      );

      res.set('X-RateLimit-Limit', String(capacity));
      res.set('X-RateLimit-Remaining', String(Math.max(0, remaining)));

      if (allowed === 1) return next();

      const retryAfterSec = Math.ceil(retryMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many requests. Slow down.',
        retryAfterSeconds: retryAfterSec,
      });
    } catch (err) {
      // Fail open — see module docstring.
      console.warn('[rateLimiter] fail-open due to:', err.message);
      return next();
    }
  };
}

module.exports = { rateLimiter, TokenBucket };
