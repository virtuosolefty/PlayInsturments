import { secondsPerBar } from './passages.js';

export function loopLabel(loop, score) {
  if (!loop) return 'Whole piece';
  const bar = secondsPerBar(score);
  const from = Math.floor(loop[0] / bar) + 1;
  const to = Math.max(from, Math.ceil((loop[1] - 1e-6) / bar));
  return from === to ? `Loop: bar ${from}` : `Loop: bars ${from}–${to}`;
}

// Match the engine's bar duration; never collapse a loop, including partial bars.
export function moveLoopBoundary(loop, edge, time, score) {
  const duration = Math.max(0, score?.duration ?? 0);
  const bar = secondsPerBar(score);
  const snapped = time >= duration ? duration : Math.max(0, Math.min(duration, Math.round(time / bar) * bar));
  const current = [Math.max(0, Math.min(loop[0], duration)), Math.max(0, Math.min(loop[1], duration))];
  if (edge === 0) current[0] = Math.min(snapped, Math.max(0, Math.ceil(current[1] / bar) - 1) * bar);
  else current[1] = Math.max(snapped, Math.min(duration, (Math.floor(current[0] / bar) + 1) * bar));
  return current;
}
