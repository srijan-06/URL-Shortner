import React, { useState } from 'react';
import { shorten } from '../api.js';

// Expiry options -> seconds. null == never expires.
const EXPIRY_OPTIONS = [
  { label: 'Never', value: '' },
  { label: '1 hour', value: String(60 * 60) },
  { label: '1 day', value: String(60 * 60 * 24) },
  { label: '7 days', value: String(60 * 60 * 24 * 7) },
  { label: '30 days', value: String(60 * 60 * 24 * 30) },
];

export default function ShortenForm({ onCreated }) {
  const [url, setUrl] = useState('');
  const [ttl, setTtl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await shorten(url.trim(), ttl ? Number(ttl) : undefined);
      onCreated(result);
      setUrl('');
    } catch (err) {
      setError(
        err.status === 429
          ? `Rate limited — try again in ${err.retryAfterSeconds || 'a few'} seconds.`
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Long URL</span>
        <input
          type="url"
          required
          placeholder="https://example.com/very/long/link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Expires</span>
        <select value={ttl} onChange={(e) => setTtl(e.target.value)}>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={loading || !url.trim()}>
        {loading ? 'Shortening…' : 'Shorten'}
      </button>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
