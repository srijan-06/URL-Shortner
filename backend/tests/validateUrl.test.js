'use strict';

const { normalizeUrl, ValidationError } = require('../src/utils/validateUrl');

describe('normalizeUrl', () => {
  test('accepts and canonicalises valid http(s) URLs', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeUrl('  http://a.b/c?d=1  ')).toBe('http://a.b/c?d=1');
  });

  test('rejects empty / missing input', () => {
    expect(() => normalizeUrl('')).toThrow(ValidationError);
    expect(() => normalizeUrl('   ')).toThrow(ValidationError);
    expect(() => normalizeUrl(undefined)).toThrow(ValidationError);
  });

  test('rejects non-http(s) schemes', () => {
    expect(() => normalizeUrl('ftp://example.com')).toThrow(/http or https/);
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(ValidationError);
    expect(() => normalizeUrl('mailto:a@b.com')).toThrow(ValidationError);
  });

  test('rejects unparseable strings', () => {
    expect(() => normalizeUrl('not a url')).toThrow(ValidationError);
    expect(() => normalizeUrl('http://')).toThrow(ValidationError);
  });
});
