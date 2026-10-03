/**
 * framing.js — where the stage camera stands to show a stretch of an instrument.
 *
 * Instruments lie along the x axis with their playing surface facing up. The
 * camera looks down at the middle of the stretch from above and in front, and
 * backs away until the whole stretch fits the width of the stage.
 */

const DEFAULT_FOV = 32;
const radians = degrees => (degrees * Math.PI) / 180;

/** Half the width visible at `distance` from a camera with a vertical field of view of `fovDeg`. */
export function visibleHalfWidth({ distance, aspect, fovDeg = DEFAULT_FOV }) {
  return distance * Math.tan(radians(fovDeg / 2)) * aspect;
}

/**
 * @param {object} span
 * @param {number} span.left  x of the left end of what must be visible
 * @param {number} span.right x of the right end
 * @param {number} span.aspect stage width / height
 * @param {number} [span.fovDeg] vertical field of view
 * @param {number} [span.margin] breathing room, as a multiple of the tight fit
 * @param {number} [span.minDistance] closest the camera may come, so a short span is not magnified
 * @param {[number, number]} [span.elevation] camera height and depth, as fractions of the distance
 * @param {1 | -1} [span.flip] -1 when the instrument is mirrored for a left-handed player
 * @returns {{ distance: number, center: number, position: [number, number, number], target: [number, number, number] }}
 */
export function frameSpan({ left, right, aspect, fovDeg = DEFAULT_FOV, margin = 1.06, minDistance = 6.1, elevation = [0.89, 0.46], flip = 1 }) {
  if (!(right > left)) throw new Error(`Cannot frame an empty span (${left} to ${right})`);
  if (!(aspect > 0)) throw new Error(`Cannot frame a stage with aspect ${aspect}`);
  const tight = (right - left) / 2 / visibleHalfWidth({ distance: 1, aspect, fovDeg });
  const distance = Math.max(minDistance, tight * margin);
  const center = ((left + right) / 2) * flip;
  return { distance, center, position: [center, distance * elevation[0], distance * elevation[1]], target: [center, 0, 0] };
}

const minus = (a, b) => a.map((v, i) => v - b[i]);
const plus = (a, b) => a.map((v, i) => v + b[i]);
const times = (v, s) => v.map(c => c * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = v => { const length = Math.hypot(...v); return v.map(c => c / length); };

/** The whole screen, in the -1 to 1 units of `screenPoint`. */
const FULL_SCREEN = Object.freeze({ x: 1, top: 1, bottom: -1 });
const FIT_STEPS = 48;
const CENTRING_PASSES = 4;
/** Backing away doubles the distance each time; this many doublings is far past any stage, so a fit that has not come by then never will. */
const MAX_DOUBLINGS = 60;

/**
 * Whether backing away can ever fit a picture inside `bounds`: shown points
 * close in on the middle of the screen as the camera recedes, so the band
 * must hold the middle with room to spare.
 */
const holdsMiddle = (bounds, margin) => bounds.x > 0 && (bounds.top - bounds.bottom) / 2 / margin > Math.abs((bounds.top + bounds.bottom) / 2);

/** A function from points to where they land on a camera at `pose`, as `screenPoint` says; the camera's axes are worked out once. */
function projector({ position, target }, { fovDeg = DEFAULT_FOV, aspect }) {
  const forward = unit(minus(target, position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const half = Math.tan(radians(fovDeg / 2));
  return point => {
    const offset = minus(point, position), depth = dot(offset, forward);
    return { x: dot(offset, right) / (depth * half * aspect), y: dot(offset, up) / (depth * half), depth };
  };
}

/**
 * Where the camera stands to show all of `box` from one direction, as a
 * product photo does: `azimuthDeg` around the vertical axis from straight in
 * front (+z), turning toward +x, and `elevationDeg` up from the floor.
 *
 * The camera backs away until every corner is inside `bounds` with `margin` to
 * spare, and is then moved sideways until what it shows is centred there.
 * Aiming at the middle of the box would not do: its near end looks larger
 * than its far end, so the picture would sit off to one side.
 *
 * @param {object} shot
 * @param {number[]} shot.min one corner of the box, in scene units
 * @param {number[]} shot.max the opposite corner
 * @param {number} shot.aspect stage width / height
 * @param {number} [shot.fovDeg] vertical field of view
 * @param {number} [shot.azimuthDeg]
 * @param {number} [shot.elevationDeg]
 * @param {number} [shot.margin] breathing room, as a multiple of the tight fit
 * @param {1 | -1} [shot.flip] -1 when the instrument is mirrored for a left-handed player; the shot is mirrored with it
 * @param {{ x: number, top: number, bottom: number }} [shot.bounds] where on screen the box must fit, e.g. between the stage's bars;
 *   the whole screen when the bars leave no band around its middle
 * @param {number[][]} [shot.keep] the points that must be on screen, when tighter than the box's corners: a guitar's
 *   neck is far narrower than its body, so the box's corners beside the headstock are empty air
 * @returns {{ distance: number, position: number[], target: number[] }}
 */
export function frameBox({ min, max, aspect, fovDeg = DEFAULT_FOV, azimuthDeg = 0, elevationDeg = 30, margin = 1.06, flip = 1, bounds = FULL_SCREEN, keep = null }) {
  const valid = [0, 1, 2].every(k => Number.isFinite(min[k]) && Number.isFinite(max[k]) && max[k] >= min[k]);
  if (!valid || [0, 1, 2].every(k => max[k] === min[k])) throw new Error(`Cannot frame an empty box (${min} to ${max})`);
  if (!(aspect > 0)) throw new Error(`Cannot frame a stage with aspect ${aspect}`);
  const band = holdsMiddle(bounds, margin) ? bounds : FULL_SCREEN;
  const xs = flip < 0 ? [-max[0], -min[0]] : [min[0], max[0]];
  const mirror = point => (flip < 0 ? [-point[0], point[1], point[2]] : point);
  const points = keep?.length ? keep.map(mirror) : xs.flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => [x, y, z])));
  const azimuth = radians(azimuthDeg) * Math.sign(flip || 1), elevation = radians(elevationDeg);
  const away = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
  const lens = { fovDeg, aspect };
  const middle = { x: 0, y: (band.top + band.bottom) / 2 };
  const reach = { x: band.x / margin, y: (band.top - band.bottom) / 2 / margin };
  const poseAt = (target, distance) => ({ position: plus(target, times(away, distance)), target });
  const project = pose => points.map(projector(pose, lens));
  const fits = pose => project(pose).every(p => p.depth > 0 && Math.abs(p.x - middle.x) <= reach.x && Math.abs(p.y - middle.y) <= reach.y);
  const size = Math.hypot(...minus(max, min));
  // Shown corners only move toward the middle as the camera backs away, so the closest distance that fits can be halved toward.
  const fitDistance = target => {
    let near = 0, far = size;
    for (let doubling = 0; !fits(poseAt(target, far)) && doubling < MAX_DOUBLINGS; doubling++) { near = far; far *= 2; }
    for (let step = 0; step < FIT_STEPS; step++) {
      const distance = (near + far) / 2;
      if (fits(poseAt(target, distance))) far = distance; else near = distance;
    }
    return far;
  };
  let target = [(xs[0] + xs[1]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], distance = fitDistance(target);
  for (let pass = 0; pass < CENTRING_PASSES; pass++) {
    const shown = project(poseAt(target, distance));
    const off = axis => (Math.min(...shown.map(p => p[axis])) + Math.max(...shown.map(p => p[axis]))) / 2 - middle[axis];
    // Slide the camera and its target together, by as far as the picture is off centre at the target's distance.
    const right = unit(cross(times(away, -1), [0, 1, 0])), up = cross(right, times(away, -1));
    const half = Math.tan(radians(fovDeg / 2)) * distance;
    target = plus(target, plus(times(right, off('x') * half * aspect), times(up, off('y') * half)));
    distance = fitDistance(target);
  }
  return { distance, ...poseAt(target, distance) };
}

/**
 * Where `point` lands on a camera at `pose` looking at its target with y up, as
 * Three's camera.lookAt sets it up. `x` and `y` run from -1 to 1 across the
 * visible width and height, y upward; `depth` is the distance in front of the
 * camera, and is zero or less for a point the camera cannot see at all.
 *
 * @param {number[]} point
 * @param {{ position: number[], target: number[] }} pose
 * @param {{ fovDeg?: number, aspect: number }} lens vertical field of view, and stage width / height
 */
export function screenPoint(point, pose, lens) {
  return projector(pose, lens)(point);
}
