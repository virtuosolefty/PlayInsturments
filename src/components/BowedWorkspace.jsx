import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BowCard from './BowCard.jsx';
import BowedStage from './BowedStage.jsx';
import StringTab from './StringTab.jsx';
import StudyOptions from './StudyOptions.jsx';
import Icon from './Icon.jsx';
import TypeSwitch from './TypeSwitch.jsx';
import { bowedReach } from '../lib/bowed.js';
import { stringKit } from '../lib/instruments.js';
import { noteInstruction } from '../lib/learning.js';
import { normalizeStageQuality, STAGE_TIERS } from '../lib/stage/quality.js';
import { stageTierHere, webglAvailable } from '../lib/webgl.js';
import { STAGE_THEME } from '../lib/stageColors.js';
import { useStringInput } from '../hooks/useGuitarInput.js';

const BowedStage3D = lazy(() => import('./BowedStage3D.jsx'));

/**
 * The violin and cello studio: finger chart, fingerboard and scale explorer.
 *
 * On the 3D Stage at full detail the instrument is the downloaded model
 * (BowedStage3D.jsx); otherwise, and whenever the model or the graphics give
 * out, it is the 2D fingerboard (BowedStage.jsx). Under the 3D stage the 2D
 * fingerboard stays one click away for keyboard players.
 */
export default function BowedWorkspace({ instrument, onInstrument, onTuner, score, engine, settings, setSettings, onStudy, freePlay, onFreePlay, inspector }) {
  const kit = stringKit(instrument);
  const { bow, lift, silence, activePositions } = useStringInput(instrument);
  const [scale, setScale] = useState(kit.scales[0]);
  // Set when the 3D stage could not show the instrument; this workspace then keeps to the 2D fingerboard.
  const [flat, setFlat] = useState(false);
  const [, refresh] = useState(0);
  const live = useRef(null);
  live.current = { engine, activePositions };
  // Redraw only while something moves or sounds, plus once after it stops.
  useEffect(() => {
    let wasBusy = false;
    const id = setInterval(() => {
      if (document.hidden) return;
      const { engine: e, activePositions: held } = live.current;
      const busy = e.playing || held.current.size > 0 || e.activeInputRef.current.size > 0;
      if (busy || wasBusy) refresh(v => v + 1);
      wasBusy = busy;
    }, 80);
    return () => clearInterval(id);
  }, []);
  const reach = bowedReach(instrument);
  const maxFret = settings.bowedRange === 'octave' ? 12 : reach;
  const quality = normalizeStageQuality(settings.stageQuality);
  useEffect(() => { silence(); }, [score.id, engine.playing, maxFret, settings.renderer, quality, silence]);
  const strength = settings.bowPressure ?? 0.7;
  const play = position => bow(position, strength);
  const now = Math.max(0, engine.songTime);
  const next = freePlay ? null : (engine.sessionRef.current?.targets ?? score.notes).find(n => n.status !== 'hit' && n.time >= now - 0.1);
  const labelMode = settings.bowedLabels ?? 'fingers';
  const labelSize = settings.instrumentLabelSize ?? 14;
  const solid = !flat && settings.renderer === 'gl' && webglAvailable() && stageTierHere(quality) === STAGE_TIERS.FULL;
  const card = <BowCard kit={kit} scale={scale} onScale={setScale} onBow={play} onLift={lift} silence={silence} settings={settings} setSettings={setSettings} activePositions={activePositions} />;
  const stage = { kit, engine, maxFret, labelMode, labelSize, target: next, selection: freePlay ? scale.positions : null, activePositions, onBow: play, onLift: lift };
  const giveUp = why => {
    console.warn(`[stage] the 3D ${kit.label.toLowerCase()} is unavailable, showing the 2D fingerboard:`, why);
    silence();
    setFlat(true);
  };
  return (
    <section className={`guitar-workspace bowed-workspace stage-dark ${instrument}-workspace`} aria-label={`${kit.label} studio`}>
      {!freePlay && <StringTab instrument={instrument} score={score} engine={engine} pps={settings.pps} />}
      {!freePlay && <div className="guitar-next"><span>UP NEXT</span><strong>{next ? noteInstruction(next, instrument) : 'Study complete'}</strong><span className="guitar-tab-key">0 = open string · numbers are fingers</span></div>}
      <div className="guitar-view-controls">
        {onInstrument && <TypeSwitch instrument={instrument} onChange={onInstrument} />}
        {!freePlay && <label className="guitar-exercise">Exercise<select aria-label={`${kit.label} exercise`} value={score.id} onChange={e => onStudy(e.target.value)}>
          <StudyOptions kit={kit} />
        </select></label>}
        <label>Reach<select aria-label="Visible finger places" value={maxFret === 12 ? 'octave' : 'first'} onChange={e => setSettings(s => ({ ...s, bowedRange: e.target.value }))}>
          <option value="first">First position · 0–{reach}</option><option value="octave">Up to the octave · 0–12</option>
        </select></label>
        <label>Labels<select aria-label="Fingerboard labels" value={labelMode} onChange={e => setSettings(s => ({ ...s, bowedLabels: e.target.value }))}>
          <option value="fingers">Fingers</option><option value="notes">Notes</option>
        </select></label>
        <label>Text<select aria-label="Instrument label size" value={labelSize} onChange={e => setSettings(s => ({ ...s, instrumentLabelSize: +e.target.value }))}><option value="14">Standard</option><option value="18">Large</option></select></label>
        {onTuner && !freePlay && <button type="button" className="view-tool" onClick={onTuner} title="Tune your instrument with the microphone"><Icon name="tuner" size={14} />Tuner</button>}
      </div>
      {solid ? <>
        <Suspense fallback={<div className="guitar-stage-loading">Preparing your {kit.label.toLowerCase()}…</div>}>
          <BowedStage3D {...stage} theme={STAGE_THEME} quality={quality} view={freePlay ? 'freePlay' : 'lesson'} onUnavailable={giveUp} />
        </Suspense>
        <details className="guitar-fret-controls with-stage bowed-finger-controls">
          <summary>Show finger buttons · keyboard accessible</summary>
          <BowedStage {...stage} />
        </details>
      </> : <BowedStage {...stage} />}
      {freePlay ? (inspector ? createPortal(card, inspector) : card)
        : <div className="guitar-chords"><button onClick={onFreePlay}>Explore scales in Free play →</button><span>Tapes mark first-position fingers · Outline: next note · Filled: played</span></div>}
    </section>
  );
}
