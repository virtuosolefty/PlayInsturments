import { useDialog } from '../hooks/useDialog.js';
import { InstrumentIcon } from './StudioHeader.jsx';
import { INSTRUMENTS, instrumentInfo } from '../lib/instruments.js';

export default function FirstRun({ onDone, practiceInstrument = 'piano', onInstrumentChange, onSetup, onBeginner }) {
  const dialogRef = useDialog({ onClose: onDone });
  return <div className="report-overlay first-run-overlay"><section className="report first-run welcome-studio" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="first-run-title" tabIndex={-1}>
    <header><span className="eyebrow">PRACTICE DECK</span><h2 id="first-run-title">A little practice. A little progress.</h2><p>Choose your instrument and start with a short phrase.</p></header>
    <div className="welcome-instruments" role="group" aria-label="Choose your first instrument">{INSTRUMENTS.map(value => <button key={value} aria-pressed={practiceInstrument === value} onClick={() => onInstrumentChange?.(value)}><InstrumentIcon instrument={value}/><strong>{instrumentInfo(value).label}</strong><span>{instrumentInfo(value).tagline}</span></button>)}</div>
    <ol className="welcome-steps"><li><b>01</b><span><strong>Listen once</strong>Get a feel for the melody.</span></li><li><b>02</b><span><strong>Find your notes</strong>Wait for me lets you take your time.</span></li><li><b>03</b><span><strong>Make it flow</strong>Practice at a comfortable tempo.</span></li></ol>
    <p className="hint">Start with the on-screen instrument or connect a MIDI controller. Your progress stays on this device.</p>
    <div className="report-actions"><button onClick={onDone}>Explore freely</button><button className="primary" onClick={onBeginner}>Guide me from the beginning →</button></div>
  </section></div>;
}

