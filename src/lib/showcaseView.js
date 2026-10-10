/**
 * showcaseView.js — how a model that is only shown is first seen, and how far
 * it may be turned.
 *
 * The model stands on the floor at the middle of the stage (see
 * scripts/models/showcase.mjs). Its file may say which angle shows it best.
 * Dragging turns it on the stage's turntable (stage/turntable.js).
 */

/** The viewer's lens: a product photograph, as in the stage's free play. */
export const VIEWER_LENS = Object.freeze({ fovDeg: 30 });
/** From a little to one side and a little above. */
const USUAL = Object.freeze({ azimuthDeg: 20, elevationDeg: 14 });
/** All the way round; tipped a little, in radians, never to below the floor or to straight down. */
export const VIEWER_TURN = Object.freeze({ yaw: Object.freeze([-Infinity, Infinity]), pitch: Object.freeze([-0.2, 0.7]) });

const angle = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** The shot the studio frames: the model's box, from the angle its file asks for. */
export function showcaseShot(fit) {
  return { box: fit.bounds, azimuthDeg: angle(fit.view?.azimuthDeg, USUAL.azimuthDeg), elevationDeg: angle(fit.view?.elevationDeg, USUAL.elevationDeg) };
}
