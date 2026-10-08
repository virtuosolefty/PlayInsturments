import { describe, expect, it } from 'vitest';
import { SHOWCASE_SIZE, showcaseTransform, wholePieces } from './showcase.mjs';

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
