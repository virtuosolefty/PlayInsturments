import DailySet from './DailySet.jsx';
import PathProgress from './PathProgress.jsx';
import StreakStrip from './StreakStrip.jsx';
import { blockerHelp, RUNGS } from '../lib/path.js';

/**
 * The Path: fifteen exercises, five stages, and the evidence that they worked.
 *
 * Locked rows are shown rather than hidden. Knowing what is coming is most of
 * why anyone finishes the thing in front of them, and a list that grows out of
 * nowhere gives you nothing to aim at.
 */

function Rungs({ cleared }) {
  return (
    <span className="rungs" title={`${cleared} of ${RUNGS.length} tempo rungs cleared`}>
      {RUNGS.map((rung, i) => (
        <i key={rung.label} className={i < cleared ? 'on' : ''} />
      ))}
    </span>
  );
}

/**
 * How well a lesson is known, apart from whether it is finished: a finished
 * lesson with no stars yet shows five empty ones, so the tick beside it is not
 * read as a rating.
 */
export function Stars({ count, shown = count > 0 }) {
  if (!shown) return null;
  return (
    <span className="path-stars" role="img" aria-label={`${count} of 5 stars`} title={`Best: ${count} of 5 stars`}>
      {'★'.repeat(count)}<i>{'★'.repeat(5 - count)}</i>
    </span>
  );
}

function ExerciseRow({ entry, title, isCurrent, onPick }) {
  // Finished is its own state: the next lesson is open, and the stars are still to be earned.
  const mark = entry.mastered || entry.passed || entry.finished ? '✓' : entry.unlocked ? '▸' : '🔒';
  const state = entry.mastered ? 'mastered' : entry.passed ? 'passed' : entry.finished ? 'finished' : entry.unlocked ? 'open' : 'locked';

  return (
    <button
      className={`path-row ${state} ${isCurrent ? 'current' : ''}`}
      onClick={() => entry.unlocked && onPick(entry.id)}
      disabled={!entry.unlocked}
      title={
        entry.unlocked
          ? `Best ${entry.bestStars} of 5 · ${entry.rungsCleared} of ${RUNGS.length} rungs`
          : 'Finish the lesson before this one to open it'
      }
    >
      <span className={`path-mark ${state}`}>{mark}</span>
      <span className="path-name">{title}</span>
      {isCurrent && <span className="path-next">Next</span>}
      <Stars count={entry.bestStars} shown={entry.finished} />
      <Rungs cleared={entry.rungsCleared} />
    </button>
  );
}

export default function PathTab({
  state,
  set,
  dailyProgress,
  library = [],
  days,
  goalMinutes,
  onGoalChange,
  onPick,
  benchmark,
  decay,
  badges,
  streak,
  guitar = false,
}) {
  const titleOf = (id) => library.find((s) => s.id === id)?.title ?? id;
  const pickById = (id) => {
    const entry = library.find((s) => s.id === id);
    if (entry) onPick(entry);
  };

  return (
    <>
      <DailySet items={set} progress={dailyProgress} onPick={onPick} library={library} />

      <StreakStrip days={days} goalMinutes={goalMinutes} onGoalChange={onGoalChange} />

      <div className="section">
        <h2 className="section-title">
          The Path
          <span className="tally">
            {state.finishedCount} / {state.total}
          </span>
        </h2>

        {state.stages.map((stage) => (
          <div key={stage.id} className={`path-stage ${stage.unlocked ? '' : 'locked'}`}>
            <h3 className="path-stage-head">
              <span>{stage.name}</span>
              {stage.finished && <span className="path-cleared">{stage.cleared ? 'mastered' : 'finished'}</span>}
            </h3>
            <p className="path-goal">{stage.goal}</p>

            {stage.entries.map((entry) => (
              /* The row shows the stars; this says why there are none yet. Not
                 a tooltip: somebody puzzled by a row of empty stars is exactly
                 the person who will not find one, and until this existed the
                 app's answer to fourteen guided runs was a star count of zero
                 beside a daily goal it had just called done. */
              <div key={entry.id}>
                <ExerciseRow
                  entry={entry}
                  title={titleOf(entry.id)}
                  isCurrent={state.currentId === entry.id}
                  onPick={pickById}
                />
                {state.currentId === entry.id && blockerHelp(entry) && (
                  <p className="path-blocked">{blockerHelp(entry)}</p>
                )}
              </div>
            ))}

            {/* The reward for a stage is music, not a trophy. */}
            {stage.recital && <button
              className={`path-recital ${stage.finished ? 'won' : ''}`}
              onClick={() => stage.finished && pickById(stage.recital)}
              disabled={!stage.finished}
              title={
                stage.finished
                  ? 'Yours — go and play it'
                  : 'Finish every lesson in this stage to open it'
              }
            >
              <span className="path-mark">{stage.finished ? '♪' : '🔒'}</span>
              <span className="path-name">{titleOf(stage.recital)}</span>
              <span className="path-recital-tag">recital</span>
            </button>}
          </div>
        ))}
      </div>

      {!guitar && <PathProgress benchmark={benchmark} decay={decay} badges={badges} streak={streak} />}
    </>
  );
}
