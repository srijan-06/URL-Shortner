'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate and canonicalise a user-supplied URL.
 * Must be a parseable http/https URL. Returns the normalised string.
 * @param {string} raw
 * @returns {string}
 */
function normalizeUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new ValidationError('url is required');
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch (_) {
    throw new ValidationError('url is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('url must use http or https');
  }
  return url.toString();
}

module.exports = { normalizeUrl, ValidationError };
