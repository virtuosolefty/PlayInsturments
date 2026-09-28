/**
 * Playing your own run back. The two things that matter: it must sound like
 * what you actually played, including how hard you played it, and stopping it
 * must genuinely stop it.
 */

import { describe, expect, it } from 'vitest';
import {
  clipsDuration,
  comparisonClips,
  PerformancePlayback,
  REFERENCE_LEVEL,
  toClips,
} from './playback.js';

const press = (over) => ({ midi: 60, start: 0, end: 0.5, velocity: 0.8, ...over });
const note = (over) => ({ midi: 60, time: 0, duration: 0.5, velocity: 0.8, ...over });

describe('toClips', () => {
  it('keeps the velocity you played at', () => {
    // A playback at a uniform level would hide the exact unevenness this
    // feature exists to reveal.
    const clips = toClips([press({ velocity: 0.2 }), press({ midi: 62, start: 1, velocity: 0.95 })]);
    expect(clips.map((c) => c.velocity)).toEqual([0.2, 0.95]);
  });

  it('starts at your first note, not at song zero', () => {
    // Coming in four bars late should not play back four bars of silence.
    const clips = toClips([press({ start: 8 }), press({ midi: 62, start: 9 })]);
    expect(clips[0].time).toBe(0);
    expect(clips[1].time).toBe(1);
  });

  it('takes an explicit origin, for putting two sets of clips on one timeline', () => {
    const clips = toClips([press({ start: 8 }), press({ midi: 62, start: 9 })], { origin: 6 });
    expect(clips.map((c) => c.time)).toEqual([2, 3]);
  });

  it('never places a clip before the origin it was given', () => {
    const [clip] = toClips([press({ start: 1 })], { origin: 4 });
    expect(clip.time).toBe(0);
  });

  it('gives a note that was never released a sane length', () => {
    const [clip] = toClips([press({ end: null })]);
    expect(clip.duration).toBeCloseTo(0.6, 5);
  });

  it('makes a stabbed key audible and stops a held one ringing for ever', () => {
    expect(toClips([press({ end: 0.001 })])[0].duration).toBeCloseTo(0.12, 5);
    expect(toClips([press({ end: 90 })])[0].duration).toBe(4);
  });

  it('sorts by time whatever order the presses were captured in', () => {
    const clips = toClips([press({ start: 2 }), press({ midi: 64, start: 0 }), press({ midi: 62, start: 1 })]);
    expect(clips.map((c) => c.midi)).toEqual([64, 62, 60]);
  });

  it('throws out junk rather than trying to play it', () => {
    expect(toClips([null, {}, press({ midi: 999 }), press({ start: NaN })])).toEqual([]);
    expect(toClips()).toEqual([]);
  });

  it('defaults a missing velocity rather than playing silence', () => {
    expect(toClips([press({ velocity: undefined })])[0].velocity).toBe(0.75);
  });

  it('measures the whole run including the last note ringing', () => {
    expect(clipsDuration(toClips([press({ start: 0, end: 0.5 }), press({ start: 3, end: 3.5 })]))).toBeCloseTo(3.5, 5);
    expect(clipsDuration([])).toBe(0);
  });
});

/**
 * Your run against the score. Solo playback tells you what you did; it cannot
 * tell you what you should have done, and it thins out exactly where it is
 * needed most — the run you mostly missed plays back as a handful of notes
 * with nothing to judge them by. These are the rules that make the comparison
 * mean something.
 */
describe('comparisonClips', () => {
  it('puts both parts on one timeline so a late entry stays late', () => {
    // The whole point. Anchoring each part to its own first note would quietly
    // correct a run that came in two seconds behind into a clean one.
    const clips = comparisonClips([press({ start: 2 })], [note({ time: 0 })]);
    const mine = clips.find((c) => !c.reference);
    const theirs = clips.find((c) => c.reference);
    expect(theirs.time).toBe(0);
    expect(mine.time).toBeCloseTo(2, 5);
  });

  it('trims the silence in front of both parts together', () => {
    const clips = comparisonClips([press({ start: 9 })], [note({ time: 8 })]);
    expect(Math.min(...clips.map((c) => c.time))).toBe(0);
    expect(clips.find((c) => !c.reference).time).toBeCloseTo(1, 5);
  });

  it('sits the score under your own playing rather than beside it', () => {
    const clips = comparisonClips([press({ velocity: 0.8 })], [note({ velocity: 0.8 })]);
    const mine = clips.find((c) => !c.reference);
    const theirs = clips.find((c) => c.reference);
    expect(mine.velocity).toBe(0.8);
    expect(theirs.velocity).toBeCloseTo(0.8 * REFERENCE_LEVEL, 5);
    expect(theirs.velocity).toBeLessThan(mine.velocity);
  });

  it('still plays the score when you played nothing at all', () => {
    // The run with no notes in it is the one where hearing how the piece
    // actually goes is worth the most.
    const clips = comparisonClips([], [note({ time: 0 }), note({ midi: 62, time: 1 })]);
    expect(clips).toHaveLength(2);
    expect(clips.every((c) => c.reference)).toBe(true);
  });

  it('plays your run alone when there is no score to compare against', () => {
    const clips = comparisonClips([press()], []);
    expect(clips).toHaveLength(1);
    expect(clips[0].reference).toBeUndefined();
  });

  it('is empty when there is neither', () => {
    expect(comparisonClips([], [])).toEqual([]);
  });

  it('stays in time order once merged', () => {
    const clips = comparisonClips(
      [press({ start: 0.5 }), press({ midi: 64, start: 2 })],
      [note({ time: 0 }), note({ midi: 62, time: 1 })],
    );
    const times = clips.map((c) => c.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('PerformancePlayback', () => {
  /** An audio engine and a clock we can drive by hand. */
  const rig = () => {
    const played = [];
    let now = 0;
    let tick = null;
    const audio = {
      get now() { return now; },
      play: (midi, duration, when, velocity) => played.push({ midi, duration, when, velocity }),
      releaseAll: () => played.push({ released: true }),
    };
    const player = new PerformancePlayback(audio, {
      setInterval: (fn) => { tick = fn; return 1; },
      clearInterval: () => { tick = null; },
    });
    return {
      player, played,
      advance: (dt) => { now += dt; tick?.(); },
      get running() { return tick !== null; },
    };
  };

  it('schedules only as far ahead as the look-ahead', () => {
    const r = rig();
    r.player.start(toClips([press({ start: 0 }), press({ midi: 62, start: 5, end: 5.5 })]));
    expect(r.played).toHaveLength(1); // the note five seconds out is not queued yet
    r.advance(4.9);
    expect(r.played).toHaveLength(2);
  });

  it('stops for real rather than muting notes already queued', () => {
    // Anything handed to the audio graph minutes ahead cannot be recalled, so
    // a playback that keeps sounding after Stop is worse than none at all.
    const r = rig();
    r.player.start(toClips([press({ start: 0 }), press({ midi: 62, start: 20, end: 20.5 })]));
    r.player.stop();
    expect(r.running).toBe(false);
    r.advance(30);
    expect(r.played.filter((p) => p.midi === 62)).toHaveLength(0);
  });

  it('reports the end once the last note has finished ringing', () => {
    const r = rig();
    let ended = false;
    r.player.start(toClips([press({ start: 0, end: 0.5 })]), { onEnd: () => { ended = true; } });
    r.advance(0.4);
    expect(ended).toBe(false);
    r.advance(0.3);
    expect(ended).toBe(true);
    expect(r.player.playing).toBe(false);
  });

  it('replaces a playback already in progress instead of layering onto it', () => {
    const r = rig();
    r.player.start(toClips([press({ start: 0 })]));
    r.player.start(toClips([press({ midi: 67, start: 0 })]));
    expect(r.played.filter((p) => p.released).length).toBe(1);
    expect(r.played[r.played.length - 1].midi).toBe(67);
  });

  it('says there was nothing to play rather than starting an empty run', () => {
    const r = rig();
    expect(r.player.start([])).toBe(false);
    expect(r.player.playing).toBe(false);
    expect(r.running).toBe(false);
  });

  it('is safe to stop when it was never started', () => {
    const r = rig();
    expect(() => r.player.stop()).not.toThrow();
    expect(r.played).toHaveLength(0);
  });
});
