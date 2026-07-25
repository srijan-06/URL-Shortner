-- ─────────────────────────────────────────────────────────────
-- URL shortener schema
-- ─────────────────────────────────────────────────────────────

-- Core mapping table. `id` is a BIGSERIAL: the sequence gives us a
-- monotonically increasing integer per row, which we base62-encode into the
-- short code. This is the read/write hot path.
CREATE TABLE IF NOT EXISTS urls (
    id          BIGSERIAL PRIMARY KEY,
    long_url    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL means "never expires". When set, redirects after this instant
    -- return 410 Gone.
    expires_at  TIMESTAMPTZ,
    -- Denormalised running total so the stats endpoint doesn't have to
    -- COUNT(*) the (potentially huge) clicks table on every read.
    click_count BIGINT      NOT NULL DEFAULT 0
);

-- Append-only analytics table. Written asynchronously off the redirect path so
-- analytics latency never affects the user-facing redirect.
CREATE TABLE IF NOT EXISTS clicks (
    id          BIGSERIAL PRIMARY KEY,
    url_id      BIGINT      NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    referrer    TEXT,
    user_agent  TEXT,
    ip          TEXT
);

-- Fast "recent clicks for this code" queries.
CREATE INDEX IF NOT EXISTS idx_clicks_url_id_clicked_at
    ON clicks (url_id, clicked_at DESC);

-- Supports a future TTL-sweep job that deletes expired links in batches.
CREATE INDEX IF NOT EXISTS idx_urls_expires_at
    ON urls (expires_at)
    WHERE expires_at IS NOT NULL;
