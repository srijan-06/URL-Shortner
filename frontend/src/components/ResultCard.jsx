import React, { useState } from 'react';

export default function ResultCard({ result, onViewStats }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      // Clipboard API needs a secure context; fall back silently.
    }
  }

  return (
    <div className="card result">
      <div className="result-row">
        <a href={result.shortUrl} target="_blank" rel="noreferrer" className="short-url">
          {result.shortUrl}
        </a>
        <button className="secondary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className="muted truncate">→ {result.longUrl}</p>
      {result.expiresAt && (
        <p className="muted">Expires: {new Date(result.expiresAt).toLocaleString()}</p>
      )}
      <button className="link-button" onClick={() => onViewStats(result.code)}>
        View stats for /{result.code}
      </button>
    </div>
  );
}
