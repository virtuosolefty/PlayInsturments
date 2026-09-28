/**
 * Grading, passage grouping, coaching and latency — the machinery behind the
 * end-of-run report. The property that matters most is that the rating cannot
 * be gamed: an abandoned run must not out-score a finished one.
 */

import { describe, expect, it } from 'vitest';
import { compareToBest, gradeRun, MIN_COVERAGE, minHitsForDetail, weakestBand } from './grading.js';
import { barAt, groupProblems } from './passages.js';
import { nextStep, STEPS, suggestNext } from './coaching.js';
import { measureOffset, median, offsetToNearestBeat } from './latency.js';
import { NOTE_STATUS } from './matcher.js';
import { variantOf, FIT_MODES, HAND_FILTERS } from './arrange.js';

const perfect = {
  total: 20, hit: 20, missed: 0, wrongNotes: 0, score: 1,
  noteAccuracy: 1, timingAccuracy: 1, dynamicsAccuracy: 1, velocitySpread: 0,
  meanAbsDeviationMs: 0,
};

const summaryOf = (over = {}) => ({ ...perfect, ...over });

describe('gradeRun', () => {
  it('gives five stars to a flawless complete run', () => {
    const g = gradeRun(summaryOf(), { coverage: 1 });
    expect(g.complete).toBe(true);
    expect(g.stars).toBe(5);
    expect(g.overall).toBe(100);
  });

  it('weights wrong notes hardest', () => {
    const sloppyNotes = gradeRun(summaryOf({ score: 0.5, noteAccuracy: 0.5 }), { coverage: 1 });
    const sloppyTiming = gradeRun(summaryOf({ timingAccuracy: 0.5 }), { coverage: 1 });
    expect(sloppyNotes.overall).toBeLessThan(sloppyTiming.overall);
    expect(sloppyNotes.weakest).toBe('notes');
  });

  it('lands on each star band at its boundary', () => {
    const at = (overall) =>
      gradeRun(summaryOf({ score: overall / 100, timingAccuracy: overall / 100, dynamicsAccuracy: overall / 100,
        velocitySpread: (1 - overall / 100) * 0.35 }), { coverage: 1 }).stars;
    expect(at(100)).toBe(5);
    expect(at(90)).toBe(4);
    expect(at(75)).toBe(3);
    expect(at(55)).toBe(2);
    expect(at(20)).toBe(1);
  });

  it('withholds stars from an abandoned run', () => {
    const g = gradeRun(summaryOf(), { coverage: 0.2 });
    expect(g.complete).toBe(false);
    expect(g.stars).toBe(0);
    expect(g.headline).toBe('Incomplete run');
    expect(g.blurb).toMatch(/20%/);
  });

  it('cannot be gamed by quitting early on a perfect start', () => {
    const quit = gradeRun(summaryOf(), { coverage: 0.3 });
    const finished = gradeRun(summaryOf({ score: 0.6, noteAccuracy: 0.6 }), { coverage: 1 });
    expect(quit.stars).toBe(0);
    expect(finished.stars).toBeGreaterThan(0);
  });

  it('grades a run that only just reaches the coverage floor', () => {
    expect(gradeRun(summaryOf(), { coverage: MIN_COVERAGE }).complete).toBe(true);
    expect(gradeRun(summaryOf(), { coverage: MIN_COVERAGE - 0.01 }).complete).toBe(false);
  });

  it('refuses to grade a run where nothing was played', () => {
    const g = gradeRun(summaryOf({ hit: 0, wrongNotes: 0, score: 0, noteAccuracy: 0 }), { coverage: 1 });
    expect(g.complete).toBe(false);
    expect(g.blurb).toMatch(/Nothing was played/);
  });

  it('does not tell a player who hit nothing right that they played nothing', () => {
    // Six keys pressed, none of them the written ones. Saying "nothing was
    // played" to that reads as the app not having heard them at all.
    const g = gradeRun(summaryOf({ hit: 0, wrongNotes: 6, score: 0, noteAccuracy: 0 }), { coverage: 0.3 });
    expect(g.complete).toBe(false);
    expect(g.blurb).not.toMatch(/Nothing was played/);
    expect(g.blurb).toMatch(/6 notes played/);
  });

  it('rewards an even touch below the written level over a lumpy one', () => {
    const even = gradeRun(summaryOf({ dynamicsAccuracy: 0, velocitySpread: 0 }), { coverage: 1 });
    const lumpy = gradeRun(summaryOf({ dynamicsAccuracy: 0, velocitySpread: 0.35 }), { coverage: 1 });
    expect(even.bands.dynamics).toBeGreaterThan(lumpy.bands.dynamics);
  });
});

describe('weakestBand', () => {
  it('names the lowest of the three', () => {
    expect(weakestBand({ notes: 90, timing: 40, dynamics: 70 })).toBe('timing');
  });

  it('ignores bands that were never measured', () => {
    expect(weakestBand({ notes: 30, timing: null, dynamics: null })).toBe('notes');
  });
});

describe('too few notes to judge touch or timing', () => {
  // Two lucky notes struck at the written velocity used to read as "100%
  // dynamics" and drag a collapsed run up towards a pass.
  const barelyPlayed = summaryOf({
    total: 47, hit: 2, missed: 45, wrongNotes: 1,
    score: 0.03, noteAccuracy: 0.04, timingAccuracy: 0, dynamicsAccuracy: 1, velocitySpread: 0,
  });

  it('scales the floor to the length of the piece', () => {
    expect(minHitsForDetail(60)).toBe(8);
    expect(minHitsForDetail(6)).toBe(3);
    expect(minHitsForDetail(1)).toBe(1);
  });

  it('reports timing and dynamics as unmeasured', () => {
    const g = gradeRun(barelyPlayed, { coverage: 1 });
    expect(g.bands.timing).toBeNull();
    expect(g.bands.dynamics).toBeNull();
    expect(g.bands.notes).toBeGreaterThan(0);
  });

  it('does not let an unmeasured band inflate the score', () => {
    const g = gradeRun(barelyPlayed, { coverage: 1 });
    // Notes alone: a run this bad must not score anywhere near a pass.
    expect(g.overall).toBeLessThan(10);
    expect(g.stars).toBe(1);
  });

  it('blames the notes rather than claiming they were fine', () => {
    expect(gradeRun(barelyPlayed, { coverage: 1 }).blurb).toMatch(/notes themselves/);
  });

  it('measures both again once enough notes land', () => {
    const g = gradeRun(summaryOf({ total: 47, hit: 20, score: 0.42, timingAccuracy: 0.5 }), { coverage: 1 });
    expect(g.bands.timing).toBe(50);
    expect(g.bands.dynamics).not.toBeNull();
  });
});

describe('compareToBest', () => {
  it('calls a first run a best', () => {
    expect(compareToBest(70, [])).toEqual({ delta: 0, isBest: true, previousBest: null });
  });

  it('reports the gap to a previous best', () => {
    const c = compareToBest(70, [{ overall: 80 }, { overall: 60 }]);
    expect(c.isBest).toBe(false);
    expect(c.delta).toBe(-10);
    expect(c.previousBest).toBe(80);
  });

  it('ignores ungraded runs when finding the best', () => {
    expect(compareToBest(50, [{ overall: null }, { overall: 40 }]).previousBest).toBe(40);
  });
});

/* ------------------------------------------------------------------ passages */

const score = { bpm: 60, timeSignature: [4, 4], duration: 32 }; // 4s per bar

function sessionWith({ targets = [], events = [] }) {
  return { targets, events, options: { perfectWindow: 0.09 } };
}

const missedAt = (time, name) => ({ time, name, status: NOTE_STATUS.MISSED });

describe('passage grouping', () => {
  it('counts bars from one, the way a musician would', () => {
    expect(barAt(0, score)).toBe(1);
    expect(barAt(3.9, score)).toBe(1);
    expect(barAt(4, score)).toBe(2);
  });

  it('merges consecutive troubled bars into one passage', () => {
    const s = sessionWith({
      targets: [missedAt(4.5, 'E4'), missedAt(5.5, 'F4'), missedAt(8.5, 'G4')],
    });
    const [passage] = groupProblems(s, score);
    expect(passage.fromBar).toBe(2);
    expect(passage.toBar).toBe(3);
    expect(passage.label).toBe('Bars 2–3');
    expect(passage.names).toEqual(['E4', 'F4', 'G4']);
  });

  it('keeps non-adjacent bars as separate passages', () => {
    const s = sessionWith({ targets: [missedAt(0.5, 'C4'), missedAt(20.5, 'A4')] });
    const passages = groupProblems(s, score);
    expect(passages).toHaveLength(2);
    expect(passages.map((p) => p.label)).toEqual(['Bar 1', 'Bar 6']);
  });

  it('ranks the worst stretch first', () => {
    const s = sessionWith({
      targets: [missedAt(0.5, 'C4'), missedAt(20.5, 'A4'), missedAt(21, 'B4'), missedAt(21.5, 'C5')],
    });
    expect(groupProblems(s, score)[0].label).toBe('Bar 6');
  });

  it('describes what went wrong, not just where', () => {
    const s = sessionWith({
      targets: [missedAt(0.5, 'C4')],
      events: [{ type: 'wrong', songTime: 0.7, name: 'C#4' }],
    });
    const [passage] = groupProblems(s, score);
    expect(passage.detail).toMatch(/1 missed/);
    expect(passage.detail).toMatch(/1 wrong/);
    expect(passage.detail).toMatch(/C4/);
  });

  it('counts a badly-timed hit as trouble', () => {
    const s = sessionWith({
      targets: [{ time: 0.5, name: 'C4', status: NOTE_STATUS.HIT, deltaMs: 300 }],
    });
    expect(groupProblems(s, score)[0].late).toBe(1);
  });

  it('ignores a hit that was on time', () => {
    const s = sessionWith({
      targets: [{ time: 0.5, name: 'C4', status: NOTE_STATUS.HIT, deltaMs: 20 }],
    });
    expect(groupProblems(s, score)).toEqual([]);
  });

  it('returns nothing for a clean run', () => {
    expect(groupProblems(sessionWith({}), score)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ coaching */

const gradeStub = (stars, complete = true) => ({ stars, complete });
const passage = { label: 'Bars 5–6', fromTime: 16, toTime: 24 };

describe('nextStep', () => {
  it('asks for a full run when the last one was abandoned', () => {
    expect(nextStep({ grade: gradeStub(0, false), passages: [passage] }).kind).toBe(STEPS.FINISH);
  });

  it('sends a struggling player to drill the worst passage slowly', () => {
    const step = nextStep({ grade: gradeStub(2), passages: [passage] });
    expect(step.kind).toBe(STEPS.DRILL);
    expect(step.passage).toBe(passage);
    expect(step.rate).toBeLessThan(1);
  });

  it('asks for another pass when the run was nearly there', () => {
    expect(nextStep({ grade: gradeStub(4), passages: [passage] }).kind).toBe(STEPS.REPEAT);
  });

  it('pushes the tempo up once a slow run is mastered', () => {
    const step = nextStep({ grade: gradeStub(5), passages: [], rate: 0.7 });
    expect(step.kind).toBe(STEPS.FASTER);
    expect(step.rate).toBe(.8);
  });

  it('moves on once the piece is mastered at full speed', () => {
    const step = nextStep({ grade: gradeStub(5), passages: [], rate: 1, nextSong: { title: 'Ode to Joy' } });
    expect(step.kind).toBe(STEPS.NEXT);
    expect(step.label).toMatch(/Ode to Joy/);
  });
});

describe('suggestNext', () => {
  const library = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('points at the first piece not yet three-starred', () => {
    expect(suggestNext(library, { a: 5, b: 1 }, null).id).toBe('b');
  });

  it('never suggests the piece already open', () => {
    expect(suggestNext(library, { a: 5 }, 'b').id).toBe('c');
  });
});

/* ------------------------------------------------------------------- latency */

describe('latency measurement', () => {
  it('takes the middle value', () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBe(0);
  });

  it('measures a tap against whichever click it was aiming at', () => {
    expect(offsetToNearestBeat(1040, [1000, 1600, 2200])).toBe(40);
    expect(offsetToNearestBeat(1580, [1000, 1600, 2200])).toBe(-20);
  });

  it('reads a consistent lag as the system offset', () => {
    const beats = [0, 600, 1200, 1800, 2400, 3000];
    const taps = beats.map((b) => b + 45);
    const result = measureOffset(taps, beats);
    expect(result.usable).toBe(true);
    expect(result.offsetMs).toBe(45);
  });

  it('is not dragged off by a single fumbled tap', () => {
    const beats = [0, 600, 1200, 1800, 2400, 3000];
    const taps = [40, 645, 1240, 1845, 2440, 3000 + 5000]; // last one missed entirely
    const result = measureOffset(taps, beats);
    expect(result.offsetMs).toBeGreaterThan(35);
    expect(result.offsetMs).toBeLessThan(50);
    expect(result.taps).toBe(5);
  });

  it('refuses to guess from too few taps', () => {
    const result = measureOffset([10, 20], [0, 600, 1200]);
    expect(result.usable).toBe(false);
    expect(result.reason).toMatch(/clean tap/);
  });

  it('refuses to guess when the taps were all over the place', () => {
    const beats = [0, 600, 1200, 1800, 2400, 3000];
    const taps = [0, 600 + 150, 1200 - 140, 1800 + 160, 2400 - 130, 3000 + 145];
    expect(measureOffset(taps, beats).usable).toBe(false);
  });
});

/* ------------------------------------------------------------------- variant */

describe('arrangement variant', () => {
  it('calls an unarranged score full', () => {
    expect(variantOf({ fit: FIT_MODES.OFF, hands: HAND_FILTERS.BOTH, window: [48, 72] })).toBe('full');
  });

  it('separates a folded 25-key run from a full one', () => {
    const folded = variantOf({ fit: FIT_MODES.FOLD, hands: HAND_FILTERS.BOTH, window: [48, 72] });
    expect(folded).toBe('fold:25:both');
    expect(folded).not.toBe('full');
  });

  it('separates one hand from two', () => {
    const both = variantOf({ fit: FIT_MODES.FOLD, hands: HAND_FILTERS.BOTH, window: [48, 72] });
    const right = variantOf({ fit: FIT_MODES.FOLD, hands: HAND_FILTERS.RIGHT, window: [48, 72] });
    expect(right).not.toBe(both);
  });

  it('separates keyboards of different sizes', () => {
    const mini = variantOf({ fit: FIT_MODES.FOLD, hands: HAND_FILTERS.BOTH, window: [48, 72] });
    const big = variantOf({ fit: FIT_MODES.FOLD, hands: HAND_FILTERS.BOTH, window: [36, 96] });
    expect(mini).not.toBe(big);
  });
});
