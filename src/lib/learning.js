import { atTempo, PASS_STARS, MASTER_STARS } from './path.js';
import { drumInstruction } from './drums.js';
import { stringKit } from './instruments.js';

export const LESSON_STEPS = [
  { id: 'sound', label: 'Sound' }, { id: 'note', label: 'First note' },
  { id: 'listen', label: 'Listen' }, { id: 'follow', label: 'Follow along' },
  { id: 'practice', label: 'Practice' }, { id: 'check', label: 'Check progress' },
];

export function learningRecord(saved = {}) {
  const step = LESSON_STEPS.some(s => s.id === saved?.step) ? saved.step : 'sound';
  return { ...saved, step, rate: Math.max(.4, Math.min(1, Number(saved?.rate) || .65)),
    completed: saved?.completed && typeof saved.completed === 'object' ? saved.completed : {},
  };
}

export function lessonSettings(step, rate = .65) {
  return { mode: step === 'listen' ? 'listen' : ['sound', 'note', 'follow'].includes(step) ? 'wait' : 'practice',
    rate: ['listen', 'check'].includes(step) ? 1 : rate,
    loop: null, transpose: 0, hands: 'both', referenceAudio: false,
  };
}

export const comfortableRate = rate => Math.min(1, Math.round((rate + .1) * 100) / 100);

/** Recommends the next lesson to play through; once every open one is finished,
 * the first whose check is not passed, and after that the first not mastered.
 * Never points the learner at a locked row. */
export function recommendedLesson(state) {
  const entries = state.stages.flatMap(s => s.entries);
  return entries.find(e => e.unlocked && !e.finished)?.id
    ?? entries.find(e => e.unlocked && !e.passed)?.id
    ?? entries.find(e => e.unlocked && !e.mastered)?.id
    ?? entries.find(e => e.unlocked)?.id ?? null;
}

export function lessonOutcome(result) {
  if (!result?.grade?.complete) return { kind: 'incomplete', title: 'A little more of the phrase', message: 'Finish the phrase to get useful feedback. Your partial attempt is saved when notes were played.' };
  if (result.mode === 'wait') return { kind: 'guided', title: 'Guided practice completed', message: 'You found your way through the phrase, and the next lesson is open. Timing was not assessed, so this run carries no stars.' };
  if (!atTempo(result.rate)) return { kind: 'practice', title: 'Practice saved', message: `You completed the phrase at ${Math.round(result.rate * 100)}% speed, and the next lesson is open. Build up gradually before checking at 100%.` };
  if (result.grade.stars >= MASTER_STARS) return { kind: 'mastered', title: 'Lesson mastered', message: 'Four or more stars at the written tempo. That is as well as this lesson asks to be known.' };
  if (result.grade.stars >= PASS_STARS) return { kind: 'passed', title: 'Mastery check passed', message: 'Three stars at the written tempo passes the check. Four masters the lesson.' };
  return { kind: 'retry', title: 'Keep building your rhythm', message: 'This attempt is saved, and the next lesson is open. For the stars, try the phrase more slowly, then return for a check at 100% speed.' };
}

export function lessonCanVisit(step, record) {
  if (step === 'sound') return true;
  if (step === 'note') return !!record.soundConfirmed || !!record.quick;
  if (step === 'listen') return !!record.firstNoteDone;
  if (step === 'follow') return !!record.listened || !!(record.quick && record.firstNoteDone);
  if (step === 'practice') return !!record.followed;
  return !!record.practised;
}

/**
 * Whether a lesson's own score is loaded and showing, so its steps can be
 * played. Nothing is ready before the lesson itself is known: the piano
 * library loads after the page does, and a missing lesson and a missing score
 * must not count as a match.
 */
export function lessonReady({ active, lesson, loading, error, score }) {
  return !!(active && lesson && !loading && !error && score?.id === lesson.id);
}

/** @param instrument an instrument id; `true` still means guitar for older callers */
export function noteInstruction(note, instrument) {
  if (!note) return 'Preparing your first note…';
  const id = instrument === true ? 'guitar' : instrument;
  if (id === 'drums') return drumInstruction(note);
  const kit = stringKit(id);
  // A plucked string is found by its tablature number and fret; a bowed one by its name and finger.
  if (kit?.fretted) return `${note.name} · string ${kit.stringName(note.string).number} · ${note.fret === 0 ? 'open (no finger)' : `fret ${note.fret} · finger ${note.finger}`}`;
  if (kit?.bowed) return `${note.name} · ${kit.stringName(note.string).note} string · ${note.fret === 0 ? 'open (no finger)' : `finger ${note.finger}`}`;
  return `${note.name}${note.finger ? ` · finger ${note.finger}` : ''}`;
}

const NOTE_WORDS = Object.freeze({
  different: name => `You played a different note. Look for ${name}. Take your time.`,
  follow: Object.freeze(['Find the notes. Take your time.', 'Press Play this step. The music waits until you play the next note or chord. Timing is not assessed here.']),
  below: 'Or play this note on the instrument below.',
  find: 'Now find the notes →',
});
const DRUM_WORDS = Object.freeze({
  different: name => `That was a different drum. Look for ${name}. Take your time.`,
  follow: Object.freeze(['Find each drum. Take your time.', 'Press Play this step. The music waits until you hit the next drum. Timing is not assessed here.']),
  below: 'Or hit this drum on the kit below.',
  find: 'Now find the drums →',
  glossary: 'The kick is played with your foot and everything else with your hands. Each drum is the letter it starts with; H is the closed hi-hat and O the open one. A beat is the steady count, and tempo is how fast it moves. Use the on-screen kit, your computer keys or MIDI input; the microphone cannot tell one drum from another, so it is not used for the kit.',
});

/** The words a lesson uses for what is played: a note on most instruments, a drum on the kit. */
export const lessonWords = instrument => (instrument === 'drums' ? DRUM_WORDS : NOTE_WORDS);
