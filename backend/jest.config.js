'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  // These unit tests are pure logic — no DB/Redis needed.
  verbose: true,
};
