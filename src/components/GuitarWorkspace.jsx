import { createPortal } from 'react-dom';
import ChordCard from './ChordCard.jsx';
import { chordPositionLabel, chordTone } from '../lib/guitarPresentation.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import StringTab from './StringTab.jsx';
import { GUITAR_CHORDS, GUITAR_COLORS, GUITAR_STUDIES, GUITAR_TUNING, guitarMidi } from '../lib/guitar.js';
import { noteName } from '../lib/theory.js';
import { useGuitarInput } from '../hooks/useGuitarInput.js';
import { webglAvailable } from '../lib/webgl.js';

const GuitarStage = lazy(() => import('./GuitarStage.jsx'));
const STRING_ORDER = [5, 4, 3, 2, 1, 0];
const INLAYS = [3, 5, 7, 9, 12];

/** Real fret spacing: each fret is 2^(-1/12) the width of the one before. */
export function fretColumns(maxFret) {
  const widths = Array.from({ length: maxFret }, (_, i) => 2 ** (-i / 12) - 2 ** (-(i + 1) / 12));
  const first = widths[0];
  return `35px minmax(34px,.62fr) ${widths.map(w => `minmax(26px,${(w / first).toFixed(3)}fr)`).join(' ')}`;
}

export default function GuitarWorkspace({ score, engine, settings, setSettings, onStudy, onError, onContextLost, freePlay, onFreePlay, inspector }) {
  const [chord, setChord] = useState(GUITAR_CHORDS[0]);
  const leftHanded = !!settings.guitarLeftHanded;
  const { pluck, silence, activePositions } = useGuitarInput();
  useEffect(() => { silence(); }, [score.id, engine.playing, settings.guitarFrets, settings.renderer, silence]);
  const [focusPosition,setFocusPosition]=useState({string:0,fret:0});
  const [navActive,setNavActive]=useState(false);
  const maxFret=settings.guitarFrets??12;
  const [,refresh]=useState(0);
  useEffect(()=>{const id=setInterval(()=>refresh(v=>v+1),80);return()=>clearInterval(id);},[]);
  const pick = position => pluck([position],{strength:settings.guitarStrength??.72});
  const strum = direction => { silence(); pluck(chord.frets.flatMap((fret,string)=>fret==null?[]:[{string,fret}]),{direction,strength:settings.guitarStrength??.72,spread:settings.guitarSpread??32}); };
  const card=<ChordCard chord={chord} onChord={c=>{silence();setChord(c);}} onStrum={strum} onPick={pick} activePositions={activePositions} settings={settings} setSettings={setSettings} leftHanded={leftHanded}/>;
  const navigate=(e,string,fret)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
    e.preventDefault(); e.stopPropagation();
    const direction=leftHanded?-1:1;
    const next={string:Math.min(5,Math.max(0,string+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0))),fret:Math.min(maxFret,Math.max(0,e.key==='Home'?0:e.key==='End'?maxFret:fret+(e.key==='ArrowRight'?direction:e.key==='ArrowLeft'?-direction:0)))};
    setFocusPosition(next);e.currentTarget.closest('.guitar-fretboard').querySelector('[data-position="'+next.string+'-'+next.fret+'"]').focus();
  };
  const now = Math.max(0, engine.songTime);
  const next = (engine.sessionRef.current?.targets ?? score.notes).find(n => n.status !== 'hit' && n.time >= now - 0.1);
  const stage = settings.renderer === 'gl' && webglAvailable();
  return (
    <section className="guitar-workspace" aria-label="Guitar studio" style={{"--fretboard-height":(settings.guitarHeight??230)+"px"}}>
      {!freePlay && <StringTab instrument="guitar" theme={settings.theme} score={score} engine={engine} pps={settings.pps} />}
      {!freePlay && <div className="guitar-next"><span>UP NEXT</span><strong>{next ? `${next.name} · string ${6 - next.string} · ${next.fret === 0 ? 'open' : `fret ${next.fret}`}` : 'Study complete'}</strong><span className="guitar-tab-key">0 = open string</span></div>}
      <div className="guitar-view-controls">{!freePlay && <label className="guitar-exercise">Exercise<select aria-label="Guitar exercise" value={score.id} onChange={e => onStudy(e.target.value)}>
          {GUITAR_STUDIES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select></label>}<label>Frets<select aria-label="Visible guitar frets" value={maxFret} onChange={e=>{setFocusPosition({string:0,fret:0});setSettings(s=>({...s,guitarFrets:+e.target.value}));}}><option value="5">0–5 · first position</option><option value="12">0–12 · full neck</option></select></label><label>Text<select aria-label="Instrument label size" value={settings.instrumentLabelSize??14} onChange={e=>setSettings(s=>({...s,instrumentLabelSize:+e.target.value}))}><option value="14">Standard</option><option value="18">Large</option></select></label>{!freePlay && stage && <label className="guitar-height-control">Neck height<input aria-label="Fretboard height" type="range" min="180" max="300" step="5" value={settings.guitarHeight??230} onChange={e=>setSettings(s=>({...s,guitarHeight:+e.target.value}))}/></label>}<label className="guitar-left-toggle"><input type="checkbox" aria-label="Left-handed" checked={leftHanded} onChange={e=>setSettings(s=>({...s,guitarLeftHanded:e.target.checked}))}/>Left-handed</label></div>
      
      {stage && <Suspense fallback={<div className="guitar-stage-loading">Preparing your fretboard…</div>}>
        <GuitarStage engine={engine} score={score} onPluck={pick} activePositions={activePositions} maxFret={maxFret} labelSize={settings.instrumentLabelSize??14} labelMode={settings.guitarLabels??'fingers'} focusPosition={navActive?focusPosition:null} onContextLost={onContextLost} leftHanded={leftHanded} theme={settings.theme} chord={freePlay ? chord : null} />
      </Suspense>}
      <details className={`guitar-fret-controls ${stage ? 'with-stage' : ''}`} open={!stage} key={stage ? 'stage' : 'trainer'}>
      <summary>Show fret buttons · keyboard accessible</summary>
      <div className={`guitar-fretboard ${leftHanded ? 'left-handed' : ''}`} aria-label="Playable guitar fretboard" role="group" data-instrument-navigation="true" style={{"--frets":maxFret+1,"--fret-columns":fretColumns(maxFret),"--instrument-label-size":(settings.instrumentLabelSize??14)+"px"}} onFocus={()=>setNavActive(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setNavActive(false);}}>
        <div className="fret-numbers"><span />{Array.from({length:maxFret+1}, (_, i) => <span key={i} className={INLAYS.includes(i) ? 'inlay-fret' : undefined}>{i === 0 ? 'OPEN' : i}</span>)}</div>
        <div className="fretboard-surface" aria-hidden="true"><span />{Array.from({length:maxFret+1}, (_, i) => <span key={i} className={i === 12 ? 'double' : INLAYS.includes(i) ? 'single' : undefined} />)}</div>
        {STRING_ORDER.map(s => <div className={`guitar-string ${s < 3 ? 'wound' : 'plain'}`} key={s} style={{'--string-color': GUITAR_COLORS[s], '--gauge': (1 + (5 - s) * 0.42).toFixed(2) + 'px'}}>
          <span className="string-name">{noteName(GUITAR_TUNING[s])}</span>
          {Array.from({length:maxFret+1}, (_, fret) => {
            const target = !freePlay && next?.string === s && next?.fret === fret;
            const feedback=guitarFeedback({midi:guitarMidi(s,fret),string:s,fret},engine.activeInputRef.current,activePositions.current,target,freePlay&&chord.frets[s]===fret,false);
            return <button data-position={s+"-"+fret} tabIndex={focusPosition.string===s&&focusPosition.fret===fret?0:-1} key={fret} className={`${feedback} ${freePlay && chordTone(chord,s)?.root ? 'chord-root' : ''} ${target ? 'target' : ''} ${freePlay && chord.frets[s] === fret ? 'chord-position' : ''}`}
              aria-label={`String ${6-s}, ${fret === 0 ? 'open' : `fret ${fret}`}, ${noteName(guitarMidi(s, fret))}`}
              onKeyDown={e=>{if(e.key===' ')e.stopPropagation();navigate(e,s,fret);}} onFocus={()=>setFocusPosition({string:s,fret})}
              onClick={() => pick({string:s,fret})}><span>{freePlay && chord.frets[s] === fret ? chordPositionLabel(chord,s,settings.guitarLabels??'fingers') : target ? fret : feedback==='held'?'●':feedback==='possible'?'○':noteName(guitarMidi(s,fret)).replace(/\d/g,'')}</span></button>;
          })}
        </div>)}
      </div>
      </details>
      {freePlay ? (inspector ? createPortal(card,inspector) : card) : <div className="guitar-chords"><button onClick={onFreePlay}>Explore chords in Free play →</button><span>Outline: next note · Filled: played · Faint: possible MIDI position</span></div>}
    </section>
  );
}
