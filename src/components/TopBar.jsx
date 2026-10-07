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
      <Icon name={theme === 'light' ? 'moon' : 'sun'} />
      <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </header>;
}
