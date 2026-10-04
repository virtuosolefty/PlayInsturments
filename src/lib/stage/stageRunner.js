import { Vector3 } from 'three';
import { createPacer } from './pacing.js';
import { barEdges, clearOfBars, stringBandOf } from './stageBars.js';
import { disposeResources } from './studio.js';
import { attachTurntable, canTurn, isTurned, NO_TURN } from './turntable.js';
import { stageView } from './views.js';

/**
 * stageRunner.js — runs a 3D string-instrument stage until it is stopped.
 *
 * The instrument is still most of the time, so a frame is drawn only when
 * something on it changed or the camera moved. While frames are drawn back to
 * back, the pacer times them and gives up resolution if they run slow.
 *
 * Lessons frame the neck straight across (concepts G3, V3, C3). Free play
 * shows a downloaded instrument whole (G1, V1, C1) and swings in to a close-up
 * of its neck for playing (`closeUp`); an instrument without a showcase has
 * only the close-up. Free play lets the player turn the instrument by
 * dragging the background, within limits that keep the neck between the
 * stage's bars; `controls.current.resetView` eases a turned view back.
 *
 * The rig on stage (guitarRig.js, guitarModelRig.js, bowedRig.js):
 *   instrument  the Object3D in the scene
 *   targets     meshes a pointer can pick; each one's userData is its place
 *   owned       the resources to dispose when the rig leaves the stage
 *   neck        span(maxFret) and corners(maxFret), in the instrument's own units
 *   showcase?   the whole-instrument shot for free play; with `upright`, the instrument stands up for it
 *   ground?     the box the floor and its shadow are fitted to
 *   orient?(u)  stands the instrument up by `u`, from 0 (lying) to 1 (upright)
 *   model?      the model's name, shown as the stage's data-stage-model
 *
 * Hooks, called with the rig on stage:
 *   paint(rig, now) → { changed, relabel }   restyles markers, strings and anything else that moves
 *   labels(rig, { project, width, edges, stringBand }) → the DOM labels over the stage
 *
 * `latest.current` is read every frame for `view` ('lesson' or 'freePlay'),
 * `closeUp` and `flip` (-1 to mirror the instrument for a left-handed player).
 */

/** Drawn every frame for this long after opening or a new rig, in case the first frames catch the stage mid-layout. */
const WARM_UP_MS = 400;
/** How long the camera takes to swing between the whole instrument and the close-up. */
const MOVE_MS = 650;
export const NO_LABELS = Object.freeze([]);
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export function runStage(el, studio, { latest, maxFret, hooks, setLabels, setTurned, setTurnable, setShowcase = () => {}, controls, rig: first = null, hold = 0 }) {
  let rig = null;
  // `aimed` is false while a new framing or turn waits to be applied: pointers report far more often than the screen draws.
  // `edges` are the stage bars' edges, measured when the stage changes size or view rather than on every frame.
  // `move` is the camera's swing between the whole instrument and the close-up while it is under way.
  let dirty = true, painted = false, turn = NO_TURN, aimed = true, edges = null, move = null;
  let holdUntil = hold || !first ? performance.now() + (hold || Infinity) : 0;
  const measure = () => { edges = barEdges(el); };
  const showcasing = () => latest.current.view === 'freePlay' && !!rig?.showcase && !latest.current.closeUp;
  const settledShot = () => (showcasing() ? rig.showcase : rig.neck.span(maxFret));
  const standing = () => (showcasing() && rig.showcase.upright ? 1 : 0);
  const progressOf = (m, now = performance.now()) => easeInOut(Math.min(1, (now - m.start) / MOVE_MS));
  const shot = () => (move ? { blend: { from: move.from, to: move.to, progress: progressOf(move) } } : settledShot());
  const framing = () => ({ flip: latest.current.flip ?? 1, view: stageView(latest.current.view), turn, bounds: clearOfBars(edges) });
  /**
   * Stands the instrument as the current shot wants it, part-way through a
   * swing if one is under way. The shadow is drawn only when asked (see
   * studio.js), so it is redrawn whenever the instrument's stance changes.
   */
  let stood = null;
  const orient = () => {
    if (!rig?.orient) return;
    const stance = move ? move.fromStanding + (move.toStanding - move.fromStanding) * progressOf(move) : standing();
    if (stance === stood) return;
    stood = stance;
    rig.orient(stance);
    studio.refreshShadow();
  };
  // The whole instrument is too small to label legibly, labels would trail behind a moving camera, and a held stage
  // shows nothing for them to label.
  const updateLabels = () => {
    if (!rig || showcasing() || move || holdUntil) { setLabels(NO_LABELS); return; }
    setLabels(hooks.labels(rig, { project: studio.projector(rig.instrument), width: el.clientWidth, edges, stringBand: stringBandOf(edges) }));
  };
  const resize = () => {
    if (!rig || !studio.frame(shot(), framing())) return;
    // Resizing clears the canvas; redraw now rather than show a blank frame.
    if (painted && !holdUntil) studio.render();
    dirty = true;
    updateLabels();
  };
  const aim = () => { if (rig && studio.aim(shot(), framing())) { dirty = true; updateLabels(); } };

  /**
   * Lays the floor and its shadow under the instrument as it stands, mirrored
   * with it for a left-handed player; an instrument with no ground of its own
   * gets the floor the studio was built with.
   */
  const fitFloor = () => {
    if (!rig?.ground) { studio.resetGround(); return; }
    const { min, max } = rig.ground;
    studio.fitGround(shownFlip < 0 ? { min: [-max[0], min[1], min[2]], max: [-min[0], max[1], max[2]] } : rig.ground);
  };

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let limits = null;
  const table = attachTurntable(studio.renderer.domElement, {
    limits: () => limits,
    canGrab: event => !rig || !studio.pick(event, rig.targets),
    onTurn: next => { turn = next; aimed = false; setTurned(isTurned(next)); },
    reducedMotion: () => calm.matches,
  });
  // How far free play may turn on this stage: as far as keeps the playable
  // surface between the top and bottom bars, which on a short neck is less,
  // and on a stage too cramped to turn in at all, nothing.
  const fitTurning = () => {
    if (!rig) return;
    rig.instrument.updateMatrixWorld(true);
    const keep = rig.neck.corners(maxFret).map(point => new Vector3(...point).applyMatrix4(rig.instrument.matrixWorld).toArray());
    const fitted = studio.turnLimits(shot(), { ...framing(), keep });
    limits = canTurn(fitted) ? fitted : null;
    setTurnable(limits !== null);
    table.refit();
  };
  controls.current = { resetView: () => table.reset() };
  setTurned(false);
  // The bars are watched as well as the stage: a button appearing in one changes the room the instrument has.
  const observer = new ResizeObserver(() => { measure(); resize(); fitTurning(); });
  for (const watched of [el, el.querySelector('.guitar-stage-top'), el.querySelector('.guitar-stage-bottom')]) if (watched) observer.observe(watched);
  const wake = () => { dirty = true; };
  document.addEventListener('visibilitychange', wake);

  const pacer = createPacer({ ratio: studio.pixelRatio });
  let warmUntil = performance.now() + WARM_UP_MS + (hold || 0);
  let frame, shownView = latest.current.view, shownShowcase = false, shownFlip = latest.current.flip ?? 1, drewLast = false, lastStamp = 0;
  // Swings from wherever the camera is now, turned or part-way through another swing, to the shot the stage wants.
  const swing = now => {
    const was = shownShowcase && rig.showcase.upright ? 1 : 0;
    const here = studio.currentPose();
    const from = here ? { pose: here } : (shownShowcase ? rig.showcase : rig.neck.span(maxFret));
    const fromStanding = move ? move.fromStanding + (move.toStanding - move.fromStanding) * progressOf(move, now) : was;
    table.clear();
    move = calm.matches ? null : { from, to: settledShot(), start: now, fromStanding, toStanding: standing() };
    orient();
    // Without a swing the view arrives at once, so the limits for it apply at once too.
    if (!move) fitTurning();
    updateLabels();
    aimed = false;
  };
  const draw = stamp => {
    frame = requestAnimationFrame(draw);
    if (!rig) return;
    const { view } = latest.current, flip = latest.current.flip ?? 1, now = performance.now();
    // Lessons and free play look through different lenses, and only free play keeps a turn.
    // The top bar gains or loses its title with the view, so the bars are measured again.
    if (view !== shownView) { shownView = view; shownShowcase = showcasing(); move = null; orient(); table.clear(); measure(); fitTurning(); updateLabels(); aimed = false; }
    if (showcasing() !== shownShowcase) { swing(now); shownShowcase = showcasing(); }
    if (move) {
      aimed = false;
      orient();
      if (now - move.start >= MOVE_MS) { move = null; orient(); fitTurning(); updateLabels(); }
    }
    if (flip !== shownFlip) { shownFlip = flip; rig.instrument.scale.x = flip; fitFloor(); resize(); fitTurning(); }
    if (!aimed) { aimed = true; aim(); }
    const painting = hooks.paint(rig, now);
    painted = true;
    if (painting.relabel && !move) updateLabels();
    dirty ||= painting.changed;
    if (holdUntil && now >= holdUntil) { holdUntil = 0; updateLabels(); }
    if ((dirty || now < warmUntil) && !document.hidden && !holdUntil) {
      studio.render();
      const ratio = drewLast && now >= warmUntil ? pacer.sample(stamp - lastStamp) : null;
      if (ratio !== null) studio.setPixelRatio(ratio);
      dirty = ratio !== null; // a new resolution needs one more frame
      drewLast = true; lastStamp = stamp;
    } else if (drewLast) { drewLast = false; pacer.pause(); }
  };

  /** Ends a hold early: the stage shows what it has. */
  const release = () => {
    if (!holdUntil) return;
    holdUntil = 0;
    warmUntil = performance.now() + WARM_UP_MS;
    dirty = true;
    updateLabels();
  };
  // Rigs kept off stage by `show`, to be shown again later and handed back when the stage stops.
  const kept = new Set();
  /**
   * Puts `next` on stage in place of the rig there now, and ends any hold:
   * the instrument the hold was waiting for has come. The rig it replaces is
   * disposed, unless `keep` is set: then it stays ready to be shown again.
   * The first rig a stage opens with goes on stage without ending its hold.
   */
  const swap = (next, { first: opening = false, keep = false } = {}) => {
    if (rig && rig !== next) {
      studio.scene.remove(rig.instrument);
      if (keep) kept.add(rig); else disposeResources(rig.owned);
    }
    kept.delete(next);
    rig = next;
    stood = null;
    rig.instrument.scale.x = shownFlip;
    studio.scene.add(rig.instrument);
    fitFloor();
    el.dataset.stageModel = rig.model ?? 'drawn';
    setShowcase(!!rig.showcase);
    // The new instrument is framed differently, and its labels sit elsewhere.
    move = null;
    shownView = latest.current.view;
    shownShowcase = showcasing();
    orient();
    table.clear();
    measure(); resize(); fitTurning();
    if (!opening) release();
  };
  if (first) swap(first, { first: true }); else measure();
  frame = requestAnimationFrame(draw);
  return {
    swap: next => swap(next),
    /** Puts `next` on stage and keeps the rig there now for later, as when a stage switches between two instruments. */
    show: next => swap(next, { keep: true }),
    /** Gets `next` ready to draw before it is first shown, so that frame does not stall (see studio.js `prepare`). */
    prepare: next => studio.prepare(next.instrument),
    release,
    /** The place under a pointer event, or null. */
    placeAt: event => (rig ? studio.pick(event, rig.targets)?.userData ?? null : null),
    get dragging() { return table.dragging; },
    get turnable() { return limits !== null; },
    get rig() { return rig; },
    /** Asks for the labels to be worked out again, e.g. after the text size changed. */
    relabel: () => { if (!move) updateLabels(); },
    stop() {
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      table.stop();
      controls.current = null;
      for (const each of new Set([rig, ...kept])) if (each) disposeResources(each.owned);
      kept.clear();
      studio.dispose();
    },
  };
}
