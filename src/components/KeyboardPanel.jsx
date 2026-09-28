import { useState } from 'react';
import KeyboardMap from './KeyboardMap.jsx';
import Explain from './Explain.jsx';
import VelocityCurve from './VelocityCurve.jsx';
import { IDENTITY_CURVE, isIdentity } from '../lib/velocity.js';
import { AUTO_PROFILE, KEYBOARD_PROFILES } from '../lib/devices.js';
import { FIT_MODES, describeFit } from '../lib/arrange.js';
import { INSTRUMENT_MODES } from '../lib/midiOutput.js';
import { noteName } from '../lib/theory.js';

const FIT_CHOICES = [
  [FIT_MODES.OFF, 'As written', 'Play the piece exactly as written. Notes past your keys stay unreachable.'],
  [FIT_MODES.SHIFT, 'Octave shift', 'Move the whole piece into your octave. Every interval survives exactly.'],
  [FIT_MODES.FOLD, 'Fit my keys', 'Shift, then fold anything still out of reach into range so every note is playable.'],
];

/**
 * Keyboard setup: which controller you are on, how many keys it has, where its
 * octave currently sits, and how scores should be bent to fit it.
 */
export default function KeyboardPanel({
  deviceName,
  profile,
  profileId,
  onProfileChange,
  window: keyWindow,
  onShiftOctave,
  onResetOctave,
  autoDetected,
  fit,
  onFitChange,
  assessment,
  latencyMs = 0,
  onCalibrate,
  velocityCurve = IDENTITY_CURVE,
  onCalibrateTouch,
  instrumentSource = INSTRUMENT_MODES.INTERNAL,
  onInstrumentSourceChange,
  outputs = [],
  selectedOutputId = null,
  onSelectOutput,
  forwardInput = true,
  onForwardInputChange,
  onLoadSamples,
  pieceRange = null,
  onMoveWindow,
}) {
  const external = instrumentSource === INSTRUMENT_MODES.EXTERNAL;
  const touchCalibrated = !isIdentity(velocityCurve);

  /**
   * Are we forwarding notes back to the very device they came from?
   *
   * Compared on name rather than id: the input and output halves of one USB
   * controller are two different ports with two different ids and, on every
   * driver worth the name, the same label.
   */
  const outputName = outputs.find((o) => o.id === selectedOutputId)?.name ?? null;
  const sameDevice =
    !!outputName && !!deviceName && outputName.toLowerCase() === deviceName.toLowerCase();
  const echoRisk = sameDevice ? outputName : null;
  const [sampleDrag, setSampleDrag] = useState(false);
  const [low, high] = keyWindow;

  return (
    <div className="section">
      <h2 className="section-title">Your keyboard</h2>

      <select
        className="picker"
        value={profileId}
        onChange={(e) => onProfileChange(e.target.value)}
        title="Pick your controller, or let the app read it from the MIDI port name"
      >
        <option value={AUTO_PROFILE}>
          Auto{autoDetected ? ` — ${autoDetected.label}` : ''}
        </option>
        {KEYBOARD_PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} · {p.keyCount} keys
          </option>
        ))}
      </select>

      <p className="hint device-name">
        {deviceName ? `Reading ${deviceName}` : 'No controller connected — using the profile above.'}
      </p>

      <KeyboardMap window={keyWindow} range={pieceRange} onMove={onMoveWindow} />

      <div className="octave-row">
        <button onClick={() => onShiftOctave(-1)} title="Your controller's OCT− button" disabled={low <= 0}>
          ◀
        </button>
        <span className="range-readout">
          <strong>
            {noteName(low)}–{noteName(high)}
          </strong>
          <span>{profile.keyCount} keys</span>
        </span>
        <button onClick={() => onShiftOctave(1)} title="Your controller's OCT+ button" disabled={high >= 127}>
          ▶
        </button>
      </div>
      <div className="row-end">
        <button className="linky" onClick={onResetOctave}>
          Reset to default
        </button>
      </div>
      <Explain label="How the octave follows">
        Press OCT+ or OCT− on the controller and play any key — the window catches up on its own.
        It is not remembered between sessions, because the hardware forgets it too when you unplug.
      </Explain>

      <div className="fit-switch">
        {FIT_CHOICES.map(([value, label, title]) => (
          <button key={value} className={fit === value ? 'on' : ''} onClick={() => onFitChange(value)} title={title}>
            {label}
          </button>
        ))}
      </div>

      {assessment && (
        <p className={`hint fit-note ${assessment.verdict}`}>
          <strong>This piece: </strong>
          {describeFit(assessment)}
        </p>
      )}

      <h2 className="section-title" style={{ marginTop: 16 }}>
        Where the sound comes from
      </h2>
      <div className="fit-switch two">
        <button
          className={!external ? 'on' : ''}
          onClick={() => onInstrumentSourceChange(INSTRUMENT_MODES.INTERNAL)}
          title="The app plays the notes itself, in the browser."
        >
          This app
        </button>
        <button
          className={external ? 'on' : ''}
          disabled={outputs.length === 0}
          onClick={() => onInstrumentSourceChange(INSTRUMENT_MODES.EXTERNAL)}
          title={
            outputs.length === 0
              ? 'No MIDI output ports found. Open your plugin and connect it to a MIDI port first.'
              : 'Send notes to a plugin or hardware module and let it make the sound.'
          }
        >
          A plugin
        </button>
      </div>

      {external && (
        <>
          <select
            className="picker"
            value={selectedOutputId ?? ''}
            onChange={(e) => onSelectOutput(e.target.value)}
            title="Which MIDI port your instrument is listening on"
          >
            {outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <label className="toggle" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={forwardInput}
              onChange={(e) => onForwardInputChange(e.target.checked)}
            />
            Send my playing to the plugin
          </label>

          {/* The single most common way to end up hearing everything twice, and
              it is detectable: if the port we are sending to is the controller
              you are playing, then whatever is making the sound is listening to
              that controller directly — and it will hear every note once from
              your hands and again from us.

              A warning rather than a silent correction. Some rigs really do
              loop back through the controller's own port on purpose, and
              quietly switching forwarding off under those would be the same
              kind of well-meant guess that caused the bug above it. */}
          {forwardInput && echoRisk && (
            <p className="hint warn-hint">
              <strong>You will probably hear every note twice.</strong> You are sending to{' '}
              <em>{echoRisk}</em>, which is the controller you are playing — so your plugin is
              almost certainly already hearing you directly. Untick the box above.
            </p>
          )}
        </>
      )}

      <Explain label={external ? 'What stays in the browser' : 'Using a real plugin'}>
        {external
          ? 'The plugin makes the piano sound; the metronome and error cues stay in the browser, where they belong.'
          : 'A browser cannot host a VST or AU plugin, but it can send one notes. Open Mini Grand on a MIDI port and pick “A plugin” to hear the real thing.'}
      </Explain>

      {!external && (
        <>
          <div
            className={`file-drop compact ${sampleDrag ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSampleDrag(true);
            }}
            onDragLeave={() => setSampleDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSampleDrag(false);
              onLoadSamples([...e.dataTransfer.files]);
            }}
          >
            Drop piano samples here,
            <br />
            or{' '}
            <label>
              browse
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={(e) => onLoadSamples([...e.target.files])}
              />
            </label>
          </div>
          <Explain label="Naming your samples">
            Bounce a few notes out of Mini Grand — one per octave is plenty — and name them for the pitch they
            record (<code>C4.wav</code>, <code>Ds3.wav</code>). The app reads the pitch from the filename and plays
            everything in between by shifting the nearest sample.
          </Explain>
        </>
      )}

      <div className="kv latency-row">
        <span>Timing offset</span>
        <span className="latency-value">
          <span className="val">{latencyMs ? `${latencyMs} ms` : 'not set'}</span>
          <button className="tiny-action" onClick={onCalibrate}>
            Calibrate
          </button>
        </span>
      </div>
      <Explain label="Why this matters">
        Your speakers run a little behind your fingers, which makes good playing read as late. Measure it
        once and the timing score becomes about you rather than your machine.
      </Explain>

      {/* Its twin. Timing offset answers "when did the hardware say I played";
          this answers "how hard did it say I played", and both were being
          scored as though they were facts about the player. */}
      <div className="kv latency-row">
        <span>Touch</span>
        <span className="latency-value">
          <span className="val">{touchCalibrated ? 'calibrated' : 'not set'}</span>
          <button className="tiny-action" onClick={onCalibrateTouch}>
            Calibrate
          </button>
        </span>
      </div>
      <VelocityCurve curve={velocityCurve} />
      <Explain label="Why this matters">
        Every controller decides for itself how hard it thinks you played, and small keyboards often cannot
        report a genuinely quiet note at all — which reads as a player who hits everything at one weight.
        Measure your range once and the dynamics score becomes about your hands.
      </Explain>
    </div>
  );
}
