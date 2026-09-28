/**
 * Velocity scoring and the wrong-note breakdown — the parts of a run report
 * that answer "was my touch right?" and "which notes did I get wrong?".
 */

import { describe, expect, it } from 'vitest';
import { classifyDynamics, DYNAMICS, PracticeSession } from './matcher.js';
import { gradeRun } from './grading.js';
import { MODES, referencePlaybackFor } from '../hooks/usePracticeEngine.js';
import { noteName } from './theory.js';

const makeScore = (notes) => ({
  id: 'test',
  title: 'Test',
  bpm: 60,
  timeSignature: [4, 4],
  key: { tonic: 0, mode: 'major', name: 'C major' },
  duration: Math.max(...notes.map((n) => n.time + n.duration)),
  notes: notes.map((n, i) => ({ velocity: 0.8, hand: 'right', ...n, id: i, name: noteName(n.midi) })),
});

const scale = makeScore([
  { midi: 60, time: 0, duration: 0.5 },
  { midi: 62, time: 1, duration: 0.5 },
  { midi: 64, time: 2, duration: 0.5 },
  { midi: 65, time: 3, duration: 0.5 },
]);

describe('classifyDynamics', () => {
  it('calls a touch inside the window even', () => {
    expect(classifyDynamics(0)).toBe(DYNAMICS.EVEN);
    expect(classifyDynamics(0.2)).toBe(DYNAMICS.EVEN);
    expect(classifyDynamics(-0.2)).toBe(DYNAMICS.EVEN);
  });

  it('flags a hard strike and a weak one', () => {
    expect(classifyDynamics(0.4)).toBe(DYNAMICS.LOUD);
    expect(classifyDynamics(-0.4)).toBe(DYNAMICS.SOFT);
  });

  it('respects a custom window', () => {
    expect(classifyDynamics(0.15, 0.1)).toBe(DYNAMICS.LOUD);
    expect(classifyDynamics(0.15, 0.5)).toBe(DYNAMICS.EVEN);
  });
});

describe('velocity scoring', () => {
  it('records how far each hit sat from the written velocity', () => {
    const s = new PracticeSession(scale);
    const e = s.noteOn(60, 0, 0.5); // written 0.8
    expect(e.targetVelocity).toBe(0.8);
    expect(e.velocityDelta).toBeCloseTo(-0.3, 5);
    expect(e.dynamics).toBe(DYNAMICS.SOFT);
    expect(e.detail).toMatch(/softer than written/);
  });

  it('says nothing about touch when it is close enough', () => {
    const s = new PracticeSession(scale);
    const e = s.noteOn(60, 0, 0.75);
    expect(e.dynamics).toBe(DYNAMICS.EVEN);
    expect(e.detail).not.toMatch(/than written/);
  });

  it('scores a run played at the written level as fully even', () => {
    const s = new PracticeSession(scale);
    for (const note of scale.notes) s.noteOn(note.midi, note.time, 0.8);
    const summary = s.summary;
    expect(summary.dynamicsAccuracy).toBe(1);
    expect(summary.tooLoud).toBe(0);
    expect(summary.tooSoft).toBe(0);
    expect(summary.velocitySpread).toBe(0);
    expect(summary.meanVelocityDelta).toBe(0);
  });

  it('counts hard and weak notes separately', () => {
    const s = new PracticeSession(scale);
    s.noteOn(60, 0, 1.0); // +0.2, inside the window
    s.noteOn(62, 1, 0.2); // -0.6, too soft
    s.noteOn(64, 2, 0.15); // -0.65, too soft
    s.noteOn(65, 3, 0.8);
    const summary = s.summary;
    expect(summary.tooSoft).toBe(2);
    expect(summary.tooLoud).toBe(0);
    expect(summary.dynamicsAccuracy).toBeCloseTo(0.5, 5);
    expect(summary.meanVelocityDelta).toBeLessThan(0);
  });

  it('reports an uneven touch as a wider spread than an even one', () => {
    const even = new PracticeSession(scale);
    for (const note of scale.notes) even.noteOn(note.midi, note.time, 0.7);

    const lumpy = new PracticeSession(scale);
    const touches = [0.25, 0.95, 0.3, 1.0];
    scale.notes.forEach((note, i) => lumpy.noteOn(note.midi, note.time, touches[i]));

    expect(lumpy.summary.velocitySpread).toBeGreaterThan(even.summary.velocitySpread);
  });

  it('leaves dynamics at zero when nothing has been played', () => {
    const summary = new PracticeSession(scale).summary;
    expect(summary.dynamicsAccuracy).toBe(0);
    expect(summary.velocitySpread).toBe(0);
  });
});

describe('accompaniment', () => {
  const withBacking = {
    ...scale,
    notes: [
      ...scale.notes,
      { midi: 36, time: 0, duration: 4, velocity: 0.6, hand: 'left', id: 99, name: 'C2', accompaniment: true },
    ],
  };

  it('is never something you can hit or miss', () => {
    const s = new PracticeSession(withBacking);
    expect(s.targets).toHaveLength(scale.notes.length);
    expect(s.targets.some((t) => t.accompaniment)).toBe(false);
    expect(s.summary.total).toBe(scale.notes.length);
  });

  it('is not counted missed when the run ends', () => {
    const s = new PracticeSession(withBacking);
    for (const n of scale.notes) s.noteOn(n.midi, n.time);
    s.advanceTo(10);
    expect(s.summary.missed).toBe(0);
    expect(s.summary.noteAccuracy).toBe(1);
  });

  it('still counts as harmony when judging what you played over it', () => {
    const s = new PracticeSession(withBacking);
    // E2 against a sounding C2: a chord tone, not an out-of-key clang.
    const event = s.noteOn(40, 0.5);
    expect(event.type).toBe('wrong');
    expect(event.expected).toContain(36);
  });
});

describe('wrong-note breakdown', () => {
  it('names every unwanted pitch and how often it came up', () => {
    const s = new PracticeSession(scale);
    s.noteOn(61, 0.5); // C#4
    s.noteOn(61, 0.6);
    s.noteOn(66, 1.5); // F#4
    const summary = s.summary;
    expect(summary.wrongNotes).toBe(3);
    expect(summary.wrongNoteNames).toEqual({ 'C#4': 2, 'F#4': 1 });
  });

  it('is empty on a clean run', () => {
    const s = new PracticeSession(scale);
    for (const note of scale.notes) s.noteOn(note.midi, note.time);
    expect(s.summary.wrongNoteNames).toEqual({});
  });
});

describe('reference playback', () => {
  it('always sounds in listen mode', () => {
    expect(referencePlaybackFor({ mode: MODES.LISTEN, referenceAudio: false })).toBe(true);
  });

  it('never sounds in wait mode, whatever the toggle says', () => {
    expect(referencePlaybackFor({ mode: MODES.WAIT, referenceAudio: true })).toBe(false);
  });

  it('follows the toggle in practice mode', () => {
    expect(referencePlaybackFor({ mode: MODES.PRACTICE, referenceAudio: true })).toBe(true);
    expect(referencePlaybackFor({ mode: MODES.PRACTICE, referenceAudio: false })).toBe(false);
  });
});

describe('what the grade is allowed to claim', () => {
  const scale4 = makeScore([
    { midi: 60, time: 0, duration: 0.5 },
    { midi: 62, time: 1, duration: 0.5 },
    { midi: 64, time: 2, duration: 0.5 },
    { midi: 65, time: 3, duration: 0.5 },
  ]);

  it('reports timing as unmeasured in wait mode, not perfect', () => {
    // The clock stops for you, so nothing about timing was observed. Calling
    // that 100% handed every wait-mode run nearly a third of the grade free.
    const s = new PracticeSession(scale4, { mode: 'wait' });
    for (const n of scale4.notes) s.noteOn(n.midi, 0, 0.8);
    expect(s.summary.timingAccuracy).toBeNull();
    expect(gradeRun(s.summary, { coverage: 1 }).bands.timing).toBeNull();
  });

  it('still measures timing in the normal mode', () => {
    const s = new PracticeSession(scale4);
    for (const n of scale4.notes) s.noteOn(n.midi, n.time, 0.8);
    expect(s.summary.timingAccuracy).toBe(1);
  });

  it('does not let wait mode out-score a timed run of the same playing', () => {
    const wait = new PracticeSession(scale4, { mode: 'wait' });
    for (const n of scale4.notes) wait.noteOn(n.midi, 0, 0.8);
    const timed = new PracticeSession(scale4);
    for (const n of scale4.notes) timed.noteOn(n.midi, n.time, 0.8);
    expect(gradeRun(wait.summary, { coverage: 1 }).overall).toBeLessThanOrEqual(
      gradeRun(timed.summary, { coverage: 1 }).overall,
    );
  });
});

describe('a fractionally late note', () => {
  const one = makeScore([{ midi: 60, time: 1, duration: 0.5 }]);

  it('is claimed rather than counted wrong and then missed', () => {
    // 380ms late: past the old match window, but the target is not swept until
    // 400ms — so it used to score a wrong note *and* a missed one.
    const s = new PracticeSession(one);
    const event = s.noteOn(60, 1.38);
    expect(event.type).toBe('timing');
    s.advanceTo(3);
    expect(s.summary.wrongNotes).toBe(0);
    expect(s.summary.missed).toBe(0);
    expect(s.summary.hit).toBe(1);
  });

  it('is still wrong once the target has genuinely gone', () => {
    const s = new PracticeSession(one);
    expect(s.noteOn(60, 1.9).type).toBe('wrong');
  });

  it('has not widened the early side', () => {
    const s = new PracticeSession(one);
    expect(s.noteOn(60, 0.55).type).toBe('wrong');
  });
});

describe('a repeated pitch', () => {
  const repeated = makeScore([
    { midi: 60, time: 1, duration: 0.25 },
    { midi: 60, time: 1.3, duration: 0.25 },
  ]);

  it('pairs presses with targets in order, not by whichever is nearest', () => {
    // 1.2s is nearer the second C than the first. Taking the nearest claimed
    // the second, orphaned the first into a miss, and left every later press
    // one note behind the score.
    const s = new PracticeSession(repeated);
    expect(s.noteOn(60, 1.2).targetTime).toBe(1);
    expect(s.noteOn(60, 1.45).targetTime).toBe(1.3);
    s.advanceTo(4);
    const { hit, missed, wrongNotes } = s.summary;
    expect({ hit, missed, wrongNotes }).toEqual({ hit: 2, missed: 0, wrongNotes: 0 });
  });

  it('skips a target that is already claimed rather than stalling on it', () => {
    const s = new PracticeSession(repeated);
    expect(s.noteOn(60, 1.02).targetTime).toBe(1);
    expect(s.noteOn(60, 1.28).targetTime).toBe(1.3);
  });

  it('does not reach back past the miss window for a stale target', () => {
    // The first C was genuinely skipped; a press near the second belongs to
    // the second, not to a note that is already gone.
    const s = new PracticeSession(repeated);
    s.advanceTo(1.5);
    expect(s.noteOn(60, 1.3).targetTime).toBe(1.3);
  });
});
