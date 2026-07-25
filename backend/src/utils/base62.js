'use strict';

/**
 * Base62 encode/decode.
 *
 * We encode the auto-increment primary key from Postgres into a compact,
 * URL-safe short code. Base62 uses [0-9A-Za-z] (62 symbols), so an N-char
 * code addresses 62^N ids:
 *   - 6 chars  -> ~56.8 billion
 *   - 7 chars  -> ~3.5 trillion
 *
 * Why encode an auto-increment id instead of hashing the URL?
 *   - Guaranteed uniqueness: the DB sequence never collides, so there is no
 *     "generate -> check -> retry" loop that random hashes require.
 *   - Shorter codes: no wasted entropy fixing collisions.
 *   - O(1) generation: a single INSERT ... RETURNING id, then pure arithmetic.
 * Trade-off: codes are sequential and therefore guessable. If enumeration
 * mattered, we'd apply a bijective transform (e.g. multiply the id by a large
 * odd constant modulo 62^N, or Feistel-scramble it) before encoding — still
 * collision-free, but no longer monotonic.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

// Reverse lookup for O(1) decode.
const CHAR_TO_VALUE = Object.freeze(
  ALPHABET.split('').reduce((map, ch, i) => {
    map[ch] = i;
    return map;
  }, {})
);

/**
 * Encode a non-negative integer id into a base62 string.
 * id === 0 maps to the first symbol ("0").
 * @param {number} id
 * @returns {string}
 */
function encode(id) {
  if (!Number.isInteger(id) || id < 0) {
    throw new TypeError(`base62.encode expects a non-negative integer, got: ${id}`);
  }
  if (id === 0) return ALPHABET[0];

  let n = id;
  let out = '';
  while (n > 0) {
    out = ALPHABET[n % BASE] + out;
    n = Math.floor(n / BASE);
  }
  return out;
}

/**
 * Decode a base62 string back into the integer id.
 * @param {string} code
 * @returns {number}
 */
function decode(code) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new TypeError(`base62.decode expects a non-empty string, got: ${code}`);
  }
  let n = 0;
  for (const ch of code) {
    const value = CHAR_TO_VALUE[ch];
    if (value === undefined) {
      throw new Error(`base62.decode: illegal character "${ch}" in "${code}"`);
    }
    n = n * BASE + value;
  }
  return n;
}

/**
 * Cheap syntactic validity check for a short code (used before hitting the DB).
 * @param {string} code
 * @returns {boolean}
 */
function isValidCode(code) {
  return typeof code === 'string' && code.length > 0 && /^[0-9A-Za-z]+$/.test(code);
}

module.exports = { encode, decode, isValidCode, ALPHABET, BASE };
