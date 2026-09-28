/** Presentation metrics only. Completed-run grading and stored results stay unchanged. */
export function liveFeedback(summary = {}) {
  const hit = summary.hit ?? 0, missed = summary.missed ?? 0, wrong = summary.wrongNotes ?? 0;
  const judged = hit + missed + wrong, resolved = hit + missed;
  const timingMeasured = hit >= 4 && summary.timingAccuracy != null;
  const accuracy = judged ? hit / judged : null;
  const drift = summary.meanSignedDeviationMs ?? 0;
  const cue = !judged ? 'Take your time. Follow the next note.'
    : judged < 4 ? 'Keep going to build a useful picture.'
    : wrong > missed && wrong > hit * 0.2 ? 'Find the next note before you play. Try Wait for me.'
    : missed > hit * 0.2 ? 'Slow the tempo a little and keep the phrase flowing.'
    : timingMeasured && Math.abs(drift) > 25 ? `You tend to play ${drift < 0 ? 'early' : 'late'}. Listen for the beat.`
    : 'Keep this steady pace. Let the next note come to you.';
  return { accuracy, judged, resolved, completion: summary.total ? Math.min(1, resolved / summary.total) : 0, timingMeasured, cue };
}
