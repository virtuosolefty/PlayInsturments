import { useEffect, useRef, useState } from 'react';
import { buildBowedRig } from '../lib/bowedRig.js';
import { bowedLabels, placeText } from '../lib/bowedStageView.js';
import { dotLook } from '../lib/guitarStageView.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { collectResources, loadInstrumentModel } from '../lib/stage/models.js';
import { STAGE_TIERS } from '../lib/stage/quality.js';
import { runStage } from '../lib/stage/stageRunner.js';
import { createStudio, disposeResources } from '../lib/stage/studio.js';
import StageLabels from './StageLabels.jsx';
import StageViewSwitch from './StageViewSwitch.jsx';

const NO_POSITIONS = new Map();
const newOwned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });
/** A bowed string sustains: it shimmers for as long as the bow is on it, rather than dying away as a plucked one does. */
const SHIMMER = Object.freeze({ speed: 0.09, size: 0.006 });

/**
 * What the stage runner asks of the violin or cello (stageRunner.js):
 * restyle the markers, light and shimmer the sounding string, move the bow,
 * and lay out the labels. Looks are remembered per mesh, so a new rig starts
 * afresh.
 */
function bowedHooks(el, latest, pointed) {
  const shown = new WeakMap(), lit = new WeakMap(), calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let tally = '', labelled = '', showing = [];
  return {
    paint(rig, now) {
      const { engine, target, selection, activePositions, labelMode, labelSize } = latest.current;
      const active = engine.activeInputRef.current, positions = activePositions?.current ?? NO_POSITIONS;
      const counts = { held: 0, possible: 0, target: 0 }, markers = [];
      let changed = false;
      rig.dots.forEach(dot => {
        const place = dot.userData;
        const expected = target?.string === place.string && target?.fret === place.fret;
        const chosen = !!selection?.some(p => p.string === place.string && p.fret === place.fret);
        const pointedAt = pointed.place?.string === place.string && pointed.place?.fret === place.fret;
        const state = guitarFeedback(place, active, positions, expected, chosen, pointedAt);
        if (state in counts) counts[state]++;
        if (state !== 'idle') markers.push({ string: place.string, fret: place.fret, state, at: dot.position });
        const look = dotLook(state, { verdict: active.get(place.midi)?.type });
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
      const counted = `${counts.held}|${counts.possible}|${counts.target}`;
      if (counted !== tally) { tally = counted; Object.assign(el.dataset, { heldPositions: counts.held, possiblePositions: counts.possible, targetPositions: counts.target }); }
      let bowing = null;
      rig.strings.forEach((wire, s) => {
        const entry = positions.get(s), sounding = !!entry && active.has(entry.midi);
        if (sounding) bowing = s;
        if (sounding !== !!lit.get(wire)) {
          lit.set(wire, sounding);
          changed = true;
          wire.material.emissive.set(sounding ? '#3fbc98' : '#000000');
          wire.material.emissiveIntensity = sounding ? 0.35 : 0;
        }
        const y = wire.userData.restY + (sounding && !calm.matches ? Math.sin(now * SHIMMER.speed + s) * SHIMMER.size : 0);
        if (wire.position.y !== y) { wire.position.y = y; changed = true; }
      });
      if (rig.bow.play(bowing, { now, still: calm.matches })) changed = true;
      showing = markers;
      const wanted = `${markers.map(m => `${m.string}.${m.fret}.${m.state}`).join(' ')}|${labelMode}|${labelSize}`;
      const relabel = wanted !== labelled;
      labelled = wanted;
      return { changed, relabel };
    },
    labels(rig, { project, width, stringBand }) {
      const { kit, labelMode, labelSize } = latest.current;
      return bowedLabels({ project, width, kit, neck: rig.neck, maxFret: rig.maxFret, markers: showing, labelMode, fontSize: labelSize, stringBand });
    },
  };
}

/**
 * Press and hold a place to bow it, release to stop; drag along a string to
 * slide, or across to another string. A press on the background is left to
 * the turntable. `pointed.place` is the place under the pointer.
 */
function watchBowing(canvas, run, pointed, latest, { onHover, onLost }) {
  let pressed = null, pointer = null;
  const showCursor = place => { canvas.style.cursor = run.dragging ? 'grabbing' : place ? 'pointer' : run.turnable ? 'grab' : 'default'; };
  const start = place => {
    const { activePositions, onBow, onLift } = latest.current;
    // Trust `pressed` only while its voice really sounds: silencing (blur, play/pause) releases voices without telling the stage.
    const live = activePositions?.current.get(place.string);
    if (pressed && pressed.string === place.string && pressed.fret === place.fret && live?.fret === place.fret) return;
    if (pressed && pressed.string !== place.string) onLift(pressed.string);
    pressed = { string: place.string, fret: place.fret };
    onBow({ string: place.string, fret: place.fret });
  };
  const stop = () => { if (pressed) latest.current.onLift(pressed.string); pressed = null; pointer = null; };
  const ours = event => pointer !== null && event.pointerId === pointer;
  const handlers = {
    pointerdown: event => {
      if (run.dragging || event.button !== 0 || pointer !== null) return;
      const place = run.placeAt(event);
      if (!place) return;
      event.preventDefault();
      pointer = event.pointerId;
      // Capture keeps the bow going if the pointer slides off the stage; the browser refuses it for a pointer it no longer tracks.
      try { canvas.setPointerCapture?.(event.pointerId); } catch { /* bow without capture */ }
      start(place);
    },
    pointermove: event => {
      if (run.dragging) { showCursor(null); return; }
      if (pointer !== null && !ours(event)) return;
      const place = run.placeAt(event);
      pointed.place = place;
      onHover(place);
      showCursor(place);
      if (pressed && place) start(place);
    },
    pointerup: event => { if (ours(event)) stop(); showCursor(run.placeAt(event)); },
    pointercancel: event => { if (ours(event)) stop(); },
    lostpointercapture: event => { if (ours(event)) stop(); },
    pointerleave: () => { if (pointer === null) { pointed.place = null; onHover(null); } },
    webglcontextlost: event => { event.preventDefault(); stop(); onLost('The graphics context was lost'); },
  };
  for (const [type, handler] of Object.entries(handlers)) canvas.addEventListener(type, handler);
  return () => { stop(); for (const [type, handler] of Object.entries(handlers)) canvas.removeEventListener(type, handler); };
}

/**
 * Fetches the instrument and puts it on stage. Returns a function that
 * abandons the attempt; a model that arrives after that is disposed.
 */
function bringModel(run, { kit, maxFret, lacquered, onReady, onFailed }) {
  let abandoned = false;
  loadInstrumentModel(kit.id).then(model => {
    if (abandoned) { if (model) disposeResources(collectResources(model.scene)); return; }
    if (!model) { onFailed(`the ${kit.label.toLowerCase()} model could not be loaded`); return; }
    const owned = newOwned();
    try {
      run.swap({ ...buildBowedRig({ owned, kit, maxFret, model, lacquered }), owned, maxFret, model: kit.id });
      onReady();
    } catch (error) {
      disposeResources(owned);
      disposeResources(collectResources(model.scene));
      onFailed(error.message);
    }
  });
  return () => { abandoned = true; };
}

/**
 * The violin or cello in 3D: concepts V3 and C3 in lessons, V1 and C1 in free
 * play. The SVG fingerboard (BowedStage.jsx) stays the light tier and the
 * fallback: `onUnavailable` is called if the model or the graphics give out.
 */
export default function BowedStage3D({ kit, engine, maxFret, labelMode = 'fingers', labelSize = 14, target = null, selection = null, activePositions, onBow, onLift, theme = 'light', quality = 'auto', view = 'lesson', onUnavailable }) {
  const host = useRef(null);
  const latest = useRef(null);
  const controls = useRef(null);
  const [hover, setHover] = useState(null);
  const [labels, setLabels] = useState([]);
  const [turned, setTurned] = useState(false);
  const [turnable, setTurnable] = useState(false);
  const [resetFocused, setResetFocused] = useState(false);
  const [showcase, setShowcase] = useState(false);
  // Free play opens on Learn, the playable fingerboard map; Whole instrument shows all of it (the cello standing).
  const [stageView, setStageView] = useState('learn');
  const closeUp = stageView !== 'whole';
  const [ready, setReady] = useState(false);
  latest.current = { kit, engine, target, selection, activePositions, onBow, onLift, onUnavailable, labelMode, labelSize, view, closeUp, flip: 1 };
  const offersWhole = view === 'freePlay' && showcase;
  const whole = offersWhole && !closeUp;
  const name = kit.label.toLowerCase();
  const resetView = event => {
    if (event.detail > 0) event.currentTarget.blur();
    if (turned) controls.current?.resetView();
  };
  useEffect(() => {
    const el = host.current;
    let studio;
    try { studio = createStudio(el, { theme, quality }); }
    catch (error) { latest.current.onUnavailable(error.message); return undefined; }
    // The studio drops to light detail if its reflections cannot be built; the 2D fingerboard is the light violin and cello.
    if (studio.tier !== STAGE_TIERS.FULL) {
      studio.dispose();
      latest.current.onUnavailable('the 3D stage could only start at light detail');
      return undefined;
    }
    el.dataset.stageTier = studio.tier;
    setReady(false);
    const pointed = { place: null };
    const fail = why => latest.current.onUnavailable(why);
    const run = runStage(el, studio, { latest, maxFret, hooks: bowedHooks(el, latest, pointed), setLabels, setTurned, setTurnable, setShowcase, controls });
    const unwatch = watchBowing(studio.renderer.domElement, run, pointed, latest, { onHover: setHover, onLost: fail });
    const abandon = bringModel(run, { kit: latest.current.kit, maxFret, lacquered: true, onReady: () => setReady(true), onFailed: fail });
    return () => { abandon(); unwatch(); run.stop(); };
  }, [kit.id, theme, quality, maxFret]);
  // The bowing stretch by the bridge is in view only when the whole instrument is.
  const hint = hover ? placeText(kit, hover)
    : whole ? 'Drag to turn · hold by the bridge to bow an open string · Learn for the finger places'
    : `Press and hold to bow · drag along a string to slide${turnable ? ' · drag the background to turn' : ''}`;
  return <div className="guitar-stage bowed-stage-3d" ref={host} role="group" aria-label={`Three-dimensional ${name}`} data-view={view}>
    <div className="guitar-stage-top"><div><strong>{kit.label}</strong><span>{selection ? 'First position · press and hold to bow' : `Tuned in fifths · ${kit.tuning.map((_, s) => kit.stringName(s).note).join(' ')}`}</span></div></div>
    {/* The labels only echo what the 2D finger buttons below say in full, so assistive technology is spared them. */}
    <StageLabels labels={labels} labelSize={labelSize} decorative />
    {!ready && <div className="bowed-stage-preparing" role="status">Preparing your {name}…</div>}
    <div className="guitar-stage-bottom"><span className="guitar-stage-legend"><i className="played" />Played <i className="next" />{target ? 'Next note' : 'Hover'}{selection && <><i className="root" />Scale</>}</span><span className="guitar-stage-end">{offersWhole && <StageViewSwitch value={whole ? 'whole' : 'learn'} onChange={setStageView} />}{turnable && (turned || resetFocused) && <button type="button" className="guitar-reset-view" aria-disabled={!turned} onFocus={() => setResetFocused(true)} onBlur={() => setResetFocused(false)} onClick={resetView}>Reset view</button>}<span className="guitar-stage-hint" role="status">{hint}</span></span></div>
  </div>;
}
