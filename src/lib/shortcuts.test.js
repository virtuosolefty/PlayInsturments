/**
 * Driving the deck from the keys.
 *
 * The rule that matters most here is a negative one: the letter keys are the
 * on-screen piano, so no shortcut may ever claim one. A key that plays a note
 * sometimes and changes the mode other times is worse than no shortcut at all,
 * and the two maps live in different files — so this test is what keeps them
 * from drifting into each other.
 */

import { describe, expect, it } from 'vitest';
import { KEYBOARD_MAP } from './midiInput.js';
import { ACTIONS, BINDINGS, LEGENDS, nextRate, RATE_MAX, RATE_MIN, shortcutFor } from './shortcuts.js';

/** A key event, with only the fields the matcher looks at. */
const press = (key, over = {}) => ({ key, code: `Key${key.toUpperCase()}`, ...over });
const space = (over = {}) => ({ key: ' ', code: 'Space', ...over });

describe('what the keys are allowed to be', () => {
  it('never binds a key that plays a note', () => {
    const notes = Object.keys(KEYBOARD_MAP);
    const clashes = Object.keys(BINDINGS).filter((k) => notes.includes(k.toLowerCase()));
    expect(clashes).toEqual([]);
  });

  it('gives every printed legend a binding that still exists', () => {
    // A legend naming a key that does nothing is a lie printed on the hardware.
    const bound = new Set(Object.values(BINDINGS));
    bound.add(ACTIONS.PLAY_PAUSE); // space, matched on `code` rather than `key`
    for (const action of Object.keys(LEGENDS)) {
      expect(bound.has(action)).toBe(true);
    }
  });
});

describe('reading a key press', () => {
  it('finds the transport', () => {
    expect(shortcutFor(space())).toBe(ACTIONS.PLAY_PAUSE);
    expect(shortcutFor(press('0'))).toBe(ACTIONS.STOP);
    expect(shortcutFor(press('\\'))).toBe(ACTIONS.HEAR);
    expect(shortcutFor(press('['))).toBe(ACTIONS.LOOP);
    expect(shortcutFor(press(']'))).toBe(ACTIONS.METRONOME);
  });

  it('finds the three modes', () => {
    expect(shortcutFor(press('1'))).toBe(ACTIONS.MODE_LISTEN);
    expect(shortcutFor(press('2'))).toBe(ACTIONS.MODE_PRACTICE);
    expect(shortcutFor(press('3'))).toBe(ACTIONS.MODE_WAIT);
  });

  it('finds seeking and speed on the arrows', () => {
    expect(shortcutFor({ key: 'ArrowLeft' })).toBe(ACTIONS.SEEK_BACK);
    expect(shortcutFor({ key: 'ArrowRight' })).toBe(ACTIONS.SEEK_FORWARD);
    expect(shortcutFor({ key: 'ArrowUp' })).toBe(ACTIONS.FASTER);
    expect(shortcutFor({ key: 'ArrowDown' })).toBe(ACTIONS.SLOWER);
  });

  it('ignores a note key', () => {
    for (const key of Object.keys(KEYBOARD_MAP)) {
      expect(shortcutFor(press(key))).toBeNull();
    }
  });

  it('ignores anything unbound', () => {
    expect(shortcutFor(press('9'))).toBeNull();
    expect(shortcutFor({ key: 'F5' })).toBeNull();
    expect(shortcutFor(null)).toBeNull();
  });

  it('keeps out of the way of browser and OS chords', () => {
    // Ctrl+0 resets zoom and Cmd+1 switches tab; claiming those is a way to
    // lose a tab, not a shortcut.
    expect(shortcutFor(press('0', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(press('1', { metaKey: true }))).toBeNull();
    expect(shortcutFor(space({ altKey: true }))).toBeNull();
  });

  it('does nothing at all while you are typing', () => {
    expect(shortcutFor(press('1'), { typing: true })).toBeNull();
    expect(shortcutFor(space(), { typing: true })).toBeNull();
  });

  it('lets only Escape through a modal', () => {
    // The handler is on `window`, so without this a "2" pressed while reading
    // the practice report would switch the mode underneath it.
    expect(shortcutFor(press('2'), { dialogOpen: true })).toBeNull();
    expect(shortcutFor(space(), { dialogOpen: true })).toBeNull();
    expect(shortcutFor({ key: 'Escape' }, { dialogOpen: true })).toBe(ACTIONS.CLOSE);
  });
});

describe('stepping the speed', () => {
  it('moves in the steps the slider moves in', () => {
    expect(nextRate(1, 1)).toBe(1.05);
    expect(nextRate(1, -1)).toBe(0.95);
  });

  it('stops at the ends of the slider', () => {
    expect(nextRate(RATE_MAX, 1)).toBe(RATE_MAX);
    expect(nextRate(RATE_MIN, -1)).toBe(RATE_MIN);
  });

  it('does not accumulate floating-point dust', () => {
    // 0.4 + 0.05 + 0.05 … in binary floating point drifts to 0.6000000000000001,
    // which the slider cannot represent and the readout renders as 60.00000001%.
    let rate = RATE_MIN;
    for (let i = 0; i < 12; i += 1) rate = nextRate(rate, 1);
    expect(rate).toBe(1);
  });

  it('treats a missing rate as full speed', () => {
    expect(nextRate(undefined, -1)).toBe(0.95);
  });
});
