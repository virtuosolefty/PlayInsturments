import { describe, expect, it } from 'vitest';
import { SHOWCASE_SIZE, asMetalRough, leanPrimitive, showcaseTransform, wholePieces } from './showcase.mjs';

const UPRIGHT = [[0, 1], [1, 1], [2, 1]];
const corners = ({ min, max }) => [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => [x, y, z])));
const boundsOf = points => ({ min: [0, 1, 2].map(k => Math.min(...points.map(p => p[k]))), max: [0, 1, 2].map(k => Math.max(...points.map(p => p[k]))) });

describe('placing a model that is only shown', () => {
  it('stands it on the floor, centred, its longest side the showcase size', () => {
    const box = { min: [10, 5, -3], max: [14, 7, -2] };
    const placed = boundsOf(corners(box).map(showcaseTransform(box, UPRIGHT).apply));
    expect(placed.max[0] - placed.min[0]).toBeCloseTo(SHOWCASE_SIZE);
    expect(placed.min[1]).toBeCloseTo(0);
    expect(placed.min[0]).toBeCloseTo(-SHOWCASE_SIZE / 2);
    expect((placed.min[2] + placed.max[2]) / 2).toBeCloseTo(0);
    // The shape is kept: twice as long as it is tall, four times as long as it is deep.
    expect(placed.max[1]).toBeCloseTo(SHOWCASE_SIZE / 2);
    expect(placed.max[2] - placed.min[2]).toBeCloseTo(SHOWCASE_SIZE / 4);
  });

  it('turns a model that was made lying down so that it stands', () => {
    // Made with z up: the stage's up comes from the model's z, its depth from the model's −y.
    const box = { min: [0, 0, 0], max: [2, 1, 6] };
    const transform = showcaseTransform(box, [[0, 1], [2, 1], [1, -1]]);
    const placed = boundsOf(corners(box).map(transform.apply));
    expect(placed.max[1] - placed.min[1]).toBeCloseTo(SHOWCASE_SIZE);
    expect(placed.min[1]).toBeCloseTo(0);
    expect(transform.turn([0, 0, 1])).toEqual([0, 1, 0]);
    expect(transform.turn([0, 1, 0])).toEqual([0, 0, -1]);
  });

  it('reports the scale it used', () => {
    expect(showcaseTransform({ min: [0, 0, 0], max: [48, 1, 1] }, UPRIGHT).scale).toBeCloseTo(SHOWCASE_SIZE / 48);
  });

  it('refuses a model with no size', () => {
    expect(() => showcaseTransform({ min: [1, 1, 1], max: [1, 1, 1] }, UPRIGHT)).toThrow(/no size/);
  });
});

describe('the pieces of a model that is only shown', () => {
  it('keeps every triangle of every primitive, each primitive a part of its own', () => {
    const primitives = [{ indices: new Uint16Array([0, 1, 2, 2, 1, 3]) }, { indices: new Uint16Array([0, 1, 2]) }];
    expect(wholePieces(primitives)).toEqual([
      { primIndex: 0, part: 'part0', triangles: [0, 1] },
      { primIndex: 1, part: 'part1', triangles: [0] },
    ]);
  });

  it('leaves out a primitive with nothing to draw', () => {
    expect(wholePieces([{ indices: new Uint16Array([]) }, { indices: new Uint16Array([0, 1, 2]) }]).map(piece => piece.part)).toEqual(['part1']);
  });
});

describe('axes that would mirror a model', () => {
  it('are refused: a mirrored model is inside out, and its lettering reads backwards', () => {
    expect(() => showcaseTransform({ min: [0, 0, 0], max: [1, 2, 3] }, [[0, -1], [1, 1], [2, 1]])).toThrow(/mirror/);
    expect(() => showcaseTransform({ min: [0, 0, 0], max: [1, 2, 3] }, [[2, 1], [0, 1], [1, -1]])).toThrow(/mirror/);
  });

  it('are told from a turn, which is allowed', () => {
    // Lying along x with its top toward +y: stood on its tail with its top toward the viewer.
    expect(() => showcaseTransform({ min: [0, 0, 0], max: [1, 2, 3] }, [[2, 1], [0, 1], [1, 1]])).not.toThrow();
  });
});

describe('a material written the older, specular-glossiness way', () => {
  const old = {
    name: 'Body', doubleSided: true, normalTexture: { index: 3 },
    extensions: { KHR_materials_pbrSpecularGlossiness: { diffuseFactor: [0.98, 0.98, 0.98, 1], diffuseTexture: { index: 0 }, glossinessFactor: 0.53, specularFactor: [0.63, 0.63, 0.63] } },
  };

  it('is rewritten as metallic-roughness, which is what the stage draws: its colour and picture kept, gloss turned into roughness', () => {
    expect(asMetalRough(old)).toEqual({
      name: 'Body', doubleSided: true, normalTexture: { index: 3 },
      pbrMetallicRoughness: { baseColorFactor: [0.98, 0.98, 0.98, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.47 },
    });
  });

  it('is white and fully glossy where it says nothing', () => {
    expect(asMetalRough({ name: 'String', extensions: { KHR_materials_pbrSpecularGlossiness: {} } }).pbrMetallicRoughness).toEqual({ baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0 });
  });

  it('keeps anything else the material asks for', () => {
    const coated = { ...old, extensions: { ...old.extensions, KHR_materials_clearcoat: { clearcoatFactor: 1 } } };
    expect(asMetalRough(coated).extensions).toEqual({ KHR_materials_clearcoat: { clearcoatFactor: 1 } });
  });

  it('leaves alone a material already written the newer way, and the one it was given', () => {
    const modern = Object.freeze({ name: 'Metal', pbrMetallicRoughness: { metallicFactor: 1 } });
    expect(asMetalRough(modern)).toBe(modern);
    expect(old.extensions.KHR_materials_pbrSpecularGlossiness.glossinessFactor).toBe(0.53);
  });
});

describe('what a primitive needs to carry', () => {
  const prim = { positions: [0], normals: [1], uvs: [2], tangents: [3], indices: [4], material: 0 };

  it('keeps texture coordinates only for a material that has a picture to place', () => {
    expect(leanPrimitive(prim, { pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] } })).toEqual({ ...prim, uvs: null, tangents: null });
    expect(leanPrimitive(prim, { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }).uvs).toEqual([2]);
    expect(leanPrimitive(prim, { pbrMetallicRoughness: { metallicRoughnessTexture: { index: 1 } } }).uvs).toEqual([2]);
    expect(leanPrimitive(prim, { occlusionTexture: { index: 1 } }).uvs).toEqual([2]);
    expect(leanPrimitive(prim, { emissiveTexture: { index: 1 } }).uvs).toEqual([2]);
  });

  it('keeps tangents only for a material with a normal map, which is all they are for', () => {
    expect(leanPrimitive(prim, { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }).tangents).toBeNull();
    expect(leanPrimitive(prim, { normalTexture: { index: 2 } })).toEqual(prim);
  });

  it('carries the least for a primitive with no material, and leaves the one it was given alone', () => {
    const frozen = Object.freeze({ ...prim });
    expect(leanPrimitive(frozen, undefined)).toEqual({ ...prim, uvs: null, tangents: null });
    expect(frozen.uvs).toEqual([2]);
  });
});
