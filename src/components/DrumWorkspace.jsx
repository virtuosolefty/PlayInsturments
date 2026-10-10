import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DrumLanes from './DrumLanes.jsx';
import DrumPads from './DrumPads.jsx';
import StudyOptions from './StudyOptions.jsx';
import { DRUM_PIECES, drumForMidi, drumInstruction, drumLanes } from '../lib/drums.js';
import { instrumentKit } from '../lib/instruments.js';
import { normalizeStageQuality } from '../lib/stage/quality.js';
import { webglAvailable } from '../lib/webgl.js';
import { useDrumInput } from '../hooks/useDrumInput.js';

const DrumStage = lazy(() => import('./DrumStage.jsx'));

/** The drums of the next beat that are still to be hit. */
function nextHits(engine, score) {
  const now = Math.max(0, engine.songTime);
  const waiting = (engine.sessionRef.current?.targets ?? score.notes).filter(note => (note.status ?? 'pending') === 'pending' && note.time >= now - 0.12);
  return waiting.filter(note => note.time === waiting[0].time);
}

/** The kit at a glance for free play: every piece, the key that plays it, and a button to hear it. */
function DrumCard({ onHit }) {
  return <section className="drum-card" aria-label="Drum kit">
    <header><span className="eyebrow">DRUM KIT</span><h3>Nine pieces, nine keys</h3><p>Each drum is played by the letter it starts with. Hold a steady pulse on the kick, then answer it on the snare.</p></header>
    <ul>{DRUM_PIECES.map(piece => <li key={piece.id}>
      <button type="button" onClick={() => onHit(piece.id)} aria-label={`Hear the ${piece.label.toLowerCase()}`}><kbd>{piece.key.toUpperCase()}</kbd><span>{piece.label}</span><small>{piece.limb === 'foot' ? 'foot' : 'hand'}</small></button>
    </li>)}</ul>
    <p className="hint">A pad controller or an electronic kit plays too: it sends the standard drum notes, kick on 36 and snare on 38.</p>
  </section>;
}

/**
 * The drum studio: the lanes to read, the 3D kit to hit, and the pads.
 *
 * On the 3D Stage the kit is the model built in code (DrumStage.jsx); in a
 * lesson it stands beside the lanes, where a wide window has room for both. On
 * the 2D Trainer, and whenever 3D cannot start or is lost, the pads are the
 * whole instrument. The pads are always reachable, so touch, keyboard and
 * screen-reader players never depend on the model: under the 3D kit they fold
 * away on a wide screen and stay out on a narrow one, where they are the
 * easier thing to hit.
 *
 * @param {boolean} [props.compact] a narrow screen
 */
export default function DrumWorkspace({ score, engine, settings, onStudy, freePlay, onFreePlay, inspector, listening = false, compact = false, onError }) {
  const hit = useDrumInput(onError);
  // Set when the 3D kit could not be shown; the workspace then keeps to the pads.
  const [flat, setFlat] = useState(false);
  const [, refresh] = useState(0);
  const live = useRef(engine);
  live.current = engine;
  // The next-hit marks move with the music, so redraw while it plays and once after it stops.
  useEffect(() => {
    let wasBusy = false;
    const id = setInterval(() => {
      if (document.hidden) return;
      const busy = live.current.playing || live.current.activeInputRef.current.size > 0;
      if (busy || wasBusy) refresh(count => count + 1);
      wasBusy = busy;
    }, 80);
    return () => clearInterval(id);
  }, []);

  const quality = normalizeStageQuality(settings.stageQuality);
  const solid = !flat && settings.renderer === 'gl' && webglAvailable();
  const coming = freePlay ? [] : nextHits(engine, score);
  const next = new Set(coming.map(note => drumForMidi(note.midi)?.id));
  const card = <DrumCard onHit={hit} />;
  const pads = <DrumPads onHit={hit} next={next} large={!solid} />;
  const giveUp = why => {
    console.warn('[stage] the 3D drum kit is unavailable, showing the pads:', why);
    setFlat(true);
  };

  return (
    <section className={`guitar-workspace drums-workspace stage-dark ${solid ? 'with-kit' : 'pads-only'}`} aria-label="Drum studio">
      {(!freePlay || solid) && <div className="drum-board" style={{ '--drum-lanes': drumLanes(score).length }}>
        {!freePlay && <DrumLanes score={score} engine={engine} pps={settings.pps} />}
        {solid && <Suspense fallback={<div className="guitar-stage-loading drum-stage">Setting up your kit…</div>}>
          <DrumStage engine={engine} score={score} onHit={hit} onUnavailable={giveUp} freePlay={freePlay} listening={listening} quality={quality} />
        </Suspense>}
      </div>}
      {!freePlay && <div className="guitar-next"><span>UP NEXT</span><strong>{coming.length ? coming.map(drumInstruction).join('  +  ') : 'Study complete'}</strong>
        <label className="guitar-exercise drum-exercise">Exercise<select aria-label="Drum exercise" value={score.id} onChange={event => onStudy(event.target.value)}>
          <StudyOptions kit={instrumentKit('drums')} />
        </select></label>
      </div>}
      {solid && !compact
        ? <details className="guitar-fret-controls with-stage drum-pad-controls"><summary>Show drum pads · keyboard accessible</summary>{pads}</details>
        : pads}
      {freePlay ? (inspector ? createPortal(card, inspector) : card)
        : <div className="guitar-chords"><button onClick={onFreePlay}>Explore the kit in Free play →</button><span>Blue ring: hit next · Blue tiles are hands, amber is the kick</span></div>}
    </section>
  );
}
