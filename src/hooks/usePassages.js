import { useCallback, useEffect, useRef } from 'react';
import { MODES } from './usePracticeEngine.js';
import { secondsPerBar } from '../lib/passages.js';

/**
 * usePassages — choosing a stretch of music and doing something to it.
 *
 * Hearing a passage, playing it, looping it, drilling it: one concern with one
 * shared idea underneath, which is that the *same* bars have to be involved
 * whichever of those you asked for. A reference that stopped somewhere other
 * than the attempt would be worse than no reference, so the two windows —
 * `spotWindow` for a trouble spot, `passageWindow` for bars the report has
 * already worked out — are defined once here and every action goes through
 * them.
 *
 * Extracted from App for the 800-line ceiling this project sets itself, which
 * App had just been pushed past by adding all of this to it. Same seam as
 * useImports and useKeyboardSetup: nothing in here touches the library, the
 * MIDI ports or the Path.
 *
 * @param {object} deps {score, settings, setSettings, engine}
 */
export function usePassages({ score, settings, setSettings, engine }) {
  /**
   * A song time that should start playing once the engine has settled, or null.
   *
   * Both loading a score and changing the mode rebuild the practice session and
   * stop the transport, so calling play() in the same tick gets undone a moment
   * later. Anything that wants to switch mode *and* start playing has to leave
   * the request here and let the effect below pick it up afterwards.
   */
  const pendingPlay = useRef(null);

  /** Ask for playback once the engine has finished rebuilding. */
  const queuePlay = useCallback((from) => {
    pendingPlay.current = from;
  }, []);

  // The score arrives a tick after pickSong resolves, and a mode change rebuilds
  // the session — either way the transport has just been stopped, so playback
  // waits until the engine is actually holding what we asked for.
  useEffect(() => {
    if (pendingPlay.current === null || !score) return;
    const from = pendingPlay.current;
    pendingPlay.current = null;
    engine.actions.play(from);
  }, [score, settings.mode, engine.actions]);

  /**
   * Hear a passage, on a loop, without being judged on it.
   *
   * The gap this fills: Listen mode played the whole piece from the top and
   * cleared any loop on the way in, so there was no way to hear the one bar you
   * keep failing — the thing you most want to hear. Getting there by hand meant
   * setting a loop, switching mode, pressing play, and switching back, which
   * nothing in the interface suggested.
   *
   * The rate is deliberately left alone. Whatever speed you are working at is
   * the speed you are about to attempt this at, and a reference that arrives
   * faster than the attempt teaches the wrong thing.
   */
  const hearPassage = useCallback(
    (from, to) => {
      // `to` of null means the whole piece: hear it through rather than putting
      // it on repeat, which is what "hear this" should do when nothing is looped.
      setSettings((s) => ({ ...s, mode: MODES.LISTEN, loop: to === null ? null : [from, to] }));
      pendingPlay.current = from;
    },
    [setSettings],
  );

  /** The other half of it: now play the thing you just heard. */
  const tryLoop = useCallback(() => {
    setSettings((s) => ({ ...s, mode: MODES.PRACTICE }));
    pendingPlay.current = settings.loop ? settings.loop[0] : 0;
  }, [settings.loop, setSettings]);

  /** Hear whichever half you are not in. Shared by the pad and the `\` key. */
  const hearOrTry = useCallback(() => {
    if (settings.mode === MODES.LISTEN) tryLoop();
    else if (settings.loop) hearPassage(settings.loop[0], settings.loop[1]);
    else hearPassage(0, null);
  }, [settings.mode, settings.loop, hearPassage, tryLoop]);

  /**
   * Four bars from wherever the playhead is, or off again.
   *
   * Lifted out of Controls so the pad and the `[` key run the same code. It
   * was also computing seconds-per-bar inline, a third copy of what
   * `secondsPerBar` already does.
   */
  const toggleLoop = useCallback(() => {
    if (settings.loop) {
      setSettings((s) => ({ ...s, loop: null }));
      return;
    }
    if (!score?.duration) return;
    const bar = secondsPerBar(score);
    const lastBar = Math.max(0, Math.ceil(score.duration / bar) - 1);
    const from = Math.min(lastBar, Math.max(0, Math.floor(engine.songTime / bar))) * bar;
    const to = Math.min(score.duration, from + bar * 4);
    setSettings((s) => ({ ...s, loop: [from, to] }));
  }, [settings.loop, engine.songTime, score, setSettings]);

  /**
   * The loop a trouble spot deserves: half a bar of run-up, four bars long.
   * Shared so that hearing a spot and practising it cover exactly the same
   * music — a reference that stopped somewhere other than the attempt would be
   * worse than no reference.
   */
  const spotWindow = useCallback(
    (time) => {
      const barSec = secondsPerBar(score);
      const from = Math.max(0, time - barSec * 0.5);
      return [from, from + barSec * 4];
    },
    [score],
  );

  /** The same, for a passage the report has already worked out the bars of. */
  const passageWindow = useCallback(
    (passage) => {
      const barSec = secondsPerBar(score);
      return [
        Math.max(0, passage.fromTime - barSec * 0.25),
        Math.min(score?.duration ?? passage.toTime, passage.toTime + barSec * 0.25),
      ];
    },
    [score],
  );

  const practiseSpot = useCallback(
    (time) => {
      const [from, to] = spotWindow(time);
      setSettings((s) => ({ ...s, loop: [from, to] }));
      engine.actions.seek(from);
    },
    [engine.actions, spotWindow, setSettings],
  );

  const hearSpot = useCallback(
    (time) => hearPassage(...spotWindow(time)),
    [hearPassage, spotWindow],
  );

  /**
   * Drill a passage from the report: loop exactly those bars, optionally slow
   * down, dismiss the report and start playing. One click has to be enough —
   * asking someone to set a loop and a tempo by hand is how good advice gets
   * ignored.
   */
  const drillPassage = useCallback(
    (passage, rate) => {
      const [from, to] = passageWindow(passage);
      setSettings((s) => ({ ...s, loop: [from, to], ...(rate ? { rate } : {}) }));
      engine.clearLastResult();
      engine.actions.play(from);
    },
    [engine, passageWindow, setSettings],
  );

  /** Hear the passage the report is pointing at, before drilling it. */
  const hearReportPassage = useCallback(
    (passage) => {
      engine.clearLastResult();
      hearPassage(...passageWindow(passage));
    },
    [engine, hearPassage, passageWindow],
  );

  return {
    queuePlay,
    hearPassage,
    tryLoop,
    hearOrTry,
    toggleLoop,
    practiseSpot,
    hearSpot,
    drillPassage,
    hearReportPassage,
  };
}
