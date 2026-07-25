'use strict';

const { TokenBucket } = require('../src/middleware/tokenBucket');

describe('TokenBucket', () => {
  test('allows exactly `capacity` requests in an instant burst, blocks N+1', () => {
    const b = new TokenBucket({ capacity: 5, refillPerSec: 1, nowMs: 0 });
    for (let i = 0; i < 5; i++) {
      expect(b.tryConsume(0).allowed).toBe(true);
    }
    // 6th request in the same instant is blocked.
    const sixth = b.tryConsume(0);
    expect(sixth.allowed).toBe(false);
    expect(sixth.remaining).toBe(0);
    expect(sixth.retryAfterSec).toBeGreaterThan(0);
  });

  test('refills over time at refillPerSec', () => {
    const b = new TokenBucket({ capacity: 10, refillPerSec: 2, tokens: 0, nowMs: 0 });
    // Empty bucket -> blocked.
    expect(b.tryConsume(0).allowed).toBe(false);
    // After 1s at 2 tokens/s, 2 tokens available -> two allowed, third blocked.
    expect(b.tryConsume(1000).allowed).toBe(true);
    expect(b.tryConsume(1000).allowed).toBe(true);
    expect(b.tryConsume(1000).allowed).toBe(false);
  });

  test('never exceeds capacity no matter how long it idles', () => {
    const b = new TokenBucket({ capacity: 3, refillPerSec: 1, tokens: 0, nowMs: 0 });
    // Idle for an hour.
    const r = b.tryConsume(3600 * 1000);
    expect(r.allowed).toBe(true);
    // Capacity is 3; after consuming 1 we should have 2 left, not thousands.
    expect(b.tokens).toBeCloseTo(2, 5);
  });

  test('retryAfter reflects the wait for enough tokens', () => {
    const b = new TokenBucket({ capacity: 5, refillPerSec: 5, tokens: 0, nowMs: 0 });
    const r = b.tryConsume(0);
    expect(r.allowed).toBe(false);
    // Need 1 token at 5/s -> 0.2s.
    expect(r.retryAfterSec).toBeCloseTo(0.2, 5);
  });

  test('sustained rate: N allowed per second on average', () => {
    const b = new TokenBucket({ capacity: 1, refillPerSec: 10, tokens: 1, nowMs: 0 });
    let allowed = 0;
    // One request every 100ms for 1s == the sustained rate of 10/s.
    for (let t = 0; t <= 1000; t += 100) {
      if (b.tryConsume(t).allowed) allowed++;
    }
    // Roughly the sustained rate (allow off-by-one for boundary tokens).
    expect(allowed).toBeGreaterThanOrEqual(10);
    expect(allowed).toBeLessThanOrEqual(11);
  });

  test('constructor validates parameters', () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSec: 1 })).toThrow();
    expect(() => new TokenBucket({ capacity: 1, refillPerSec: 0 })).toThrow();
  });
});
