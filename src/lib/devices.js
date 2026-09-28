/**
 * devices.js — what your controller can physically reach.
 *
 * A 25-key MPK Mini and a 61-key Keystation are different instruments, and a
 * score that is comfortable on one is unplayable on the other. Everything in
 * the app that needs to know "which notes can this person actually press"
 * reads a keyboard *window*: a [lowMidi, highMidi] pair derived from a profile.
 *
 * The window follows the hardware. Controllers with fewer than 88 keys have
 * OCT-/OCT+ buttons that shift the whole keybed by an octave, and the app has
 * no way to read that setting — but it does see the notes that arrive, so a
 * note outside the current window slides the window by whole octaves until it
 * fits. Press OCT+ on the MPK, play anything, and the app is back in sync.
 */

const LOWEST_MIDI = 0;
const HIGHEST_MIDI = 127;

/**
 * Ordered: the first profile whose `match` hits a device name wins, so the
 * specific patterns must come before the loose family fallbacks.
 * `defaultLow` is the leftmost key at the controller's factory octave.
 */
export const KEYBOARD_PROFILES = [
  { id: 'mpk-mini', label: 'Akai MPK Mini', keyCount: 25, defaultLow: 48, match: /mpk\s*mini/i },
  { id: 'mpk-49', label: 'Akai MPK 49 / 249', keyCount: 49, defaultLow: 36, match: /mpk\s*2?49/i },
  { id: 'mpk-61', label: 'Akai MPK 61 / 261', keyCount: 61, defaultLow: 36, match: /mpk\s*2?61/i },
  { id: 'keystation-32', label: 'M-Audio Keystation 32', keyCount: 32, defaultLow: 41, match: /keystation\D*32/i },
  { id: 'keystation-49', label: 'M-Audio Keystation 49', keyCount: 49, defaultLow: 36, match: /keystation\D*49/i },
  { id: 'keystation-88', label: 'M-Audio Keystation 88', keyCount: 88, defaultLow: 21, match: /keystation\D*88/i },
  { id: 'keystation-61', label: 'M-Audio Keystation 61', keyCount: 61, defaultLow: 36, match: /keystation/i },
  { id: 'generic-25', label: 'Any 25-key controller', keyCount: 25, defaultLow: 48, match: /\b25[\s-]*key/i },
  { id: 'generic-37', label: 'Any 37-key controller', keyCount: 37, defaultLow: 48, match: null },
  { id: 'generic-49', label: 'Any 49-key controller', keyCount: 49, defaultLow: 36, match: null },
  { id: 'generic-61', label: 'Any 61-key controller', keyCount: 61, defaultLow: 36, match: null },
  { id: 'generic-76', label: 'Any 76-key stage piano', keyCount: 76, defaultLow: 28, match: null },
  { id: 'generic-88', label: 'Full 88-key piano', keyCount: 88, defaultLow: 21, match: null },
];

export const AUTO_PROFILE = 'auto';
const FALLBACK_ID = 'generic-88';

export const profileById = (id) =>
  KEYBOARD_PROFILES.find((p) => p.id === id) ?? KEYBOARD_PROFILES.find((p) => p.id === FALLBACK_ID);

/**
 * Guess a profile from the Web MIDI port name. An unrecognised controller is
 * assumed to be a full piano: over-constraining someone's 88-key stage piano
 * would be far more annoying than leaving a mini keyboard unconstrained.
 */
export function profileForDeviceName(name) {
  if (!name) return profileById(FALLBACK_ID);
  const hit = KEYBOARD_PROFILES.find((p) => p.match && p.match.test(name));
  return hit ?? profileById(FALLBACK_ID);
}

/** The playable window for a profile whose leftmost key sits on `low`. */
export function windowFor(profile, low = null) {
  const lo = clampLow(low ?? profile.defaultLow, profile.keyCount);
  return [lo, lo + profile.keyCount - 1];
}

function clampLow(low, keyCount) {
  const span = keyCount - 1;
  return Math.max(LOWEST_MIDI, Math.min(HIGHEST_MIDI - span, Math.round(low)));
}

/**
 * Slide a window by whole octaves until it contains `midi`. Whole octaves
 * because that is the only way hardware transpose buttons move.
 * @returns {[number, number]} the window — unchanged if `midi` already fits
 */
export function followRange([lo, hi], midi) {
  if (midi >= lo && midi <= hi) return [lo, hi];
  const span = hi - lo;
  const octaves = midi < lo ? -Math.ceil((lo - midi) / 12) : Math.ceil((midi - hi) / 12);
  const nextLo = clampLow(lo + octaves * 12, span + 1);
  return [nextLo, nextLo + span];
}

/** True when every note of `range` sits inside `window`. */
export const rangeFitsWindow = ([lo, hi], [wLo, wHi]) => lo >= wLo && hi <= wHi;

/** A window covering everything — used when no controller is connected. */
export const UNLIMITED_RANGE = [21, 108];
