import { useEffect, useRef, useState } from 'react';
import { useStageView } from '../hooks/useStageView.js';
import { frettedHooks, watchPointer } from '../lib/frettedStage.js';
import { buildModelGuitarRig, MODEL_STRINGS } from '../lib/guitarModelRig.js';
import { bringModel } from '../lib/stage/otherRigs.js';
import { STAGE_TIERS } from '../lib/stage/quality.js';
import { runStage } from '../lib/stage/stageRunner.js';
import { createStudio } from '../lib/stage/studio.js';
import ResetViewButton from './ResetViewButton.jsx';
import StageLabels from './StageLabels.jsx';
import StageViewSwitch from './StageViewSwitch.jsx';

/**
 * A fretted instrument that is played on its downloaded model: the bass.
 *
 * Lessons frame the neck straight across; free play opens on the same view
 * and can show the whole instrument, turned by dragging. The model is for the
 * full tier only, so `onUnavailable` is called if the stage cannot start at
 * full detail, or the model or the graphics give out, and the drawn fretboard
 * (GuitarWorkspace.jsx) takes over.
 *
 * @param {object} props
 * @param {object} props.kit the instrument (instruments.js); `kit.model` is the model it is played on
 */
export default function FrettedModelStage({ kit, engine, score, onPluck, onUnavailable, leftHanded, theme = 'light', quality = 'auto', activePositions, maxFret = 12, labelSize = 14, focusPosition = null, view = 'lesson' }) {
  const host = useRef(null);
  const latest = useRef(null);
  const controls = useRef(null);
  const [hover, setHover] = useState('');
  const [labels, setLabels] = useState([]);
  const [turned, setTurned] = useState(false);
  const [turnable, setTurnable] = useState(false);
  // Keeps Reset view in place while it has keyboard focus, so focus is not dropped when the view comes back.
  const [resetFocused, setResetFocused] = useState(false);
  const [showcase, setShowcase] = useState(false);
  const [ready, setReady] = useState(false);
  // Free play opens on the fretboard, the view lessons use; Whole instrument shows all of it.
  const [stageView, setStageView] = useStageView(view);
  const closeUp = stageView !== 'whole';
  latest.current = { engine, score, onPluck, onUnavailable, chord: null, labelMode: 'fingers', labelSize, focusPosition, activePositions, leftHanded, flip: leftHanded ? -1 : 1, view, closeUp, tuning: kit.tuning, midiAt: kit.midi };
  const offersWhole = view === 'freePlay' && showcase;
  const whole = offersWhole && !closeUp;
  const name = kit.label.toLowerCase();
  const resetView = event => {
    // A pointer click needs no lingering focus; a key press (detail 0) keeps it here.
    if (event.detail > 0) event.currentTarget.blur();
    if (turned) controls.current?.resetView();
  };
  useEffect(() => {
    const el = host.current;
    let studio;
    try { studio = createStudio(el, { theme, quality }); }
    catch (error) { latest.current.onUnavailable(error.message); return undefined; }
    // The studio drops to light detail if its reflections cannot be built; the drawn fretboard is the light bass.
    if (studio.tier !== STAGE_TIERS.FULL) {
      studio.dispose();
      latest.current.onUnavailable('the 3D stage could only start at light detail');
      return undefined;
    }
    el.dataset.stageTier = studio.tier;
    setReady(false);
    const pointed = { place: null };
    const fail = why => latest.current.onUnavailable(why);
    const run = runStage(el, studio, { latest, maxFret, hooks: frettedHooks(el, latest, pointed), setLabels, setTurned, setTurnable, setShowcase, controls });
    const unwatch = watchPointer(studio.renderer.domElement, run, pointed, {
      onHover: setHover, onPluck: place => latest.current.onPluck(place), onLost: fail, strings: kit.tuning.length,
    });
    const abandon = bringModel(run, {
      id: kit.model, name: kit.label.toLowerCase(),
      build: (owned, model) => ({ ...buildModelGuitarRig({ owned, maxFret, model, strings: MODEL_STRINGS[kit.model], midiAt: kit.midi, colors: kit.colors }), maxFret }),
      onReady: () => setReady(true), onFailed: fail,
    });
    return () => { abandon(); unwatch(); run.stop(); };
  }, [kit, theme, quality, maxFret]);
  const hint = hover || (whole ? 'Drag to turn · Fretboard to play the frets' : turnable ? 'Click between frets to play · drag to turn' : 'Click between frets to play · ○ open string');
  return <div className="guitar-stage fretted-model-stage" ref={host} role="group" aria-label={`Three-dimensional ${name} fretboard`} data-view={view}>
    <div className="guitar-stage-top"><div><strong>Fretboard</strong><span>Standard tuning · {kit.tuning.map((_, s) => kit.stringName(s).note).join(' ')}</span></div></div>
    <StageLabels labels={labels} labelSize={labelSize} />
    {!ready && <div className="bowed-stage-preparing" role="status">Preparing your {name}…</div>}
    <div className="guitar-stage-bottom"><span className="guitar-stage-legend"><i className="played"/>Played <i className="next"/>{view === 'freePlay' ? 'Hover' : 'Next note'}</span><span className="guitar-stage-end">{offersWhole && <StageViewSwitch label="Fretboard" short="Frets" value={whole ? 'whole' : 'learn'} onChange={setStageView} />}{turnable && (turned || resetFocused) && <ResetViewButton turned={turned} onReset={resetView} onFocusChange={setResetFocused} />}<span className="guitar-stage-hint">{hint}</span></span></div>
  </div>;
}
