'use strict';

/**
 * Pure, in-memory token-bucket algorithm — no I/O, fully unit-testable.
 *
 * The bucket holds up to `capacity` tokens and refills continuously at
 * `refillPerSec` tokens/second. Each request costs 1 token; if the bucket is
 * empty the request is rejected. This gives us:
 *   - Burst tolerance up to `capacity` (unlike a fixed window).
 *   - A smooth sustained rate of `refillPerSec` (unlike a leaky bucket that
 *     also shapes bursts).
 *
 * We store only two numbers per client — `tokens` and `lastRefillMs` — and
 * compute the refill lazily on each request ("lazy refill"), so there's no
 * background timer. This is exactly what the Redis Lua version does per key.
 */
class TokenBucket {
  /**
   * @param {object} opts
   * @param {number} opts.capacity      max tokens (max burst)
   * @param {number} opts.refillPerSec  tokens added per second
   * @param {number} [opts.tokens]      starting tokens (defaults to full)
   * @param {number} [opts.nowMs]       initial clock reading (defaults to 0)
   */
  constructor({ capacity, refillPerSec, tokens, nowMs = 0 }) {
    if (!(capacity > 0)) throw new Error('capacity must be > 0');
    if (!(refillPerSec > 0)) throw new Error('refillPerSec must be > 0');
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = tokens === undefined ? capacity : tokens;
    this.lastRefillMs = nowMs;
  }

  /** Refill tokens based on elapsed time since the last refill. */
  _refill(nowMs) {
    if (nowMs <= this.lastRefillMs) return; // clock didn't advance
    const elapsedSec = (nowMs - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefillMs = nowMs;
  }

  /**
   * Attempt to consume `cost` tokens at time `nowMs`.
   * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
   */
  tryConsume(nowMs, cost = 1) {
    this._refill(nowMs);
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return { allowed: true, remaining: Math.floor(this.tokens), retryAfterSec: 0 };
    }
    const deficit = cost - this.tokens;
    const retryAfterSec = deficit / this.refillPerSec;
    return { allowed: false, remaining: Math.floor(this.tokens), retryAfterSec };
  }
}

module.exports = { TokenBucket };
