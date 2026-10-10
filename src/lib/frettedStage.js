import { chordTone } from './guitarPresentation.js';
import { dotLook, hoverText, stageLabels } from './guitarStageView.js';
import { guitarFeedback } from './instrumentView.js';

/**
 * frettedStage.js — what a 3D stage does for any fretted instrument on it:
 * paint the markers and the strings each frame, lay out the labels, and turn
 * the pointer into plucks. GuitarStage.jsx (the guitar, drawn and downloaded)
 * and FrettedModelStage.jsx (the bass on its model) both run on these.
 *
 * `latest.current` is read every frame. Besides what the stage runner wants
 * (stageRunner.js) it carries `engine`, `score`, `chord`, `labelMode`,
 * `labelSize`, `focusPosition`, `activePositions`, `leftHanded`, and for an
 * instrument other than the guitar its `tuning` and `midiAt`.
 */

const NO_POSITIONS = new Map();
/** After this long a plucked string's swing is too small to see, so the stage stops redrawing for it. */
const SWING_MS = 2500;

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
function paintDots(rig, shown, { active, positions, next, chord, hovered, focused, midiAt }) {
  const counts = { held: 0, possible: 0, target: 0 };
  let changed = false;
  rig.dots.forEach(dot => {
    const place = dot.userData;
    const pointed = place === hovered || (focused?.string === place.string && focused?.fret === place.fret);
    const state = guitarFeedback(place, active, positions, !chord && next?.string === place.string && next?.fret === place.fret, chord?.frets[place.string] === place.fret, pointed);
    if (state in counts) counts[state]++;
    const look = dotLook(state, { verdict: active.get(place.midi)?.type, root: !!chordTone(chord, place.string, midiAt)?.root });
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
 * @returns {{ changed: boolean, sounding: number }} whether anything moved or changed, so the stage needs drawing again, and how many strings are sounding
 */
function paintStrings(rig, lit, { active, positions, still, now }) {
  let changed = false, count = 0;
  rig.strings.forEach((wire, s) => {
    const entry = positions.get(s), sounding = !!entry && active.has(entry.midi);
    if (sounding) count += 1;
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
  return { changed, sounding: count };
}

/**
 * What the stage runner asks of a fretted instrument (stageRunner.js): restyle
 * the markers and strings each frame, and lay out the labels. Marker states
 * and strings are remembered per mesh, so a new rig starts afresh.
 */
export function frettedHooks(el, latest, hover) {
  const shown = new WeakMap(), lit = new WeakMap(), calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let tally = '', labelled = null, ringing = -1;
  return {
    paint(rig, now) {
      const { engine, score, chord, labelMode, labelSize, focusPosition, activePositions, midiAt } = latest.current;
      const active = engine.activeInputRef.current, positions = activePositions?.current ?? NO_POSITIONS;
      const dots = paintDots(rig, shown, { active, positions, next: nextNote(engine, score), chord, hovered: hover.place, focused: focusPosition, midiAt });
      const counted = `${dots.counts.held}|${dots.counts.possible}|${dots.counts.target}`;
      if (counted !== tally) { tally = counted; Object.assign(el.dataset, { heldPositions: dots.counts.held, possiblePositions: dots.counts.possible, targetPositions: dots.counts.target }); }
      const strings = paintStrings(rig, lit, { active, positions, still: calm.matches, now });
      // How many of the strings on stage are sounding: a bass has four to answer the guitar's six.
      if (strings.sounding !== ringing) { ringing = strings.sounding; el.dataset.soundingStrings = ringing; }
      const wanted = [chord, labelMode, labelSize];
      const relabel = !labelled || wanted.some((value, i) => value !== labelled[i]);
      if (relabel) labelled = wanted;
      return { changed: dots.changed || strings.changed, relabel };
    },
    labels(rig, { project, width, stringBand }) {
      const { chord, labelMode, leftHanded, labelSize, tuning, midiAt } = latest.current;
      return stageLabels({ project, width, maxFret: rig.maxFret, chord, labelMode, leftHanded, fontSize: labelSize, stringBand, neck: rig.neck, tuning, midiAt });
    },
  };
}

/**
 * Hover, pluck and context-loss handling on the stage canvas. `hover.place` is the place under the pointer.
 * While the view is being turned, hovering is ignored; where it can be turned, the background shows a grab cursor.
 * `strings` is how many the instrument on stage has, for the hover hint; the guitar's six unless given.
 */
export function watchPointer(canvas, run, hover, { onHover, onPluck, onLost, strings }) {
  const showCursor = place => { canvas.style.cursor = run.dragging ? 'grabbing' : place ? 'pointer' : run.turnable ? 'grab' : 'default'; };
  // The turntable's listeners were added first, so by the time these run it already knows whether a drag began or ended.
  const handlers = {
    pointermove: event => {
      if (run.dragging) { showCursor(null); return; }
      hover.place = run.placeAt(event);
      showCursor(hover.place);
      onHover(hoverText(hover.place, strings));
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
