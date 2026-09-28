/**
 * Raga of Revenge — MIDI from a transcription, not from memory.
 *
 * Source: https://pianonotes.in/raga-of-revenge-piano-notes/
 * Composer: Anirudh Ravichander.  Film: DC (2026).
 *
 * WHAT CAME FROM THE SOURCE
 *   - the note letters and their order, exactly as printed
 *   - the sargam syllables printed alongside them
 *   - that the six-line sequence is played twice
 *
 * WHAT IS DERIVED (and how)
 *   Octave placement. The page prints no octave markers, but the sargam fixes
 *   the relative positions: with Saa = D the seven syllables map to
 *   D E F G A A# C — D natural minor — and all seven letters on the page agree
 *   with that single tonic, so the transcription is self-consistent.
 *
 *   Each line opens "Paa Dhaa Nii Gaa", which ascends Pa -> Dha -> Ni -> Ga.
 *   Ga can only continue that ascent if it is the Ga *above* Sa, which puts
 *   Pa/Dha/Ni below the tonic and Re/Ga above it. So the octaves are forced by
 *   the source's own ordering rather than chosen.
 *
 * WHAT IS MINE (arrangement decisions, not transcription)
 *   - Maa = G5 rather than G4. Both are consistent with the sargam; G5 makes
 *     line 4 descend G-E-D onto the tonic instead of leaping up a sixth. This
 *     is the one genuinely ambiguous pitch on the page.
 *   - All rhythm. The page states no durations, metre or tempo. Even quavers
 *     with a longer note closing each line, at a practice tempo of 100.
 *
 * No keyboard-size variants: arrange.js already fits a score to whatever window
 * the player owns, and does it better than a pre-baked file could.
 */

import MidiModule from '@tonejs/midi';
import fs from 'fs';

const { Midi } = MidiModule;

/** Sargam -> MIDI, with Saa = D5. See the octave note above. */
const SARGAM = {
  Paa: 69, // A4
  Dhaa: 70, // A#4
  Nii: 72, // C5
  Saa: 74, // D5
  Ree: 76, // E5
  Gaa: 77, // F5
  Maa: 79, // G5
};

/** The letters the page prints, to check SARGAM against rather than trust it. */
const EXPECTED_LETTER = {
  Paa: 'A', Dhaa: 'A#', Nii: 'C', Saa: 'D', Ree: 'E', Gaa: 'F', Maa: 'G',
};

const LETTER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** The six lines, verbatim from the page. */
const LINES = [
  'Paa Dhaa Nii Gaa Ree Saa Ree Nii Saa',
  'Paa Dhaa Nii Gaa Ree Saa Ree Saa Ree',
  'Paa Dhaa Nii Gaa Ree Saa Ree Nii',
  'Maa Maa Maa Ree Ree Saa',
  'Maa Maa Maa Ree Ree Saa',
  'Nii Gaa Ree Saa Nii Dhaa Paa',
];

const REPEATS = 2; // "repeats twice on the page"

const BPM = 100;
const EIGHTH = 30 / BPM; // seconds
const LINE_END = EIGHTH * 2;

// Fail loudly if the syllable table and the printed letters ever disagree —
// this is the check that a silent typo here would otherwise slip past.
for (const [syllable, midi] of Object.entries(SARGAM)) {
  const actual = LETTER[midi % 12];
  if (actual !== EXPECTED_LETTER[syllable]) {
    throw new Error(`${syllable} maps to ${actual}, but the page prints ${EXPECTED_LETTER[syllable]}`);
  }
}

const midi = new Midi();
midi.header.setTempo(BPM);
const track = midi.addTrack();

let time = 0;
for (let pass = 0; pass < REPEATS; pass += 1) {
  for (const line of LINES) {
    const syllables = line.split(/\s+/);
    syllables.forEach((syllable, i) => {
      const pitch = SARGAM[syllable];
      if (pitch === undefined) throw new Error(`unknown syllable "${syllable}"`);
      const duration = i === syllables.length - 1 ? LINE_END : EIGHTH;
      track.addNote({ midi: pitch, time, duration, velocity: 0.8 });
      time += duration;
    });
  }
}

fs.writeFileSync('public/songs/raga-of-revenge.mid', Buffer.from(midi.toArray()));

// Report what the file actually contains, so songs.json can be filled in from
// measurements rather than from guesses.
const notes = track.notes;
const lo = Math.min(...notes.map((n) => n.midi));
const hi = Math.max(...notes.map((n) => n.midi));
console.log('wrote public/songs/raga-of-revenge.mid');
console.log(`  noteCount       ${notes.length}`);
console.log(`  range           [${lo}, ${hi}]  (${LETTER[lo % 12]}${Math.floor(lo / 12) - 1}–${LETTER[hi % 12]}${Math.floor(hi / 12) - 1}, span ${hi - lo})`);
console.log(`  approxDuration  ${time.toFixed(1)}s`);
console.log(`  bpm             ${BPM}`);
