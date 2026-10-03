import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import Icon from './components/Icon.jsx';
import LiveHud from './components/LiveHud.jsx';
import SetupDialog from './components/SetupDialog.jsx';
import StudioLibrary from './components/StudioLibrary.jsx';
import { setRollTheme } from './lib/rollPaint.js';
import StudioHeader, { StageToolbar } from './components/StudioHeader.jsx';
import GuitarWorkspace from './components/GuitarWorkspace.jsx';
import BowedWorkspace from './components/BowedWorkspace.jsx';
import { instrumentForStudy, instrumentInfo, isStringed, normalizeInstrument, stringKit, studyIdFor } from './lib/instruments.js';
import Controls from './components/Controls.jsx';
import PianoRoll from './components/PianoRoll.jsx';
import Minimap from './components/Minimap.jsx';
const StaffView = lazy(() => import('./components/StaffView.jsx'));
const RollGL = lazy(() => import('./components/RollGL.jsx'));
import FeedbackPanel from './components/FeedbackPanel.jsx';
import PiecePanel from './components/PiecePanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import SongLibrary from './components/SongLibrary.jsx';
import PathTab from './components/PathTab.jsx';
import ProgressTab from './components/ProgressTab.jsx';
import KeyboardPanel from './components/KeyboardPanel.jsx';
import { MODES, usePracticeEngine } from './hooks/usePracticeEngine.js';
import { loadScoreFromFile, loadScoreFromUrl } from './lib/score.js';
import PracticeReport from './components/PracticeReport.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Drawer from './components/Drawer.jsx';
import CalibratorDialogs from './components/CalibratorDialogs.jsx';
import AppModals from './components/AppModals.jsx';
import { useComputerKeyboard } from './hooks/useComputerKeyboard.js';
import { useImports } from './hooks/useImports.js';
import { usePassages } from './hooks/usePassages.js';
import { useKeyboardSetup } from './hooks/useKeyboardSetup.js';
import { usePathData } from './hooks/usePathData.js';
import { useAppData } from './hooks/useAppData.js';
import { NARROW_QUERY, useMediaQuery } from './hooks/useMediaQuery.js';
import { INSTRUMENT_MODES, midiOutput } from './lib/midiOutput.js';
import { arrangeScore, assessFit, FIT_MODES, FULL_VARIANT, HAND_FILTERS } from './lib/arrange.js';
import { AUTO_PROFILE } from './lib/devices.js';
import { emitSyntheticMidi, midiInput, MIDI_STATUS } from './lib/midiInput.js';
import { DRILL_RATE, nextStep, suggestNext } from './lib/coaching.js';
import { drillFrom } from './lib/drills.js';
import { webglAvailable } from './lib/webgl.js';
import { audio } from './lib/audio.js';
import { playInput } from './lib/playInput.js';
import { pianoViewRange } from './lib/instrumentView.js';
import InstrumentControls from './components/InstrumentControls.jsx';
import LearningHome, { LearningSummary } from './components/LearningHome.jsx';
import LessonGuide, { LessonBar } from './components/LessonGuide.jsx';
import { useLearningFlow } from './hooks/useLearningFlow.js';
import { useScorePreview } from './hooks/useScorePreview.js';
import { FIRST_LESSON } from './lib/discovery.js';
import { loadSettings } from './lib/storage.js';
import { DEFAULT_SETTINGS, migrateSettings } from './lib/settings.js';

/**
 * The count-in as beat lamps.
 *
 * `beatsLeft` counts down across the whole count-in, which may be more than one
 * bar; the lamps show position within the bar, because that is what your hands
 * are counting. Lamps behind the beat stay lit so the row fills rather than
 * chases.
 */
function BeatPads({ countIn }) {
  const { beatsLeft, beatsPerBar } = countIn;
  const current = beatsPerBar - 1 - ((beatsLeft - 1) % beatsPerBar);
  return (
    <div className="beat-pads" aria-hidden="true">
      {Array.from({ length: beatsPerBar }, (_, i) => (
        <i key={i} className={i === current ? 'now' : i < current ? 'past' : ''} />
      ))}
    </div>
  );
}

export default function App({ startupSettings = {} }) {
  // Centralized app state (replaces 7 scattered useState calls)
  const appData = useAppData(startupSettings);
  const { settings, setSettings, days, refreshVersion, storageFailure } = appData;
  const instrument = normalizeInstrument(settings.practiceInstrument);
  const stringed = isStringed(instrument);
  const kit = stringKit(instrument);
  const guitar = instrument === 'guitar';
  const studyId = studyIdFor(settings, instrument);
  const theme = settings.theme === 'dark' ? 'dark' : 'light';
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    setRollTheme(theme);
    // Browser chrome (mobile address bar, installed-app title bar) follows the theme.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', theme === 'dark' ? '#0b0b10' : '#f2f0eb'); m.removeAttribute('media'); });
  }, [theme]);
  const [freePlay, setFreePlay] = useState(!!settings.entryFreePlay);
  useEffect(()=>{if(settings.entryFreePlay)setSettings(s=>({...s,entryFreePlay:false}));},[]);
  const [focus, setFocus] = useState(false);
  const [chordInspector, setChordInspector] = useState(null);
  const [sustain, setSustain] = useState(false);
  useEffect(() => midiInput.onMessage(msg => { if (msg.type === 'sustain') { setSustain(msg.value); playInput.sustained = msg.value; } }), []);
  const [setupOpen, setSetupOpen] = useState(false);
  const [requestedTab, setRequestedTab] = useState(null);
  const [libraryInstrument, setLibraryInstrument] = useState(settings.practiceInstrument ?? 'piano');
  useEffect(() => { audio.setInstrumentType(instrument); }, [instrument]);

  // UI state (not data-related, stays local)
  const [library, setLibrary] = useState([]);
  const [rawScore, setRawScore] = useState(null);
  const scoreLoadToken = useRef(0);
  const [midiState, setMidiState] = useState({
    status: MIDI_STATUS.IDLE,
    inputs: [],
    selectedId: null,
    error: null,
  });
  const [outputState, setOutputState] = useState({ outputs: [], selectedId: null });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackOpenRef = useRef(false);
  feedbackOpenRef.current = feedbackOpen;
  // Escape backs out of whatever is layered over the stage, one layer at a
  // time: the This run panel first, then focus mode. The library drawer and the
  // dialogs already handle their own Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]:not([hidden])')) return;
      if (feedbackOpenRef.current) setFeedbackOpen(false);
      else setFocus(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const [calibrating, setCalibrating] = useState(false);
  const [calibratingTouch, setCalibratingTouch] = useState(false);
  const [error, setError] = useState(null);
  const storageProblem = !!storageFailure;
  useEffect(() => { playInput.error = e => setError(`Could not play this note: ${e.message}`); return () => { playInput.clear(); playInput.error = () => {}; }; }, []);
  useEffect(() => { playInput.clear(); }, [instrument, freePlay, settings.renderer, settings.pianoRange, settings.typingOctave]);

  const acceptImportedScore = useCallback(loaded => {
    setRawScore(loaded);
    setSettings(s => ({ ...s, practiceInstrument: 'piano', learningView: 'studio', loop: null }));
  }, [setSettings]);

  const { localScores, loadFile: handleLoadFile, loadSamples: handleLoadSamples } = useImports({
    onError: setError,
    onScoreLoaded: acceptImportedScore,
  });

  /* --------------------------------------------------- storage went wrong */
  useEffect(() => {
    if(!storageFailure)return;
    setError(storageFailure.quota
      ? 'Your browser storage is full, so recent changes could not be saved. Export your saved history from Progress before clearing site data.'
      : 'Your browser is refusing to save changes. This session may not be available after you leave.');
  }, [storageFailure]);

  /**
   * A restore replaces the whole database, so reload settings.
   * appData hook handles day ledger and history refresh automatically via refreshVersion.
   */
  const refreshAfterRestore = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...migrateSettings(loadSettings()), loop: null, startIntent: null, entryFreePlay: false });
    setFreePlay(false);
  }, [setSettings]);

  /* -------------------------------------------------------- bundled library */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}songs/songs.json`);
        if (!res.ok) throw new Error(`songs.json returned ${res.status}`);
        const manifest = await res.json();
        if (cancelled) return;
        setLibrary(manifest.map(entry => ({
          ...entry,
          url: entry.url.startsWith('/songs/')
            ? `${import.meta.env.BASE_URL}songs/${entry.url.slice('/songs/'.length)}`
            : entry.url,
        })));
      } catch (err) {
        setError(
          `Could not load the bundled song library (${err.message}). Reload the page or try again later.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- Web MIDI */
  useEffect(() => {
    const off = midiInput.onDevicesChanged(setMidiState);
    // The same MIDIAccess carries the output ports, which is how note duty gets
    // handed to a plugin like Mini Grand.
    const offAccess = midiInput.onAccess((access) => midiOutput.attach(access));
    const offOut = midiOutput.onChange(setOutputState);
    // Try silently on load; browsers that need a gesture will just report idle.
    midiInput.connect();
    return () => {
      off();
      offAccess();
      offOut();
    };
  }, []);

  // Honour a remembered output port once the ports actually exist.
  useEffect(() => {
    if (settings.midiOutputId && outputState.outputs.some((o) => o.id === settings.midiOutputId)) {
      midiOutput.select(settings.midiOutputId);
    }
  }, [settings.midiOutputId, outputState.outputs]);

  /* ------------------------------------------------------ keyboard geometry */
  /** Set once the engine exists — see the note in useKeyboardSetup. */
  const playingRef = useRef(false);
  const {
    deviceName, autoDetected, profile, keyWindow, setKeyboardLow, shiftOctave, resetOctave,
  } = useKeyboardSetup(midiState, settings.keyboardId, playingRef);

  /* ------------------------------------------------- the score you practise */
  const score = useMemo(
    () =>
      stringed ? kit.studies.find(s => s.id === studyId) : arrangeScore(rawScore, {
        window: keyWindow,
        fit: settings.fit,
        hands: settings.hands,
        transpose: settings.transpose,
      }),
    [stringed, kit, studyId, rawScore, keyWindow, settings.fit, settings.hands, settings.transpose],
  );

  const engineSettings = useMemo(
    () => ({
      ...settings,
      onHistoryChanged: () => {
        // Hook handles history refresh via storage change event listener
        // Nothing to do here anymore—recordSession triggers storage-write event
        // which is detected by useAppData
      },
    }),
    [settings],
  );
  const engine = usePracticeEngine(freePlay ? null : score, engineSettings);
  const stageScore = useMemo(() => freePlay && score ? { ...score, notes: [], noteCount: 0, duration: 0 } : score, [score, freePlay]);
  const stageEngine = freePlay ? { ...engine, sessionRef: { current: null } } : engine;
  const changeWorkspace = value => { learning.leave(); setFreePlay(value); };
  const openSetup = () => { preview.stop(); engine.actions.pause(); setSetupOpen(true); };
  const selectStudy = id => {
    const owner = stringKit(instrumentForStudy(id));
    if (!owner) return;
    engine.actions.pause(); engine.clearLastResult(); setFreePlay(false);
    setSettings(s => ({ ...s, learningView: 'studio', practiceInstrument: owner.id, [owner.studyKey]: id, loop: null }));
  };
  playingRef.current = engine.playing;

  /* --------------------------------- follow the controller's octave buttons */
  /* ---------------------------------------------------------------- history */
  /**
   * Only when it was asked for *and* the machine can do it. Checked here
   * rather than inside the component so a browser without WebGL never even
   * downloads Three.js.
   */
  const useGL = settings.renderer === 'gl' && webglAvailable();

  const variant = score?.variant ?? FULL_VARIANT;
  const history = useMemo(
    () => (score ? appData.getSongHistory(score.id, { variant }) : null),
    [score?.id, variant, refreshVersion, appData],
  );
  const troubleSpots = useMemo(
    () => (score ? appData.getTroubleSpots(score.id) : []),
    [score?.id, refreshVersion, appData],
  );
  const best = useMemo(
    () => appData.getAllBestStars(variant),
    [variant, refreshVersion, appData],
  );
  const starsBySong = best.stars;
  const starRates = best.rates;
  const suggested = useMemo(
    () => stringed ? null : suggestNext(library, starsBySong, score?.id),
    [stringed, library, starsBySong, score?.id],
  );

  const path = usePathData(library, days, refreshVersion, instrument);

  const narrow = useMediaQuery(NARROW_QUERY);

  const rollRange = useMemo(() => {
    if (settings.fit === FIT_MODES.OFF) return null;
    if (!deviceName && settings.keyboardId === AUTO_PROFILE) return null;
    return keyWindow;
  }, [settings.fit, settings.keyboardId, deviceName, keyWindow]);
  const visiblePianoRange = useMemo(() => pianoViewRange(score, settings.pianoRange, settings.typingOctave, rollRange), [score, settings.pianoRange, settings.typingOctave, rollRange]);

  const bestCombo = useMemo(
    () => (score ? appData.getBestCombo?.(score.id, variant) ?? 0 : 0),
    [score?.id, variant, refreshVersion, appData],
  );

  const ghost = useMemo(
    () => (score ? appData.getGhost?.(score.id, variant) : null),
    [score?.id, variant, refreshVersion, appData],
  );
  const assessment = useMemo(
    () => (rawScore ? assessFit(rawScore.range, keyWindow) : null),
    [rawScore, keyWindow],
  );

  /* ----------------------------------------------------------- song loading */
  const pickSong = useCallback(
    async (entry) => {
      const request = ++scoreLoadToken.current;
      try {
        setError(null);
        if (entry.local) {
          const found = localScores.find((s) => s.id === entry.id);
          if (found) setRawScore(found);
          return;
        }
        const loaded = await loadScoreFromUrl(entry.url, { id: entry.id, title: entry.title, key: entry.key, timeSignature: entry.timeSignature, fingering: entry.fingering });
        if (request !== scoreLoadToken.current) return;
        setRawScore({ ...loaded, composer: entry.composer, description: entry.description });
      } catch (err) {
        setError(`Could not load "${entry.title}": ${err.message}`);
      }
    },
    [localScores],
  );

  const selectPianoSong = useCallback(async entry => {
    engine.actions.pause();
    setSettings(s => ({ ...s, learningView: 'studio', practiceInstrument: 'piano', lastPianoId: entry.id, loop: null }));
    setFreePlay(false);
    await pickSong(entry);
  }, [engine.actions, setSettings, pickSong]);

  const changeInstrument = value => {
    if ((settings.practiceInstrument ?? 'piano') === value) return;
    engine.actions.pause();
    engine.clearLastResult();
    setSettings(s => ({ ...s, practiceInstrument: value, learningView: s.learningView === 'lesson' ? 'home' : s.learningView, loop: null }));
  };

  // Open the first bundled piece once the manifest has arrived.
  useEffect(() => {
    if (library.length && !rawScore && settings.learningView !== 'lesson') pickSong(library.find(s => s.id === settings.lastPianoId) ?? library[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  // The drawer is set-up furniture. If a run starts while it is open — easy to
  // do, since Play is reachable by space bar — get it out of the way.
  useEffect(() => {
    if (engine.playing) setLibraryOpen(false);
  }, [engine.playing]);


  /* ----------------------------------------------------------------- actions */
  const previewNote = useCallback(async (midi) => {
    await audio.start();
    emitSyntheticMidi({ type: 'noteon', midi, velocity: 0.75 });
    setTimeout(() => emitSyntheticMidi({ type: 'noteoff', midi, velocity: 0 }), 320);
  }, []);

  const testSound = useCallback(async midi => {
    await audio.start();
    const output = settings.instrumentSource === INSTRUMENT_MODES.EXTERNAL ? midiOutput : audio;
    const dropped = output.notesDropped;
    output.play(midi, 0.32, undefined, 0.75);
    if (output.notesDropped > dropped) throw new Error('The selected sound output could not play the test note.');
  }, [settings.instrumentSource]);

  const prepareLearning = useCallback(() => { scoreLoadToken.current++; setFreePlay(false); setFocus(false); setLibraryOpen(false); }, []);
  const learning = useLearningFlow({ settings, setSettings, library, path, score, engine, onScore: setRawScore, onLeaveFreePlay: prepareLearning, testSound });
  const preview = useScorePreview({ active: learning.homeOpen, instrument, instrumentSource:settings.instrumentSource, midiOutputId:settings.midiOutputId });
  const intentHandled = useRef(false);
  useEffect(()=>{
    const intent=settings.startIntent;
    if(!intent || intentHandled.current || !library.length)return;
    intentHandled.current=true;
    setSettings(s=>({...s,startIntent:null}));
    const id=intent.kind==='quick'?FIRST_LESSON[instrument]:intent.lessonId;
    const entry=learning.entries.find(item=>item.id===id);
    if(!entry){setError('This shared lesson is not in the library. Choose a piece below to get started.');return;}
    if(intent.kind==='quick')learning.startLesson(id,null,{quick:true});
    else if(stringed)selectStudy(id);else selectPianoSong(entry);
  },[settings.startIntent,library.length,learning.entries]);
  const toggleFavorite=id=>setSettings(s=>({...s,favoritePieces:(s.favoritePieces??[]).includes(id)?s.favoritePieces.filter(f=>f!==id):[...(s.favoritePieces??[]),id]}));
  const openProgress=()=>{learning.leave();setLibraryOpen(true);setRequestedTab({id:'progress',at:Date.now()});};
  useEffect(() => { if (learning.active && narrow) setFeedbackOpen(true); }, [learning.active, narrow, learning.record.step]);
  useEffect(() => { if (learning.active && narrow && engine.playing) setFeedbackOpen(false); }, [learning.active, narrow, engine.playing]);

  // Everything to do with picking a stretch of music and hearing, looping or
  // drilling it. One concern, and the place the shared bar-windows live.
  const {
    queuePlay,
    hearPassage,
    hearOrTry,
    toggleLoop,
    practiseSpot,
    hearSpot,
    drillPassage,
    hearReportPassage,
  } = usePassages({ score, settings, setSettings, engine });

  // The QWERTY keyboard is both the piano and the deck's shortcuts.
  useComputerKeyboard({
    disabled: learning.homeOpen,
    guided: learning.active,
    onGuidedPlay: learning.togglePlay,
    freePlay,
    engine,
    settings,
    setSettings,
    score,
    hearOrTry,
    toggleLoop,
    onClose: () => setLibraryOpen(false),
  });


  const runAgain = useCallback(() => {
    engine.clearLastResult();
    engine.actions.restart();
  }, [engine]);

  const applyRate = useCallback(
    (rate) => {
      setSettings((s) => ({ ...s, rate }));
      engine.clearLastResult();
      engine.actions.restart();
    },
    [engine],
  );

  const goToSuggested = useCallback(() => {
    engine.clearLastResult();
    if (suggested) pickSong(suggested);
  }, [engine, pickSong, suggested]);

  const reportStep = useMemo(
    () =>
      engine.lastResult
        ? nextStep({
            grade: engine.lastResult.grade,
            passages: engine.lastResult.passages,
            rate: engine.lastResult.rate,
            nextSong: suggested,
          })
        : null,
    [engine.lastResult, suggested],
  );

  /**
   * Turn the accumulated trouble map into a study. Built from `rawScore` so it
   * goes through the normal fitting pipeline afterwards — folding never moves a
   * note in time, so the recorded trouble timestamps still line up.
   */
  const buildDrill = useCallback(() => {
    const drill = drillFrom(rawScore, troubleSpots);
    if (!drill) {
      setError('Nothing to drill yet — play a run or two first and the trouble spots will build up.');
      return;
    }
    setSettings((s) => ({ ...s, loop: null, rate: DRILL_RATE }));
    setRawScore(drill);
  }, [rawScore, troubleSpots]);

  /**
   * Hear a piece played through without being judged on it. Worth one click
   * rather than three: knowing what something sounds like is most of deciding
   * whether to spend twenty minutes on it.
   */
  const listenTo = useCallback(
    async (entry) => {
      setSettings((s) => ({ ...s, learningView: 'studio', practiceInstrument: 'piano', mode: MODES.LISTEN, loop: null, rate: 1 }));
      setLibraryOpen(false);
      queuePlay(0);
      await pickSong(entry);
    },
    [pickSong, queuePlay],
  );

  /** Back to the piece a drill was cut from, restoring full speed. */
  const leaveDrill = useCallback(() => {
    const parent = rawScore?.drillOf;
    if (!parent) return;
    setSettings((s) => ({ ...s, rate: 1, loop: null }));
    const entry = library.find((song) => song.id === parent.id);
    if (entry) pickSong(entry);
    else {
      const local = localScores.find((s) => s.id === parent.id);
      if (local) setRawScore(local);
    }
  }, [rawScore, library, localScores, pickSong]);

  const clearHistory = useCallback(() => {
    if (!score) return;
    appData.clearSongHistory(score.id);
  }, [score, appData]);

  const startAudio = useCallback(async () => {
    try { await engine.actions.ensureAudio(); } catch (err) { setError(`Could not enable sound: ${err.message}. Open Instrument setup to try again.`); }
  }, [engine.actions]);

  // Sound needs one real click or key press on the page before the browser
  // will let it start. A note from a MIDI controller does not count, which is
  // why playing the keyboard first produced silence: the keys lit up but the
  // audio clock stayed suspended. So the first gesture anywhere in the app —
  // opening the library, a tab, anything — quietly starts the audio engine,
  // and a controller note that arrives before that gets a visible nudge.
  const audioReadyRef = useRef(engine.audioReady);
  audioReadyRef.current = engine.audioReady;
  useEffect(() => {
    const unlock = () => { if (!audio.running) startAudio(); };
    const opts = { capture: true, passive: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    window.addEventListener('touchend', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
      window.removeEventListener('touchend', unlock, opts);
    };
  }, [startAudio]);
  const [soundNudge, setSoundNudge] = useState(false);
  useEffect(() => midiInput.onMessage((msg) => {
    if (msg.type === 'noteon' && !audioReadyRef.current) setSoundNudge(true);
  }), []);
  useEffect(() => { if (engine.audioReady) setSoundNudge(false); }, [engine.audioReady]);

  /**
   * Nothing has been judged yet, so a scoreboard would be six zeroes and three
   * "nothing here" messages. Show the piece instead until there is something
   * real to report — and switch the moment a run starts, not the moment the
   * first note lands, so the panel does not change under you mid-phrase.
   */
  const beforeFirstNote =
    !engine.playing &&
    ((engine.summary?.hit ?? 0) + (engine.summary?.wrongNotes ?? 0) + (engine.summary?.missed ?? 0)) === 0;

  // Only when the piece panel is not carrying the call to action. Play there
  // already starts the audio engine, so showing both is two buttons asking for
  // the same click.
  const showStartBanner = !engine.audioReady && !engine.playing && !beforeFirstNote;

  // Setup chrome recedes while you play. Opacity only — collapsing any of it
  // would reflow the toolbar at the exact moment you are trying to hit a note.
  return (
    <div className={`app studio-app ${stringed ? 'guitar-mode' : 'piano-mode'} ${instrument}-mode ${learning.active ? 'guided-lesson' : ''} ${engine.playing ? 'focused' : ''} ${focus ? 'focus-view' : ''} ${freePlay ? 'free-play' : ''}`}>
      <a className="skip-link" href="#practice-stage">Skip to practice</a>
      <TopBar onLearn={learning.openHome} learningHome={learning.homeOpen} theme={theme} onToggleTheme={() => setSettings(s => ({ ...s, theme: theme === 'light' ? 'dark' : 'light' }))} onSetup={openSetup} onProgress={openProgress}
        midiState={midiState}
        onSelectDevice={(id) => midiInput.select(id)}
        storageProblem={storageProblem}
        onConnectMidi={() => midiInput.connect()}
        audioReady={engine.audioReady}
        audioLabel={engine.instrument}
        onStartAudio={startAudio}
        score={score}
        libraryOpen={libraryOpen}
        onToggleLibrary={() => { if (learning.homeOpen) learning.leave(); setLibraryInstrument(instrument); if (!libraryOpen) setRequestedTab({ id: 'songs', at: Date.now() }); setLibraryOpen((open) => !open); }}
        profile={stringed ? null : profile}
        window={keyWindow}
        onLeaveDrill={leaveDrill}
        latencyMs={settings.inputLatencyMs}
        outputName={
          outputState.outputs.find((o) => o.id === outputState.selectedId)?.name ?? null
        }
      />

      {soundNudge && !engine.audioReady && (
        <div className="sound-nudge" role="alert">
          <Icon name="volume" size={16} />
          <span><strong>Your keyboard is connected, but sound is off.</strong> Browsers need one click on the page before they play audio.</span>
          <button className="primary" onClick={startAudio}>Turn on sound</button>
        </div>
      )}

      {learning.homeOpen ? <LearningHome learning={learning} path={path} storageProblem={storageProblem} instrument={instrument} days={days} settings={settings} setSettings={setSettings} preview={preview} onPick={stringed?entry=>selectStudy(entry.id):selectPianoSong} onFavorite={toggleFavorite} onBackup={openProgress} onInstrument={changeInstrument} onExplore={() => changeWorkspace(true)} onLibrary={() => { learning.leave(); setLibraryInstrument(instrument); setLibraryOpen(true); setRequestedTab({ id: 'songs', at: Date.now() }); }} /> : <div
        className={`app-body ${libraryOpen ? 'library-open' : ''} ${
          feedbackOpen ? 'feedback-open' : ''
        }`}
      >
        <aside
          className="pane left"
          aria-hidden={!libraryOpen}
          inert={!libraryOpen ? '' : undefined}
          aria-label="Library and setup"
        >
          <Drawer onClose={() => setLibraryOpen(false)} requestedTab={requestedTab}
            songs={
              <>
              <StudioLibrary instrument={libraryInstrument} onInstrument={setLibraryInstrument} onPickStudy={selectStudy}
                favorites={settings.favoritePieces ?? []} onFavorite={id => setSettings(s => ({ ...s, favoritePieces: (s.favoritePieces ?? []).includes(id) ? s.favoritePieces.filter(f => f !== id) : [...(s.favoritePieces ?? []), id] }))}
                dailySet={path.set} dailyProgress={path.progress} onPlan={() => setRequestedTab({ id: 'path', at: Date.now() })}
                recentId={isStringed(libraryInstrument) ? studyIdFor(settings, libraryInstrument) : settings.lastPianoId}

                library={library}
                localScores={localScores}
                activeId={score?.id}
                onPick={selectPianoSong}
                onLoadFile={handleLoadFile}
                window={keyWindow}
                starsBySong={starsBySong}
                starRates={starRates}
                suggestedId={suggested?.id}
                onListen={listenTo}
              />
              </>
            }
            path={
              <><LearningSummary learning={learning} state={path.state} onOpen={learning.openHome}/><PathTab guitar={stringed}
                state={path.state}
                set={path.set}
                dailyProgress={path.progress}
                library={stringed ? kit.studies : library}
                days={days}
                goalMinutes={settings.dailyGoalMinutes}
                onGoalChange={(dailyGoalMinutes) => setSettings((s) => ({ ...s, dailyGoalMinutes }))}
                onPick={stringed ? entry => selectStudy(entry.id) : selectPianoSong}
                benchmark={path.benchmark}
                decay={path.decay}
                badges={path.badges}
                streak={path.streak}
              /></>
            }
            progress={
              <><LearningSummary learning={learning} state={path.state} onOpen={learning.openHome}/><ProgressTab onBeginner={learning.openHome}
                days={days}
                goalMinutes={settings.dailyGoalMinutes}
                onGoalChange={(dailyGoalMinutes) => setSettings((s) => ({ ...s, dailyGoalMinutes }))}
                library={stringed ? kit.studies : library}
                starsBySong={starsBySong}
                onPick={stringed ? entry => selectStudy(entry.id) : selectPianoSong}
                onRestored={refreshAfterRestore}
              /></>
            }
            keyboard={
          <KeyboardPanel
            deviceName={deviceName}
            profile={profile}
            profileId={settings.keyboardId}
            onProfileChange={(keyboardId) => setSettings((s) => ({ ...s, keyboardId }))}
            window={keyWindow}
            onShiftOctave={shiftOctave}
            onResetOctave={resetOctave}
            autoDetected={autoDetected}
            fit={settings.fit}
            onFitChange={(fit) => setSettings((s) => ({ ...s, fit }))}
            assessment={assessment}
            latencyMs={settings.inputLatencyMs}
            onCalibrate={() => setCalibrating(true)}
            velocityCurve={settings.velocityCurve}
            onCalibrateTouch={() => setCalibratingTouch(true)}
            instrumentSource={settings.instrumentSource}
            onInstrumentSourceChange={(instrumentSource) =>
              setSettings((s) => ({ ...s, instrumentSource }))
            }
            outputs={outputState.outputs}
            selectedOutputId={outputState.selectedId}
            onSelectOutput={(id) => {
              midiOutput.select(id);
              setSettings((s) => ({ ...s, midiOutputId: id }));
            }}
            forwardInput={settings.forwardInput}
            onForwardInputChange={(forwardInput) => setSettings((s) => ({ ...s, forwardInput }))}
            onLoadSamples={handleLoadSamples}
            pieceRange={rawScore?.range ?? null}
            onMoveWindow={setKeyboardLow}
          />
            }
          />
        </aside>

        {libraryOpen && <div className="scrim" onClick={() => setLibraryOpen(false)} />}

        <main className="pane center">
          <StudioHeader score={score} settings={settings} playing={engine.playing} onInstrumentChange={changeInstrument} freePlay={freePlay} onFreePlay={changeWorkspace} focus={focus} onFocus={() => setFocus(v => !v)} />
          {learning.active ? <LessonBar learning={learning} engine={engine} onShowGuide={narrow ? () => setFeedbackOpen(true) : null}/> : !freePlay && <Controls
            settings={settings}
            setSettings={setSettings}
            engine={engine}
            score={score}
            onShowFeedback={narrow ? () => setFeedbackOpen(true) : null}
            onHearOrTry={hearOrTry}
            onToggleLoop={toggleLoop}
          />}

          <StageToolbar settings={settings} setSettings={setSettings} instrument={instrument} freePlay={freePlay}>
            {!stringed && <InstrumentControls settings={settings} setSettings={setSettings} sustain={sustain} onSustain={value => playInput.sustain(value)} />}
          </StageToolbar>

          {!freePlay && !learning.active && <Minimap theme={theme}
            score={score}
            troubleSpots={troubleSpots}
            loop={settings.loop}
            onLoopChange={loop => setSettings(s => ({ ...s, loop }))}
            engine={engine}
            onSeek={engine.actions.seek}
          />}

          {/* Everything that floats over the notes lives in here, so it is
              positioned against the roll rather than the whole pane — anchoring
              to the pane puts the wait hint on top of the toolbar. */}
          {!freePlay && !stringed && settings.view !== 'roll' && (
            /* Engraving is the most intricate thing here and the only part
               using a third-party renderer. Its own boundary, so a piece
               VexFlow cannot set costs you the stave and not the session. */
            <ErrorBoundary
              fallback={
                <div className="staff-view empty-staff">
                  This piece could not be engraved. The falling notes still work — switch back to Roll.
                </div>
              }
            >
              <Suspense fallback={<div className="staff-view empty-staff">Engraving…</div>}>
                <StaffView score={score} engine={engine} />
              </Suspense>
            </ErrorBoundary>
          )}

          <div id="practice-stage" tabIndex={-1} className={`roll-area ${!freePlay && !stringed && settings.view === 'staff' ? 'hidden-roll' : ''}`}>
          {/* Two renderers, one geometry. rollGeometry.js decides where every
              note belongs and both of these read it, so the GPU roll cannot
              drift away from the canvas one on the thing that matters.

              The canvas roll stays the default and the fallback. It is the one
              that cannot lose a graphics context, the one jsdom can run — so
              the test suite keeps exercising a real renderer — and the one
              that is currently at full feature parity. */}
          {/* The chord and scale explorers go in the side column; on a narrow screen that column is a slide-over that
              free play has no button to open, so there they stay inline under the stage. */}
          {guitar ? <GuitarWorkspace score={stageScore} engine={stageEngine} settings={settings} setSettings={setSettings} freePlay={freePlay} onFreePlay={() => changeWorkspace(true)}
            onStudy={selectStudy}
            inspector={focus || narrow ? null : chordInspector} onError={setError} onContextLost={why => { setSettings(s => ({ ...s, renderer: 'canvas' })); setError(`Switched to 2D Trainer — ${why}.`); }}
          /> : stringed ? <BowedWorkspace key={instrument} instrument={instrument} score={stageScore} engine={stageEngine} settings={settings} setSettings={setSettings} freePlay={freePlay} onFreePlay={() => changeWorkspace(true)}
            onStudy={selectStudy} inspector={focus || narrow ? null : chordInspector}
          /> : useGL ? (
            <Suspense fallback={<div className="roll-gl" />}>
              <RollGL theme={theme}
                score={stageScore}
                engine={stageEngine}
                pixelsPerSecond={settings.pps}
                troubleSpots={troubleSpots}
                range={visiblePianoRange} settings={settings} keyboardHeight={settings.pianoHeight ?? 104}
                labels={settings.noteLabels}
                ghost={ghost}
                bestCombo={bestCombo}
                onSeek={engine.actions.seek}
                onPreviewNote={previewNote}
                onContextLost={(why) => {
                  setSettings((s) => ({ ...s, renderer: 'canvas' }));
                  setError(`Switched back to the 2D view — ${why}.`);
                }}
              />
            </Suspense>
          ) : (
            <PianoRoll
              score={stageScore}
              engine={stageEngine}
              pixelsPerSecond={settings.pps}
              troubleSpots={troubleSpots}
              onSeek={engine.actions.seek}
              onPreviewNote={previewNote}
              range={visiblePianoRange} settings={settings} keyboardHeight={settings.pianoHeight ?? 104}
              labels={settings.noteLabels}
              ghost={ghost}
              bestCombo={bestCombo}
            />
          )}

          {engine.playing && !freePlay && !learning.active && settings.mode !== MODES.LISTEN && !engine.countIn && (
            <LiveHud summary={engine.summary} combo={engine.comboRef?.current?.count ?? 0} waitingMode={settings.mode === MODES.WAIT} />
          )}

          {engine.countIn && (
            <div className="count-in" aria-live="polite">
              <span className="beat">{engine.countIn.beatsLeft}</span>
              {/* The same count, as beat lamps. A number you read is a number
                  you are half a beat behind by the time you have read it; a row
                  of lamps filling left to right you catch out of the corner of
                  your eye while looking at the keys. Both, because the number
                  is what a screen reader gets. */}
              <BeatPads countIn={engine.countIn} />
              <span className="hint">get ready</span>
            </div>
          )}

          {engine.lastResult && !learning.active && (
            <PracticeReport
              result={engine.lastResult}
              previousSessions={(history?.sessions ?? []).slice(0, -1)}
              step={reportStep}
              onDrill={drillPassage}
              onRepeat={runAgain}
              onApplyRate={applyRate}
              onNextSong={goToSuggested}
              onClose={engine.clearLastResult}
              spokenCoaching={settings.spokenCoaching}
              onSpokenCoachingChange={(spokenCoaching) =>
                setSettings((s) => ({ ...s, spokenCoaching }))
              }
              /* The arranged score, so "against the score" compares your run
                 with the notes you were actually asked to play — folded,
                 transposed and hand-filtered exactly as the roll showed them. */
              scoreNotes={score?.notes ?? []}
              onHearPassage={hearReportPassage}
            />
          )}

          {engine.waiting && settings.mode === MODES.WAIT && (
            <div className="wait-hint">
              waiting for{' '}
              {(engine.sessionRef.current?.currentGate?.notes ?? [])
                .filter((n) => n.status === 'pending')
                .map((n) => n.name)
                .join(' + ') || '…'}
            </div>
          )}

          {showStartBanner && !learning.active && (
            <div className="roll-overlay">
              <div className="banner">
                <h3>Ready when you are</h3>
                <p>
                  Browsers need one click before they'll make sound. Hit start, then press ▶ Play (or the space bar)
                  and follow the falling notes.
                </p>
                <button className="primary" onClick={startAudio}>
                  Start audio engine
                </button>
              </div>
            </div>
          )}
          </div>
          <footer className="studio-footer"><span><i />{guitar ? `Standard tuning · ${settings.guitarFrets ?? 12} frets` : stringed ? `${kit.label} · ${instrumentInfo(instrument).detail}` : 'Your music. Your pace.'}</span>{freePlay ? <span>Explore freely · no score recorded</span> : learning.active ? <span><kbd>Space</kbd> play / pause · Your lesson is saved automatically</span> : <span><kbd>Space</kbd> play / pause <span className="footer-detail">· <kbd>1</kbd> listen <kbd>2</kbd> practice <kbd>3</kbd> wait</span></span>}</footer>
        </main>

        {feedbackOpen && narrow && (
          <div className="scrim feedback-scrim" onClick={() => setFeedbackOpen(false)} />
        )}

        <aside className="pane right" aria-label={learning.active ? 'Lesson guide' : 'This run'}>
          {narrow && <button className="close-feedback" onClick={() => setFeedbackOpen(false)} aria-label={learning.active ? 'Close lesson guide' : 'Close this run panel'}><Icon name="close" size={14} /> Close</button>}
          {learning.active ? <LessonGuide learning={learning} engine={engine} score={score} instrument={instrument} onSetup={openSetup} path={path}/> : freePlay && stringed ? <div ref={setChordInspector} className="chord-inspector"/> : freePlay ? <div className="section free-play-coach"><span className="eyebrow">NO SCORE. JUST SOUND.</span><h2>Follow your curiosity.</h2><p>Play a few notes, find a chord you like, and make it your own.</p><div className="free-play-tip">{guitar ? 'Choose a chord below the fretboard, then strum. The numbered dots show which fingers to use.' : 'Click the keys or play your MIDI controller. A–J on your computer keyboard covers the middle-C octave.'}</div><button onClick={openSetup}>Check instrument setup</button><p className="hint">Free play is not graded and does not add practice results.</p></div> : beforeFirstNote ? (
            <>
              <PiecePanel
                score={score}
                history={history}
                assessment={stringed ? null : assessment}
                mode={settings.mode} rate={settings.rate} loop={settings.loop} onHear={hearOrTry} onWait={() => setSettings(s => ({ ...s, mode: MODES.WAIT }))}
                bestStars={score ? (starsBySong[score.id] ?? 0) : 0}
                bestStarsRate={score ? (starRates[score.id] ?? 1) : 1}
                audioReady={engine.audioReady}
                onPlay={() => engine.actions.play()}
                onLeaveDrill={leaveDrill}
                playing={engine.playing}
              />
              {/* Show if current variant has sessions, OR if there's any history in other variants.
                  This ensures the "Show runs in other arrangements" button is reachable. */}
              {((history?.sessions?.length ?? 0) > 0 || (appData.getSongHistory(score?.id)?.sessions?.length ?? 0) > 0) && score && (
                <HistoryPanel
                  history={history}
                  songId={score?.id}
                  troubleSpots={troubleSpots}
                  onPractiseSpot={practiseSpot}
                  onHearSpot={hearSpot}
                  onClear={clearHistory}
                  onBuildDrill={stringed ? null : buildDrill}
                />
              )}
            </>
          ) : (
            <>
              <FeedbackPanel playing={engine.playing} summary={engine.summary} events={engine.events} score={score} listening={settings.mode === MODES.LISTEN} waitingMode={settings.mode === MODES.WAIT} />
              {/* Show if current variant has sessions, OR if there's any history in other variants. */}
              {((history?.sessions?.length ?? 0) > 0 || (appData.getSongHistory(score?.id)?.sessions?.length ?? 0) > 0) && score && (
                <HistoryPanel
                  history={history}
                  songId={score?.id}
                  troubleSpots={troubleSpots}
                  onPractiseSpot={practiseSpot}
                  onHearSpot={hearSpot}
                  onClear={clearHistory}
                  onBuildDrill={stringed ? null : buildDrill}
                />
              )}
            </>
          )}
        </aside>
      </div>}

      {setupOpen && <SetupDialog settings={settings} setSettings={setSettings} midiState={midiState} audioReady={engine.audioReady} audioLabel={engine.instrument} onTest={testSound} onClose={() => setSetupOpen(false)} onAdvanced={() => { setSetupOpen(false); setLibraryOpen(true); setRequestedTab({ id: 'keyboard', at: Date.now() }); }} />}
      <AppModals
        practiceInstrument={settings.practiceInstrument}
        onInstrumentChange={changeInstrument}
        onSetup={() => { setSettings(s => ({ ...s, onboarded: true })); openSetup(); }}
        showFirstRun={!settings.onboarded && library.length > 0}
        onBeginner={learning.openHome}
        onFirstRunDone={() => setSettings((s) => ({ ...s, onboarded: true }))}
        midiState={midiState}
        profile={profile}
        keyWindow={keyWindow}
        onConnectMidi={() => midiInput.connect()}
        isDev={import.meta.env.DEV}
        error={error}
        onErrorClose={() => setError(null)}
      />

      <CalibratorDialogs
        calibrating={calibrating}
        onCloseCalibrateLatency={() => setCalibrating(false)}
        onApplyCalibrateLatency={(inputLatencyMs) => {
          setSettings((s) => ({ ...s, inputLatencyMs }));
          setCalibrating(false);
        }}
        latencyMs={settings.inputLatencyMs}
        calibratingTouch={calibratingTouch}
        onCalibrateTouchClose={() => setCalibratingTouch(false)}
        onCalibrateTouchApply={(velocityCurve) => {
          setSettings((s) => ({ ...s, velocityCurve }));
          setCalibratingTouch(false);
        }}
        velocityCurve={settings.velocityCurve}
      />
    </div>
  );
}
