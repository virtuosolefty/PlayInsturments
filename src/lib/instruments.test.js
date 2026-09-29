import { describe, expect, it } from 'vitest';
import {
  INSTRUMENTS, instrumentForStudy, instrumentInfo, isStringed, normalizeInstrument, stringKit, studyIdFor,
} from './instruments.js';
import { GUITAR_STUDIES } from './guitar.js';

describe('instrument registry', () => {
  it('lists piano, guitar, violin and cello in picker order', () => {
    expect(INSTRUMENTS).toEqual(['piano', 'guitar', 'violin', 'cello']);
    INSTRUMENTS.forEach(id => expect(instrumentInfo(id).label).toMatch(/^[A-Z]/));
  });
  it('falls back to piano for unknown or missing ids', () => {
    expect(normalizeInstrument('viola')).toBe('piano');
    expect(normalizeInstrument(undefined)).toBe('piano');
    expect(normalizeInstrument('cello')).toBe('cello');
  });
  it('treats every string instrument alike, and the piano apart', () => {
    expect(INSTRUMENTS.filter(isStringed)).toEqual(['guitar', 'violin', 'cello']);
    expect(stringKit('piano')).toBeNull();
  });
  it('keeps the guitar studies and the saved guitar study key unchanged', () => {
    expect(stringKit('guitar').studies).toBe(GUITAR_STUDIES);
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
  it('finds the instrument a study belongs to', () => {
    expect(instrumentForStudy('guitar-first-em')).toBe('guitar');
    expect(instrumentForStudy('violin-twinkle')).toBe('violin');
    expect(instrumentForStudy('cello-c-major')).toBe('cello');
    expect(instrumentForStudy('twinkle-mini')).toBeNull();
  });
});
