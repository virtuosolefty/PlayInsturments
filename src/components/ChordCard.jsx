import { noteName } from '../lib/theory.js';
import StringPicks from './StringPicks.jsx';
import { chordFullName, chordPositionLabel, chordTone } from '../lib/guitarPresentation.js';

/** Where the chord diagram's outer strings are drawn, whatever the number of strings between them. */
const DIAGRAM = Object.freeze({ left: 42, right: 202 });

/**
 * The chord explorer beside a fretted instrument in free play: its chords,
 * a diagram of the one chosen, and a strum.
 *
 * @param {object} props
 * @param {object} props.kit the instrument (instruments.js): its chords, tuning and string names
 */
export default function ChordCard({ kit, chord, onChord, onStrum, onPick, settings, setSettings, leftHanded, activePositions }) {
  const count = kit.tuning.length;
  const strings = Array.from({ length: count }, (_, s) => s);
  const order = leftHanded ? [...strings].reverse() : strings;
  const mode = settings.guitarLabels ?? 'fingers';
  const number = s => kit.stringName(s).number;
  const toneOf = s => chordTone(chord, s, kit.midi);
  const labelOf = s => chordPositionLabel(chord, s, mode, kit.midi);
  const tones = [...new Map(chord.frets.flatMap((f,s) => f == null ? [] : [[toneOf(s).note, toneOf(s)]])).values()];
  const gap = (DIAGRAM.right - DIAGRAM.left) / (count - 1);
  return <section className="chord-card section" aria-label="Chord workspace">
    <div className="chord-card-title"><span className="eyebrow">CHORD EXPLORER</span><span className="chord-voicing">Open position</span></div>
    <div className="chord-card-heading"><h2>{chord.name}</h2><div><strong>{chordFullName(chord)}</strong><span>{chord.frets.filter(f => f != null).length} strings · standard tuning</span></div></div>
    <div className="chord-choices" role="group" aria-label={`${kit.label} chords`}>{kit.chords.map(c => <button key={c.name} aria-pressed={c.name === chord.name} onClick={() => onChord(c)}>{c.name}</button>)}</div>
    <div className="chord-visual">
      <div className="chord-label-modes" role="group" aria-label="Chord labels">{['fingers','notes','intervals'].map(m => <button key={m} aria-pressed={mode === m} onClick={() => setSettings(s => ({...s,guitarLabels:m}))}>{m[0].toUpperCase()+m.slice(1)}</button>)}</div>
      <svg className="chord-diagram" viewBox="0 0 244 242" role="img" aria-label={`${chord.name} chord: ${chord.frets.map((f,s) => `string ${number(s)} ${f == null ? 'muted' : f === 0 ? 'open' : 'fret '+f}`).join(', ')}`}>
        {[0,1,2,3,4].map(f => <line key={'f'+f} x1={DIAGRAM.left} x2={DIAGRAM.right} y1={48+f*36} y2={48+f*36} stroke="currentColor" strokeOpacity={f === 0 ? 1 : .35} strokeWidth={f === 0 ? 5 : 1}/>)}
        {[1,2,3,4].map(f => <text className="diagram-fret-number" key={f} x="20" y={53+(f-.5)*36} textAnchor="middle">{f}</text>)}
        {order.map((s,i) => {
          const fret = chord.frets[s], x = DIAGRAM.left+i*gap, tone = toneOf(s);
          const held = activePositions.current.get(s)?.fret === fret;
          const fill = held ? 'var(--guitar-played)' : tone?.root ? 'var(--guitar-root)' : 'var(--accent)';
          return <g key={s}>
            <line x1={x} x2={x} y1="48" y2="192" stroke="currentColor" strokeOpacity=".6" strokeWidth={kit.wound(s) ? 1.6 : 1}/>
            <text x={x} y="30" textAnchor="middle">{fret == null ? '×' : fret === 0 ? labelOf(s) : ''}</text>
            {fret > 0 && <><circle cx={x} cy={48+(fret-.5)*36} r="13" fill={fill}/><text className="diagram-finger" x={x} y={53+(fret-.5)*36} textAnchor="middle" fill={held || tone?.root ? '#ffffff' : 'var(--on-accent)'}>{labelOf(s)}</text></>}
            <text x={x} y="218" textAnchor="middle">{noteName(kit.tuning[s]).replace(/\d/g,'')}</text>
          </g>;
        })}
      </svg>
      <p className="chord-legend"><span><i className="root" />Root</span><span><i className="finger" />Finger</span><span><i className="played" />Played</span><span>○ Open</span><span>× Muted</span></p>
      <div className="chord-tones" aria-label="Chord tones">{tones.sort((a,b) => Number(b.root)-Number(a.root)).map(t => <span key={t.note} className={t.root ? 'root' : ''}><b>{t.note}</b><small>{t.root ? 'Root' : t.interval}</small></span>)}</div>
    </div>
    <StringPicks kit={kit} label="Preview chord strings" leftHanded={leftHanded} onPick={onPick} activePositions={activePositions}
      placeOf={s => (chord.frets[s] == null ? null : { fret: chord.frets[s], midi: toneOf(s).midi, note: toneOf(s).note })} />
    <div className="strum-actions"><button className="primary" onClick={() => onStrum('down')}>↓ Strum {chord.name}</button><button onClick={() => onStrum('up')}>↑ Up strum</button></div>
    <details className="chord-feel"><summary>Feel <small>{Math.round((settings.guitarStrength??.72)*100)}% · {settings.guitarSpread??32} ms</small></summary><div className="chord-dynamics">
      <label>Strength <output>{Math.round((settings.guitarStrength??.72)*100)}%</output><input aria-label="Strum strength" type="range" min=".2" max="1" step=".01" value={settings.guitarStrength??.72} onChange={e => setSettings(s => ({...s,guitarStrength:+e.target.value}))}/></label>
      <label>Strum spread <output>{settings.guitarSpread??32} ms</output><input aria-label="Strum spread" type="range" min="12" max="90" step="2" value={settings.guitarSpread??32} onChange={e => setSettings(s => ({...s,guitarSpread:+e.target.value}))}/></label>
    </div></details>
  </section>;
}
