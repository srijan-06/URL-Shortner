'use strict';

const express = require('express');
const db = require('../db/pool');
const analytics = require('../services/analyticsService');
const base62 = require('../utils/base62');
const { NotFoundError } = require('../services/urlService');

const router = express.Router();

/**
 * GET /api/stats/:code
 * -> { code, longUrl, createdAt, expiresAt, expired, clickCount, recentClicks }
 *
 * Stats read straight from Postgres (not the redirect cache) — analytics is an
 * admin/read view where slight staleness is fine and correctness matters more
 * than latency. Expired links still return their stats (with expired: true).
 */
router.get('/stats/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!base62.isValidCode(code)) throw new NotFoundError(code);

    const id = base62.decode(code);
    const { rows } = await db.query(
      `SELECT id, long_url, created_at, expires_at FROM urls WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) throw new NotFoundError(code);

    const row = rows[0];
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const stats = await analytics.getStats(Number(row.id), limit);

    const expired = row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();

    res.json({
      code,
      longUrl: row.long_url,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired,
      clickCount: stats.clickCount,
      recentClicks: stats.recentClicks,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
