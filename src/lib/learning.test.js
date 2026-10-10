import { describe, expect, it } from 'vitest';
import { lessonOutcome, recommendedLesson, learningRecord, lessonCanVisit, comfortableRate, lessonSettings, noteInstruction, lessonReady, lessonWords } from './learning.js';
import { pathState, dailySet, STAGES } from './path.js';
import { GUITAR_PATH_STAGES, GUITAR_STUDIES } from './guitar.js';
const run = (stars=4, mode='practice',rate=1) => ({stars,mode,rate});
const result = (mode,rate,stars,complete=true) => ({mode,rate,grade:{complete,stars}});
describe('beginner learning rules', () => {
  it('never calls a wait run or slow run a passed mastery check', () => {
    expect(lessonOutcome(result('wait',1,5)).kind).toBe('guided');
    expect(lessonOutcome(result('practice',.65,5)).kind).toBe('practice');
    expect(lessonOutcome(result('practice',1,3)).kind).toBe('passed');
    expect(lessonOutcome(result('practice',1,4)).kind).toBe('mastered');
    expect(lessonOutcome(result('practice',1,5,false)).kind).toBe('incomplete');
  });
  it('recommends the next unfinished lesson once a stage is finished', () => {
    const state=pathState(id=>STAGES[0].exercises.includes(id)?[run(3)]:[]);
    expect(recommendedLesson(state)).toBe(STAGES[1].exercises[0]);
    expect(state.exercises[recommendedLesson(state)].unlocked).toBe(true);
  });
  it('recommends an unpassed check, then mastery, once every lesson is finished', () => {
    const all=STAGES.flatMap(stage=>stage.exercises);
    const guidedOnly=pathState(id=>id===all[0]?[run(3)]:[run(5,'wait')]);
    expect(recommendedLesson(guidedOnly)).toBe(all[1]);
    const passedOnly=pathState(id=>id===all[0]?[run(4)]:[run(3)]);
    expect(recommendedLesson(passedOnly)).toBe(all[1]);
    expect(recommendedLesson(pathState(()=>[run(5)]))).toBe(all[0]);
  });
  it('uses a separate guitar path with the same rules: guided runs open lessons and pass no checks', () => {
    const first='guitar-open-strings';
    expect(pathState(()=>[run(5,'wait')],GUITAR_PATH_STAGES).passedCount).toBe(0);
    expect(pathState(id=>id===first?[run(5,'wait')]:[],GUITAR_PATH_STAGES).stages[1].unlocked).toBe(true);
    expect(pathState(id=>id===first?[run(5,'wait')]:[],GUITAR_PATH_STAGES).exercises['guitar-first-frets'].unlocked).toBe(true);
    expect(pathState(()=>[],GUITAR_PATH_STAGES).stages[1].unlocked).toBe(false);
  });
  it('tells a learner the next lesson is open after a guided or a slow run', () => {
    expect(lessonOutcome(result('wait',1,5)).message).toMatch(/next lesson is open/i);
    expect(lessonOutcome(result('practice',.65,5)).message).toMatch(/next lesson is open/i);
    expect(lessonOutcome(result('practice',1,2)).message).toMatch(/next lesson is open/i);
    expect(lessonOutcome(result('practice',1,5,false)).message).not.toMatch(/next lesson is open/i);
  });
  it('picks only guitar exercises for a guitar daily session', () => {
    const state=pathState(()=>[],GUITAR_PATH_STAGES);
    const items=dailySet(state,{dayKey:'2026-09-27',library:GUITAR_STUDIES});
    expect(items.map(s=>s.songId)).toEqual(['guitar-open-strings','guitar-first-frets']);
    expect(items.every(s=>GUITAR_STUDIES.some(g=>g.id===s.songId))).toBe(true);
  });
  it('sanitizes stale step names and caps tempo without discarding completed learning', () => {
    const data=learningRecord({step:'bad',rate:4,completed:{one:{guided:true}}});
    expect(data.step).toBe('sound'); expect(data.rate).toBe(1);expect(data.completed.one.guided).toBe(true);
  });
  it('requires sound confirmation, a note, a demo and practice before each next step', () => {
    expect(lessonCanVisit('note',{})).toBe(false);
    expect(lessonCanVisit('note',{soundConfirmed:true})).toBe(true);
    expect(lessonCanVisit('follow',{firstNoteDone:true})).toBe(false);
    expect(lessonCanVisit('follow',{listened:true})).toBe(true);
    expect(lessonCanVisit('check',{followed:true})).toBe(false);
    expect(lessonCanVisit('check',{practised:true})).toBe(true);
  });
  it('raises tempo by a small step and checks only at written tempo', () => {
    expect(comfortableRate(.65)).toBe(.75);expect(comfortableRate(.95)).toBe(1);
    expect(lessonSettings('check',.65)).toMatchObject({mode:'practice',rate:1,loop:null,referenceAudio:false});
    expect(lessonSettings('follow',.65)).toMatchObject({mode:'wait',rate:.65});
  });
});

describe('when a lesson is ready to play', () => {
  const lesson = { id: 'path-01-home-five-right' };
  const ready = (state = {}) => lessonReady({ active: true, lesson, loading: false, error: null, score: { id: lesson.id }, ...state });

  it('is ready once the lesson’s own score is showing', () => {
    expect(ready()).toBe(true);
  });

  it('is not ready before the lesson itself is known, while the library is still loading', () => {
    // No lesson and no score yet: two missing ids must not count as a match.
    expect(ready({ lesson: undefined, score: undefined })).toBe(false);
    expect(ready({ lesson: undefined, score: null })).toBe(false);
  });

  it('is not ready while loading, after an error, outside a lesson, or with another piece showing', () => {
    expect(ready({ loading: true })).toBe(false);
    expect(ready({ error: 'The lesson could not load.' })).toBe(false);
    expect(ready({ active: false })).toBe(false);
    expect(ready({ score: { id: 'something-else' } })).toBe(false);
    expect(ready({ score: undefined })).toBe(false);
  });
});

describe('note instructions for each instrument', () => {
  it('names the fret for guitar and keeps the old boolean form working', () => {
    const note = { name: 'B3', string: 4, fret: 0, finger: 0 };
    expect(noteInstruction(note, 'guitar')).toBe('B3 · string 2 · open (no finger)');
    expect(noteInstruction({ ...note, fret: 2, finger: 2, name: 'C#4' }, true)).toBe('C#4 · string 2 · fret 2 · finger 2');
  });
  it('names the string and finger for violin and cello', () => {
    expect(noteInstruction({ name: 'B4', string: 2, fret: 2, finger: 1 }, 'violin')).toBe('B4 · A string · finger 1');
    expect(noteInstruction({ name: 'C2', string: 0, fret: 0, finger: 0 }, 'cello')).toBe('C2 · C string · open (no finger)');
  });
  it('numbers a bass string out of four', () => {
    expect(noteInstruction({ name: 'E1', string: 0, fret: 0, finger: 0 }, 'bass')).toBe('E1 · string 4 · open (no finger)');
  });
  it('keeps piano instructions short', () => {
    expect(noteInstruction({ name: 'C4', finger: 1 }, 'piano')).toBe('C4 · finger 1');
    expect(noteInstruction({ name: 'C4' }, false)).toBe('C4');
  });
});


describe('the words a lesson uses for what is played', () => {
  it('speaks of notes on a pitched instrument', () => {
    for (const instrument of ['piano', 'guitar', 'violin', 'cello']) {
      const words = lessonWords(instrument);
      expect(words.different('C4')).toBe('You played a different note. Look for C4. Take your time.');
      expect(words.follow[0]).toBe('Find the notes. Take your time.');
      expect(words.find).toBe('Now find the notes →');
      expect(words.glossary).toBeUndefined();
    }
  });

  it('speaks of drums on the kit', () => {
    const words = lessonWords('drums');
    expect(words.different('Kick')).toBe('That was a different drum. Look for Kick. Take your time.');
    expect(words.follow[0]).toBe('Find each drum. Take your time.');
    expect(words.follow[1]).toContain('until you hit the next drum');
    expect(words.below).toBe('Or hit this drum on the kit below.');
    expect(words.find).toBe('Now find the drums →');
    // A drummer is not told where middle C is.
    expect(words.glossary).toContain('kick');
    expect(words.glossary).not.toContain('C4');
  });

  it('falls back to notes for an instrument it does not know', () => {
    expect(lessonWords(undefined)).toBe(lessonWords('piano'));
  });
});
