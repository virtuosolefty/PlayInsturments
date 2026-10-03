/**
 * quantize.mjs — smaller vertex data for the prepared models (KHR_mesh_quantization).
 *
 * Floats are four bytes a number; a model on stage needs nowhere near that
 * precision. Positions become 16-bit fractions of a box around their part,
 * which the part's node scales back up; normals and tangents become 8-bit
 * fractions; texture coordinates become 16-bit fractions where they stay
 * within 0 to 1. Three.js reads all of these as they are.
 *
 * One scale for all three axes keeps the node's transform uniform, so normals
 * and tangents need no correcting for it.
 */

const SHORT = 32767, BYTE = 127, UNSIGNED_SHORT = 65535;

/**
 * The box a part's positions are stored as fractions of: its middle, and half
 * its longest side. Every piece of a part shares it, as they share a node.
 *
 * @param {Float32Array[]} positionLists xyz triples, one list per piece
 * @returns {{ translation: number[], scale: number }}
 */
export function quantizeFrame(positionLists) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const positions of positionLists) {
    for (let i = 0; i < positions.length; i++) {
      const k = i % 3;
      if (positions[i] < min[k]) min[k] = positions[i];
      if (positions[i] > max[k]) max[k] = positions[i];
    }
  }
  const half = Math.max(...[0, 1, 2].map(k => (max[k] - min[k]) / 2));
  return { translation: [0, 1, 2].map(k => (min[k] + max[k]) / 2), scale: half > 0 ? half : 1 };
}

const toFraction = (value, range) => Math.round(Math.max(-1, Math.min(1, value)) * range);

/**
 * One piece's vertex data, quantized within `frame`.
 *
 * @param {{ positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, tangents?: Float32Array }} piece
 * @param {{ translation: number[], scale: number }} frame from `quantizeFrame`
 */
export function quantizePart({ positions, normals = null, uvs = null, tangents = null }, frame) {
  const q = {
    positions: Int16Array.from(positions, (v, i) => toFraction((v - frame.translation[i % 3]) / frame.scale, SHORT)),
    normals: normals && Int8Array.from(normals, v => toFraction(v, BYTE)),
    // A tangent's w is its handedness, +1 or -1; it stays a whole fraction either way.
    tangents: tangents && Int8Array.from(tangents, (v, i) => (i % 4 === 3 ? (v < 0 ? -BYTE : BYTE) : toFraction(v, BYTE))),
    uvs: null,
    uvsNormalized: false,
  };
  if (uvs) {
    const fits = uvs.every(v => v >= 0 && v <= 1);
    q.uvs = fits ? Uint16Array.from(uvs, v => Math.round(v * UNSIGNED_SHORT)) : uvs;
    q.uvsNormalized = fits;
  }
  return q;
}
