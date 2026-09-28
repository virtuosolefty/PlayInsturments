/**
 * transport.js — the song clock.
 *
 * The master clock is `performance.now()` because that's the same time domain
 * as `MIDIMessageEvent.timeStamp`; using it means incoming notes can be placed
 * on the song timeline with sub-millisecond bookkeeping instead of being
 * timestamped whenever React happens to re-render.
 *
 * Audio is scheduled by converting song time -> Tone's audio clock at the
 * moment of scheduling, which keeps sample playback jitter-free.
 */

export class Transport {
  constructor() {
    this.rate = 1; // playback speed multiplier
    this.playing = false;
    this.anchorPerf = 0; // performance.now() at anchor
    this.anchorSong = 0; // song seconds at anchor
    this.loop = null; // [start, end] in song seconds
    this.duration = 0;
    this._waiting = false;
  }

  /** Song position in seconds. */
  now() {
    if (!this.playing || this._waiting) return this.anchorSong;
    return this.anchorSong + ((performance.now() - this.anchorPerf) / 1000) * this.rate;
  }

  /** Convert a song time to a performance.now() timestamp (ms). */
  songToPerf(songTime) {
    return this.anchorPerf + ((songTime - this.anchorSong) / this.rate) * 1000;
  }

  /** Convert an incoming MIDI event timestamp (performance domain) to song time. */
  perfToSong(perfMs) {
    if (!this.playing || this._waiting) return this.anchorSong;
    return this.anchorSong + ((perfMs - this.anchorPerf) / 1000) * this.rate;
  }

  _reanchor(songTime = this.now()) {
    this.anchorSong = songTime;
    this.anchorPerf = performance.now();
  }

  start(from = null) {
    this._reanchor(from ?? this.anchorSong);
    this.playing = true;
    this._waiting = false;
    return this;
  }

  pause() {
    if (this.playing) this._reanchor();
    this.playing = false;
    return this;
  }

  stop() {
    this.playing = false;
    this._waiting = false;
    this.anchorSong = this.loop ? this.loop[0] : 0;
    this.anchorPerf = performance.now();
    return this;
  }

  seek(songTime) {
    this._reanchor(Math.max(0, songTime));
    return this;
  }

  setRate(rate) {
    const t = this.now();
    this.rate = Math.max(0.25, Math.min(2, rate));
    this._reanchor(t);
    return this;
  }

  /** Wait mode: freeze the clock without leaving "playing" state. */
  hold() {
    if (!this._waiting) {
      this.anchorSong = this.now();
      this._waiting = true;
    }
    return this;
  }

  resumeFromHold() {
    if (this._waiting) {
      this._waiting = false;
      this.anchorPerf = performance.now();
    }
    return this;
  }

  get waiting() {
    return this._waiting;
  }

  /**
   * True while the clock is still running up to the first beat of the piece.
   *
   * A run starts at a negative song time so there is a count-in. Shifting the
   * score itself would have been the obvious alternative, but it would move
   * every note's timestamp and so invalidate stored trouble spots; letting the
   * clock go negative leaves the score untouched and gives the notes at t=0
   * their run-up down the screen for free.
   */
  get countingIn() {
    return this.playing && this.now() < 0;
  }

  /** @returns {boolean} true if the loop wrapped this tick */
  checkLoop() {
    if (!this.loop || !this.playing) return false;
    const [start, end] = this.loop;
    if (this.now() >= end) {
      this.seek(start);
      return true;
    }
    return false;
  }
}

/**
 * Schedules reference-playback notes onto the audio clock a little ahead of the
 * playhead. Keeps a moving index so it stays O(1) per frame on long scores.
 */
export class Scheduler {
  constructor(audioEngine, lookahead = 0.25) {
    this.audio = audioEngine;
    this.lookahead = lookahead;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.scheduled = new Set();
  }

  /** Re-sync after a seek so notes before the playhead aren't fired. */
  seek(notes, songTime) {
    this.scheduled.clear();
    this.index = 0;
    while (this.index < notes.length && notes[this.index].time < songTime) this.index += 1;
  }

  /**
   * @param {Array} notes score notes (time-sorted)
   * @param {Transport} transport
   * @param {object} [instrument] where the notes go. Defaults to the audio
   *   engine; in external-instrument mode this is the MIDI output, which
   *   exposes the same `now`/`play` surface in the same seconds-based clock.
   * @param {boolean} enabled reference playback — when false, only the
   *   accompaniment sounds. Notes marked `accompaniment` belong to the hand the
   *   app is covering for you, so they are not the reference performance and
   *   are not silenced with it; without them, single-hand practice would be
   *   played against nothing.
   */
  tick(notes, transport, enabled = true, instrument = this.audio) {
    const songNow = transport.now();
    const horizon = songNow + this.lookahead * transport.rate;
    const audioNow = instrument.now;

    while (this.index < notes.length && notes[this.index].time <= horizon) {
      const note = notes[this.index];
      this.index += 1;
      if (note.time < songNow - 0.05) continue; // we've already passed it
      if (this.scheduled.has(note.id)) continue;
      this.scheduled.add(note.id);
      if (!enabled && !note.accompaniment) continue;
      const delay = (note.time - songNow) / transport.rate;
      instrument.play(note.midi, note.duration / transport.rate, audioNow + Math.max(0, delay), note.velocity);
    }
  }
}
