import { describe,it,expect } from 'vitest';
import { INSTRUMENTS, instrumentKit } from './instruments.js';
import { COLLECTIONS as ALL_COLLECTIONS, FIRST_LESSON as FIRST_LESSONS, pieceDetails as detailsOf, sharedLessonUrl as lessonUrl } from './discovery.js';
import { weeklyPractice,collectionEntries,pieceDetails,sharedLessonUrl,COLLECTIONS } from './discovery.js';
import { lessonCanVisit,lessonOutcome } from './learning.js';
import fs from 'node:fs';

describe('discovery, habit and first-phrase safeguards',()=>{
  it('uses real activity in the current local Monday–Sunday week, not visits or future data',()=>{
    const week=weeklyPractice({'2026-09-20':{completedRuns:1},'2026-09-21':{seconds:179},'2026-09-22':{seconds:180},'2026-09-23':{completedRuns:1},'2026-09-25':{completedRuns:1}},3,'2026-09-24');
    expect(week.count).toBe(2);expect(week.days[0].date).toBe('2026-09-21');expect(week.days[6].date).toBe('2026-09-27');expect(week.days[4].done).toBe(false);
  });
  it('handles the year boundary and normalizes unsupported weekly goals',()=>{
    const week=weeklyPractice({},-1,'2027-01-01');expect(week.goal).toBe(3);expect(week.days[0].date).toBe('2026-12-28');expect(week.days[6].date).toBe('2027-01-03');
    expect(weeklyPractice({},5).goal).toBe(5);
  });
  it('curates only existing entries for each instrument and leaves favorites in their original order',()=>{
    const piano=JSON.parse(fs.readFileSync(new URL('../../public/songs/songs.json',import.meta.url)));
    for(const [instrument,entries] of [['piano',piano],['guitar',instrumentKit('guitar').studies]])for(const c of COLLECTIONS[instrument])expect(collectionEntries(entries,instrument,c.id).map(e=>e.id)).toEqual(c.ids);
    expect(collectionEntries(piano,'piano','favorites',['missing','twinkle-mini']).map(e=>e.id)).toEqual(['twinkle-mini']);
  });
  it('labels actual score length separately from a promised learning time',()=>{
    expect(pieceDetails({id:'path-01-home-five-right',approxDuration:27.9,difficulty:1})).toMatchObject({length:'28s of music',needs:'No experience needed'});
  });
  it('shares only a lesson identifier and instrument, with query text encoded',()=>{
    const url=new URL(sharedLessonUrl('guitar','x&score=100','https://example.org'));
    expect([...url.searchParams.keys()]).toEqual(['instrument','lesson']);expect(url.searchParams.get('lesson')).toBe('x&score=100');
    expect(sharedLessonUrl('guitar','guitar-open-strings','https://example.org','/PlayInsturments/'))
      .toBe('https://example.org/PlayInsturments/?instrument=guitar&lesson=guitar-open-strings');
  });
  it('allows a quick first phrase only after a played note and never turns it into mastery',()=>{
    expect(lessonCanVisit('note',{quick:true})).toBe(true);expect(lessonCanVisit('follow',{quick:true})).toBe(false);
    expect(lessonCanVisit('follow',{quick:true,firstNoteDone:true})).toBe(true);expect(lessonCanVisit('check',{quick:true,firstNoteDone:true})).toBe(false);
    expect(lessonOutcome({mode:'wait',rate:1,grade:{complete:true,stars:5}}).kind).toBe('guided');
  });
});

describe('every instrument on the learning home', () => {
  it('has a first lesson and collections to browse', () => {
    for (const instrument of INSTRUMENTS) {
      expect(FIRST_LESSONS[instrument], instrument).toBeTruthy();
      expect(ALL_COLLECTIONS[instrument]?.length, instrument).toBeGreaterThan(0);
    }
  });

  it('fills a kit instrument\'s collections from its own studies, each one once', () => {
    for (const instrument of INSTRUMENTS) {
      const kit = instrumentKit(instrument);
      if (!kit) continue;
      const studies = new Set(kit.studies.map(study => study.id));
      const listed = ALL_COLLECTIONS[instrument].flatMap(collection => collection.ids);
      expect(studies.has(FIRST_LESSONS[instrument]), instrument).toBe(true);
      for (const id of listed) expect(studies.has(id), id).toBe(true);
      expect(new Set(listed).size, instrument).toBe(listed.length);
    }
  });

  it('describes a drum lesson by what it teaches', () => {
    const kit = instrumentKit('drums');
    expect(ALL_COLLECTIONS.drums.flatMap(collection => collection.ids).sort()).toEqual(kit.studies.map(study => study.id).sort());
    const first = detailsOf(kit.lessons[0]);
    expect(first.skill).toBe('Find every drum and cymbal');
    expect(first.level).toBe('First steps');
    expect(detailsOf(kit.lessons.at(-1)).level).toBe('Building confidence');
  });

  it('gives every instrument a collection of ten songs or beats it already knows', () => {
    const piano = JSON.parse(fs.readFileSync(new URL('../../public/songs/songs.json', import.meta.url)));
    for (const instrument of INSTRUMENTS) {
      const collection = ALL_COLLECTIONS[instrument].find(each => each.id === 'songs');
      expect(collection?.ids, instrument).toHaveLength(10);
      const entries = instrumentKit(instrument)?.studies ?? piano;
      for (const id of collection.ids) {
        const entry = entries.find(each => each.id === id);
        expect(entry, id).toBeTruthy();
        // A song says what it is in its own words, and none of them asks for experience it has not got.
        expect(detailsOf(entry).skill, id).toBe(entry.description);
        expect(['First steps', 'Building confidence']).toContain(detailsOf(entry).level);
      }
    }
  });

  it('shares a drum lesson with a link that opens the drums', () => {
    const url = new URL(lessonUrl('drums', 'drums-backbeat', 'https://example.test', '/'));
    expect(url.searchParams.get('instrument')).toBe('drums');
    expect(url.searchParams.get('lesson')).toBe('drums-backbeat');
  });
});
