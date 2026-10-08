/**
 * showcaseView.js — how a model that is only shown is first seen, and turned.
 *
 * The model stands on the floor at the middle of the stage (see
 * scripts/models/showcase.mjs). Its file may say which angle shows it best;
 * dragging then turns it all the way round, and tips it a little.
 */

/** The viewer's lens: a product photograph, as in the stage's free play. */
export const VIEWER_LENS = Object.freeze({ fovDeg: 30 });
/** From a little to one side and a little above. */
const USUAL = Object.freeze({ azimuthDeg: 20, elevationDeg: 14 });
/** How far it tips, in radians: never to below the floor, never to straight down. */
export const PITCH_LIMITS = Object.freeze([-0.2, 0.7]);
const YAW_PER_PIXEL = 0.008;
const PITCH_PER_PIXEL = 0.005;

export const NO_TURN = Object.freeze({ yaw: 0, pitch: 0 });

const angle = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** The shot the studio frames: the model's box, from the angle its file asks for. */
export function showcaseShot(fit) {
  return { box: fit.bounds, azimuthDeg: angle(fit.view?.azimuthDeg, USUAL.azimuthDeg), elevationDeg: angle(fit.view?.elevationDeg, USUAL.elevationDeg) };
}

/** The turn after the pointer has moved (dx, dy) pixels from where a drag began with `turn`. */
export function turnBy(turn, dx, dy) {
  return {
    yaw: turn.yaw - dx * YAW_PER_PIXEL,
    pitch: Math.min(PITCH_LIMITS[1], Math.max(PITCH_LIMITS[0], turn.pitch + dy * PITCH_PER_PIXEL)),
  };
}

export const isTurned = turn => turn.yaw !== 0 || turn.pitch !== 0;
