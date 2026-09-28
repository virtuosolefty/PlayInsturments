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

function Stars({ count }) {
  if (!count) return null;
  return (
    <span className="path-stars" title={`Best: ${count} of 5 stars`}>
      {'★'.repeat(count)}
    </span>
  );
}

function ExerciseRow({ entry, title, isCurrent, onPick }) {
  const mark = entry.mastered ? '✓' : entry.passed ? '✓' : entry.unlocked ? '▸' : '🔒';
  const state = entry.mastered ? 'mastered' : entry.passed ? 'passed' : entry.unlocked ? 'open' : 'locked';

  return (
    <button
      className={`path-row ${state} ${isCurrent ? 'current' : ''}`}
      onClick={() => entry.unlocked && onPick(entry.id)}
      disabled={!entry.unlocked}
      title={
        entry.unlocked
          ? `Best ${entry.bestStars} of 5 · ${entry.rungsCleared} of ${RUNGS.length} rungs`
          : 'Pass the exercise before this one to open it'
      }
    >
      <span className={`path-mark ${state}`}>{mark}</span>
      <span className="path-name">{title}</span>
      <Stars count={entry.bestStars} />
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
            {state.passedCount} / {state.total}
          </span>
        </h2>

        {state.stages.map((stage) => (
          <div key={stage.id} className={`path-stage ${stage.unlocked ? '' : 'locked'}`}>
            <h3 className="path-stage-head">
              <span>{stage.name}</span>
              {stage.cleared && <span className="path-cleared">cleared</span>}
            </h3>
            <p className="path-goal">{stage.goal}</p>

            {stage.entries.map((entry) => (
              /* The row says a padlock; this says what would open it. Not a
                 tooltip: somebody stuck on a gate is exactly the person who
                 will not find one, and until this existed the app's answer to
                 "why has nothing unlocked" was a star count of zero beside a
                 daily goal it had just called done. */
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
              className={`path-recital ${stage.cleared ? 'won' : ''}`}
              onClick={() => stage.cleared && pickById(stage.recital)}
              disabled={!stage.cleared}
              title={
                stage.cleared
                  ? 'Yours — go and play it'
                  : 'Master all three exercises in this stage to unlock'
              }
            >
              <span className="path-mark">{stage.cleared ? '♪' : '🔒'}</span>
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
