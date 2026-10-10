import { describe, expect, it } from 'vitest';
import { midiToHz } from './pitch.js';
import { IN_TUNE_CENTS, steadyPitch, tunerReading } from './tuner.js';

const frame = (midi, rms = 0.1, clarity = 0.95) => ({ hz: midi === null ? null : midiToHz(midi), clarity, rms });
const GUITAR = [40, 45, 50, 55, 59, 64];

describe('steadying what the tuner shows', () => {
  it('takes the middle of the last few readings, so one bad one does not jump the needle', () => {
    const frames = [frame(45), frame(45.02), frame(57), frame(45.01), frame(44.99)];
    expect(steadyPitch(frames)).toBeCloseTo(midiToHz(45.01), 1);
  });

  it('looks only at the most recent readings', () => {
    const old = Array.from({ length: 20 }, () => frame(40));
    expect(steadyPitch([...old, ...Array.from({ length: 5 }, () => frame(45))])).toBeCloseTo(midiToHz(45), 3);
  });

  it('ignores readings that were quiet, unclear or heard nothing', () => {
    expect(steadyPitch([frame(45, 0.001), frame(45, 0.1, 0.3), frame(null)])).toBeNull();
    expect(steadyPitch([frame(50), frame(null), frame(50.02), frame(50, 0.0001)])).toBeCloseTo(midiToHz(50.01), 1);
  });

  it('forgets readings from before the sound stopped coming', () => {
    const at = (reading, time) => ({ ...reading, at: time });
    const frames = [at(frame(45), 1000), at(frame(45), 1030), at(frame(45), 1060)];
    expect(steadyPitch(frames, { now: 1100 })).toBeCloseTo(midiToHz(45), 3);
    // Two seconds on with nothing new: the microphone has stopped, and its last readings say nothing about now.
    expect(steadyPitch(frames, { now: 3100 })).toBeNull();
  });

  it('shows nothing until there is more than one reading to go on, and nothing for no readings', () => {
    expect(steadyPitch([frame(45)])).toBeNull();
    expect(steadyPitch([])).toBeNull();
  });
});

describe('reading a pitch as a tuner does', () => {
  it('calls a note in tune within a few cents either way', () => {
    expect(tunerReading(midiToHz(45), GUITAR)).toMatchObject({ name: 'A2', cents: 0, state: 'in-tune', needle: 0 });
    expect(tunerReading(midiToHz(45 + IN_TUNE_CENTS / 100), GUITAR).state).toBe('in-tune');
    expect(tunerReading(midiToHz(45 - IN_TUNE_CENTS / 100), GUITAR).state).toBe('in-tune');
  });

  it('says flat or sharp, by how many cents, and where the needle points', () => {
    const flat = tunerReading(midiToHz(44.8), GUITAR);
    expect(flat).toMatchObject({ name: 'A2', cents: -20, state: 'flat' });
    expect(flat.needle).toBeCloseTo(-0.4);
    const sharp = tunerReading(midiToHz(64.3), GUITAR);
    expect(sharp).toMatchObject({ name: 'E4', cents: 30, state: 'sharp' });
    expect(sharp.needle).toBeCloseTo(0.6);
  });

  it('names the string being tuned and which way to turn its peg', () => {
    expect(tunerReading(midiToHz(45), GUITAR).string).toEqual({ index: 1, cents: 0, advice: 'in tune' });
    expect(tunerReading(midiToHz(44.7), GUITAR).string).toEqual({ index: 1, cents: -30, advice: 'tune up' });
    expect(tunerReading(midiToHz(40.4), GUITAR).string).toEqual({ index: 0, cents: 40, advice: 'tune down' });
    // A string slack by more than a semitone still belongs to its own note, not the one it happens to be near.
    expect(tunerReading(midiToHz(38.5), GUITAR)).toMatchObject({ name: 'D#2', string: { index: 0, cents: -150, advice: 'tune up' } });
  });

  it('is a plain note tuner for an instrument without strings to tune', () => {
    const reading = tunerReading(midiToHz(60.1), []);
    expect(reading).toMatchObject({ name: 'C4', cents: 10, state: 'sharp', string: null });
  });

  it('reads nothing from no pitch', () => {
    expect(tunerReading(null, GUITAR)).toBeNull();
    expect(tunerReading(0, GUITAR)).toBeNull();
  });

  it('never sends the needle past the end of its scale', () => {
    expect(tunerReading(midiToHz(45.49), GUITAR).needle).toBeLessThanOrEqual(1);
    expect(tunerReading(midiToHz(44.51), GUITAR).needle).toBeGreaterThanOrEqual(-1);
  });
});
