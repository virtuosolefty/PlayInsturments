/**
 * matcher.js — the scoring engine.
 *
 * A PracticeSession consumes MIDI note-on/note-off events stamped in *song time*
 * and decides, for every one of them, whether it was correct, wrong, early or
 * late; and for every note in the score, whether it was played or missed.
 *
 * Pure JavaScript, no browser APIs — the whole engine is unit tested in node.
 *
 * Two modes:
 *   'timed' — the clock runs; notes must be played at the right moment.
 *   'wait'  — the clock stops at each chord until you play it correctly
 *             (learning mode). Timing is not scored, pitch accuracy still is.
 */

import { classifyWrongNote, noteName, notesSoundingAt } from './theory.js';
import { groupIntoChords } from './score.js';

export const NOTE_STATUS = {
  PENDING: 'pending',
  HIT: 'hit',
  MISSED: 'missed',
};

export const DEFAULTS = {
  /** How far from a target's onset a note-on can be and still count as that note. */
  matchWindow: 0.35,
  /** Inside this deviation the timing is "perfect". */
  perfectWindow: 0.09,
  /** A target still unplayed this long after its onset is counted missed. */
  missWindow: 0.4,
  /** Chord grouping window for wait-mode gates. */
  chordWindow: 0.045,
  /**
   * How far a key press may sit from the written velocity (0..1) before it is
   * called too loud or too soft. Deliberately generous: these arrangements
   * carry broad-brush dynamics, and the useful signal is a hand that thumps or
   * fades, not a few points of MIDI velocity.
   */
  velocityWindow: 0.28,
};

export const DYNAMICS = {
  SOFT: 'soft',
  EVEN: 'even',
  LOUD: 'loud',
};

/** Where a played velocity sits against the written one. */
export function classifyDynamics(delta, window = DEFAULTS.velocityWindow) {
  if (delta > window) return DYNAMICS.LOUD;
  if (delta < -window) return DYNAMICS.SOFT;
  return DYNAMICS.EVEN;
}

let eventSeq = 0;

export class PracticeSession {
  /**
   * @param {object} score normalised Score (see score.js)
   * @param {object} [options] {mode, matchWindow, perfectWindow, missWindow}
   */
  constructor(score, options = {}) {
    this.score = score;
    this.options = { ...DEFAULTS, ...options };
    this.mode = options.mode === 'wait' ? 'wait' : 'timed';
    this.reset();
  }

  reset() {
    // Accompaniment is the hand the app plays for you. It sounds, and it counts
    // as harmony when judging what you played over it, but it is never
    // something you can hit or miss.
    this.targets = this.score.notes
      .filter((n) => !n.accompaniment)
      .map((n) => ({
        ...n,
        status: NOTE_STATUS.PENDING,
        playedAt: null,
        deltaMs: null,
      }));
    this.gates = groupIntoChords(this.targets, this.options.chordWindow);
    this.gateIndex = 0;
    this.events = []; // chronological log of everything the player did
    this.held = new Map(); // midi -> { eventId, songTime }
    this.startedAt = Date.now();
    this.cursor = 0; // last time we advanced to
    this._listeners = new Set();
    return this;
  }

  onEvent(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(event) {
    this.events.push(event);
    for (const fn of this._listeners) fn(event);
    return event;
  }

  /* --------------------------------------------------------------- helpers */

  /** The chord the player must play next (wait mode gate / next cue in timed mode). */
  get currentGate() {
    while (
      this.gateIndex < this.gates.length &&
      this.gates[this.gateIndex].notes.every((n) => n.status !== NOTE_STATUS.PENDING)
    ) {
      this.gateIndex += 1;
    }
    return this.gates[this.gateIndex] ?? null;
  }

  /**
   * Everything sounding at `t` — the harmonic context for theory checks.
   *
   * Deliberately the whole score rather than just your targets: when the app is
   * playing the left hand for you, a right-hand note has to be judged against
   * the chord underneath it. Ignoring that would call a perfectly good chord
   * tone an out-of-key clang.
   */
  expectedAt(t) {
    const sounding = notesSoundingAt(this.score.notes, t, 0.05).map((n) => n.midi);
    if (sounding.length) return sounding;
    const gate = this.currentGate;
    return gate ? gate.notes.map((n) => n.midi) : [];
  }

  /* ------------------------------------------------------------ note input */

  /**
   * Register a key press.
   * @param {number} midi
   * @param {number} songTime seconds into the score
   * @param {number} [velocity] 0..1
   */
  noteOn(midi, songTime, velocity = 0.8) {
    const target = this.mode === 'wait' ? this._findWaitTarget(midi) : this._findTimedTarget(midi, songTime);

    if (target) {
      // Wait mode holds the clock until you find the chord, so there is no
      // such thing as being late in it. `null` rather than `0`: zero would mean
      // "dead on the beat" and hand every run a perfect timing score, which is
      // nearly a third of the grade for something that was never measured.
      const deltaMs = this.mode === 'wait' ? null : Math.round((songTime - target.time) * 1000);
      const targetVelocity = target.velocity ?? 0.8;
      const velocityDelta = velocity - targetVelocity;
      const dynamics = classifyDynamics(velocityDelta, this.options.velocityWindow);

      target.status = NOTE_STATUS.HIT;
      target.playedAt = songTime;
      target.deltaMs = deltaMs;
      target.playedVelocity = velocity;
      target.velocityDelta = velocityDelta;

      const perfect = deltaMs !== null && Math.abs(deltaMs) <= this.options.perfectWindow * 1000;
      const timing = deltaMs === null ? 'untimed' : perfect ? 'onTime' : deltaMs < 0 ? 'early' : 'late';
      const touch =
        dynamics === DYNAMICS.LOUD ? 'harder' : dynamics === DYNAMICS.SOFT ? 'softer' : null;

      const event = this._emit({
        id: (eventSeq += 1),
        type: timing === 'onTime' || timing === 'untimed' ? 'correct' : 'timing',
        midi,
        name: noteName(midi),
        songTime,
        velocity,
        targetVelocity,
        velocityDelta,
        dynamics,
        targetId: target.id,
        targetTime: target.time,
        deltaMs,
        timing,
        severity: deltaMs === null || timing === 'onTime' ? 0 : Math.min(1, Math.abs(deltaMs) / 500),
        label:
          deltaMs === null || timing === 'onTime'
            ? 'Correct'
            : `${Math.abs(deltaMs)} ms ${timing === 'early' ? 'early' : 'late'}`,
        detail:
          (deltaMs === null
            ? `${noteName(midi)}, correct.`
            : timing === 'onTime'
              ? `${noteName(midi)} on time.`
              : `${noteName(midi)} landed ${Math.abs(deltaMs)} ms ${timing}.`) +
          (touch
            ? ` Struck ${touch} than written (${Math.round(velocity * 127)} vs ${Math.round(targetVelocity * 127)}).`
            : ''),
      });
      this.held.set(midi, { eventId: event.id, songTime });
      return event;
    }

    // Nothing in the score wanted this pitch here — work out why it's wrong.
    const expected = this.expectedAt(songTime);
    const verdict = classifyWrongNote(midi, expected, this.score.key);
    const gate = this.currentGate;
    const event = this._emit({
      id: (eventSeq += 1),
      type: 'wrong',
      midi,
      name: noteName(midi),
      songTime,
      velocity,
      targetId: null,
      expected,
      expectedNames: expected.map((m) => noteName(m)),
      gateTime: gate?.time ?? null,
      kind: verdict.kind,
      severity: verdict.severity,
      chord: verdict.chord,
      label: verdict.label,
      detail: verdict.detail,
    });
    this.held.set(midi, { eventId: event.id, songTime });
    return event;
  }

  noteOff(midi, songTime) {
    const held = this.held.get(midi);
    this.held.delete(midi);
    if (!held) return null;
    return { midi, songTime, heldFor: songTime - held.songTime, eventId: held.eventId };
  }

  /**
   * The window is asymmetric on purpose. Early, you may claim a note up to
   * `matchWindow` ahead of its onset. Late, you may claim it right up until it
   * is declared missed — because until then it is still there to be claimed.
   *
   * With a symmetric window the two thresholds disagreed: a note played 380 ms
   * late was too late to match but not yet late enough to be swept, so it
   * counted as a wrong note *and* the target was then counted missed. One
   * fractionally late note, two penalties.
   *
   * Among candidates it takes the *earliest*, not the nearest. On a repeated
   * pitch — two Cs a beat apart — playing the first one slightly late puts both
   * in range, and the nearest is the second. Claiming it orphans the first into
   * a miss and leaves the run permanently one press behind the score. Notes are
   * played in order, so the oldest unclaimed target is the one you meant.
   */
  _findTimedTarget(midi, songTime) {
    const early = this.options.matchWindow;
    const late = Math.max(this.options.matchWindow, this.options.missWindow);
    for (const t of this.targets) {
      if (t.time > songTime + early) break; // targets are time-sorted
      if (t.status !== NOTE_STATUS.PENDING || t.midi !== midi) continue;
      const delta = songTime - t.time;
      if (delta < -early || delta > late) continue;
      return t;
    }
    return null;
  }

  _findWaitTarget(midi) {
    const gate = this.currentGate;
    if (!gate) return null;
    return gate.notes.find((n) => n.status === NOTE_STATUS.PENDING && n.midi === midi) ?? null;
  }

  /* ----------------------------------------------------------- clock drive */

  /**
   * Move the evaluation cursor forward; anything left unplayed past its
   * miss window becomes a missed-note event.
   * @returns {object[]} newly generated miss events
   */
  advanceTo(songTime) {
    const misses = [];
    if (this.mode === 'wait') {
      this.cursor = songTime;
      return misses;
    }
    for (const t of this.targets) {
      if (t.status !== NOTE_STATUS.PENDING) continue;
      if (t.time + this.options.missWindow < songTime) {
        t.status = NOTE_STATUS.MISSED;
        misses.push(
          this._emit({
            id: (eventSeq += 1),
            type: 'missed',
            midi: t.midi,
            name: t.name,
            songTime: t.time,
            targetId: t.id,
            severity: 0.7,
            label: 'Missed note',
            detail: `${t.name} at ${t.time.toFixed(2)}s was never played.`,
          }),
        );
      } else if (t.time > songTime) break;
    }
    this.cursor = songTime;
    return misses;
  }

  /** In wait mode: true when the player has completed the current chord. */
  isGateSatisfied() {
    const gate = this.currentGate;
    return gate === null;
  }

  /* -------------------------------------------------------------- results */

  get summary() {
    const total = this.targets.length;
    const hits = this.targets.filter((t) => t.status === NOTE_STATUS.HIT);
    const missed = this.targets.filter((t) => t.status === NOTE_STATUS.MISSED);
    const wrong = this.events.filter((e) => e.type === 'wrong');
    const deltas = hits.map((h) => h.deltaMs).filter((d) => Number.isFinite(d));
    const onTime = deltas.filter((d) => Math.abs(d) <= this.options.perfectWindow * 1000).length;

    const meanAbs = deltas.length ? deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length : 0;
    const meanSigned = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;

    // Dynamics: how close your touch was to the written velocity, and how even
    // it was overall. Evenness is the more useful of the two on an exercise —
    // a scale played at a consistent weight sounds right even if the absolute
    // level is not what the file asked for.
    const touched = hits.filter((h) => Number.isFinite(h.velocityDelta));
    const velocities = touched.map((h) => h.playedVelocity);
    const evenTouches = touched.filter(
      (h) => Math.abs(h.velocityDelta) <= this.options.velocityWindow,
    );
    const meanVelocity = velocities.length
      ? velocities.reduce((s, v) => s + v, 0) / velocities.length
      : 0;
    const velocitySpread = velocities.length
      ? Math.sqrt(
          velocities.reduce((s, v) => s + (v - meanVelocity) ** 2, 0) / velocities.length,
        )
      : 0;
    const meanVelocityDelta = touched.length
      ? touched.reduce((s, h) => s + h.velocityDelta, 0) / touched.length
      : 0;

    return {
      total,
      hit: hits.length,
      missed: missed.length,
      wrongNotes: wrong.length,
      extraNotes: wrong.length,
      noteAccuracy: total ? hits.length / total : 0,
      // null, not 1: wait mode never measured this, and a score of perfect
      // for something unmeasured is worth nearly a third of the grade.
      //
      // null for no hits either, and for the same reason. This used to be 0,
      // which reads as "none of your notes were on time" when what happened is
      // that there were no notes to be on time. Every display downstream then
      // had to remember to guard it separately, and the timing needle did not:
      // it announced ON TIME in green over a run of nothing, because the mean
      // deviation across an empty set is zero. One null here is worth a guard
      // in every panel that reads it.
      timingAccuracy: this.mode === 'wait' || !hits.length ? null : onTime / hits.length,
      /** Share of hits struck within the velocity window of the written level. */
      dynamicsAccuracy: touched.length ? evenTouches.length / touched.length : 0,
      /** Negative = you play lighter than written, positive = heavier. */
      meanVelocityDelta: Number(meanVelocityDelta.toFixed(3)),
      meanVelocity: Number(meanVelocity.toFixed(3)),
      /** Standard deviation of your touch: low is even, high is lumpy. */
      velocitySpread: Number(velocitySpread.toFixed(3)),
      tooLoud: touched.filter((h) => h.velocityDelta > this.options.velocityWindow).length,
      tooSoft: touched.filter((h) => h.velocityDelta < -this.options.velocityWindow).length,
      /** Which pitches you played that the score did not want, and how often. */
      wrongNoteNames: wrong.reduce((acc, e) => {
        acc[e.name] = (acc[e.name] ?? 0) + 1;
        return acc;
      }, {}),
      /** Single headline number: pitch accuracy penalised by extra notes. */
      score: total ? Math.max(0, (hits.length - wrong.length * 0.5) / total) : 0,
      meanAbsDeviationMs: Math.round(meanAbs),
      /** Negative = you rush, positive = you drag. */
      meanSignedDeviationMs: Math.round(meanSigned),
      wrongNoteKinds: wrong.reduce((acc, e) => {
        acc[e.kind] = (acc[e.kind] ?? 0) + 1;
        return acc;
      }, {}),
      durationSec: (Date.now() - this.startedAt) / 1000,
    };
  }

  /** Which spots in the score went wrong — feeds the persistent trouble map. */
  get troubleSpots() {
    const spots = new Map();
    const bump = (key, patch) => {
      const cur = spots.get(key) ?? { key, time: patch.time, name: patch.name, missed: 0, wrong: 0, late: 0 };
      spots.set(key, {
        ...cur,
        missed: cur.missed + (patch.missed ?? 0),
        wrong: cur.wrong + (patch.wrong ?? 0),
        late: cur.late + (patch.late ?? 0),
      });
    };

    for (const t of this.targets) {
      if (t.status === NOTE_STATUS.MISSED) bump(`${t.time}:${t.midi}`, { time: t.time, name: t.name, missed: 1 });
      else if (t.status === NOTE_STATUS.HIT && Math.abs(t.deltaMs ?? 0) > this.options.perfectWindow * 1000)
        bump(`${t.time}:${t.midi}`, { time: t.time, name: t.name, late: 1 });
    }
    for (const e of this.events) {
      if (e.type === 'wrong') {
        const at = e.gateTime ?? e.songTime;
        bump(`${at}:wrong`, { time: at, name: `unexpected ${e.name}`, wrong: 1 });
      }
    }
    return [...spots.values()].sort((a, b) => a.time - b.time);
  }
}
