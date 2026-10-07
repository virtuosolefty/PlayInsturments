import { liveFeedback } from '../lib/liveFeedback.js';

export default function FeedbackPanel({ summary, events = [], listening = false, waitingMode = false, playing = false }) {
  const s = summary ?? {};
  const live = liveFeedback(s);
  if (listening) return <div className="section live-feedback"><h2>Hear the whole phrase.</h2><p className="hint">Follow the notes and listen for the rhythm. This preview is not scored.</p></div>;
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  return <>
    <div className="section live-feedback">
      <h2 className="section-title">This run <span className="live-badge">{playing ? 'LIVE' : 'PAUSED'}</span></h2>
      <div className="live-accuracy" data-measured={live.judged >= 4}>
        <span>Accuracy so far</span><strong>{pct(live.accuracy)}</strong>
        <p>{live.judged ? (s.hit ?? 0) + ' correct · ' + (s.missed ?? 0) + ' missed · ' + (s.wrongNotes ?? 0) + ' extra' : 'Waiting for your first note'}</p>
      </div>
      <div className="completion-label"><span>Piece completion</span><strong>{live.resolved} / {s.total ?? 0}</strong></div>
      <progress aria-label="Piece completion" value={live.completion} max="1" />
      <div className="live-timing"><span>Timing</span><strong>{live.timingMeasured ? Math.round(s.meanAbsDeviationMs ?? 0) + ' ms average' : waitingMode ? 'Not measured in Wait for me' : 'Listening for a few more notes'}</strong></div>
    </div>
    <div className="section coaching-cue"><span className="eyebrow">ONE THING TO FOCUS ON</span><p>{live.cue}</p></div>
    <div className="section"><h2 className="section-title">Recent notes</h2><p className="sr-only" role="status">{events[0]?.detail ?? ''}</p>
      {!events.length ? <p className="hint">Your last few notes will appear here.</p> : <div className="event-list">{events.slice(0, 4).map(e => <div className={'event ' + e.type} key={e.id}><span className="note">{e.name}</span><span className="msg"><strong>{e.type === 'hit' ? '✓ ' : '· '}{e.label}</strong></span></div>)}</div>}
    </div>
    <details className="section fold"><summary>Performance details</summary><p className="hint">Live accuracy includes judged notes and extra notes. Upcoming notes are not counted. Your final grade also accounts for how much of the piece you completed.</p>
      <div className="kv"><span>On time</span><span>{live.timingMeasured ? pct(s.timingAccuracy) : 'Not measured yet'}</span></div>
      <div className="kv"><span>Dynamics</span><span>{(s.hit ?? 0) >= 4 ? pct(s.dynamicsAccuracy) : 'Not measured yet'}</span></div>
      <div className="kv"><span>Velocity spread</span><span>{(s.hit ?? 0) >= 4 ? '±' + Math.round((s.velocitySpread ?? 0) * 127) : 'Not measured yet'}</span></div>
      {events.length > 0 && <div className="event-list detailed-events">{events.map(e => <div className={'event ' + e.type} key={e.id}><span className="note">{e.name}</span><span className="msg"><strong>{e.label}</strong>{e.detail && <span> — {e.detail}</span>}</span></div>)}</div>}
    </details>
  </>;
}

