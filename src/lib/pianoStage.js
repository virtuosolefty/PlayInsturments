import { identifyChord } from './theory.js';
import { groupIntoChords } from './score.js';
import { COLORS } from './rollPaint.js';

// The performance surface stays dark in either chrome theme, like a lit instrument.
export const PIANO_COLORS = Object.freeze({
  ...COLORS,
  bg: '#080710', laneWhite: '#0c0a16', laneBlack: '#0a0913',
  gridBar: 'rgba(225,215,248,0.13)', gridBeat: 'rgba(225,215,248,0.035)',
  gridSub: 'rgba(225,215,248,0.012)', octave: 'rgba(225,215,248,0.09)',
  left: '#ffb84d', right: '#a591ff', hitLine: '#f8efff',
  label: '#9992aa', noteInk: '#fff8ff', shelf: '#14101e',
  keyTarget: '#a591ff', keyLabel: '#777380', ghost: 'rgba(255,255,255,0.45)',
});
export const PIANO_HEIGHT = 104;
export const handColor = note => note.hand === 'left' ? PIANO_COLORS.left : PIANO_COLORS.right;
export const handEdge = note => note.hand === 'left' ? '#ffe4a0' : '#f4b8ff';
export function noteColor(note) {
  return note.status === 'hit' ? PIANO_COLORS.hit : note.status === 'missed' ? PIANO_COLORS.missed : handColor(note);
}

// A held note is consumed at the strike line. Its tail never crosses the keys.
export function stageNoteBounds(note, key, now, pps, hitLine) {
  const end = note.time + note.duration;
  if (!key || end <= now) return null;
  const top = Math.max(0, hitLine - (end - now) * pps);
  const bottom = Math.min(hitLine, hitLine - (note.time - now) * pps);
  if (bottom <= top) return null;
  const pad = Math.min(3, Math.max(1, key.w * 0.09));
  return { x: key.x + pad, w: Math.max(1, key.w - 2 * pad), top, bottom, h: bottom - top };
}

export function soundingNotes(score, now) {
  const notes = new Map();
  for (const note of score?.notes ?? []) {
    if (note.time > now) break;
    if (note.time + note.duration > now) notes.set(note.midi, note);
  }
  return notes;
}

export function keyLight(midi, activeInput, sounding, playback = false) {
  const press = activeInput?.get(midi), target = sounding?.get(midi);
  if (press?.type === 'wrong') return PIANO_COLORS.missed;
  if (press?.type === 'timing') return PIANO_COLORS.late;
  if (press) return target ? handColor(target) : midi < 60 ? PIANO_COLORS.left : PIANO_COLORS.right;
  return playback && target ? handColor(target) : null;
}

// Annotate only complete, identifiable chords. A scale or ambiguous dyad gets no invented label.
export function stageChords(score) {
  return groupIntoChords(score?.notes ?? []).flatMap(group => {
    const pitches = [...new Set(group.notes.map(n => n.midi % 12))];
    if (pitches.length < 3) return [];
    const chord = identifyChord(group.notes.map(n => n.midi));
    if (!chord || pitches.length !== chord.pitchClasses.length || !pitches.every(p => chord.pitchClasses.includes(p))) return [];
    return [{ time: group.time, symbol: chord.symbol, midi: Math.min(...group.notes.map(n => n.midi)) }];
  });
}
