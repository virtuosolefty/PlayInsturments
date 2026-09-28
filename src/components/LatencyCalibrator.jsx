import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { audio } from '../lib/audio.js';
import { midiInput } from '../lib/midiInput.js';
import { clampLatency, measureOffset } from '../lib/latency.js';

const BPM = 100;
const BEATS = 12;
const LEAD_IN_BEATS = 4; // clicks to find the pulse before we start measuring

/**
 * Tap-along calibration. Plays a steady click, records when you actually press
 * a key, and reports the offset between the two so timing can be corrected for
 * your machine rather than blamed on your playing.
 */
export default function LatencyCalibrator({ currentMs, onApply, onClose }) {
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [beat, setBeat] = useState(0);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState(currentMs ?? 0);

  const tapsRef = useRef([]);
  const beatsRef = useRef([]);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Collect key presses for the whole time the modal is open; only the ones
  // that land during the measured beats are used.
  useEffect(() => {
    return midiInput.onMessage((msg) => {
      if (msg.type !== 'noteon') return;
      tapsRef.current.push(msg.at ?? performance.now());
    });
  }, []);

  const start = useCallback(async () => {
    await audio.start();
    clearTimers();
    tapsRef.current = [];
    beatsRef.current = [];
    setResult(null);
    setBeat(0);
    setPhase('running');

    const spb = 60 / BPM;
    const total = LEAD_IN_BEATS + BEATS;

    for (let i = 0; i < total; i += 1) {
      const delayMs = i * spb * 1000;
      timersRef.current.push(
        setTimeout(() => {
          audio.metronomeTick(i % 4 === 0);
          setBeat(i + 1);
          // Only beats after the lead-in count as targets to tap against.
          if (i >= LEAD_IN_BEATS) beatsRef.current.push(performance.now());
        }, delayMs),
      );
    }

    timersRef.current.push(
      setTimeout(() => {
        const measured = measureOffset(tapsRef.current, beatsRef.current);
        setResult(measured);
        setManual(clampLatency(measured.offsetMs));
        setPhase('done');
      }, total * spb * 1000 + 400),
    );
  }, [clearTimers]);

  const cancel = useCallback(() => {
    clearTimers();
    onClose();
  }, [clearTimers, onClose]);

  const dialogRef = useDialog({ onClose: cancel });

  return (
    <div className="modal-scrim" onClick={cancel}>
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calibrate-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="calibrate-title">Calibrate timing</h3>

        {phase === 'idle' && (
          <>
            <p>
              You play in time with what you <em>hear</em>, and your speakers are always a little behind. That delay
              makes a perfectly timed run read as late. Tap any key on every click and the app will measure it.
            </p>
            <p className="hint">
              Four clicks to find the pulse, then twelve to measure. Play them as squarely on the beat as you can.
            </p>
          </>
        )}

        {phase === 'running' && (
          <>
            <div className="calib-beat">
              {beat <= LEAD_IN_BEATS ? 'get ready' : `${beat - LEAD_IN_BEATS} / ${BEATS}`}
            </div>
            <p className="hint">Tap any key on every click.</p>
            <div className="calib-dots">
              {Array.from({ length: LEAD_IN_BEATS + BEATS }, (_, i) => (
                <i key={i} className={i < beat ? (i < LEAD_IN_BEATS ? 'lead' : 'on') : ''} />
              ))}
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <>
            {result.usable ? (
              <p>
                You landed <strong>{result.offsetMs} ms</strong> {result.offsetMs >= 0 ? 'behind' : 'ahead of'} the
                click, from {result.taps} taps (±{result.spreadMs} ms). Applying this makes the timing score reflect
                your playing rather than your hardware.
              </p>
            ) : (
              <p>
                Couldn't read a reliable offset — {result.reason}. You can try again or set a value by hand.
              </p>
            )}
            <label className="field calib-manual">
              Offset
              <input
                type="range"
                min="-100"
                max="300"
                step="5"
                value={manual}
                onChange={(e) => setManual(Number(e.target.value))}
              />
              <span className="val">{manual} ms</span>
            </label>
          </>
        )}

        <div className="modal-actions">
          {phase === 'idle' && (
            <button className="primary" onClick={start}>
              Start
            </button>
          )}
          {phase === 'done' && (
            <>
              <button onClick={start}>Try again</button>
              <button className="primary" onClick={() => onApply(clampLatency(manual))}>
                Use {clampLatency(manual)} ms
              </button>
            </>
          )}
          <button onClick={cancel}>{phase === 'done' ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}
