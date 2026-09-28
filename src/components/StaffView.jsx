import { useEffect, useMemo, useRef } from 'react';
import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} from 'vexflow/bravura';
import { toMeasures } from '../lib/notation.js';

// A five-line stave is 40px of lines, but it needs room above and below for
// ledger lines, stems and beams — squeezing the two together clips exactly the
// notes furthest from the middle, which are the ones hardest to read anyway.
const TREBLE_Y = 14;
const BASS_Y = 104;
const STAVE_H = 178;
const PAD = 10;
const MIN_BAR_W = 190;

const INK = '#c9d3e2';
const CURSOR = '#4dd4c0';

/**
 * The score as written.
 *
 * Every app in this space that reviewers rate for teaching musicianship rather
 * than reflexes has this, and it is the one thing here that genuinely needs a
 * library: engraving is beams, rests, accidentals, ties and spacing, and none
 * of that is worth hand-rolling.
 *
 * The window follows the playhead a bar at a time rather than scrolling
 * continuously — reading music is done in bars, and a staff sliding under your
 * eyes is harder to read than one that turns pages.
 */
export default function StaffView({ score, engine, barsVisible = 4 }) {
  const hostRef = useRef(null);
  const engineRef = useRef(engine);
  const drawnRef = useRef({ from: -1, width: 0 });
  engineRef.current = engine;

  const layout = useMemo(() => toMeasures(score), [score]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let raf = 0;

    const render = (from, width) => {
      host.innerHTML = '';
      const slice = layout.measures.slice(from, from + barsVisible);
      if (!slice.length) return;

      const renderer = new Renderer(host, Renderer.Backends.SVG);
      renderer.resize(width, STAVE_H);
      const ctx = renderer.getContext();
      ctx.setFillStyle(INK);
      ctx.setStrokeStyle(INK);

      // The clefs and key signature take room on the first bar only.
      const headW = 62;
      const barW = Math.max(MIN_BAR_W, (width - headW - PAD * 2) / slice.length);

      let x = PAD;
      slice.forEach((measure, i) => {
        const first = i === 0;
        const w = first ? barW + headW : barW;
        const treble = new Stave(x, TREBLE_Y, w).setContext(ctx);
        const bass = new Stave(x, BASS_Y, w).setContext(ctx);

        if (first) {
          treble.addClef('treble').addKeySignature(layout.keySignature).addTimeSignature(layout.timeSignature);
          bass.addClef('bass').addKeySignature(layout.keySignature).addTimeSignature(layout.timeSignature);
        }
        treble.draw();
        bass.draw();
        if (first) {
          new StaveConnector(treble, bass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
          new StaveConnector(treble, bass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        }

        for (const [staff, stave, clef] of [
          ['treble', treble, 'treble'],
          ['bass', bass, 'bass'],
        ]) {
          const events = measure[staff];
          if (!events.length) continue;

          const notes = events.map((e) => {
            const n = new StaveNote({
              keys: e.keys,
              duration: e.isRest ? `${e.duration}r` : e.duration,
              clef,
            });
            for (let d = 0; d < (e.dots ?? 0); d += 1) n.addModifier(new Dot(), 0);
            return n;
          });
          Accidental.applyAccidentals([new Voice({ numBeats: layout.beatsPerBar, beatValue: 4 })
            .setStrict(false).addTickables(notes)], layout.keySignature);

          const voice = new Voice({ numBeats: layout.beatsPerBar, beatValue: 4 })
            .setStrict(false)
            .addTickables(notes);
          new Formatter().joinVoices([voice]).format([voice], w - (first ? headW + 20 : 20));
          const beams = Beam.generateBeams(notes.filter((n) => !n.isRest()));
          voice.draw(ctx, stave);
          for (const beam of beams) beam.setContext(ctx).draw();
        }
        x += w;
      });
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const width = host.clientWidth;
      if (!width || !layout.measures.length) return;

      const songTime = engineRef.current?.transportRef?.current?.now() ?? 0;
      const bar = Math.max(0, Math.floor(Math.max(0, songTime) / layout.secPerBar));
      // Turn the page a window at a time.
      const from = Math.floor(bar / barsVisible) * barsVisible;

      if (drawnRef.current.from !== from || drawnRef.current.width !== width) {
        drawnRef.current = { from, width };
        render(from, width);
      }

      const svg = host.querySelector('svg');
      if (!svg) return;
      let cursor = svg.querySelector('#playhead');
      if (!cursor) {
        cursor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cursor.setAttribute('id', 'playhead');
        cursor.setAttribute('y', String(TREBLE_Y - 8));
        cursor.setAttribute('height', String(BASS_Y + 48 - TREBLE_Y + 16));
        cursor.setAttribute('fill', CURSOR);
        cursor.setAttribute('opacity', '0.16');
        svg.appendChild(cursor);
      }
      const within = (Math.max(0, songTime) - from * layout.secPerBar) / (barsVisible * layout.secPerBar);
      const headW = 62;
      const usable = width - PAD * 2;
      cursor.setAttribute('x', String(PAD + Math.max(0, Math.min(1, within)) * usable));
      cursor.setAttribute('width', String(Math.max(3, usable / (barsVisible * layout.beatsPerBar * 2))));
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, barsVisible]);

  if (!layout.measures.length) {
    return <div className="staff-view empty-staff">Nothing to engrave yet.</div>;
  }
  return <div className="staff-view" ref={hostRef} />;
}
