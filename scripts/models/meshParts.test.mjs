import { describe, expect, it } from 'vitest';
import { bounds, compact, connectedComponents, describeComponents, isLongThin, keepTriangles, weldByPosition } from './meshParts.mjs';

/** A unit quad in the xy plane at (x, y, z) as two triangles with four vertices of its own. */
function quad(x, y, z = 0, size = 1) {
  return { positions: [x, y, z, x + size, y, z, x + size, y + size, z, x, y + size, z], indices: [0, 1, 2, 0, 2, 3] };
}
/** Joins meshes into one vertex and index list, as a merged export does. */
function merge(...meshes) {
  const positions = [], indices = [];
  for (const m of meshes) {
    const base = positions.length / 3;
    positions.push(...m.positions);
    indices.push(...m.indices.map(i => i + base));
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

describe('welding vertices by position', () => {
  it('gives coincident vertices one id and distinct vertices their own', () => {
    const weld = weldByPosition(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0]), 1e-4);
    expect(weld[0]).toBe(weld[2]);
    expect(weld[1]).toBe(weld[3]);
    expect(new Set(weld).size).toBe(3);
  });

  it('treats vertices closer than the tolerance as the same point', () => {
    const weld = weldByPosition(new Float32Array([0.5, 0.5, 0.5, 0.50001, 0.5, 0.5, 0.51, 0.5, 0.5]), 1e-3);
    expect(weld[0]).toBe(weld[1]);
    expect(weld[0]).not.toBe(weld[2]);
  });

  it('rejects a tolerance that cannot define a grid', () => {
    expect(() => weldByPosition(new Float32Array(3), 0)).toThrow(/tolerance/i);
  });
});

describe('splitting a mesh into connected parts', () => {
  it('finds parts that share no vertices', () => {
    const { positions, indices } = merge(quad(0, 0), quad(5, 0), quad(10, 0));
    const parts = connectedComponents(indices, weldByPosition(positions, 1e-4));
    expect(parts.count).toBe(3);
    expect([...parts.ofTriangle]).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('joins faces that meet at a seam where the vertices were duplicated', () => {
    // Two quads sharing the edge x = 1, each with its own copies of the edge's vertices,
    // which is how exporters split a surface at UV seams and hard edges.
    const { positions, indices } = merge(quad(0, 0), quad(1, 0));
    expect(connectedComponents(indices, weldByPosition(positions, 1e-4)).count).toBe(1);
    const unwelded = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    expect(connectedComponents(indices, unwelded).count).toBe(2);
  });

  it('numbers parts in the order their first triangle appears', () => {
    const { positions, indices } = merge(quad(9, 9), quad(0, 0), quad(10, 9));
    const parts = connectedComponents(indices, weldByPosition(positions, 1e-4));
    expect(parts.count).toBe(2);
    expect([...parts.ofTriangle]).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it('handles an empty mesh', () => {
    expect(connectedComponents(new Uint32Array(0), new Uint32Array(0)).count).toBe(0);
  });
});

describe('describing parts', () => {
  it('reports the triangle count and bounding box of each part', () => {
    const { positions, indices } = merge(quad(0, 0, 0, 2), quad(5, 1, 3));
    const parts = connectedComponents(indices, weldByPosition(positions, 1e-4));
    const [a, b] = describeComponents(positions, indices, parts);
    expect(a).toMatchObject({ triangles: 2, min: [0, 0, 0], max: [2, 2, 0], size: [2, 2, 0] });
    expect(b).toMatchObject({ triangles: 2, min: [5, 1, 3], max: [6, 2, 3], center: [5.5, 1.5, 3] });
  });

  it('measures the bounds of a whole mesh', () => {
    const { positions, indices } = merge(quad(-1, -2, 4), quad(3, 0, -1));
    expect(bounds(positions, indices)).toMatchObject({ min: [-1, -2, -1], max: [4, 1, 4] });
  });
});

describe('recognising a string', () => {
  const string = { size: [60, 0.1, 0.1] }, fingerboard = { size: [27, 4, 0.6] }, peg = { size: [1, 1, 3] };

  it('accepts a part that is long on the given axis and thin on the others', () => {
    expect(isLongThin(string, { axis: 0, minLength: 30, maxThickness: 0.5 })).toBe(true);
  });

  it('rejects parts that are short, or long but wide', () => {
    expect(isLongThin(peg, { axis: 0, minLength: 30, maxThickness: 0.5 })).toBe(false);
    expect(isLongThin(fingerboard, { axis: 0, minLength: 20, maxThickness: 0.5 })).toBe(false);
    expect(isLongThin(string, { axis: 1, minLength: 30, maxThickness: 0.5 })).toBe(false);
  });
});

describe('removing parts', () => {
  it('keeps only the chosen triangles and drops the vertices nothing uses any more', () => {
    const { positions, indices } = merge(quad(0, 0), quad(5, 0), quad(10, 0));
    const uvs = Float32Array.from({ length: (positions.length / 3) * 2 }, (_, i) => i);
    const parts = connectedComponents(indices, weldByPosition(positions, 1e-4));
    const kept = keepTriangles(indices, t => parts.ofTriangle[t] !== 1);
    expect(kept).toHaveLength(12);
    const out = compact(kept, [{ data: positions, size: 3 }, { data: uvs, size: 2 }]);
    expect(out.vertexCount).toBe(8);
    expect(Math.max(...out.indices)).toBe(7);
    const [p, uv] = out.attributes;
    // The third quad's vertices moved down to follow the first quad's, with their own data.
    expect([...p.slice(12, 15)]).toEqual([10, 0, 0]);
    expect([...uv.slice(8, 10)]).toEqual([16, 17]);
    expect(describeComponents(p, out.indices, connectedComponents(out.indices, weldByPosition(p, 1e-4)))).toHaveLength(2);
  });

  it('leaves the inputs untouched', () => {
    const { positions, indices } = merge(quad(0, 0), quad(5, 0));
    const before = [...indices];
    compact(keepTriangles(indices, t => t < 2), [{ data: positions, size: 3 }]);
    expect([...indices]).toEqual(before);
  });
});
