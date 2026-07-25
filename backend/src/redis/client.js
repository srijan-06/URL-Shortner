'use strict';

const Redis = require('ioredis');
const config = require('../config');

/**
 * Shared Redis client.
 *
 * Design note (interview talking point — "what if Redis goes down?"):
 * Redis is a performance optimisation, not a source of truth. We set
 * `enableOfflineQueue: false` so commands fail fast instead of piling up while
 * Redis is unreachable, and every caller wraps Redis access in try/catch and
 * falls through to Postgres. The service therefore degrades to "slower but
 * correct" rather than failing when the cache is down.
 */
const client = new Redis(config.redis.url, {
  lazyConnect: false,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

let warnedDown = false;
client.on('error', (err) => {
  // Avoid log spam: warn once per outage window.
  if (!warnedDown) {
    console.warn('[redis] connection error (falling back to Postgres):', err.message);
    warnedDown = true;
  }
});
client.on('ready', () => {
  if (warnedDown) console.info('[redis] reconnected.');
  warnedDown = false;
});

/**
 * True when the client currently has a live connection. Callers use this to
 * skip Redis entirely when it's known-down (avoids paying a failing round-trip).
 */
function isHealthy() {
  return client.status === 'ready';
}

async function close() {
  try {
    await client.quit();
  } catch (_) {
    client.disconnect();
  }
}

module.exports = { client, isHealthy, close };
