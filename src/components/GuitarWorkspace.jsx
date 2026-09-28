import { createPortal } from 'react-dom';
import ChordCard from './ChordCard.jsx';
import { chordPositionLabel, chordTone } from '../lib/guitarPresentation.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GUITAR_CHORDS, GUITAR_COLORS, GUITAR_STUDIES, GUITAR_TUNING, guitarMidi } from '../lib/guitar.js';
import { noteName } from '../lib/theory.js';
import { useGuitarInput } from '../hooks/useGuitarInput.js';
import { webglAvailable } from '../lib/webgl.js';

const GuitarStage = lazy(() => import('./GuitarStage.jsx'));
const STRING_ORDER = [5, 4, 3, 2, 1, 0];

function GuitarTab({ score, engine, pps, theme }) {
  const ref = useRef(null);
  const live = useRef({ score, engine, pps, theme });
  live.current = { score, engine, pps, theme };
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let frame;
    const draw = () => {
      const { score: piece, engine: e, pps: zoom, theme: appearance } = live.current;
      const light = appearance !== 'dark';
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const now = e.transportRef.current?.now() ?? 0;
      const hit = Math.min(100, w * 0.2);
      const speed = Math.max(48, Math.min(zoom * 0.8, w / 3));
      const lane = (h - 32) / 6;
      const yOf = s => 24 + (5 - s + 0.5) * lane;
      ctx.fillStyle = light ? '#f5f3ee' : '#0e0e14'; ctx.fillRect(0, 0, w, h);
      const wash = ctx.createLinearGradient(hit, 0, w, 0);
      wash.addColorStop(0, light ? '#ece7f5' : '#252035'); wash.addColorStop(0.6, light ? '#f5f3ee' : '#0e0e14');
      ctx.fillStyle = wash; ctx.fillRect(hit, 0, w - hit, h);
      const beat = 60 / piece.bpm;
      const beatsPerBar = piece.timeSignature?.[0] ?? 4;
      for (let b = Math.max(0, Math.floor(now / beat)); b < (now + w / speed) / beat; b++) {
        const x = hit + (b * beat - now) * speed;
        ctx.strokeStyle = light ? (b % beatsPerBar === 0 ? '#c9c3d2' : '#e1dce5') : (b % beatsPerBar === 0 ? '#34344a' : '#1f1f2a'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, h - 8); ctx.stroke();
        if (b % beatsPerBar === 0 && x > hit + 24) { ctx.font = '11px sans-serif'; ctx.fillStyle = light ? '#635b74' : '#b9b9c8'; ctx.fillText(`BAR ${b / beatsPerBar + 1}`, x + 6, 16); }
      }
      STRING_ORDER.forEach(s => {
        const y = yOf(s);
        ctx.strokeStyle = light ? '#b5aabd' : '#4a4a5e'; ctx.lineWidth = 1 + (5 - s) * 0.14;
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.font = '600 13px sans-serif'; ctx.fillStyle = light ? '#554967' : '#b9b9c8';
        ctx.fillText(noteName(GUITAR_TUNING[s]).replace(/\d/g, ''), 24, y + 4);
        ctx.font='9px sans-serif'; ctx.fillStyle=light?'#89828d':'#8b8598'; ctx.fillText(String(6-s),10,y+3);
      });
      ctx.fillStyle = light ? '#6251b7' : '#a594ff'; ctx.fillRect(hit - 1, 24, 2, h - 32);
      ctx.font = '10px sans-serif'; ctx.fillText('PLAY', hit - 13, 16);
      const targets = e.sessionRef.current?.targets ?? piece.notes;
      targets.forEach(n => {
        if (n.string === undefined) return;
        const x = hit + (n.time - now) * speed, y = yOf(n.string);
        if (x < 45 || x > w + 25) return;
        const color = n.status === 'hit' ? (light?'#26795e':'#5ad79a') : n.status === 'missed' ? (light?'#b53954':'#ff6b82') : (light?'#6251b7':'#a594ff');
        ctx.globalAlpha = x < hit - 12 ? 0.5 : 1;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(w, x + n.duration * speed), y); ctx.stroke();
        const radius=Math.min(11,lane*.46);
        ctx.fillStyle=light?'#fffefa':'#211d2e'; ctx.beginPath(); ctx.roundRect(x-12,y-radius,24,radius*2,4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(n.fret), x, y + 4); ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={ref} className="guitar-tab" role="img" aria-label="Guitar tablature: high E at the top, low E at the bottom. Play numbered frets as they reach the vertical line." />;
}

export default function GuitarWorkspace({ score, engine, settings, setSettings, onStudy, onError, onContextLost, freePlay, onFreePlay, inspector }) {
  const [chord, setChord] = useState(GUITAR_CHORDS[0]);
  const leftHanded = !!settings.guitarLeftHanded;
  const { pluck, silence, activePositions } = useGuitarInput(onError);
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
      {!freePlay && <GuitarTab theme={settings.theme} score={score} engine={engine} pps={settings.pps} />}
      {!freePlay && <div className="guitar-next"><span>UP NEXT</span><strong>{next ? `${next.name} · string ${6 - next.string} · ${next.fret === 0 ? 'open' : `fret ${next.fret}`}` : 'Study complete'}</strong><span className="guitar-tab-key">0 = open string</span></div>}
      <div className="guitar-view-controls">{!freePlay && <label className="guitar-exercise">Exercise<select aria-label="Guitar exercise" value={score.id} onChange={e => onStudy(e.target.value)}>
          {GUITAR_STUDIES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select></label>}<label>Frets<select aria-label="Visible guitar frets" value={maxFret} onChange={e=>{setFocusPosition({string:0,fret:0});setSettings(s=>({...s,guitarFrets:+e.target.value}));}}><option value="5">0–5 · first position</option><option value="12">0–12 · full neck</option></select></label><label>Text<select aria-label="Instrument label size" value={settings.instrumentLabelSize??14} onChange={e=>setSettings(s=>({...s,instrumentLabelSize:+e.target.value}))}><option value="14">Standard</option><option value="18">Large</option></select></label>{!freePlay && stage && <label className="guitar-height-control">Neck height<input aria-label="Fretboard height" type="range" min="180" max="300" step="5" value={settings.guitarHeight??230} onChange={e=>setSettings(s=>({...s,guitarHeight:+e.target.value}))}/></label>}<label className="guitar-left-toggle"><input type="checkbox" aria-label="Left-handed" checked={leftHanded} onChange={e=>setSettings(s=>({...s,guitarLeftHanded:e.target.checked}))}/>Left-handed</label></div>
      
      {stage && <Suspense fallback={<div className="guitar-stage-loading">Preparing your fretboard…</div>}>
        <GuitarStage engine={engine} score={score} onPluck={pick} activePositions={activePositions} maxFret={maxFret} labelSize={settings.instrumentLabelSize??14} labelMode={settings.guitarLabels??'fingers'} focusPosition={navActive?focusPosition:null} onContextLost={onContextLost} leftHanded={leftHanded} theme={settings.theme} chord={freePlay ? chord : null} />
      </Suspense>}
      <details className={`guitar-fret-controls ${stage ? 'with-stage' : ''}`} open={!stage} key={stage ? 'stage' : 'trainer'}>
      <summary>Show fret buttons · keyboard accessible</summary>
      <div className={`guitar-fretboard ${leftHanded ? 'left-handed' : ''}`} aria-label="Playable guitar fretboard" role="group" data-instrument-navigation="true" style={{"--frets":maxFret+1,"--instrument-label-size":(settings.instrumentLabelSize??14)+"px"}} onFocus={()=>setNavActive(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setNavActive(false);}}>
        <div className="fret-numbers"><span />{Array.from({length:maxFret+1}, (_, i) => <span key={i}>{i === 0 ? 'OPEN' : i}</span>)}</div>
        {STRING_ORDER.map(s => <div className="guitar-string" key={s} style={{'--string-color': GUITAR_COLORS[s]}}>
          <span className="string-name">{noteName(GUITAR_TUNING[s])}</span>
          {Array.from({length:maxFret+1}, (_, fret) => {
            const target = !freePlay && next?.string === s && next?.fret === fret;
            const feedback=guitarFeedback({midi:guitarMidi(s,fret),string:s,fret},engine.activeInputRef.current,activePositions.current,target,freePlay&&chord.frets[s]===fret,false);
            return <button data-position={s+"-"+fret} tabIndex={focusPosition.string===s&&focusPosition.fret===fret?0:-1} key={fret} className={`${feedback} ${freePlay && chordTone(chord,s)?.root ? 'chord-root' : ''} ${target ? 'target' : ''} ${freePlay && chord.frets[s] === fret ? 'chord-position' : ''}`}
              aria-label={`String ${6-s}, ${fret === 0 ? 'open' : `fret ${fret}`}, ${noteName(guitarMidi(s, fret))}`}
              onKeyDown={e=>{if(e.key===' ')e.stopPropagation();navigate(e,s,fret);}} onFocus={()=>setFocusPosition({string:s,fret})}
              onClick={() => pick({string:s,fret})}><span>{freePlay && chord.frets[s] === fret ? chordPositionLabel(chord,s,settings.guitarLabels??'fingers') : target ? fret : feedback==='held'?'●':feedback==='possible'?'○':'·'}</span></button>;
          })}
        </div>)}
      </div>
      </details>
      {freePlay ? (inspector ? createPortal(card,inspector) : card) : <div className="guitar-chords"><button onClick={onFreePlay}>Explore chords in Free play →</button><span>Outline: next note · Filled: played · Faint: possible MIDI position</span></div>}
    </section>
  );
}
