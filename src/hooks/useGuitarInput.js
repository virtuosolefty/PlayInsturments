import { useCallback, useEffect, useRef } from 'react';
import { playInput } from '../lib/playInput.js';
import { stringKit } from '../lib/instruments.js';

/**
 * Per-string voices let independently played strings ring together.
 *
 * `pluck` is the guitar's gesture: a timed note (or a strum of several).
 * `bow` holds a note until `lift` — a violin or cello sounds for as long as
 * the bow keeps moving. Both go through playInput, so scoring is shared.
 */
export function useStringInput(instrument = 'guitar') {
  const kit = stringKit(instrument) ?? stringKit('guitar');
  const prefix = `${kit.id}-`;
  const activePositions = useRef(new Map());
  const state = useRef({ generation:0, timers:new Set() });
  const silence = useCallback(() => {
    state.current.generation++; state.current.timers.forEach(clearTimeout); state.current.timers.clear();
    playInput.releasePrefix(prefix); activePositions.current.clear();
  }, [prefix]);
  useEffect(()=>{window.addEventListener('blur',silence);return()=>{window.removeEventListener('blur',silence);silence();};},[silence]);
  const sound = useCallback(({string,fret},strength) => {
    const midi=kit.midi(string,fret); if(midi==null)return null;
    const entry={string,fret,midi,at:performance.now()};
    activePositions.current.set(string,entry);
    playInput.press(prefix+string,midi,strength,{source:`${kit.id}-screen`,string,fret});
    return entry;
  }, [kit, prefix]);
  const pluck = useCallback((positions, {direction='down', strength=.72, spread=32, hold=1000}={}) => {
    const notes=direction==='up'?[...positions].reverse():positions;
    const generation=state.current.generation;
    const later=(fn,ms)=>{const timer=setTimeout(()=>{state.current.timers.delete(timer);if(generation===state.current.generation)fn();},ms);state.current.timers.add(timer);};
    notes.forEach((position,index)=>later(()=>{
      const entry=sound(position,strength); if(!entry)return;
      later(()=>{if(activePositions.current.get(position.string)!==entry)return;playInput.release(prefix+position.string);activePositions.current.delete(position.string);},hold);
    },index*spread));
  }, [sound, prefix]);
  const bow = useCallback((position, strength=.7) => sound(position,strength), [sound]);
  const lift = useCallback(string => {
    if(!activePositions.current.has(string))return;
    playInput.release(prefix+string); activePositions.current.delete(string);
  }, [prefix]);
  return {pluck,bow,lift,silence,activePositions};
}

export function useGuitarInput() {
  return useStringInput('guitar');
}
