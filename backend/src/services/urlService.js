'use strict';

const db = require('../db/pool');
const { client: redis, isHealthy } = require('../redis/client');
const base62 = require('../utils/base62');
const { normalizeUrl, ValidationError } = require('../utils/validateUrl');
const config = require('../config');

const CACHE_PREFIX = 'url:'; // cached value = JSON { longUrl, expiresAt }

class ExpiredError extends Error {
  constructor(code) {
    super(`short code "${code}" has expired`);
    this.name = 'ExpiredError';
  }
}
class NotFoundError extends Error {
  constructor(code) {
    super(`short code "${code}" not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Create a short link.
 *
 * Flow: INSERT the long URL, let Postgres hand us the sequence id via
 * RETURNING, then base62-encode that id into the code. No collision check is
 * needed because the sequence is unique by construction (see base62.js).
 *
 * @param {string} rawUrl
 * @param {number|null} [ttlSeconds]  optional lifetime; null = never expires
 * @returns {Promise<{ code, shortUrl, longUrl, expiresAt }>}
 */
async function createShortUrl(rawUrl, ttlSeconds = null) {
  const longUrl = normalizeUrl(rawUrl);

  let expiresAt = null;
  if (ttlSeconds !== null && ttlSeconds !== undefined) {
    const secs = Number(ttlSeconds);
    if (!Number.isFinite(secs) || secs <= 0) {
      throw new ValidationError('ttlSeconds must be a positive number');
    }
    expiresAt = new Date(Date.now() + secs * 1000);
  }

  const { rows } = await db.query(
    `INSERT INTO urls (long_url, expires_at) VALUES ($1, $2) RETURNING id, expires_at`,
    [longUrl, expiresAt]
  );
  const row = rows[0];
  const code = base62.encode(Number(row.id));

  // Warm the cache immediately so the first redirect is a hit.
  await cacheSet(code, longUrl, row.expires_at, Number(row.id));

  return {
    code,
    shortUrl: `${config.baseUrl}/${code}`,
    longUrl,
    expiresAt: row.expires_at,
  };
}

/**
 * Resolve a short code to its long URL using the cache-aside pattern.
 *
 *   1. Look in Redis. Hit -> return (after expiry check).
 *   2. Miss -> decode base62 -> SELECT from Postgres.
 *   3. Populate Redis (with a TTL matching the link's own expiry) -> return.
 *
 * Expired links throw ExpiredError (handler -> 410 Gone); unknown codes throw
 * NotFoundError (-> 404). Redis errors are non-fatal: we fall through to Postgres.
 *
 * @param {string} code
 * @returns {Promise<{ id, longUrl }>}
 */
async function resolveCode(code) {
  if (!base62.isValidCode(code)) throw new NotFoundError(code);

  // 1. Cache lookup
  const cached = await cacheGet(code);
  if (cached) {
    if (isExpired(cached.expiresAt)) throw new ExpiredError(code);
    return { id: cached.id, longUrl: cached.longUrl };
  }

  // 2. Cache miss -> decode -> DB
  const id = base62.decode(code);
  const { rows } = await db.query(
    `SELECT id, long_url, expires_at FROM urls WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) throw new NotFoundError(code);

  const row = rows[0];
  if (isExpired(row.expires_at)) {
    // Don't cache expired entries as live; let them 410.
    throw new ExpiredError(code);
  }

  // 3. Populate cache for subsequent hits.
  await cacheSet(code, row.long_url, row.expires_at, Number(row.id));

  return { id: Number(row.id), longUrl: row.long_url };
}

function isExpired(expiresAt) {
  return expiresAt != null && new Date(expiresAt).getTime() <= Date.now();
}

// ── Cache helpers (all fail-soft: never throw to the caller) ──────────────

async function cacheGet(code) {
  if (!isHealthy()) return null;
  try {
    const raw = await redis.get(CACHE_PREFIX + code);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return { id: obj.id, longUrl: obj.longUrl, expiresAt: obj.expiresAt };
  } catch (err) {
    console.warn('[cache] get failed:', err.message);
    return null;
  }
}

async function cacheSet(code, longUrl, expiresAt, id) {
  if (!isHealthy()) return;
  try {
    const payload = JSON.stringify({ id, longUrl, expiresAt: expiresAt || null });
    const key = CACHE_PREFIX + code;

    if (expiresAt) {
      // TTL = min(link lifetime remaining, default cache TTL). The cache entry
      // must never outlive the link, or an expired link could still redirect.
      const remainingSec = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      const ttl = Math.max(1, Math.min(remainingSec, config.cache.ttlSeconds));
      await redis.set(key, payload, 'EX', ttl);
    } else {
      await redis.set(key, payload, 'EX', config.cache.ttlSeconds);
    }
  } catch (err) {
    console.warn('[cache] set failed:', err.message);
  }
}

module.exports = {
  createShortUrl,
  resolveCode,
  normalizeUrl,
  ExpiredError,
  NotFoundError,
  ValidationError,
};
