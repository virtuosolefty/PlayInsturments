import { drumForMidi } from './drums.js';

/**
 * A drum kit, synthesized: no samples to download, like the app's other
 * built-in voices. Drums are a pitched thump (a membrane) and cymbals and the
 * snare's rattle are filtered noise.
 *
 * It answers the same calls as the pitched instruments, so the audio engine,
 * the reference scheduler and live input use it unchanged. A drum cannot be
 * held, so releases do nothing.
 *
 * @param {object} Tone the tone module (passed in so a test can stand in for it)
 * @param {object} output the node to play into
 */
export function buildDrumVoice(Tone, output) {
  const nodes = [];
  const keep = node => { nodes.push(node); return node; };
  const bus = keep(new Tone.Gain(0.9)).connect(output);

  const membrane = (label, options) => keep(new Tone.MembraneSynth({ label, ...options })).connect(bus);
  const noise = (label, filter, decay, volume) => {
    const shaped = keep(new Tone.Filter(filter)).connect(bus);
    return keep(new Tone.NoiseSynth({ label, noise: { type: 'white' }, envelope: { attack: 0.001, decay, sustain: 0, release: 0.05 }, volume })).connect(shaped);
  };
  const tom = label => membrane(label, { pitchDecay: 0.08, octaves: 2.5, envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.2 }, volume: -6 });

  const kick = membrane('kick', { pitchDecay: 0.045, octaves: 7, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.2 }, volume: -2 });
  const snareBody = membrane('snare', { pitchDecay: 0.02, octaves: 3, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 }, volume: -12 });
  const snareRattle = noise('snare', { type: 'highpass', frequency: 1800 }, 0.19, -9);
  const toms = { 'tom-high': [tom('tom-high'), 'A2'], 'tom-mid': [tom('tom-mid'), 'E2'], 'tom-floor': [tom('tom-floor'), 'B1'] };
  const closedHat = noise('hihat', { type: 'highpass', frequency: 7500 }, 0.05, -14);
  const openHat = noise('hihat-open', { type: 'highpass', frequency: 7000 }, 0.38, -15);
  const crash = noise('crash', { type: 'bandpass', frequency: 6500, Q: 0.4 }, 1.5, -11);
  const ride = noise('ride', { type: 'bandpass', frequency: 9000, Q: 1.2 }, 0.55, -15);

  const hits = {
    kick: (time, strength) => kick.triggerAttackRelease('C1', 0.3, time, strength),
    snare: (time, strength) => { snareBody.triggerAttackRelease('G2', 0.1, time, strength); snareRattle.triggerAttackRelease(0.19, time, strength); },
    // Closing the hats cuts off an open one, as the pedal does.
    hihat: (time, strength) => { openHat.triggerRelease(time); closedHat.triggerAttackRelease(0.05, time, strength); },
    'hihat-open': (time, strength) => openHat.triggerAttackRelease(0.38, time, strength),
    crash: (time, strength) => crash.triggerAttackRelease(1.5, time, strength),
    ride: (time, strength) => ride.triggerAttackRelease(0.55, time, strength),
    ...Object.fromEntries(Object.entries(toms).map(([id, [voice, pitch]]) => [id, (time, strength) => voice.triggerAttackRelease(pitch, 0.25, time, strength)])),
  };

  const strike = (name, time, velocity = 0.8) => {
    const piece = drumForMidi(Tone.Frequency(name).toMidi());
    if (!piece) return;
    try {
      hits[piece.id](time, Math.min(1, Math.max(0.05, velocity)));
    } catch {
      // A monophonic voice refuses a hit timed before its last one, which a live
      // hit landing just ahead of a scheduled one can be. That hit is dropped.
    }
  };

  return {
    triggerAttackRelease: (name, _duration, time, velocity) => strike(name, time, velocity),
    triggerAttack: (name, time, velocity) => strike(name, time, velocity),
    triggerRelease() {},
    releaseAll() {},
    dispose() { nodes.forEach(node => node.dispose()); },
  };
}
