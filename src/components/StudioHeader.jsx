import { useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import Icon from './Icon.jsx';
import { stageTierHere, webglAvailable, webglRendererName } from '../lib/webgl.js';
import { INSTRUMENTS, instrumentInfo, isStringed, normalizeInstrument, stringKit } from '../lib/instruments.js';
import { explainStageDetail, normalizeStageQuality, STAGE_QUALITIES } from '../lib/stage/quality.js';

const QUALITY_CHOICES = {
  auto: { label: 'Auto', title: 'Full detail on a graphics card, light on software rendering' },
  full: { label: 'Full', title: 'The 3D models of the guitar, violin and cello, with reflections and a lacquered finish' },
  light: { label: 'Light', title: 'The simpler built-in guitar and the 2D violin and cello, for older computers' },
};
const BOWED_BODY = 'M9.3 9.4c-1.5.2-2.3 1.2-2.1 2.4.1.8.8 1.2.8 1.9 0 .6-.9 1.2-.9 2.5 0 2.1 1.9 3.6 4.9 3.6s4.9-1.5 4.9-3.6c0-1.3-.9-1.9-.9-2.5 0-.7.7-1.1.8-1.9.2-1.2-.6-2.2-2.1-2.4-1.1-.1-1.7.5-2.7.5s-1.6-.6-2.7-.5z';

/** @param instrument 'piano' | 'guitar' | 'violin' | 'cello'; `guitar` is the older boolean form */
export function InstrumentIcon({ guitar = false, instrument = guitar ? 'guitar' : 'piano' }) {
  if (instrument === 'violin' || instrument === 'cello') {
    const cello = instrument === 'cello';
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <g transform={cello ? 'translate(0 -1.2) scale(1)' : 'rotate(-28 12 12)'}>
          <circle cx="12" cy="3.1" r="1.4" /><path d="M12 4.5v5" />
          <path d={BOWED_BODY} /><path d="M10.2 13.4v2.3M13.8 13.4v2.3M10.7 16.9h2.6" />
          {cello && <path d="M12 19.9v3" />}
        </g>
        {!cello && <path d="M4 20 20 6" strokeWidth="1.2" opacity=".7" />}
      </svg>
    );
  }
  return instrument === 'guitar' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m14 10 6-6 2 2-6 6M18 4l2 2M20 2l2 2M10 9c-3-2-4 1-4 3-4 0-5 4-2 7s7 2 7-2c2 0 5-1 3-4"/><circle cx="9" cy="14" r="2"/><path d="m5 17 2 2"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/><path d="M7 5h4v8H7zm6 0h4v8h-4z" fill="currentColor" stroke="none"/></svg>
  );
}

export default function StudioHeader({ score, settings, playing, onInstrumentChange, freePlay, onFreePlay, focus, onFocus, instrumentSettings = null }) {
  const current = normalizeInstrument(settings.practiceInstrument);
  return (
    <div className="studio-header">
      <div className="studio-heading">
        <span className="eyebrow"><i className={playing ? 'session-dot live' : 'session-dot'} /> YOUR PRACTICE STUDIO</span>
        <h2>{freePlay ? 'A little room to improvise.' : score?.title ?? 'Choose your next piece'}</h2>
        <p title={score?.title}>{freePlay ? 'Explore your instrument. Nothing is scored or saved.' : (score?.composer ?? 'Your practice session')}<span>{!freePlay && ` · ${Math.round((score?.bpm ?? 80) * settings.rate)} bpm · ${score?.key?.name ?? ''}`}</span></p>
      </div>
      <div className="studio-header-actions"><div className="workspace-switch" role="group" aria-label="Workspace"><button aria-pressed={!freePlay} onClick={() => onFreePlay(false)}>Learn</button><button aria-pressed={freePlay} onClick={() => onFreePlay(true)}>Free play</button></div>
      <div className="instrument-picker" role="group" aria-label="Practice instrument">
        {INSTRUMENTS.map(value => (
          <button key={value} aria-pressed={current === value} aria-label={instrumentInfo(value).label} title={`${instrumentInfo(value).label} · ${instrumentInfo(value).tagline}`}
            onClick={() => onInstrumentChange(value)}>
            <InstrumentIcon instrument={value} /><span>{instrumentInfo(value).label}</span>
          </button>
        ))}
      </div>{instrumentSettings}<button className="focus-toggle" aria-pressed={focus} onClick={onFocus} title={focus ? 'Show everything again (Esc)' : 'Hide panels and settings — just the music'}><Icon name={focus ? 'minimize' : 'focus'} size={14} />{focus ? 'Exit focus' : 'Focus'}</button></div>
    </div>
  );
}

/** What the stage is showing and the one thing to do with it. The studio footer carries it. */
export function stageCaption(instrument = 'piano', freePlay = false) {
  const stringed = isStringed(instrument), kit = stringKit(instrument);
  const name = instrumentInfo(instrument).label.toUpperCase();
  return {
    caption: freePlay ? name : !stringed ? 'PIANO ROLL' : kit.bowed ? `${name} FINGERS` : 'GUITAR TAB',
    description: freePlay ? (kit?.bowed ? 'Press and hold a place to bow it' : 'Click a note or play your controller')
      : !stringed ? 'Play as the notes reach the line' : kit.bowed ? 'Numbers show the finger to use' : 'Numbers show the fret to play',
  };
}

/** The settings of the instrument on stage. Sits beside the instrument picker in the studio header. */
export function InstrumentSettings({ settings, setSettings, instrument = 'piano', children }) {
  const stringed = isStringed(instrument), kit = stringKit(instrument);
  const [open, setOpen] = useState(false);
  const ref = useDialog({ open, onClose: () => setOpen(false) });
  const available = webglAvailable();
  const renderer = available ? settings.renderer : 'canvas';
  const quality = normalizeStageQuality(settings.stageQuality);
  return (
      <div className="popover-host instrument-settings-host">
      <button className="instrument-settings-toggle" aria-expanded={open} aria-haspopup="dialog" title="Instrument settings" onClick={() => setOpen(v => !v)}><Icon name="sliders" size={15} /><span>Instrument settings</span></button>
      {open && <><div className="popover-scrim" onClick={() => setOpen(false)} /><div className="popover instrument-settings-panel" ref={ref} role="dialog" aria-modal="true" aria-label="Instrument settings" tabIndex={-1}>
      <div className="settings-heading"><strong>Instrument settings</strong><button aria-label="Close instrument settings" onClick={() => setOpen(false)}>×</button></div>
      <p className="hint">{kit?.bowed ? `On the 3D Stage at full detail the ${kit.label.toLowerCase()} is a 3D model; at light detail it keeps the 2D fingerboard.` : 'Choose how your instrument looks and responds.'}</p><span className="settings-label">Appearance</span>
      <div className="stage-view-switch" role="group" aria-label="Stage appearance">
        {['canvas', 'gl'].map(value => <button key={value} aria-pressed={renderer === value}
          disabled={value === 'gl' && !available} title={value === 'gl' && !available ? '3D is unavailable on this browser. The 2D trainer is ready to use.' : undefined}
          onClick={() => setSettings(s => ({ ...s, renderer: value }))}>{value === 'gl' ? '3D Stage' : '2D Trainer'}</button>)}
      </div>
      {renderer === 'gl' && stringed && <><span className="settings-label">3D detail</span>
      <div className="stage-view-switch" role="group" aria-label="3D detail">
        {STAGE_QUALITIES.map(value => <button key={value} aria-pressed={quality === value} title={QUALITY_CHOICES[value]?.title}
          onClick={() => setSettings(s => ({ ...s, stageQuality: value }))}>{QUALITY_CHOICES[value]?.label ?? value}</button>)}
      </div>
      <p className="hint stage-detail-note" role="status">{explainStageDetail({ quality, tier: stageTierHere(quality), rendererName: webglRendererName() })}</p></>}
      {children}
      </div></>}
      </div>
  );
}
