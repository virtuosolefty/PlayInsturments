import { Component } from 'react';
import { exportHistory } from '../lib/storage.js';

/**
 * The floor under a render that throws.
 *
 * There was none, so any thrown error — a malformed imported MIDI, a VexFlow
 * edge case, a corrupt ghost record — white-screened the whole app. For an
 * app whose entire value is accumulated history, that is the most expensive
 * failure it has, and the most important thing the fallback can do is offer
 * to get the history out *before* anyone reaches for a hard refresh or starts
 * clearing site data to fix it.
 *
 * Class component because that is the only thing React lets catch this.
 */
/** How many components of the failing branch the development card names, innermost first. */
const WHERE_DEPTH = 5;

/** The innermost components of a React component stack, as "Inner › Outer"; '' when there is none. */
function failedIn(componentStack) {
  const names = String(componentStack ?? '').split('\n')
    .map(line => line.trim().match(/^at ([\w$.]+)|^([\w$.]+)@/))
    .filter(Boolean).map(match => match[1] ?? match[2]).filter(name => /^[A-Z]/.test(name));
  return names.slice(0, WHERE_DEPTH).join(' › ');
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, where: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[boundary] render failed:', error, info?.componentStack);
    // In development the card also says where it broke, so a screenshot of it is enough to find the bug.
    if (import.meta.env?.DEV) this.setState({ where: failedIn(info?.componentStack) });
  }

  saveBackup = () => {
    try {
      const blob = new Blob([exportHistory()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `piano-practice-rescue-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[boundary] could not export:', err);
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A named fallback where one was given — a notation failure should cost
    // you the notation, not the app around it.
    if (this.props.fallback) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback(error, () => this.setState({ error: null }))
        : this.props.fallback;
    }

    return (
      <div className="boundary" role="alert">
        <div className="boundary-card">
          <h2>Something in the app broke</h2>
          <p>
            This is a bug, not something you did. Your practice history is still on this device —
            save a copy before reloading, and nothing is lost either way.
          </p>
          <pre className="boundary-detail">{String(error?.message ?? error)}</pre>
          {this.state.where && <p className="boundary-where">In {this.state.where}</p>}
          <div className="boundary-actions">
            <button className="primary" onClick={this.saveBackup}>
              Save a backup
            </button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
