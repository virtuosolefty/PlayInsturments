import { useCallback, useEffect, useRef, useState } from 'react';
import { noteName } from '../lib/theory.js';

/** A button that bows while it is held, by pointer or by Enter / Space. */
function HoldButton({ position, onBow, onLift, className = '', children, label }) {
  const held = useRef(false);
  const pointer = useRef(null);
  const down = () => { if (held.current) return; held.current = true; onBow(position); };
  const up = () => { if (!held.current) return; held.current = false; pointer.current = null; onLift(position.string); };
  const lifted = e => { if (pointer.current === null || e.pointerId === pointer.current) up(); };
  return <button className={className} aria-label={label}
    onPointerDown={e => { if (e.button === 0 && pointer.current === null) { e.preventDefault(); pointer.current = e.pointerId; e.currentTarget.setPointerCapture?.(e.pointerId); down(); } }}
    onPointerUp={lifted} onPointerCancel={lifted} onLostPointerCapture={lifted}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) down(); } }}
    onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); up(); } }} onBlur={up}>{children}</button>;
}

/**
 * Free play for the violin and cello: pick a first-position scale, see it on
 * the fingerboard, hold any note to bow it, or let the scale play up and back.
 */
export default function BowCard({ kit, scale, onScale, onBow, onLift, silence, settings, setSettings, activePositions }) {
  const [playing, setPlaying] = useState(false);
  const timers = useRef([]);
  const labelMode = settings.bowedLabels ?? 'fingers';
  const tempo = settings.scaleTempo ?? 84;
  const stopScale = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(false); silence(); }, [silence]);
  useEffect(() => stopScale, [stopScale]);
  const playScale = () => {
    if (playing) { stopScale(); return; }
    const notes = [...scale.positions, ...scale.positions.slice(0, -1).reverse()];
    const beat = 60000 / tempo;
    setPlaying(true);
    notes.forEach((p, i) => {
      timers.current.push(setTimeout(() => onBow(p), i * beat));
      timers.current.push(setTimeout(() => onLift(p.string), i * beat + beat * 0.9));
    });
    timers.current.push(setTimeout(() => { timers.current = []; setPlaying(false); }, notes.length * beat));
  };
  const choose = next => { stopScale(); onScale(next); };
  const tonic = scale.name.split(' ')[0];
  const strings = new Set(scale.positions.map(p => p.string)).size;
  const sounding = activePositions.current;
  const noteLabel = p => {
    const note = noteName(kit.midi(p.string, p.fret)).replace(/\d/g, '');
    const finger = kit.finger(p.fret);
    return { note, finger: finger == null ? '–' : String(finger) };
  };
  return <section className="chord-card bow-card section" aria-label={`${kit.label} scale explorer`}>
    <div className="chord-card-title"><span className="eyebrow">SCALE EXPLORER</span><span className="chord-voicing">First position</span></div>
    <div className="chord-card-heading"><h2>{tonic}</h2><div><strong>{scale.name}</strong><span>One octave · {scale.positions.length} notes · {strings} strings</span></div></div>
    <div className="chord-choices" role="group" aria-label={`${kit.label} scales`} style={{ gridTemplateColumns: `repeat(${kit.scales.length},minmax(0,1fr))` }}>
      {kit.scales.map(s => <button key={s.name} aria-pressed={s.name === scale.name} onClick={() => choose(s)}>{s.name.replace(' major', '')}</button>)}
    </div>
    <div className="chord-visual bow-notes">
      <div className="chord-label-modes" role="group" aria-label="Fingerboard labels">{['fingers', 'notes'].map(m => <button key={m} aria-pressed={labelMode === m} onClick={() => setSettings(s => ({ ...s, bowedLabels: m }))}>{m === 'fingers' ? 'Fingers' : 'Notes'}</button>)}</div>
      <ol className="bow-note-list" aria-label={`${scale.name} notes: hold to bow`}>
        {scale.positions.map((p, i) => {
          const { note, finger } = noteLabel(p);
          const on = sounding.get(p.string)?.fret === p.fret;
          return <li key={i}><HoldButton position={p} onBow={onBow} onLift={onLift} className={on ? 'sounding' : ''} label={`${note}, ${kit.stringName(p.string).note} string, ${p.fret ? `finger ${finger}` : 'open'}`}>
            <b>{note}</b><small>{kit.stringName(p.string).note} · {finger}</small>
          </HoldButton></li>;
        })}
      </ol>
    </div>
    <div className="strum-actions bow-actions"><button className="primary" onClick={playScale}>{playing ? '■ Stop' : '▶ Play the scale'}</button></div>
    <div className="chord-audition">
      <span>Open strings <small>hold to bow</small></span>
      <div className="chord-string-picks bow-open-strings" style={{ gridTemplateColumns: `repeat(${kit.tuning.length},minmax(0,1fr))` }}>
        {kit.tuning.map((_, s) => { const name = kit.stringName(s); return <HoldButton key={s} position={{ string: s, fret: 0 }} onBow={onBow} onLift={onLift} className={sounding.get(s)?.fret === 0 ? 'sounding' : ''} label={`Bow the open ${name.note} string`}><small>{name.number}</small><b>{name.note}</b></HoldButton>; })}
      </div>
    </div>
    <div className="chord-dynamics">
      <label>Bow pressure <output>{Math.round((settings.bowPressure ?? 0.7) * 100)}%</output><input aria-label="Bow pressure" type="range" min=".2" max="1" step=".01" value={settings.bowPressure ?? 0.7} onChange={e => setSettings(s => ({ ...s, bowPressure: +e.target.value }))} /></label>
      <label>Scale tempo <output>{tempo} bpm</output><input aria-label="Scale tempo" type="range" min="48" max="144" step="4" value={tempo} onChange={e => setSettings(s => ({ ...s, scaleTempo: +e.target.value }))} /></label>
    </div>
    <p className="hint">Tapes mark first-position fingers. Hold a note to keep the bow moving; drag along a string to slide between notes.</p>
  </section>;
}
