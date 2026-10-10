import { describe, expect, it } from 'vitest';
import { createNoteTracker, velocityOf } from './noteTracker.js';
import { midiToHz } from './pitch.js';

/** A tracker that writes down what it was told, and frames to feed it at a steady 30 ms. */
function listen(options = {}) {
  const heard = [];
  const tracker = createNoteTracker({
    onNoteOn: (midi, velocity, at) => heard.push(['on', midi, at]),
    onNoteOff: (midi, at) => heard.push(['off', midi, at]),
    ...options,
  });
  let at = 0;
  const feed = (...frames) => { for (const frame of frames) { tracker.push(frame, at); at += 30; } };
  return { heard, tracker, feed, events: () => heard.map(([kind, midi]) => `${kind} ${midi}`) };
}

const note = (midi, rms = 0.1, clarity = 0.95) => ({ hz: midiToHz(midi), clarity, rms });
const quiet = (rms = 0.001) => ({ hz: null, clarity: 0, rms });
const times = (frame, count) => Array.from({ length: count }, () => frame);

describe('hearing a note begin', () => {
  it('waits for the same note twice running before calling it one', () => {
    const { feed, events } = listen();
    feed(note(60));
    expect(events()).toEqual([]);
    feed(note(60));
    expect(events()).toEqual(['on 60']);
    feed(...times(note(60), 10));
    expect(events()).toEqual(['on 60']);
  });

  it('is not fooled by one stray frame, such as an octave misheard', () => {
    const { feed, events } = listen();
    feed(note(60), note(60), note(72), note(60), note(60));
    expect(events()).toEqual(['on 60']);
  });

  it('starts nothing while the pitch wavers between two notes', () => {
    const { feed, events } = listen();
    feed(note(60), note(61), note(60), note(61), note(60), note(61));
    expect(events()).toEqual([]);
  });

  it('rounds a note played a little out of tune to the note meant', () => {
    const { feed, events } = listen();
    feed(note(64.3), note(63.8));
    expect(events()).toEqual(['on 64']);
  });

  it('ignores sound too quiet or too unclear to be an instrument', () => {
    const { feed, events } = listen();
    feed(...times(note(60, 0.002), 5), ...times(note(60, 0.1, 0.4), 5));
    expect(events()).toEqual([]);
  });

  it('ignores notes the instrument cannot play', () => {
    const { feed, events } = listen({ lowest: 55, highest: 88 });
    feed(...times(note(40), 4), ...times(note(100), 4), ...times(note(62), 2));
    expect(events()).toEqual(['on 62']);
  });
});

describe('hearing a note end, and the next begin', () => {
  it('ends a note after a few frames of quiet, not at the first', () => {
    const { feed, events } = listen();
    feed(note(60), note(60), quiet(), quiet());
    expect(events()).toEqual(['on 60']);
    feed(quiet());
    expect(events()).toEqual(['on 60', 'off 60']);
  });

  it('carries a note across a gap too short to be a rest', () => {
    const { feed, events } = listen();
    feed(note(60), note(60), quiet(0.08), note(60, 0.09), note(60, 0.08));
    expect(events()).toEqual(['on 60']);
  });

  it('moves from one note to the next, ending the first as the second begins', () => {
    const { feed, heard, events } = listen();
    feed(note(60), note(60), note(62), note(62));
    expect(events()).toEqual(['on 60', 'off 60', 'on 62']);
    // The old note ends at the moment the new one starts.
    expect(heard[1][2]).toBe(heard[2][2]);
  });

  it('hears the same note played again when it comes back louder after dying away', () => {
    const { feed, events } = listen();
    // A plucked string: loud, fading, then plucked again.
    feed(note(57, 0.2), note(57, 0.18), note(57, 0.12), note(57, 0.08), note(57, 0.05), note(57, 0.04), note(57, 0.19), note(57, 0.17));
    expect(events()).toEqual(['on 57', 'off 57', 'on 57']);
  });

  it('hears a bowed note repeated after the bow changes direction', () => {
    const { feed, events } = listen();
    feed(...times(note(69, 0.12), 6), quiet(0.01), ...times(note(69, 0.12), 6));
    expect(events()).toEqual(['on 69', 'off 69', 'on 69']);
  });

  it('does not mistake a note that swells for one played again', () => {
    const { feed, events } = listen();
    // A bowed note that starts quietly and grows: it has not died away, so it has not come back.
    feed(...[0.012, 0.014, 0.017, 0.02, 0.024, 0.029, 0.035, 0.042, 0.05, 0.05, 0.048].map(rms => note(67, rms)));
    expect(events()).toEqual(['on 67']);
  });

  it('hears quick repeats of a plucked note while the string is still ringing', () => {
    const { feed, events } = listen();
    // Eighth notes at a walking pace, about a third of a second apart: each has faded to a little over half.
    const pluck = [0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.135, 0.13, 0.125, 0.12, 0.115].map(rms => note(64, rms));
    feed(...pluck, ...pluck, ...pluck);
    expect(events()).toEqual(['on 64', 'off 64', 'on 64', 'off 64', 'on 64']);
  });

  it('holds a note through vibrato, or a string a little sharp, that strays past half way to the next', () => {
    const { feed, events } = listen();
    feed(note(60.3), note(60.4), note(60.6), note(60.55), note(60.35), note(60.62), note(60.6), note(60.4));
    expect(events()).toEqual(['on 60']);
    // A real step up is still heard as one.
    feed(note(61), note(61.05));
    expect(events()).toEqual(['on 60', 'off 60', 'on 61']);
  });

  it('does not chop a steady note into several because its loudness flutters', () => {
    const { feed, events } = listen();
    feed(...[0.1, 0.11, 0.09, 0.12, 0.1, 0.085, 0.115, 0.1, 0.09, 0.12].map(rms => note(72, rms)));
    expect(events()).toEqual(['on 72']);
  });

  it('does not repeat a note faster than anyone plays', () => {
    const { feed, events } = listen({ minGapMs: 200 });
    feed(note(60, 0.05), note(60, 0.05), note(60, 0.2));
    // That jump comes only 30 ms after the note began: it is the note still speaking.
    expect(events()).toEqual(['on 60']);
    feed(...times(note(60, 0.05), 5), note(60, 0.2));
    // This one is 210 ms after it began, clear of the gap.
    expect(events()).toEqual(['on 60', 'off 60', 'on 60']);
  });

  it('goes quiet when reset, telling whoever was listening', () => {
    const { feed, tracker, events } = listen();
    feed(note(60), note(60));
    tracker.reset();
    expect(events()).toEqual(['on 60', 'off 60']);
    tracker.reset();
    expect(events()).toEqual(['on 60', 'off 60']);
  });
});

describe('how hard a note was played', () => {
  it('is louder for a louder sound, and always something a matcher can use', () => {
    expect(velocityOf(0.3)).toBeGreaterThan(velocityOf(0.05));
    expect(velocityOf(0.05)).toBeGreaterThan(velocityOf(0.012));
    for (const rms of [0, 0.0001, 0.01, 0.1, 0.5, 2]) {
      expect(velocityOf(rms)).toBeGreaterThanOrEqual(0.3);
      expect(velocityOf(rms)).toBeLessThanOrEqual(1);
    }
  });

  it('is passed on with the note', () => {
    const velocities = [];
    const tracker = createNoteTracker({ onNoteOn: (midi, velocity) => velocities.push(velocity), onNoteOff: () => {} });
    tracker.push(note(60, 0.25), 0);
    tracker.push(note(60, 0.25), 30);
    expect(velocities).toEqual([velocityOf(0.25)]);
  });
});
