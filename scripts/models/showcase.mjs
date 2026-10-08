/**
 * showcase.mjs — placing a model that is only shown, never played.
 *
 * Nothing is measured on it and nothing is taken out: it keeps its own
 * strings, heads and stands. It is turned upright, scaled so its longest side
 * is the same on every model, and stood on the floor at the middle of the
 * stage, so one viewer frames them all.
 *
 * Stage axes: x across, y up, z toward the viewer. `axes` gives, for each
 * stage axis, the model axis it comes from (with its sign), as in recipes.mjs.
 */

/** The longest side of every shown model, in stage units: about the length of the guitar that is played. */
export const SHOWCASE_SIZE = 24;

/**
 * @param {{ min: number[], max: number[] }} box the model's bounds, in its own space
 * @param {[number, number][]} axes
 * @returns {{ apply: (point: number[]) => number[], turn: (vector: number[]) => number[], scale: number }}
 */
export function showcaseTransform(box, axes) {
  const turn = vector => axes.map(([axis, sign]) => sign * vector[axis] + 0);
  const ends = [turn(box.min), turn(box.max)];
  const min = [0, 1, 2].map(k => Math.min(ends[0][k], ends[1][k])), max = [0, 1, 2].map(k => Math.max(ends[0][k], ends[1][k]));
  const longest = Math.max(...max.map((value, k) => value - min[k]));
  if (!(longest > 0)) throw new Error('The model has no size');
  const scale = SHOWCASE_SIZE / longest;
  // Centred across and in depth; its lowest point on the floor.
  const origin = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const apply = point => turn(point).map((value, k) => (value - origin[k]) * scale);
  return { apply, turn, scale };
}

/** Every triangle of every primitive, each primitive a part of its own: two may share a material. */
export function wholePieces(primitives) {
  return primitives
    .map((prim, primIndex) => ({ primIndex, part: `part${primIndex}`, triangles: Array.from({ length: prim.indices.length / 3 }, (_, t) => t) }))
    .filter(piece => piece.triangles.length);
}
