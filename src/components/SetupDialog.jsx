import { useEffect, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { MIDI_STATUS, midiInput } from '../lib/midiInput.js';
import { MIC_STATUS, micInput } from '../lib/micInput.js';
import { useMicStatus } from '../hooks/useMicInput.js';
import { noteName } from '../lib/theory.js';
import { InstrumentIcon } from './StudioHeader.jsx';
import { instrumentInfo, normalizeInstrument, stringKit } from '../lib/instruments.js';

const MIC_TEXT = {
  [MIC_STATUS.OFF]: 'Turning the microphone on…',
  [MIC_STATUS.STARTING]: 'Waiting for the microphone. Your browser may ask for permission.',
  [MIC_STATUS.ON]: 'Play one note on your instrument to check that it is heard.',
  [MIC_STATUS.DENIED]: 'Microphone access is blocked. Allow it for this site in your browser’s address bar, then try again.',
  [MIC_STATUS.UNSUPPORTED]: 'This browser cannot use a microphone here. Try a current version of Chrome, Edge, Firefox or Safari, over https.',
};

/** A numbered step of the dialog: its number, its name, and whether it is done. */
function Step({ number, title, done = false, children }) {
  return <section className={`setup-step ${done ? 'done' : ''}`} aria-label={`Step ${number}: ${title}`}>
    <h3 className="setup-section-title"><i aria-hidden="true">{done ? '✓' : number}</i>{title}</h3>
    {children}
  </section>;
}

/**
 * Input & sound, in the order somebody sets up: choose how you play, check
 * that you are heard, check that you hear the app. Everything else to do with
 * input and sound (the measurements, a piano keyboard's size, sound from a
 * plugin) is under "More options" in the same dialog, so there is one place
 * for all of it.
 *
 * @param {object} props
 * @param {import('react').ReactNode} [props.more] what "More options" holds (KeyboardPanel.jsx)
 */
export default function SetupDialog({ settings, setSettings, midiState, audioReady, audioLabel, onTest, onTuner, onClose, more }) {
  const ref = useDialog({ onClose });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [heard, setHeard] = useState('');
  const [tested, setTested] = useState(false);
  const instrument = normalizeInstrument(settings.practiceInstrument);
  const info = instrumentInfo(instrument);
  const kit = stringKit(instrument);
  const fretted = !!kit?.fretted;
  const midi = settings.inputMethod === 'midi';
  // The microphone hears one pitch at a time, which a drum kit does not have.
  const drums = instrument === 'drums';
  const mic = settings.inputMethod === 'mic' && !drums;
  const micState = useMicStatus();
  const micOn = micState.status === MIC_STATUS.ON;
  const micFailed = [MIC_STATUS.DENIED, MIC_STATUS.ERROR].includes(micState.status);
  const [micHeard, setMicHeard] = useState('');
  const connected = midiState.status === MIDI_STATUS.READY && midiState.inputs.length > 0;
  useEffect(() => { setHeard(''); }, [midiState.selectedId, connected, midi]);
  useEffect(() => midiInput.onMessage(msg => {
    if (connected && midi && msg.type === 'noteon' && !msg.synthetic) setHeard(noteName(msg.midi));
    if (msg.type === 'noteon' && msg.source === 'mic') setMicHeard(noteName(msg.midi));
  }), [connected, midi]);
  useEffect(() => { if (!micOn) setMicHeard(''); }, [micOn]);
  const connect = async () => { setBusy(true); setError(''); try { await midiInput.connect(); } finally { setBusy(false); } };
  const test = async () => {
    setBusy(true); setError('');
    try { setTested(false); await onTest(instrument === 'drums' ? 38 : kit ? kit.tuning[0] : 60); setTested(true); }
    catch (e) { setError(`Sound could not start. ${e.message} Try again after checking your browser audio settings.`); }
    finally { setBusy(false); }
  };
  const guidance = connected ? 'Play one note on your controller to check the connection.'
    : midiState.status === MIDI_STATUS.DENIED ? 'MIDI permission is blocked. Allow MIDI in this site’s browser permissions, then try again.'
    : midiState.status === MIDI_STATUS.UNSUPPORTED ? 'This browser does not support MIDI. Use Chrome or Edge, or choose the on-screen instrument.'
    : midiState.status === MIDI_STATUS.ERROR ? (midiState.error || 'MIDI could not be opened. Check the connection and browser permissions, then try again.')
    : midiState.status === MIDI_STATUS.READY ? 'The browser has MIDI access but sees no controller. Plug it in directly, close any other program using it (a DAW or a piano plug-in), then press Look for a device.'
    : 'Connect your USB MIDI controller, then look for a device. The on-screen instrument is always available.';
  // On screen there is nothing to connect, so the step is done as it stands.
  const heardYou = mic ? !!micHeard : midi ? !!heard : true;
  return <div className="report-overlay setup-overlay">
    <section className="report setup-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1}>
      <header className="setup-heading"><div><h2 id="setup-title">Your instrument, ready to play.</h2></div><button onClick={onClose} aria-label="Close input and sound">×</button></header>
      <div className="setup-instrument"><InstrumentIcon instrument={instrument} /><div><strong>{info.label}</strong><span>{info.detail}</span></div></div>

      <Step number={1} title="Choose how you play" done>
        <div className="setup-inputs" role="group" aria-label="Input preference">
          <button aria-pressed={!midi && !mic} onClick={() => setSettings(s => ({ ...s, inputMethod: 'screen' }))}><strong>On-screen instrument</strong><span>Click to play. No equipment needed.</span></button>
          <button aria-pressed={midi} onClick={() => setSettings(s => ({ ...s, inputMethod: 'midi' }))}><strong>MIDI controller</strong><span>Play your connected instrument.</span></button>
          <button aria-pressed={mic} disabled={drums} onClick={() => setSettings(s => ({ ...s, inputMethod: 'mic' }))}><strong>Microphone</strong><span>{drums ? 'Not for drums: it cannot tell one drum from another.' : `Play your real ${info.label.toLowerCase()}, one note at a time.`}</span></button>
        </div>
      </Step>

      <Step number={2} title="Check you are heard" done={heardYou}>
        {mic ? <div className="setup-connection setup-microphone"><h4>{micOn ? 'Microphone on' : 'Turn on your microphone'}</h4>
          <p role={micFailed ? 'alert' : 'status'}>{micState.status === MIC_STATUS.ERROR ? micState.error : MIC_TEXT[micState.status]}</p>
          {/* Kept in place while it retries, so the keyboard's place in the dialog is not lost. */}
          {!micOn && <button aria-disabled={!micFailed} onClick={() => { if (micFailed) micInput.retry(); }}>Try again</button>}
          <p className={`setup-detected ${micHeard ? 'verified' : ''}`} role="status">{micHeard ? `✓ Heard ${micHeard} from your ${info.label.toLowerCase()}.` : micOn ? 'Nothing heard yet.' : ''}</p>
          <ul className="setup-mic-limits">
            <li>It hears single notes: a chord or a strum is not recognised.</li>
            <li>Wear headphones whenever the app itself is sounding, so the microphone hears only you. The app makes no sound for your own notes.</li>
            <li>Nothing is recorded or sent anywhere.</li>
          </ul>
          <button onClick={onTuner}>Open the tuner</button>
        </div> : midi ? <div className="setup-connection"><h4>{connected ? 'Controller connected' : 'Connect your controller'}</h4><p>{guidance}</p>
          {connected && <label>MIDI input<select value={midiState.selectedId ?? ''} onChange={e => midiInput.select(e.target.value)}>{midiState.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
          <button disabled={busy || midiState.status === MIDI_STATUS.UNSUPPORTED} onClick={connect}>{busy ? 'Checking…' : connected ? 'Refresh devices' : 'Look for a device'}</button>
          <p className={`setup-detected ${heard ? 'verified' : ''}`} role="status">{heard ? `✓ Received ${heard} from your MIDI controller.` : 'Input not verified yet. Play a note on your MIDI controller.'}</p>
        </div> : <p className="setup-help">{instrument === 'drums' ? 'Tap a drum on the kit or a pad, or press the letter it starts with: K for kick, S for snare, H for hi-hat.' : fretted ? (kit.chords.length ? 'Click any fret to pluck a string. Free play gives you chord shapes and a strum control.' : 'Click any fret to pluck a string. Free play has the whole neck to explore.') : kit?.bowed ? `Press and hold a place on the fingerboard to bow it. Free play has scales and open strings.` : 'Click a piano key, or use A–J on your computer keyboard for the middle-C octave.'}</p>}
        {drums && <p className="hint">On-screen and MIDI input are supported. The microphone cannot tell one drum from another, so it is not offered for the kit.</p>}
      </Step>

      <Step number={3} title="Check the sound" done={tested}>
        <div className="setup-sound"><div><strong>Sound output</strong><span>{audioReady ? audioLabel : 'One click enables audio in your browser.'}</span></div><button className="primary" disabled={busy} onClick={test}>{busy ? 'Starting…' : 'Play a test note'}</button></div>
        <p className="setup-output-status" role="status">{tested ? 'Test note sent to your selected sound output. Did you hear it?' : 'The test plays a sound; it does not check your controller.'}</p>
        <details className="sound-recovery"><summary>No sound?</summary><ol><li>Check your computer volume, headphones, and whether this browser tab is muted.</li><li>Play the test note again. If you use an external sound module, check its speakers and MIDI output.</li><li>Open More options below to check where the sound comes from. Use wired headphones if the sound arrives late.</li></ol></details>
        {error && <p className="setup-error" role="alert">{error}</p>}
      </Step>

      {more && <details className="setup-more"><summary>More options<small>{instrument === 'piano' ? 'Timing, touch, keyboard size, external sound' : 'Timing, touch, external sound'}</small></summary>{more}</details>}
      <footer className="setup-actions"><button className="primary" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
