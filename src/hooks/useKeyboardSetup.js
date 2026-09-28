import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AUTO_PROFILE,
  followRange,
  profileById,
  profileForDeviceName,
  windowFor,
} from '../lib/devices.js';
import { midiInput } from '../lib/midiInput.js';

/**
 * Which keybed is in front of you, and where its octave currently sits.
 *
 * Extracted from App, which had grown past the 800-line ceiling this project
 * sets itself. This is one coherent job — read the device name, resolve it to
 * a profile, and keep the octave window following the hardware — so it comes
 * out whole rather than as a pile of loose values.
 *
 * `playingRef` rather than a boolean: the engine that knows whether a run is
 * in progress is built from the score, which is built from the window this
 * hook returns — so the value cannot be read before the hook is called. The
 * caller sets the ref once the engine exists, and the subscription reads it at
 * the moment a note arrives.
 *
 * @param {object} midiState from the MIDI input manager
 * @param {string} keyboardId the chosen profile, or AUTO_PROFILE
 * @param {{current: boolean}} playingRef whether a run is in progress
 */
export function useKeyboardSetup(midiState, keyboardId, playingRef) {
  /**
   * Where the controller's keybed currently sits. Session-only on purpose: the
   * hardware's octave buttons reset when it is unplugged, so remembering this
   * across sessions would be remembering something untrue.
   */
  const [keyboardLow, setKeyboardLow] = useState(null);

  const deviceName = useMemo(
    () => midiState.inputs.find((i) => i.id === midiState.selectedId)?.name ?? null,
    [midiState.inputs, midiState.selectedId],
  );

  const autoDetected = useMemo(
    () => (deviceName ? profileForDeviceName(deviceName) : null),
    [deviceName],
  );

  const profile = useMemo(
    () =>
      keyboardId === AUTO_PROFILE
        ? (autoDetected ?? profileForDeviceName(null))
        : profileById(keyboardId),
    [keyboardId, autoDetected],
  );

  const keyWindow = useMemo(() => windowFor(profile, keyboardLow), [profile, keyboardLow]);

  // A different controller means a different keybed: drop any octave we learnt.
  useEffect(() => {
    setKeyboardLow(null);
  }, [profile.id]);

  // Read from refs inside the subscription so it is attached once rather than
  // torn down and rebuilt every time the window or the transport changes.
  const keyWindowRef = useRef(keyWindow);
  keyWindowRef.current = keyWindow;

  useEffect(
    () =>
      midiInput.onMessage((msg) => {
        if (msg.type !== 'noteon') return;
        // The computer keyboard and the on-screen piano have no octave buttons,
        // so they say nothing about where the hardware keybed sits.
        if (msg.synthetic) return;
        // Re-fitting mid-run would reset the score, so only re-aim between runs.
        if (playingRef?.current) return;
        const current = keyWindowRef.current;
        if (msg.midi >= current[0] && msg.midi <= current[1]) return;
        setKeyboardLow(followRange(current, msg.midi)[0]);
      }),
    [],
  );

  return {
    deviceName,
    autoDetected,
    profile,
    keyWindow,
    keyboardLow,
    setKeyboardLow,
    shiftOctave: (direction) =>
      setKeyboardLow((low) => (low ?? profile.defaultLow) + direction * 12),
    resetOctave: () => setKeyboardLow(null),
  };
}
