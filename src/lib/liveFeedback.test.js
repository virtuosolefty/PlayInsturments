import { describe, it, expect } from 'vitest';
import { liveFeedback } from './liveFeedback.js';
describe('live feedback distinguishes performance from piece completion', () => {
  it('does not penalize correct opening notes for future targets', () => {
    const view = liveFeedback({ total: 60, hit: 1, missed: 0, wrongNotes: 0 });
    expect(view.accuracy).toBe(1);
    expect(view.completion).toBeCloseTo(1 / 60);
  });
  it('counts misses and extra notes without increasing completion for extras', () => {
    const view = liveFeedback({ total: 10, hit: 4, missed: 2, wrongNotes: 2 });
    expect(view.accuracy).toBe(0.5);
    expect(view.completion).toBe(0.6);
  });
  it('never invents accuracy or timing before they have been measured', () => {
    expect(liveFeedback({ total: 60 }).accuracy).toBeNull();
    expect(liveFeedback({ hit: 10, total: 10, timingAccuracy: null }).timingMeasured).toBe(false);
    expect(liveFeedback({ hit: 1, total: 10, timingAccuracy: 1 }).timingMeasured).toBe(false);
  });
  it('keeps stored grading inputs untouched', () => {
    const summary = Object.freeze({ total: 60, hit: 1, noteAccuracy: 1 / 60, score: 1 / 60 });
    liveFeedback(summary);
    expect(summary.noteAccuracy).toBe(1 / 60);
  });
});
