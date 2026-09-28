import { useEffect, useRef, useState } from 'react';
import { TUNING } from '../lib/rollPaint.js';

/**
 * The animation constants, live.
 *
 * Every number the roll animates by was arrived at by editing a literal,
 * rebuilding, watching a run, and guessing again — and the ones that matter
 * most (how long a hit flourish lives, how far out a note starts to brighten,
 * how many clean notes light the hit line) can only be judged while music is
 * actually moving. Both reference implementations shipped a dat.gui panel for
 * exactly this, and it is the cheapest tool in either of them.
 *
 * Dev builds only. `import.meta.env.DEV` is a compile-time constant, so the
 * whole component is dropped from a production bundle rather than merely
 * hidden — nothing here should ever be one keystroke away from a player.
 */
export default function TuningPanel() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      // Backquote: not a note key, not a shortcut, not a browser chord.
      if (e.key === '`') setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const rows = Object.entries(TUNING);
  return (
    <div className="tuning-panel" ref={ref}>
      <h3>
        Tuning <span>dev only · ` to close</span>
      </h3>
      {rows.map(([key, spec]) => (
        <label key={key}>
          <span>
            {key}
            <em>{spec.value}</em>
          </span>
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={spec.value}
            onChange={(e) => {
              // Written straight into the live object the renderers read, so
              // the next frame uses it — no reload, no rebuild.
              spec.value = Number(e.target.value);
              force((n) => n + 1);
            }}
          />
        </label>
      ))}
      <p className="hint">
        Nothing here is saved. When a value looks right, copy it into the constant it came from.
      </p>
    </div>
  );
}
