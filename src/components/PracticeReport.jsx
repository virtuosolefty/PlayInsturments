import { useEffect, useMemo, useRef, useState } from 'react';
import { compareToBest } from '../lib/grading.js';
import { cancelSpeech, coachingScript, speak, speechAvailable } from '../lib/speech.js';
import { clipsDuration, comparisonClips, PerformancePlayback, toClips } from '../lib/playback.js';
import { audio } from '../lib/audio.js';
import { useDialog } from '../hooks/useDialog.js';

/**
 * Count a number up on arrival. A score that simply appears is a fact; one that
 * arrives is a result — and this is the emotional peak of a session, so it is
 * worth the eight lines.
 */
function useCountUp(target, ms = 750) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      // Ease out, so it decelerates into the final number rather than stopping.
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return value;
}

const BAND_LABELS = {
  notes: 'Notes',
  timing: 'Timing',
  dynamics: 'Dynamics',
};

const BAND_TONE = (v) => (v >= 85 ? 'var(--good)' : v >= 60 ? 'var(--warn)' : 'var(--bad)');

function Stars({ count }) {
  return (
    <div className="stars-row" role="img" aria-label={`${count} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= count ? 'on' : ''} style={{ animationDelay: `${n * 90}ms` }}>
          ★
        </span>
      ))}
    </div>
  );
}

/**
 * The end-of-run verdict: how it went, which skill let you down, the passages
 * that need work, and the single most useful thing to do next.
 */
export default function PracticeReport({
  result,
  previousSessions = [],
  step,
  onDrill,
  onRepeat,
  onApplyRate,
  onNextSong,
  onClose,
  spokenCoaching = false,
  onSpokenCoachingChange,
  scoreNotes = [],
  onHearPassage,
}) {
  const { grade, summary, passages, title } = result;
  const comparison = compareToBest(grade.overall, previousSessions);
  const shownScore = useCountUp(grade.overall);

  const script = useMemo(() => coachingScript({ grade, summary, step }), [grade, summary, step]);
  const canSpeak = speechAvailable();

  /**
   * Reading the verdict aloud, for the very common case of finishing a run
   * while still looking at your hands. Cleanup rather than a dismiss handler:
   * however the report goes away — closed, drilled, run again — the voice has
   * to stop with it, and only unmount catches all three.
   */
  useEffect(() => {
    if (!spokenCoaching) return undefined;
    speak(script);
    return cancelSpeech;
  }, [spokenCoaching, script]);

  /**
   * Hearing the run back.
   *
   * The thing a teacher does that no number on this screen can: play it to
   * you. A rushed bar and an uneven hand are both obvious in the ear and
   * nearly invisible in a percentage — and the person who has just played
   * something is the worst-placed one to say how it sounded, because they were
   * busy playing it.
   */
  const clips = useMemo(() => toClips(result.performance ?? []), [result.performance]);

  /**
   * The same run with the score underneath it.
   *
   * Solo playback answers "what did I do", which is the less useful half. It
   * cannot say what you should have done, and it degrades exactly where it is
   * needed most: a run you mostly missed plays back as a few disconnected
   * notes with nothing to judge them against. Against the score, a missed note
   * is a bar where only the reference sounds, a wrong one is a clash, and
   * dragging is you arriving behind something steady.
   */
  const together = useMemo(
    () => comparisonClips(result.performance ?? [], scoreNotes),
    [result.performance, scoreNotes],
  );

  /** null, 'you' or 'together' — one playback at a time, one button lit. */
  const [hearing, setHearing] = useState(null);
  const playerRef = useRef(null);
  if (!playerRef.current) playerRef.current = new PerformancePlayback(audio);

  // Whatever closes the report — Close, Run again, a drill — has to silence it.
  useEffect(() => () => playerRef.current?.stop(), []);

  const hear = (which, what) => {
    const player = playerRef.current;
    player.stop();
    if (hearing === which) {
      setHearing(null);
      return;
    }
    // A verdict being read aloud over the playback is two voices at once.
    cancelSpeech();
    setHearing(player.start(what, { onEnd: () => setHearing(null) }) ? which : null);
  };

  const runStep = () => {
    if (!step) return;
    if (step.passage) onDrill(step.passage, step.rate);
    else if (step.kind === 'next') onNextSong();
    else if (step.rate) onApplyRate(step.rate);
    else onRepeat();
  };

  const dialogRef = useDialog({ onClose });

  return (
    <div className="report-overlay">
      <div
        className="report"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Practice report — ${grade.headline}`}
        tabIndex={-1}
      >
        <header>
          <span className="eyebrow">{title}</span>
          {canSpeak && (
            <button
              className={`speak-toggle ${spokenCoaching ? 'on' : ''}`}
              onClick={() => onSpokenCoachingChange?.(!spokenCoaching)}
              aria-pressed={spokenCoaching}
              title={
                spokenCoaching
                  ? 'Stop reading results aloud'
                  : 'Read this and future results aloud'
              }
            >
              {spokenCoaching ? '🔊' : '🔈'} <span>Coach</span>
            </button>
          )}
          <h2>{grade.headline}</h2>
          {grade.complete ? (
            <Stars count={grade.stars} />
          ) : (
            <div className="incomplete-mark">
              {Math.round(grade.coverage * 100)}% played
            </div>
          )}
          <p className="blurb">{grade.blurb}</p>
          {/* Said here because here is where it is believed. The stars above
              this line are real, and they are also not worth what they look
              like: with the clock stopped there is no timing to measure, so
              timing's weight falls onto the notes and the same playing rates
              higher than it would in Practice. Leaving that unsaid let the app
              congratulate somebody fourteen times for work it was quietly
              throwing away. */}
          {result.mode === 'wait' && grade.complete && (
            <p className="report-note">
              <strong>Not counted towards the Path.</strong> Wait for me stops the clock at
              every chord, so this run was graded on notes and touch alone. Play it in
              Practice, at full speed, for it to unlock anything.
            </p>
          )}
        </header>

        {grade.complete && (
          <div className={`report-score ${comparison.isBest && comparison.previousBest !== null ? 'record' : ''}`}>
            <strong>{shownScore}</strong>
            <span>/ 100</span>
            {comparison.previousBest === null ? (
              <em className="best">first run</em>
            ) : comparison.isBest ? (
              <em className="best">new best · +{comparison.delta}</em>
            ) : (
              <em>{comparison.delta} vs your best of {comparison.previousBest}</em>
            )}
          </div>
        )}

        {step && (
          <div className="report-next">
            <div>
              <strong>{step.label}</strong>
              <span>{step.why}</span>
            </div>
            <button className="primary" onClick={runStep}>
              {step.passage ? `Practice ${step.passage.label.toLowerCase()}` : step.kind === 'next' ? 'Open next piece' : step.rate ? `Play at ${Math.round(step.rate * 100)}%` : 'Practise again'}
            </button>
          </div>
        )}

        <div className="report-bands">
          {Object.entries(grade.bands).map(([key, value], i) => (
            <div
              className={`band ${value === null ? 'unmeasured' : ''}`}
              key={key}
              // Filled in sequence rather than all at once, so the eye reads
              // them in order instead of taking three bars as one shape.
              style={{ '--band-delay': `${140 + i * 130}ms` }}
            >
              <div className="band-head">
                <span>{BAND_LABELS[key]}</span>
                <strong style={{ color: value === null ? 'var(--text-faint)' : BAND_TONE(value) }}>
                  {value === null ? '—' : value}
                </strong>
              </div>
              <div className="meter">
                <i style={{ width: `${value ?? 0}%`, background: BAND_TONE(value ?? 0) }} />
              </div>
              <span className="band-sub">
                {value === null ? unmeasured(key, result.mode) : bandSub(key, summary)}
              </span>
            </div>
          ))}
        </div>

        <div className="report-section">
          <h3>What to work on</h3>
          {passages.length === 0 ? (
            <p className="empty">Nothing recurring — that run was clean.</p>
          ) : (
            <div className="passage-list">
              {passages.map((p) => (
                /* Hear it before you drill it. These are by definition the bars
                   that did not go well, which makes them the ones most worth
                   knowing the sound of before another attempt. */
                <div className="passage-row" key={`${p.fromBar}-${p.toBar}`}>
                  <button className="passage" onClick={() => onDrill(p, null)} title="Loop this passage">
                    <span className="where">{p.label}</span>
                    <span className="what">{p.detail}</span>
                    <span className="go">drill →</span>
                  </button>
                  {onHearPassage && (
                    <button
                      className="hear-bit"
                      onClick={() => onHearPassage(p)}
                      title="Hear this passage played to you"
                      aria-label={`Hear ${p.label}`}
                    >
                      ♪
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>



        <p className="report-replay-hint">Listen back to hear where your timing and touch changed.</p>
        <div className="report-actions">
          {clips.length > 0 && (
            <button
              className={`hear-yourself ${hearing === 'you' ? 'on' : ''}`}
              onClick={() => hear('you', clips)}
              title={`Play back the ${clips.length} notes you played, at the volume you played them`}
            >
              {hearing === 'you' ? '■ Stop' : '▶ Hear yourself'}
              <span className="hear-len">{clipsDuration(clips).toFixed(0)}s</span>
            </button>
          )}

          {/* Offered even when you played nothing at all, and especially then:
              a run with no notes in it is the one where hearing how the piece
              actually goes is worth most. The label follows suit — with
              nothing of yours in the mix there is nothing to compare. */}
          {together.length > 0 && (
            <button
              className={`hear-yourself ${hearing === 'together' ? 'on' : ''}`}
              onClick={() => hear('together', together)}
              title={
                clips.length > 0
                  ? 'Play your run with the score underneath it — missed notes are where only the score sounds, and dragging is you arriving late behind it'
                  : 'Play the piece as written'
              }
            >
              {hearing === 'together' ? '■ Stop' : clips.length > 0 ? '▶ Against the score' : '▶ Hear the score'}
              <span className="hear-len">{clipsDuration(together).toFixed(0)}s</span>
            </button>
          )}
          <span className="report-actions-spacer" />
          <button onClick={onRepeat}>↻ Run again</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Why a band has no number.
 *
 * There are two reasons and they used to share one sentence, so a wait-mode run
 * blamed its blank timing on "too few notes played" after a full clean pass —
 * telling the player their playing was the problem when the mode was.
 */
function unmeasured(key, mode) {
  if (key === 'timing' && mode === 'wait') return 'Wait for me stops the clock — never measured';
  return 'too few notes played to measure';
}

function bandSub(key, summary) {
  if (key === 'notes') {
    return `${summary.hit} of ${summary.total} · ${summary.wrongNotes} extra`;
  }
  if (key === 'timing') {
    return `± ${summary.meanAbsDeviationMs} ms average`;
  }
  const spread = Math.round((summary.velocitySpread ?? 0) * 127);
  return `±${spread} spread · ${summary.tooLoud ?? 0} hard, ${summary.tooSoft ?? 0} soft`;
}
