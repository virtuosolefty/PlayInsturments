import { describeFit } from '../lib/arrange.js';
import { atTempo } from '../lib/path.js';
import { noteName } from '../lib/theory.js';
import { loopLabel } from '../lib/loopSelection.js';

const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;

export default function PiecePanel({ score, history, assessment, bestStars = 0, bestStarsRate = 1, mode, rate = 1, loop, onHear, onWait }) {
  if (!score) return <div className="section"><p className="empty">Choose a piece from the library to get started.</p></div>;
  const sessions = history?.sessions ?? [];
  const last = sessions.at(-1);
  const waiting = mode === 'wait', listening = mode === 'listen';
  const objective = listening ? 'Hear the phrase first.' : waiting ? 'Find every note, at your pace.' : loop ? 'Make this passage feel easy.' : 'A steady phrase, one note at a time.';
  const guidance = listening ? 'Follow the notes and listen to their rhythm. This mode plays the reference without scoring.' : waiting ? 'The music waits for the correct notes. Focus on where your fingers go; timing is not graded.' : score.description || 'Aim for accurate notes and an even pulse. Lower the tempo whenever you need more time.';
  return <div className="section piece-panel">
    <h2 className="practice-objective">{objective}</h2>
    <p className="objective-copy">{guidance}</p>
    <div className="session-goal"><span>{loop ? loopLabel(loop, score) : 'Whole piece'}</span><strong>{Math.round((score.bpm ?? 80) * rate)} bpm</strong></div>
    <p className="hint piece-hint">Press Play or Space when you’re ready.</p>
    <div className="coach-actions"><button onClick={onHear}>{listening ? 'Try it yourself' : loop ? 'Hear this passage' : 'Hear the phrase'}</button>{!waiting && <button onClick={onWait}>Use Wait for me</button>}</div>
    <div className="piece-best">{sessions.length ? <><strong>{bestStars > 0 ? `${bestStars}/5 stars` : 'Keep building'}{bestStars > 0 && !atTempo(bestStarsRate) ? ` at ${Math.round(bestStarsRate * 100)}% tempo` : ''}</strong><span>{sessions.length} saved run{sessions.length === 1 ? '' : 's'}</span></> : <span>Your first run will give you a starting point.</span>}</div>
    {last && <p className="hint">Last run: {pct(last.noteAccuracy)} notes · {pct(last.timingAccuracy)} on time.</p>}
    <details className="piece-details"><summary>Piece details</summary><h3 className="piece-title">{score.drillOf ? 'Your trouble spots' : score.title}</h3>{score.composer && <p className="piece-composer">{score.composer}</p>}<dl className="piece-facts">
      <div><dt>Key</dt><dd>{score.key?.name}</dd></div><div><dt>Written tempo</dt><dd>{Math.round(score.bpm)} bpm · {score.timeSignature?.join('/') ?? '4/4'}</dd></div>
      <div><dt>Length</dt><dd>{Math.floor(score.duration / 60)}:{String(Math.floor(score.duration % 60)).padStart(2, '0')}</dd></div>
      <div><dt>Range</dt><dd>{noteName(score.range[0])}–{noteName(score.range[1])}</dd></div>
      {assessment && <div><dt>Your keys</dt><dd>{describeFit(assessment)}</dd></div>}
    </dl></details>
  </div>;
}
