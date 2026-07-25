import React, { useState } from 'react';
import { getStats } from '../api.js';

export default function StatsView({ initialCode }) {
  const [code, setCode] = useState(initialCode || '');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load whenever a parent passes a new code (e.g. after "View stats").
  React.useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      fetchStats(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function fetchStats(c) {
    const target = (c ?? code).trim();
    if (!target) return;
    setError(null);
    setLoading(true);
    try {
      const data = await getStats(target.replace(/^\//, ''));
      setStats(data);
    } catch (err) {
      setStats(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Link stats</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          fetchStats();
        }}
      >
        <input
          type="text"
          placeholder="short code, e.g. 3k"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {stats && (
        <div className="stats">
          <p className="truncate muted">→ {stats.longUrl}</p>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-num">{stats.clickCount}</span>
              <span className="stat-label">clicks</span>
            </div>
            <div className="stat">
              <span className="stat-num">{stats.expired ? 'Expired' : 'Active'}</span>
              <span className="stat-label">status</span>
            </div>
          </div>

          <h3>Recent clicks</h3>
          {stats.recentClicks.length === 0 ? (
            <p className="muted">No clicks yet.</p>
          ) : (
            <table className="clicks">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Referrer</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentClicks.map((c, i) => (
                  <tr key={i}>
                    <td>{new Date(c.clickedAt).toLocaleString()}</td>
                    <td className="truncate">{c.referrer || 'direct'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
