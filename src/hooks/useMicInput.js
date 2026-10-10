import { useEffect, useState } from 'react';
import { micInput, micRange } from '../lib/micInput.js';
import { emitSyntheticMidi } from '../lib/midiInput.js';
import { createNoteTracker } from '../lib/noteTracker.js';

/** The microphone's state, kept current: `{ status, error }` (micInput.js). */
export function useMicStatus() {
  const [state, setState] = useState(() => ({ status: micInput.status, error: micInput.error }));
  useEffect(() => {
    setState({ status: micInput.status, error: micInput.error });
    return micInput.onChange(setState);
  }, []);
  return state;
}

/**
 * While `enabled`, the notes a real instrument plays into the microphone are
 * played into the app, as a controller's would be: lessons judge them and the
 * stage shows them. They are marked as coming from the microphone, so the app
 * makes no sound for them (usePracticeEngine.js `soundsInput`).
 *
 * One note at a time. A chord or a strum is not heard as its notes.
 *
 * Holding the microphone and listening for notes are kept apart: changing
 * instrument, or pausing, must not let the microphone go and ask for it again.
 *
 * @param {boolean} enabled
 * @param {{ tuning: number[] } | null} kit the string instrument in hand, or null for the piano: it sets the range listened for
 * @param {boolean} [paused] the microphone stays on but notes are not played in, as while the tuner is open:
 *   tuning a string must not be taken for playing the lesson
 */
export function useMicNotes(enabled, kit, paused = false) {
  const { lowest, highest } = micRange(kit);
  useEffect(() => (enabled ? micInput.hold('notes') : undefined), [enabled]);
  useEffect(() => {
    if (!enabled || paused) return undefined;
    const tracker = createNoteTracker({
      lowest, highest,
      // Stamped when the note really began, not when it was recognised, so that playing in time is judged in time.
      onNoteOn: (midi, velocity, at) => emitSyntheticMidi({ type: 'noteon', midi, velocity, source: 'mic', at: at - micInput.latencyMs }),
      onNoteOff: (midi, at) => emitSyntheticMidi({ type: 'noteoff', midi, velocity: 0, source: 'mic', at }),
    });
    const unlisten = micInput.onPitch(frame => tracker.push(frame, frame.at));
    // If the microphone stops for any reason, the note it was holding has to end with it.
    const unwatch = micInput.onChange(() => tracker.reset(performance.now()));
    return () => { unlisten(); unwatch(); tracker.reset(performance.now()); };
  }, [enabled, paused, lowest, highest]);
}
