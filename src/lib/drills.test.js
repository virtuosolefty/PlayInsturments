/**
 * Exercises generated from the trouble map.
 *
 * The properties that matter: the drill contains the bars you actually got
 * wrong, in the order they occur in the piece, with a run-up into each; and it
 * keeps its own identity so practising a drill never writes to the parent
 * piece's record.
 */

import { describe, expect, it } from 'vitest';
import { drillFrom, drillIdFor } from './drills.js';
import { barAt } from './passages.js';
import { noteName } from './theory.js';

// 60bpm, 4/4 → one bar is exactly 4 seconds, so bar N spans [4(N-1), 4N).
const makeScore = (bars = 8) => {
  const notes = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (let beat = 0; beat < 4; beat += 1) {
      notes.push({
        midi: 60 + bar, // one pitch per bar, so a note names the bar it came from
        time: bar * 4 + beat,
        duration: 0.9,
        velocity: 0.8,
        hand: 'right',
        id: bar * 4 + beat,
        name: noteName(60 + bar),
      });
    }
  }
  return {
    id: 'piece', title: 'Test Piece', source: 'midi', bpm: 60, timeSignature: [4, 4],
    key: { tonic: 0, mode: 'major', name: 'C major' },
    duration: bars * 4, notes, range: [60, 60 + bars - 1], noteCount: notes.length,
  };
};

const spot = (time, weight) => ({ time, weight, missed: 1, wrong: 0, late: 0 });
/** Which bars a drill drew from, read back off the pitches. */
const barsIn = (drill) => [...new Set(drill.notes.map((n) => n.midi - 60 + 1))].sort((a, b) => a - b);

describe('drillFrom', () => {
  const score = makeScore();

  it('returns nothing when there is no recorded trouble', () => {
    expect(drillFrom(score, [])).toBeNull();
  });

  it('returns nothing for a score with no notes', () => {
    expect(drillFrom({ ...score, notes: [] }, [spot(10, 5)])).toBeNull();
  });

  it('includes the troubled bar and the bar before it', () => {
    // 18s is inside bar 5; with one bar of run-up that is bars 4 and 5.
    const drill = drillFrom(score, [spot(18, 9)], { segments: 1, reps: 1 });
    expect(barsIn(drill)).toEqual([4, 5]);
  });

  it('takes the worst spots, not the first ones', () => {
    const drill = drillFrom(
      score,
      [spot(2, 1), spot(18, 9), spot(26, 8)],
      { segments: 2, reps: 1, approachBars: 0 },
    );
    // Bars 5 and 7 are the heavy ones; bar 1 is noise and must be dropped.
    expect(barsIn(drill)).toEqual([5, 7]);
  });

  it('orders passages as they occur in the piece, not by severity', () => {
    const drill = drillFrom(
      score,
      [spot(26, 9), spot(6, 8)],
      { segments: 2, reps: 1, approachBars: 0 },
    );
    const firstMidi = drill.notes[0].midi;
    expect(firstMidi).toBe(61); // bar 2 comes first even though bar 7 scored worse
  });

  it('plays each passage the requested number of times', () => {
    const once = drillFrom(score, [spot(18, 9)], { segments: 1, reps: 1, approachBars: 0 });
    const thrice = drillFrom(score, [spot(18, 9)], { segments: 1, reps: 3, approachBars: 0 });
    expect(thrice.notes).toHaveLength(once.notes.length * 3);
  });

  it('starts at zero and leaves a gap between passages', () => {
    const drill = drillFrom(
      score,
      [spot(2, 9), spot(26, 8)],
      { segments: 2, reps: 1, approachBars: 0, gapBars: 1 },
    );
    expect(drill.notes[0].time).toBe(0);
    // Bar 1 occupies 0–4s; with a bar of silence the next passage starts at 8s.
    const second = drill.notes.find((n) => n.midi === 66);
    expect(second.time).toBe(8);
  });

  it('merges trouble in adjacent bars into one passage rather than two', () => {
    const drill = drillFrom(
      score,
      [spot(18, 9), spot(22, 8)],
      { segments: 2, reps: 1, approachBars: 0, gapBars: 1 },
    );
    // Bars 5 and 6 run straight on: no silence inserted between them.
    expect(barsIn(drill)).toEqual([5, 6]);
    expect(drill.duration).toBeLessThan(9);
  });

  it('does not run off the front of the piece', () => {
    const drill = drillFrom(score, [spot(1, 9)], { segments: 1, reps: 1, approachBars: 2 });
    expect(drill.notes[0].time).toBe(0);
    expect(barsIn(drill)).toEqual([1]);
  });

  it('collapses several spots inside one bar into a single passage', () => {
    const drill = drillFrom(
      score,
      [spot(16, 3), spot(17, 3), spot(18, 3)],
      { segments: 3, reps: 1, approachBars: 0 },
    );
    expect(barsIn(drill)).toEqual([5]);
  });

  it('keeps its own identity so it never writes to the piece it came from', () => {
    const drill = drillFrom(score, [spot(18, 9)]);
    expect(drill.id).toBe(drillIdFor('piece'));
    expect(drill.id).not.toBe(score.id);
    expect(drill.drillOf).toEqual({ id: 'piece', title: 'Test Piece' });
  });

  it('says which bars it drew from', () => {
    const drill = drillFrom(score, [spot(18, 9)], { segments: 1, reps: 2, approachBars: 1 });
    expect(drill.title).toBe('Trouble spots — Test Piece');
    expect(drill.composer).toMatch(/4–5/);
    expect(drill.composer).toMatch(/2×/);
  });

  it('recomputes duration and note ids for the new arrangement', () => {
    const drill = drillFrom(score, [spot(18, 9)], { segments: 1, reps: 2, approachBars: 0 });
    expect(drill.notes.map((n) => n.id)).toEqual(drill.notes.map((_, i) => i));
    expect(drill.duration).toBeGreaterThan(0);
    expect(drill.noteCount).toBe(drill.notes.length);
  });
});

describe('bar numbering respects the time signature', () => {
  // Every generated file has its header time signature cleared, so these used
  // to come back as 4/4 and every bar number in the report and the drills was
  // wrong for anything in 3/4, 6/8 or 2/4.
  const waltz = { bpm: 60, timeSignature: [3, 4], duration: 24 };
  const march = { bpm: 60, timeSignature: [2, 4], duration: 24 };

  it('counts three beats to a bar in 3/4', () => {
    expect(barAt(0, waltz)).toBe(1);
    expect(barAt(2.9, waltz)).toBe(1);
    expect(barAt(3, waltz)).toBe(2);
  });

  it('counts two beats to a bar in 2/4', () => {
    expect(barAt(1.9, march)).toBe(1);
    expect(barAt(2, march)).toBe(2);
  });
});
