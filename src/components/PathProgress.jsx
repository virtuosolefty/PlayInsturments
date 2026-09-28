/**
 * The evidence that the playing itself is getting better — as opposed to the
 * evidence that there has been more of it, which a streak already covers and
 * which nobody should confuse with skill.
 *
 * Three of the four indicators live here. The fourth, the ghost of your best
 * run, is drawn on the piano roll where it belongs.
 */

export default function PathProgress({ benchmark, decay, badges = [], streak }) {
  return (
    <>
      <div className="section">
        <h2 className="section-title">Proof</h2>

        {benchmark ? (
          <div className="benchmark">
            {/* Milliseconds, because they are a physical quantity. A points
                score can be inflated by playing more; this cannot. */}
            <div className="benchmark-headline">
              <span className="then">±{Math.round(benchmark.first.meanAbsDeviationMs ?? 0)} ms</span>
              <span className="arrow">→</span>
              <span className={`now ${benchmark.driftDelta < 0 ? 'better' : ''}`}>
                ±{Math.round(benchmark.driftMs)} ms
              </span>
            </div>
            <p className="hint">
              How far off the beat you sat on the benchmark scale, first run against latest — same
              exercise, same tempo, so the two are genuinely comparable.{' '}
              {benchmark.overallDelta !== 0 && (
                <>
                  Your score moved {benchmark.overallDelta > 0 ? 'up' : 'down'}{' '}
                  {Math.abs(benchmark.overallDelta)} points across {benchmark.runs} runs.
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="hint">
            Run the benchmark scale twice, a week apart, and this fills in with the difference
            between them. One run proves nothing, so nothing is claimed from one.
          </p>
        )}

        {decay?.total > 0 && (
          <p className="decay">
            <strong>
              {decay.healed} of {decay.total}
            </strong>{' '}
            trouble spots have gone quiet — places you used to fumble and no longer do.
          </p>
        )}
      </div>

      <div className="section">
        <h2 className="section-title">
          Badges
          <span className="tally">
            {badges.filter((b) => b.earned).length} / {badges.length}
          </span>
        </h2>
        {/* The unearned ones are shown too. A badge you cannot see is not a
            goal, it is a surprise. */}
        <div className="badge-shelf">
          {badges.map((badge) => (
            <div key={badge.id} className={`badge ${badge.earned ? 'earned' : ''}`} title={badge.how}>
              <span className="badge-name">{badge.name}</span>
              <span className="badge-how">{badge.how}</span>
            </div>
          ))}
        </div>
        {streak?.freezes > 0 && (
          <p className="hint">
            {streak.freezes} rest day{streak.freezes === 1 ? '' : 's'} banked. Miss a day and one is
            spent automatically — a streak that dies on one missed Tuesday is one nobody restarts.
          </p>
        )}
      </div>
    </>
  );
}
