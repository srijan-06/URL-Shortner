// Thin API client. In dev, API_BASE is '' and Vite proxies /api -> :4000.
// In prod, set VITE_API_BASE_URL to the deployed backend origin.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.error;
    err.retryAfterSeconds = body.retryAfterSeconds;
    throw err;
  }
  return body;
}

export function shorten(url, ttlSeconds) {
  return request('/api/shorten', {
    method: 'POST',
    body: JSON.stringify(ttlSeconds ? { url, ttlSeconds } : { url }),
  });
}

export function getStats(code) {
  return request(`/api/stats/${encodeURIComponent(code)}`);
}

export { API_BASE };
