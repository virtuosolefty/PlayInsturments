import { useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import Icon from './Icon.jsx';
import { webglAvailable } from '../lib/webgl.js';

export function InstrumentIcon({ guitar = false }) {
  return guitar ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m14 10 6-6 2 2-6 6M18 4l2 2M20 2l2 2M10 9c-3-2-4 1-4 3-4 0-5 4-2 7s7 2 7-2c2 0 5-1 3-4"/><circle cx="9" cy="14" r="2"/><path d="m5 17 2 2"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/><path d="M7 5h4v8H7zm6 0h4v8h-4z" fill="currentColor" stroke="none"/></svg>
  );
}

export default function StudioHeader({ score, settings, playing, onInstrumentChange, freePlay, onFreePlay, focus, onFocus }) {
  const guitar = settings.practiceInstrument === 'guitar';
  return (
    <div className="studio-header">
      <div className="studio-heading">
        <span className="eyebrow"><i className={playing ? 'session-dot live' : 'session-dot'} /> YOUR PRACTICE STUDIO</span>
        <h2>{freePlay ? 'A little room to improvise.' : score?.title ?? 'Choose your next piece'}</h2>
        <p title={score?.title}>{freePlay ? 'Explore your instrument. Nothing is scored or saved.' : (score?.composer ?? 'Your practice session')}<span>{!freePlay && ` · ${Math.round((score?.bpm ?? 80) * settings.rate)} bpm · ${score?.key?.name ?? ''}`}</span></p>
      </div>
      <div className="studio-header-actions"><div className="workspace-switch" role="group" aria-label="Workspace"><button aria-pressed={!freePlay} onClick={() => onFreePlay(false)}>Learn</button><button aria-pressed={freePlay} onClick={() => onFreePlay(true)}>Free play</button></div>
      <div className="instrument-picker" role="group" aria-label="Practice instrument">
        {['piano', 'guitar'].map(value => (
          <button key={value} aria-pressed={(settings.practiceInstrument ?? 'piano') === value}
            onClick={() => onInstrumentChange(value)}>
            <InstrumentIcon guitar={value === 'guitar'} /><span>{value === 'piano' ? 'Piano' : 'Guitar'}</span>
          </button>
        ))}
      </div><button className="focus-toggle" aria-pressed={focus} onClick={onFocus} title={focus ? 'Show everything again (Esc)' : 'Hide panels and settings — just the music'}><Icon name={focus ? 'minimize' : 'focus'} size={14} />{focus ? 'Exit focus' : 'Focus'}</button></div>
    </div>
  );
}

export function StageToolbar({ settings, setSettings, guitar, freePlay, children }) {
  const [open, setOpen] = useState(false);
  const ref = useDialog({ open, onClose: () => setOpen(false) });
  const available = webglAvailable();
  const renderer = available ? settings.renderer : 'canvas';
  return (
    <div className="stage-toolbar">
      <div className="stage-caption"><span className="stage-live-dot" />{freePlay ? (guitar ? 'GUITAR' : 'PIANO') : guitar ? 'GUITAR TAB' : 'PIANO ROLL'}<span className="stage-description">{freePlay ? 'Click a note or play your controller' : guitar ? 'Numbers show the fret to play' : 'Play as the notes reach the line'}</span></div>
      <div className="popover-host instrument-settings-host">
      <button className="instrument-settings-toggle" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}><Icon name="sliders" size={14} /> Instrument settings</button>
      {open && <><div className="popover-scrim" onClick={() => setOpen(false)} /><div className="popover instrument-settings-panel" ref={ref} role="dialog" aria-modal="true" aria-label="Instrument settings" tabIndex={-1}>
      <div className="settings-heading"><strong>Instrument settings</strong><button aria-label="Close instrument settings" onClick={() => setOpen(false)}>×</button></div>
      <p className="hint">Choose how your instrument looks and responds.</p><span className="settings-label">Appearance</span>
      <div className="stage-view-switch" role="group" aria-label="Stage appearance">
        {['canvas', 'gl'].map(value => <button key={value} aria-pressed={renderer === value}
          disabled={value === 'gl' && !available} title={value === 'gl' && !available ? '3D is unavailable on this browser. The 2D trainer is ready to use.' : undefined}
          onClick={() => setSettings(s => ({ ...s, renderer: value }))}>{value === 'gl' ? '3D Stage' : '2D Trainer'}</button>)}
      </div>
      {children}
      </div></>}
      </div>
    </div>
  );
}
