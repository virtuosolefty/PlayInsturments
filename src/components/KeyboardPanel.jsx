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
 * The rest of Input & sound, under its "More options" (SetupDialog.jsx): the
 * two measurements that make the scores about the player, the size of a piano
 * keyboard and how pieces are bent to fit it, and, for the few who want it,
 * sound from a plugin instead of the app.
 *
 * @param {object} props
 * @param {boolean} [props.piano] the keyboard's size and fit matter only to the piano
 * @param {boolean} [props.midi] touch is a controller's to measure, so it is offered when one is how you play
 */
export default function KeyboardPanel({
  piano = true,
  midi = true,
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
    <div className="setup-more-body">
      <h3 className="setup-section-title">Make the scores about you</h3>
      <div className="kv latency-row">
        <span>
          <strong>Sound arrives late?</strong>
          <small>Your speakers run a little behind your fingers, which makes good playing read as late.</small>
        </span>
        <span className="latency-value">
          <span className="val">{latencyMs ? `${latencyMs} ms` : 'not measured'}</span>
          <button className="tiny-action" onClick={onCalibrate} aria-label="Measure the timing offset">
            Measure
          </button>
        </span>
      </div>

      {/* Its twin. Timing offset answers "when did the hardware say I played";
          this answers "how hard did it say I played", and both were being
          scored as though they were facts about the player. */}
      {midi && (
        <>
          <div className="kv latency-row">
            <span>
              <strong>Keys feel too loud or too soft?</strong>
              <small>Every controller decides for itself how hard it thinks you played.</small>
            </span>
            <span className="latency-value">
              <span className="val">{touchCalibrated ? 'measured' : 'not measured'}</span>
              <button className="tiny-action" onClick={onCalibrateTouch} aria-label="Measure your touch">
                Measure
              </button>
            </span>
          </div>
          {/* A straight line says nothing: the curve is drawn once there is one. */}
          {touchCalibrated && <VelocityCurve curve={velocityCurve} />}
        </>
      )}

      {piano && (
        <>
          <h3 className="setup-section-title">Your keyboard</h3>
          <select
            className="picker"
            aria-label="Keyboard"
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
            <button onClick={() => onShiftOctave(-1)} title="Your controller's OCT− button" aria-label="Octave down" disabled={low <= 0}>
              ◀
            </button>
            <span className="range-readout">
              <strong>
                {noteName(low)}–{noteName(high)}
              </strong>
              <span>{profile.keyCount} keys</span>
            </span>
            <button onClick={() => onShiftOctave(1)} title="Your controller's OCT+ button" aria-label="Octave up" disabled={high >= 127}>
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

          <div className="fit-switch" role="group" aria-label="Fit pieces to my keys">
            {FIT_CHOICES.map(([value, label, title]) => (
              <button key={value} className={fit === value ? 'on' : ''} aria-pressed={fit === value} onClick={() => onFitChange(value)} title={title}>
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
        </>
      )}

      {/* Useful to few: a plugin or a sound module making the sound, or samples of your own. */}
      <details className="advanced-sound" open={external || undefined}>
        <summary>Advanced: external sound</summary>
        <p className="hint">Where the sound comes from. Leave this on “This app” unless you have a plugin or a sound module.</p>
        <div className="fit-switch two" role="group" aria-label="Where the sound comes from">
          <button
            className={!external ? 'on' : ''}
            aria-pressed={!external}
            onClick={() => onInstrumentSourceChange(INSTRUMENT_MODES.INTERNAL)}
            title="The app plays the notes itself, in the browser."
          >
            This app
          </button>
          <button
            className={external ? 'on' : ''}
            aria-pressed={external}
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
              aria-label="MIDI output"
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

        {piano && !external && (
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
      </details>
    </div>
  );
}
