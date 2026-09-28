/**
 * Today's plan: four items, fifteen to twenty-five minutes.
 *
 * A curriculum that says "here are fifteen exercises, off you go" makes the
 * learner do the choosing, which is the part they are least equipped for and
 * the part most likely to end in doing nothing. This picks the four.
 */

const KIND = {
  warmup: { label: 'Warm-up', tone: 'warmup' },
  work: { label: 'Work', tone: 'work' },
  preview: { label: 'Preview', tone: 'preview' },
  recital: { label: 'Recital', tone: 'recital' },
};

export default function DailySet({ items = [], progress, onPick, library = [] }) {
  if (!items.length) return null;

  const entryFor = (songId) => library.find((s) => s.id === songId) ?? null;

  return (
    <div className="section">
      <h2 className="section-title">
        Today
        <span className={`daily-count ${progress?.met ? 'met' : ''}`}>
          {progress?.done ?? 0} / {progress?.goal ?? 3} runs
        </span>
      </h2>

      {/* Runs, not minutes. Minutes reward leaving the app open. */}
      <div className="daily-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
      </div>

      <div className="daily-set">
        {items.map((item) => {
          const entry = entryFor(item.songId);
          return (
            <button
              key={`${item.kind}-${item.songId}`}
              className={`daily-item ${KIND[item.kind]?.tone ?? ''}`}
              onClick={() => entry && onPick(entry)}
              disabled={!entry}
              title={item.why}
            >
              <span className="daily-kind">{KIND[item.kind]?.label ?? item.kind}</span>
              <span className="daily-name">{item.label}</span>
              <span className="daily-why">{item.why}</span>
              {/* Why the last few attempts did not move it, when they did not. */}
              {item.note && <span className="daily-note">{item.note}</span>}
            </button>
          );
        })}
      </div>

      {progress?.met && (
        <p className="hint daily-done">
          Today's goal is done. Anything past this is because you want to, which is the only
          reason that lasts.
        </p>
      )}
    </div>
  );
}
