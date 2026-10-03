import { screenPoint } from './framing.js';

/**
 * turntable.js — turning an instrument on stage by dragging it, within limits.
 *
 * The camera orbits the point it looks at: a sideways drag swings it around
 * the instrument (yaw), an up-and-down drag raises or lowers it (pitch). The
 * limits are fitted to the stage so the playing surface stays in view (see
 * `fitLimits`), and a double-click eases back to where the view started. The
 * maths is pure, so it can be tested without a canvas; `attachTurntable` wires
 * it to pointer events on the stage.
 */

export const NO_TURN = Object.freeze({ yaw: 0, pitch: 0 });
/** How far a pixel of drag turns the camera. 200 px is a little under 60°. */
const RADIANS_PER_PIXEL = 0.005;
/** A press has to travel this far before it turns anything, so a slightly shaky click stays a click. */
const DRAG_START_PX = 4;
/** The camera stays between these elevations, so it never looks up from under the floor or straight down. */
const ELEVATION = Object.freeze({ min: (5 * Math.PI) / 180, max: (85 * Math.PI) / 180 });
const RESET_MS = 420;
/**
 * Where kept points may go on screen, in the -1 to 1 units of `screenPoint`:
 * anywhere across, and clear of typical top and bottom bars. The framing
 * already puts the near corners of a short neck at about 0.96 across, so the
 * side limit is the edge itself. Stages that know their bars pass their own.
 */
const ON_SCREEN = Object.freeze({ x: 1, top: 0.84, bottom: -0.8 });
const FIT_STEPS = 14;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Whether `turn` leaves the view anywhere but where it started. */
export const isTurned = ({ yaw, pitch }) => yaw !== 0 || pitch !== 0;

/** Whether `limits` leave any room to turn at all; `fitLimits` shrinks them to nothing on a stage too cramped to turn in. */
export const canTurn = limits => !!limits && (limits.yaw[0] < limits.yaw[1] || limits.pitch[0] < limits.pitch[1]);

/**
 * Where the camera stands once `turn` is applied to `pose`.
 *
 * @param {{ position: number[], target: number[] }} pose where the view puts the camera, and what it looks at
 * @param {{ yaw: number, pitch: number }} turn radians around the vertical axis, and up or down
 * @returns {{ position: [number, number, number], target: number[] }} a new pose at the same distance from the target
 */
export function orbit({ position, target }, { yaw, pitch }) {
  const [x, y, z] = position.map((value, i) => value - target[i]);
  const radius = Math.hypot(x, y, z);
  const elevation = clamp(Math.atan2(y, Math.hypot(x, z)) + pitch, ELEVATION.min, ELEVATION.max);
  const azimuth = Math.atan2(x, z) + yaw;
  const across = radius * Math.cos(elevation);
  return {
    position: [target[0] + across * Math.sin(azimuth), target[1] + radius * Math.sin(elevation), target[2] + across * Math.cos(azimuth)],
    target,
  };
}

/** Where `pose`'s camera stands around its target: distance, angle round from the front (+z), and angle up. */
function polar({ position, target }) {
  const [x, y, z] = position.map((value, i) => value - target[i]);
  const radius = Math.hypot(x, y, z);
  return { radius, azimuth: Math.atan2(x, z), elevation: Math.asin(clamp(y / radius, -1, 1)) };
}

/**
 * Part of the way from one camera pose to another; `progress` runs 0 to 1.
 *
 * The camera swings around what it looks at, the short way round, while that
 * point slides from one target to the other, and its distance changes by the
 * same ratio each step. Moving it in a straight line instead could carry it
 * through the instrument.
 *
 * @param {{ position: number[], target: number[] }} from
 * @param {{ position: number[], target: number[] }} to
 * @param {number} progress
 * @returns {{ distance: number, position: number[], target: number[] }}
 */
export function blendPoses(from, to, progress) {
  const k = clamp(progress, 0, 1);
  if (k === 0 || k === 1) {
    const pose = k === 0 ? from : to;
    return { distance: polar(pose).radius, position: [...pose.position], target: [...pose.target] };
  }
  const a = polar(from), b = polar(to);
  const swing = ((((b.azimuth - a.azimuth + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  const azimuth = a.azimuth + swing * k, elevation = a.elevation + (b.elevation - a.elevation) * k;
  const radius = a.radius * (b.radius / a.radius) ** k;
  const target = from.target.map((value, i) => value + (to.target[i] - value) * k);
  const across = radius * Math.cos(elevation);
  return {
    distance: radius,
    position: [target[0] + across * Math.sin(azimuth), target[1] + radius * Math.sin(elevation), target[2] + across * Math.cos(azimuth)],
    target,
  };
}

/**
 * The turn after the pointer moved by `dx`, `dy` pixels, held within `limits`.
 *
 * The instrument follows the pointer: dragging right swings the camera left,
 * and dragging down raises it, tipping the playing surface toward the player.
 *
 * @param {{ yaw: number, pitch: number }} turn
 * @param {{ dx: number, dy: number }} moved
 * @param {{ yaw: [number, number], pitch: [number, number] }} limits radians either side of the starting view
 */
export function dragTurn(turn, { dx, dy }, limits, speed = RADIANS_PER_PIXEL) {
  return Object.freeze({
    yaw: clamp(turn.yaw - dx * speed, ...limits.yaw),
    pitch: clamp(turn.pitch + dy * speed, ...limits.pitch),
  });
}

/** Part of the way from `from` back to no turn; `progress` runs 0 to 1, and the motion slows as it arrives. */
export function easeTurn(from, progress) {
  const left = (1 - clamp(progress, 0, 1)) ** 3;
  return left === 0 ? NO_TURN : Object.freeze({ yaw: from.yaw * left, pitch: from.pitch * left });
}

/**
 * `limits`, shrunk evenly just enough that turning to any of them keeps every
 * point of `keep` on screen. A short stretch of neck is framed from close by,
 * so the same angles swing its ends much further than a long one's.
 *
 * Turning moves points further out the further it goes, so the largest share
 * that fits is found by halving the interval between one that fits and one
 * that does not.
 *
 * @param {{ pose: { position: number[], target: number[] }, fovDeg: number, aspect: number }} view the unturned camera
 * @param {number[][]} keep points, in scene units, that must stay in view
 * @param {{ yaw: [number, number], pitch: [number, number] }} limits the most the view may ever turn
 * @param {{ x: number, top: number, bottom: number }} [bounds] where on screen kept points may go
 * @returns {{ yaw: [number, number], pitch: [number, number] }} `limits` itself when it fits; otherwise smaller limits,
 *   all zero when even the unturned view cannot show `keep`
 */
export function fitLimits({ pose, fovDeg, aspect }, keep, limits, bounds = ON_SCREEN) {
  const shows = turn => {
    const camera = orbit(pose, turn);
    return keep.every(point => {
      const p = screenPoint(point, camera, { fovDeg, aspect });
      return p.depth > 0 && Math.abs(p.x) <= bounds.x && p.y <= bounds.top && p.y >= bounds.bottom;
    });
  };
  const fits = share => [limits.yaw[0] * share, 0, limits.yaw[1] * share].every(yaw =>
    [limits.pitch[0] * share, 0, limits.pitch[1] * share].every(pitch => shows({ yaw, pitch })));
  if (fits(1)) return limits;
  let low = 0, high = 1;
  for (let step = 0; step < FIT_STEPS; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle; else high = middle;
  }
  const scale = range => Object.freeze(range.map(v => v * low));
  return Object.freeze({ yaw: scale(limits.yaw), pitch: scale(limits.pitch) });
}

/**
 * Lets the player turn the view by dragging on `element`.
 *
 * Only a drag that starts where `canGrab` allows turns the view, so a press on
 * a fret still plays it. Pointer capture keeps the drag going if the pointer
 * leaves the stage; a second pointer cannot take over a drag in progress.
 *
 * @param {HTMLElement} element
 * @param {object} options
 * @param {{ yaw: [number, number], pitch: [number, number] } | (() => object|null)} options.limits or a function returning
 *   the limits that apply now; while it returns null the view cannot be turned
 * @param {(event: PointerEvent) => boolean} options.canGrab whether a press here may start a turn
 * @param {(turn: { yaw: number, pitch: number }) => void} options.onTurn called whenever the turn changes
 * @param {() => boolean} options.reducedMotion when true, a reset jumps instead of easing
 * @param {(step: () => void) => void} [options.schedule] next-frame scheduler, for tests
 * @param {() => number} [options.now] clock in milliseconds, for tests
 */
export function attachTurntable(element, { limits, canGrab, onTurn, reducedMotion, schedule = requestAnimationFrame, now = () => performance.now() }) {
  let turn = NO_TURN, drag = null, easing = 0;
  const limitsNow = typeof limits === 'function' ? limits : () => limits;
  const set = next => { turn = next; onTurn(turn); };
  const settle = () => { easing++; };
  const release = event => { if (drag?.id === event.pointerId) drag = null; };

  const handlers = {
    pointerdown: event => {
      if (drag || event.button !== 0 || !limitsNow() || !canGrab(event)) return;
      settle();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
      // Capture only keeps a drag going outside the stage. The browser refuses it for a pointer it no
      // longer tracks (a synthetic event, or one released already); the drag works without it.
      try { element.setPointerCapture?.(event.pointerId); } catch { /* not capturable; carry on uncaptured */ }
    },
    pointermove: event => {
      const bounds = limitsNow();
      if (drag?.id !== event.pointerId || !bounds) return;
      const moved = { dx: event.clientX - drag.x, dy: event.clientY - drag.y };
      if (!drag.moving && Math.hypot(moved.dx, moved.dy) < DRAG_START_PX) return;
      drag = { ...drag, x: event.clientX, y: event.clientY, moving: true };
      set(dragTurn(turn, moved, bounds));
    },
    pointerup: release,
    pointercancel: release,
    // The browser can take the capture away without an up or cancel, e.g. when another element captures the pointer.
    lostpointercapture: release,
    dblclick: event => { if (canGrab(event)) reset(); },
  };

  function reset() {
    settle();
    if (!isTurned(turn)) return;
    if (reducedMotion()) { set(NO_TURN); return; }
    const run = easing, from = turn, start = now();
    const step = () => {
      if (run !== easing) return; // a newer drag or reset took over
      set(easeTurn(from, (now() - start) / RESET_MS));
      if (isTurned(turn)) schedule(step);
    };
    schedule(step);
  }

  for (const [type, handler] of Object.entries(handlers)) element.addEventListener(type, handler);
  return {
    get turn() { return turn; },
    get dragging() { return drag !== null; },
    reset,
    /** Back to the starting view at once, ending any drag or ease; for when the view itself changes. */
    clear() {
      settle();
      drag = null;
      if (isTurned(turn)) set(NO_TURN);
    },
    /** Brings the turn back inside the limits that apply now, e.g. after the stage changed shape. */
    refit() {
      const bounds = limitsNow();
      if (!bounds) { this.clear(); return; }
      const held = dragTurn(turn, { dx: 0, dy: 0 }, bounds);
      if (held.yaw !== turn.yaw || held.pitch !== turn.pitch) set(isTurned(held) ? held : NO_TURN);
    },
    stop() {
      settle();
      drag = null;
      for (const [type, handler] of Object.entries(handlers)) element.removeEventListener(type, handler);
    },
  };
}
