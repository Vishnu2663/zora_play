import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('[milo] recovered from UI error', err); }
  render() {
    if (this.state.failed) {
      return (
        <div className="fatal">
          <p>Oops! Zora Play tripped over its tail.</p>
          <button data-focusable="" autoFocus onClick={() => location.reload()}>Start again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Debug-only performance switches (?perf=nomilo,nosky,noglow,noanim): used to find what is slow on weak TV sticks.
try {
  const flags = (new URLSearchParams(window.location.search).get('perf') ?? '').split(',').filter(Boolean);
  for (const f of flags) document.documentElement.classList.add(`perf-${f}`);
} catch { /* no query support */ }

createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>);
