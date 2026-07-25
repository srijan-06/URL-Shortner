'use strict';

const { createApp } = require('./app');
const config = require('./config');
const { migrate } = require('./db/migrate');
const db = require('./db/pool');
const redis = require('./redis/client');

async function main() {
  // Apply schema on boot (idempotent) so a fresh managed DB is ready to serve.
  try {
    await migrate();
  } catch (err) {
    console.error('[boot] migration failed:', err.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[boot] URL shortener listening on ${config.baseUrl} (port ${config.port})`);
  });

  // Graceful shutdown: stop accepting connections, then close DB/Redis.
  async function shutdown(signal) {
    console.log(`[shutdown] received ${signal}, closing…`);
    server.close(async () => {
      await Promise.allSettled([db.close(), redis.close()]);
      process.exit(0);
    });
    // Force-exit if graceful close hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
