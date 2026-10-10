/**
 * usePracticeEngine — glue between the pure engine (transport/matcher/audio),
 * the Web MIDI stream and React.
 *
 * Design note: everything that changes at frame rate lives in refs, and the
 * canvas reads those refs directly in its own rAF loop. React state is only
 * updated a few times a second for the numeric read-outs, so a busy passage
 * never triggers hundreds of re-renders.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canonicalDrumMidi } from '../lib/drums.js';
import { PracticeSession, NOTE_STATUS } from '../lib/matcher.js';
import { Scheduler, Transport } from '../lib/transport.js';
import { audio } from '../lib/audio.js';
import { midiInput } from '../lib/midiInput.js';
import { INSTRUMENT_MODES, midiOutput } from '../lib/midiOutput.js';
import { recordCombo, recordGhost, recordPracticeDay, recordSession } from '../lib/storage.js';
import { gradeRun } from '../lib/grading.js';
import { groupProblems } from '../lib/passages.js';
import { FULL_VARIANT } from '../lib/score.js';
import { applyCurve, isIdentity } from '../lib/velocity.js';

const TAIL_SEC = 1.2; // grace period after the last note before we call it done
const UI_HZ = 12; // how often the numeric read-outs refresh
const MAX_EVENTS = 60;
/**
 * Key presses kept for the roll's "what you played" strip and for playing the
 * run back. Ten minutes of continuous semiquavers would not reach this.
 */
const MAX_PLAYED = 6000;

export const MODES = {
  LISTEN: 'listen', // reference playback only, no scoring
  PRACTICE: 'practice', // clock runs, everything scored
  WAIT: 'wait', // clock waits for you at every chord
};

/**
 * Your key press reaches the app almost instantly, but the sound you are
 * playing along to left the speakers a buffer ago — so a player in perfect time
 * measures as consistently late. Calibration estimates that constant and it is
 * subtracted here, at the single point where hardware time becomes song time.
 */
const inputLatencySec = (settings) => (settings.inputLatencyMs ?? 0) / 1000;

/**
 * What you actually played, in the units the score is written in.
 *
 * The mirror image of `inputLatencySec` above, and applied at the same single
 * seam for the same reason. That one corrects *when* the hardware said you
 * played; this corrects *how hard* it said you played. Both are constants of
 * your equipment rather than facts about you, and both were being scored as
 * though they were facts about you.
 *
 * Applied to the sound as well as to the judging. A correction that fixed the
 * score but not what comes out of the speakers would have you playing to a
 * meter instead of to your ears, which is the opposite of the habit this app
 * is trying to build.
 */
const touchOf = (settings, raw) => applyCurve(raw ?? 0.75, settings.velocityCurve);

/**
 * Where notes should be sounded.
 *
 * In external mode a plugin or hardware module is the instrument, so the app
 * must stop sounding notes itself or you hear everything twice. Cues and the
 * metronome deliberately stay internal — they are not piano sounds, and sending
 * a buzz through a grand piano patch would be nonsense.
 */
function instrumentFor(settings) {
  // Chosen means chosen. This used to be `&& midiOutput.available`, so any
  // moment the port list came back empty — a device re-enumerating, a cable
  // going, the gap before attach() runs on startup — quietly handed the notes
  // back to the browser while the setting still said "A plugin". You then hear
  // the app *and* the plugin, because the plugin is usually listening to the
  // controller directly as well, and nothing anywhere says why.
  //
  // Falling back was meant to be a kindness and was the same silent-fallback
  // mistake as an audio clock that stops without telling anyone. If the plugin
  // route is broken the honest outcome is that it is visibly broken:
  // `midiOutput.running` drives the instrument indicator, and undelivered notes
  // are counted and warned about under [midi-out].
  return settings.instrumentSource === INSTRUMENT_MODES.EXTERNAL ? midiOutput : audio;
}

/**
 * Should the app sound a note the player has just played?
 *
 * For the screen, the computer keys and a MIDI controller, always: none of
 * them makes a sound of its own, and the app must feel like an instrument.
 * For a note heard through the microphone, never: the real instrument has
 * already sounded it, and playing it again would go straight back into the
 * microphone as a note nobody played. The same goes for the buzz on a wrong
 * note: heard by the microphone it is another wrong note, which buzzes again.
 */
export const soundsInput = (msg) => msg.source !== 'mic';

/**
 * Silence both instruments. Which one is live can change between a note
 * starting and the stop that ends it, and a stuck note on a MIDI port rings
 * until something explicitly tells it not to.
 */
function releaseEverything() {
  audio.releaseAll();
  midiOutput.releaseAll();
}

/**
 * Should the app sound the score for you?
 *
 * Listen mode is nothing but reference playback. Wait mode is its opposite:
 * the clock holds on the chord you have to work out, so playing it aloud would
 * defeat the mode. Everywhere else it is your choice.
 */
export function referencePlaybackFor(settings) {
  if (settings.mode === MODES.LISTEN) return true;
  if (settings.mode === MODES.WAIT) return false;
  return !!settings.referenceAudio;
}

/**
 * The note a message means. Pitched instruments take the input transpose; on
 * the drums a controller's neighbouring General MIDI note counts as the drum
 * the lessons are written in.
 */
export function playedMidi(cfg, midi) {
  if (cfg.practiceInstrument === 'drums') return canonicalDrumMidi(midi) ?? midi;
  return midi + (cfg.inputTranspose ?? 0);
}

export function usePracticeEngine(score, settings) {
  const transportRef = useRef(null);
  const schedulerRef = useRef(null);
  const sessionRef = useRef(null);
  /** midi -> { at, type, severity } for the keyboard/roll highlight */
  const activeInputRef = useRef(new Map());
  /** what the player actually played, for the "your performance" overlay */
  const playedRef = useRef([]);
  /**
   * Short-lived flourishes for the canvas: a ring where a note landed, a pulse
   * where one was missed. Kept out of React entirely — these live and die
   * inside a few hundred milliseconds and re-rendering for them would cost more
   * than drawing them.
   */
  const effectsRef = useRef([]);
  /** Consecutive correct notes. Resets on anything that is not a clean hit. */
  const comboRef = useRef({ count: 0, best: 0 });
  const settingsRef = useRef(settings);
  const scoreRef = useRef(score);
  const metronomeRef = useRef({ nextBeat: 0 });
  const finishedRef = useRef(false);
  /** Song seconds that have actually elapsed under the playhead this run. */
  const playedSecondsRef = useRef(0);
  const lastTickRef = useRef(null);
  /** Throttles the attempt to restart an audio clock that stopped mid-run. */
  const lastResumeRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [songTime, setSongTime] = useState(0);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  // `running`, not `ready`. An instrument object existing is not the same as a
  // note through it being audible, and this indicator is the app's only claim
  // that you will hear anything.
  const [audioRunning, setAudioRunning] = useState(audio.running);
  const [outputRunning, setOutputRunning] = useState(midiOutput.running);
  const [instrument, setInstrument] = useState(audio.sourceLabel);

  // The sampled piano finishes downloading after the app is already playable,
  // so the label has to be pushed rather than read once.
  useEffect(
    () =>
      audio.onChange((engine) => {
        setAudioRunning(engine.running);
        setInstrument(engine.sourceLabel);
      }),
    [],
  );

  useEffect(() => midiOutput.onChange((snapshot) => setOutputRunning(!!snapshot.running)), []);

  /**
   * Whether the instrument that will actually sound is working.
   *
   * Which one that is depends on the settings, so asking the audio engine alone
   * would report a healthy internal piano while the external plugin the app is
   * really sending to sits behind an unplugged cable. This is the value the top
   * bar shows, and it has one job: never claim you will hear something you
   * will not.
   */
  const usingExternal =
    settings.instrumentSource === INSTRUMENT_MODES.EXTERNAL && midiOutput.available;
  const audioReady = usingExternal ? outputRunning : audioRunning;

  settingsRef.current = settings;
  scoreRef.current = score;

  if (!transportRef.current) transportRef.current = new Transport();
  if (!schedulerRef.current) schedulerRef.current = new Scheduler(audio);

  /* ------------------------------------------------------- session lifecycle */

  const buildSession = useCallback(() => {
    if (!score) return null;
    const s = new PracticeSession(score, {
      mode: settingsRef.current.mode === MODES.WAIT ? 'wait' : 'timed',
      matchWindow: settingsRef.current.matchWindow,
      perfectWindow: settingsRef.current.perfectWindow,
      missWindow: settingsRef.current.missWindow,
      velocityWindow: settingsRef.current.velocityWindow,
    });
    sessionRef.current = s;
    playedRef.current = [];
    playedSecondsRef.current = 0;
    lastTickRef.current = null;
    effectsRef.current = [];
    comboRef.current = { count: 0, best: 0 };
    finishedRef.current = false;
    setEvents([]);
    setSummary(s.summary);
    return s;
  }, [score]);

  // Rebuild whenever the score or the scoring mode changes.
  useEffect(() => {
    buildSession();
    const t = transportRef.current;
    t.stop();
    t.duration = score?.duration ?? 0;
    t.loop = settingsRef.current.loop ?? null;
    schedulerRef.current.reset();
    setPlaying(false);
    setWaiting(false);
    setSongTime(0);
    setLastResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, settings.mode, buildSession]);

  useEffect(() => {
    transportRef.current.setRate(settings.rate ?? 1);
  }, [settings.rate]);

  useEffect(() => {
    transportRef.current.loop = settings.loop ?? null;
  }, [settings.loop]);

  /* ------------------------------------------------------------ finishing up */

  const finish = useCallback(
    (persist = true) => {
      const t = transportRef.current;
      const session = sessionRef.current;
      // How far the run actually got, captured before the clock is touched.
      // Everything downstream depends on this: it is what separates a real
      // attempt from an abandoned one.
      const reachedTime = Math.max(0, t.now());
      t.pause();
      releaseEverything();
      setPlaying(false);
      setWaiting(false);
      if (!session || !score) return;

      // Sweep any remaining unplayed notes so the summary is complete.
      session.advanceTo(score.duration + TAIL_SEC);
      const result = session.summary;
      setSummary(result);

      const cfg = settingsRef.current;
      const scored = cfg.mode !== MODES.LISTEN;
      if (!persist || !scored || result.hit + result.wrongNotes === 0) return;

      // How much of the piece actually went past you, accumulated frame by
      // frame — not where the clock finished. Reading the final position let a
      // seek to the last bar count as a complete run: jump to 98%, play one
      // note, and the coverage guard was satisfied by music you never heard.
      const span = cfg.loop ? cfg.loop[1] - cfg.loop[0] : score.duration;
      const coverage = span > 0 ? Math.max(0, Math.min(1, playedSecondsRef.current / span)) : 1;

      const grade = gradeRun(result, { coverage });
      const passages = groupProblems(session, score);
      const variant = score.variant ?? FULL_VARIANT;

      recordSession(score.id, result, session.troubleSpots, {
        mode: cfg.mode,
        rate: cfg.rate,
        /* Whether the touch was corrected for this controller. Recorded rather
           than used: a calibration is a per-person correction, not a different
           arrangement, so it does not split the history — but a maintainer
           comparing dynamics across a year of runs should be able to see where
           the measurement changed. */
        calibrated: !isIdentity(cfg.velocityCurve),
        sectionLabel: cfg.loop ? `${cfg.loop[0].toFixed(1)}s+` : 'full',
        variant,
        coverage,
        stars: grade.complete ? grade.stars : null,
        overall: grade.complete ? grade.overall : null,
      });

      // Where this run struck every note, kept only if it beat the last best —
      // the roll draws it back as a ghost to race on the next attempt.
      if (grade.complete) {
        recordGhost({ songId: score.id, variant, overall: grade.overall }, session.targets);
      }

      // The longest clean streak, kept whether or not the run was complete —
      // unlike a score, a streak you actually played happened, and abandoning
      // the run afterwards does not un-play it.
      recordCombo({ songId: score.id, variant }, comboRef.current.best);

      // Time at the keys, not time with the tab open: the run's own span, taken
      // from the transport rather than the wall clock, so a paused coffee break
      // does not count as practice.
      recordPracticeDay({
        seconds: reachedTime / (cfg.rate || 1),
        complete: grade.complete,
        stars: grade.complete ? grade.stars : 0,
      });

      setLastResult({
        summary: result,
        grade,
        passages,
        /**
         * A copy of what you played, for the report to sound back. Copied
         * rather than referenced: `playedRef` is cleared the moment the next
         * run is built, and the report outlives that by design.
         */
        performance: playedRef.current.map((p) => ({ ...p })),
        variant,
        songId: score.id,
        title: score.title,
        rate: cfg.rate,
        /* Which mode produced this. The report needs it to be honest about
           what the stars above it are worth: a wait-mode run is graded on
           notes and touch alone, scores higher for the same playing, and is
           excluded from the Path entirely. */
        mode: cfg.mode,
        at: Date.now(),
      });
      console.log('[engine] calling onHistoryChanged callback');
      cfg.onHistoryChanged?.();
      console.log('[engine] onHistoryChanged callback completed');
    },
    [score],
  );

  const clearLastResult = useCallback(() => setLastResult(null), []);

  /* ---------------------------------------------------------------- rAF loop */

  useEffect(() => {
    let raf = 0;
    let lastUi = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = transportRef.current;
      const session = sessionRef.current;
      const cfg = settingsRef.current;
      const currentScore = scoreRef.current;
      if (!t.playing || !currentScore) return;

      const now = t.now();

      // Progress that actually passed under the playhead. A jump backwards or
      // forwards contributes nothing, which is what stops a seek counting as
      // having played the music it skipped.
      if (now >= 0) {
        const previous = lastTickRef.current;
        if (previous !== null && now > previous) {
          const step = now - previous;
          if (step < 0.5) playedSecondsRef.current += step;
        }
        lastTickRef.current = now;
      }

      // --- wait mode gating -------------------------------------------------
      // Not until the count-in has finished. The first chord of almost every
      // piece sits at time zero, and the gate opens a few milliseconds early to
      // catch it — which, during a count-in, means freezing the clock just
      // short of zero and leaving the countdown stuck on its last beat forever.
      if (cfg.mode === MODES.WAIT && session && now >= 0) {
        const gate = session.currentGate;
        if (gate && now >= gate.time - 0.008) {
          if (!t.waiting) {
            t.hold();
            releaseEverything();
            setWaiting(true);
          }
        } else if (t.waiting) {
          t.resumeFromHold();
          setWaiting(false);
        }
      }

      // --- a clock that stopped under us ------------------------------------
      // The audio context can be suspended after it started — a backgrounded
      // tab is the common way, a first gesture the browser did not accept is
      // the other. Nothing downstream notices: the scheduler goes on queueing
      // notes onto a stopped clock, and the run plays out in total silence
      // while the transport, the roll and the indicator all look correct.
      // Throttled, because this runs sixty times a second and resuming is
      // asynchronous.
      if (!audio.running) {
        const since = performance.now() - lastResumeRef.current;
        if (since > 1000) {
          lastResumeRef.current = performance.now();
          audio.resume().catch(() => {});
        }
      }

      // --- reference playback ----------------------------------------------
      // Wait mode is the one place this must never sound: the playhead stops on
      // the chord you have to find, and a reference note scheduled a fraction of
      // a second earlier would hand you the answer before you touch a key.
      schedulerRef.current.tick(currentScore.notes, t, referencePlaybackFor(cfg), instrumentFor(cfg));

      // --- metronome --------------------------------------------------------
      // The beat index always advances, even when nothing is sounding, so that
      // switching the metronome on mid-piece doesn't fire a burst of catch-up
      // ticks for every beat that went by while it was off.
      {
        const countingIn = now < 0;
        const audible = (cfg.metronome || countingIn) && !t.waiting;
        const spb = 60 / (currentScore.bpm || 100);
        const beatsPerBar = currentScore.timeSignature?.[0] ?? 4;
        const m = metronomeRef.current;
        while (m.nextBeat * spb < now + 0.12) {
          const when = audio.now + Math.max(0, (m.nextBeat * spb - now) / t.rate);
          // Modulo of a negative beat index still lands on 0 at the bar line,
          // so count-in beats accent correctly without special-casing.
          if (audible) audio.metronomeTick(m.nextBeat % beatsPerBar === 0, when);
          m.nextBeat += 1;
        }
      }

      // --- scoring ----------------------------------------------------------
      // Nothing is judged before the first beat: sweeping for misses during the
      // count-in would mark the whole opening bar missed before you could play it.
      if (session && cfg.mode !== MODES.LISTEN && now >= 0) {
        const misses = session.advanceTo(now);
        if (misses.length) {
          if (cfg.errorCues) audio.errorCue('missed', 0.7);
          pushEvents(misses);
          for (const miss of misses) pushEffect({ midi: miss.midi, type: 'missed', severity: 0.7 });
          comboRef.current.count = 0;
        }
      }

      // --- loop / end -------------------------------------------------------
      if (t.checkLoop()) {
        schedulerRef.current.seek(currentScore.notes, t.now());
        metronomeRef.current.nextBeat = Math.ceil(t.now() / (60 / (currentScore.bpm || 100)));
      } else if (now > currentScore.duration + TAIL_SEC && !finishedRef.current) {
        finishedRef.current = true;
        finish(true);
        return;
      }

      // --- throttled UI refresh --------------------------------------------
      const ms = performance.now();
      if (ms - lastUi > 1000 / UI_HZ) {
        lastUi = ms;
        setSongTime(now);
        if (session && cfg.mode !== MODES.LISTEN) setSummary(session.summary);
      }
    };

    const pushEvents = (batch) => {
      setEvents((prev) => [...batch.reverse(), ...prev].slice(0, MAX_EVENTS));
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  /* ------------------------------------------------------------- flourishes */

  const pushEffect = useCallback((effect) => {
    const list = effectsRef.current;
    list.push({ ...effect, at: performance.now() });
    // A long piece would otherwise accumulate thousands; the canvas only ever
    // looks at the last few hundred milliseconds.
    if (list.length > 48) list.splice(0, list.length - 48);
  }, []);

  const bumpCombo = useCallback((type) => {
    const combo = comboRef.current;
    // A run counts notes played without a *mistake* — right pitch, whether or
    // not it was dead on the beat. Requiring on-time would mean almost nobody
    // ever saw a combo, since the on-time window is ninety milliseconds; timing
    // is already scored on its own, and this is here to reward not fumbling.
    if (type === 'correct' || type === 'timing') {
      combo.count += 1;
      combo.best = Math.max(combo.best, combo.count);
    } else if (type !== 'free') {
      combo.count = 0;
    }
  }, []);

  /* -------------------------------------------------------------- MIDI input */

  useEffect(() => {
    const off = midiInput.onMessage((msg) => {
      const t = transportRef.current;
      const session = sessionRef.current;
      const cfg = settingsRef.current;

      if (msg.type === 'noteon') {
        const midi = playedMidi(cfg, msg.midi);
        // Playing a key is the most natural "I'm ready" signal there is. Some
        // browsers still want a click first, which is what the banner is for.
        if (!audio.running) {
          audio.start().then(() => setAudioRunning(audio.running)).catch(() => {});
        }
        // One correction, computed once, used for the sound, the scoring and
        // the recording of the run — so what you hear, what you are told and
        // what gets played back to you can never disagree about how hard you
        // hit the key.
        const touch = touchOf(cfg, msg.velocity);

        // Always sound what the player pressed — the app must feel like an
        // instrument even when nothing is running.
        const instrument = instrumentFor(cfg);
        if (soundsInput(msg) && (instrument === audio || cfg.forwardInput !== false)) {
          instrument.attack(midi, touch);
        }

        let verdict = { type: 'free', severity: 0 };
        const songT = t.perfToSong(msg.at) - inputLatencySec(cfg);
        // songT < 0 is the count-in: keys sound but nothing is judged, so
        // noodling along to the click cannot cost you anything.
        if (session && t.playing && cfg.mode !== MODES.LISTEN && songT >= 0) {
          const event = session.noteOn(midi, songT, touch);
          verdict = event;
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));

          if (cfg.errorCues && soundsInput(msg)) {
            if (event.type === 'wrong') audio.errorCue(event.kind, event.severity);
            else if (event.type === 'timing' && event.severity > 0.35) audio.errorCue('timing', event.severity);
          }
          playedRef.current.push({
            midi,
            start: songT,
            end: null,
            // Captured so the run can be played back as you actually played
            // it. Without velocity the playback is a uniform mechanical line,
            // which hides the unevenness it exists to reveal.
            velocity: touch,
            type: event.type,
            severity: event.severity ?? 0,
          });
          // Trimming the front of this discards the *start* of the run, which
          // is exactly what "Hear yourself" needs — an imported piece over 800
          // notes played back from somewhere in its middle. The draw loop
          // walks backwards and stops the moment a note is off-screen, so the
          // array's length costs nothing per frame; the cap only bounds
          // memory, and can sit well past any real performance.
          if (playedRef.current.length > MAX_PLAYED) {
            playedRef.current.splice(0, playedRef.current.length - MAX_PLAYED);
          }
        }
        activeInputRef.current.set(midi, {
          at: performance.now(),
          type: verdict.type,
          severity: verdict.severity ?? 0,
        });
        pushEffect({ midi, type: verdict.type, severity: verdict.severity ?? 0 });
        bumpCombo(verdict.type);
      } else if (msg.type === 'noteoff') {
        const midi = playedMidi(cfg, msg.midi);
        const instrument = instrumentFor(cfg);
        if (soundsInput(msg) && (instrument === audio || cfg.forwardInput !== false)) instrument.release(midi);
        activeInputRef.current.delete(midi);
        if (session && t.playing) {
          const songT = t.perfToSong(msg.at) - inputLatencySec(cfg);
          session.noteOff(midi, songT);
          for (let i = playedRef.current.length - 1; i >= 0; i -= 1) {
            if (playedRef.current[i].midi === midi && playedRef.current[i].end === null) {
              playedRef.current[i].end = songT;
              break;
            }
          }
        }
      } else if (msg.type === 'sustain') {
        if (!msg.value) releaseEverything();
      }
    });
    return off;
  }, []);

  /* ----------------------------------------------------------------- actions */

  const ensureAudio = useCallback(async () => {
    // `running`, not `ready`, in all three places here. A booted engine whose
    // clock the browser then suspended satisfies `ready` and makes no sound,
    // and reporting a flat `true` after start() was the same claim in its
    // baldest form.
    if (!audio.running) {
      await audio.start();
      setAudioRunning(audio.running);
    }
    return audio.running;
  }, []);

  const play = useCallback(
    async (from = null) => {
      await ensureAudio();
      const t = transportRef.current;
      const currentScore = scoreRef.current;
      if (!currentScore) return;
      const cfg = settingsRef.current;
      const start = Math.max(0, from ?? (t.now() >= currentScore.duration ? 0 : t.now()));
      if (finishedRef.current || start === 0) buildSession();
      finishedRef.current = false;

      // Count in from the top of the piece or the top of a loop only. Resuming
      // from a pause mid-phrase should pick up where you were, not make you sit
      // through a bar of clicks.
      const spb = 60 / (currentScore.bpm || 100);
      const loopStart = cfg.loop ? cfg.loop[0] : 0;
      const atStart = start === 0 || Math.abs(start - loopStart) < 1e-3;
      const bars = atStart ? (cfg.countInBars ?? 0) : 0;
      const clockStart = start - bars * spb * (currentScore.timeSignature?.[0] ?? 4);

      schedulerRef.current.seek(currentScore.notes, start);
      metronomeRef.current.nextBeat = Math.ceil(clockStart / spb);
      t.start(clockStart);
      setPlaying(true);
      setSongTime(clockStart);
    },
    [buildSession, ensureAudio],
  );

  const pause = useCallback(() => {
    transportRef.current.pause();
    releaseEverything();
    setPlaying(false);
    setWaiting(false);
  }, []);

  const stop = useCallback(() => {
    finish(true);
    transportRef.current.stop();
    setSongTime(transportRef.current.now());
  }, [finish]);

  const restart = useCallback(() => {
    buildSession();
    transportRef.current.stop();
    setSongTime(0);
    play(settingsRef.current.loop ? settingsRef.current.loop[0] : 0);
  }, [buildSession, play]);

  const seek = useCallback((time) => {
    const t = transportRef.current;
    t.seek(time);
    releaseEverything();
    schedulerRef.current.seek(scoreRef.current?.notes ?? [], time);
    metronomeRef.current.nextBeat = Math.ceil(time / (60 / (scoreRef.current?.bpm || 100)));
    // Re-open every target from here on so a rewind can be re-scored.
    const session = sessionRef.current;
    if (session) {
      for (const target of session.targets) {
        if (target.time >= time) {
          target.status = NOTE_STATUS.PENDING;
          target.playedAt = null;
          target.deltaMs = null;
        }
      }
      session.gateIndex = 0;
      session.cursor = time;
    }
    setSongTime(time);
  }, []);

  useEffect(() => () => releaseEverything(), []);

  /** Beats still to go before the piece starts, for the on-screen countdown. */
  const countIn = useMemo(() => {
    if (songTime >= 0 || !score) return null;
    const spb = 60 / (score.bpm || 100);
    return {
      beatsLeft: Math.max(1, Math.ceil(-songTime / spb)),
      beatsPerBar: score.timeSignature?.[0] ?? 4,
    };
  }, [songTime, score]);

  return useMemo(
    () => ({
      playing,
      waiting,
      songTime,
      summary,
      events,
      lastResult,
      clearLastResult,
      countIn,
      audioReady,
      instrument,
      transportRef,
      sessionRef,
      activeInputRef,
      playedRef,
      effectsRef,
      comboRef,
      actions: { play, pause, stop, restart, seek, ensureAudio, resetSession: buildSession },
    }),
    [
      playing, waiting, songTime, summary, events, lastResult, clearLastResult, countIn,
      audioReady, instrument,
      play, pause, stop, restart, seek, ensureAudio, buildSession,
    ],
  );
}
