import { useRef, useState } from 'react';
import { exportHistory, importHistory, parseBackup } from '../lib/storage.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Getting your practice history out, and back in.
 *
 * Everything the app knows about you — every streak, the Path exercise by
 * exercise, benchmark runs going back to your first week — is in one
 * localStorage key, and a browser may evict that without asking. There was an
 * `exportHistory` function for a long time that nothing ever called.
 *
 * Restore replaces rather than merges, so it asks first and says exactly what
 * it is about to overwrite and with what.
 */
export default function BackupPanel({ onRestored }) {
  const inputRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState(null);

  const download = () => {
    const blob = new Blob([exportHistory()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piano-practice-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNote({ tone: 'ok', text: 'Backup saved to your downloads.' });
  };

  const choose = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setNote({ tone: 'bad', text: parsed.error });
      return;
    }
    setNote(null);
    setPending({ text, summary: parsed.summary });
  };

  const confirm = () => {
    const result = importHistory(pending.text);
    setPending(null);
    if (!result.ok) {
      setNote({ tone: 'bad', text: result.error });
      return;
    }
    setNote({
      tone: 'ok',
      text: `Restored ${plural(result.summary.sessions, 'run')} across ${plural(result.summary.songs, 'piece')}.`,
    });
    onRestored?.();
  };

  return (
    <div className="section">
      <h2 className="section-title">Backup</h2>

      <div className="backup-row">
        <button onClick={download}>Export</button>
        <button onClick={() => inputRef.current?.click()}>Restore…</button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            choose(e.target.files?.[0]);
            // Cleared so picking the same file twice still fires a change.
            e.target.value = '';
          }}
        />
      </div>

      {pending && (
        <div className="backup-confirm" role="alertdialog" aria-label="Confirm restore">
          <p>
            Replace everything with this backup? It holds{' '}
            <strong>{plural(pending.summary.sessions, 'run')}</strong> across{' '}
            {plural(pending.summary.songs, 'piece')} and {plural(pending.summary.days, 'practice day')}.
          </p>
          <p className="hint">
            Restoring replaces your current history rather than merging it — merging two records would
            invent practice that never happened.
          </p>
          <div className="backup-actions">
            <button className="primary" onClick={confirm}>
              Replace
            </button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {note && (
        <p className={`hint backup-note ${note.tone}`} role="status">
          {note.text}
        </p>
      )}

      <p className="hint">
        Your history lives in this browser alone. Clearing site data, or a browser reclaiming space,
        takes it with it.
      </p>
    </div>
  );
}
