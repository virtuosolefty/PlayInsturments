/**
 * Sample-pack filename parsing. Sampled libraries name files after the note
 * they record, and the conventions vary enough that guessing wrong would leave
 * someone hand-writing a manifest — the thing this exists to avoid.
 */

import { describe, expect, it } from 'vitest';
import { packFromFiles, pitchFromFilename } from './vault.js';

describe('pitchFromFilename', () => {
  it('reads plain names', () => {
    expect(pitchFromFilename('C4.wav')).toEqual({ midi: 60, name: 'C4' });
    expect(pitchFromFilename('A0.flac')).toEqual({ midi: 21, name: 'A0' });
    expect(pitchFromFilename('C8.mp3')).toEqual({ midi: 108, name: 'C8' });
  });

  it('accepts both ways of writing a sharp', () => {
    // `s` is what libraries use, because `#` is awkward in a path.
    expect(pitchFromFilename('Ds3.wav').midi).toBe(51);
    expect(pitchFromFilename('D#3.wav').midi).toBe(51);
  });

  it('accepts flats and normalises them to sharps', () => {
    expect(pitchFromFilename('Eb3.wav')).toEqual({ midi: 51, name: 'D#3' });
  });

  it('is not fussy about case or a directory prefix', () => {
    expect(pitchFromFilename('samples/piano/c4.WAV').midi).toBe(60);
    expect(pitchFromFilename('C:\\bounces\\Fs2.wav').midi).toBe(42);
  });

  it('reads a name that carries extra text after the pitch', () => {
    expect(pitchFromFilename('C4_mf_01.wav').midi).toBe(60);
  });

  it('refuses names that say nothing about pitch', () => {
    expect(pitchFromFilename('take-one.wav')).toBeNull();
    expect(pitchFromFilename('untitled.mp3')).toBeNull();
  });

  it('refuses a pitch outside MIDI range', () => {
    expect(pitchFromFilename('C-3.wav')).toBeNull();
  });
});

describe('packFromFiles', () => {
  const file = (name) => ({ name });

  it('maps every recognised file and reports the rest', () => {
    const pack = packFromFiles([file('C3.wav'), file('C4.wav'), file('notes.txt')]);
    expect(pack.count).toBe(2);
    expect(Object.keys(pack.files).sort()).toEqual(['C3', 'C4']);
    expect(pack.skipped).toEqual(['notes.txt']);
  });

  it('comes back empty rather than throwing when nothing is usable', () => {
    const pack = packFromFiles([file('bounce1.wav'), file('bounce2.wav')]);
    expect(pack.count).toBe(0);
    expect(pack.skipped).toHaveLength(2);
  });

  it('keeps one file per pitch when a name repeats', () => {
    const pack = packFromFiles([file('C4.wav'), file('C4_alt.wav')]);
    expect(pack.count).toBe(1);
  });
});
