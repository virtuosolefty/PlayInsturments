import { useEffect, useRef, useState } from 'react';
import { buildDrumKit, modelPieceFor } from '../lib/drumKitModel.js';
import { labelWidth, spreadLabels } from '../lib/drumLabels.js';
import { DRUM_PIECES, drumForMidi } from '../lib/drums.js';
import { midiInput } from '../lib/midiInput.js';
import { STAGE_TIERS } from '../lib/stage/quality.js';
import { createStudio } from '../lib/stage/studio.js';
import { STAGE_COLORS, STAGE_THEME } from '../lib/stageColors.js';
import { useAvailableModels } from '../hooks/useAvailableModels.js';
import { useStageView } from '../hooks/useStageView.js';
import StageViewSwitch from './StageViewSwitch.jsx';
import WholeModels from './WholeModels.jsx';

/** The kit from the drummer's stool, looking down at the heads. */
const SHOT = Object.freeze({ azimuthDeg: 0, elevationDeg: 34 });
const VIEW = Object.freeze({ fovDeg: 30 });
/** How far free play lets the view be turned, in radians. */
const TURN = Object.freeze({ yaw: 0.7, pitch: [-0.22, 0.3] });
const FLASH_MS = 280;
/** A stage narrower than this, or any stage on a phone or tablet, shows its names without their key badges. */
const TIGHT = 460;
const TOUCH_WIDTH = '(max-width: 900px)';
const isTight = el => el.clientWidth < TIGHT || (globalThis.matchMedia?.(TOUCH_WIDTH).matches ?? false);
const FLASH_COLORS = Object.freeze({ correct: STAGE_COLORS.hit, timing: STAGE_COLORS.late, wrong: STAGE_COLORS.miss, free: STAGE_COLORS.hitLine });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The pieces on the model to hit next: every drum of the next beat that is still to be played. */
export function nextOnModel(engine, score, freePlay) {
  if (freePlay) return new Set();
  const now = Math.max(0, engine.transportRef.current?.now() ?? 0);
  const waiting = (engine.sessionRef.current?.targets ?? score.notes).filter(note => (note.status ?? 'pending') === 'pending' && note.time >= now - 0.12);
  const first = waiting[0]?.time;
  return new Set(waiting.filter(note => note.time === first).map(note => modelPieceFor(drumForMidi(note.midi)?.id)));
}

const NAMES = Object.freeze(Object.fromEntries(DRUM_PIECES.filter(piece => piece.id !== 'hihat-open').map(piece => [piece.id, piece])));
/** The key badges beside a name: its own, and on the hi-hat the one that opens it. */
const keysOn = id => (id === 'hihat' ? 2 : 1);

/**
 * The 3D drum kit: a model built in code (drumKitModel.js) that can be hit.
 *
 * Every hit lights the drum it landed on, whether it came from the model, the
 * pads, the computer keys or a MIDI controller, in the colour of its verdict.
 * In a lesson the drum to hit next carries a blue ring. In free play the view
 * turns when the floor is dragged, and at full detail Whole instrument offers
 * the other kits there are to see (WholeModels.jsx).
 *
 * @param {object} props
 * @param {object} props.engine the practice engine
 * @param {object} props.score the study on the lanes
 * @param {(id: string) => void} props.onHit
 * @param {(why: string) => void} props.onUnavailable called when 3D cannot start or is lost; the pads carry on
 * @param {boolean} [props.freePlay]
 * @param {boolean} [props.listening] the app is playing the study, so the kit shows each written hit
 * @param {'auto'|'full'|'light'} [props.quality]
 */
export default function DrumStage({ engine, score, onHit, onUnavailable, freePlay = false, listening = false, quality = 'auto' }) {
  const host = useRef(null);
  const latest = useRef(null);
  latest.current = { engine, score, onHit, onUnavailable, freePlay, listening };
  const [labels, setLabels] = useState([]);
  const [turned, setTurned] = useState(false);
  const reset = useRef(() => {});
  // The other kits are downloaded models, which are for the full tier, as on the string stages.
  const [full, setFull] = useState(false);
  const [stageView, setStageView] = useStageView(freePlay ? 'freePlay' : 'lesson');
  const kits = useAvailableModels('drums', freePlay && full);
  const offersWhole = freePlay && full && kits.length > 1;
  const whole = offersWhole && stageView === 'whole';
  // Another kit is being shown over this one: it is there to look at, not to hit.
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const el = host.current;
    let studio;
    try {
      studio = createStudio(el, { theme: STAGE_THEME, quality });
    } catch (error) {
      console.warn('[stage] the 3D drum kit could not start, keeping to the pads:', error.message);
      latest.current.onUnavailable(error.message);
      return undefined;
    }
    const kit = buildDrumKit({ highlight: STAGE_COLORS.noteRight });
    kit.resources.geometries.forEach(geometry => studio.owned.geometries.add(geometry));
    kit.resources.materials.forEach(material => studio.owned.materials.add(material));
    studio.scene.add(kit.group);
    studio.fitGround(kit.box);
    const canvas = studio.renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    el.dataset.stageTier = studio.tier;
    setFull(studio.tier === STAGE_TIERS.FULL);

    const shot = { box: kit.box, ...SHOT };
    const turn = { yaw: 0, pitch: 0 };
    const flashes = new Map();
    let dirty = true, marked = '', lastTime = 0, drag = null, raf = 0, stopped = false;

    const placeLabels = () => {
      const project = studio.projector(kit.group);
      const bare = isTight(el);
      setLabels(spreadLabels([...kit.pieces.values()].map(piece => ({
        id: piece.id,
        width: labelWidth(NAMES[piece.id].short, bare ? 0 : keysOn(piece.id)),
        ...project(piece.anchor.x, piece.anchor.y, piece.anchor.z),
      }))));
    };
    const frame = () => {
      el.classList.toggle('tight', isTight(el));
      if (!studio.frame(shot, { view: VIEW, turn })) return;
      placeLabels();
      dirty = true;
    };
    const flash = (id, type = 'free', strength = 0.8) => {
      const piece = kit.pieces.get(modelPieceFor(id));
      if (!piece) return;
      flashes.set(piece.id, { at: performance.now(), color: FLASH_COLORS[type] ?? FLASH_COLORS.free, strength: clamp(strength, 0.3, 1) });
      dirty = true;
    };
    const settle = piece => {
      piece.surface.material.emissive.set('#000000');
      piece.root.rotation.copy(piece.rest);
      piece.root.scale.setScalar(1);
    };

    const tick = now => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const { engine: e, score: study, freePlay: free, listening: hearing } = latest.current;

      const next = nextOnModel(e, study, free);
      const key = [...next].sort().join(',');
      if (key !== marked) {
        marked = key;
        for (const piece of kit.pieces.values()) piece.ring.visible = next.has(piece.id);
        dirty = true;
      }

      // While the app plays the study, the kit shows each written hit as it sounds.
      const time = e.transportRef.current?.now() ?? 0;
      if (hearing && e.playing && time > lastTime && time - lastTime < 0.5) {
        for (const note of study.notes) if (note.time > lastTime && note.time <= time) flash(drumForMidi(note.midi)?.id);
      }
      lastTime = time;

      if (flashes.size) {
        const still = !reducedMotion();
        for (const [id, hit] of flashes) {
          const piece = kit.pieces.get(id), age = (now - hit.at) / FLASH_MS;
          if (age >= 1) { settle(piece); flashes.delete(id); continue; }
          const fade = (1 - age) * hit.strength;
          piece.surface.material.emissive.set(hit.color).multiplyScalar(fade * 0.9);
          if (!still) continue;
          // A cymbal rocks on its stand; a drum's head gives.
          if (piece.kind === 'cymbal' || piece.kind === 'hihat') piece.root.rotation.x = piece.rest.x + Math.sin(age * 22) * 0.1 * fade;
          else piece.root.scale.setScalar(1 + 0.03 * fade);
        }
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      studio.render();
    };

    const off = midiInput.onMessage(message => {
      if (message.type !== 'noteon') return;
      const piece = drumForMidi(message.midi);
      if (!piece) return;
      const verdict = latest.current.engine.activeInputRef.current.get(piece.midi)?.type;
      flash(piece.id, verdict, message.velocity);
    });

    const onDown = event => {
      if (event.button > 0) return;
      const struck = studio.pick(event, kit.targets);
      if (struck) { event.preventDefault(); latest.current.onHit(struck.userData.piece); return; }
      if (!latest.current.freePlay) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: turn.yaw, pitch: turn.pitch };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onMove = event => {
      if (!drag) { canvas.style.cursor = studio.pick(event, kit.targets) ? 'pointer' : latest.current.freePlay ? 'grab' : ''; return; }
      if (event.pointerId !== drag.id) return;
      turn.yaw = clamp(drag.yaw - (event.clientX - drag.x) * 0.006, -TURN.yaw, TURN.yaw);
      turn.pitch = clamp(drag.pitch + (event.clientY - drag.y) * 0.004, TURN.pitch[0], TURN.pitch[1]);
      setTurned(true);
      if (studio.aim(shot, { view: VIEW, turn })) { placeLabels(); dirty = true; }
    };
    const onUp = event => { if (drag?.id === event.pointerId) drag = null; };
    const onLost = event => {
      event.preventDefault();
      console.warn('[stage] the 3D drum kit lost its graphics context, keeping to the pads');
      latest.current.onUnavailable('the graphics context was lost');
    };
    reset.current = () => { turn.yaw = 0; turn.pitch = 0; setTurned(false); frame(); };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('webglcontextlost', onLost);
    const resize = new ResizeObserver(frame);
    resize.observe(el);
    frame();
    el.dataset.ready = 'true';
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      off();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      reset.current = () => {};
      delete el.dataset.ready;
      studio.dispose();
    };
  }, [quality]);

  // Leaving free play puts the view back where a lesson expects it.
  useEffect(() => { if (!freePlay) reset.current(); }, [freePlay]);

  return <div className="guitar-stage drum-stage" ref={host} role="group" aria-label="Three-dimensional drum kit" data-view={freePlay ? 'freePlay' : 'lesson'}>
    <div className="drum-labels" aria-hidden="true">
      {labels.map(label => <span key={label.id} className="drum-label" style={{ left: `${label.x}px`, top: `${label.y}px` }}>
        {NAMES[label.id].short}<kbd>{NAMES[label.id].key.toUpperCase()}</kbd>{label.id === 'hihat' && <kbd title="Open hi-hat">O</kbd>}
      </span>)}
    </div>
    <WholeModels instrument="drums" active={whole} quality={quality} onShowing={setLooking} />
    <div className="guitar-stage-bottom">
      <span className="guitar-stage-legend">{freePlay ? <><i className="played" />Hit</> : <><i className="played" />Hit <i className="next" />Next</>}</span>
      <span className="guitar-stage-end">
        {offersWhole && <StageViewSwitch value={whole ? 'whole' : 'learn'} onChange={setStageView} />}
        {freePlay && turned && <button type="button" className="guitar-reset-view" onClick={() => reset.current()}>Reset view</button>}
        <span className="guitar-stage-hint">{whole && looking ? 'Drag to turn · Learn to play the kit' : freePlay ? 'Tap a drum to play · drag the floor to turn' : 'Tap a drum, or press its letter'}</span>
      </span>
    </div>
  </div>;
}
