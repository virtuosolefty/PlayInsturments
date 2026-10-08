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
  if (handedness(axes) !== 1) throw new Error('These axes would mirror the model; turn it instead');
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

/** 1 when `axes` only turn a model, −1 when they would mirror it (inside out, its lettering backwards), 0 when they are not three different axes. */
function handedness(axes) {
  const rows = axes.map(([axis, sign]) => [0, 1, 2].map(k => (k === axis ? sign : 0)));
  const [a, b, c] = rows;
  return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

const OLD_PBR = 'KHR_materials_pbrSpecularGlossiness';

/**
 * A material written the older, specular-glossiness way, rewritten as
 * metallic-roughness, which is what the stage's loader draws. Its colour and
 * its picture are kept and its gloss becomes roughness; the specular colour
 * has no equal and is dropped, so a part comes out a non-metal. A material
 * already written the newer way is returned as it is.
 */
export function asMetalRough(material) {
  const old = material.extensions?.[OLD_PBR];
  if (!old) return material;
  const { extensions, ...rest } = material;
  const kept = Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== OLD_PBR));
  return {
    ...rest,
    ...(Object.keys(kept).length > 0 && { extensions: kept }),
    pbrMetallicRoughness: {
      baseColorFactor: old.diffuseFactor ?? [1, 1, 1, 1],
      ...(old.diffuseTexture && { baseColorTexture: old.diffuseTexture }),
      metallicFactor: 0,
      roughnessFactor: +(1 - (old.glossinessFactor ?? 1)).toFixed(4),
    },
  };
}

/**
 * A primitive without the vertex data its material cannot use: texture
 * coordinates place a picture, and tangents are only for a normal map. Many
 * shown models are plain colours throughout, and this is a fifth of their size.
 */
export function leanPrimitive(primitive, material) {
  const pbr = material?.pbrMetallicRoughness ?? {};
  const normalMapped = !!material?.normalTexture;
  const textured = normalMapped || [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material?.occlusionTexture, material?.emissiveTexture].some(Boolean);
  return { ...primitive, uvs: textured ? primitive.uvs : null, tangents: normalMapped ? primitive.tangents : null };
}

/** Every triangle of every primitive, each primitive a part of its own: two may share a material. */
export function wholePieces(primitives) {
  return primitives
    .map((prim, primIndex) => ({ primIndex, part: `part${primIndex}`, triangles: Array.from({ length: prim.indices.length / 3 }, (_, t) => t) }))
    .filter(piece => piece.triangles.length);
}
