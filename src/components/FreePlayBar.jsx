import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { midiInput } from '../lib/midiInput.js';
import { drumForMidi } from '../lib/drums.js';
import { noteName } from '../lib/theory.js';

/** What free play's explorer is called for a kit, or null where there is none (the piano). */
export function explorerName(kit) {
  if (!kit) return null;
  if (kit.drums) return 'Drum keys';
  if (kit.bowed) return 'Scales';
  return kit.chords.length ? 'Chords' : 'Open strings';
}

/** How to play the instrument with nothing plugged in, in one line. */
export function playHint(kit) {
  if (!kit) return <>Computer keys <kbd>A</kbd>–<kbd>J</kbd> play C to B · <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> the black keys</>;
  if (kit.drums) return <>Press a drum’s letter: <kbd>K</kbd> kick · <kbd>S</kbd> snare · <kbd>H</kbd> hi-hat</>;
  if (kit.bowed) return 'Press and hold a place on the string to bow it';
  return 'Click between two frets to pluck that note';
}

/** Brings the explorer card into view and puts the keyboard on its first control. */
function showExplorer() {
  const card = document.querySelector('.chord-card, .drum-card');
  if (!card) return;
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  card.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  card.classList.remove('spotlight');
  // Reading a layout property restarts the animation when the button is pressed twice.
  void card.offsetWidth;
  card.classList.add('spotlight');
}

/**
 * Free play's one row of things to do: go to the explorer (chords, scales or
 * the drum keys), tune, check input and sound. Beside them, the note played
 * last and how to play with nothing plugged in. Every button here is the same
 * height (`.view-tool`).
 *
 * @param {object} props
 * @param {object|null} props.kit the instrument's kit (instruments.js), null for the piano
 * @param {() => void} [props.onTuner] offered for instruments that are tuned
 * @param {() => void} props.onSetup opens Input & sound
 */
export default function FreePlayBar({ kit, onTuner, onSetup }) {
  const [last, setLast] = useState('');
  useEffect(() => { setLast(''); }, [kit]);
  useEffect(() => midiInput.onMessage(message => {
    if (message.type !== 'noteon') return;
    setLast(kit?.drums ? drumForMidi(message.midi)?.label ?? '' : noteName(message.midi));
  }), [kit]);
  const explorer = explorerName(kit);
  return <div className="free-play-bar" role="toolbar" aria-label="Free play">
    {explorer && <button type="button" className="view-tool" onClick={showExplorer}><Icon name="music" size={14} />{explorer}</button>}
    {onTuner && <button type="button" className="view-tool" onClick={onTuner} title="Tune your instrument with the microphone"><Icon name="tuner" size={14} />Tuner</button>}
    <button type="button" className="view-tool" onClick={onSetup} title="Choose how you play, and check that you are heard"><Icon name="sliders" size={14} />Check input</button>
    <span className="free-play-last" role="status" aria-label="Last note played"><small>LAST PLAYED</small><strong>{last || '—'}</strong></span>
    <span className="free-play-hint">{playHint(kit)}</span>
  </div>;
}
