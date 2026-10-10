import { QUIET, hzToMidi, midiToHz, nearestString, noteOf } from './pitch.js';

/**
 * tuner.js — what the tuner shows for what the microphone hears.
 *
 * Decided here, without the page: which reading to believe, what note it is,
 * whether that is in tune, and, on a string instrument, which string is being
 * tuned and which way its peg should turn. TunerDialog.jsx only draws it.
 */

/** Closer than this to the note, in cents, is in tune: about as near as a peg can be set by hand. */
export const IN_TUNE_CENTS = 5;
/** The needle's scale runs half a semitone either side of the note. */
const NEEDLE_CENTS = 50;

/** `fresh` is how old a reading may be, in milliseconds, and still say something about now. */
const LISTEN = Object.freeze({ gate: QUIET, clarity: 0.8, keep: 5, fresh: 400 });

/**
 * One steady pitch from the last few readings: their median, taken over the
 * ones that heard a note. A single reading an octave out, or a click as a
 * string is plucked, then leaves the needle where it was.
 *
 * @param {{ hz: number | null, clarity: number, rms: number, at?: number }[]} frames the readings so far, oldest first (micInput.js)
 * @param {{ now?: number }} [options] the time now, on the readings' own clock: given it, readings from before
 *   the sound stopped coming are left out, so a microphone that has gone quiet leaves nothing on show
 * @returns {number | null} hertz, or null when there is too little to go on
 */
export function steadyPitch(frames, { gate = LISTEN.gate, clarity = LISTEN.clarity, keep = LISTEN.keep, now = null, fresh = LISTEN.fresh } = {}) {
  const recent = now === null ? frames : frames.filter(frame => now - (frame.at ?? now) <= fresh);
  const heard = recent.slice(-keep).filter(frame => frame.hz !== null && frame.clarity >= clarity && frame.rms >= gate);
  if (heard.length < 2) return null;
  // The median as a note number: pitch is heard in ratios, so that is the scale to average on.
  const notes = heard.map(frame => hzToMidi(frame.hz)).sort((a, b) => a - b);
  const middle = notes.length >> 1;
  return midiToHz(notes.length % 2 ? notes[middle] : (notes[middle - 1] + notes[middle]) / 2);
}

/**
 * @param {number | null} hz from `steadyPitch`
 * @param {number[]} tuning the instrument's open strings as note numbers; empty for one with nothing to tune
 * @returns {null | { name: string, midi: number, cents: number, state: 'flat'|'in-tune'|'sharp', needle: number,
 *   string: { index: number, cents: number, advice: 'tune up'|'in tune'|'tune down' } | null }}
 *   `cents` is from the nearest note, rounded; `needle` is where it points, from −1 (flat) to 1 (sharp);
 *   `string` is the string whose own note is nearest, however far off it is
 */
export function tunerReading(hz, tuning) {
  const note = noteOf(hz);
  if (!note) return null;
  const cents = Math.round(note.cents);
  const state = Math.abs(cents) <= IN_TUNE_CENTS ? 'in-tune' : cents < 0 ? 'flat' : 'sharp';
  const nearest = nearestString(tuning, note.exact);
  const string = nearest && { index: nearest.string, cents: nearest.cents, advice: Math.abs(nearest.cents) <= IN_TUNE_CENTS ? 'in tune' : nearest.cents < 0 ? 'tune up' : 'tune down' };
  return { name: note.name, midi: note.midi, cents, state, needle: Math.max(-1, Math.min(1, note.cents / NEEDLE_CENTS)), string };
}
