import { useCallback, useEffect, useRef } from 'react';
import { playInput } from '../lib/playInput.js';
import { guitarMidi } from '../lib/guitar.js';
/** Per-string voices let independently picked strings ring together. */
export function useGuitarInput() {
  const activePositions = useRef(new Map());
  const state = useRef({ generation:0, timers:new Set() });
  const silence = useCallback(() => {
    state.current.generation++; state.current.timers.forEach(clearTimeout); state.current.timers.clear();
    playInput.releasePrefix('guitar-'); activePositions.current.clear();
  }, []);
  useEffect(()=>{window.addEventListener('blur',silence);return()=>{window.removeEventListener('blur',silence);silence();};},[silence]);
  const pluck = useCallback((positions, {direction='down', strength=.72, spread=32}={}) => {
    const notes=direction==='up'?[...positions].reverse():positions;
    const generation=state.current.generation;
    const later=(fn,ms)=>{const timer=setTimeout(()=>{state.current.timers.delete(timer);if(generation===state.current.generation)fn();},ms);state.current.timers.add(timer);};
    notes.forEach((position,index)=>later(()=>{
      const {string,fret}=position, midi=guitarMidi(string,fret); if(midi==null)return;
      const entry={string,fret,midi,at:performance.now()};
      activePositions.current.set(string,entry);
      playInput.press('guitar-'+string,midi,strength,{source:'guitar-screen',string,fret});
      later(()=>{if(activePositions.current.get(string)!==entry)return;playInput.release('guitar-'+string);activePositions.current.delete(string);},1000);
    },index*spread));
  }, []);
  return {pluck,silence,activePositions};
}
