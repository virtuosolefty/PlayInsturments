import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../lib/audio.js';
import { midiOutput, INSTRUMENT_MODES } from '../lib/midiOutput.js';
import { loadScoreFromUrl } from '../lib/score.js';

/** Auditions a short excerpt without emitting input, changing the score or recording a run. */
export function useScorePreview({ active, instrument, instrumentSource, midiOutputId }) {
  const [state,setState] = useState({id:null,loading:false,error:null});
  const pending = useRef(0), timers = useRef([]), output = useRef(null);
  const stop = useCallback(() => {
    pending.current++;
    timers.current.forEach(clearTimeout); timers.current=[];
    output.current?.releaseAll(); output.current=null;
    setState({id:null,loading:false,error:null});
  },[]);
  useEffect(() => { stop(); return stop; }, [active,instrument,instrumentSource,midiOutputId,stop]);
  useEffect(() => {
    const hidden=()=>{if(document.hidden)stop();};
    const escape=e=>{if(e.key==='Escape')stop();};
    document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('visibilitychange',hidden);document.removeEventListener('keydown',escape);};
  },[stop]);
  const play = async entry => {
    if (!active) return;
    const same = state.id === entry.id; stop(); if(same)return;
    const token = pending.current;
    setState({id:entry.id,loading:true,error:null});
    try {
      const [,score] = await Promise.all([audio.start(),entry.notes ? Promise.resolve(entry) : loadScoreFromUrl(entry.url,entry)]);
      if(token !== pending.current)return;
      const sink = instrumentSource === INSTRUMENT_MODES.EXTERNAL ? midiOutput : audio;
      output.current=sink;
      const notes=score.notes.filter(note=>note.time<8);
      const dropped=sink.notesDropped;
      setState({id:entry.id,loading:false,error:null});
      for(const note of notes) timers.current.push(setTimeout(()=>{
        if(token!==pending.current)return;
        sink.play(note.midi,Math.min(note.duration,.65),undefined,note.velocity ?? .65);
        if(sink.notesDropped>dropped){stop();setState({id:null,loading:false,error:'The preview could not play. Check your sound setup.'});}
      },Math.max(0,note.time*1000)));
      const end=Math.min(8.7,Math.max(...notes.map(n=>n.time+Math.min(n.duration,.65)),0));
      timers.current.push(setTimeout(stop,end*1000+80));
    } catch(err) { if(token===pending.current){stop();setState({id:null,loading:false,error:`Preview unavailable. ${err.message}`});} }
  };
  return {...state,play,stop};
}

