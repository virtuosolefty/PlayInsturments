import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../hooks/useDialog.js';
import { audio } from '../lib/audio.js';
import { midiInput } from '../lib/midiInput.js';
import { fitCurve, IDENTITY_CURVE, MIN_NOTES_PER_PASS } from '../lib/velocity.js';
import VelocityCurve from './VelocityCurve.jsx';

/** Enough notes to take a median from without making it a chore. */
const NOTES_PER_PASS = 8;

/**
 * The three passes, in order. Wording matters more than it looks: "as softly as
 * you can" and "as loudly as is comfortable" are asking for the *ends of your
 * range*, not for a quiet note and a loud one, and someone who reads it the
 * casual way produces a calibration that barely opens the range up at all.
 */
const PASSES = [
  {
    id: 'soft',
    title: 'As softly as you can',
    hint: 'Play any notes at the very quietest your keyboard will still sound. This is the bottom of your range.',
  },
  {
    id: 'normal',
    title: 'At a comfortable level',
    hint: 'How you would play most of the time, without thinking about it.',
  },
  {
    id: 'hard',
    title: 'As loudly as is comfortable',
    hint: 'Firm, but nothing you would not do for a whole piece. No need to hurt the keys or yourself.',
  },
];

/**
 * Measuring what your hands and your controller produce together.
 *
 * The app grades your touch — dynamics is part of the star score — by comparing
 * the velocity your controller reports against the one written in the score.
 * Those are only in the same units if the controller happens to be linear, and
 * mini controllers are emphatically not: play as softly as you physically can
 * on a 25-key and it may still report half the range, which reads as a player
 * who thumps everything.
 *
 * Deliberately shaped like the timing calibrator next door: same dialog, same
 * idle/running/done phases, same offer to try again. They answer the same kind
 * of question — is this number about me or about my equipment — and there is no
 * reason for them to feel like different features.
 */
export default function TouchCalibrator({ current = IDENTITY_CURVE, onApply, onClose }) {
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [step, setStep] = useState(0);
  const [counts, setCounts] = useState([0, 0, 0]);
  const [result, setResult] = useState(null);

  /** Velocities per pass. A ref because notes arrive faster than React. */
  const takesRef = useRef([[], [], []]);
  const stepRef = useRef(0);
  const runningRef = useRef(false);

  const finish = useCallback(() => {
    runningRef.current = false;
    const [soft, normal, hard] = takesRef.current;
    setResult(fitCurve(soft, normal, hard));
    setPhase('done');
  }, []);

  // Listening for the whole time the dialog is open, but only recording while a
  // pass is actually running — a note played while reading the instructions is
  // not part of any measurement.
  useEffect(
    () =>
      midiInput.onMessage((msg) => {
        if (msg.type !== 'noteon' || msg.source === 'mic' || !runningRef.current) return;
        const i = stepRef.current;
        const take = takesRef.current[i];
        if (take.length >= NOTES_PER_PASS) return;
        take.push(msg.velocity ?? 0.75);
        setCounts(takesRef.current.map((t) => t.length));

        if (take.length < NOTES_PER_PASS) return;
        if (i < PASSES.length - 1) {
          stepRef.current = i + 1;
          setStep(i + 1);
        } else {
          finish();
        }
      }),
    [finish],
  );

  const start = useCallback(async () => {
    // The notes have to be audible or you cannot tell how hard you are playing,
    // which is the entire thing being measured.
    await audio.start();
    takesRef.current = [[], [], []];
    stepRef.current = 0;
    runningRef.current = true;
    setCounts([0, 0, 0]);
    setStep(0);
    setResult(null);
    setPhase('running');
  }, []);

  const cancel = useCallback(() => {
    runningRef.current = false;
    onClose();
  }, [onClose]);

  const dialogRef = useDialog({ onClose: cancel });
  const pass = PASSES[step];

  return (
    <div className="modal-scrim" onClick={cancel}>
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="touch-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="touch-title">Calibrate touch</h3>

        {phase === 'idle' && (
          <>
            <p>
              Your controller decides how hard it thinks you played, and every controller decides differently. Small
              keyboards especially cannot report a really quiet note at all — which the app currently reads as a
              player who hits everything at the same weight.
            </p>
            <p className="hint">
              Three short passes: {NOTES_PER_PASS} notes as softly as you can, {NOTES_PER_PASS} at a comfortable
              level, {NOTES_PER_PASS} firm. Any notes will do.
            </p>
          </>
        )}

        {phase === 'running' && (
          <>
            <div className="calib-pass">
              <span className="calib-step">
                {step + 1} of {PASSES.length}
              </span>
              <strong>{pass.title}</strong>
            </div>
            <p className="hint">{pass.hint}</p>
            <div className="calib-dots" aria-hidden="true">
              {Array.from({ length: NOTES_PER_PASS }, (_, i) => (
                <i key={i} className={i < counts[step] ? 'on' : ''} />
              ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {pass.title}. {counts[step]} of {NOTES_PER_PASS} notes played.
            </p>
          </>
        )}

        {phase === 'done' && result && (
          <>
            {result.usable ? (
              <>
                <p>
                  Your keyboard gave back <strong>{Math.round(result.points.soft * 127)}</strong> to{' '}
                  <strong>{Math.round(result.points.hard * 127)}</strong> of a possible 127. Applying this maps that
                  onto the full range the music is written in, so a quiet phrase reads as quiet.
                </p>
                <VelocityCurve curve={result.curve} points={result.points} />
              </>
            ) : (
              /* A refused calibration says which pass went wrong and changes
                 nothing. Storing a guess here would make the dynamics score
                 worse than leaving it uncalibrated, which is the one outcome
                 this whole feature has to avoid. */
              <p>
                That didn&apos;t give a usable range — {result.reason}. Nothing has changed; try again when you
                are ready.
              </p>
            )}
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
              {result?.usable && (
                <button className="primary" onClick={() => onApply(result.curve)}>
                  Use this
                </button>
              )}
            </>
          )}
          {phase !== 'idle' && current && (
            <button onClick={() => onApply(IDENTITY_CURVE)} title="Go back to judging the raw velocity">
              Reset
            </button>
          )}
          <button onClick={cancel}>{phase === 'done' ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}

export { NOTES_PER_PASS, MIN_NOTES_PER_PASS };
