import { describe, it, expect } from 'vitest';
import { labelWidth, spreadLabels } from './drumLabels.js';

const overlap = (a, b, height = 18) => Math.abs(a.y - b.y) < height && Math.abs(a.x - b.x) < (a.width + b.width) / 2;

describe('labelWidth', () => {
  it('grows with the name', () => {
    expect(labelWidth('Floor tom')).toBeGreaterThan(labelWidth('Kick'));
  });

  it('adds room for each key badge', () => {
    expect(labelWidth('Hi-hat', 2)).toBeGreaterThan(labelWidth('Hi-hat', 1));
    expect(labelWidth('Hi-hat', 1)).toBeGreaterThan(labelWidth('Hi-hat', 0));
  });
});

describe('spreadLabels', () => {
  it('leaves names alone when none overlap', () => {
    const labels = [{ id: 'a', x: 40, y: 20, width: 50 }, { id: 'b', x: 200, y: 20, width: 50 }, { id: 'c', x: 40, y: 80, width: 50 }];
    expect(spreadLabels(labels)).toEqual(labels);
  });

  it('pushes two names on the same line apart, each by the same amount', () => {
    const [a, b] = spreadLabels([{ id: 'high', x: 100, y: 50, width: 60 }, { id: 'mid', x: 130, y: 52, width: 60 }], { gap: 4 });
    expect(b.x - a.x).toBeCloseTo(64);
    expect((a.x + b.x) / 2).toBeCloseTo(115);
    expect(a.y).toBe(50);
    expect(b.y).toBe(52);
  });

  it('keeps each name on the side it started', () => {
    const [left, right] = spreadLabels([{ id: 'right', x: 130, y: 50, width: 60 }, { id: 'left', x: 100, y: 50, width: 60 }]).sort((a, b) => a.x - b.x);
    expect(left.id).toBe('left');
    expect(right.id).toBe('right');
  });

  it('ignores names on different lines', () => {
    const labels = [{ id: 'a', x: 100, y: 20, width: 60 }, { id: 'b', x: 105, y: 60, width: 60 }];
    expect(spreadLabels(labels)).toEqual(labels);
  });

  it('settles a row of three', () => {
    const placed = spreadLabels([{ id: 'a', x: 100, y: 50, width: 50 }, { id: 'b', x: 120, y: 50, width: 50 }, { id: 'c', x: 140, y: 50, width: 50 }]);
    for (let i = 0; i < placed.length; i += 1) for (let j = i + 1; j < placed.length; j += 1) expect(overlap(placed[i], placed[j]), `${placed[i].id}/${placed[j].id}`).toBe(false);
  });

  it('does not change the list it was given', () => {
    const labels = Object.freeze([Object.freeze({ id: 'a', x: 100, y: 50, width: 60 }), Object.freeze({ id: 'b', x: 110, y: 50, width: 60 })]);
    const placed = spreadLabels(labels);
    expect(placed).not.toBe(labels);
    expect(labels[0].x).toBe(100);
    expect(placed[0].x).not.toBe(100);
  });

  it('copes with an empty kit', () => {
    expect(spreadLabels([])).toEqual([]);
  });
});
