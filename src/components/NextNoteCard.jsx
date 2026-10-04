import { pianoLabel } from '../lib/instrumentView.js';
import { noteInstruction } from '../lib/learning.js';

/**
 * The computer key that plays a piano note at the chosen keyboard octave
 * (midiInput.js `KEYBOARD_MAP`), or nothing where no key reaches the note or
 * the instrument is not the piano.
 *
 * @param {object} props
 * @param {number} [props.midi]
 * @param {string} props.instrument
 * @param {number} [props.typingOctave]
 */
export function ComputerKey({ midi, instrument, typingOctave = 0 }) {
  const key = instrument === 'piano' && Number.isFinite(midi) ? pianoLabel(midi, 'keys', typingOctave) : '';
  if (!key) return null;
  return <span className="lesson-key">Computer key <kbd>{key}</kbd></span>;
}

/**
 * The note to find next in a lesson's Find-the-notes step: what and where it
 * is, the computer key that plays it on the piano, and how much of the phrase
 * has been found. The bar only repeats the count under it, so assistive
 * technology is given the words alone.
 *
 * @param {object} props
 * @param {object} [props.note] the next note; undefined while the lesson is preparing
 * @param {string} props.instrument
 * @param {number} props.found notes found so far
 * @param {number} props.total notes in the phrase
 * @param {number} [props.typingOctave]
 */
export default function NextNoteCard({ note, instrument, found, total, typingOctave = 0 }) {
  const share = total > 0 ? Math.min(1, Math.max(0, found / total)) : 0;
  return <div className="lesson-target">
    <span>NEXT NOTE</span>
    <strong>{noteInstruction(note, instrument)}</strong>
    <ComputerKey midi={note?.midi} instrument={instrument} typingOctave={typingOctave} />
    <div className="lesson-progress" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></div>
    <p>{found} / {total} notes found</p>
  </div>;
}
