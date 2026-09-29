import { useEffect, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { MIDI_STATUS, midiInput } from '../lib/midiInput.js';
import { noteName } from '../lib/theory.js';
import { InstrumentIcon } from './StudioHeader.jsx';
import { instrumentInfo, isStringed, normalizeInstrument, stringKit } from '../lib/instruments.js';

export default function SetupDialog({ settings, setSettings, midiState, audioReady, audioLabel, onTest, onClose, onAdvanced }) {
  const ref = useDialog({ onClose });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [heard, setHeard] = useState('');
  const [tested, setTested] = useState(false);
  const instrument = normalizeInstrument(settings.practiceInstrument);
  const info = instrumentInfo(instrument);
  const kit = stringKit(instrument);
  const guitar = instrument === 'guitar';
  const midi = settings.inputMethod === 'midi';
  const connected = midiState.status === MIDI_STATUS.READY && midiState.inputs.length > 0;
  useEffect(() => { setHeard(''); }, [midiState.selectedId, connected, midi]);
  useEffect(() => midiInput.onMessage(msg => {
    if (connected && midi && msg.type === 'noteon' && !msg.synthetic) setHeard(noteName(msg.midi));
  }), [connected, midi]);
  const connect = async () => { setBusy(true); setError(''); try { await midiInput.connect(); } finally { setBusy(false); } };
  const test = async () => {
    setBusy(true); setError('');
    try { setTested(false); await onTest(kit ? kit.tuning[0] : 60); setTested(true); }
    catch (e) { setError(`Sound could not start. ${e.message} Try again after checking your browser audio settings.`); }
    finally { setBusy(false); }
  };
  const guidance = connected ? 'Play one note on your controller to check the connection.'
    : midiState.status === MIDI_STATUS.DENIED ? 'MIDI permission is blocked. Allow MIDI in this site’s browser permissions, then try again.'
    : midiState.status === MIDI_STATUS.UNSUPPORTED ? 'This browser does not support MIDI. Use Chrome or Edge, or choose the on-screen instrument.'
    : midiState.status === MIDI_STATUS.ERROR ? 'MIDI could not be opened. Check the connection and browser permissions, then try again.'
    : 'Connect your USB MIDI controller, then look for a device. The on-screen instrument is always available.';
  return <div className="report-overlay setup-overlay">
    <section className="report setup-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1}>
      <header className="setup-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="setup-title">Your instrument, ready to play.</h2></div><button onClick={onClose} aria-label="Close instrument setup">×</button></header>
      <div className="setup-instrument"><InstrumentIcon instrument={instrument} /><div><strong>{info.label}</strong><span>{info.detail}</span></div></div>
      <h3 className="setup-section-title">Controller input</h3>
      <div className="setup-inputs" role="group" aria-label="Input preference">
        <button aria-pressed={!midi} onClick={() => setSettings(s => ({ ...s, inputMethod: 'screen' }))}><strong>On-screen instrument</strong><span>Click to play. No equipment needed.</span></button>
        <button aria-pressed={midi} onClick={() => setSettings(s => ({ ...s, inputMethod: 'midi' }))}><strong>MIDI controller</strong><span>Play your connected instrument.</span></button>
      </div>
      {midi ? <div className="setup-connection"><h3>{connected ? 'Controller connected' : 'Connect your controller'}</h3><p>{guidance}</p>
        {connected && <label>MIDI input<select value={midiState.selectedId ?? ''} onChange={e => midiInput.select(e.target.value)}>{midiState.inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
        <button disabled={busy || midiState.status === MIDI_STATUS.UNSUPPORTED} onClick={connect}>{busy ? 'Checking…' : connected ? 'Refresh devices' : 'Look for a device'}</button>
      </div> : <p className="setup-help">{guitar ? 'Click any fret to pluck a string. Free play gives you chord shapes and a strum control.' : kit?.bowed ? `Press and hold a place on the fingerboard to bow it. Free play has scales and open strings.` : 'Click a piano key, or use A–J on your computer keyboard for the middle-C octave.'}</p>}
      <div className="setup-sound"><div><strong>Sound output</strong><span>{audioReady ? audioLabel : 'One click enables audio in your browser.'}</span></div><button className="primary" disabled={busy} onClick={test}>{busy ? 'Starting…' : 'Play a test note'}</button></div>
      <p className="setup-output-status" role="status">{tested ? 'Test note sent to your selected sound output. Did you hear it?' : 'The test plays a sound; it does not check your controller.'}</p>
      {midi && <p className={`setup-detected ${heard ? 'verified' : ''}`} role="status">{heard ? `✓ Received ${heard} from your MIDI controller.` : 'Input not verified yet. Play a note on your MIDI controller.'}</p>}
      <details className="sound-recovery"><summary>No sound?</summary><ol><li>Check your computer volume, headphones, and whether this browser tab is muted.</li><li>Play the test note again. If you use an external sound module, check its speakers and MIDI output.</li><li>Open Audio &amp; calibration to check the sound source and output device. Use wired headphones if the sound arrives late.</li></ol></details>
      {isStringed(instrument) && <p className="hint">MIDI and on-screen input are supported. Acoustic {info.label.toLowerCase()} microphone recognition is not available.</p>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      <footer className="setup-actions"><button onClick={onAdvanced}>Audio & calibration</button><button className="primary" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
