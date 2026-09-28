import { streakFrom, todayProgress } from '../lib/streaks.js';

const CIRC = 2 * Math.PI * 15;

/**
 * Daily practice at a glance: how many days running, and how far into today's
 * goal you are. Deliberately small — it is a nudge, not a scoreboard.
 */
export default function StreakStrip({ days, goalMinutes, onGoalChange }) {
  const streak = streakFrom(days);
  const today = todayProgress(days, goalMinutes);

  return (
    <div className="section streak-strip">
      <h2 className="section-title">Practice habit</h2>

      <div className="streak-body">
        <div className={`flame ${streak.practisedToday ? 'lit' : ''}`}>
          <span className="glyph" aria-hidden="true">
            {streak.current > 0 ? '🔥' : '·'}
          </span>
          <strong>{streak.current}</strong>
          <span className="unit">day{streak.current === 1 ? '' : 's'}</span>
        </div>

        <svg className="goal-ring" viewBox="0 0 34 34" role="img" aria-label={`${today.minutes} of ${today.goal} minutes today`}>
          <circle cx="17" cy="17" r="15" className="track" />
          <circle
            cx="17"
            cy="17"
            r="15"
            className={`fill ${today.met ? 'met' : ''}`}
            style={{ strokeDasharray: CIRC, strokeDashoffset: CIRC * (1 - today.fraction) }}
          />
          <text x="17" y="17" className="ring-label">
            {today.minutes}
          </text>
        </svg>
      </div>

      <p className="hint">
        {today.met ? (
          <>
            Today&apos;s {today.goal} minutes are done.{' '}
            {streak.current > 1 && <>That&apos;s {streak.current} days running.</>}
          </>
        ) : streak.practisedToday ? (
          <>{today.goal - today.minutes} more minutes to hit today&apos;s goal.</>
        ) : streak.current > 0 ? (
          <>Play today to keep a {streak.current}-day streak alive.</>
        ) : (
          <>A day counts once you finish a run, or play for three minutes.</>
        )}
        {streak.longest > streak.current && <> Best so far: {streak.longest} days.</>}
      </p>

      <label className="field goal-field" title="Minutes of playing that make a day complete">
        Daily goal
        <input
          type="range"
          min="5"
          max="60"
          step="5"
          value={goalMinutes}
          onChange={(e) => onGoalChange(Number(e.target.value))}
        />
        <span className="val">{goalMinutes}m</span>
      </label>
    </div>
  );
}
