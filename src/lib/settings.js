/**
 * settings.js — the persisted preferences, their defaults, and their migration.
 *
 * Lifted out of App, which had grown past the 800-line ceiling this project
 * sets itself. Defaults belong next to the migration that reconciles them:
 * changing one without the other is the bug the version number exists to stop.
 */

import { MODES } from '../hooks/usePracticeEngine.js';
import { AUTO_PROFILE } from './devices.js';
import { FIT_MODES, HAND_FILTERS } from './arrange.js';
import { INSTRUMENT_MODES } from './midiOutput.js';
import { IDENTITY_CURVE } from './velocity.js';

/**
 * Bump when a default changes in a way that should reach people who already
 * have the old value saved. Without this, changing a default only affects
 * first-time visitors — everyone else keeps the setting silently forever.
 */
export const SETTINGS_VERSION = 5;

export const DEFAULT_SETTINGS = {
  theme: 'light',
  inputMethod: 'screen',
  pianoHeight: 104,
  pianoLabels: 'octaves',
  pianoRange: 'full',
  favoritePieces: [],
  guitarLeftHanded: false,
  guitarLabels: 'fingers',
  lastPianoId: null,
  practiceInstrument: 'piano',
  guitarStudyId: 'guitar-open-strings',
  mode: MODES.PRACTICE,
  rate: 1,
  transpose: 0,
  pps: 180,
  // Off: the app should sound like your instrument, not play itself. Turn it
  // on deliberately when you want to hear the piece under your hands.
  referenceAudio: false,
  metronome: false,
  errorCues: true,
  loop: null,
  matchWindow: 0.35,
  perfectWindow: 0.09,
  missWindow: 0.4,
  velocityWindow: 0.28,
  /**
   * How your controller's reported velocity maps onto the range the score is
   * written in. Identity until you calibrate — see velocity.js for why the
   * default cannot be anything cleverer than "change nothing".
   */
  velocityCurve: IDENTITY_CURVE,
  /**
   * 'canvas' or 'gl'.
   *
   * The performance stage uses lit, solid Three.js instruments by default.
   * Canvas remains available for linear timing and as the WebGL fallback.
   */
  renderer: 'gl',
  /**
   * 'auto', 'full' or 'light': how much the 3D string stage draws.
   *
   * Auto gives a real GPU reflections and lacquer and gives software rendering
   * the lighter stage; see stage/quality.js. The other two override the guess.
   */
  stageQuality: 'auto',
  keyboardId: AUTO_PROFILE,
  fit: FIT_MODES.FOLD,
  hands: HAND_FILTERS.BOTH,
  // One bar of clicks before the piece starts. Without it the first note sits
  // on the hit line the instant you press play, and is unhittable by anyone.
  countInBars: 1,
  inputLatencyMs: 0,
  instrumentSource: INSTRUMENT_MODES.INTERNAL,
  // Whether your own playing is echoed to the external instrument. Off when the
  // plugin already hears the controller directly, or you get every note twice.
  forwardInput: true,
  midiOutputId: null,
  // 'note' | 'finger' | 'none' — what gets written on a falling note.
  noteLabels: 'note',
  // 'roll' | 'both' | 'staff' — falling notes, notation, or one above the other.
  view: 'roll',
  dailyGoalMinutes: 10,
  // Off until asked for. A browser that starts talking on its own is
  // startling; the report carries a visible switch to turn it on.
  spokenCoaching: false,
  // Cleared by the welcome card's one button, so it only ever shows once.
  onboarded: false,
  settingsVersion: SETTINGS_VERSION,
};

/** Saved settings from an older version, reconciled with the current defaults. */
export function migrateSettings(saved) {
  if (saved.settingsVersion === SETTINGS_VERSION) return saved;
  const rest = { ...saved };
  // Preserve v3 audio choices; only the older migration resets accompaniment.
  if ((saved.settingsVersion ?? 0) < 3) delete rest.referenceAudio;
  return {
    ...rest,
    // Open the requested dimensional piano redesign once on upgrade. A later
    // choice of 2D is retained by the version check above. Keep guitar choices.
    renderer: ['guitar', 'violin', 'cello'].includes(rest.practiceInstrument)
      ? (rest.renderer === 'gl' || rest.renderer === 'gl-perspective' ? 'gl' : 'canvas')
      : 'gl',
    pianoHeight: rest.pianoHeight == null || rest.pianoHeight === 164 ? 104 : rest.pianoHeight,
    pianoLabels: rest.pianoLabels ?? 'octaves',
    pianoRange: rest.pianoRange ?? 'full',
    settingsVersion: SETTINGS_VERSION,
  };
}
