import { GUITAR_CHORDS, GUITAR_TUNING } from '../lib/guitar.js';
import { noteName } from '../lib/theory.js';
import { chordFullName, chordPositionLabel, chordTone } from '../lib/guitarPresentation.js';

export default function ChordCard({ chord, onChord, onStrum, onPick, settings, setSettings, leftHanded, activePositions }) {
  const order = leftHanded ? [5,4,3,2,1,0] : [0,1,2,3,4,5];
  const mode = settings.guitarLabels ?? 'fingers';
  const tones = [...new Map(chord.frets.flatMap((f,s) => f == null ? [] : [[chordTone(chord,s).note, chordTone(chord,s)]])).values()];
  return <section className="chord-card section" aria-label="Chord workspace">
    <div className="chord-card-title"><span className="eyebrow">CHORD EXPLORER</span><span className="chord-voicing">Open position</span></div>
    <div className="chord-card-heading"><h2>{chord.name}</h2><div><strong>{chordFullName(chord)}</strong><span>{chord.frets.filter(f => f != null).length} strings · standard tuning</span></div></div>
    <div className="chord-choices" role="group" aria-label="Guitar chords">{GUITAR_CHORDS.map(c => <button key={c.name} aria-pressed={c.name === chord.name} onClick={() => onChord(c)}>{c.name}</button>)}</div>
    <div className="chord-visual">
      <div className="chord-label-modes" role="group" aria-label="Chord labels">{['fingers','notes','intervals'].map(m => <button key={m} aria-pressed={mode === m} onClick={() => setSettings(s => ({...s,guitarLabels:m}))}>{m[0].toUpperCase()+m.slice(1)}</button>)}</div>
      <svg className="chord-diagram" viewBox="0 0 244 242" role="img" aria-label={`${chord.name} chord: ${chord.frets.map((f,s) => `string ${6-s} ${f == null ? 'muted' : f === 0 ? 'open' : 'fret '+f}`).join(', ')}`}>
        {[0,1,2,3,4].map(f => <line key={'f'+f} x1="42" x2="202" y1={48+f*36} y2={48+f*36} stroke="currentColor" strokeOpacity={f === 0 ? 1 : .35} strokeWidth={f === 0 ? 5 : 1}/>)}
        {[1,2,3,4].map(f => <text className="diagram-fret-number" key={f} x="20" y={53+(f-.5)*36} textAnchor="middle">{f}</text>)}
        {order.map((s,i) => {
          const fret = chord.frets[s], x = 42+i*32, tone = chordTone(chord,s);
          const held = activePositions.current.get(s)?.fret === fret;
          const fill = held ? 'var(--guitar-played)' : tone?.root ? 'var(--guitar-root)' : 'var(--accent)';
          return <g key={s}>
            <line x1={x} x2={x} y1="48" y2="192" stroke="currentColor" strokeOpacity=".6" strokeWidth={1+(5-s)*.18}/>
            <text x={x} y="30" textAnchor="middle">{fret == null ? '×' : fret === 0 ? chordPositionLabel(chord,s,mode) : ''}</text>
            {fret > 0 && <><circle cx={x} cy={48+(fret-.5)*36} r="13" fill={fill}/><text className="diagram-finger" x={x} y={53+(fret-.5)*36} textAnchor="middle" fill={held || tone?.root ? '#ffffff' : 'var(--on-accent)'}>{chordPositionLabel(chord,s,mode)}</text></>}
            <text x={x} y="218" textAnchor="middle">{noteName(GUITAR_TUNING[s]).replace(/\d/g,'')}</text>
          </g>;
        })}
      </svg>
      <div className="chord-tones" aria-label="Chord tones">{tones.sort((a,b) => Number(b.root)-Number(a.root)).map(t => <span key={t.note} className={t.root ? 'root' : ''}><b>{t.note}</b><small>{t.root ? 'Root' : t.interval}</small></span>)}</div>
    </div>
    <div className="chord-audition"><span>Pick a string <small>{leftHanded ? '1 → 6 · mirrored' : '6 → 1'}</small></span><div className="chord-string-picks" role="group" aria-label="Preview chord strings">{order.map(s => {
      const fret = chord.frets[s], tone = chordTone(chord,s), held = fret != null && activePositions.current.get(s)?.fret === fret;
      return <button key={s} disabled={fret == null} className={held ? 'sounding' : ''} aria-label={fret == null ? `String ${6-s} muted` : `Pick string ${6-s}: ${noteName(tone.midi)}`} onClick={() => onPick({string:s,fret})}><small>{6-s}</small><b>{tone?.note ?? '×'}</b></button>;
    })}</div></div>
    <div className="strum-actions"><button className="primary" onClick={() => onStrum('down')}>↓ Strum {chord.name}</button><button onClick={() => onStrum('up')}>↑ Up strum</button></div>
    <div className="chord-dynamics">
      <label>Strength <output>{Math.round((settings.guitarStrength??.72)*100)}%</output><input aria-label="Strum strength" type="range" min=".2" max="1" step=".01" value={settings.guitarStrength??.72} onChange={e => setSettings(s => ({...s,guitarStrength:+e.target.value}))}/></label>
      <label>Strum spread <output>{settings.guitarSpread??32} ms</output><input aria-label="Strum spread" type="range" min="12" max="90" step="2" value={settings.guitarSpread??32} onChange={e => setSettings(s => ({...s,guitarSpread:+e.target.value}))}/></label>
    </div>
    <p className="hint">○ Open string · × Muted · 1–4 Fingers<br/>Copper marks the root · Teal means played</p>
  </section>;
}
