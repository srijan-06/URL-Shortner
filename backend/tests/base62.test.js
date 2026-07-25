'use strict';

const base62 = require('../src/utils/base62');

describe('base62', () => {
  test('encode(0) is the first alphabet symbol', () => {
    expect(base62.encode(0)).toBe('0');
  });

  test('encode small ids to expected codes', () => {
    expect(base62.encode(1)).toBe('1');
    expect(base62.encode(10)).toBe('a'); // 0-9 then a
    expect(base62.encode(61)).toBe('Z'); // last symbol
    expect(base62.encode(62)).toBe('10'); // rolls over
  });

  test('encode/decode round-trip for a range of ids', () => {
    for (let id = 0; id < 5000; id++) {
      expect(base62.decode(base62.encode(id))).toBe(id);
    }
  });

  test('round-trips large, DB-sequence-sized ids', () => {
    const ids = [1e6, 1e9, 123456789, 999999999999, Number.MAX_SAFE_INTEGER - 1];
    for (const id of ids) {
      expect(base62.decode(base62.encode(id))).toBe(id);
    }
  });

  test('encode is monotonic (longer/greater codes for greater ids)', () => {
    // Sequential ids never collide — the whole reason we encode the id.
    const seen = new Set();
    for (let id = 0; id < 1000; id++) {
      const code = base62.encode(id);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
  });

  test('encode rejects invalid input', () => {
    expect(() => base62.encode(-1)).toThrow(TypeError);
    expect(() => base62.encode(1.5)).toThrow(TypeError);
    expect(() => base62.encode('5')).toThrow(TypeError);
  });

  test('decode rejects illegal characters and empty input', () => {
    expect(() => base62.decode('')).toThrow();
    expect(() => base62.decode('abc$')).toThrow(/illegal character/);
    expect(() => base62.decode('hello world')).toThrow();
  });

  test('isValidCode accepts base62 strings and rejects others', () => {
    expect(base62.isValidCode('aZ09')).toBe(true);
    expect(base62.isValidCode('')).toBe(false);
    expect(base62.isValidCode('has space')).toBe(false);
    expect(base62.isValidCode('slash/')).toBe(false);
    expect(base62.isValidCode(null)).toBe(false);
  });
});
