import { liveFeedback } from '../lib/liveFeedback.js';
import Icon from './Icon.jsx';

/**
 * A glanceable readout that floats over the stage while a run is going:
 * accuracy, current streak and completion. The full breakdown still lives in
 * the This run panel — this is the part you can read out of the corner of your
 * eye without looking away from the notes, and it is the only live feedback on
 * widths where that panel is folded away.
 */
export default function LiveHud({ summary, combo = 0, waitingMode = false }) {
  const s = summary ?? {};
  const live = liveFeedback(s);
  const acc = live.accuracy == null ? null : Math.round(live.accuracy * 100);
  const tone = acc == null ? '' : acc >= 90 ? 'good' : acc >= 70 ? 'ok' : 'low';
  return (
    <div className="live-hud" role="status" aria-live="off">
      <span className={`hud-stat hud-acc ${tone}`} title="Accuracy so far">
        <Icon name="target" size={14} />
        <b>{acc == null ? '—' : acc + '%'}</b>
      </span>
      {!waitingMode && (
        <span className={`hud-stat hud-streak ${combo >= 10 ? 'hot' : ''}`} title="Current streak of clean notes">
          <Icon name="flame" size={14} />
          <b key={combo} className="hud-pop">{combo}</b>
        </span>
      )}
      <span className="hud-progress" title="Piece completion" aria-label={`${Math.round(live.completion * 100)}% complete`}>
        <i style={{ transform: `scaleX(${live.completion})` }} />
      </span>
    </div>
  );
}
