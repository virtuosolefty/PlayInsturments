import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTS, PICKER, chooseVariant, familyOf, instrumentForStudy, instrumentInfo, instrumentKit, isStringed, normalizeInstrument, stringKit, studyIdFor, usesKit, variantsOf,
} from './instruments.js';
import { GUITAR_STUDIES } from './guitar.js';
import { DRUM_STUDIES } from './drums.js';

describe('instrument registry', () => {
  it('lists the six instruments in picker order, families side by side', () => {
    expect(INSTRUMENTS).toEqual(['piano', 'guitar', 'bass', 'violin', 'cello', 'drums']);
    for (const id of INSTRUMENTS) { expect(instrumentInfo(id).tagline, id).toBeTruthy(); expect(instrumentInfo(id).detail, id).toBeTruthy(); }
    INSTRUMENTS.forEach(id => expect(instrumentInfo(id).label).toMatch(/^[A-Z]/));
  });
  it('lists five instruments in the pickers, the bass behind the guitar', () => {
    expect(PICKER).toEqual(['piano', 'guitar', 'violin', 'cello', 'drums']);
    expect(PICKER.every(id => INSTRUMENTS.includes(id))).toBe(true);
    expect(familyOf('bass')).toBe('guitar');
    expect(PICKER.map(familyOf)).toEqual(PICKER);
    // Every instrument is reached from exactly one button.
    expect(new Set(INSTRUMENTS.map(familyOf))).toEqual(new Set(PICKER));
    expect(variantsOf('guitar')).toEqual(['guitar', 'bass']);
    expect(variantsOf('bass')).toEqual(['guitar', 'bass']);
    expect(variantsOf('violin')).toBeNull();
    expect(variantsOf('piano')).toBeNull();
  });
  it('opens the kind of an instrument the player used last, and the plain one otherwise', () => {
    expect(chooseVariant(undefined, 'guitar')).toBe('guitar');
    expect(chooseVariant({ guitar: 'bass' }, 'guitar')).toBe('bass');
    expect(chooseVariant({ guitar: 'bass' }, 'violin')).toBe('violin');
    // A saved choice that is not a kind of that family is ignored, as is one for an instrument with only one kind.
    expect(chooseVariant({ guitar: 'cello', cello: 'cello' }, 'guitar')).toBe('guitar');
    expect(chooseVariant({ cello: 'bass' }, 'cello')).toBe('cello');
    // An instrument that is no longer offered: someone who last played the viola gets the violin.
    expect(chooseVariant({ violin: 'viola' }, 'violin')).toBe('violin');
  });
  it('falls back to piano for unknown or missing ids', () => {
    expect(normalizeInstrument('banjo')).toBe('piano');
    expect(normalizeInstrument('ukulele')).toBe('piano');
    expect(normalizeInstrument('bass')).toBe('bass');
    expect(normalizeInstrument(undefined)).toBe('piano');
    expect(normalizeInstrument('cello')).toBe('cello');
  });
  it('treats every string instrument alike, and the piano apart', () => {
    expect(INSTRUMENTS.filter(isStringed)).toEqual(['guitar', 'bass', 'violin', 'cello']);
    expect(stringKit('piano')).toBeNull();
    // Each string kit is one or the other: plucked on frets, or bowed.
    expect(INSTRUMENTS.filter(id => stringKit(id)?.fretted)).toEqual(['guitar', 'bass']);
    expect(INSTRUMENTS.filter(id => stringKit(id)?.bowed)).toEqual(['violin', 'cello']);
  });
  it('gives the drums a kit of studies without calling them a string instrument', () => {
    expect(isStringed('drums')).toBe(false);
    expect(stringKit('drums')).toBeNull();
    expect(INSTRUMENTS.filter(usesKit)).toEqual(['guitar', 'bass', 'violin', 'cello', 'drums']);
    const drums = instrumentKit('drums');
    expect(drums.drums).toBe(true);
    expect(drums.lessons).toBe(DRUM_STUDIES);
    expect(drums.studies.slice(0, DRUM_STUDIES.length)).toEqual(DRUM_STUDIES);
    expect(drums.studyKey).toBe('drumsStudyId');
    expect(drums.firstLesson).toBe('drums-meet-the-kit');
    expect(drums.pathStages.flatMap(stage => stage.exercises)).toEqual(DRUM_STUDIES.map(study => study.id));
    expect(instrumentKit('guitar')).toBe(stringKit('guitar'));
    expect(instrumentKit('piano')).toBeNull();
  });
  it('restores and finds drum studies like any other', () => {
    expect(studyIdFor({}, 'drums')).toBe('drums-meet-the-kit');
    expect(studyIdFor({ drumsStudyId: 'drums-backbeat' }, 'drums')).toBe('drums-backbeat');
    expect(instrumentForStudy('drums-first-beat')).toBe('drums');
  });
  it('keeps the guitar lessons and the saved guitar study key unchanged', () => {
    expect(stringKit('guitar').lessons).toBe(GUITAR_STUDIES);
    expect(stringKit('guitar').studies.slice(0, GUITAR_STUDIES.length)).toEqual(GUITAR_STUDIES);
    expect(stringKit('guitar').studyKey).toBe('guitarStudyId');
    expect(stringKit('guitar').bowed).toBe(false);
  });
  it('gives each bowed instrument its own tuning, pitch lookup and saved study', () => {
    const violin = stringKit('violin');
    expect(violin.bowed).toBe(true);
    expect(violin.tuning).toEqual([55, 62, 69, 76]);
    expect(violin.midi(2, 2)).toBe(71);
    expect(stringKit('cello').midi(0, 0)).toBe(36);
    expect(violin.studyKey).toBe('violinStudyId');
  });
  it('restores the saved study, or the first one, for each instrument', () => {
    expect(studyIdFor({ celloStudyId: 'cello-d-major' }, 'cello')).toBe('cello-d-major');
    expect(studyIdFor({ celloStudyId: 'missing' }, 'cello')).toBe('cello-open-strings');
    expect(studyIdFor({}, 'guitar')).toBe('guitar-open-strings');
    expect(studyIdFor({}, 'piano')).toBeNull();
  });
  it('gives every kit ten songs after its lessons, open to all and on no path', () => {
    for (const id of INSTRUMENTS.filter(usesKit)) {
      const kit = instrumentKit(id);
      expect(kit.songs, id).toHaveLength(10);
      expect(kit.songsLabel, id).toBeTruthy();
      expect(kit.studies, id).toEqual([...kit.lessons, ...kit.songs]);
      expect(new Set(kit.studies.map(study => study.id)).size, id).toBe(kit.studies.length);
      const onPath = new Set(kit.pathStages.flatMap(stage => stage.exercises));
      for (const song of kit.songs) {
        expect(onPath.has(song.id), song.id).toBe(false);
        expect(song.instrument, song.id).toBe(id);
        expect(song.easy, song.id).toBe(true);
      }
      // The path is made of lessons, and every lesson is on it or was written for free practice.
      for (const exercise of onPath) expect(kit.lessons.some(lesson => lesson.id === exercise), exercise).toBe(true);
    }
  });
  it('falls back to the first lesson, never a song, when no study is saved', () => {
    for (const id of INSTRUMENTS.filter(usesKit)) expect(studyIdFor({}, id), id).toBe(instrumentKit(id).lessons[0].id);
    expect(studyIdFor({ guitarStudyId: 'guitar-jingle-bells' }, 'guitar')).toBe('guitar-jingle-bells');
    expect(instrumentForStudy('cello-happy-birthday')).toBe('cello');
    expect(instrumentForStudy('drums-pop-rock')).toBe('drums');
  });
  it('gives the bass its tuning, string names and a study key of its own', () => {
    const bass = stringKit('bass');
    expect(bass.tuning).toEqual([28, 33, 38, 43]);
    expect(bass.stringName(0)).toEqual({ note: 'E', number: 4 });
    expect(bass.midi(1, 3)).toBe(36);
    expect(bass.chords).toEqual([]);
    expect([0, 1, 2, 3].map(s => bass.stringName(s).note)).toEqual(['E', 'A', 'D', 'G']);
    expect(bass.studyKey).toBe('bassStudyId');
    expect(stringKit('guitar').stringName(0)).toEqual({ note: 'E', number: 6 });
    expect(stringKit('guitar').chords.map(chord => chord.name)).toContain('Em');
  });
  it('says what the 3D stage has for each fretted instrument, and which model a bowed one is played on', () => {
    expect(stringKit('guitar').stage).toBe('drawn');
    expect(stringKit('bass')).toMatchObject({ stage: 'model', model: 'guitar-bass' });
    expect(stringKit('violin').model).toBe('violin');
    expect(stringKit('cello').model).toBe('cello');
    expect([0, 1, 2, 3, 4, 5].map(s => stringKit('guitar').wound(s))).toEqual([true, true, true, false, false, false]);
    expect(stringKit('bass').wound(3)).toBe(true);
  });
  it('finds the instrument a study belongs to', () => {
    expect(instrumentForStudy('ukulele-first-c')).toBeNull();
    expect(instrumentForStudy('bass-walking-line')).toBe('bass');
    expect(instrumentForStudy('guitar-first-em')).toBe('guitar');
    expect(instrumentForStudy('violin-twinkle')).toBe('violin');
    expect(instrumentForStudy('cello-c-major')).toBe('cello');
    expect(instrumentForStudy('twinkle-mini')).toBeNull();
  });
});
