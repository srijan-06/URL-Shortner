'use strict';

const express = require('express');
const urlService = require('../services/urlService');
const { rateLimiter } = require('../middleware/rateLimiter');
const config = require('../config');

const router = express.Router();

// Writes are the expensive, abusable path — apply the (stricter) rate limiter.
router.use(
  rateLimiter({
    prefix: 'rl:write',
    capacity: config.rateLimit.capacity,
    refillPerSec: config.rateLimit.refillPerSec,
  })
);

/**
 * POST /api/shorten
 * body: { url: string, ttlSeconds?: number }
 * 201 -> { code, shortUrl, longUrl, expiresAt }
 */
router.post('/shorten', async (req, res, next) => {
  try {
    const { url, ttlSeconds } = req.body || {};
    const result = await urlService.createShortUrl(url, ttlSeconds ?? null);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
