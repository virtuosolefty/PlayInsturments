import PianoAccess from './PianoAccess.jsx';
import { usePianoInteraction } from '../hooks/usePianoInteraction.js';
import { referencePlaybackFor } from '../hooks/usePracticeEngine.js';
import { pianoLabel } from '../lib/instrumentView.js';
import { useEffect, useMemo, useRef } from 'react';
import { buildKeyboardGeometry, displayRangeFor, isC, keyAt } from '../lib/keyboard.js';
import { COMBO_THRESHOLD, lanesFrom, rollLayout } from '../lib/rollGeometry.js';
import { ROLL_FONT } from '../lib/rollPaint.js';
import { PIANO_COLORS as COLORS, PIANO_HEIGHT, keyLight, soundingNotes, stageChords } from '../lib/pianoStage.js';
import { paintStageNotes, paintChordLabels, paintStrike } from '../lib/pianoStagePaint.js';
import { acquireScene, BLACK_RISE, NOTE_DEPTH, WHITE_DEPTH } from '../lib/rollScene.js';

/**
 * RollGL — the practice view drawn with a GPU.
 *
 * Same contract as the canvas roll it sits beside: it owns its own
 * requestAnimationFrame loop, reads engine state out of refs, and never
 * re-renders React while a run is playing. What changes is only how the pixels
 * arrive.
 *
 * Both renderers take their positions from rollGeometry.js, so there is one
 * answer to where a note belongs and no way for them to disagree about it —
 * the property that makes having two renderers survivable at all.
 *
 * ── Two canvases, on purpose ──────────────────────────────────────────────
 *
 * WebGL underneath for the geometry, a transparent 2D canvas on top for every
 * piece of text: note names, fingerings, bar numbers, the combo read-out.
 * Text in WebGL means a glyph atlas that goes soft whenever the device pixel
 * ratio changes, or an SDF font library larger than the feature it serves. The
 * overlay is a few dozen lines, stays crisp at every zoom, and reuses the
 * fonts the canvas roll already picked.
 *
 * Loaded lazily. Three.js is about as large as the rest of the application put
 * together, and a session that never turns this on should never pay for it.
 */
export default function RollGL({
  score,
  engine,
  theme,
  pixelsPerSecond = 180,
  troubleSpots = [],
  range: fixedRange = null,
  labels = 'note',
  ghost = null,
  bestCombo = 0,
  onSeek,
  onPreviewNote,
  settings = {},
  keyboardHeight = PIANO_HEIGHT,
  onContextLost,
}) {
  const chordsRef = useRef([]);
  chordsRef.current = useMemo(() => stageChords(score), [score]);
  const playingSettings = useRef(settings); playingSettings.current = settings;
  const textRef = useRef(null);
  const wrapRef = useRef(null);
  const sceneRef = useRef(null);
  const geomRef = useRef(null);
  const layoutRef = useRef(null);

  const engineRef = useRef(engine);
  const scoreRef = useRef(score);
  const ppsRef = useRef(pixelsPerSecond);
  const troubleRef = useRef(troubleSpots);
  const labelsRef = useRef(labels);
  const ghostRef = useRef(ghost);
  const bestComboRef = useRef(bestCombo);
  const calmRef = useRef(false);

  engineRef.current = engine;
  scoreRef.current = score;
  ppsRef.current = pixelsPerSecond;
  troubleRef.current = troubleSpots;
  labelsRef.current = labels;
  ghostRef.current = ghost;
  bestComboRef.current = bestCombo;

  const input = usePianoInteraction({ range:fixedRange ?? displayRangeFor(score), settings, onSeek, pick: e=>{
    const scene=sceneRef.current, geometry=geomRef.current, layout=layoutRef.current;
    if(!scene||!geometry||!layout)return null;
    const rect=e.currentTarget.getBoundingClientRect();
    const face=scene.pickKey(e.clientX-rect.left,e.clientY-rect.top);
    if(face)return {midi:face.midi,depth:(face.y-layout.keyboardTop)/(geometry.keys.get(face.midi)?.black?keyboardHeight*.62:keyboardHeight)};
    const at=scene.pick(e.clientX-rect.left,e.clientY-rect.top); if(!at||at.x<0||at.x>layout.w||at.y>layout.h)return null;
    if(at.y>=layout.keyboardTop){const midi=keyAt(geometry,at.x,at.y,layout.keyboardTop,keyboardHeight*.62);return {midi,depth:(at.y-layout.keyboardTop)/(geometry.keys.get(midi)?.black?keyboardHeight*.62:keyboardHeight)};}
    return {time:Math.max(0,(engineRef.current.transportRef.current?.now()??0)+(layout.hitLine-at.y)/ppsRef.current)};
  }});
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      calmRef.current = mq.matches;
    };
    sync();
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  useEffect(() => {
    const text = textRef.current;
    const wrap = wrapRef.current;
    if (!text || !wrap) return undefined;

    /**
     * Borrow the one WebGL context this app ever makes.
     *
     * Not created here, and not destroyed on unmount. A context is a scarce
     * resource — browsers cap them near sixteen — and this component mounts and
     * unmounts freely: a mode switch, someone flicking the 3D toggle, and
     * StrictMode double-invoking every effect on purpose in development. Making
     * one per mount burned through the cap until the browser started killing
     * live contexts underneath a running renderer.
     *
     * The canvas belongs to the scene rather than to React for the same reason:
     * an element React reuses across mounts cannot be handed a fresh context if
     * its old one was ever taken away.
     */
    let scene;
    let gl;
    try {
      ({ scene, canvas: gl } = acquireScene());
    } catch (err) {
      onContextLost?.(err?.message ?? 'WebGL could not start');
      return undefined;
    }
    wrap.insertBefore(gl, text);

    sceneRef.current = scene;
    scene.refreshPalette();

    /**
     * A lost context is a normal event, not a failure: the OS reclaims the GPU
     * on sleep, a driver updates, a laptop switches graphics chips. Left
     * unhandled it is a silent black rectangle where the music should be —
     * exactly the failure mode this app has already been bitten by twice.
     */
    const onLost = (e) => {
      e.preventDefault();
      onContextLost?.('the graphics context was lost');
    };
    gl.addEventListener('webglcontextlost', onLost);

    let sig = null;
    let dpr = 1;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      scene.setSize(w, h, dpr);
      text.width = Math.floor(w * dpr);
      text.height = Math.floor(h * dpr);

      const range = fixedRange ?? displayRangeFor(scoreRef.current);
      const next = `${w}x${h}:${range[0]}-${range[1]}`;
      if (next === sig) return;
      sig = next;

      /**
       * The selected range always fills the stage. A 25-key controller still
       * exposes only those 25 pitches, but its on-screen keys use all available
       * width. Changing the range replaces the playable pitches rather than
       * leaving inactive decorative keys at either side.
       */
      const tableW = w;
      const geometry = buildKeyboardGeometry(range[0], range[1], tableW);
      const originX = 0;

      // No past strip in here: the hit line sits on the keyboard so a note
      // arrives at the key it belongs to. An empty band between the two reads
      // as a hole in the middle of the instrument once the scene has depth.
      const layout = rollLayout(tableW, h, { pastRatio: 0, keyboardHeight });
      geomRef.current = geometry;
      layoutRef.current = layout;
      scene.geometryKeys = geometry.keys;
      scene.frame(layout, originX);
      scene.buildStatic(geometry, layout, lanesFrom(geometry));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const tctx = text.getContext('2d');
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      const layout = layoutRef.current;
      if (!layout) return;
      const transport = e?.transportRef?.current;
      const now = transport ? transport.now() : 0;
      const combo = e?.comboRef?.current?.count ?? 0;

      const sounding = soundingNotes(scoreRef.current, now);
      const playback = !!transport?.playing && referencePlaybackFor(playingSettings.current);
      const currentScore = scoreRef.current;
      const targets = e?.sessionRef?.current?.targets;
      const visualScore = targets ? { ...currentScore, notes: [...targets, ...(currentScore?.notes ?? []).filter(n => n.accompaniment)] } : currentScore;
      scene.draw({
        score: visualScore,
        layout,
        now,
        pps: ppsRef.current,
        activeInput: e?.activeInputRef?.current,
        soundingNow: sounding, playback,
        troubleSpots: troubleRef.current,
        ghost: ghostRef.current,
        combo,
        bestCombo: bestComboRef.current,
        calm: calmRef.current,
      });

      drawText(tctx, {
        scene,
        dpr,
        view: { w: wrap.clientWidth, h: wrap.clientHeight },
        layout,
        geometry: geomRef.current,
        score: visualScore,
        now,
        pps: ppsRef.current,
        labels: labelsRef.current,
        combo,
        bestCombo: bestComboRef.current,
        sounding, playback, chords:chordsRef.current, calm:calmRef.current,
        settings:playingSettings.current, hover:input.hoverRef.current, activeInput:e?.activeInputRef?.current,
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.removeEventListener('webglcontextlost', onLost);
      // Emptied and handed back, never disposed — see acquireScene.
      scene.release();
      gl.remove();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedRange, theme, keyboardHeight]);

  return <div className="roll-gl playable-piano" ref={wrapRef} role="grid" aria-label="Piano keyboard. Arrow keys select notes; hold Enter or Space to play." aria-activedescendant={input.prefix+'-note-'+input.selected} tabIndex={0} {...input.handlers}><canvas className="roll-text" ref={textRef} aria-hidden="true"/><PianoAccess input={input}/></div>;
}

/** Crisp projected rims and labels over the physical Three.js key faces. */
function drawText(ctx, { scene, dpr, view, layout, geometry, score, now, pps, labels, combo, bestCombo, settings = {}, hover, activeInput, sounding, playback, chords, calm }) {
  if (!ctx || !geometry) return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,view.w,view.h);
  const project=(x,y,z=0)=>scene.project(x,y,z);
  paintStageNotes(ctx,{notes:score?.notes,geometry,now,pps,hitLine:layout.hitLine,project,depth:NOTE_DEPTH,labels,faces:false,calm});
  paintChordLabels(ctx,chords,{now,pps,hitLine:layout.hitLine,geometry,project});
  paintStrike(ctx,{geometry,layout,activeInput,sounding,playback,project,depth:WHITE_DEPTH,calm});
  const keyHeight=layout.h-layout.keyboardTop;
  ctx.font='10px Inter, sans-serif';ctx.textAlign='center';
  for(const key of geometry.keys.values()) {
    const tint=keyLight(key.midi,activeInput,sounding,playback);
    const height=key.black?keyHeight*.62:keyHeight;
    const depth=key.black?WHITE_DEPTH+BLACK_RISE:WHITE_DEPTH;
    const p=scene.projectKey(key.midi,.5,1-12/height);
    const label=pianoLabel(key.midi,settings.pianoLabels,settings.typingOctave);
    if(label && (key.w>=19||isC(key.midi))){
      ctx.fillStyle=tint?'#30243e':key.black?'#b9b2c5':'#615b6e';
      ctx.fillText(label,p.x,p.y,Math.max(12,key.w-2));
    }
    if(key.midi===hover){
      const inset=Math.min(.2,2/key.w);
      const a=scene.projectKey(key.midi,inset,.05),b=scene.projectKey(key.midi,1-inset,.05);
      const c=scene.projectKey(key.midi,1-inset,.96),d=scene.projectKey(key.midi,inset,.96);
      ctx.strokeStyle=key.black?'#d4c6ff':'#665096';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.stroke();
    }
    const press=activeInput?.get(key.midi);
    if(press && press.type!=='free'){
      ctx.fillStyle=key.black?'#ffffff':'#30243e';ctx.font='bold 12px Inter, sans-serif';
      ctx.fillText(press.type==='wrong'?'×':press.type==='timing'?'~':'✓',p.x,p.y-15);ctx.font='10px Inter, sans-serif';
    }
  }
  if(combo>=COMBO_THRESHOLD){
    const p=project(layout.w-10,layout.hitLine-20,0);
    ctx.fillStyle=bestCombo>0&&combo>bestCombo?COLORS.record:COLORS.label;
    ctx.font=ROLL_FONT.bar;ctx.textAlign='right';ctx.fillText(combo+' in a row',Math.min(view.w-12,p.x),p.y);
  }
}
