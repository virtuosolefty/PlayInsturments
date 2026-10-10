import { useCallback } from 'react';
import { audio } from '../lib/audio.js';
import { drumPiece } from '../lib/drums.js';
import { emitSyntheticMidi } from '../lib/midiInput.js';

/** How long a struck drum counts as "down" before it is let go. A drum is hit, not held. */
const TAP_MS = 90;

/**
 * One hit on a piece of the kit from the screen: a pad, or the 3D model.
 *
 * It goes out as a note, as a controller's would, so sound, scoring and the
 * stage's reaction are shared with keys and MIDI. Unlike a piano key it is
 * never held, so two quick hits on one drum are two notes.
 *
 * @param {(error: Error) => void} [onError] told when sound could not start
 * @returns {(id: string, strength?: number) => void}
 */
export function useDrumInput(onError) {
  return useCallback((id, strength = 0.8) => {
    const piece = drumPiece(id);
    if (!piece) return;
    const strike = () => {
      emitSyntheticMidi({ type: 'noteon', midi: piece.midi, velocity: strength, source: 'drums-screen', piece: piece.id });
      setTimeout(() => emitSyntheticMidi({ type: 'noteoff', midi: piece.midi, velocity: 0, source: 'drums-screen', piece: piece.id }), TAP_MS);
    };
    // Once sound is running a hit must not wait a turn of the event loop for it.
    if (audio.running) { strike(); return; }
    audio.start().then(strike, error => onError?.(error));
  }, [onError]);
}
