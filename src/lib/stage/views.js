/**
 * views.js — the camera views a string instrument is shown from.
 *
 * Lessons use the fingerboard map (concepts G3, V3, C3): the instrument lies
 * across the stage and is seen through a long lens, so the neck reads straight
 * and the frets keep their true spacing. Free play (concepts G1, V1, C1) uses a
 * product-photo lens and lets the player turn the instrument within limits.
 *
 * `elevation` is the camera's height and depth as fractions of its distance,
 * as framing.js takes it; `turn` is how far the player may turn the view either
 * way, in radians, or null where the view is fixed.
 */

const radians = degrees => (degrees * Math.PI) / 180;

export const STAGE_VIEWS = Object.freeze({
  lesson: Object.freeze({ fovDeg: 22, elevation: Object.freeze([0.89, 0.46]), turn: null }),
  freePlay: Object.freeze({
    fovDeg: 32,
    elevation: Object.freeze([0.89, 0.46]),
    turn: Object.freeze({ yaw: Object.freeze([radians(-25), radians(25)]), pitch: Object.freeze([radians(-12), radians(10)]) }),
  }),
});

/** The view called `name`, or the lesson view when there is no such view. */
export const stageView = name => (Object.hasOwn(STAGE_VIEWS, name) ? STAGE_VIEWS[name] : STAGE_VIEWS.lesson);
