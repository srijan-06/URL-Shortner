import React, { useState } from 'react';
import ShortenForm from './components/ShortenForm.jsx';
import ResultCard from './components/ResultCard.jsx';
import StatsView from './components/StatsView.jsx';

export default function App() {
  const [results, setResults] = useState([]);
  const [statsCode, setStatsCode] = useState('');

  function handleCreated(result) {
    setResults((prev) => [result, ...prev]);
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>🔗 Shortly</h1>
        <p className="muted">
          Fast URL shortener — base62 codes, Redis cache-aside, token-bucket rate
          limiting, async click analytics.
        </p>
      </header>

      <main>
        <ShortenForm onCreated={handleCreated} />

        {results.map((r) => (
          <ResultCard key={r.code} result={r} onViewStats={setStatsCode} />
        ))}

        <StatsView initialCode={statsCode} />
      </main>

      <footer className="muted">
        Built as a 2-day system-design project · Node · PostgreSQL · Redis · React
      </footer>
    </div>
  );
}
