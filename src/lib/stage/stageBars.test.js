import { describe, expect, it } from 'vitest';
import { barEdges, clearOfBars, stringBandOf } from './stageBars.js';

/** A stand-in for the stage element: a 400 px tall stage at the top of the page with the given bars. */
function stageWith({ top, bottom, height = 400 }) {
  const box = (y, h) => ({ top: y, bottom: y + h, height: h });
  const bars = { '.guitar-stage-top': top && box(0, top), '.guitar-stage-bottom': bottom && box(height - bottom, bottom) };
  return {
    getBoundingClientRect: () => box(0, height),
    querySelector: selector => (bars[selector] ? { getBoundingClientRect: () => bars[selector] } : null),
  };
}

describe('the room the stage bars leave', () => {
  it('measures where the top bar ends and the bottom bar begins', () => {
    expect(barEdges(stageWith({ top: 50, bottom: 40 }))).toEqual({ height: 400, top: 50, bottom: 360 });
  });

  it('counts a missing or hidden bar as no bar', () => {
    expect(barEdges(stageWith({}))).toEqual({ height: 400, top: 0, bottom: 400 });
  });

  it('has nothing to say about a stage with no size', () => {
    expect(barEdges(stageWith({ height: 0 }))).toBeNull();
    expect(clearOfBars(null)).toBeUndefined();
    expect(stringBandOf(null)).toBeNull();
  });

  it('turns the band into screen units, top at 1 and bottom at -1', () => {
    expect(clearOfBars({ height: 400, top: 0, bottom: 400 })).toEqual({ x: 1, top: 1, bottom: -1 });
    expect(clearOfBars({ height: 400, top: 100, bottom: 300 })).toEqual({ x: 1, top: 0.5, bottom: -0.5 });
  });

  it('keeps string names a little inside the bars', () => {
    expect(stringBandOf({ height: 400, top: 50, bottom: 360 })).toEqual({ top: 52, bottom: 358 });
  });
});
