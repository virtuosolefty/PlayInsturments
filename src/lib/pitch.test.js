import { describe, expect, it } from 'vitest';
import { detectPitch, hzToMidi, midiToHz, nearestString, noteOf, rmsOf } from './pitch.js';

const RATE = 48000, SIZE = 4096;

/** A steady tone: `partials` are the strengths of the fundamental and each overtone above it. */
function tone(hz, { partials = [1], rate = RATE, size = SIZE, level = 0.3, phase = 0 } = {}) {
  const samples = new Float32Array(size);
  const total = partials.reduce((sum, strength) => sum + strength, 0);
  for (let i = 0; i < size; i++) {
    let value = 0;
    partials.forEach((strength, k) => { value += strength * Math.sin(2 * Math.PI * hz * (k + 1) * (i / rate) + phase * (k + 1)); });
    samples[i] = (level * value) / total;
  }
  return samples;
}

/** The same numbers every run, so a failing test fails the same way twice. */
function noise(size = SIZE, level = 0.2) {
  let seed = 12345;
  return Float32Array.from({ length: size }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return (seed / 1073741824 - 1) * level; });
}

const cents = (heard, wanted) => 1200 * Math.log2(heard / wanted);

describe('notes and frequencies', () => {
  it('puts A4 at 440 Hz and an octave at twice the frequency', () => {
    expect(hzToMidi(440)).toBeCloseTo(69);
    expect(hzToMidi(880)).toBeCloseTo(81);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(40)).toBeCloseTo(82.407, 2);
    expect(hzToMidi(midiToHz(57.3))).toBeCloseTo(57.3);
  });

  it('names the nearest note and says how far off it is, in cents', () => {
    expect(noteOf(440)).toMatchObject({ midi: 69, name: 'A4', cents: 0 });
    const sharp = noteOf(midiToHz(64.2));
    expect(sharp.name).toBe('E4');
    expect(sharp.cents).toBeCloseTo(20, 5);
    const flat = noteOf(midiToHz(63.7));
    expect(flat.name).toBe('E4');
    expect(flat.cents).toBeCloseTo(-30, 5);
  });

  it('has no note for no frequency', () => {
    expect(noteOf(0)).toBeNull();
    expect(noteOf(null)).toBeNull();
    expect(noteOf(NaN)).toBeNull();
  });
});

describe('finding the pitch of a sound', () => {
  it('finds a pure tone to within a couple of cents', () => {
    for (const hz of [110, 220, 261.63, 440, 987.77]) {
      const heard = detectPitch(tone(hz), RATE);
      expect(Math.abs(cents(heard.hz, hz)), `${hz} Hz`).toBeLessThan(2);
      expect(heard.clarity, `${hz} Hz`).toBeGreaterThan(0.9);
    }
  });

  it('hears the note a string is playing, not its louder overtones', () => {
    // A plucked low string: the second and third partials carry more than the fundamental.
    const e2 = detectPitch(tone(82.41, { partials: [0.5, 1, 0.8, 0.4, 0.2] }), RATE);
    expect(Math.abs(cents(e2.hz, 82.41))).toBeLessThan(5);
    const c3 = detectPitch(tone(130.81, { partials: [0.3, 1, 0.6, 0.5, 0.3, 0.2], phase: 0.7 }), RATE);
    expect(Math.abs(cents(c3.hz, 130.81))).toBeLessThan(5);
  });

  it('reaches the bottom of a bass guitar and the top of a violin', () => {
    const low = detectPitch(tone(41.2, { partials: [1, 0.7, 0.4] }), RATE);
    expect(Math.abs(cents(low.hz, 41.2))).toBeLessThan(8);
    const high = detectPitch(tone(1318.5, { partials: [1, 0.4, 0.2] }), RATE);
    expect(Math.abs(cents(high.hz, 1318.5))).toBeLessThan(5);
  });

  it('works at the other common sample rate', () => {
    const heard = detectPitch(tone(196, { rate: 44100, partials: [1, 0.5, 0.3] }), 44100);
    expect(Math.abs(cents(heard.hz, 196))).toBeLessThan(3);
  });

  it('tells a string a few cents flat from one in tune', () => {
    const flat = detectPitch(tone(midiToHz(45 - 0.12), { partials: [1, 0.6, 0.3] }), RATE);
    expect(noteOf(flat.hz).name).toBe('A2');
    expect(noteOf(flat.hz).cents).toBeCloseTo(-12, 0);
  });

  it('hears no note in silence, and reports how quiet it was', () => {
    const heard = detectPitch(new Float32Array(SIZE), RATE);
    expect(heard.hz).toBeNull();
    expect(heard.rms).toBe(0);
  });

  it('does not go looking for a note in a sound too quiet to hold one', () => {
    // A perfectly clear tone, but far below anything a microphone hears from an instrument.
    const faint = tone(440, { level: 0.0005 });
    expect(detectPitch(faint, RATE).hz).toBeNull();
    expect(detectPitch(faint, RATE, { silence: 0 }).hz).toBeCloseTo(440, 0);
  });

  it('hears no note in noise', () => {
    const heard = detectPitch(noise(), RATE);
    expect(heard.hz).toBeNull();
    expect(heard.rms).toBeGreaterThan(0.05);
  });

  it('measures loudness as the root of the mean square', () => {
    expect(rmsOf(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rmsOf(new Float32Array(0))).toBe(0);
    expect(detectPitch(tone(220, { level: 0.2 }), RATE).rms).toBeCloseTo(0.2 / Math.SQRT2, 2);
  });

  it('has nothing to say about a buffer too short to hold two cycles', () => {
    expect(detectPitch(new Float32Array(8), RATE).hz).toBeNull();
  });
});

describe('which string is being tuned', () => {
  const GUITAR = [40, 45, 50, 55, 59, 64];

  it('is the string whose open note is nearest, with how far off it is', () => {
    expect(nearestString(GUITAR, 45.1)).toEqual({ string: 1, cents: 10 });
    expect(nearestString(GUITAR, 63.5)).toEqual({ string: 5, cents: -50 });
    expect(nearestString(GUITAR, 30)).toEqual({ string: 0, cents: -1000 });
  });

  it('handles strings that are not in order of pitch', () => {
    const TUNING = [67, 60, 64, 69];
    expect(nearestString(TUNING, 66.8).string).toBe(0);
    expect(nearestString(TUNING, 60.2).string).toBe(1);
  });

  it('has no answer without strings or without a note', () => {
    expect(nearestString([], 45)).toBeNull();
    expect(nearestString(GUITAR, null)).toBeNull();
  });
});
