import { useEffect, useRef } from 'react';
import { audio } from '../lib/audio.js';

/**
 * The signal actually leaving the app.
 *
 * The studio-hardware work asked for a level display on the instrument strip
 * and it was left out on purpose: a meter that is not reading a level is a lie
 * with a nice gradient on it. `audio.level` reads the master bus, so this moves
 * when and only when sound is really being made — which incidentally makes it
 * the most direct answer the interface has to "is anything coming out of this".
 *
 * Driven by its own rAF loop writing to a ref, never by React state. A meter
 * re-rendering the top bar sixty times a second while you play would cost more
 * than everything it is measuring.
 */
export default function LevelMeter({ segments = 12 }) {
  const barsRef = useRef([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const level = audio.level;
      const lit = Math.round(level * segments);
      for (let i = 0; i < barsRef.current.length; i += 1) {
        const el = barsRef.current[i];
        if (!el) continue;
        const on = i < lit;
        // Written straight to the style, not through className, so a change is
        // one property assignment rather than a class-list diff per segment.
        el.style.opacity = on ? '1' : '0.18';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [segments]);

  return (
    <span className="level-meter" role="img" aria-label="Output level">
      {Array.from({ length: segments }, (_, i) => (
        <i
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          /* The top two segments run hot, the way every hardware meter does —
             it is how you learn where the ceiling is without reading a number. */
          className={i >= segments - 2 ? 'hot' : ''}
        />
      ))}
    </span>
  );
}
