import { QUIET, hzToMidi } from './pitch.js';

/**
 * noteTracker.js — from a stream of "what pitch is sounding now" to notes that
 * begin and end.
 *
 * pitch.js answers one moment at a time, and a moment can be wrong: a pluck
 * starts with a click that has no pitch, a note can be misheard an octave out
 * for a frame, and a held note's loudness is never perfectly even. This turns
 * those answers into what a player did: a note begins once the same pitch has
 * been heard a couple of times running, ends after a few frames of quiet, and
 * begins again if it dies away and then comes back clearly louder (a string
 * plucked twice, a bow changing direction).
 *
 * It hears one note at a time. A chord has no single pitch, so it is heard as
 * nothing, or as whichever note is loudest.
 *
 * The figures below were set against tones made in code. They have not been
 * tried on a real instrument in a real room.
 */

const DEFAULTS = Object.freeze({
  /** Quieter than this is the room, not the instrument. */
  gate: QUIET,
  /** Less steady than this is not a note (pitch.js `clarity`). */
  clarity: 0.8,
  /** Frames a pitch must hold before it counts as a note. */
  settle: 2,
  /** Frames of quiet before a note is over. */
  release: 3,
  /** How many times louder than it had fallen to a held note must come back to count as played again. */
  retrigger: 1.6,
  /** Nobody repeats a note faster than this; a jump in loudness sooner is the note still speaking. */
  minGapMs: 90,
  /**
   * How far, in semitones, the pitch may stray from a held note and still be
   * that note. Past half way to the next: vibrato, or a string a little out
   * of tune, crosses that line without the player having changed note.
   */
  stick: 0.7,
});

/** Loudness in decibels below full scale that maps to the softest and the hardest touch. */
const SOFT_DB = -40, HARD_DB = -8;

/** A touch, 0.3 to 1, from how loud the note began: the range the matcher and the stage expect. */
export function velocityOf(rms) {
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  const share = Math.max(0, Math.min(1, (db - SOFT_DB) / (HARD_DB - SOFT_DB)));
  return 0.3 + 0.7 * share;
}

/**
 * @param {object} options
 * @param {(midi: number, velocity: number, at: number) => void} options.onNoteOn
 * @param {(midi: number, at: number) => void} options.onNoteOff
 * @param {number} [options.lowest] the lowest note the instrument has; anything below is ignored
 * @param {number} [options.highest]
 * @returns {{ push: (frame: { hz: number | null, clarity: number, rms: number }, at: number) => void, reset: (at?: number) => void, sounding: number | null }}
 *   `push` takes each answer from pitch.js with the time it was heard, in milliseconds
 */
export function createNoteTracker({ onNoteOn, onNoteOff, lowest = -Infinity, highest = Infinity, ...tuning }) {
  const { gate, clarity, settle, release, retrigger, minGapMs, stick } = { ...DEFAULTS, ...tuning };
  // `loudest` and `quietest` follow the held note: its peak so far, and how far it has fallen since that peak.
  let sounding = null, candidate = null, held = 0, silent = 0, loudest = 0, quietest = Infinity, began = -Infinity;

  const begin = (midi, rms, at) => {
    if (sounding !== null) onNoteOff(sounding, at);
    sounding = midi; candidate = null; held = 0; silent = 0; loudest = rms; quietest = rms; began = at;
    onNoteOn(midi, velocityOf(rms), at);
  };
  const end = at => {
    if (sounding === null) return;
    const midi = sounding;
    sounding = null; loudest = 0; quietest = Infinity;
    onNoteOff(midi, at);
  };
  const noteIn = frame => {
    if (frame.hz === null || frame.clarity < clarity || frame.rms < gate) return null;
    const exact = hzToMidi(frame.hz);
    const midi = sounding !== null && Math.abs(exact - sounding) <= stick ? sounding : Math.round(exact);
    return midi >= lowest && midi <= highest ? midi : null;
  };

  return {
    push(frame, at) {
      const midi = noteIn(frame);
      if (midi === null) {
        candidate = null; held = 0;
        if (sounding === null) return;
        quietest = Math.min(quietest, frame.rms);
        silent += 1;
        if (silent >= release) end(at);
        return;
      }
      silent = 0;
      if (midi === sounding) {
        candidate = null; held = 0;
        // Come back clearly louder than it had fallen to: the same note, played again.
        if (frame.rms >= quietest * retrigger && at - began >= minGapMs) begin(midi, frame.rms, at);
        // Still growing, as a bowed note does: nothing has died away yet, so there is nothing to come back from.
        else if (frame.rms > loudest) { loudest = frame.rms; quietest = frame.rms; }
        else quietest = Math.min(quietest, frame.rms);
        return;
      }
      if (midi === candidate) held += 1; else { candidate = midi; held = 1; }
      if (held >= settle) begin(midi, frame.rms, at);
    },
    reset(at = 0) { candidate = null; held = 0; silent = 0; end(at); },
    get sounding() { return sounding; },
  };
}
