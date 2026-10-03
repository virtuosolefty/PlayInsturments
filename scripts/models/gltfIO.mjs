/**
 * gltfIO.mjs — reading and writing just enough glTF 2.0 to prepare a model.
 *
 * A glTF is a JSON description plus one or more byte buffers. Accessors say
 * where each list of numbers (positions, indices, UVs) lives in those bytes.
 * This reads any accessor into a plain typed array, works out where each node
 * ends up in the scene, and writes a single-buffer binary file (GLB) back out.
 *
 * Matrices are sixteen numbers in column-major order, as glTF stores them.
 */

const COMPONENTS = {
  5120: { Array: Int8Array, read: 'getInt8', bytes: 1 },
  5121: { Array: Uint8Array, read: 'getUint8', bytes: 1 },
  5122: { Array: Int16Array, read: 'getInt16', bytes: 2 },
  5123: { Array: Uint16Array, read: 'getUint16', bytes: 2 },
  5125: { Array: Uint32Array, read: 'getUint32', bytes: 4 },
  5126: { Array: Float32Array, read: 'getFloat32', bytes: 4 },
};
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/**
 * Accessor `index` as a tightly packed typed array of its own.
 *
 * Reads through a DataView, so interleaved views, offsets and buffers that do
 * not start on a word boundary are all fine.
 *
 * @param {object} json the glTF document
 * @param {Uint8Array[]} buffers bytes of each entry in `json.buffers`
 */
export function readAccessor(json, buffers, index) {
  const accessor = json.accessors?.[index];
  if (!accessor) throw new Error(`No accessor ${index} in this glTF`);
  if (accessor.sparse) throw new Error(`Accessor ${index} is sparse, which this reader does not support`);
  const component = COMPONENTS[accessor.componentType], width = WIDTHS[accessor.type];
  if (!component || !width) throw new Error(`Accessor ${index} has an unknown component type or shape (${accessor.componentType}, ${accessor.type})`);
  const out = new component.Array(accessor.count * width);
  if (accessor.bufferView === undefined) return out;
  const view = json.bufferViews[accessor.bufferView], source = buffers[view.buffer];
  const data = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const stride = view.byteStride ?? width * component.bytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let i = 0; i < accessor.count; i++) {
    for (let k = 0; k < width; k++) out[i * width + k] = data[component.read](start + i * stride + k * component.bytes, true);
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

/** A node's own transform: its matrix, or its translation, rotation (quaternion) and scale combined. */
function localMatrix({ matrix, translation: [tx, ty, tz] = [0, 0, 0], rotation: [x, y, z, w] = [0, 0, 0, 1], scale: [sx, sy, sz] = [1, 1, 1] }) {
  if (matrix) return matrix;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + w * z) * sx, 2 * (x * z - w * y) * sx, 0,
    2 * (x * y - w * z) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + w * x) * sy, 0,
    2 * (x * z + w * y) * sz, 2 * (y * z - w * x) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/**
 * Where every node of a scene ends up, with its parents' transforms applied.
 *
 * @returns {Map<number, number[]>} node index to world matrix; nodes the scene does not reach are absent
 */
export function worldMatrices(json, sceneIndex = json.scene ?? 0) {
  const world = new Map();
  const visit = (index, parent) => {
    const node = json.nodes[index], matrix = multiply(parent, localMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  };
  for (const root of json.scenes?.[sceneIndex]?.nodes ?? []) visit(root, IDENTITY);
  return world;
}

/** New xyz triples: `positions` moved by `matrix`. */
export function transformPoints(positions, m) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

/**
 * New unit normals for a surface moved by `matrix`.
 *
 * Normals follow the inverse transpose, not the matrix itself: stretching a
 * surface along y tilts its normals away from y.
 */
export function transformNormals(normals, m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det) throw new Error('Cannot transform normals by a matrix that flattens the model');
  // a…i name the upper-left 3×3 down its columns, so read as rows they are its transpose.
  // n is the inverse of that transpose, row by row: the normal matrix.
  const n = [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map(v => v / det);
  const out = new Float32Array(normals.length);
  for (let k = 0; k < normals.length; k += 3) {
    const x = normals[k], y = normals[k + 1], z = normals[k + 2];
    const nx = n[0] * x + n[1] * y + n[2] * z, ny = n[3] * x + n[4] * y + n[5] * z, nz = n[6] * x + n[7] * y + n[8] * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    out[k] = nx / length; out[k + 1] = ny / length; out[k + 2] = nz / length;
  }
  return out;
}

const componentTypeOf = data => Number(Object.keys(COMPONENTS).find(code => data instanceof COMPONENTS[code].Array));
const padded = length => (length + 3) & ~3;

/**
 * Collects accessors and images into one buffer, keeping every view four-byte aligned.
 *
 * @returns {{ addAccessor: Function, addImage: Function, finish: Function }}
 */
const ARRAY_BUFFER = 34962;

/**
 * A vertex attribute's bytes with each element padded out to a whole number of
 * words: the format requires every vertex element to start on a four-byte
 * boundary, which three 16-bit or 8-bit numbers do not fill.
 */
function strided(data, width, bytes) {
  const element = width * bytes, stride = padded(element);
  if (stride === element) return { view: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), stride: null };
  const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength), view = new Uint8Array((data.length / width) * stride);
  for (let i = 0; i < data.length / width; i++) view.set(source.subarray(i * element, (i + 1) * element), i * stride);
  return { view, stride };
}

export function createGltfBuilder() {
  const bufferViews = [], accessors = [], images = [], chunks = [];
  let length = 0;
  const addView = (bytes, target, byteStride = null) => {
    chunks.push({ bytes, offset: length });
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength, ...(byteStride ? { byteStride } : {}), ...(target ? { target } : {}) });
    length = padded(length + bytes.byteLength);
    return bufferViews.length - 1;
  };
  return {
    /**
     * @param {'SCALAR'|'VEC2'|'VEC3'|'VEC4'} type
     * @param {{ target?: number, normalized?: boolean }} [options] vertex attributes (target ARRAY_BUFFER) whose
     *   elements do not fill whole words are padded out to them
     */
    addAccessor(data, type, { target, normalized = false } = {}) {
      const componentType = componentTypeOf(data), width = WIDTHS[type];
      if (!componentType || !width) throw new Error(`Cannot write a ${data?.constructor?.name} as ${type}`);
      const min = new Array(width).fill(Infinity), max = new Array(width).fill(-Infinity);
      for (let i = 0; i < data.length; i++) { const k = i % width; if (data[i] < min[k]) min[k] = data[i]; if (data[i] > max[k]) max[k] = data[i]; }
      const { view, stride } = target === ARRAY_BUFFER ? strided(data, width, COMPONENTS[componentType].bytes) : { view: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), stride: null };
      const bufferView = addView(view, target, stride);
      accessors.push({ bufferView, componentType, count: data.length / width, type, min, max, ...(normalized ? { normalized } : {}) });
      return accessors.length - 1;
    },
    /** Embeds an encoded image (PNG, JPEG or WebP bytes) and returns its index in `images`. */
    addImage(bytes, mimeType) {
      images.push({ bufferView: addView(bytes), mimeType });
      return images.length - 1;
    },
    /** @param {object} [rest] the remaining top-level glTF properties: scenes, nodes, meshes, materials… */
    finish(rest = {}) {
      const bin = new Uint8Array(length);
      for (const { bytes, offset } of chunks) bin.set(bytes, offset);
      const json = { asset: { version: '2.0', generator: 'Practice Deck prepare-models' }, ...rest, buffers: [{ byteLength: length }], bufferViews, accessors, ...(images.length ? { images } : {}) };
      return { json, bin };
    },
  };
}

const GLB_MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

/** A GLB file: 12-byte header, a JSON chunk padded with spaces, a binary chunk padded with zeros. */
export function buildGlb(json, bin) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = padded(text.byteLength), binLength = padded(bin.byteLength);
  const out = new Uint8Array(12 + 8 + jsonLength + 8 + binLength), view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true); view.setUint32(4, 2, true); view.setUint32(8, out.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, JSON_CHUNK, true);
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(text, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, BIN_CHUNK, true);
  out.set(bin, 28 + jsonLength);
  return out;
}

/** @returns {{ json: object, bin: Uint8Array }} */
export function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error('These bytes are not a GLB file');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 28 + jsonLength;
  const bin = binStart <= bytes.byteLength ? bytes.subarray(binStart, binStart + view.getUint32(20 + jsonLength, true)) : new Uint8Array(0);
  return { json, bin };
}
