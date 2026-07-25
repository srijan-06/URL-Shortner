'use strict';

const db = require('../db/pool');

/**
 * Click analytics — the write-heavy path, deliberately decoupled from the
 * latency-critical redirect path.
 *
 * `recordClick` is fire-and-forget: the redirect handler calls it WITHOUT
 * awaiting, so a slow or failing analytics write can never add latency to (or
 * break) the user's redirect. Errors are swallowed and logged.
 *
 * For this project a single async INSERT per click is plenty. The talking
 * point for scale: at high throughput you'd buffer clicks in memory and flush
 * in batches, or push them onto a queue/stream (Kafka/SQS) and aggregate in a
 * consumer — the API stays a fast producer and never blocks on analytics.
 */
function recordClick(urlId, meta = {}) {
  // Two writes: append the raw event, and bump the denormalised counter so the
  // stats endpoint stays O(1). Both are async; we don't block the caller.
  const { referrer = null, userAgent = null, ip = null } = meta;

  db.query(
    `INSERT INTO clicks (url_id, referrer, user_agent, ip) VALUES ($1, $2, $3, $4)`,
    [urlId, referrer, userAgent, ip]
  ).catch((err) => console.warn('[analytics] click insert failed:', err.message));

  db.query(`UPDATE urls SET click_count = click_count + 1 WHERE id = $1`, [urlId])
    .catch((err) => console.warn('[analytics] counter update failed:', err.message));
}

/**
 * Read model for the stats endpoint: total clicks + a page of recent events.
 * @returns {Promise<{ clickCount: number, recentClicks: Array }>}
 */
async function getStats(urlId, limit = 20) {
  const [countRow, recent] = await Promise.all([
    db.query(`SELECT click_count FROM urls WHERE id = $1`, [urlId]),
    db.query(
      `SELECT clicked_at, referrer, user_agent, ip
         FROM clicks
        WHERE url_id = $1
        ORDER BY clicked_at DESC
        LIMIT $2`,
      [urlId, limit]
    ),
  ]);

  return {
    clickCount: countRow.rows[0] ? Number(countRow.rows[0].click_count) : 0,
    recentClicks: recent.rows.map((r) => ({
      clickedAt: r.clicked_at,
      referrer: r.referrer,
      userAgent: r.user_agent,
      ip: r.ip,
    })),
  };
}

module.exports = { recordClick, getStats };
