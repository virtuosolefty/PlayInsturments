import LevelMeter from './LevelMeter.jsx';
import Icon from './Icon.jsx';
import { useState } from 'react';
import HelpDialog from './HelpDialog.jsx';

export default function TopBar({ midiState, audioReady, audioLabel, onStartAudio, libraryOpen, onToggleLibrary, score, onLeaveDrill, theme, onToggleTheme, onSetup, onProgress, onLearn, learningHome, storageProblem }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const connected = midiState.inputs.length > 0;
  return <header className="topbar">
    <div className="brand"><i className="mark" aria-hidden="true" /><h1>Practice Deck</h1></div>
    <button className="nav-link learning-nav" aria-current={learningHome ? 'page' : undefined} onClick={onLearn}>Learning path</button>
    <button className={'drawer-toggle ' + (libraryOpen ? 'on' : '')} onClick={onToggleLibrary} aria-expanded={libraryOpen}><span className="bars" aria-hidden="true" />Library</button>
    <button className="nav-link" onClick={onProgress}>Progress</button>
    {score?.drillOf && <button className="back-to-piece" onClick={onLeaveDrill}>← {score.drillOf.title}</button>}
    <div className="spacer" />
    <span className={`saved-locally ${storageProblem?'save-problem':''}`} title={storageProblem?'Your browser could not save recent changes. This session may not be available after you leave.':'Progress and preferences are saved in this browser. Export a backup from Library → Progress.'}><i />{storageProblem?'Changes not saved':'Saved on this device'}</span>
    <button className="setup-trigger" onClick={onSetup}><span className={'connection-dot ' + (connected ? 'connected' : '')} />{connected ? 'Controller connected' : 'Instrument setup'}</button>
    <div className="io-strip" aria-label="Sound">
      {audioReady ? <span className="io-slot ok audio-slot" title={`Sound ready · ${audioLabel}`}><i className="dot" /><strong>Sound ready</strong><LevelMeter /></span> : <button className="io-slot audio-slot" onClick={onStartAudio}><Icon name="volume" size={15} /> Enable sound</button>}
    </div>
    <button className="nav-link sound-help" onClick={onSetup}>No sound?</button>
    <button className="nav-link" onClick={() => setHelpOpen(true)} aria-haspopup="dialog">Help</button>
    <button className="theme-toggle" onClick={onToggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{theme === 'light' ? <><path d="M20 15.3A8.3 8.3 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3Z" /></> : <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>}</svg>
      <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </header>;
}
