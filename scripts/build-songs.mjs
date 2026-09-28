/**
 * build-songs.mjs — generates the bundled practice library.
 *
 * Run with `npm run songs`. Writes .mid files + songs.json into public/songs/.
 *
 * COPYRIGHT NOTE: every piece here is in the worldwide public domain (composers
 * died well over 70 years ago, or the melody is traditional/anonymous). Modern
 * chart hits are still under copyright, so they are deliberately not included —
 * use the "Load your own file" button for anything you own a licence to.
 *
 * Arrangements are deliberately simplified: opening sections, thinned textures,
 * and a comfortable register. They are practice studies, not urtext editions.
 */

// @tonejs/midi resolves to its CommonJS build under plain node, so take the
// default export here. The browser bundle (see src/lib/score.js) uses the ESM
// build and can import { Midi } directly.
import toneMidi from '@tonejs/midi';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Midi } = toneMidi;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/songs');

/* ------------------------------------------------------------------ helpers */

// Note tuple: [midi, startBeat, durationBeats, velocity?, finger?]
// `finger` is 1–5, thumb to little, for whichever hand the track belongs to.
const n = (midi, start, dur, vel = 0.8, finger = 0) => [midi, start, dur, vel, finger];

/**
 * Apply a fingering pattern to a run of notes, cycling if the pattern is
 * shorter. Scales and five-finger shapes are entirely regular, so their
 * fingering is a pattern rather than a list.
 */
const fingered = (notes, pattern) =>
  notes.map((note, i) => [...note.slice(0, 4), pattern[i % pattern.length]]);

/**
 * Fingering as the app will consume it: one number per note, in the order
 * `finalise` produces after sorting by time then pitch. Emitted into the
 * manifest because MIDI has no standard place to put it.
 */
function fingeringFor(song) {
  const spb = 60 / song.bpm;
  const all = song.tracks.flatMap((track) =>
    track.notes.map(([midi, startBeat, , , finger]) => ({
      midi,
      time: startBeat * spb,
      finger: finger ?? 0,
    })),
  );
  if (!all.some((x) => x.finger)) return null;
  all.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return all.map((x) => x.finger);
}

/** Repeat a chord as a block on given beats. */
function block(midis, start, dur, vel = 0.7) {
  return midis.map((m) => n(m, start, dur, vel));
}

/** Lay a list of pitches out as consecutive equal-length notes. */
function run(pitches, start, step, vel = 0.8, dur = step) {
  return pitches.map((p, i) => n(p, start + i * step, dur, vel));
}

const CHORDS = {
  C: [48, 52, 55], F: [41, 45, 48], G: [43, 47, 50], Am: [45, 48, 52], Dm: [50, 53, 57],
  // G7 spells the dominant properly (G B D F). Worth preferring over a bare G
  // triad: the 7th is what makes the pull back to C audible, and it keeps the
  // subdominant F in the pitch-class histogram so key detection lands on C.
  G7: [43, 47, 50, 53],
};

/* -------------------------------------------------------------- the library */

const songs = [];

/* 1 ------------------------------------------------- C major scale, 2 octaves */
{
  // Standard C major fingering. The thumb tucks under after the third and
  // seventh degrees going up, and the third finger crosses over coming down —
  // getting those two moves right is most of what the exercise teaches.
  const rhUp = [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5];
  const rhDown = [4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1];
  const lhUp = [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1];
  const lhDown = [2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5];

  const rh = [
    ...fingered(run([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84], 0, 1, 0.78, 0.9), rhUp),
    ...fingered(run([83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60], 15, 1, 0.78, 0.9), rhDown),
    n(60, 29, 3, 0.78, 1),
  ];
  const lh = [
    ...fingered(run([48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72], 0, 1, 0.7, 0.9), lhUp),
    ...fingered(run([71, 69, 67, 65, 64, 62, 60, 59, 57, 55, 53, 52, 50, 48], 15, 1, 0.7, 0.9), lhDown),
    n(48, 29, 3, 0.7, 5),
  ];
  songs.push({
    id: 'c-major-scale',
    title: 'C Major Scale — Two Octaves',
    composer: 'Exercise',
    difficulty: 1,
    bpm: 80,
    timeSignature: [4, 4],
    tags: ['exercise', 'scales'],
    description: 'Both hands in parallel motion. Aim for even timing before you chase speed.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 2 --------------------------------------------- triads & arpeggios in C major */
{
  const rh = [];
  const lh = [];
  const degrees = [
    { name: 'I', rhArp: [60, 64, 67, 72], lhChord: CHORDS.C },
    { name: 'ii', rhArp: [62, 65, 69, 74], lhChord: CHORDS.Dm },
    { name: 'IV', rhArp: [65, 69, 72, 77], lhChord: CHORDS.F },
    { name: 'V', rhArp: [67, 71, 74, 79], lhChord: CHORDS.G },
    { name: 'vi', rhArp: [69, 72, 76, 81], lhChord: CHORDS.Am },
    { name: 'I', rhArp: [60, 64, 67, 72], lhChord: CHORDS.C },
  ];
  degrees.forEach((d, i) => {
    const bar = i * 4;
    // up then down the arpeggio in eighths
    const shape = [...d.rhArp, ...d.rhArp.slice(0, 3).reverse()];
    rh.push(...run(shape, bar, 0.5, 0.8, 0.45));
    rh.push(...block(d.rhArp, bar + 3.5, 0.5, 0.85));
    lh.push(...block(d.lhChord, bar, 3.4, 0.65));
    lh.push(...block(d.lhChord, bar + 3.5, 0.5, 0.7));
  });
  songs.push({
    id: 'c-major-arpeggios',
    title: 'Triads & Arpeggios in C',
    composer: 'Exercise',
    difficulty: 2,
    bpm: 84,
    timeSignature: [4, 4],
    tags: ['exercise', 'chords'],
    description: 'I–ii–IV–V–vi–I. Trains chord shapes and gives the theory checker real harmony to reason about.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 3 ----------------------------------------------- Twinkle, Twinkle Little Star */
{
  // Phrases of two 4/4 bars each.
  const melody = [
    [60, 60, 67, 67], [69, 69, 67],
    [65, 65, 64, 64], [62, 62, 60],
    [67, 67, 65, 65], [64, 64, 62],
    [67, 67, 65, 65], [64, 64, 62],
    [60, 60, 67, 67], [69, 69, 67],
    [65, 65, 64, 64], [62, 62, 60],
  ];
  const harmony = [
    [CHORDS.C, CHORDS.C], [CHORDS.F, CHORDS.C],
    [CHORDS.F, CHORDS.C], [CHORDS.G, CHORDS.C],
    [CHORDS.C, CHORDS.F], [CHORDS.C, CHORDS.G],
    [CHORDS.C, CHORDS.F], [CHORDS.C, CHORDS.G],
    [CHORDS.C, CHORDS.C], [CHORDS.F, CHORDS.C],
    [CHORDS.F, CHORDS.C], [CHORDS.G, CHORDS.C],
  ];
  const rh = [];
  const lh = [];
  melody.forEach((bar, i) => {
    const t = i * 4;
    if (bar.length === 4) rh.push(...run(bar, t, 1, 0.82, 0.9));
    else rh.push(n(bar[0], t, 1, 0.82), n(bar[1], t + 1, 1, 0.82), n(bar[2], t + 2, 2, 0.82));
    lh.push(...block(harmony[i][0], t, 1.9, 0.6), ...block(harmony[i][1], t + 2, 1.9, 0.6));
  });
  songs.push({
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional',
    difficulty: 1,
    bpm: 92,
    timeSignature: [4, 4],
    tags: ['beginner', 'melody'],
    description: 'The gentlest way to check your MPK Mini, your latency and your ears all at once.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 4 --------------------------------------------------- Ode to Joy (Beethoven 9) */
{
  // 16 bars of 4/4. `d` marks a dotted-quarter + eighth pair, `h` a half note.
  const bars = [
    [[64, 1], [64, 1], [65, 1], [67, 1]],
    [[67, 1], [65, 1], [64, 1], [62, 1]],
    [[60, 1], [60, 1], [62, 1], [64, 1]],
    [[64, 1.5], [62, 0.5], [62, 2]],
    [[64, 1], [64, 1], [65, 1], [67, 1]],
    [[67, 1], [65, 1], [64, 1], [62, 1]],
    [[60, 1], [60, 1], [62, 1], [64, 1]],
    [[62, 1.5], [60, 0.5], [60, 2]],
    [[62, 1], [62, 1], [64, 1], [60, 1]],
    [[62, 1], [64, 0.5], [65, 0.5], [64, 1], [60, 1]],
    [[62, 1], [64, 0.5], [65, 0.5], [64, 1], [62, 1]],
    [[60, 1], [62, 1], [55, 2]],
    [[64, 1], [64, 1], [65, 1], [67, 1]],
    [[67, 1], [65, 1], [64, 1], [62, 1]],
    [[60, 1], [60, 1], [62, 1], [64, 1]],
    [[62, 1.5], [60, 0.5], [60, 2]],
  ];
  const harmony = [
    [CHORDS.C, CHORDS.C], [CHORDS.C, CHORDS.G7], [CHORDS.C, CHORDS.F], [CHORDS.G7, CHORDS.G7],
    [CHORDS.C, CHORDS.C], [CHORDS.C, CHORDS.G7], [CHORDS.C, CHORDS.F], [CHORDS.G7, CHORDS.C],
    [CHORDS.G7, CHORDS.C], [CHORDS.C, CHORDS.F], [CHORDS.G7, CHORDS.G7], [CHORDS.C, CHORDS.G7],
    [CHORDS.C, CHORDS.C], [CHORDS.C, CHORDS.G7], [CHORDS.C, CHORDS.F], [CHORDS.G7, CHORDS.C],
  ];
  const rh = [];
  const lh = [];
  bars.forEach((bar, i) => {
    const t = i * 4;
    let beat = 0;
    for (const [midi, dur] of bar) {
      rh.push(n(midi, t + beat, dur * 0.94, 0.82));
      beat += dur;
    }
    lh.push(...block(harmony[i][0], t, 1.9, 0.58), ...block(harmony[i][1], t + 2, 1.9, 0.58));
  });
  songs.push({
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    difficulty: 2,
    bpm: 100,
    timeSignature: [4, 4],
    tags: ['classical', 'melody'],
    description: 'Theme from the Ninth Symphony. Stepwise melody, block-chord left hand — a great first two-hand piece.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 5 ------------------------------------------------- Für Elise (opening period) */
{
  // 3/8, counted in eighths: 3 eighths per bar. Simplified single-line RH with
  // a sparse left-hand bass, as taught in most first editions.
  const S = 0.5; // a sixteenth = half an eighth-note beat
  const rh = [];
  let t = 0;
  const push = (midi, dur, vel = 0.8) => {
    rh.push(n(midi, t, dur * 0.95, vel));
    t += dur;
  };
  // pickup
  push(76, S); push(75, S);
  // bar 1
  push(76, S); push(75, S); push(76, S); push(71, S); push(74, S); push(72, S);
  // bar 2
  push(69, 1); push(60, S); push(64, S); push(69, S);
  // bar 3
  push(71, 1); push(64, S); push(68, S); push(71, S);
  // bar 4
  push(72, 1); push(64, S); push(76, S); push(75, S);
  // bar 5 (repeat of bar 1)
  push(76, S); push(75, S); push(76, S); push(71, S); push(74, S); push(72, S);
  // bar 6
  push(69, 1); push(60, S); push(64, S); push(69, S);
  // bar 7
  push(71, 1); push(64, S); push(72, S); push(71, S);
  // bar 8 — cadence
  push(69, 3, 0.85);

  const lh = [
    // one bass note or open fifth per bar of the accompaniment
    n(45, 1, 1.4, 0.6), n(52, 2.4, 0.6, 0.55),
    n(40, 4, 1.4, 0.6), n(52, 5.4, 0.6, 0.55),
    n(45, 7, 1.4, 0.6), n(52, 8.4, 0.6, 0.55),
    n(45, 10, 1.4, 0.6), n(52, 11.4, 0.6, 0.55),
    n(40, 13, 1.4, 0.6), n(52, 14.4, 0.6, 0.55),
    n(45, 16, 1.4, 0.6), n(52, 17.4, 0.6, 0.55),
    n(45, 19, 2.9, 0.6), n(57, 19, 2.9, 0.55),
  ];
  songs.push({
    id: 'fur-elise',
    title: 'Für Elise (opening)',
    composer: 'Ludwig van Beethoven',
    difficulty: 3,
    bpm: 68,
    timeSignature: [3, 8],
    tags: ['classical', 'famous'],
    description: 'The first period of WoO 59. Watch the E–D♯ semitone alternation; the checker will call out adjacent-key slips.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 6 ------------------------------------------ Bach, Prelude in C major, BWV 846 */
{
  // Each bar is the same broken-chord figure over five pitches, played twice:
  // LH takes pitches 0-1, RH takes 2-4, in continuous sixteenths.
  const bars = [
    [48, 52, 55, 60, 64], // C
    [48, 50, 57, 62, 65], // Dm7/C
    [47, 50, 55, 62, 65], // G7/B
    [48, 52, 55, 60, 64], // C
    [48, 52, 57, 64, 69], // Am7/C
    [48, 50, 57, 62, 66], // D7/C
    [47, 50, 55, 62, 67], // G/B
    [47, 48, 52, 55, 60], // Cmaj7/B
  ];
  const rh = [];
  const lh = [];
  bars.forEach((p, i) => {
    const t = i * 4;
    for (const half of [0, 2]) {
      const base = t + half;
      // LH: two sustained eighths
      lh.push(n(p[0], base, 0.95, 0.62), n(p[1], base + 0.5, 1.45, 0.6));
      // RH: 3 4 5 3 4 5 as sixteenths (6 notes over the remaining 1.5 beats)
      const figure = [p[2], p[3], p[4], p[2], p[3], p[4]];
      rh.push(...run(figure, base + 0.5, 0.25, 0.76, 0.24));
    }
  });
  songs.push({
    id: 'bach-prelude-c',
    title: 'Prelude in C, BWV 846 (bars 1–8)',
    composer: 'J. S. Bach',
    difficulty: 3,
    bpm: 72,
    timeSignature: [4, 4],
    tags: ['classical', 'baroque'],
    description: 'From The Well-Tempered Clavier. Pure broken chords, so the harmonic checker can name every chord you play over.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 7 ------------------------------------------------ Pachelbel, Canon in D */
{
  // The famous 8-bar ground bass, twice: first with the half-note melody,
  // then with an arpeggiated eighth-note variation over the same harmony.
  const bass = [50, 45, 47, 42, 43, 38, 43, 45]; // D A B F# G D G A
  const chords = [
    [50, 54, 57], [45, 49, 52], [47, 50, 54], [42, 45, 49],
    [43, 47, 50], [38, 42, 45], [43, 47, 50], [45, 49, 52],
  ];
  const melody = [
    [78, 76], [74, 73], [71, 69], [71, 73],
    [74, 73], [71, 69], [67, 66], [67, 64],
  ];
  const rh = [];
  const lh = [];
  bass.forEach((b, i) => {
    const t = i * 4;
    lh.push(n(b, t, 1.9, 0.68), n(b + 12, t + 2, 1.9, 0.6));
    rh.push(n(melody[i][0], t, 1.9, 0.82), n(melody[i][1], t + 2, 1.9, 0.82));
  });
  bass.forEach((b, i) => {
    const t = 32 + i * 4;
    lh.push(n(b, t, 1.9, 0.68), n(b + 12, t + 2, 1.9, 0.6));
    const c = chords[i].map((p) => p + 24); // same triad, two octaves up
    const shape = [c[0], c[1], c[2], c[0] + 12, c[2], c[1], c[0], c[1]];
    rh.push(...run(shape, t, 0.5, 0.76, 0.46));
  });
  songs.push({
    id: 'canon-in-d',
    title: 'Canon in D (practice arrangement)',
    composer: 'Johann Pachelbel',
    difficulty: 3,
    bpm: 66,
    timeSignature: [4, 4],
    tags: ['classical', 'famous'],
    description: 'The ground bass twice through: half-note melody first, then an eighth-note variation over the identical chords.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* 8 -------------------------------- Beethoven, Moonlight Sonata, mvt I (opening) */
{
  // 4/4 at a slow Adagio; RH plays continuous triplets, LH holds low octaves.
  const triplet = 1 / 3;
  const barShapes = [
    [[56, 61, 64], [56, 61, 64]], // C# minor
    [[56, 61, 64], [56, 61, 64]],
    [[57, 61, 64], [57, 62, 66]], // A major -> D major
    [[56, 60, 66], [56, 61, 64]], // G#7 -> C# minor
    [[56, 61, 64], [56, 61, 64]],
    [[56, 61, 64], [56, 61, 64]],
  ];
  const bassPerBar = [
    [37, 49], [37, 49], [33, 45], [32, 44], [37, 49], [37, 49],
  ];
  // The melody enters in bar 5 with the repeated G#4 dotted figure.
  const melody = [
    n(68, 16, 1.4, 0.88), n(68, 17.5, 0.4, 0.8), n(68, 18, 1.4, 0.86), n(68, 19.5, 0.4, 0.8),
    n(68, 20, 1.4, 0.88), n(69, 21.5, 0.4, 0.8), n(68, 22, 1.9, 0.86),
  ];
  const rh = [];
  const lh = [];
  barShapes.forEach((halves, i) => {
    const t = i * 4;
    halves.forEach((shape, half) => {
      for (let group = 0; group < 2; group += 1) {
        const start = t + half * 2 + group;
        rh.push(...run(shape, start, triplet, 0.62, triplet * 0.95));
      }
    });
    lh.push(...block(bassPerBar[i], t, 3.9, 0.72));
  });
  rh.push(...melody);
  songs.push({
    id: 'moonlight-i',
    title: 'Moonlight Sonata, mvt I (opening)',
    composer: 'Ludwig van Beethoven',
    difficulty: 4,
    bpm: 54,
    timeSignature: [4, 4],
    tags: ['classical', 'famous'],
    description: 'Op. 27 No. 2, bars 1–6. Even triplets under a singing top line; the timing report is brutally honest here.',
    tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
  });
}

/* =========================================================================
 * TWO-OCTAVE STUDIES
 *
 * Everything above is written for a full piano and spans three to four
 * octaves. On a 25-key controller (Akai MPK Mini and friends) those pieces can
 * only be practised folded, which bends the melodic contour. The studies below
 * are arranged to sit inside 24 semitones — two octaves plus the top key — so a
 * mini controller plays them exactly as written. Absolute register does not
 * matter: the app slides a piece into whatever octave your keybed is on.
 * ========================================================================= */

/**
 * Guard: a two-octave study that does not fit is a bug, not a piece.
 *
 * Fitting inside 24 semitones is necessary but not sufficient. The app can
 * only move a piece by whole octaves, so a study spanning exactly two octaves
 * starting on E can never line up with a keybed that starts on C. The check
 * therefore asks the real question: is there an octave at which this lands
 * inside C3–C5?
 */
function assertTwoOctaves(id, tracks) {
  const midis = tracks.flatMap((t) => t.notes).map((x) => x[0]);
  const low = Math.min(...midis);
  const high = Math.max(...midis);
  const fits = [-24, -12, 0, 12, 24].some((shift) => low + shift >= 48 && high + shift <= 72);
  if (!fits) {
    throw new Error(
      `${id} spans ${high - low} semitones (${low}–${high}) and lines up with no octave of a 25-key C keybed`,
    );
  }
}

/* 10 ------------------------------------------------- five-finger warm-up in C */
{
  // The first thing anyone plays on a new keyboard: five fingers, no thumb
  // crossing, both hands an octave apart.
  const figure = [60, 62, 64, 65, 67, 65, 64, 62];
  // Five fingers, no thumb crossing — the whole point of the exercise. The
  // right hand runs 1-2-3-4-5 up and back down; the left mirrors it, little
  // finger to thumb.
  const rhFingers = [1, 2, 3, 4, 5, 4, 3, 2];
  const lhFingers = [5, 4, 3, 2, 1, 2, 3, 4];
  const rh = [];
  const lh = [];
  for (let rep = 0; rep < 3; rep += 1) {
    const t = rep * 10;
    rh.push(...fingered(run(figure, t, 1, 0.78, 0.94), rhFingers), n(60, t + 8, 1.9, 0.78, 1));
    lh.push(
      ...fingered(run(figure.map((p) => p - 12), t, 1, 0.68, 0.94), lhFingers),
      n(48, t + 8, 1.9, 0.68, 5),
    );
  }
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('five-finger-c', tracks);
  songs.push({
    id: 'five-finger-c',
    title: 'Five-Finger Warm-up in C',
    composer: 'Exercise',
    difficulty: 1,
    bpm: 76,
    timeSignature: [4, 4],
    tags: ['exercise', '25-key'],
    description: 'C–G under five fingers, hands an octave apart. Fits a 25-key controller exactly as written.',
    tracks,
  });
}

/* 11 ------------------------------------------------ Twinkle, two-octave version */
{
  // Same tune as the full arrangement, but the left hand plays single roots
  // instead of spread chords so the whole thing lives inside two octaves.
  const phrases = [
    [60, 60, 67, 67, 69, 69, [67, 2]],
    [65, 65, 64, 64, 62, 62, [60, 2]],
    [67, 67, 65, 65, 64, 64, [62, 2]],
    [67, 67, 65, 65, 64, 64, [62, 2]],
    [60, 60, 67, 67, 69, 69, [67, 2]],
    [65, 65, 64, 64, 62, 62, [60, 2]],
  ];
  // One root per half bar, matching the harmony of the full arrangement.
  const roots = [
    [48, 48, 57, 55], [53, 48, 55, 48], [48, 53, 48, 55],
    [48, 53, 48, 55], [48, 48, 57, 55], [53, 48, 55, 48],
  ];
  const rh = [];
  const lh = [];
  let beat = 0;
  phrases.forEach((phrase, i) => {
    const barStart = beat;
    for (const step of phrase) {
      const [midi, dur] = Array.isArray(step) ? step : [step, 1];
      rh.push(n(midi, beat, dur * 0.94, 0.8));
      beat += dur;
    }
    roots[i].forEach((root, k) => lh.push(n(root, barStart + k * 2, 1.9, 0.62)));
  });
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('twinkle-mini', tracks);
  songs.push({
    id: 'twinkle-mini',
    title: 'Twinkle (two-octave version)',
    composer: 'Traditional',
    difficulty: 1,
    bpm: 92,
    timeSignature: [4, 4],
    tags: ['beginner', 'melody', '25-key'],
    description: 'The tune everyone knows, thinned to single bass notes so it fits a 25-key controller unaltered.',
    tracks,
  });
}

/* 12 --------------------------------------------- Ode to Joy, two-octave version */
{
  const bars = [
    [[64, 1], [64, 1], [65, 1], [67, 1]],
    [[67, 1], [65, 1], [64, 1], [62, 1]],
    [[60, 1], [60, 1], [62, 1], [64, 1]],
    [[64, 1.5], [62, 0.5], [62, 2]],
    [[64, 1], [64, 1], [65, 1], [67, 1]],
    [[67, 1], [65, 1], [64, 1], [62, 1]],
    [[60, 1], [60, 1], [62, 1], [64, 1]],
    [[62, 1.5], [60, 0.5], [60, 2]],
  ];
  // Roots and fifths only — the block triads of the full arrangement reach
  // down to F2, which a mini keyboard cannot cover alongside the melody.
  const bass = [
    [48, 48], [48, 55], [53, 48], [55, 55],
    [48, 48], [48, 55], [53, 48], [55, 48],
  ];
  const rh = [];
  const lh = [];
  bars.forEach((bar, i) => {
    const t = i * 4;
    let beat = 0;
    for (const [midi, dur] of bar) {
      rh.push(n(midi, t + beat, dur * 0.94, 0.82));
      beat += dur;
    }
    lh.push(n(bass[i][0], t, 1.9, 0.6), n(bass[i][1], t + 2, 1.9, 0.6));
  });
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('ode-to-joy-mini', tracks);
  songs.push({
    id: 'ode-to-joy-mini',
    title: 'Ode to Joy (two-octave version)',
    composer: 'Ludwig van Beethoven',
    difficulty: 2,
    bpm: 100,
    timeSignature: [4, 4],
    tags: ['classical', 'melody', '25-key'],
    description: 'The first eight bars over a walking bass instead of block chords — two hands inside two octaves.',
    tracks,
  });
}

/* 13 ------------------------------------------- chord shapes, close position in C */
{
  // Close-position triads only: the same harmony the full arpeggio study
  // teaches, but with nothing more than an octave between the hands.
  // Fingering per voicing, low note first. Close position means 1-3-5 almost
  // throughout; the inversions that put a second between the top two take
  // 1-2-5 instead, which is the moment a hand has to actually reshape.
  const progression = [
    ['C', [60, 64, 67], 48, [1, 3, 5]],
    ['Am', [60, 64, 69], 57, [1, 2, 5]],
    ['F', [60, 65, 69], 53, [1, 2, 5]],
    ['G7', [59, 62, 65], 55, [1, 3, 5]],
    ['C', [60, 64, 67], 48, [1, 3, 5]],
    ['Dm', [62, 65, 69], 50, [1, 3, 5]],
    ['G7', [59, 62, 65], 55, [1, 3, 5]],
    ['C', [60, 64, 67], 48, [1, 3, 5]],
  ];
  const rh = [];
  const lh = [];
  for (let rep = 0; rep < 2; rep += 1) {
    progression.forEach(([, voicing, root, fingers], i) => {
      const t = rep * 16 + i * 2;
      rh.push(...fingered(block(voicing, t, 1.85, 0.72), fingers));
      lh.push(n(root, t, 1.85, 0.6, 5));
    });
  }
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('chord-shapes-c', tracks);
  songs.push({
    id: 'chord-shapes-c',
    title: 'Chord Shapes in C (close position)',
    composer: 'Exercise',
    difficulty: 2,
    bpm: 72,
    timeSignature: [4, 4],
    tags: ['exercise', 'chords', '25-key'],
    description: 'I–vi–IV–V7–I–ii–V7–I with the right hand never leaving one position. Gives the harmony checker real chords on a mini keyboard.',
    tracks,
  });
}

/* 14 --------------------------------------------- Für Elise, two-octave version */
{
  const S = 0.5; // a sixteenth, counted against the 3/8 eighth-note beat
  // Transposed from A minor to C minor. A mini keybed starts on C and the app
  // can only move a piece by whole octaves, so an A-minor arrangement would
  // have to squeeze into fifteen semitones to line up — narrower than the
  // theme itself. Moving the key instead keeps every interval of the original.
  const T = -9;
  const rh = [];
  let t = 0;
  const push = (midi, dur, vel = 0.8) => {
    rh.push(n(midi + T, t, dur * 0.95, vel));
    t += dur;
  };
  const bass = (midi, start, dur, vel) => n(midi + T, start, dur, vel);
  push(76, S); push(75, S);
  push(76, S); push(75, S); push(76, S); push(71, S); push(74, S); push(72, S);
  push(69, 1); push(60, S); push(64, S); push(69, S);
  push(71, 1); push(64, S); push(68, S); push(71, S);
  push(72, 1); push(64, S); push(76, S); push(75, S);
  push(76, S); push(75, S); push(76, S); push(71, S); push(74, S); push(72, S);
  push(69, 1); push(60, S); push(64, S); push(69, S);
  push(71, 1); push(64, S); push(72, S); push(71, S);
  push(69, 3, 0.85);

  // The published bass sits on A2/E2, two octaves below the melody. Lifted to
  // sit just under the right hand it outlines the same A minor / E harmony and
  // keeps the whole study inside nineteen semitones, so it lines up with a
  // mini keybed whichever octave that keybed happens to be on.
  const lh = [
    bass(57, 1, 1.4, 0.6), bass(64, 2.4, 0.6, 0.5),
    bass(64, 4, 1.4, 0.6), bass(59, 5.4, 0.6, 0.5),
    bass(57, 7, 1.4, 0.6), bass(64, 8.4, 0.6, 0.5),
    bass(57, 10, 1.4, 0.6), bass(64, 11.4, 0.6, 0.5),
    bass(64, 13, 1.4, 0.6), bass(59, 14.4, 0.6, 0.5),
    bass(57, 16, 1.4, 0.6), bass(64, 17.4, 0.6, 0.5),
    bass(57, 19, 2.9, 0.6),
  ];
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('fur-elise-mini', tracks);
  songs.push({
    id: 'fur-elise-mini',
    title: 'Für Elise (two-octave version, C minor)',
    composer: 'Ludwig van Beethoven',
    difficulty: 3,
    bpm: 68,
    timeSignature: [3, 8],
    tags: ['classical', 'famous', '25-key'],
    description: 'The opening period transposed to C minor with the bass lifted — every interval of the original, inside a 25-key reach.',
    tracks,
  });
}

/* 15 --------------------------------------------------- Greensleeves (trad.) */
{
  // 6/8 counted in eighths. The tune everyone half-knows, and the first piece
  // here in a minor key with a raised leading note, which gives the wrong-note
  // checker a genuinely interesting decision to make.
  // Transposed from A minor to D minor. In A minor the tune plus a bass low
  // enough to sit under it spans twenty-five semitones — one more than a mini
  // keyboard reaches, which would leave a single note folding an octave and
  // lurching. Moving the key costs nothing and keeps every interval.
  const T = -7;
  const rh = [];
  let t = 0;
  const push = (midi, dur, vel = 0.8) => {
    rh.push(n(midi + T, t, dur * 0.94, vel));
    t += dur;
  };
  push(69, 1);
  push(72, 2); push(74, 1); push(76, 1.5); push(77, 0.5); push(76, 1);
  push(74, 2); push(71, 1); push(67, 1.5); push(69, 0.5); push(71, 1);
  push(72, 2); push(69, 1); push(69, 1.5); push(68, 0.5); push(69, 1);
  push(71, 2); push(68, 1); push(64, 3);
  push(69, 2); push(72, 1); push(74, 1.5); push(76, 0.5); push(74, 1);
  push(72, 2); push(69, 1); push(68, 1.5); push(66, 0.5); push(68, 1);
  push(69, 3, 0.85);

  // Single roots under the melody: i, VII, i, V, i. The dominant sits above
  // rather than below, which keeps the whole piece inside two octaves.
  const bass = (midi, start, dur, vel) => n(midi + T, start, dur, vel);
  const lh = [
    bass(57, 1, 2.8, 0.6), bass(55, 4, 2.8, 0.6),
    bass(57, 7, 2.8, 0.6), bass(64, 10, 2.8, 0.6),
    bass(57, 13, 2.8, 0.6), bass(55, 16, 2.8, 0.6),
    bass(64, 19, 2.8, 0.6), bass(57, 22, 2.9, 0.6),
  ];
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('greensleeves', tracks);
  songs.push({
    id: 'greensleeves',
    title: 'Greensleeves (D minor)',
    composer: 'Traditional',
    difficulty: 2,
    bpm: 108,
    timeSignature: [6, 8],
    tags: ['traditional', 'melody', '25-key'],
    description: 'Sixteenth-century English, moved to D minor so it fits two octaves. The raised leading note gives the harmony checker something to think about.',
    tracks,
  });
}

/* 16 ------------------------------------------------- Scarborough Fair (trad.) */
{
  // Dorian mode: a minor tune with a major sixth, which is exactly the case a
  // naive key detector gets wrong. Worth having for that alone.
  const bars = [
    [[69, 3]], [[69, 1], [76, 1], [76, 1]], [[76, 1.5], [78, 0.5], [76, 1]], [[74, 3]],
    [[72, 1], [69, 1], [71, 1]], [[72, 3]], [[74, 2], [72, 1]], [[69, 3]],
    [[69, 1], [76, 1], [76, 1]], [[78, 1.5], [76, 0.5], [74, 1]], [[72, 3]], [[69, 3]],
  ];
  // Moved to D dorian, and the F root lifted an octave rather than swapped for
  // something else: dropping to F3 under a melody that reaches F#5 would span
  // twenty-five semitones, and changing the chord would lose the Dorian colour
  // that makes the tune worth having here.
  const T = -7;
  const bass = [57, 57, 55, 55, 65, 65, 55, 57, 57, 55, 65, 57];
  const rh = [];
  const lh = [];
  bars.forEach((bar, i) => {
    const start = i * 3;
    let beat = 0;
    for (const [midi, dur] of bar) {
      rh.push(n(midi + T, start + beat, dur * 0.94, 0.8));
      beat += dur;
    }
    lh.push(n(bass[i] + T, start, 2.85, 0.58));
  });
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('scarborough-fair', tracks);
  songs.push({
    id: 'scarborough-fair',
    title: 'Scarborough Fair (D dorian)',
    composer: 'Traditional',
    difficulty: 2,
    bpm: 96,
    timeSignature: [3, 4],
    tags: ['traditional', 'melody', '25-key'],
    description: 'Dorian mode — a minor tune with a major sixth in it. Slow, spacious, and unforgiving about even timing.',
    tracks,
  });
}

/* 17 ------------------------------------- Amazing Grace (Southern Harmony, 1835) */
{
  const bars = [
    [[67, 1]],
    [[72, 2], [76, 0.5], [72, 0.5]],
    [[76, 2], [74, 1]],
    [[72, 2], [69, 1]],
    [[67, 3]],
    [[67, 1], [69, 1], [72, 1]],
    [[72, 2], [69, 1]],
    [[67, 3]],
    [[72, 2], [76, 0.5], [72, 0.5]],
    [[76, 2], [74, 1]],
    [[72, 3]],
  ];
  // F major rather than C: the dominant bass sits a fourth under the tonic, and
  // in C that puts the lowest note on G3 — which no octave of a C-based mini
  // keybed lines up with. F is a standard key for this hymn anyway.
  const T = -7;
  const bass = [null, 60, 60, 65, 60, 60, 55, 60, 60, 65, 60];
  const rh = [];
  const lh = [];
  let cursor = 0;
  bars.forEach((bar, i) => {
    let beat = 0;
    for (const [midi, dur] of bar) {
      rh.push(n(midi + T, cursor + beat, dur * 0.94, 0.8));
      beat += dur;
    }
    if (bass[i] !== null) lh.push(n(bass[i] + T, cursor, Math.min(2.85, beat) * 0.95, 0.58));
    cursor += beat;
  });
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('amazing-grace', tracks);
  songs.push({
    id: 'amazing-grace',
    title: 'Amazing Grace',
    composer: 'Traditional',
    difficulty: 1,
    bpm: 84,
    timeSignature: [3, 4],
    tags: ['traditional', 'beginner', 'melody', '25-key'],
    description: 'Pentatonic throughout, so there is no wrong black key to hit — a gentle first piece in three-four.',
    tracks,
  });
}

/* 18 ------------------------------------ Joplin, The Entertainer (opening strain) */
{
  // Ragtime: syncopation against a steady bass, which is the point. The timing
  // report earns its keep here more than anywhere else in the library.
  const S = 0.5;
  const rh = [];
  let t = 0;
  const push = (midi, dur, vel = 0.82) => {
    rh.push(n(midi, t, dur * 0.92, vel));
    t += dur;
  };
  push(75, S); push(76, S); push(72, S);
  push(69, 1); push(72, S); push(69, S); push(72, 1);
  push(75, S); push(76, S); push(72, S);
  push(69, 1); push(72, S); push(69, S); push(72, 1);
  push(75, S); push(76, S); push(72, S); push(69, 1);
  push(72, S); push(76, S); push(72, 1);
  push(74, S); push(71, S); push(72, 3, 0.85);

  // The dominant takes its fifth in the bass rather than its third: a bass B
  // would drop the piece below what a mini keyboard can reach alongside the
  // melody, and G7/D is an ordinary voicing anyway.
  const lh = [
    n(60, 1.5, 0.9, 0.55), n(64, 3.5, 0.9, 0.55),
    n(60, 5.5, 0.9, 0.55), n(64, 7.5, 0.9, 0.55),
    n(60, 9.5, 0.9, 0.55), n(64, 11.5, 0.9, 0.55),
    n(62, 13.5, 0.9, 0.55), n(60, 15.5, 2.5, 0.55),
  ];
  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('entertainer', tracks);
  songs.push({
    id: 'entertainer',
    title: 'The Entertainer (opening strain)',
    composer: 'Scott Joplin',
    difficulty: 3,
    bpm: 92,
    timeSignature: [2, 4],
    tags: ['ragtime', 'famous', '25-key'],
    description: 'Ragtime, thinned to a single-line right hand over an off-beat bass. Syncopation against a steady pulse — the timing report earns its keep here.',
    tracks,
  });
}

/* 19 ------------------------------- Beethoven, Symphony No. 5 (opening motif) */
{
  // Short-short-short-long, twice, then stated again — the four notes everyone
  // can hum. Deliberately just the opening: the development that follows is
  // orchestral writing that does not thin down to two hands honestly.
  const S = 0.5; // an eighth at this tempo
  const rh = [];
  const lh = [];
  let t = 0;

  /** One statement: three repeated eighths into a held note. */
  const motif = (repeated, held, holdBeats) => {
    t += S; // the rest the piece famously begins on
    for (let i = 0; i < 3; i += 1) {
      rh.push(n(repeated, t, S * 0.85, 0.86));
      lh.push(n(repeated - 12, t, S * 0.85, 0.72));
      t += S;
    }
    rh.push(n(held, t, holdBeats * 0.95, 0.9));
    lh.push(n(held - 12, t, holdBeats * 0.95, 0.75));
    t += holdBeats + S;
  };

  motif(67, 63, 3); // G G G  E♭
  motif(65, 62, 3); // F F F  D
  motif(67, 63, 2);
  motif(65, 62, 4);

  const tracks = [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }];
  assertTwoOctaves('beethoven-fifth', tracks);
  songs.push({
    id: 'beethoven-fifth',
    key: ['C', 'minor'],
    title: 'Symphony No. 5 (opening motif)',
    composer: 'Ludwig van Beethoven',
    difficulty: 1,
    bpm: 108,
    timeSignature: [2, 4],
    tags: ['classical', 'famous', '25-key'],
    description: 'Four notes, hands in octaves. The whole exercise is landing the three short ones evenly and holding the long one honestly.',
    tracks,
  });
}

/* ------------------------------------------------------------------ emit MIDI */

function toMidiFile(song) {
  const midi = new Midi();
  midi.header.setTempo(song.bpm);
  midi.header.timeSignatures = [];
  midi.header.update();
  const spb = 60 / song.bpm;

  for (const track of song.tracks) {
    const t = midi.addTrack();
    t.name = track.hand === 'left' ? 'Left Hand' : 'Right Hand';
    t.channel = track.hand === 'left' ? 1 : 0;
    t.instrument.number = 0; // Acoustic Grand Piano
    for (const [midiNote, startBeat, durBeats, vel] of track.notes) {
      t.addNote({
        midi: midiNote,
        time: startBeat * spb,
        duration: Math.max(durBeats * spb, 0.05),
        velocity: vel,
      });
    }
  }
  return midi;
}

/* ============================================================== THE PATH
 * Fifteen graded exercises in five stages, the curriculum behind src/lib/path.js.
 *
 * Every one of them lives inside C3–C5. That is not a coincidence and not a
 * convenience: it is exactly a 25-key controller at its factory octave, so a
 * beginner is never graded on an arrangement the fitting engine had to
 * compromise. `assertTwoOctaves` enforces it.
 *
 * The reading exercises (13, 14) deliberately carry no fingering. Numbers over
 * the notes would let you follow the fingering instead of reading the pitch,
 * which is the one thing those two exist to prevent.
 */
{
  const exercise = ({ id, title, difficulty, bpm, description, tracks, timeSignature = [4, 4] }) => {
    assertTwoOctaves(id, tracks);
    songs.push({
      id,
      title,
      composer: 'Exercise',
      difficulty,
      bpm,
      timeSignature,
      // Stated, never estimated. Several of these use too few pitch classes for
      // detection to mean anything — exercise 5 is one repeated G.
      key: ['C', 'major'],
      tags: ['exercise', 'path', '25-key'],
      description,
      tracks,
    });
  };

  const HOME_FIVE = [60, 62, 64, 65, 67, 65, 64, 62];
  const HOME_FINGERS = [1, 2, 3, 4, 5, 4, 3, 2];

  /* -- Stage 1: the hand ---------------------------------------------- */

  {
    const rh = [];
    for (let rep = 0; rep < 3; rep += 1) {
      rh.push(...fingered(run(HOME_FIVE, rep * 8, 1, 0.78, 0.94), HOME_FINGERS));
    }
    rh.push(n(60, 24, 3.9, 0.78, 1));
    exercise({
      id: 'path-01-home-five-right',
      title: 'Home Five — Right Hand',
      difficulty: 1,
      bpm: 60,
      description:
        'Fingers 1–5 rest on C–G and stay there. Up 1-2-3-4-5, down 5-4-3-2-1, one note per beat. No finger leaves its key.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    const shape = [48, 50, 52, 53, 55, 53, 52, 50];
    const fingers = [5, 4, 3, 2, 1, 2, 3, 4];
    const lh = [];
    for (let rep = 0; rep < 3; rep += 1) {
      lh.push(...fingered(run(shape, rep * 8, 1, 0.7, 0.94), fingers));
    }
    lh.push(n(48, 24, 3.9, 0.7, 5));
    exercise({
      id: 'path-02-home-five-left',
      title: 'Home Five — Left Hand',
      difficulty: 1,
      bpm: 60,
      description:
        'The same shape in the weaker hand, fingers 5-4-3-2-1 on C–G. Expect it to lag the right by a tempo rung or two — closing that gap is the point.',
      tracks: [{ hand: 'left', notes: lh }],
    });
  }

  {
    const lhShape = [48, 50, 52, 53, 55, 53, 52, 50];
    const lhFingers = [5, 4, 3, 2, 1, 2, 3, 4];
    const rh = [];
    const lh = [];
    for (let rep = 0; rep < 3; rep += 1) {
      rh.push(...fingered(run(HOME_FIVE, rep * 8, 1, 0.76, 0.94), HOME_FINGERS));
      lh.push(...fingered(run(lhShape, rep * 8, 1, 0.68, 0.94), lhFingers));
    }
    rh.push(n(60, 24, 3.9, 0.76, 1));
    lh.push(n(48, 24, 3.9, 0.68, 5));
    exercise({
      id: 'path-03-mirror-hands',
      title: 'Mirror Hands',
      difficulty: 1,
      bpm: 60,
      description:
        'Both hands an octave apart. The pitches move in parallel while the finger numbers move in opposite directions — the standard first hands-together drill.',
      tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
    });
  }

  /* -- Stage 2: the pulse --------------------------------------------- */

  {
    // Non-adjacent pairs, weakest first. Fingers 1 and 5 stay resting on their
    // keys throughout, which is what stops the hand rocking to help the 4th.
    const pairs = [
      { notes: [62, 65], fingers: [2, 4] },
      { notes: [64, 67], fingers: [3, 5] },
      { notes: [62, 67], fingers: [2, 5] },
      { notes: [60, 64], fingers: [1, 3] },
    ];
    const rh = [];
    pairs.forEach((pair, i) => {
      for (let k = 0; k < 8; k += 1) {
        rh.push(n(pair.notes[k % 2], i * 8 + k, 0.94, 0.78, pair.fingers[k % 2]));
      }
    });
    exercise({
      id: 'path-04-finger-ladders',
      title: 'Finger Ladders',
      difficulty: 2,
      bpm: 72,
      description:
        'Alternating non-adjacent fingers: 2-4, then 3-5, then 2-5, then 1-3. Watch the evenness score — a dependent fourth finger shows up as a lumpy line, not a wrong note.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    // One pitch, so nothing but rhythm is being tested.
    const rh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      const t = rep * 16;
      for (let k = 0; k < 4; k += 1) rh.push(n(67, t + k, 0.94, 0.78, 3));
      rh.push(n(67, t + 4, 1.9, 0.78, 3), n(67, t + 6, 1.9, 0.78, 3));
      for (let k = 0; k < 8; k += 1) rh.push(n(67, t + 8 + k * 0.5, 0.45, 0.78, 3));
      rh.push(
        n(67, t + 12, 0.94, 0.78, 3),
        n(67, t + 13, 0.45, 0.78, 3),
        n(67, t + 13.5, 0.45, 0.78, 3),
        n(67, t + 14, 0.94, 0.78, 3),
        n(67, t + 15, 0.45, 0.78, 3),
        n(67, t + 15.5, 0.45, 0.78, 3),
      );
    }
    exercise({
      id: 'path-05-long-and-short',
      title: 'Long and Short',
      difficulty: 2,
      bpm: 72,
      description:
        'A bar of quarters, a bar of halves, a bar of eighths, a bar of both — all on one note, so only the rhythm is being judged. Turn the metronome on.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    // The anchor is held for the whole bar while the other fingers work. Every
    // beginner fakes this one by letting the anchor lift; the note-off is what
    // catches it.
    const rh = [];
    for (let rep = 0; rep < 4; rep += 1) {
      const t = rep * 8;
      rh.push(
        n(67, t, 3.9, 0.7, 5),
        n(60, t, 0.9, 0.8, 1),
        n(62, t + 1, 0.9, 0.8, 2),
        n(64, t + 2, 0.9, 0.8, 3),
      );
      rh.push(
        n(60, t + 4, 3.9, 0.7, 1),
        n(64, t + 4, 0.9, 0.8, 3),
        n(65, t + 5, 0.9, 0.8, 4),
        n(67, t + 6, 0.9, 0.8, 5),
      );
    }
    exercise({
      id: 'path-06-the-anchor',
      title: 'The Anchor',
      difficulty: 2,
      bpm: 66,
      description:
        'Hold finger 5 down on G for the whole bar while 1-2-3 play underneath it. Then anchor the thumb on C and work 3-4-5. The held note must still be down when the bar ends.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  /* -- Stage 3: the thumb --------------------------------------------- */

  {
    const shape = [60, 62, 64, 65, 64, 62, 60];
    const fingers = [1, 2, 3, 1, 3, 2, 1];
    const rh = [];
    for (let rep = 0; rep < 4; rep += 1) {
      rh.push(...fingered(run(shape, rep * 8, 1, 0.78, 0.94), fingers));
    }
    exercise({
      id: 'path-07-thumb-crossing',
      title: 'Thumb Crossing',
      difficulty: 2,
      bpm: 66,
      description:
        'C-D-E with 1-2-3, then tuck the thumb under the third finger to reach F. Wrist level, elbow still. A bad tuck shows up as a late note on exactly that beat, every time.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  const SCALE_RH = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
  const SCALE_RH_FINGERS = [1, 2, 3, 1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 2, 1];

  {
    const rh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      const notes = fingered(run(SCALE_RH, rep * 16, 1, 0.78, 0.94), SCALE_RH_FINGERS);
      notes[notes.length - 1] = n(60, rep * 16 + 14, 1.9, 0.78, 1);
      rh.push(...notes);
    }
    exercise({
      id: 'path-08-scale-right',
      title: 'C Major, One Octave — Right Hand',
      difficulty: 2,
      bpm: 72,
      description:
        'The benchmark. 1-2-3-1-2-3-4-5 up, 5-4-3-2-1-3-2-1 down. This exercise never changes, at this tempo, so every run of it is comparable with every other — that is what makes the progress chart honest.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    const lhShape = [48, 50, 52, 53, 55, 57, 59, 60, 59, 57, 55, 53, 52, 50, 48];
    const lhFingers = [5, 4, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 4, 5];
    const rh = [];
    const lh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      const right = fingered(run(SCALE_RH, rep * 16, 1, 0.76, 0.94), SCALE_RH_FINGERS);
      right[right.length - 1] = n(60, rep * 16 + 14, 1.9, 0.76, 1);
      const left = fingered(run(lhShape, rep * 16, 1, 0.68, 0.94), lhFingers);
      left[left.length - 1] = n(48, rep * 16 + 14, 1.9, 0.68, 5);
      rh.push(...right);
      lh.push(...left);
    }
    exercise({
      id: 'path-09-scale-together',
      title: 'C Major, One Octave — Hands Together',
      difficulty: 3,
      bpm: 72,
      description:
        'Both hands in parallel octaves, C3 to C5 — the full width of a 25-key controller, exactly. Each hand crosses its thumb at a different moment, which is the whole difficulty.',
      tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
    });
  }

  /* -- Stage 4: the chord --------------------------------------------- */

  {
    // One shape, moved up the scale. Root position throughout so the fingering
    // never changes and the hand learns the geometry rather than the notes.
    const triads = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72]];
    const rh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      triads.forEach((triad, i) => {
        const shape = [triad[0], triad[1], triad[2], triad[1]];
        rh.push(...fingered(run(shape, rep * 16 + i * 4, 1, 0.78, 0.94), [1, 3, 5, 3]));
      });
    }
    exercise({
      id: 'path-10-broken-triads',
      title: 'Broken Triads',
      difficulty: 3,
      bpm: 72,
      description:
        'C, D minor, E minor, F — the same 1-3-5 shape walked up the scale. Up and back down each bar. Misfires cluster on the third finger; the wrong-note list will name them.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    const prog = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]];
    const fingers = [5, 3, 1];
    const lh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      prog.forEach((chord, i) => {
        chord.forEach((midi, k) => lh.push(n(midi, rep * 16 + i * 4, 3.9, 0.7, fingers[k])));
      });
    }
    exercise({
      id: 'path-11-block-chords',
      title: 'I–IV–V–I',
      difficulty: 3,
      bpm: 72,
      description:
        'The harmonic spine of almost everything, in the left hand: C, F, G, C. All three notes of each chord must arrive together, or they score as separate events.',
      tracks: [{ hand: 'left', notes: lh }],
    });
  }

  {
    const rh = [];
    [0.3, 0.55, 0.85].forEach((vel, i) => {
      rh.push(...fingered(run(HOME_FIVE, i * 8, 1, vel, 0.94), HOME_FINGERS));
    });
    // A crescendo across the final pass, quiet to loud over eight notes.
    HOME_FIVE.forEach((midi, k) => {
      rh.push(n(midi, 24 + k, 0.94, 0.3 + (k / (HOME_FIVE.length - 1)) * 0.62, HOME_FINGERS[k]));
    });
    exercise({
      id: 'path-12-loud-and-soft',
      title: 'Loud and Soft',
      difficulty: 3,
      bpm: 76,
      description:
        'The home five shape played quiet, medium, loud, then growing across the last pass. Graded gently on purpose — mini-keys have a coarse velocity curve, and this should measure your hand, not your hardware.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  /* -- Stage 5: the page ---------------------------------------------- */

  {
    // 2nds and 3rds only: the distance is the thing being read, not the note.
    const shape = [60, 62, 64, 62, 60, 64, 67, 65, 64, 67, 71, 69, 67, 65, 64, 62, 60];
    const rh = [];
    for (let rep = 0; rep < 2; rep += 1) rh.push(...run(shape, rep * 18, 1, 0.78, 0.94));
    exercise({
      id: 'path-13-steps-and-skips',
      title: 'Steps and Skips',
      difficulty: 3,
      bpm: 72,
      description:
        'Seconds and thirds, nothing else. Switch to the staff view and turn labels off — you are reading the distance between notes, not their names. No fingering is written, deliberately.',
      tracks: [{ hand: 'right', notes: rh }],
    });
  }

  {
    // Four landmarks first, then their neighbours, alternating clefs so the
    // bass staff gets the same attention as the treble.
    const seq = [
      [0, 'r', 60], [2, 'l', 53], [4, 'r', 67], [6, 'l', 55],
      [8, 'r', 72], [10, 'l', 52], [12, 'r', 62], [14, 'l', 53],
      [16, 'r', 71], [18, 'l', 50], [20, 'r', 69], [22, 'l', 48],
      [24, 'r', 60], [26, 'l', 53],
    ];
    const rh = [];
    const lh = [];
    for (const [beat, hand, midi] of seq) {
      (hand === 'r' ? rh : lh).push(n(midi, beat, 1.9, hand === 'r' ? 0.78 : 0.7));
    }
    exercise({
      id: 'path-14-landmarks',
      title: 'Landmark Notes',
      difficulty: 3,
      bpm: 76,
      description:
        'Bass F, middle C, treble G, treble C — the four anchors you read everything else from, then their neighbours. Half notes, so there is time to work it out. Bass clef is where beginners are always weakest.',
      tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
    });
  }

  {
    // Melody over a held bass: two hands doing genuinely different jobs. The
    // bridge out of exercises and into the library.
    const melody = [
      [64, 1, 3], [64, 1, 3], [65, 1, 4], [67, 1, 5],
      [67, 1, 5], [65, 1, 4], [64, 1, 3], [62, 1, 2],
      [60, 1, 1], [60, 1, 1], [62, 1, 2], [64, 1, 3],
      [64, 1.5, 3], [62, 0.5, 2], [62, 2, 2],
    ];
    const bass = [[48, 0, 5], [48, 4, 5], [48, 8, 5], [55, 12, 1]];
    const rh = [];
    const lh = [];
    for (let rep = 0; rep < 2; rep += 1) {
      let beat = rep * 16;
      for (const [midi, dur, finger] of melody) {
        rh.push(n(midi, beat, dur * 0.94, 0.8, finger));
        beat += dur;
      }
      for (const [midi, at, finger] of bass) lh.push(n(midi, rep * 16 + at, 3.9, 0.62, finger));
    }
    exercise({
      id: 'path-15-melody-and-hold',
      title: 'Melody and Hold',
      difficulty: 3,
      bpm: 88,
      description:
        'The Ode to Joy opening in the right hand over a held bass in the left. Two hands, two different jobs. Pass this and the piece it came from is yours.',
      tracks: [{ hand: 'right', notes: rh }, { hand: 'left', notes: lh }],
    });
  }
}

mkdirSync(OUT, { recursive: true });

const manifest = songs.map((song) => {
  const midi = toMidiFile(song);
  const file = `${song.id}.mid`;
  const bytes = midi.toArray();
  writeFileSync(resolve(OUT, file), Buffer.from(bytes));

  // Fingering rides alongside the notes by position, so it is only correct if
  // the app reads back exactly as many notes as we wrote, in the same order.
  // Wrong fingering teaches a bad habit that is harder to unlearn than no
  // fingering at all, so this is checked rather than assumed.
  const fingering = fingeringFor(song);
  if (fingering) {
    const reparsed = new Midi(new Uint8Array(bytes).buffer);
    const back = reparsed.tracks
      .flatMap((t) => t.notes.map((x) => ({ midi: x.midi, time: x.time })))
      .sort((a, b) => a.time - b.time || a.midi - b.midi);
    if (back.length !== fingering.length) {
      throw new Error(
        `${song.id}: wrote ${fingering.length} fingerings but the file reads back ${back.length} notes`,
      );
    }
  }

  const all = song.tracks.flatMap((t) => t.notes);
  const lowest = Math.min(...all.map((x) => x[0]));
  const highest = Math.max(...all.map((x) => x[0]));
  const lastEnd = Math.max(...all.map((x) => x[1] + x[2]));

  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    difficulty: song.difficulty,
    tags: song.tags,
    description: song.description,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    // Stated where we know it — estimation cannot find a tonic that never sounds.
    key: song.key ?? null,
    fingering,
    url: `/songs/${file}`,
    noteCount: all.length,
    range: [lowest, highest],
    approxDuration: Number((lastEnd * (60 / song.bpm)).toFixed(1)),
  };
});

// Hand-written MusicXML fixture, kept in the library so the MusicXML import
// path is always one click away (see public/songs/twinkle-musicxml.musicxml).
manifest.push({
  id: 'twinkle-musicxml',
  title: 'Twinkle (MusicXML import)',
  composer: 'Traditional',
  difficulty: 1,
  tags: ['beginner', 'musicxml'],
  description: 'The same tune read from MusicXML instead of MIDI — two staves, block chords and a tie across the barline.',
  bpm: 92,
  timeSignature: [4, 4],
  url: '/songs/twinkle-musicxml.musicxml',
  noteCount: 32,
  range: [41, 69],
  approxDuration: 13,
});

writeFileSync(resolve(OUT, 'songs.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${manifest.length} songs to ${OUT}`);
for (const m of manifest) {
  console.log(
    `  ${m.id.padEnd(20)} ${String(m.noteCount).padStart(4)} notes  ` +
      `range ${m.range[0]}-${m.range[1]}  ~${m.approxDuration}s`,
  );
}
