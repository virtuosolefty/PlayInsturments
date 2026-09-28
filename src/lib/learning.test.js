import { describe, expect, it } from 'vitest';
import { lessonOutcome, recommendedLesson, learningRecord, lessonCanVisit, comfortableRate, lessonSettings } from './learning.js';
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
  it('recommends mastery within the current stage if all its exercises merely passed', () => {
    const state=pathState(id=>STAGES[0].exercises.includes(id)?[run(3)]:[]);
    expect(state.currentId).toBeNull();
    expect(recommendedLesson(state)).toBe(STAGES[0].exercises[0]);
    expect(state.exercises[recommendedLesson(state)].unlocked).toBe(true);
  });
  it('uses a separate guitar path with the same pass and mastery thresholds', () => {
    const first='guitar-open-strings';
    expect(pathState(()=>[run(5,'wait')],GUITAR_PATH_STAGES).passedCount).toBe(0);
    expect(pathState(id=>id===first?[run(3)]:[],GUITAR_PATH_STAGES).stages[1].unlocked).toBe(false);
    expect(pathState(id=>id===first?[run(4)]:[],GUITAR_PATH_STAGES).exercises['guitar-first-frets'].unlocked).toBe(true);
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
