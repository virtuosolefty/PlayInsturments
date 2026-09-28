/**
 * shortcuts.js — driving the deck without letting go of the piano.
 *
 * This app is used with both hands on a keyboard. Every action that needs a
 * mouse — looping four bars, dropping the tempo, hearing the passage again —
 * costs you the position your hands were in, which is most of what practising
 * a passage consists of. Until now only Space and Escape were bound.
 *
 * The constraint that shapes the whole scheme: the letter keys are already the
 * on-screen piano. `KEYBOARD_MAP` in midiInput.js claims a, w, s, e, d, f, t,
 * g, y, h, u, j, k, o, l, p, semicolon, apostrophe, z, x, c, v, b, n, m and
 * comma. Binding any of those would mean a key that plays a note sometimes and
 * changes the mode other times, which is worse than no shortcut at all.
 *
 * What is left is digits, arrows and brackets — and that turns out to be
 * exactly enough for the transport and the mode switch.
 *
 * Restart is deliberately absent. It throws away the run's score, and an
 * action you cannot undo should cost a deliberate click rather than a
 * mistyped character.
 *
 * The map is a pure module so the bindings can be tested without a browser,
 * and so there is one place to look when adding one.
 */

/** What a shortcut asks for. The caller decides how to carry it out. */
export const ACTIONS = {
  PLAY_PAUSE: 'playPause',
  STOP: 'stop',
  HEAR: 'hear',
  LOOP: 'loop',
  METRONOME: 'metronome',
  MODE_LISTEN: 'modeListen',
  MODE_PRACTICE: 'modePractice',
  MODE_WAIT: 'modeWait',
  SEEK_BACK: 'seekBack',
  SEEK_FORWARD: 'seekForward',
  FASTER: 'faster',
  SLOWER: 'slower',
  CLOSE: 'close',
};

/**
 * Key to action. Matched against KeyboardEvent.key, except for the space bar,
 * which is matched on `code` — `key` for it is a single space, and comparing
 * against ' ' is the sort of literal that gets tidied away by someone who
 * cannot tell it from an empty string.
 */
export const BINDINGS = {
  Escape: ACTIONS.CLOSE,
  '0': ACTIONS.STOP,
  '1': ACTIONS.MODE_LISTEN,
  '2': ACTIONS.MODE_PRACTICE,
  '3': ACTIONS.MODE_WAIT,
  '[': ACTIONS.LOOP,
  ']': ACTIONS.METRONOME,
  '\\': ACTIONS.HEAR,
  ArrowLeft: ACTIONS.SEEK_BACK,
  ArrowRight: ACTIONS.SEEK_FORWARD,
  ArrowUp: ACTIONS.FASTER,
  ArrowDown: ACTIONS.SLOWER,
};

/**
 * What to print on the control, so the binding is discoverable from the deck
 * rather than only by hovering something you were already about to click.
 * Kept beside the bindings on purpose: a legend that drifts out of step with
 * the key it names is worse than no legend.
 */
export const LEGENDS = {
  [ACTIONS.PLAY_PAUSE]: '␣',
  [ACTIONS.STOP]: '0',
  [ACTIONS.HEAR]: '\\',
  [ACTIONS.LOOP]: '[',
  [ACTIONS.METRONOME]: ']',
  [ACTIONS.MODE_LISTEN]: '1',
  [ACTIONS.MODE_PRACTICE]: '2',
  [ACTIONS.MODE_WAIT]: '3',
};

/** Steps the speed slider moves in, matching its own `step` attribute. */
export const RATE_STEP = 0.05;
export const RATE_MIN = 0.4;
export const RATE_MAX = 1.5;

/**
 * Which action a key event asks for, or null.
 *
 * Returns null rather than throwing on anything unrecognised, because most key
 * presses in this app are notes and this runs on every one of them.
 *
 * @param {KeyboardEvent} event
 * @param {object} [context]
 * @param {boolean} [context.dialogOpen] a modal is up — only Escape gets
 *   through, so that typing behind a report cannot change the mode underneath
 *   it. The handler lives on `window`, so nothing else stops this.
 * @param {boolean} [context.typing] focus is in a text field or a select
 */
export function shortcutFor(event, { dialogOpen = false, typing = false } = {}) {
  if (!event) return null;
  // A shortcut sharing a chord with a browser or OS command is not a shortcut,
  // it is a way to lose a tab.
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (typing) return null;

  const action = event.code === 'Space' ? ACTIONS.PLAY_PAUSE : (BINDINGS[event.key] ?? null);
  if (!action) return null;
  if (dialogOpen && action !== ACTIONS.CLOSE) return null;
  return action;
}

/** Clamp a speed change to the range the slider offers. */
export const nextRate = (rate, direction) =>
  Math.round(
    Math.max(RATE_MIN, Math.min(RATE_MAX, (rate ?? 1) + direction * RATE_STEP)) * 100,
  ) / 100;
