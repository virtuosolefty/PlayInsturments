import { describe, expect, it } from 'vitest';
import { BASS_TUNING, FRETTED, frettedMidi } from './fretted.js';
import { PracticeSession } from './matcher.js';
import { noteName } from './theory.js';

describe('bass tuning', () => {
  it('tunes the bass an octave below the guitar’s four lowest strings', () => {
    expect(BASS_TUNING.map(midi => noteName(midi))).toEqual(['E1', 'A1', 'D2', 'G2']);
    expect(BASS_TUNING).toEqual([40, 45, 50, 55].map(midi => midi - 12));
  });

  it('finds the note at a string and fret, and nothing off the instrument', () => {
    expect(frettedMidi('bass', 0, 3)).toBe(31);
    for (const [string, fret] of [[-1, 0], [4, 0], [0, -1], [0, 13], [1, 2.5]]) expect(frettedMidi('bass', string, fret)).toBeNull();
    expect(frettedMidi('banjo', 0, 0)).toBeNull();
  });
});

for (const instrument of ['bass']) {
  const kit = FRETTED[instrument];
  describe(`${instrument} lessons and songs`, () => {
    it('are playable scores: placed notes in order, each record consistent', () => {
      expect(kit.lessons.length).toBeGreaterThanOrEqual(6);
      expect(kit.songs).toHaveLength(10);
      expect(kit.studies).toEqual([...kit.lessons, ...kit.songs]);
      expect(new Set(kit.studies.map(study => study.id)).size).toBe(kit.studies.length);
      for (const score of kit.studies) {
        expect(score.id.startsWith(`${instrument}-`), score.id).toBe(true);
        expect(score.instrument, score.id).toBe(instrument);
        expect(score.variant, score.id).toBe(`${instrument}:standard:12`);
        expect(score.title, score.id).toBeTruthy();
        expect(score.description.length, score.id).toBeGreaterThan(20);
        score.notes.forEach((note, index) => {
          expect(frettedMidi(instrument, note.string, note.fret), score.id).toBe(note.midi);
          expect(note.name, score.id).toBe(noteName(note.midi));
          expect(note.id).toBe(index);
          const before = score.notes.slice(0, index).filter(prior => prior.string === note.string).at(-1);
          if (before) expect(note.time, score.id).toBeGreaterThanOrEqual(before.time + before.duration);
          if (index) expect(note.time, score.id).toBeGreaterThanOrEqual(score.notes[index - 1].time);
        });
        expect(score.noteCount).toBe(score.notes.length);
        expect(score.duration).toBeCloseTo(score.notes.at(-1).time + score.notes.at(-1).duration);
        expect(score.range).toEqual([Math.min(...score.notes.map(note => note.midi)), Math.max(...score.notes.map(note => note.midi))]);
      }
    });

    it('keep to first position, a finger to a fret', () => {
      for (const score of kit.studies) for (const note of score.notes) {
        expect(note.fret, score.id).toBeLessThanOrEqual(5);
        expect(note.finger, score.id).toBe(note.fret === 0 ? 0 : Math.min(4, note.fret));
      }
    });

    it('build a path of lessons only, starting with the open strings', () => {
      const lessons = new Set(kit.lessons.map(lesson => lesson.id));
      const onPath = kit.pathStages.flatMap(stage => stage.exercises);
      expect(onPath).toEqual(kit.lessons.map(lesson => lesson.id));
      for (const id of onPath) expect(lessons.has(id), id).toBe(true);
      expect(kit.firstLesson).toBe(`${instrument}-open-strings`);
      expect(onPath[0]).toBe(kit.firstLesson);
      for (const stage of kit.pathStages) { expect(stage.name).toBeTruthy(); expect(stage.goal).toBeTruthy(); }
    });

    it('are judged by the shared matcher', () => {
      for (const score of [kit.lessons[0], kit.lessons.at(-1), kit.songs[0]]) {
        const session = new PracticeSession(score);
        for (const note of score.notes) session.noteOn(note.midi, note.time, note.velocity);
        expect(session.targets.every(note => note.status === 'hit'), score.id).toBe(true);
      }
    });
  });
}

describe('the bass’s own things', () => {
  it('has no chords: a bass plays one note at a time', () => {
    expect(FRETTED.bass.chords).toEqual([]);
    for (const lesson of FRETTED.bass.lessons) {
      const times = lesson.notes.map(note => note.time);
      expect(new Set(times).size, lesson.id).toBe(times.length);
    }
  });

  it('plays the roots of G, C and D on the beat', () => {
    const roots = FRETTED.bass.lessons.find(lesson => lesson.id === 'bass-root-notes');
    expect([...new Set(roots.notes.map(note => note.name))]).toEqual(['G1', 'C2', 'D2']);
    expect(roots.notes.at(-1).name).toBe('G1');
  });

  it('plays its songs low, where a bass lives', () => {
    for (const song of FRETTED.bass.songs) expect(song.range[1], song.id).toBeLessThanOrEqual(BASS_TUNING[3] + 4);
  });
});
