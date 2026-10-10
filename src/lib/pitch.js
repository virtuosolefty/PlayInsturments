import { noteName } from './theory.js';

/**
 * pitch.js — what note a sound is.
 *
 * The tuner and the microphone input both come down to one question asked
 * thirty times a second: given a few hundredths of a second of sound, is there
 * a note in it, and which? This answers it with the YIN method (de Cheveigné
 * and Kawahara, 2002): slide the sound against itself and find the shortest
 * shift at which it lines up again. That shift is one cycle of the note.
 *
 * Looking for the shortest shift that fits, rather than the strongest peak in
 * a spectrum, is what lets it hear a low guitar string as the note it is: the
 * string's overtones are often louder than its fundamental, and each of them
 * also repeats at the fundamental's period.
 *
 * Nothing here touches the microphone or the page; it works on plain arrays,
 * so it is tested with tones made in code.
 */

const A4 = { midi: 69, hz: 440 };

/** The lowest and highest notes listened for: below a bass guitar's low E, above a violin's first position. */
const RANGE = Object.freeze({ minHz: 27, maxHz: 2000 });
/**
 * How well the sound has to line up with itself, shifted by one cycle, to be
 * called a note: the difference left over, as a share of the average. Lower
 * is stricter. The YIN paper's own figure is 0.1 to 0.15.
 */
const THRESHOLD = 0.15;
/**
 * Quieter than this there is nothing to measure. Most of the time a microphone
 * hears a quiet room, and the search below is the costly part, so it is skipped.
 */
const SILENCE = 0.001;
/**
 * Quieter than this is the room, not an instrument. The microphone, the note
 * tracker and the tuner all go by it, so none of them works on sound another
 * would throw away.
 */
export const QUIET = 0.01;

export const hzToMidi = hz => A4.midi + 12 * Math.log2(hz / A4.hz);
export const midiToHz = midi => A4.hz * 2 ** ((midi - A4.midi) / 12);

/** How loud a stretch of sound is: the root of the mean of its squares. */
export function rmsOf(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * The nearest note to a frequency, and how far the frequency is from it.
 *
 * @returns {{ midi: number, name: string, cents: number, exact: number } | null}
 *   `cents` is hundredths of a semitone, sharp positive; `exact` is the pitch as a fractional note number
 */
export function noteOf(hz) {
  if (!(hz > 0) || !Number.isFinite(hz)) return null;
  const exact = hzToMidi(hz), midi = Math.round(exact);
  return { midi, name: noteName(midi), cents: (exact - midi) * 100, exact };
}

/**
 * The pitch of a stretch of sound.
 *
 * @param {Float32Array} samples about a tenth of a second; it must hold at least two cycles of the lowest note wanted
 * @param {number} sampleRate
 * @param {{ minHz?: number, maxHz?: number, threshold?: number, silence?: number }} [options]
 * @returns {{ hz: number | null, clarity: number, rms: number }} `hz` is null when there is no note to hear;
 *   `clarity` runs from 0 (noise) to 1 (a perfectly steady tone); `rms` is the loudness either way
 */
export function detectPitch(samples, sampleRate, { minHz = RANGE.minHz, maxHz = RANGE.maxHz, threshold = THRESHOLD, silence = SILENCE } = {}) {
  const rms = rmsOf(samples);
  const none = { hz: null, clarity: 0, rms };
  const longest = Math.min((samples.length >> 1) - 1, Math.floor(sampleRate / minHz));
  const shortest = Math.max(2, Math.floor(sampleRate / maxHz));
  if (!(rms >= silence) || longest <= shortest) return none;

  // How different the sound is from itself shifted by each lag, over a window every lag can be measured in.
  const window = samples.length - longest;
  const difference = new Float32Array(longest + 1);
  for (let lag = 1; lag <= longest; lag++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const delta = samples[i] - samples[i + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }
  // Each difference as a share of the average so far: near 0 where the sound repeats, about 1 where it does not.
  const share = new Float32Array(longest + 1);
  share[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= longest; lag++) {
    running += difference[lag];
    share[lag] = running > 0 ? (difference[lag] * lag) / running : 1;
  }

  // The first lag that fits well enough, followed down to the bottom of its dip.
  let lag = shortest;
  while (lag <= longest && share[lag] >= threshold) lag++;
  if (lag > longest) return none;
  while (lag < longest && share[lag + 1] < share[lag]) lag++;

  // The true bottom lies between samples: fit a parabola through the dip and its neighbours.
  const before = share[lag - 1], at = share[lag], after = lag < longest ? share[lag + 1] : at;
  const curve = before - 2 * at + after;
  const shift = curve > 0 ? (before - after) / (2 * curve) : 0;
  const period = lag + Math.max(-1, Math.min(1, shift));
  return { hz: sampleRate / period, clarity: Math.max(0, Math.min(1, 1 - at)), rms };
}

/**
 * The string someone is most likely tuning: the one whose open note is nearest.
 *
 * @param {number[]} tuning the open strings as note numbers, in any order
 * @param {number | null} exact the pitch heard, as a fractional note number (`noteOf(hz).exact`)
 * @returns {{ string: number, cents: number } | null} how far the pitch is from that string's note, sharp positive
 */
export function nearestString(tuning, exact) {
  if (!tuning.length || !Number.isFinite(exact)) return null;
  const string = tuning.reduce((best, open, index) => (Math.abs(exact - open) < Math.abs(exact - tuning[best]) ? index : best), 0);
  return { string, cents: Math.round((exact - tuning[string]) * 100) };
}
