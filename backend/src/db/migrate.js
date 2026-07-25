'use strict';

/**
 * Idempotent migration runner. Applies schema.sql (all statements use
 * IF NOT EXISTS) so it's safe to run on every deploy/boot.
 *
 *   npm run migrate
 */

const fs = require('fs');
const path = require('path');
const { pool, close } = require('./pool');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('[migrate] applying schema…');
  await pool.query(sql);
  console.log('[migrate] done.');
}

// Run directly (node src/db/migrate.js) but also export for programmatic use.
if (require.main === module) {
  migrate()
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
