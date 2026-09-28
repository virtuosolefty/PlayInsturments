/**
 * The layout of the practice view.
 *
 * The first describe block is the important one. Everything this app claims
 * about being learnable rests on screen distance to the hit line being linear
 * in time, and that property is easy to lose by accident — an eased mapping, a
 * log scale, or a perspective camera downstream would each break it while every
 * other test in the suite carried on passing.
 */

import { describe, expect, it } from 'vitest';
import { buildKeyboardGeometry } from './keyboard.js';
import {
  APPROACH_SEC,
  approachOf,
  gridLines,
  lanesFrom,
  noteVisible,
  PAST_RATIO,
  rollLayout,
  timeWindow,
} from './rollGeometry.js';

const layout = rollLayout(800, 500);
const at = (now, pps = 180) => timeWindow(layout, now, pps);

describe('time on screen is linear in distance', () => {
  it('gives equal time the same distance wherever it sits', () => {
    // The whole pedagogy in one assertion: a second near the top of the screen
    // must measure the same as a second near the hit line, or "when does this
    // arrive" stops being readable as a distance.
    const { yFor } = at(0);
    const nearLine = yFor(0.5) - yFor(1.5);
    const farAway = yFor(3.5) - yFor(4.5);
    expect(nearLine).toBeCloseTo(farAway, 9);
  });

  it('scales exactly with the zoom', () => {
    expect(at(0, 90).yFor(0) - at(0, 90).yFor(1)).toBeCloseTo(90, 9);
    expect(at(0, 180).yFor(0) - at(0, 180).yFor(1)).toBeCloseTo(180, 9);
  });

  it('puts the note under the playhead exactly on the hit line', () => {
    expect(at(4.2).yFor(4.2)).toBe(layout.hitLine);
  });

  it('puts the future above the line and the past below it', () => {
    const { yFor } = at(2);
    expect(yFor(3)).toBeLessThan(layout.hitLine);
    expect(yFor(1)).toBeGreaterThan(layout.hitLine);
  });
});

describe('the visible window', () => {
  it('reaches from the top edge to the keyboard', () => {
    const { yFor, tTop, tBottom } = at(10);
    expect(yFor(tTop)).toBeCloseTo(0, 6);
    expect(yFor(tBottom)).toBeCloseTo(layout.rollH, 6);
  });

  it('shows less music when you zoom in', () => {
    const wide = at(0, 90);
    const close = at(0, 360);
    expect(wide.tTop - wide.tBottom).toBeGreaterThan(close.tTop - close.tBottom);
  });
});

describe('the layout', () => {
  it('leaves the keyboard its strip and gives the rest to the roll', () => {
    const l = rollLayout(800, 500);
    expect(l.keyboardTop).toBe(500 - 164);
    expect(l.rollH).toBe(l.keyboardTop);
  });

  it('preserves the timing area when the keyboard is resized', () => {
    const l = rollLayout(800, 500, { keyboardHeight: 200 });
    expect(l.keyboardTop).toBe(300);
    expect(timeWindow(l, 3, 180).yFor(3)).toBe(l.hitLine);
  });

  it('puts the hit line on a whole pixel', () => {
    // A half-pixel line renders as two grey rows instead of one bright one,
    // and this is the most looked-at thing on the screen.
    for (const h of [500, 501, 617, 733]) {
      expect(Number.isInteger(rollLayout(800, h).hitLine)).toBe(true);
    }
  });

  it('keeps a fifth of the roll for what you already played', () => {
    const l = rollLayout(800, 500);
    expect((l.rollH - l.hitLine) / l.rollH).toBeCloseTo(PAST_RATIO, 2);
  });

  /**
   * The 3D view asks for no past strip at all.
   *
   * With depth in the scene, an empty band between the notes and the keys is
   * not "space where information sometimes appears" — it is a hole in the
   * middle of the instrument, which is exactly how it looked. Zero puts the
   * hit line on the keyboard so a note arrives at the key it belongs to.
   */
  it('can put the hit line right on the keyboard', () => {
    const l = rollLayout(800, 500, { pastRatio: 0 });
    expect(l.hitLine).toBe(l.rollH);
    expect(l.hitLine).toBe(l.keyboardTop);
  });

  it('leaves nothing visible below the line when the strip is collapsed', () => {
    const l = rollLayout(800, 500, { pastRatio: 0 });
    const { tBottom } = timeWindow(l, 12, 180);
    expect(tBottom).toBeCloseTo(12, 9);
  });

  it('still defaults to the strip the 2D roll draws in', () => {
    expect(rollLayout(800, 500).hitLine).toBeLessThan(rollLayout(800, 500).rollH);
  });

  it('survives a window too short for the keyboard', () => {
    const l = rollLayout(800, 40);
    expect(l.keyboardTop).toBe(0);
    expect(l.rollH).toBe(0);
  });
});

describe('how present a note is', () => {
  it('is nothing far out and everything at the line', () => {
    expect(approachOf(10, 0)).toBe(0);
    expect(approachOf(0, 0)).toBe(1);
  });

  it('builds over the approach window', () => {
    expect(approachOf(APPROACH_SEC / 2, 0)).toBeCloseTo(0.5, 6);
  });

  it('is nothing at all once the note is done', () => {
    expect(approachOf(0, 5, true)).toBe(0);
  });
});

describe('the time grid', () => {
  const score = { bpm: 120, timeSignature: [4, 4] }; // 0.5s per beat, 2s per bar

  it('numbers the bars from one', () => {
    const bars = gridLines(score, 0, 4.1, 180).filter((l) => l.weight === 'bar');
    expect(bars.map((b) => b.bar)).toEqual([1, 2, 3]);
    expect(bars.map((b) => b.time)).toEqual([0, 2, 4]);
  });

  it('adds the eighths only when there is room for them', () => {
    const roomy = gridLines(score, 0, 2, 360).some((l) => l.weight === 'sub');
    const cramped = gridLines(score, 0, 2, 60).some((l) => l.weight === 'sub');
    expect(roomy).toBe(true);
    expect(cramped).toBe(false);
  });

  it('never draws grid before the start of the piece', () => {
    expect(gridLines(score, -8, 1, 180).every((l) => l.time >= 0)).toBe(true);
  });

  it('has nothing to draw without a score', () => {
    expect(gridLines(null, 0, 4, 180)).toEqual([]);
  });
});

describe('the lanes', () => {
  const geom = buildKeyboardGeometry(60, 72, 700);

  it('gives every black key a column exactly as wide as the key', () => {
    const { black } = lanesFrom(geom);
    for (const key of geom.keys.values()) {
      if (!key.black) continue;
      const lane = black.find((l) => l.x === key.x);
      expect(lane).toBeTruthy();
      expect(lane.w).toBe(key.w);
    }
  });

  it('marks each C as an octave boundary', () => {
    const { octaves } = lanesFrom(geom);
    expect(octaves).toContain(geom.keys.get(60).x);
    expect(octaves).toContain(geom.keys.get(72).x);
  });

  it('has nothing to say about no keyboard', () => {
    expect(lanesFrom(null)).toEqual({ black: [], octaves: [] });
  });
});

describe('what is worth drawing', () => {
  const note = { time: 10, duration: 1 };

  it('keeps a note that is on screen', () => {
    expect(noteVisible(note, 9, 12)).toBe(true);
  });

  it('keeps a long note whose onset has already gone past', () => {
    // A note you are still supposed to be holding is still on screen even
    // though it started below the bottom edge.
    expect(noteVisible({ time: 5, duration: 6 }, 9, 12)).toBe(true);
  });

  it('drops notes well outside the window', () => {
    expect(noteVisible(note, 20, 24)).toBe(false);
    expect(noteVisible(note, 0, 4)).toBe(false);
  });
});
