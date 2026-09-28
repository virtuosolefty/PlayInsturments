import { describe, expect, it } from 'vitest';
import { keyLight, PIANO_COLORS, soundingNotes, stageChords, stageNoteBounds } from './pianoStage.js';
import { migrateSettings } from './settings.js';

const note={midi:60,time:2,duration:2,hand:'left'};
const key={x:10,w:20};
describe('notes meeting the keyboard',()=>{
  it('lands precisely at onset and consumes the held tail above the keys',()=>{
    expect(stageNoteBounds(note,key,1,100,400)).toMatchObject({top:100,bottom:300,h:200});
    expect(stageNoteBounds(note,key,2,100,400)).toMatchObject({top:200,bottom:400,h:200});
    expect(stageNoteBounds(note,key,3,100,400)).toMatchObject({top:300,bottom:400,h:100});
    expect(stageNoteBounds(note,key,4,100,400)).toBeNull();
  });
  it('clips the far end and ignores off-screen or unplayable pitches',()=>{
    expect(stageNoteBounds({...note,duration:10},key,0,100,400).top).toBe(0);
    expect(stageNoteBounds({...note,time:9},key,0,100,400)).toBeNull();
    expect(stageNoteBounds(note,null,0,100,400)).toBeNull();
  });
  it('starts and stops illumination at the score boundaries',()=>{
    const score={notes:[note]};
    expect(soundingNotes(score,1.999).size).toBe(0);
    expect(soundingNotes(score,2).get(60)).toBe(note);
    expect(soundingNotes(score,4).size).toBe(0);
  });
  it('releases playback lights on pause without releasing a player-held key',()=>{
    const target=new Map([[60,note]]);
    expect(keyLight(60,new Map(),target,true)).toBe(PIANO_COLORS.left);
    expect(keyLight(60,new Map(),target,false)).toBeNull();
    expect(keyLight(60,new Map([[60,{type:'correct'}]]),target,false)).toBe(PIANO_COLORS.left);
    expect(keyLight(60,new Map([[60,{type:'wrong'}]]),target,true)).toBe(PIANO_COLORS.missed);
  });
  it('does not light unplayed practice targets or forget the two hand colors',()=>{
    expect(keyLight(60,new Map(),new Map([[60,note]]))).toBeNull();
    expect(keyLight(55,new Map([[55,{type:'free'}]]),new Map())).toBe(PIANO_COLORS.left);
    expect(keyLight(64,new Map([[64,{type:'free'}]]),new Map())).toBe(PIANO_COLORS.right);
  });
});
describe('reference-style chord annotations',()=>{
  it('labels a complete voiced chord and leaves scales and dyads unlabelled',()=>{
    const score={notes:[60,64,67].map(midi=>({...note,midi}))};
    expect(stageChords(score)).toEqual([{time:2,symbol:'C',midi:60}]);
    expect(stageChords({notes:score.notes.slice(0,2)})).toEqual([]);
    expect(stageChords({notes:score.notes.map((n,i)=>({...n,time:i}))})).toEqual([]);
  });
});
describe('presentation upgrade',()=>{
  it('migrates the old default key size without changing audio or range choices',()=>{
    const next=migrateSettings({settingsVersion:3,renderer:'gl',referenceAudio:true,pianoHeight:164,pianoRange:'two'});
    expect(next).toMatchObject({settingsVersion:5,renderer:'gl',referenceAudio:true,pianoHeight:104,pianoRange:'two',pianoLabels:'octaves'});
  });
  it('keeps deliberately customized key sizes and label modes',()=>{
    expect(migrateSettings({settingsVersion:3,pianoHeight:200,pianoLabels:'keys'})).toMatchObject({pianoHeight:200,pianoLabels:'keys'});
  });
  it('opens the dimensional piano once, then remembers a later 2D choice',()=>{
    expect(migrateSettings({settingsVersion:4,renderer:'canvas'}).renderer).toBe('gl');
    expect(migrateSettings({settingsVersion:5,renderer:'canvas'}).renderer).toBe('canvas');
    expect(migrateSettings({settingsVersion:4,practiceInstrument:'guitar',renderer:'canvas'}).renderer).toBe('canvas');
  });
});
