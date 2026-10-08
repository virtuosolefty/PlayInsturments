import { describe, expect, it } from 'vitest';
import { buildDrumVoice } from './drumVoice.js';
import { DRUM_PIECES } from './drums.js';

/** A stand-in for Tone that records what was built and what was struck. */
function fakeTone() {
  const calls = [];
  const built = [];
  class Node {
    constructor(options) { this.options = options; this.disposed = false; built.push(this); }
    connect(target) { this.target = target; return this; }
    dispose() { this.disposed = true; }
    triggerAttackRelease(...args) { calls.push({ voice: this.options?.label, kind: this.constructor.name, args }); }
    triggerRelease(...args) { calls.push({ voice: this.options?.label, kind: this.constructor.name, release: args }); }
  }
  return {
    calls, built,
    Tone: {
      Gain: class Gain extends Node {},
      Filter: class Filter extends Node {},
      MembraneSynth: class MembraneSynth extends Node {},
      NoiseSynth: class NoiseSynth extends Node {},
      // Note names here are just the MIDI number as text, so the test controls the mapping.
      Frequency: name => ({ toMidi: () => Number(name) }),
    },
  };
}

describe('the drum voice', () => {
  it('sounds something for every piece of the kit', () => {
    const { Tone, calls } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    for (const piece of DRUM_PIECES) {
      const before = calls.length;
      voice.triggerAttackRelease(String(piece.midi), 0.1, 2, 0.7);
      expect(calls.length, piece.id).toBeGreaterThan(before);
    }
  });

  it('plays a hit at the time and strength asked for', () => {
    const { Tone, calls } = fakeTone();
    buildDrumVoice(Tone, {}).triggerAttackRelease('36', 0.4, 12.5, 0.6);
    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe('MembraneSynth');
    expect(calls[0].args.at(-2)).toBe(12.5);
    expect(calls[0].args.at(-1)).toBe(0.6);
  });

  it('gives the snare a body and a rattle, and each tom its own pitch', () => {
    const { Tone, calls } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    voice.triggerAttack('38', 0, 0.8);
    expect(calls.map(c => c.kind).sort()).toEqual(['MembraneSynth', 'NoiseSynth']);
    calls.length = 0;
    for (const midi of [50, 47, 43]) voice.triggerAttack(String(midi), 0, 0.8);
    expect(new Set(calls.map(c => c.args[0])).size).toBe(3);
  });

  it('accepts the neighbouring notes a controller may send', () => {
    const { Tone, calls } = fakeTone();
    buildDrumVoice(Tone, {}).triggerAttack('35', 0, 0.8);
    expect(calls).toHaveLength(1);
  });

  it('closes the open hi-hat when the hi-hat is hit', () => {
    const { Tone, calls } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    voice.triggerAttack('46', 0, 0.8);
    voice.triggerAttack('42', 1, 0.8);
    expect(calls.some(c => c.release)).toBe(true);
  });

  it('stays silent, without throwing, for a note that is not a drum', () => {
    const { Tone, calls } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    expect(() => voice.triggerAttackRelease('60', 0.2, 0, 0.8)).not.toThrow();
    expect(() => voice.triggerAttack('60', 0, 0.8)).not.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('keeps going when a voice refuses a hit', () => {
    const { Tone } = fakeTone();
    Tone.MembraneSynth.prototype.triggerAttackRelease = () => { throw new Error('time must be later than the last hit'); };
    expect(() => buildDrumVoice(Tone, {}).triggerAttack('36', 0, 0.8)).not.toThrow();
  });

  it('keeps strength inside what a synth accepts', () => {
    const { Tone, calls } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    voice.triggerAttack('36', 0, 7);
    voice.triggerAttack('36', 1, -1);
    voice.triggerAttack('36', 2);
    expect(calls.map(c => c.args.at(-1))).toEqual([1, 0.05, 0.8]);
  });

  it('has nothing to release, and disposes everything it built', () => {
    const { Tone, built } = fakeTone();
    const voice = buildDrumVoice(Tone, {});
    expect(() => { voice.triggerRelease('36'); voice.releaseAll(); }).not.toThrow();
    voice.dispose();
    expect(built.length).toBeGreaterThan(5);
    expect(built.every(node => node.disposed)).toBe(true);
  });
});
