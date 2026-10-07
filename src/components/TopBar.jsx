import LevelMeter from './LevelMeter.jsx';
import Icon from './Icon.jsx';
import { useState } from 'react';
import HelpDialog from './HelpDialog.jsx';
import { useDialog } from '../hooks/useDialog.js';

/**
 * Three destinations on the left, sound and input in one group on the right,
 * and everything you reach for once a week behind More. On a phone the
 * destinations are the tab bar along the bottom of the screen (chrome.css).
 */
export default function TopBar({ midiState, audioReady, audioLabel, onStartAudio, libraryOpen, onToggleLibrary, score, onLeaveDrill, theme, onToggleTheme, onSetup, onProgress, onLearn, learningHome, storageProblem }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const menuRef = useDialog({ open: menuOpen, onClose: closeMenu });
  const connected = midiState.inputs.length > 0;
  const saveNote = storageProblem
    ? 'Your browser could not save recent changes. This session may not be available after you leave.'
    : 'Progress and preferences are saved in this browser. Export a backup from Library → Progress.';
  return <header className="topbar">
    <div className="brand"><i className="mark" aria-hidden="true" /><h1>Practice Deck</h1></div>
    <nav className="topbar-nav" aria-label="Main">
      <button className="nav-link" aria-current={learningHome ? 'page' : undefined} onClick={onLearn}><Icon name="target" size={18} />Learning path</button>
      <button className="nav-link" aria-expanded={libraryOpen} onClick={onToggleLibrary}><Icon name="panel" size={18} />Library</button>
      <button className="nav-link" onClick={onProgress}><Icon name="flame" size={18} />Progress</button>
    </nav>
    {score?.drillOf && <button className="back-to-piece" onClick={onLeaveDrill}>← {score.drillOf.title}</button>}
    <div className="spacer" />
    {/* Saving is silent while it works; it takes space in the bar only when it has failed. */}
    {storageProblem && <span className="saved-locally save-problem" role="status" title={saveNote}><i />Changes not saved</span>}
    <div className="sound-input" role="group" aria-label="Sound and input">
      <button className="setup-trigger" onClick={onSetup}><span className={'connection-dot ' + (connected ? 'connected' : '')} /><span className="setup-label">{connected ? 'Controller connected' : 'Instrument setup'}</span></button>
      <div className="io-strip" aria-label="Sound">
        {audioReady ? <span className="io-slot ok audio-slot" title={`Sound ready · ${audioLabel}`}><i className="dot" /><strong>Sound ready</strong><LevelMeter /></span> : <button className="io-slot audio-slot" onClick={onStartAudio}><Icon name="volume" size={15} /> Enable sound</button>}
      </div>
    </div>
    <div className="popover-host topbar-more">
      <button className="more-toggle" aria-label="More" title="Help, theme and backup" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><Icon name="more" size={18} /></button>
      {menuOpen && <><div className="popover-scrim" onClick={closeMenu} /><div className="popover topbar-menu" ref={menuRef} role="dialog" aria-label="More" tabIndex={-1}>
        <button onClick={() => { closeMenu(); setHelpOpen(true); }}><Icon name="help" />Help</button>
        <button onClick={() => { closeMenu(); onToggleTheme(); }} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}><Icon name={theme === 'light' ? 'moon' : 'sun'} />{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>
        <button onClick={() => { closeMenu(); onProgress(); }}><Icon name="download" />Back up progress</button>
        <p className={`saved-locally menu-status ${storageProblem ? 'save-problem' : ''}`} title={saveNote}><i />{storageProblem ? 'Changes not saved' : 'Saved on this device'}</p>
      </div></>}
    </div>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </header>;
}
