'use strict';

const { Pool } = require('pg');
const config = require('../config');

/**
 * A single shared connection pool for the process. `pg` multiplexes queries
 * over a small number of physical connections — critical when the app scales
 * horizontally against a managed Postgres with a connection cap.
 */
const pool = config.db.connectionString
  ? new Pool({ connectionString: config.db.connectionString, ssl: config.db.ssl })
  : new Pool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      ssl: config.db.ssl,
    });

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the process; log and let pg reconnect.
  console.error('[db] unexpected idle client error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, close };
