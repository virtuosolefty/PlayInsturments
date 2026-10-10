import { useCallback, useEffect, useRef } from 'react';
import { MODES } from './usePracticeEngine.js';
import { playInput } from '../lib/playInput.js';
import { emitSyntheticMidi, KEYBOARD_MAP } from '../lib/midiInput.js';
import { secondsPerBar } from '../lib/passages.js';
import { ACTIONS, nextRate, shortcutFor } from '../lib/shortcuts.js';
import { DRUM_KEYS } from '../lib/drums.js';

/**
 * useComputerKeyboard — the QWERTY keyboard doing two jobs at once.
 *
 * It is the piano when you have no controller plugged in, and it drives the
 * deck so you never have to reach for a mouse with both hands on the keys.
 * Those are one listener rather than two on purpose: the same keypress has to
 * be offered to the shortcut map first and fall through to note input only if
 * nothing claimed it, and two independent listeners racing for that decision
 * is how a key ends up doing both.
 *
 * Extracted from App for the 800-line ceiling this project sets itself.
 *
 * @param {object} deps {engine, settings, setSettings, score, hearOrTry,
 *   toggleLoop, onClose}
 */
export function useComputerKeyboard({
  engine,
  settings,
  setSettings,
  score,
  hearOrTry,
  toggleLoop,
  onClose,
  freePlay = false,
  guided = false,
  disabled = false,
  onGuidedPlay,
}) {
  /**
   * How to carry out a shortcut, held in a ref.
   *
   * The listener below also carries note input, so it has to stay subscribed
   * for the whole session rather than being torn down and rebuilt every time a
   * setting changes. Reading the handler out of a ref at event time is what
   * lets the listener be registered once while the actions it runs stay
   * current.
   */
  const inputSettings = useRef(settings); inputSettings.current = settings;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const runShortcutRef = useRef(() => {});

  /**
   * Every branch calls the same function the corresponding control does, so a
   * key and a click can never drift apart — which is why `toggleLoop` and
   * `hearOrTry` were lifted out of Controls rather than reimplemented here.
   *
   * Restart is deliberately unbound: it throws the run's score away, and an
   * action you cannot undo should cost a click you meant to make.
   */
  const runShortcut = useCallback(
    (action) => {
      if (disabled) return;
      if (guided && action !== ACTIONS.CLOSE) {
        if (action === ACTIONS.PLAY_PAUSE) onGuidedPlay?.();
        return;
      }
      if (freePlay && action !== ACTIONS.CLOSE) return;
      switch (action) {
        case ACTIONS.CLOSE:
          onClose();
          break;
        case ACTIONS.PLAY_PAUSE:
          if (engine.playing) engine.actions.pause();
          else engine.actions.play();
          break;
        case ACTIONS.STOP:
          if (engine.playing) engine.actions.stop();
          break;
        case ACTIONS.HEAR:
          hearOrTry();
          break;
        case ACTIONS.LOOP:
          toggleLoop();
          break;
        case ACTIONS.METRONOME:
          setSettings((s) => ({ ...s, metronome: !s.metronome }));
          break;
        case ACTIONS.MODE_LISTEN:
          setSettings((s) => ({ ...s, mode: MODES.LISTEN }));
          break;
        case ACTIONS.MODE_PRACTICE:
          setSettings((s) => ({ ...s, mode: MODES.PRACTICE }));
          break;
        case ACTIONS.MODE_WAIT:
          setSettings((s) => ({ ...s, mode: MODES.WAIT }));
          break;
        // A bar at a time rather than a fixed number of seconds: you navigate
        // this music in bars, and at 60bpm a "five second" jump is a different
        // distance than it is at 140.
        case ACTIONS.SEEK_BACK:
          engine.actions.seek(Math.max(0, engine.songTime - secondsPerBar(score)));
          break;
        case ACTIONS.SEEK_FORWARD:
          engine.actions.seek(
            Math.min(score?.duration ?? 0, engine.songTime + secondsPerBar(score)),
          );
          break;
        case ACTIONS.FASTER:
          setSettings((s) => ({ ...s, rate: nextRate(s.rate, 1) }));
          break;
        case ACTIONS.SLOWER:
          setSettings((s) => ({ ...s, rate: nextRate(s.rate, -1) }));
          break;
        default:
          break;
      }
    },
    [engine, hearOrTry, toggleLoop, score, setSettings, onClose, freePlay, guided, disabled, onGuidedPlay],
  );
  runShortcutRef.current = runShortcut;

  useEffect(() => {
    const down = new Map();
    const onKeyDown = (e) => {
      if (disabledRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Space and Enter activate the focused UI control before global transport.
      if ((e.code === 'Space' || e.key === 'Enter') && e.target.closest?.('button, summary, a')) return;
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement || e.target.isContentEditable;
      if (typing) return;

      // The handler is on `window`, so without asking this a "2" pressed while
      // reading the practice report would switch the mode underneath it.
      const dialogOpen = !!document.querySelector('[role="dialog"]');
      const action = shortcutFor(e, { dialogOpen, typing });
      if (action) {
        e.preventDefault();
        runShortcutRef.current(action);
        return;
      }

      if (dialogOpen || e.target.closest?.('[data-instrument-navigation]')) return;
      // On the drums a letter is the drum it starts (K for kick); elsewhere the keys are a piano.
      const drums=inputSettings.current.practiceInstrument==='drums';
      const key=e.key.toLowerCase(), base=(drums?DRUM_KEYS:KEYBOARD_MAP)[key];
      if(base===undefined||down.has(key))return;
      const midi=drums?base:base+(inputSettings.current.typingOctave??0)*12;
      down.set(key,midi); playInput.press('typing-'+key,midi,inputSettings.current.playVelocity??0.72,{source:'typing'});
    };
    const onKeyUp = e => { const key=e.key.toLowerCase(); if(!down.has(key))return; down.delete(key);playInput.release('typing-'+key); };
    const silence = () => {down.clear();playInput.clear();};
    window.addEventListener('blur',silence);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur',silence);silence();
    };
  }, []);
}
