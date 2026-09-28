/**
 * coaching.js — the one thing to do next.
 *
 * A results screen that offers six equally-weighted buttons makes the learner
 * do the deciding, which is the part they are least equipped for. This picks a
 * single recommendation and describes it in plain words; everything else on
 * the report is secondary.
 */

export const STEPS = {
  FINISH: 'finish',
  DRILL: 'drill',
  REPEAT: 'repeat',
  FASTER: 'faster',
  NEXT: 'next',
};

/** Speed to drop to when drilling a passage that is falling apart. */
export const DRILL_RATE = 0.7;

/**
 * @param {object} args
 * @param {object} args.grade from gradeRun
 * @param {Array} args.passages from groupProblems
 * @param {number} args.rate current playback rate
 * @param {object|null} args.nextSong the following library entry, if any
 * @returns {{kind: string, label: string, why: string, passage: object|null, rate: number|null}}
 */
export function nextStep({ grade, passages = [], rate = 1, nextSong = null }) {
  const worst = passages[0] ?? null;

  if (!grade.complete) {
    return {
      kind: STEPS.FINISH,
      label: 'Play it all the way through',
      why: 'A rating needs a full run — stopping early leaves most of the piece unmeasured.',
      passage: null,
      rate: null,
    };
  }

  if (grade.stars <= 2 && worst) {
    return {
      kind: STEPS.DRILL,
      label: `Drill ${worst.label.toLowerCase()} at ${Math.round(DRILL_RATE * 100)}%`,
      why: 'Looping the worst stretch slowly fixes more than another run at full tempo.',
      passage: worst,
      rate: DRILL_RATE,
    };
  }

  if (grade.stars <= 4) {
    return {
      kind: STEPS.REPEAT,
      label: 'Run it again',
      why: 'You are close. Another pass at this tempo should tidy up what is left.',
      passage: null,
      rate: null,
    };
  }

  if (rate < 0.99) {
    const nextRate = Math.min(1, Math.round((rate + .1) * 100) / 100);
    return {
      kind: STEPS.FASTER,
      label: `Try it at ${Math.round(nextRate * 100)}% speed`,
      why: `Clean at ${Math.round(rate * 100)}%. Take a small step toward the written tempo.`,
      passage: null,
      rate: nextRate,
    };
  }

  return {
    kind: STEPS.NEXT,
    label: nextSong ? `Next piece: ${nextSong.title}` : 'Pick something new',
    why: 'Mastered at full speed. Nothing more to squeeze out of this one.',
    passage: null,
    rate: null,
  };
}

/**
 * The piece to suggest next: the first one in the library you have not yet
 * three-starred, so the recommendation always points at unfinished work.
 */
export function suggestNext(library, starsBySong, currentId) {
  const unmastered = library.filter((song) => (starsBySong[song.id] ?? 0) < 3);
  return (
    unmastered.find((song) => song.id !== currentId) ??
    library.find((song) => song.id !== currentId) ??
    null
  );
}
