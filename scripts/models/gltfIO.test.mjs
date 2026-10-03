import { describe, expect, it } from 'vitest';
import { buildGlb, createGltfBuilder, parseGlb, readAccessor, transformNormals, transformPoints, worldMatrices } from './gltfIO.mjs';

const FLOAT = 5126, USHORT = 5123, UINT = 5125;
const bytesOf = typed => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
/** A one-buffer document around `bytes`, with the given views and accessors. */
const doc = (bufferViews, accessors) => ({ bufferViews, accessors });

describe('reading glTF accessors', () => {
  it('reads tightly packed floats', () => {
    const data = new Float32Array([1, 2, 3, 4, 5, 6]);
    const json = doc([{ buffer: 0, byteLength: 24 }], [{ bufferView: 0, componentType: FLOAT, type: 'VEC3', count: 2 }]);
    const out = readAccessor(json, [bytesOf(data)], 0);
    expect(out).toBeInstanceOf(Float32Array);
    expect([...out]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('steps over the other attributes of an interleaved view', () => {
    // position, normal, position, normal: 24 bytes per vertex
    const data = new Float32Array([1, 2, 3, 0, 0, 1, 4, 5, 6, 0, 1, 0]);
    const json = doc([{ buffer: 0, byteLength: 48, byteStride: 24 }], [
      { bufferView: 0, componentType: FLOAT, type: 'VEC3', count: 2 },
      { bufferView: 0, byteOffset: 12, componentType: FLOAT, type: 'VEC3', count: 2 },
    ]);
    expect([...readAccessor(json, [bytesOf(data)], 0)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...readAccessor(json, [bytesOf(data)], 1)]).toEqual([0, 0, 1, 0, 1, 0]);
  });

  it('adds the view offset and the accessor offset', () => {
    const data = new Uint16Array([9, 9, 9, 7, 8, 9, 10]);
    const json = doc([{ buffer: 0, byteOffset: 4, byteLength: 10 }], [{ bufferView: 0, byteOffset: 2, componentType: USHORT, type: 'SCALAR', count: 3 }]);
    const out = readAccessor(json, [bytesOf(data)], 0);
    expect(out).toBeInstanceOf(Uint16Array);
    expect([...out]).toEqual([7, 8, 9]);
  });

  it('reads from a buffer that does not start on a word boundary', () => {
    // File reads often hand back a slice of a larger pool at an odd offset.
    const pool = new Uint8Array(32);
    pool.set(bytesOf(new Uint32Array([70000, 80000])), 3);
    const json = doc([{ buffer: 0, byteLength: 8 }], [{ bufferView: 0, componentType: UINT, type: 'SCALAR', count: 2 }]);
    expect([...readAccessor(json, [pool.subarray(3, 11)], 0)]).toEqual([70000, 80000]);
  });

  it('returns zeros for an accessor with no view, as the format defines', () => {
    const json = doc([], [{ componentType: FLOAT, type: 'VEC2', count: 2 }]);
    expect([...readAccessor(json, [], 0)]).toEqual([0, 0, 0, 0]);
  });

  it('refuses what it cannot read correctly', () => {
    const json = doc([{ buffer: 0, byteLength: 12 }], [
      { bufferView: 0, componentType: FLOAT, type: 'VEC3', count: 1, sparse: { count: 1 } },
      { bufferView: 0, componentType: 5130, type: 'VEC3', count: 1 },
    ]);
    expect(() => readAccessor(json, [new Uint8Array(12)], 0)).toThrow(/sparse/i);
    expect(() => readAccessor(json, [new Uint8Array(12)], 1)).toThrow(/component type/i);
    expect(() => readAccessor(json, [new Uint8Array(12)], 7)).toThrow(/accessor 7/i);
  });
});

describe('node transforms', () => {
  const json = {
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { translation: [10, 0, 0], children: [1, 2] },
      { scale: [2, 2, 2], translation: [0, 5, 0] },
      { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1] },
      { translation: [99, 99, 99] }, // not in the scene
    ],
  };

  it('composes each node with its parents', () => {
    const world = worldMatrices(json);
    expect([...transformPoints(new Float32Array([1, 1, 1]), world.get(0))]).toEqual([11, 1, 1]);
    expect([...transformPoints(new Float32Array([1, 1, 1]), world.get(1))]).toEqual([12, 7, 2]);
    expect([...transformPoints(new Float32Array([0, 0, 0]), world.get(2))]).toEqual([11, 2, 3]);
  });

  it('leaves out nodes the scene does not reach', () => {
    expect(worldMatrices(json).has(3)).toBe(false);
  });

  it('applies rotation from a quaternion', () => {
    const turned = { scenes: [{ nodes: [0] }], nodes: [{ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }] }; // 90° about z
    const [x, y, z] = transformPoints(new Float32Array([1, 0, 0]), worldMatrices(turned).get(0));
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(1); expect(z).toBeCloseTo(0);
  });

  it('keeps normals perpendicular under uneven scale, and unit length', () => {
    const squash = worldMatrices({ scenes: [{ nodes: [0] }], nodes: [{ scale: [1, 4, 1] }] }).get(0);
    // A surface sloping at 45° in xy becomes steeper when y is stretched; its normal must lean toward x.
    const [nx, ny, nz] = transformNormals(new Float32Array([Math.SQRT1_2, Math.SQRT1_2, 0]), squash);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
    expect(nx).toBeGreaterThan(ny);
    expect(nx / ny).toBeCloseTo(4);
  });

  it('turns normals with the surface when the node is rotated', () => {
    const turned = worldMatrices({ scenes: [{ nodes: [0] }], nodes: [{ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: [3, 3, 3] }] }).get(0);
    const [nx, ny, nz] = transformNormals(new Float32Array([1, 0, 0]), turned);
    expect(nx).toBeCloseTo(0); expect(ny).toBeCloseTo(1); expect(nz).toBeCloseTo(0);
  });

  it('does not modify the arrays it is given', () => {
    const points = new Float32Array([1, 2, 3]);
    transformPoints(points, worldMatrices(json).get(0));
    expect([...points]).toEqual([1, 2, 3]);
  });
});

describe('writing a binary glTF', () => {
  it('round-trips geometry through a GLB', () => {
    const builder = createGltfBuilder();
    const positions = builder.addAccessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]), 'VEC3', { target: 34962 });
    const indices = builder.addAccessor(new Uint16Array([0, 1, 2]), 'SCALAR', { target: 34963 });
    const { json, bin } = builder.finish({ meshes: [{ primitives: [{ attributes: { POSITION: positions }, indices }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 });
    const back = parseGlb(buildGlb(json, bin));
    expect(back.json.meshes).toEqual(json.meshes);
    expect([...readAccessor(back.json, [back.bin], positions)]).toEqual([0, 0, 0, 1, 0, 0, 0, 2, 0]);
    expect([...readAccessor(back.json, [back.bin], indices)]).toEqual([0, 1, 2]);
  });

  it('records the bounds of every accessor, which the format requires for positions', () => {
    const builder = createGltfBuilder();
    const index = builder.addAccessor(new Float32Array([-1, 5, 2, 3, -4, 2]), 'VEC3');
    const { json } = builder.finish();
    expect(json.accessors[index]).toMatchObject({ count: 2, type: 'VEC3', componentType: FLOAT, min: [-1, -4, 2], max: [3, 5, 2] });
  });

  it('starts every view on a four-byte boundary and pads both chunks', () => {
    const builder = createGltfBuilder();
    builder.addAccessor(new Uint16Array([1, 2, 3]), 'SCALAR'); // 6 bytes
    builder.addAccessor(new Float32Array([1, 2, 3]), 'VEC3');
    const image = builder.addImage(new Uint8Array([1, 2, 3, 4, 5]), 'image/webp');
    const { json, bin } = builder.finish();
    json.bufferViews.forEach(view => expect(view.byteOffset % 4).toBe(0));
    expect(json.images[image]).toEqual({ bufferView: 2, mimeType: 'image/webp' });
    expect(json.buffers[0].byteLength).toBe(bin.byteLength);
    const glb = buildGlb(json, bin);
    expect(glb.byteLength % 4).toBe(0);
    expect(new DataView(glb.buffer).getUint32(8, true)).toBe(glb.byteLength);
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF');
  });

  it('rejects bytes that are not a GLB', () => {
    expect(() => parseGlb(new Uint8Array(40))).toThrow(/not a GLB/i);
  });

  it('pads small vertex elements out to four bytes, as the format requires, and reads them back', () => {
    const builder = createGltfBuilder();
    const positions = builder.addAccessor(new Int16Array([1, -2, 3, 32767, 0, -32767]), 'VEC3', { target: 34962, normalized: true });
    const normals = builder.addAccessor(new Int8Array([0, 127, 0, -127, 0, 0]), 'VEC3', { target: 34962, normalized: true });
    const { json, bin } = builder.finish();
    expect(json.bufferViews[json.accessors[positions].bufferView]).toMatchObject({ byteStride: 8, byteLength: 16 });
    expect(json.bufferViews[json.accessors[normals].bufferView]).toMatchObject({ byteStride: 4, byteLength: 8 });
    expect(json.accessors[positions]).toMatchObject({ count: 2, normalized: true, min: [1, -2, -32767], max: [32767, 0, 3] });
    expect([...readAccessor(json, [bin], positions)]).toEqual([1, -2, 3, 32767, 0, -32767]);
    expect([...readAccessor(json, [bin], normals)]).toEqual([0, 127, 0, -127, 0, 0]);
  });

  it('leaves elements that already fill whole words packed tight', () => {
    const builder = createGltfBuilder();
    const uvs = builder.addAccessor(new Uint16Array([0, 65535, 1, 2]), 'VEC2', { target: 34962, normalized: true });
    const { json } = builder.finish();
    expect(json.bufferViews[json.accessors[uvs].bufferView].byteStride).toBeUndefined();
  });
});
