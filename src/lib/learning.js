import { atTempo, PASS_STARS, MASTER_STARS } from './path.js';
import { bowedStringName } from './bowed.js';

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

/** Recommends an accessible exercise, including a stage needing 4-star mastery
 * after its exercises have passed. Never points the learner at a locked row. */
export function recommendedLesson(state) {
  const entries = state.stages.flatMap(s => s.entries);
  return entries.find(e => e.unlocked && !e.passed)?.id
    ?? entries.find(e => e.unlocked && !e.mastered)?.id
    ?? entries.find(e => e.unlocked)?.id ?? null;
}

export function lessonOutcome(result) {
  if (!result?.grade?.complete) return { kind: 'incomplete', title: 'A little more of the phrase', message: 'Finish the phrase to get useful feedback. Your partial attempt is saved when notes were played.' };
  if (result.mode === 'wait') return { kind: 'guided', title: 'Guided practice completed', message: 'You found your way through the phrase. This learning activity is saved; timing was not assessed.' };
  if (!atTempo(result.rate)) return { kind: 'practice', title: 'Practice saved', message: `You completed the phrase at ${Math.round(result.rate * 100)}% speed. Build up gradually before checking at 100%.` };
  if (result.grade.stars >= MASTER_STARS) return { kind: 'mastered', title: 'Lesson mastered', message: 'Four or more stars at the written tempo. This counts toward opening the next stage.' };
  if (result.grade.stars >= PASS_STARS) return { kind: 'passed', title: 'Mastery check passed', message: 'Three stars at the written tempo. Within this stage, the next exercise is now available. Four stars on each exercise opens the next stage.' };
  return { kind: 'retry', title: 'Keep building your rhythm', message: 'This attempt is saved. Try the phrase more slowly, then return for a check at 100% speed.' };
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
  if (id === 'guitar') return `${note.name} · string ${6 - note.string} · ${note.fret === 0 ? 'open (no finger)' : `fret ${note.fret} · finger ${note.finger}`}`;
  if (id === 'violin' || id === 'cello') {
    const string = bowedStringName(id, note.string).note;
    return `${note.name} · ${string} string · ${note.fret === 0 ? 'open (no finger)' : `finger ${note.finger}`}`;
  }
  return `${note.name}${note.finger ? ` · finger ${note.finger}` : ''}`;
}
