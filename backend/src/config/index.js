'use strict';

require('dotenv').config();

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  port: int(process.env.PORT, 4000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${int(process.env.PORT, 4000)}`).replace(/\/$/, ''),

  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || 'localhost',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'urlshortener',
    ssl: bool(process.env.PGSSL, false) ? { rejectUnauthorized: false } : false,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  rateLimit: {
    capacity: int(process.env.RATE_LIMIT_CAPACITY, 20),
    refillPerSec: Number(process.env.RATE_LIMIT_REFILL_PER_SEC) || 5,
  },

  cache: {
    ttlSeconds: int(process.env.CACHE_TTL_SECONDS, 3600),
  },

  corsOrigin: process.env.CORS_ORIGIN || '*',
};

module.exports = config;
