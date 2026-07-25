'use strict';

const express = require('express');
const config = require('./config');

const shortenRouter = require('./routes/shorten');
const statsRouter = require('./routes/stats');
const redirectRouter = require('./routes/redirect');

const {
  ExpiredError,
  NotFoundError,
  ValidationError,
} = require('./services/urlService');

function createApp() {
  const app = express();

  // Trust the proxy so req.ip / X-Forwarded-For are correct on Render/Railway.
  app.set('trust proxy', true);
  app.use(express.json({ limit: '16kb' }));

  // ── Minimal CORS (no dependency) ──────────────────────────────────────
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Health check (used by Render/Railway/compose healthchecks) ────────
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api', shortenRouter); // POST /api/shorten
  app.use('/api', statsRouter); //  GET  /api/stats/:code

  // ── Redirect route — MUST be last: GET /:code is a catch-all ──────────
  app.use('/', redirectRouter);

  // ── 404 for anything unmatched ────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Resource not found' });
  });

  // ── Central error handler: maps domain errors -> HTTP status ──────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: 'validation_error', message: err.message });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: 'not_found', message: err.message });
    }
    if (err instanceof ExpiredError) {
      // 410 Gone — the resource existed but is intentionally no longer available.
      return res.status(410).json({ error: 'gone', message: err.message });
    }
    console.error('[error]', err);
    return res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp };
