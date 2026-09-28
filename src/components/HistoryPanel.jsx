/**
 * HistoryPanel — persistent progress across practice sessions.
 * Sparkline of past accuracy + the bars you keep fumbling, clickable to loop.
 */

import { useState } from 'react';
import { getSongHistory } from '../lib/storage.js';

/** An unmeasured ratio is not zero per cent — see timingAccuracy in matcher.js. */
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function HistoryPanel({
  history,
  troubleSpots,
  onPractiseSpot,
  onHearSpot,
  onClear,
  onBuildDrill,
  songId,
}) {
  const [showAllArrangements, setShowAllArrangements] = useState(false);

  // If showing all arrangements, load unfiltered history
  const displayHistory = showAllArrangements && songId ? getSongHistory(songId) : history;
  const sessions = displayHistory?.sessions ?? [];
  const recent = sessions.slice(-24);
  const best = recent.length ? Math.max(...recent.map((s) => s.noteAccuracy)) : 0;
  const last = sessions[sessions.length - 1];
  const previous = sessions[sessions.length - 2];
  const delta = last && previous ? last.noteAccuracy - previous.noteAccuracy : null;

  // Check if there's hidden history in other arrangements
  const allHistory = songId ? getSongHistory(songId) : null;
  const hiddenCount = (allHistory?.sessions?.length ?? 0) - sessions.length;

  return (
    <>
      <div className="section">
        <h2 className="section-title">
          Progress
          {sessions.length > 0 && (
            <button className="ghost danger" onClick={onClear}>
              clear
            </button>
          )}
        </h2>

        {hiddenCount > 0 && !showAllArrangements && (
          <p className="hint" style={{ marginBottom: '0.5rem' }}>
            <button
              className="ghost"
              onClick={() => setShowAllArrangements(true)}
              title="Show runs from other keyboard arrangements"
            >
              {hiddenCount} more run{hiddenCount === 1 ? '' : 's'} in other arrangements
            </button>
          </p>
        )}

        {showAllArrangements && hiddenCount > 0 && (
          <p className="hint" style={{ marginBottom: '0.5rem' }}>
            <button className="ghost" onClick={() => setShowAllArrangements(false)}>
              Show current arrangement only
            </button>
          </p>
        )}

        {sessions.length === 0 ? (
          <p className="empty">No runs recorded yet for this piece.</p>
        ) : (
          <>
            <div className="spark" title="Note accuracy per run, oldest to newest">
              {recent.map((s, i) => (
                <i
                  key={`${s.at}-${i}`}
                  className={s.noteAccuracy === best ? 'best' : ''}
                  style={{ height: `${Math.max(6, s.noteAccuracy * 100)}%` }}
                  title={`${fmtDate(s.at)} · ${pct(s.noteAccuracy)} notes · ${pct(s.timingAccuracy)} on time · ${
                    s.mode
                  } @ ${Math.round(s.rate * 100)}%`}
                />
              ))}
            </div>
            <div className="kv">
              <span>Runs</span>
              <span>{history.totalRuns}</span>
            </div>
            <div className="kv">
              <span>Best accuracy</span>
              <span>{pct(best)}</span>
            </div>
            <div className="kv">
              <span>Last run</span>
              <span>
                {pct(last.noteAccuracy)}
                {delta != null && (
                  <span style={{ color: delta >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                    {' '}
                    {delta >= 0 ? '▲' : '▼'}
                    {Math.abs(Math.round(delta * 100))}
                  </span>
                )}
              </span>
            </div>
            <div className="kv">
              <span>Last timing</span>
              <span>±{last.meanAbsDeviationMs} ms</span>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h2 className="section-title">Trouble spots</h2>
        {troubleSpots.length === 0 ? (
          <p className="empty">Nothing recurring yet. Play a full run to build this up.</p>
        ) : (
          <>
            <div className="trouble">
              {troubleSpots.map((spot) => (
                /* Hear it, then play it. The bars you keep failing are exactly
                   the ones worth hearing first, and both buttons cover the
                   identical four bars — a reference that stopped somewhere
                   other than the attempt would be worse than none. */
                <div className="trouble-row" key={spot.time}>
                  <button onClick={() => onPractiseSpot(spot.time)} title="Loop four bars from here">
                    <span className="time">{spot.time.toFixed(1)}s</span>
                    <span className="what">
                      {spot.names?.length ? spot.names.join(', ') : 'timing'}
                    </span>
                    <span className="count">
                      {spot.missed ? `${spot.missed}✗` : ''}
                      {spot.wrong ? ` ${spot.wrong}!` : ''}
                      {spot.late ? ` ${spot.late}~` : ''}
                    </span>
                  </button>
                  {onHearSpot && (
                    <button
                      className="hear-bit"
                      onClick={() => onHearSpot(spot.time)}
                      title="Hear these four bars played to you"
                      aria-label={`Hear the bars at ${spot.time.toFixed(1)} seconds`}
                    >
                      ♪
                    </button>
                  )}
                </div>
              ))}
            </div>
            {onBuildDrill && (
              <button className="primary drill-build" onClick={onBuildDrill}>
                ✎ Build me an exercise
              </button>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              Counts accumulate across every run. Click a spot to loop those four bars, or build an exercise
              from the worst of them — each passage approached from the bar before and played twice.
            </p>
          </>
        )}
      </div>
    </>
  );
}
