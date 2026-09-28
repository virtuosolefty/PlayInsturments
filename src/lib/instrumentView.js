import { KEYBOARD_MAP } from './midiInput.js';
import { noteName } from './theory.js';

export function pianoLabel(midi, mode = 'octaves', octave = 0) {
  if (mode === 'off') return '';
  if (mode === 'octaves' && midi % 12 !== 0) return '';
  if (mode === 'keys') return Object.entries(KEYBOARD_MAP).find(([, n]) => n + octave * 12 === midi)?.[0]?.toUpperCase() ?? '';
  return noteName(midi);
}
export function pianoViewRange(score, mode, octave = 0, fitted = null) {
  if (mode === 'full') return [21, 108];
  if (mode === 'two') return [Math.max(21, 48 + octave * 12), Math.min(108, 72 + octave * 12)];
  return fitted;
}
export function guitarFeedback({ midi, string, fret }, active, positions, expected, selected, hovered) {
  const exact = positions.get(string)?.fret === fret;
  const supplied = active.has(midi);
  const knownPitch = [...positions.values()].some(p => p.midi === midi);
  if (exact && supplied) return 'held';
  if (supplied && !knownPitch) return 'possible';
  if (hovered) return 'hover';
  if (expected) return 'target';
  if (selected) return 'chord';
  return 'idle';
}
