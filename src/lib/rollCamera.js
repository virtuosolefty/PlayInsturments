/**
 * rollCamera.js — where the camera stands for the Stage view.
 *
 * Pure arithmetic, in the same spirit as rollGeometry.js and for the same
 * reason: a camera cannot be unit tested through a GPU, and the one thing this
 * camera must never get wrong is which end of the roll is nearest to you.
 *
 * It got that wrong. The first version put the camera above the *top* of the
 * roll and tilted it downwards, which left the keyboard at the far end: lanes
 * fanned outwards as they climbed, the keys shrank into the distance, and notes
 * fell away from the player instead of towards them. Every other part of the
 * scene was correct, which is exactly why it took so long to see. That mistake
 * is now a number a test can look at — see `projectOnto` and the first case in
 * rollCamera.test.js.
 *
 * ── The frame it solves for ───────────────────────────────────────────────
 *
 * The roll is a flat table `width` across and `length` deep lying in the z = 0
 * plane, y running away from the player, keyboard at y = length. The camera
 * stands in front of the keyboard, `pitch` radians above the table, looking
 * back along it. Three things have to be true at once:
 *
 *   · the near edge — the front of the keys — sits just inside the bottom of
 *     the frame, so there is no dead band underneath the instrument;
 *   · the far edge is inside the top of the frame;
 *   · the full width fits across the frame where the table is widest, which
 *     under this camera is always the near edge.
 *
 * Each is linear in distance, so each gives a minimum distance outright; take
 * the largest and all three hold. No iteration — an earlier attempt nudged the
 * camera towards a target in a loop and diverged, because every nudge moved the
 * thing it was measuring itself against.
 *
 * ── Why the pitch is searched for and not chosen ──────────────────────────
 *
 * The two fits pull against each other. A shallow camera has more vanishing
 * point but must stand further back to get the width in, and standing back
 * costs the height of the picture: the table shrinks into the middle of the
 * frame with dead space above and below it. A steep one fills the frame and
 * looks like a diagram.
 *
 * Which of the two wins depends on the shape of the table, and that changes
 * with the piece — two octaves is a nearly square table, the full keyboard is a
 * long thin one. So the pitch is bisected for rather than picked: the
 * shallowest angle at which the width still fits without pushing the camera
 * back, which is the most depth this frame will hold. The clamp keeps it from
 * running off into either a corridor or a plan view.
 */

/** Vertical field of view, in degrees. Horizontal follows from the aspect. */
export const FOV = 44;

// The performance view looks down at solid key faces at 63 degrees. A nearly
// overhead camera hid their front edges even though the geometry had depth.
export const PIANO_CAMERA = Object.freeze({ standing: 18, fov: 24, pitchMin: 1.03, pitchMax: 1.10 });

/**
 * How far the camera may tilt above the table, in radians.
 *
 * 47° is about as low as this can go before the far end of the roll compresses
 * into unreadability; 74° is about as high as it can go while still having a
 * vanishing point worth the name.
 */
export const PITCH_MIN = 0.82;
export const PITCH_MAX = 1.3;

/** How far up and down the frame the two ends of the table may reach. */
const FAR_EDGE = 0.92;
const NEAR_EDGE = 0.98;

const halfFrame = (fov) => Math.tan((fov * Math.PI) / 360);

/**
 * Distance at which both ends of the table land exactly on their margins.
 *
 * With the camera `dist` from a focus point on the table, a point `along` units
 * beyond the focus sits at height `−along·sin(pitch)` and depth
 * `dist − along·cos(pitch)`, so pinning its frame position to ±margin is linear
 * in `dist`. Solving both ends together fixes the distance and, with it, how
 * much of the table's length falls in front of the focus point.
 *
 * @returns {{dist: number, nearShare: number}} `nearShare` is that near length
 *   as a fraction of `dist`, which is what the width fit needs to know.
 */
function lengthwise(pitch, length, t) {
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  // Guarded because the far term inverts at tan(pitch) = FAR_EDGE·t, below
  // which no distance gets the far end into frame. PITCH_MIN is well clear of
  // it at the field of view above; the floor keeps a wilder one finite.
  const farRoom = Math.max(1e-3, sin - FAR_EDGE * t * cos);
  const far = (FAR_EDGE * t) / farRoom;
  const near = (NEAR_EDGE * t) / (sin + NEAR_EDGE * t * cos);
  return { dist: length / (far + near), nearShare: near };
}

/**
 * Distance at which the table's width fits across the frame.
 *
 * Measured at the near edge, which is the closest part of the table and so the
 * widest on screen, less whatever stands up off it there — a key is a solid
 * object and its front face is nearer than the surface it sits on.
 */
function crosswise(pitch, width, standing, nearShare, across) {
  const room = 1 - nearShare * Math.cos(pitch);
  const need = width / (2 * across) + standing * Math.sin(pitch);
  return room > 1e-3 ? need / room : need * 1e3;
}

/**
 * Place the camera for a table of this shape in a frame of this shape.
 *
 * @param {number} width across the keys, in roll pixels
 * @param {number} length top of the roll to the front of the keys
 * @param {number} aspect canvas width over canvas height
 * @param {{standing?: number, fov?: number}} [opts] `standing` is how far the
 *   tallest thing at the near edge rises off the table towards the camera.
 * @returns {{pitch: number, dist: number, focusY: number, fov: number, aspect: number}}
 */
export function stagedCamera(width, length, aspect, { standing = 0, fov = FOV, pitchMin = PITCH_MIN, pitchMax = PITCH_MAX } = {}) {
  const t = halfFrame(fov);
  const across = Math.max(1e-6, t * Math.max(1e-6, aspect));
  const len = Math.max(1, length);
  const wide = Math.max(1, width);

  /** Positive while the width is the constraint holding the camera back. */
  const strain = (pitch) => {
    const { dist, nearShare } = lengthwise(pitch, len, t);
    return crosswise(pitch, wide, standing, nearShare, across) - dist;
  };

  // Monotonically decreasing in pitch: tilting up shortens the table on screen
  // and brings the camera in, both of which relieve the width.
  let pitch;
  if (strain(pitchMax) > 0) pitch = pitchMax;
  else if (strain(pitchMin) <= 0) pitch = pitchMin;
  else {
    let lo = pitchMin;
    let hi = pitchMax;
    for (let i = 0; i < 28; i += 1) {
      const mid = (lo + hi) / 2;
      if (strain(mid) > 0) lo = mid;
      else hi = mid;
    }
    pitch = hi;
  }

  const { dist: lengthFit, nearShare } = lengthwise(pitch, len, t);
  const dist = Math.max(lengthFit, crosswise(pitch, wide, standing, nearShare, across));
  return { pitch, dist, focusY: len - nearShare * dist, fov, aspect };
}

/**
 * Where a point on the table lands, as depth and vertical frame position.
 *
 * `y` is a roll coordinate — 0 at the top of the roll, `length` at the front of
 * the keys — and `z` is how far the point stands off the table towards the
 * camera. The returned `y` is normalised: −1 is the bottom of the frame, +1 the
 * top. `depth` is distance from the camera along its axis, and the fact that it
 * *falls* as `y` rises is the whole property this module exists to hold.
 */
export function projectOnto(shot, y, z = 0) {
  const along = y - shot.focusY;
  const depth = shot.dist - along * Math.cos(shot.pitch) - z * Math.sin(shot.pitch);
  const height = -along * Math.sin(shot.pitch) + z * Math.cos(shot.pitch);
  const t = halfFrame(shot.fov);
  return { depth, y: depth > 1e-6 ? height / (depth * t) : 0 };
}

/** Half the table width that fits across the frame at a given depth. */
export function acrossAt(shot, depth) {
  return depth * halfFrame(shot.fov) * shot.aspect;
}
