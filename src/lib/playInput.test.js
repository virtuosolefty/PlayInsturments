import { describe, it, expect, vi } from 'vitest';
vi.mock('./audio.js',()=>({audio:{start:vi.fn()}}));
import { PlayInput } from './playInput.js';
import { guitarFeedback } from './instrumentView.js';
describe('instrument voice ownership',()=>{
  it('turns a tap released during audio unlock into a short, safely released note',async()=>{
    vi.useFakeTimers();
    let unlock;const emit=vi.fn(),input=new PlayInput(()=>new Promise(r=>{unlock=r;}),emit);
    const pending=input.press('pointer-1',60);input.release('pointer-1');unlock();await pending;
    expect(emit.mock.calls.map(([m])=>m.type)).toEqual(['noteon']);
    vi.runAllTimers();
    expect(emit.mock.calls.map(([m])=>m.type)).toEqual(['noteon','noteoff']);
    expect(input.held.size).toBe(0);expect(input.tails.size).toBe(0);
    vi.useRealTimers();
  });
  it('does not resurrect a pending note after blur or a range change',async()=>{
    let unlock;const emit=vi.fn(),input=new PlayInput(()=>new Promise(r=>{unlock=r;}),emit);
    const pending=input.press('pointer-1',60);input.clear();unlock();await pending;
    expect(emit).not.toHaveBeenCalled();expect(input.held.size).toBe(0);
  });
  it('waits for both a pointer and a typing key to release the same pitch',async()=>{
    const emit=vi.fn(),input=new PlayInput(async()=>{},emit);
    await input.press('pointer-1',60);await input.press('typing-a',60);input.release('pointer-1');
    expect(emit.mock.calls.map(([m])=>m.type)).toEqual(['noteon']);
    input.release('typing-a');expect(emit.mock.calls.map(([m])=>m.type)).toEqual(['noteon','noteoff']);
  });
  it('releases the old pitch before a glide and keeps independent voices held',async()=>{
    const emit=vi.fn(),input=new PlayInput(async()=>{},emit);
    await input.press('pointer-1',60,.9);await input.press('pointer-2',64);await input.press('pointer-1',62,.4);
    expect(emit.mock.calls.map(([m])=>[m.type,m.midi])).toEqual([['noteon',60],['noteon',64],['noteoff',60],['noteon',62]]);
    expect(emit.mock.calls.at(-1)[0].velocity).toBe(.4);
    input.clear();expect(input.held.size).toBe(0);
  });
  it('releases sustain and every owned note on blur cleanup',async()=>{
    const emit=vi.fn(),input=new PlayInput(async()=>{},emit);
    await input.press('typing-a',60);input.sustain(true);input.clear();
    expect(emit.mock.calls.map(([m])=>m.type)).toEqual(['noteon','sustain','noteoff','sustain']);
    expect(emit.mock.calls.at(-1)[0].value).toBe(false);
  });
  it('reports failed unlocks without leaving a held voice',async()=>{
    const error=new Error('Audio unavailable'),input=new PlayInput(async()=>{throw error;},vi.fn());input.error=vi.fn();
    await input.press('pointer-1',60);expect(input.held.size).toBe(0);expect(input.error).toHaveBeenCalledWith(error);
  });
});
describe('honest guitar position feedback',()=>{
  const openB={string:4,fret:0,midi:59},samePitch={string:3,fret:4,midi:59};
  it('only fills the exact string that was picked',()=>{
    const positions=new Map([[4,openB]]),active=new Map([[59,{}]]);
    expect(guitarFeedback(openB,active,positions,false,false,false)).toBe('held');
    expect(guitarFeedback(samePitch,active,positions,false,false,false)).toBe('idle');
  });
  it('shows possibilities when MIDI has pitch but no string information',()=>{
    for(const position of [openB,samePitch])expect(guitarFeedback(position,new Map([[59,{}]]),new Map(),false,false,false)).toBe('possible');
  });
  it('does not call a target or selected chord a played note',()=>{
    expect(guitarFeedback(openB,new Map(),new Map(),true,false,false)).toBe('target');
    expect(guitarFeedback(openB,new Map(),new Map(),false,true,false)).toBe('chord');
  });
});
