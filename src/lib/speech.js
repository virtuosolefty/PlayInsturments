/**
 * speech.js — saying the verdict out loud.
 *
 * The report already carries every word of this in writing. The reason to
 * speak it anyway is that a learner at a keyboard is looking at their hands,
 * not at a panel on the right of the screen — the written feedback is only
 * read by someone who has already stopped playing.
 *
 * Split in two on purpose: `coachingScript` decides *what* to say and is pure,
 * so the wording is unit tested; `speak` deals with the browser and is the
 * only part that touches an API.
 */

import { notPlayed } from './grading.js';

const SPOKEN_NUMBER = ['no', 'one', 'two', 'three', 'four', 'five'];

/** Digits read aloud badly in the middle of a sentence. Small ones become words. */
const spokenCount = (n) => SPOKEN_NUMBER[n] ?? String(n);

const plural = (n, word) => `${spokenCount(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * The one fact about the run worth hearing, chosen the same way the written
 * report chooses its advice: whichever band came off worst. Reading out all
 * three bands would take longer than the passage they describe.
 */
function verdictLine(grade, summary) {
  const missed = summary?.missed ?? 0;
  const wrong = summary?.wrongNotes ?? 0;
  const drift = summary?.meanSignedDeviationMs ?? 0;

  switch (grade.weakest) {
    case 'notes': {
      if (!missed && !wrong) return 'The pitches were right.';
      const parts = [];
      if (missed) parts.push(`${plural(missed, 'note')} missed`);
      if (wrong) parts.push(`${plural(wrong, 'extra note')}`);
      return `${parts.join(' and ')}. Slow it down until every pitch is right.`;
    }
    case 'timing':
      // Which side of the beat is the actionable half. "Your timing was 62%"
      // tells a learner nothing they can do differently with their hands.
      return Math.abs(drift) < 20
        ? 'The notes are there; the timing is just uneven. Try it against the metronome.'
        : `The notes are there, but you are ${drift < 0 ? 'rushing' : 'dragging'} by about ${Math.abs(Math.round(drift))} milliseconds. Try it against the metronome.`;
    case 'dynamics':
      return 'Notes and timing are solid. Evening out your touch is what is left.';
    default:
      return null;
  }
}

/**
 * What to say about a finished run.
 *
 * @param {object} args
 * @param {object} args.grade from gradeRun
 * @param {object} [args.summary] from PracticeSession.summary
 * @param {object} [args.step] from nextStep — the single recommendation
 * @returns {string[]} sentences, in order
 */
export function coachingScript({ grade, summary, step } = {}) {
  if (!grade) return [];

  if (!grade.complete) {
    // No rating was earned, so leading with a star count would be a lie by
    // omission. Say why there is no verdict, then what to do about it.
    return [
      notPlayed(summary)
        ? 'Nothing was played, so there is nothing to score yet.'
        : (summary?.hit ?? 0) === 0
          ? 'None of the notes you played were the written ones. Slow it right down and find the first few by ear.'
          : `You covered ${Math.round(grade.coverage * 100)} percent of the piece — not enough to rate.`,
      step?.label ? `${step.label}.` : null,
    ].filter(Boolean);
  }

  const lines = [
    `${grade.headline}. ${spokenCount(grade.stars)} star${grade.stars === 1 ? '' : 's'}, ${grade.overall} out of 100.`,
  ];

  // At five stars there is nothing to correct, and inventing a criticism to
  // fill the slot is how encouragement stops being believed.
  const verdict = grade.stars >= 5 ? null : verdictLine(grade, summary);
  if (verdict) lines.push(verdict);
  if (step?.label) lines.push(`${step.label}.`);
  return lines;
}

/* ------------------------------------------------------------- the browser */

export const speechAvailable = () =>
  typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

/**
 * Speak a script. Any utterance already in flight is dropped first — a report
 * dismissed mid-sentence should stop talking, and two verdicts overlapping is
 * worse than neither.
 *
 * @param {string[]|string} script
 * @param {object} [options] {rate, pitch}
 * @returns {boolean} whether anything was actually said
 */
export function speak(script, { rate = 1, pitch = 1 } = {}) {
  if (!speechAvailable()) return false;
  const text = (Array.isArray(script) ? script : [script]).filter(Boolean).join(' ');
  if (!text.trim()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    // Marginally slower than default: the default voice rate runs over the
    // numbers, which are the part worth hearing.
    utterance.rate = rate * 0.95;
    utterance.pitch = pitch;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('[speech] could not speak:', err.message);
    return false;
  }
}

/** Stop talking now — on dismissing a report, starting a run, or unmounting. */
export function cancelSpeech() {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing to stop */
  }
}
