'use strict';

const express = require('express');
const urlService = require('../services/urlService');
const analytics = require('../services/analyticsService');
const { rateLimiter } = require('../middleware/rateLimiter');
const config = require('../config');

const router = express.Router();

// Reads are cheap and should stay available; give them a more generous bucket.
const redirectLimiter = rateLimiter({
  prefix: 'rl:read',
  capacity: config.rateLimit.capacity * 5,
  refillPerSec: config.rateLimit.refillPerSec * 5,
});

/**
 * GET /:code  — the hot path.
 *
 * Resolve via cache-aside, fire off analytics WITHOUT awaiting, then redirect.
 *
 * 302 (Found) is used deliberately, not 301 (Moved Permanently):
 *   - 301 is cached aggressively by browsers/proxies/CDNs and is effectively
 *     permanent, so the client may never hit our server again — which would
 *     silently bypass analytics AND make link expiry/editing impossible.
 *   - 302 keeps every click flowing through us, which is exactly what an
 *     analytics-bearing, expirable shortener needs.
 * (If we ever wanted CDN-offloaded, un-analytic'd redirects for hot links, 301
 *  with a short max-age would be the lever.)
 */
router.get('/:code', redirectLimiter, async (req, res, next) => {
  try {
    const { code } = req.params;
    const { id, longUrl } = await urlService.resolveCode(code);

    // Fire-and-forget analytics: never block the redirect on it.
    analytics.recordClick(id, {
      referrer: req.get('referer') || req.get('referrer') || null,
      userAgent: req.get('user-agent') || null,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null,
    });

    // Discourage intermediary caching so clicks keep reaching us.
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, longUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
