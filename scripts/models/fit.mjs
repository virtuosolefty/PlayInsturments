/**
 * fit.mjs — measuring a model's playable parts from its vertices.
 *
 * A downloaded instrument does not say where its nut, frets or strings are, so
 * the preparation script works them out: a string is a thin cylinder whose
 * vertices scatter evenly around a straight line, and frets sit where equal
 * temperament puts them. Everything here takes plain arrays and returns
 * plain numbers.
 */

/**
 * A straight line through `points`, as the other two coordinates changing
 * linearly with coordinate `axis`. Least squares, so the vertices of a
 * cylinder average out to its axis.
 *
 * @param {number[][]} points xyz triples
 * @param {0|1|2} axis the coordinate the line is parameterised by
 * @returns {{ axis: number, at: (t: number) => number[] }} `at(t)` is the point on the line where coordinate `axis` is t
 */
export function fitLine(points, axis) {
  const n = points.length;
  const mean = k => points.reduce((sum, p) => sum + p[k], 0) / n;
  const tMean = mean(axis);
  const spread = points.reduce((sum, p) => sum + (p[axis] - tMean) ** 2, 0);
  if (!(spread > 1e-18)) throw new Error('These points do not spread along the axis, so no line can be fitted');
  const others = [0, 1, 2].filter(k => k !== axis);
  const fits = others.map(k => {
    const m = mean(k);
    const slope = points.reduce((sum, p) => sum + (p[axis] - tMean) * (p[k] - m), 0) / spread;
    return { k, slope, intercept: m - slope * tMean };
  });
  return {
    axis,
    at(t) {
      const point = [0, 0, 0];
      point[axis] = t;
      for (const { k, slope, intercept } of fits) point[k] = intercept + slope * t;
      return point;
    },
  };
}

/**
 * The nut position and scale length that put fret n at nut + length × (1 − 2^(−n/12)).
 * `frets` are fret positions along the neck in order from the nut; `length`
 * is negative when they run toward smaller coordinates.
 *
 * @param {number[]} frets
 * @returns {{ nut: number, length: number, worst: number }} `worst` is the largest distance between a fret and its fitted place
 */
export function fitScale(frets) {
  if (frets.length < 2) throw new Error('Fitting a scale length needs at least two frets');
  // Linear in the unknowns: position = nut + length × u, with u = 1 − 2^(−n/12).
  const u = frets.map((_, i) => 1 - 2 ** (-(i + 1) / 12));
  const n = frets.length, uMean = u.reduce((a, b) => a + b, 0) / n, zMean = frets.reduce((a, b) => a + b, 0) / n;
  const length = u.reduce((sum, ui, i) => sum + (ui - uMean) * (frets[i] - zMean), 0) / u.reduce((sum, ui) => sum + (ui - uMean) ** 2, 0);
  const nut = zMean - length * uMean;
  const worst = Math.max(...frets.map((z, i) => Math.abs(z - (nut + length * u[i]))));
  return { nut, length, worst };
}

/**
 * The centres of the rings of vertices a modelled string is made of, in order
 * along coordinate `axis`. Vertices closer than `gap` along the axis to the
 * previous one belong to the same ring.
 *
 * @returns {number[][]} ring centres, xyz
 */
export function ringCentres(points, axis, gap) {
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const rings = [];
  for (const point of sorted) {
    const ring = rings.at(-1);
    if (ring && point[axis] - ring.last < gap) { ring.points.push(point); ring.last = point[axis]; }
    else rings.push({ points: [point], last: point[axis] });
  }
  return rings.map(ring => [0, 1, 2].map(k => ring.points.reduce((sum, p) => sum + p[k], 0) / ring.points.length));
}

/**
 * The longest straight stretch of a string's centreline: where it crosses the
 * nut and the bridge (or saddle), since it bends at both. A run is straight
 * while each segment turns less than `maxTurnDeg` from the one before.
 *
 * @param {number[][]} centres from `ringCentres`
 * @returns {{ from: number[], to: number[] }} its two ends, in centreline order
 */
export function playingSpan(centres, maxTurnDeg) {
  if (centres.length < 2) throw new Error('A string needs at least two rings to have a straight stretch to measure');
  const direction = (a, b) => { const d = b.map((v, k) => v - a[k]), length = Math.hypot(...d); return d.map(v => v / length); };
  const limit = Math.cos((maxTurnDeg * Math.PI) / 180);
  let best = null, start = 0;
  // A modelled string may run nut to bridge as one long segment, or as several in a line.
  for (let i = 1; i < centres.length; i++) {
    const straight = i >= 2 && direction(centres[i - 2], centres[i - 1]).reduce((sum, v, k) => sum + v * direction(centres[i - 1], centres[i])[k], 0) >= limit;
    if (!straight) start = i - 1;
    const length = Math.hypot(...centres[i].map((v, k) => v - centres[start][k]));
    if (!best || length > best.length) best = { from: centres[start], to: centres[i], length };
  }
  return { from: best.from, to: best.to };
}

/** How far a cylinder's vertices sit from its axis: the median distance from `line`, which ignores a few stray end-cap points. */
export function crossSectionRadius(points, line) {
  const distances = points.map(p => {
    const q = line.at(p[line.axis]);
    return Math.hypot(...p.map((v, k) => v - q[k]));
  }).sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)];
}
