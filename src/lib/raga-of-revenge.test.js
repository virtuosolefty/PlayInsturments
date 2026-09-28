/**
 * Raga of Revenge — does the shipped MIDI still say what the source says?
 *
 * This piece was first added with invented notes and invented metadata, and the
 * test suite of the day could not tell, because it only asserted that a heading
 * with the right title appeared. So this test reads the actual file back and
 * checks the notes against the transcription it was built from
 * (https://pianonotes.in/raga-of-revenge-piano-notes/), sargam by sargam.
 *
 * If someone regenerates the file and the tune changes, this fails.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scoreFromMidiBuffer } from './score.js';

/** The six lines exactly as the source prints them, played twice. */
const SOURCE_LINES = [
  'Paa Dhaa Nii Gaa Ree Saa Ree Nii Saa',
  'Paa Dhaa Nii Gaa Ree Saa Ree Saa Ree',
  'Paa Dhaa Nii Gaa Ree Saa Ree Nii',
  'Maa Maa Maa Ree Ree Saa',
  'Maa Maa Maa Ree Ree Saa',
  'Nii Gaa Ree Saa Nii Dhaa Paa',
];
const REPEATS = 2;

/** Saa = D5; see the octave reasoning in scripts/generate-raga-of-revenge.mjs. */
const PITCH_OF = { Paa: 69, Dhaa: 70, Nii: 72, Saa: 74, Ree: 76, Gaa: 77, Maa: 79 };
const SARGAM_OF = Object.fromEntries(Object.entries(PITCH_OF).map(([s, m]) => [m, s]));

/** The letter names the source prints beside each syllable. */
const LETTER_OF = { Paa: 'A', Dhaa: 'A#', Nii: 'C', Saa: 'D', Ree: 'E', Gaa: 'F', Maa: 'G' };

function loadScore() {
  const buf = readFileSync('public/songs/raga-of-revenge.mid');
  return scoreFromMidiBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), {
    id: 'raga-of-revenge',
    title: 'Raga of Revenge',
    key: ['D', 'minor'],
  });
}

describe('Raga of Revenge', () => {
  const expected = Array.from({ length: REPEATS }, () => SOURCE_LINES)
    .flat()
    .join(' ')
    .split(/\s+/);

  it('plays the notes the source transcription gives, in order', () => {
    const score = loadScore();
    const actual = score.notes.map((n) => SARGAM_OF[n.midi] ?? `<off-scale ${n.midi}>`);
    expect(actual).toEqual(expected);
  });

  it('spells every syllable as the letter printed beside it', () => {
    // Guards the sargam table itself: a wrong octave would still pass the test
    // above, but a wrong pitch class shows up here.
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const [syllable, midi] of Object.entries(PITCH_OF)) {
      expect(names[midi % 12], syllable).toBe(LETTER_OF[syllable]);
    }
  });

  it('is a single-line melody inside a tenth, so no keyboard needs it folded', () => {
    const score = loadScore();
    const [lo, hi] = score.range;
    expect(hi - lo).toBeLessThanOrEqual(16);
    expect(new Set(score.notes.map((n) => n.hand)).size).toBe(1);
  });

  it('carries the declared key rather than an estimate', () => {
    const score = loadScore();
    expect(score.key.name).toBe('D minor');
    expect(score.key.declared).toBe(true);
  });

  it('matches the length the manifest advertises', () => {
    const score = loadScore();
    const entry = JSON.parse(readFileSync('public/songs/songs.json', 'utf8')).find(
      (s) => s.id === 'raga-of-revenge',
    );
    expect(entry.noteCount).toBe(score.notes.length);
    expect(entry.range).toEqual(score.range);
    expect(entry.approxDuration).toBeCloseTo(score.duration, 0);
  });
});
