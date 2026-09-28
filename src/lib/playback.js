/**
 * playback.js — hearing your own playing back.
 *
 * The most useful thing a teacher does that this app could not: play it back
 * to you. Unevenness of touch and a rushed bar are both far more obvious in
 * the ear than in a number, and a learner who has just played something is the
 * worst-placed person to judge what it sounded like — they were busy.
 *
 * The conversion from what was captured to what can be played is pure and
 * tested here. The scheduling is a thin wrapper over the audio engine, using
 * the same look-ahead approach as the score scheduler so that stopping
 * actually stops rather than merely muting notes already queued.
 */

export const CLIP_DEFAULTS = {
  /** A key barely touched still has to be audible. */
  minDuration: 0.12,
  /** A note held to the end of the run should not ring for a minute. */
  maxDuration: 4,
  /** Given to notes that were still held when the run ended. */
  unreleasedDuration: 0.6,
};

/** Entries that can actually be sounded. */
const playable = (played) =>
  played.filter(
    (p) => p && Number.isFinite(p.midi) && Number.isFinite(p.start) && p.midi >= 0 && p.midi <= 127,
  );

/** Song time of the first note in a set, or null if there isn't one. */
export const firstOnset = (played = []) => {
  const usable = playable(played);
  return usable.length ? Math.min(...usable.map((p) => p.start)) : null;
};

/** Score notes in the shape a captured performance has. */
export const notesAsPlayed = (notes = []) =>
  notes.map((n) => ({
    midi: n.midi,
    start: n.time,
    end: n.time + n.duration,
    velocity: n.velocity,
  }));

/**
 * How much quieter the score sits under your own playing in a comparison.
 *
 * Not silent and not equal. Equal makes a duet in which you cannot tell which
 * part is yours; much quieter and the thing you are checking against stops
 * being audible in the bars you actually fumbled.
 */
export const REFERENCE_LEVEL = 0.55;

/**
 * Turn captured key presses into playable clips.
 *
 * @param {Array} played entries of `{midi, start, end, velocity}`
 * @param {object} [options] clip durations, plus `origin` — the song time that
 *   becomes zero. Defaults to the first note: a run where you came in four bars
 *   late should not play back four bars of silence first. Pass it explicitly to
 *   put two sets of clips on one timeline, where that late entry is the very
 *   thing you want to hear.
 * @returns {Array} time-sorted `{midi, time, duration, velocity}`
 */
export function toClips(played = [], options = {}) {
  const { minDuration, maxDuration, unreleasedDuration, origin: fixedOrigin } = {
    ...CLIP_DEFAULTS,
    ...options,
  };

  const usable = playable(played);
  if (!usable.length) return [];

  const origin = Number.isFinite(fixedOrigin) ? fixedOrigin : firstOnset(usable);

  return usable
    .map((p) => {
      const held = Number.isFinite(p.end) ? p.end - p.start : unreleasedDuration;
      return {
        midi: p.midi,
        time: Math.max(0, p.start - origin),
        duration: Math.max(minDuration, Math.min(maxDuration, held)),
        // Velocity is what makes this worth listening to — a playback at a
        // uniform level would hide the very unevenness it exists to reveal.
        velocity: Number.isFinite(p.velocity) ? Math.max(0.05, Math.min(1, p.velocity)) : 0.75,
      };
    })
    .sort((a, b) => a.time - b.time || a.midi - b.midi);
}

/** How long the playback runs for, in seconds. */
export const clipsDuration = (clips) =>
  clips.reduce((end, c) => Math.max(end, c.time + c.duration), 0);

/**
 * Your run and the score together, on one timeline.
 *
 * Playing your own run back on its own turned out to answer the wrong
 * question. It tells you what you did; it cannot tell you what you *should*
 * have done, and the worse a run went the less there is to hear — a run where
 * you missed most of it plays back as a handful of disconnected notes with
 * nothing to judge them against. The run that most needs explaining is the one
 * solo playback explains least.
 *
 * Against the score, every mistake becomes audible as itself: a missed note is
 * a bar where only the reference is sounding, a wrong one is a clash, and
 * dragging is you arriving behind something steady. None of that needs a
 * number to interpret.
 *
 * Both sets share an origin — the earlier of the two first notes — because the
 * gap between them is exactly what you are listening for. Anchoring each to
 * its own first note would silently correct a late entry into a clean one.
 *
 * @param {Array} played captured key presses
 * @param {Array} notes score notes, `{midi, time, duration, velocity}`
 * @returns {Array} time-sorted clips; reference clips carry `reference: true`
 */
export function comparisonClips(played = [], notes = [], options = {}) {
  const reference = notesAsPlayed(notes);
  const onsets = [firstOnset(played), firstOnset(reference)].filter(Number.isFinite);
  if (!onsets.length) return [];
  const origin = Math.min(...onsets);

  const mine = toClips(played, { ...options, origin });
  const theirs = toClips(reference, { ...options, origin }).map((c) => ({
    ...c,
    velocity: Math.max(0.05, c.velocity * REFERENCE_LEVEL),
    reference: true,
  }));

  // Yours last within a tie so it is the one that wins the voice on a shared
  // pitch — the point of the exercise is hearing what you did.
  return [...theirs, ...mine].sort((a, b) => a.time - b.time);
}

/**
 * Schedules clips into an audio engine a fraction ahead of the clock.
 *
 * Look-ahead rather than queueing everything at once, so `stop()` genuinely
 * stops: notes queued into a Web Audio graph minutes ahead cannot be recalled,
 * and a playback that keeps sounding after you stopped it is worse than none.
 */
export class PerformancePlayback {
  /**
   * @param {object} audioEngine anything with `now`, `play` and `releaseAll`
   * @param {object} [options] {lookahead, interval, setInterval, clearInterval}
   */
  constructor(audioEngine, options = {}) {
    this.audio = audioEngine;
    this.lookahead = options.lookahead ?? 0.2;
    this.intervalMs = options.interval ?? 40;
    this._setInterval = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this._clearInterval = options.clearInterval ?? ((id) => clearInterval(id));
    this.timer = null;
    this.playing = false;
  }

  /**
   * @param {Array} clips from toClips
   * @param {object} [handlers] {onEnd}
   * @returns {boolean} whether there was anything to play
   */
  start(clips, { onEnd } = {}) {
    this.stop();
    if (!clips?.length) return false;

    const startedAt = this.audio.now;
    const total = clipsDuration(clips);
    let index = 0;
    this.playing = true;

    const tick = () => {
      const elapsed = this.audio.now - startedAt;
      const horizon = elapsed + this.lookahead;
      while (index < clips.length && clips[index].time <= horizon) {
        const clip = clips[index];
        index += 1;
        this.audio.play(clip.midi, clip.duration, startedAt + clip.time, clip.velocity);
      }
      // A tail past the last release, so the final note is not cut off by the
      // callback that tears the playback down.
      if (index >= clips.length && elapsed >= total + 0.1) {
        this.stop();
        onEnd?.();
      }
    };

    tick();
    this.timer = this._setInterval(tick, this.intervalMs);
    return true;
  }

  stop() {
    if (this.timer !== null) {
      this._clearInterval(this.timer);
      this.timer = null;
    }
    if (this.playing) this.audio.releaseAll?.();
    this.playing = false;
  }
}
