import { useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';

const SHORTCUTS = [
  ['Space', 'Play or pause'], ['0', 'Stop and save the run'], ['1', 'Listen mode'], ['2', 'Practice mode'], ['3', 'Wait for me'],
  ['[', 'Toggle passage loop'], [']', 'Toggle metronome'], ['\\', 'Hear the phrase / your turn'], ['← / →', 'Move through the piece'], ['↑ / ↓', 'Change tempo'],
  ['A–J', 'Play the middle-C octave'], ['Z–M', 'Play the lower octave'], ['Esc', 'Close a panel or exit Focus'],
];
export default function HelpDialog({ onClose }) {
  const [query, setQuery] = useState('');
  const ref = useDialog({ onClose });
  const shown = SHORTCUTS.filter(row => row.join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="report-overlay"><section className="report help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" ref={ref} tabIndex={-1}>
    <header className="settings-heading"><h2 id="help-title">Shortcuts & help</h2><button aria-label="Close help" onClick={onClose}>×</button></header>
    <p>Keep your hands near the instrument. Shortcuts work when you’re in the studio, outside text fields and dialogs.</p>
    <label className="library-search"><span className="sr-only">Search shortcuts</span><input type="search" placeholder="Find a shortcut…" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <dl className="shortcut-list">{shown.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
    {!shown.length && <p role="status">No shortcuts match that search.</p>}
    <p className="hint">In a passage loop, focus either boundary and use the arrow keys to move it by one bar. Home and End move it to its limit.</p>
    <button onClick={onClose}>Done</button>
  </section></div>;
}
