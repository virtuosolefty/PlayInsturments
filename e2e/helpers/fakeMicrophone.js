import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A microphone for the browser tests: Chromium can be told to use a WAV file
 * as its microphone, so the tuner and the microphone input are tested on real
 * sound, through the real browser audio path, with no hardware.
 *
 * The sound is made here: plucked-string notes, each a handful of overtones
 * dying away, the overtones louder than the fundamental as a low string's are.
 */

const RATE = 48000;
const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);

/**
 * @param {{ midi: number, seconds: number, cents?: number, rest?: number }[]} notes each note, how long it rings,
 *   how far out of tune it is, and the silence after it
 * @param {{ leadIn?: number }} [options] silence before the first note, while the page gets ready
 * @returns {Int16Array} mono samples at 48 kHz
 */
export function pluckedNotes(notes, { leadIn = 1.5 } = {}) {
  const partials = [0.5, 1, 0.7, 0.4, 0.25];
  const total = partials.reduce((sum, each) => sum + each, 0);
  const length = Math.round(RATE * (leadIn + notes.reduce((sum, note) => sum + note.seconds + (note.rest ?? 0.12), 0) + 1));
  const samples = new Int16Array(length);
  let start = Math.round(RATE * leadIn);
  for (const { midi, seconds, cents = 0, rest = 0.12 } of notes) {
    const hz = midiToHz(midi + cents / 100), count = Math.round(RATE * seconds);
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const envelope = Math.min(1, t / 0.004) * Math.exp(-t / 0.6) * Math.min(1, (seconds - t) / 0.02);
      let value = 0;
      partials.forEach((strength, k) => { value += strength * Math.sin(2 * Math.PI * hz * (k + 1) * t); });
      samples[start + i] = Math.round(32767 * 0.5 * envelope * (value / total));
    }
    start += count + Math.round(RATE * rest);
  }
  return samples;
}

/** The samples as a WAV file's bytes: 16-bit mono PCM. */
export function wavBytes(samples, rate = RATE) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

/**
 * Writes the notes to a WAV file and returns the browser arguments that make
 * it the microphone, played once and with permission already given.
 *
 * @param {string} name a name for the file, unique to the test file using it
 */
export function fakeMicrophone(name, notes, options) {
  const dir = path.join(tmpdir(), 'practice-deck-e2e');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.wav`);
  writeFileSync(file, wavBytes(pluckedNotes(notes, options)));
  return ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}%noloop`];
}
