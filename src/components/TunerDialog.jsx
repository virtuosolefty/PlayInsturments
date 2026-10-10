import { useEffect, useRef, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { useMicStatus } from '../hooks/useMicInput.js';
import { instrumentInfo, normalizeInstrument, stringKit } from '../lib/instruments.js';
import { MIC_STATUS, micInput } from '../lib/micInput.js';
import { noteName } from '../lib/theory.js';
import { steadyPitch, tunerReading } from '../lib/tuner.js';
import { InstrumentIcon } from './StudioHeader.jsx';

/** How many readings the tuner keeps to steady itself by, and how often the display follows them. */
const KEPT = 8, REFRESH_MS = 80;
/** The display holds its last note this long after the sound stops, so a plucked string can be read as it fades. */
const LINGER_MS = 1500;

const NO_STRINGS = Object.freeze([]);

const STATUS_TEXT = {
  [MIC_STATUS.OFF]: 'Turning the microphone on…',
  [MIC_STATUS.STARTING]: 'Waiting for the microphone. Your browser may ask for permission.',
  [MIC_STATUS.DENIED]: 'Microphone access is blocked. Allow it for this site in your browser’s address bar, then try again.',
  [MIC_STATUS.UNSUPPORTED]: 'This browser cannot use a microphone here. Try a current version of Chrome, Edge, Firefox or Safari, over https.',
};

/**
 * The tuner: play a note, and it says which note it is and how far off.
 *
 * On a string instrument it also says which string that is and which way to
 * turn the peg. The microphone is on only while this is open (or while it is
 * the way notes are played in: micInput.js), and what it hears is not
 * recorded or sent anywhere.
 *
 * @param {object} props
 * @param {string} props.instrument the instrument in hand; its strings are the ones offered
 * @param {() => void} props.onClose
 */
export default function TunerDialog({ instrument, onClose }) {
  const ref = useDialog({ onClose });
  const id = normalizeInstrument(instrument);
  const kit = stringKit(id);
  const tuning = kit?.tuning ?? NO_STRINGS;
  const mic = useMicStatus();
  const [reading, setReading] = useState(null);
  const [level, setLevel] = useState(0);
  const frames = useRef([]);

  useEffect(() => {
    const release = micInput.hold('tuner');
    const unlisten = micInput.onPitch(frame => { frames.current = [...frames.current.slice(-(KEPT - 1)), frame]; });
    let shown = 0;
    const timer = setInterval(() => {
      const recent = frames.current, now = performance.now();
      // Readings stop when the microphone does; the last of them must not stay on show as if it were now.
      const live = recent.length > 0 && now - recent.at(-1).at < 400;
      setLevel(live ? recent.at(-1).rms : 0);
      const next = tunerReading(steadyPitch(recent, { now }), tuning);
      if (next) { shown = performance.now(); setReading(next); }
      else if (performance.now() - shown > LINGER_MS) setReading(null);
    }, REFRESH_MS);
    return () => { clearInterval(timer); unlisten(); release(); };
  }, [tuning]);

  const listening = mic.status === MIC_STATUS.ON;
  const failed = [MIC_STATUS.DENIED, MIC_STATUS.ERROR, MIC_STATUS.UNSUPPORTED].includes(mic.status);
  const retriable = [MIC_STATUS.DENIED, MIC_STATUS.ERROR].includes(mic.status);
  const problem = mic.status === MIC_STATUS.ERROR ? mic.error : STATUS_TEXT[mic.status];
  // What is read out: the note and which way it is off. It changes when either does, not with every cent.
  const spoken = !reading ? '' : `${reading.name}, ${reading.state === 'in-tune' ? 'in tune' : reading.state}${reading.string && reading.string.advice !== 'in tune' ? `: ${reading.string.advice}` : ''}`;
  const cents = reading ? Math.abs(reading.cents) : 0;
  const verdict = !reading ? 'Play one note and let it ring.'
    : reading.state === 'in-tune' ? 'In tune'
    : `${cents} ${cents === 1 ? 'cent' : 'cents'} ${reading.state}`;
  const order = Array.from({ length: tuning.length }, (_, s) => s);
  return <div className="report-overlay setup-overlay">
    <section className="report setup-dialog tuner-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="tuner-title" tabIndex={-1}>
      <header className="setup-heading"><div><h2 id="tuner-title">Tuner</h2></div><button onClick={onClose} aria-label="Close tuner">×</button></header>
      <div className="setup-instrument"><InstrumentIcon instrument={id} /><div><strong>{instrumentInfo(id).label}</strong><span>{kit ? `Open strings · ${order.map(s => noteName(tuning[s])).join(' ')}` : 'Any note · A = 440 Hz'}</span></div></div>

      <div className={`tuner-face ${reading?.state ?? 'waiting'}`} data-note={reading?.name ?? ''} data-cents={reading ? reading.cents : ''}>
        <strong className="tuner-note" aria-hidden="true">{reading?.name ?? '—'}</strong>
        <div className="tuner-scale" aria-hidden="true">
          <span>♭</span>
          <div className="tuner-track"><i className="tuner-centre" />{reading && <i className="tuner-needle" style={{ left: `${50 + reading.needle * 50}%` }} />}</div>
          <span>♯</span>
        </div>
        <p className="tuner-verdict">{verdict}</p>
        {/* The cents move many times a second, which a screen reader would read out without end. */}
        <p className="sr-only" role="status">{spoken}</p>
      </div>

      {kit && <ul className="tuner-strings" aria-label={`${kit.label} strings`}>{order.map(s => {
        const mine = reading?.string?.index === s;
        return <li key={s} className={mine ? `tuning ${reading.string.advice.replace(' ', '-')}` : ''} data-string={kit.stringName(s).number}>
          <small>String {kit.stringName(s).number}</small><b>{noteName(tuning[s])}</b>
          <span>{mine ? (reading.string.advice === 'in tune' ? '✓ in tune' : reading.string.advice === 'tune up' ? '↑ tune up' : '↓ tune down') : ''}</span>
        </li>;
      })}</ul>}

      {listening
        ? <div className="tuner-listening"><span>Listening</span><meter aria-label="Microphone level" min="0" max="0.3" value={Math.min(0.3, level)} /></div>
        : <div className="tuner-problem"><p role={failed ? 'alert' : 'status'}>{problem}</p>
          {/* Kept in place while it retries, so the keyboard's place in the dialog is not lost. */}
          {mic.status !== MIC_STATUS.UNSUPPORTED && <button className="primary" aria-disabled={!retriable} onClick={() => { if (retriable) micInput.retry(); }}>Try again</button>}</div>}
      <p className="hint">Your sound stays on this device. It is not recorded or sent anywhere.</p>
      <footer className="setup-actions"><span /><button className="primary" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
