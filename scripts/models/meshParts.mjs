/**
 * meshParts.mjs — taking an exported mesh apart without a modelling program.
 *
 * Artists usually join an instrument into one mesh before uploading it, but
 * the strings, pegs and body are still separate surfaces inside that mesh:
 * no triangle of a string shares a point with the fingerboard. Finding those
 * disconnected surfaces is enough to lift the strings out, which is what the
 * stage needs so it can draw strings of its own that move.
 *
 * Everything here works on plain typed arrays and returns new ones.
 */

/**
 * One id per distinct point. Exporters duplicate a vertex wherever its UV or
 * normal changes, so connectivity has to be judged by position, not by index.
 *
 * @param {Float32Array} positions xyz triples
 * @param {number} tolerance points closer than this on every axis count as one
 * @returns {Uint32Array} for each vertex, the id of the point it sits on
 */
export function weldByPosition(positions, tolerance) {
  if (!(tolerance > 0)) throw new Error(`Weld tolerance must be positive, got ${tolerance}`);
  const count = positions.length / 3, ids = new Uint32Array(count), seen = new Map();
  for (let v = 0; v < count; v++) {
    const key = `${Math.round(positions[v * 3] / tolerance)},${Math.round(positions[v * 3 + 1] / tolerance)},${Math.round(positions[v * 3 + 2] / tolerance)}`;
    let id = seen.get(key);
    if (id === undefined) { id = seen.size; seen.set(key, id); }
    ids[v] = id;
  }
  return ids;
}

/**
 * Groups triangles into surfaces that touch.
 *
 * @param {Uint32Array|Uint16Array} indices three per triangle
 * @param {Uint32Array} weld from `weldByPosition`
 * @returns {{ count: number, ofTriangle: Int32Array }} part number for each triangle, numbered by first appearance
 */
export function connectedComponents(indices, weld) {
  const parent = Uint32Array.from({ length: largest(weld) + 1 }, (_, i) => i);
  const find = point => {
    let root = point;
    while (parent[root] !== root) root = parent[root];
    while (parent[point] !== root) { const next = parent[point]; parent[point] = root; point = next; }
    return root;
  };
  const triangles = indices.length / 3;
  for (let t = 0; t < triangles; t++) {
    const a = find(weld[indices[t * 3]]), b = find(weld[indices[t * 3 + 1]]), c = find(weld[indices[t * 3 + 2]]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const ofTriangle = new Int32Array(triangles), numbers = new Map();
  for (let t = 0; t < triangles; t++) {
    const root = find(weld[indices[t * 3]]);
    if (!numbers.has(root)) numbers.set(root, numbers.size);
    ofTriangle[t] = numbers.get(root);
  }
  return { count: numbers.size, ofTriangle };
}

/** The largest value in a typed array, or -1 when it is empty. A loop, because spreading a large array overflows the stack. */
function largest(values) {
  let max = -1;
  for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
  return max;
}

const emptyBox = () => ({ triangles: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function grow(box, positions, vertex) {
  for (let axis = 0; axis < 3; axis++) {
    const value = positions[vertex * 3 + axis];
    if (value < box.min[axis]) box.min[axis] = value;
    if (value > box.max[axis]) box.max[axis] = value;
  }
}
const finish = box => ({ ...box, size: box.max.map((v, i) => v - box.min[i]), center: box.max.map((v, i) => (v + box.min[i]) / 2) });

/** Triangle count, bounding box, size and centre of the triangles in `indices`. */
export function bounds(positions, indices) {
  const box = emptyBox();
  for (let i = 0; i < indices.length; i++) grow(box, positions, indices[i]);
  box.triangles = indices.length / 3;
  return finish(box);
}

/** `bounds` for every part found by `connectedComponents`, in part order. */
export function describeComponents(positions, indices, parts) {
  const boxes = Array.from({ length: parts.count }, emptyBox);
  for (let t = 0; t < parts.ofTriangle.length; t++) {
    const box = boxes[parts.ofTriangle[t]];
    box.triangles++;
    for (let corner = 0; corner < 3; corner++) grow(box, positions, indices[t * 3 + corner]);
  }
  return boxes.map(finish);
}

/**
 * Whether a part has the proportions of a string: long on one axis, thin on the other two.
 *
 * @param {{ size: number[] }} part from `describeComponents`
 * @param {{ axis: 0|1|2, minLength: number, maxThickness: number }} shape
 */
export function isLongThin(part, { axis, minLength, maxThickness }) {
  return part.size[axis] >= minLength && part.size.every((extent, i) => i === axis || extent <= maxThickness);
}

/** A new index list holding only the triangles `keep(triangleNumber)` accepts. */
export function keepTriangles(indices, keep) {
  const out = [];
  for (let t = 0; t < indices.length / 3; t++) if (keep(t)) out.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
  return Uint32Array.from(out);
}

/**
 * Drops vertices no triangle uses and renumbers the rest, keeping their order.
 *
 * @param {Uint32Array} indices
 * @param {{ data: ArrayLike<number>, size: number }[]} attributes per-vertex arrays (positions, normals, UVs…)
 * @returns {{ indices: Uint32Array, attributes: object[], vertexCount: number }} attributes keep their array type
 */
export function compact(indices, attributes) {
  const total = attributes[0].data.length / attributes[0].size;
  const used = new Uint8Array(total);
  for (let i = 0; i < indices.length; i++) used[indices[i]] = 1;
  const renumber = new Uint32Array(total);
  let vertexCount = 0;
  for (let v = 0; v < total; v++) if (used[v]) renumber[v] = vertexCount++;
  const packed = attributes.map(({ data, size }) => {
    const out = new data.constructor(vertexCount * size);
    for (let v = 0; v < total; v++) if (used[v]) for (let k = 0; k < size; k++) out[renumber[v] * size + k] = data[v * size + k];
    return out;
  });
  return { indices: indices.map(i => renumber[i]), attributes: packed, vertexCount };
}
