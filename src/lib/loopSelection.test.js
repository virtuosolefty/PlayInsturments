import { describe, expect, it } from 'vitest';
import { loopLabel, moveLoopBoundary } from './loopSelection.js';

const score = { bpm: 120, timeSignature: [4, 4], duration: 15 };
describe('passage loop editing', () => {
  it('labels an end boundary as the preceding bar, including a partial final bar', () => {
    expect(loopLabel([4, 12], score)).toBe('Loop: bars 3–6');
    expect(loopLabel([14, 15], score)).toBe('Loop: bar 8');
  });
  it('snaps edits to bars without crossing boundaries', () => {
    expect(moveLoopBoundary([0, 8], 0, 3.6, score)).toEqual([4, 8]);
    expect(moveLoopBoundary([4, 8], 0, 14, score)).toEqual([6, 8]);
    expect(moveLoopBoundary([4, 8], 1, -10, score)).toEqual([4, 6]);
  });
  it('reaches the exact piece end and permits the final partial bar', () => {
    expect(moveLoopBoundary([4, 8], 1, 15, score)).toEqual([4, 15]);
    expect(moveLoopBoundary([14, 15], 1, 14, score)).toEqual([14, 15]);
    expect(moveLoopBoundary([0, 15], 0, 15, score)).toEqual([14, 15]);
  });
  it('handles a piece shorter than one bar', () => {
    expect(moveLoopBoundary([0, 1], 0, 20, { ...score, duration: 1 })).toEqual([0, 1]);
    expect(moveLoopBoundary([0, 1], 1, -20, { ...score, duration: 1 })).toEqual([0, 1]);
  });
});
