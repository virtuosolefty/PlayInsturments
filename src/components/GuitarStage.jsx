import { useEffect, useRef, useState } from 'react';
import { GUITAR_TUNING } from '../lib/guitar.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { noteName } from '../lib/theory.js';
import { chordFullName, chordTone } from '../lib/guitarPresentation.js';
import { useStageView } from '../hooks/useStageView.js';
import { buildGuitarRig } from '../lib/guitarRig.js';
import { dotLook, hoverText, stageLabels } from '../lib/guitarStageView.js';
import { guitarViews } from '../lib/guitarViews.js';
import { STAGE_TIERS } from '../lib/stage/quality.js';
import { runStage } from '../lib/stage/stageRunner.js';
import { createStudio } from '../lib/stage/studio.js';
import ResetViewButton from './ResetViewButton.jsx';
import StageLabels from './StageLabels.jsx';
import StageViewSwitch from './StageViewSwitch.jsx';

const NO_POSITIONS = new Map();
/** After this long a plucked string's swing is too small to see, so the stage stops redrawing for it. */
const SWING_MS = 2500;
/** A stage rebuilt in the Whole instrument view waits this long for the model before showing the drawn guitar. */
const MODEL_WAIT_MS = 1500;
/** How long the note that the 3D guitar could not be loaded stays up. */
const NOTICE_MS = 6000;

const newOwned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });

/** The next unplayed note of the lesson, or undefined once it is finished. */
function nextNote(engine, piece) {
  const now = engine.transportRef.current?.now() ?? 0;
  return (engine.sessionRef.current?.targets ?? piece.notes).find(n => n.status !== 'hit' && n.time >= Math.max(0, now) - 0.1);
}

/**
 * Restyles the position markers whose state changed since the last frame.
 *
 * @param {Map<object, object>} shown the look each marker was last given; updated in place
 * @returns {{ counts: { held: number, possible: number, target: number }, changed: boolean }}
 */
function paintDots(rig, shown, { active, positions, next, chord, hovered, focused }) {
  const counts = { held: 0, possible: 0, target: 0 };
  let changed = false;
  rig.dots.forEach(dot => {
    const place = dot.userData;
    const pointed = place === hovered || (focused?.string === place.string && focused?.fret === place.fret);
    const state = guitarFeedback(place, active, positions, !chord && next?.string === place.string && next?.fret === place.fret, chord?.frets[place.string] === place.fret, pointed);
    if (state in counts) counts[state]++;
    const look = dotLook(state, { verdict: active.get(place.midi)?.type, root: !!chordTone(chord, place.string)?.root });
    if (shown.get(dot) === look) return;
    shown.set(dot, look);
    changed = true;
    dot.visible = look.visible;
    dot.material.color.set(look.color);
    dot.material.transparent = true;
    dot.material.opacity = look.opacity;
    dot.geometry = look.ring ? rig.shapes.ring : rig.shapes.disk;
    dot.scale.setScalar(look.scale);
  });
  return { counts, changed };
}

/**
 * Lights each sounding string and lets it swing about where it rests, dying away, unless motion is reduced.
 *
 * @param {Map<object, boolean>} lit whether each string was lit last frame; updated in place
 * @returns {boolean} whether anything moved or changed, so the stage needs drawing again
 */
function paintStrings(rig, lit, { active, positions, still, now }) {
  let changed = false;
  rig.strings.forEach((wire, s) => {
    const entry = positions.get(s), sounding = !!entry && active.has(entry.midi);
    if (sounding !== !!lit.get(wire)) {
      lit.set(wire, sounding);
      changed = true;
      wire.material.emissive.set(sounding ? '#3fbc98' : '#000000');
      wire.material.emissiveIntensity = sounding ? 0.35 : 0;
    }
    const swinging = sounding && !still && now - entry.at < SWING_MS;
    const y = wire.userData.restY + (swinging ? Math.sin(now * 0.065 + s) * 0.012 * Math.exp(-(now - entry.at) / 400) : 0);
    if (wire.position.y !== y) { wire.position.y = y; changed = true; }
  });
  return changed;
}

/** The guitar built in code, with the resources it owns. */
function drawnRig({ maxFret, lacquered }) {
  const owned = newOwned();
  return { ...buildGuitarRig({ owned, maxFret, lacquered }), owned };
}

/**
 * What the stage runner asks of the guitar (stageRunner.js): restyle the
 * markers and strings each frame, and lay out the labels. Marker states and
 * strings are remembered per mesh, so a new rig starts afresh.
 */
function guitarHooks(el, latest, hover) {
  const shown = new WeakMap(), lit = new WeakMap(), calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let tally = '', labelled = null;
  return {
    paint(rig, now) {
      const { engine, score, chord, labelMode, labelSize, focusPosition, activePositions } = latest.current;
      const active = engine.activeInputRef.current, positions = activePositions?.current ?? NO_POSITIONS;
      const dots = paintDots(rig, shown, { active, positions, next: nextNote(engine, score), chord, hovered: hover.place, focused: focusPosition });
      const counted = `${dots.counts.held}|${dots.counts.possible}|${dots.counts.target}`;
      if (counted !== tally) { tally = counted; Object.assign(el.dataset, { heldPositions: dots.counts.held, possiblePositions: dots.counts.possible, targetPositions: dots.counts.target }); }
      const moved = paintStrings(rig, lit, { active, positions, still: calm.matches, now });
      const wanted = [chord, labelMode, labelSize];
      const relabel = !labelled || wanted.some((value, i) => value !== labelled[i]);
      if (relabel) labelled = wanted;
      return { changed: dots.changed || moved, relabel };
    },
    labels(rig, { project, width, stringBand }) {
      const { chord, labelMode, leftHanded, labelSize } = latest.current;
      return stageLabels({ project, width, maxFret: rig.maxFret, chord, labelMode, leftHanded, fontSize: labelSize, stringBand, neck: rig.neck });
    },
  };
}

/**
 * Hover, pluck and context-loss handling on the stage canvas. `hover.place` is the place under the pointer.
 * While the view is being turned, hovering is ignored; where it can be turned, the background shows a grab cursor.
 */
function watchPointer(canvas, run, hover, { onHover, onPluck, onLost }) {
  const showCursor = place => { canvas.style.cursor = run.dragging ? 'grabbing' : place ? 'pointer' : run.turnable ? 'grab' : 'default'; };
  // The turntable's listeners were added first, so by the time these run it already knows whether a drag began or ended.
  const handlers = {
    pointermove: event => {
      if (run.dragging) { showCursor(null); return; }
      hover.place = run.placeAt(event);
      showCursor(hover.place);
      onHover(hoverText(hover.place));
    },
    pointerleave: () => { hover.place = null; onHover(''); },
    pointerdown: event => {
      if (run.dragging) { showCursor(null); return; }
      const place = event.button === 0 ? run.placeAt(event) : null;
      if (place) onPluck(place);
    },
    pointerup: event => { showCursor(run.placeAt(event)); },
    webglcontextlost: event => { event.preventDefault(); onLost('The graphics context was lost'); },
  };
  for (const [type, handler] of Object.entries(handlers)) canvas.addEventListener(type, handler);
  return () => { for (const [type, handler] of Object.entries(handlers)) canvas.removeEventListener(type, handler); };
}

/**
 * When the downloaded guitar the player asked for could not be loaded: puts
 * the stage back on Learn and says so for a while. A model that failed while
 * nobody was waiting for it says nothing.
 *
 * @returns {[string, () => void]} the notice, and a way to clear it
 */
function useModelNotice(modelState, latest, setStageView) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (modelState !== 'failed' || latest.current.stageView !== 'whole') return;
    setStageView('learn');
    setNotice('The 3D guitar could not be loaded. Choose Whole instrument to try again.');
  }, [modelState, latest, setStageView]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice, () => setNotice('')];
}

export default function GuitarStage({ engine, score, onPluck, onContextLost, leftHanded, theme = 'light', quality = 'auto', chord = null, activePositions, maxFret = 12, labelSize = 14, labelMode = 'fingers', focusPosition = null, view = 'lesson' }) {
  const host = useRef(null);
  const latest = useRef(null);
  const controls = useRef(null);
  const [hover, setHover] = useState('');
  const [labels, setLabels] = useState([]);
  const [turned, setTurned] = useState(false);
  // Whether this view can be turned on this stage; a cramped stage cannot, even in free play.
  const [turnable, setTurnable] = useState(false);
  // Keeps Reset view in place while it has keyboard focus, so focus is not dropped when the view comes back.
  const [resetFocused, setResetFocused] = useState(false);
  // Free play's view: Learn (the guitar built in code, close up) or the whole downloaded guitar.
  const [stageView, setStageView] = useStageView(view);
  // The downloaded guitar: 'unavailable' on the light tier, otherwise 'idle', 'loading', 'ready' or 'failed'.
  const [modelState, setModelState] = useState('unavailable');
  const views = useRef(null);
  latest.current = { engine, score, onPluck, onContextLost, leftHanded, flip: leftHanded ? -1 : 1, chord, activePositions, focusPosition, labelMode, labelSize, view, stageView, closeUp: stageView !== 'whole' };
  const [notice, clearNotice] = useModelNotice(modelState, latest, setStageView);
  // The switch stays after a failed download, so focus is not lost and Whole instrument can try again.
  const offersWhole = view === 'freePlay' && modelState !== 'unavailable';
  const wholeGuitar = offersWhole && stageView === 'whole';
  const status = wholeGuitar && ['idle', 'loading'].includes(modelState) ? 'Preparing the 3D guitar…' : notice;
  const chooseView = value => {
    clearNotice();
    if (value === 'whole') views.current?.retry();
    setStageView(value);
  };
  const resetView = event => {
    // A pointer click needs no lingering focus; a key press (detail 0) keeps it here.
    if (event.detail > 0) event.currentTarget.blur();
    if (turned) controls.current?.resetView();
  };
  useEffect(() => {
    const el = host.current;
    let studio, first;
    try {
      studio = createStudio(el, { theme, quality });
      try { first = { ...drawnRig({ maxFret, lacquered: studio.tier === STAGE_TIERS.FULL }), maxFret }; }
      catch (error) { studio.dispose(); throw error; }
    } catch (error) {
      console.warn('[stage] the 3D guitar could not start, falling back to the 2D trainer:', error.message);
      latest.current.onContextLost(error.message);
      return undefined;
    }
    el.dataset.stageTier = studio.tier;
    // The downloaded guitar is for the full tier; the light tier keeps the stage exactly as it was.
    const full = studio.tier === STAGE_TIERS.FULL;
    setModelState(full ? 'idle' : 'unavailable');
    const pointed = { place: null };
    // Rebuilt in the Whole instrument view (the theme or the frets changed), the stage waits for the model rather than flash the drawn guitar.
    const hold = full && latest.current.view === 'freePlay' && latest.current.stageView === 'whole' ? MODEL_WAIT_MS : 0;
    const run = runStage(el, studio, { latest, maxFret, hooks: guitarHooks(el, latest, pointed), setLabels, setTurned, setTurnable, controls, rig: first, hold });
    const unwatch = watchPointer(studio.renderer.domElement, run, pointed, {
      onHover: setHover, onPluck: place => latest.current.onPluck(place), onLost: why => latest.current.onContextLost(why),
    });
    const broken = why => {
      console.warn('[stage] a guitar could not go on stage, falling back to the 2D trainer:', why);
      latest.current.onContextLost(why);
    };
    const switcher = guitarViews(run, { drawn: first, full, maxFret, latest, onState: setModelState, onShow: () => { pointed.place = null; setHover(''); }, onBroken: broken });
    views.current = switcher;
    switcher.apply();
    return () => { switcher.stop(); if (views.current === switcher) views.current = null; unwatch(); run.stop(); };
  }, [theme, maxFret, quality]);
  // Entering free play fetches the model; choosing a view puts its guitar on stage.
  useEffect(() => { views.current?.apply(); }, [view, stageView]);
  return <div className="guitar-stage" ref={host} role="group" aria-label="Three-dimensional guitar fretboard" data-view={view}>
    <div className="guitar-stage-top"><div><strong>{chord ? chordFullName(chord) : 'Fretboard'}</strong><span>{chord ? 'Open-position voicing' : 'Standard tuning · E A D G B E'}</span></div>{chord && <div className="guitar-open-picks" role="group" aria-label="Play open strings"><span>OPEN STRINGS</span>{[0,1,2,3,4,5].map(s=><button key={s} aria-label={'Play open string '+(6-s)+': '+noteName(GUITAR_TUNING[s])} onClick={()=>onPluck({string:s,fret:0})}>{noteName(GUITAR_TUNING[s])}</button>)}</div>}</div>
    <StageLabels labels={labels} labelSize={labelSize} />
    <div className="stage-status" role="status">{status}</div>
    <div className="guitar-stage-bottom"><span className="guitar-stage-legend">{chord && <><i className="root"/>Root </>}<i className="played"/>Played <i className="next"/>{chord?'Hover':'Next note'}</span><span className="guitar-stage-end">{offersWhole && <StageViewSwitch value={wholeGuitar ? 'whole' : 'learn'} onChange={chooseView} />}{turnable && (turned || resetFocused) && <ResetViewButton turned={turned} onReset={resetView} onFocusChange={setResetFocused} />}<span className="guitar-stage-hint">{hover||(wholeGuitar?'Drag to turn · Learn to play the frets':turnable?'Click between frets to play · drag to turn':'Click between frets to play · ○ open string')}</span></span></div>
  </div>;
}
