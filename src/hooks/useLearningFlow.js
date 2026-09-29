import { useCallback, useEffect, useRef, useState } from 'react';
import { isStringed, normalizeInstrument, stringKit } from '../lib/instruments.js';
import { loadScoreFromUrl } from '../lib/score.js';
import { midiInput } from '../lib/midiInput.js';
import { dayKey } from '../lib/streaks.js';
import { webglAvailable } from '../lib/webgl.js';
import { learningRecord, lessonSettings, recommendedLesson, lessonOutcome, comfortableRate, lessonCanVisit } from '../lib/learning.js';

const scores = new Map();
function loadLesson(entry) {
  if (isStringed(entry.instrument)) return Promise.resolve(entry);
  if (!scores.has(entry.id)) scores.set(entry.id, loadScoreFromUrl(entry.url, entry)
    .then(score => ({ ...score, composer: entry.composer, description: entry.description }))
    .catch(error => { scores.delete(entry.id); throw error; }));
  return scores.get(entry.id);
}

/** Orchestrates the existing transport and matcher. Guided completion is kept
 * separately from engine grades; it can never award stars or unlock a gate. */
export function useLearningFlow({ settings, setSettings, library, path, score, engine, onScore, onLeaveFreePlay, testSound }) {
  const instrument = normalizeInstrument(settings.practiceInstrument);
  const kit = stringKit(instrument);
  const entries = kit ? kit.studies : library;
  const record = learningRecord(settings.learning?.[instrument]);
  const recommendedId = recommendedLesson(path.state);
  const lesson = entries.find(e => e.id === record.lessonId) ?? entries.find(e => e.id === recommendedId);
  const active = settings.learningView === 'lesson';
  const homeOpen = settings.learningView === 'home';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [testSent, setTestSent] = useState(false);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [noteHint, setNoteHint] = useState('');
  const handledResult = useRef(null);
  const wasPlaying = useRef(false);
  const generation = useRef(0);
  const startingRef = useRef(false);
  const latest = useRef(null);
  latest.current = { engine, record, score, lesson, settings, testSound };

  const update = useCallback(patch => setSettings(s => {
    const previous = learningRecord(s.learning?.[instrument]);
    return { ...s, learning: { ...s.learning, [instrument]: { ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) } } };
  }), [instrument, setSettings]);

  const halt = useCallback(() => {
    latest.current.engine.actions.pause();
    latest.current.engine.clearLastResult();
  }, []);
  const leave = useCallback(() => {
    generation.current++;
    halt();
    setSettings(s => ({ ...s, learningView: 'studio' }));
  }, [halt, setSettings]);
  const openHome = useCallback(() => {
    generation.current++;
    halt();
    onLeaveFreePlay();
    setSettings(s => ({ ...s, learningView: 'home', onboarded: true }));
  }, [halt, onLeaveFreePlay, setSettings]);

  const startLesson = useCallback((id, daily = null, options = {}) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    halt(); onLeaveFreePlay(); setError(null);
    const old = latest.current.record;
    const resume = old.lessonId === id && !daily && !options.quick;
    const step = options.quick ? 'note' : resume ? old.step : old.soundConfirmed ? 'listen' : 'sound';
    const next = resume ? { ...old, daily: old.daily?.day === dayKey() ? old.daily : null } : {
      lessonId: id, step, rate: .65, completed: old.completed,
      soundConfirmed: !!old.soundConfirmed, firstNoteDone: !!old.soundConfirmed,
      listened: false, followed: false, practised: false, daily, quick: !!options.quick,
    };
    setSettings(s => ({ ...s, ...lessonSettings(step, next.rate), learningView: 'lesson', onboarded: true,
      lastPianoId: instrument === 'piano' ? id : s.lastPianoId,
      ...(kit ? { [kit.studyKey]: id } : {}),
      learning: { ...s.learning, [instrument]: next },
    }));
  }, [entries, instrument, kit, halt, onLeaveFreePlay, setSettings]);

  // An explicit loading boundary prevents starting the previous piece while
  // the next score is downloading. Cancellation protects instrument switches.
  useEffect(() => {
    if (!active || !lesson) return;
    const token = ++generation.current;
    let cancelled = false;
    setLoading(true); setError(null); setTestSent(false); setNoteHint('');
    halt();
    const stageAsset = settings.renderer === 'gl' && webglAvailable() && !kit?.bowed
      ? instrument === 'guitar' ? import('../components/GuitarStage.jsx') : import('../components/RollGL.jsx')
      : Promise.resolve();
    Promise.all([loadLesson(lesson), stageAsset]).then(([loaded]) => {
      if (cancelled || token !== generation.current) return;
      if (instrument === 'piano') onScore(loaded);
      setSettings(s => ({ ...s, ...lessonSettings(latest.current.record.step, latest.current.record.rate),
        ...(kit ? { [kit.studyKey]: lesson.id } : {}) }));
      setLoading(false);
    }).catch(err => {
      if (cancelled || token !== generation.current) return;
      setLoading(false); setError(`The lesson could not load. ${err.message}`);
    });
    return () => { cancelled = true; if (token === generation.current) generation.current++; };
  }, [active, lesson?.id, instrument, kit, settings.renderer, retry, halt, onScore, setSettings]);

  // Cache the next authored exercise without changing the live score or clock.
  useEffect(() => {
    if (!active || loading || !lesson) return;
    const ids = path.state.stages.flatMap(s => s.exercises);
    const next = entries.find(e => e.id === ids[ids.indexOf(lesson.id) + 1]);
    if (next) loadLesson(next).catch(() => {});
  }, [active, loading, lesson?.id, entries, path.state]);

  const ready = active && !loading && !error && score?.id === lesson?.id;
  const goStep = useCallback(step => {
    const current = latest.current.record;
    if (!lessonCanVisit(step, current)) return;
    generation.current++;
    halt(); wasPlaying.current = false;
    setError(null); setNoteHint('');
    update({ step });
    setSettings(s => ({ ...s, ...lessonSettings(step, current.rate) }));
    latest.current.engine.actions.seek(0);
    latest.current.engine.actions.resetSession();
  }, [halt, update, setSettings]);

  useEffect(() => {
    if (!ready || record.step !== 'note') return;
    return midiInput.onMessage(message => {
      if (message.type !== 'noteon' || message.velocity <= 0) return;
      const first = latest.current.score?.notes[0];
      if (message.midi + (latest.current.settings.inputTranspose ?? 0) !== first?.midi) { setNoteHint(`You played a different note. Look for ${first?.name}. Take your time.`); return; }
      const nextStep = latest.current.record.quick ? 'follow' : 'listen';
      update({ firstNoteDone: true, step: nextStep });
      setSettings(s => ({ ...s, ...lessonSettings(nextStep, latest.current.record.rate) }));
      setNoteHint(`You found ${first.name}. ${nextStep==='follow'?'Now bring the notes together.':'Now listen to the short phrase.'}`);
    });
  }, [ready, record.step, update, setSettings]);

  useEffect(() => {
    if (!active || !engine.lastResult || engine.lastResult.songId !== lesson?.id) return;
    const result = engine.lastResult;
    if (handledResult.current === result) return;
    handledResult.current = result;
    if (!result.grade.complete) return;
    update(old => ({
      ...(result.mode === 'wait' ? { followed: true } : { practised: true }),
      completed: { ...old.completed, [lesson.id]: {
        ...old.completed[lesson.id], guided: old.completed[lesson.id]?.guided || result.mode === 'wait',
        comfortableRate: Math.max(old.completed[lesson.id]?.comfortableRate ?? 0,
          result.mode !== 'wait' && result.grade.stars >= 3 ? result.rate : 0),
      } },
    }));
  }, [active, engine.lastResult, lesson?.id, update]);

  useEffect(() => {
    if (!ready) { wasPlaying.current = false; return; }
    if (wasPlaying.current && !engine.playing && record.step === 'listen' && engine.transportRef.current.now() >= score.duration) update({ listened: true });
    wasPlaying.current = engine.playing;
  }, [ready, engine.playing, engine.songTime, record.step, score?.duration, update]);

  const togglePlay = async (restart = false) => {
    if (!ready || startingRef.current || ['sound', 'note'].includes(record.step)) return;
    if (engine.playing && !restart) { engine.actions.pause(); return; }
    const token = generation.current;
    startingRef.current = true; setStarting(true);
    try {
      await engine.actions.ensureAudio();
      if (token !== generation.current || latest.current.settings.learningView !== 'lesson') return;
      engine.clearLastResult(); await engine.actions.play(restart ? 0 : null);
    } catch (err) { if (token === generation.current) setError(`Sound could not start. ${err.message}`); }
    finally { startingRef.current = false; setStarting(false); }
  };
  const changeRate = value => {
    if (engine.playing) return;
    const rate = Math.max(.4, Math.min(1, Math.round(value * 100) / 100));
    engine.clearLastResult(); update({ rate });
    if (record.step === 'practice' || record.step === 'follow') setSettings(s => ({ ...s, rate }));
  };
  const sendTest = async () => {
    if (!ready) return;
    const token = generation.current;
    setTesting(true); setTestSent(false);
    try { await testSound(score.notes[0]?.midi ?? 60); if (generation.current === token) setTestSent(true); }
    catch (err) { if (generation.current === token) setNoteHint(`Could not send the test note. ${err.message}`); }
    finally { setTesting(false); }
  };
  useEffect(() => { setTestSent(false); }, [settings.instrumentSource, settings.midiOutputId, instrument]);
  const confirmSound = () => {
    if (!testSent) return;
    update({ soundConfirmed: true, step: 'note' }); setTestSent(false);
  };
  const dailyItems = path.set.length ? path.set : recommendedId ? [{ songId: recommendedId, kind: 'work', label: entries.find(e => e.id === recommendedId)?.title }] : [];
  const startDaily = (size = 'full') => {
    const items = size==='short' ? [dailyItems.find(item=>item.kind==='work') ?? dailyItems[0]] : dailyItems;
    const ids = items.filter(Boolean).map(item => item.songId).filter(id => entries.some(e => e.id === id));
    if (ids.length) startLesson(ids[0], { ids, index: 0, day: dayKey(), complete: false });
  };
  const finishDailyItem = () => {
    if (!record.followed || !record.daily || record.daily.day !== dayKey()) return;
    const daily = record.daily;
    if (daily.index + 1 < daily.ids.length) startLesson(daily.ids[daily.index + 1], { ...daily, index: daily.index + 1 });
    else { update({ daily: { ...daily, complete: true } }); openHome(); }
  };
  const finishQuick = () => {
    if(!record.followed)return;
    update({quick:false,step:'practice'});openHome();
  };
  return { active, homeOpen, record, lesson, entries, recommendedId, ready, loading, error, retry: () => setRetry(v => v + 1),
    startLesson, leave, openHome, goStep, togglePlay, changeRate, nextRate: comfortableRate(record.rate),
    testSent, testing, starting, sendTest, confirmSound, noteHint, outcome: engine.lastResult ? lessonOutcome(engine.lastResult) : null,
    dailyItems, startDaily, finishDailyItem, finishQuick,
  };
}
