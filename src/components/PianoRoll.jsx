/**
 * PianoRoll — the practice view.
 *
 * Layout, top to bottom:
 *   [ future ]  target notes falling towards the hit line
 *   ══════════  the hit line: notes crossing it must be played NOW
 *   [ keys   ]  the keyboard, highlighting what to press and what you pressed
 *
 * The component owns its own requestAnimationFrame loop and reads engine state
 * out of refs, so it never re-renders during playback.
 */

import { useEffect, useMemo, useRef } from 'react';
import { buildKeyboardGeometry, displayRangeFor, keyAt } from '../lib/keyboard.js';
import {
  COMBO_THRESHOLD,
  gridLines,
  HIT_FX_MS,
  KEYBOARD_H,
  lanesFrom,
  rollLayout,
  timeWindow,
} from '../lib/rollGeometry.js';
import { PIANO_COLORS as COLORS, PIANO_HEIGHT, soundingNotes, stageChords } from '../lib/pianoStage.js';
import { paintStageNotes, paintChordLabels, paintStrike } from '../lib/pianoStagePaint.js';
import { usePianoInteraction } from '../hooks/usePianoInteraction.js';
import { referencePlaybackFor } from '../hooks/usePracticeEngine.js';
import PianoAccess from './PianoAccess.jsx';
import { drawKeyboard } from '../lib/pianoKeys.js';
import {
  BLACK_H_RATIO,
  ROLL_FONT,
  roundRect,
} from '../lib/rollPaint.js';


export default function PianoRoll({
  score,
  engine,
  pixelsPerSecond = 180,
  troubleSpots = [],
  onSeek,
  onPreviewNote,
  settings = {},
  keyboardHeight = PIANO_HEIGHT,
  range: fixedRange = null,
  labels = 'note',
  ghost = null,
  bestCombo = 0,
}) {
  const KEYBOARD_H = keyboardHeight;
  const chordsRef=useRef([]);
  chordsRef.current=useMemo(()=>stageChords(score),[score]);
  const playingSettings = useRef(settings); playingSettings.current = settings;
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const geomRef = useRef(null);
  /** Lane columns and octave boundaries, rebuilt with the geometry. */
  const lanesRef = useRef({ black: [], octaves: [] });
  const troubleRef = useRef(troubleSpots);
  const ppsRef = useRef(pixelsPerSecond);
  const scoreRef = useRef(score);
  // The engine object is recreated whenever the read-outs refresh (~12 Hz).
  // Keep it behind a ref so the draw loop is started exactly once instead of
  // being torn down and restarted a dozen times a second.
  const engineRef = useRef(engine);

  const accompanimentRef = useRef([]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  // Read from a ref like everything else the draw loop touches: the ghost
  // changes once per run, and re-rendering the canvas for it would be waste.
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  /** Your longest clean streak on this arrangement, to be beaten. */
  const bestComboRef = useRef(bestCombo);
  bestComboRef.current = bestCombo;
  /** Rendered keyboard, reused between frames — see the signature check below. */
  const keyboardCache = useRef({ sig: null, canvas: null });
  /** The vignette gradient, which only changes when the canvas is resized. */
  const vignetteCache = useRef({ sig: null, grad: null });
  /**
   * Has the reader asked the OS for less movement? The stylesheet answers this
   * by collapsing the duration tokens, which a canvas cannot inherit — so the
   * idle breathing of the hit line has to check for itself. Read into a ref
   * rather than state: the draw loop reads it every frame and must not be a
   * reason to re-render.
   */
  const calmRef = useRef(false);

  troubleRef.current = troubleSpots;
  ppsRef.current = pixelsPerSecond;
  scoreRef.current = score;
  engineRef.current = engine;
  // Split out once per score rather than filtered on every frame.
  accompanimentRef.current = useMemo(
    () => (score?.notes ?? []).filter((n) => n.accompaniment),
    [score],
  );

  const input = usePianoInteraction({ range: fixedRange ?? displayRangeFor(score), settings, onSeek, pick: e => {
    const geom = geomRef.current, rect = canvasRef.current?.getBoundingClientRect();
    if (!geom || !rect) return null;
    const x = e.clientX-rect.left, y = e.clientY-rect.top, top = sizeRef.current.h-keyboardHeight;
    if (x<0 || x>rect.width || y<0 || y>rect.height) return null;
    if(y>=top) { const midi=keyAt(geom,x,y,top,keyboardHeight*BLACK_H_RATIO); return {midi,depth:(y-top)/(geom.keys.get(midi)?.black?keyboardHeight*BLACK_H_RATIO:keyboardHeight)}; }
    return {time:Math.max(0,(engine.transportRef.current?.now()??0)+(top-y)/ppsRef.current)};
  }});
  // When the score has been fitted to a controller, draw exactly that
  // controller's keys — the on-screen keyboard then mirrors the hardware
  // one-for-one instead of showing keys you do not have.
  const range = useMemo(
    () => fixedRange ?? displayRangeFor(score),
    [fixedRange, score],
  );

  /* ------------------------------------------------------- reduced motion */
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      calmRef.current = mq.matches;
    };
    sync();
    // Safari below 14 only has the deprecated form, and this is exactly the
    // kind of listener that is not worth an exception on an older browser.
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  /* --------------------------------------------------------------- sizing */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      sizeRef.current = { w, h, dpr };
      const geom = buildKeyboardGeometry(range[0], range[1], w);
      geomRef.current = geom;

      // The lane columns and the octave boundaries only move when the geometry
      // does, so they are derived here rather than by walking the key Map on
      // every frame — which is what the octave lines used to do.
      const { black, octaves } = lanesFrom(geom);
      // Half-pixel offset is a canvas concern, not a layout one: a 1px stroke
      // on a whole coordinate straddles two rows and renders grey.
      lanesRef.current = { black, octaves: octaves.map((x) => Math.round(x) + 0.5) };
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [range, keyboardHeight]);

  /* ------------------------------------------------------------ draw loop */
  useEffect(() => {
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const geom = geomRef.current;
      const currentScore = scoreRef.current;
      if (!canvas || !geom) return;

      const engineNow = engineRef.current;
      const ctx = canvas.getContext('2d');
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Layout and the time mapping come from rollGeometry, which is where the
      // pedagogy lives now — one definition of where a note belongs, so a
      // second renderer cannot quietly disagree with this one about it.
      const { keyboardTop, rollH, hitLine } = rollLayout(w, h, {keyboardHeight,pastRatio:0});
      const pps = ppsRef.current;

      const transport = engineNow.transportRef.current;
      const session = engineNow.sessionRef.current;
      const now = transport ? transport.now() : 0;
      const nowMs = performance.now(); // wall clock, for anything that animates

      const { yFor, tTop, tBottom } = timeWindow({ hitLine, rollH }, now, pps);

      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      /* -------------------------------------------------------------- lanes
         One column per pitch, black-key columns darker — the thing that lets
         you read a piano roll without counting up from the nearest C, and the
         one piece of the idiom this roll never had. The columns are exactly
         the key widths below, so a falling note sits in its own lane all the
         way down and lands on the key it is drawn over. */
      const lanes = lanesRef.current;
      ctx.fillStyle = COLORS.laneWhite;
      ctx.fillRect(0, 0, w, rollH);
      ctx.fillStyle = COLORS.laneBlack;
      for (const lane of lanes.black) ctx.fillRect(lane.x, 0, lane.w, rollH);

      /* ------------------------------------------------ trouble-spot bands */
      if (troubleRef.current.length) {
        const max = Math.max(...troubleRef.current.map((t) => t.weight), 1);
        for (const spot of troubleRef.current) {
          if (spot.time < tBottom - 1 || spot.time > tTop + 1) continue;
          const y = yFor(spot.time + 0.25);
          const bandH = Math.max(6, 0.5 * pps);
          ctx.fillStyle = `rgba(255,93,108,${0.05 + 0.13 * (spot.weight / max)})`;
          ctx.fillRect(0, y, w, bandH);
        }
      }

      /* --------------------------------------------------------- time grid
         Three weights rather than two: bar, beat, and — once there is room for
         it — the eighth in between. A DAW grid is legible because the division
         you are counting in is always a step above the one you are not, and
         the sub-beat is what tells you whether a note lands on the beat or
         just after it. Suppressed below the zoom where the lines would be
         close enough to read as hatching. */
      {
        ctx.lineWidth = 1;
        for (const line of gridLines(currentScore, tBottom, tTop, pps)) {
          const y = Math.round(yFor(line.time)) + 0.5;
          if (y < -2 || y > rollH + 2) continue;
          // Brightest at the hit line and falling away with distance, so the
          // grid reads as depth rather than as uniform ruling.
          const near = 1 - Math.min(1, Math.abs(y - hitLine) / rollH);
          ctx.globalAlpha = 0.35 + near * 0.65;
          ctx.strokeStyle =
            line.weight === 'bar'
              ? COLORS.gridBar
              : line.weight === 'beat'
                ? COLORS.gridBeat
                : COLORS.gridSub;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (line.bar !== null && pps > 90 && y > 14) {
            ctx.fillStyle = COLORS.label;
            ctx.font = ROLL_FONT.bar;
            ctx.textAlign = 'left';
            ctx.fillText(`${line.bar}`, 4, y - 3);
          }
        }
      }

      /* ----------------------------------------------------- octave borders
         With lanes underneath, the C boundary has to stay the strongest
         vertical on the surface — it is the only one that tells you where you
         are rather than which key you are over. */
      ctx.strokeStyle = COLORS.octave;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of lanes.octaves) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rollH);
      }
      ctx.stroke();

      const soundingNow = soundingNotes(currentScore,now);
      const playback=!!transport?.playing&&referencePlaybackFor(playingSettings.current);
      const targets=session?[...session.targets,...accompanimentRef.current]:(currentScore?.notes??[]);
      paintStageNotes(ctx,{notes:targets,geometry:geom,now,pps,hitLine,labels:labelsRef.current,calm:calmRef.current,ghost:ghostRef.current});
      paintChordLabels(ctx,chordsRef.current,{now,pps,hitLine,geometry:geom});
      // Player verdict marks stay inside the roll; they cannot paint over key faces.
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,rollH);ctx.clip();
      /* -------------------------------------------- what the player played */
      const played = engineNow.playedRef.current;
      for (let i = played.length - 1; i >= 0; i -= 1) {
        const p = played[i];
        const end = p.end ?? now;
        if (end < tBottom - 0.2) break;
        if (p.start > tTop) continue;
        const key = geom.keys.get(p.midi);
        if (!key) continue;

        const yEnd = yFor(p.start);
        const yStart = yFor(end);
        const top = Math.min(yStart, yEnd);
        const height = Math.max(3, Math.abs(yEnd - yStart));
        const bw = Math.max(3, key.w * 0.42);
        const x = key.center - bw / 2;

        const color =
          p.type === 'wrong' ? COLORS.missed : p.type === 'timing' ? COLORS.late : COLORS.hit;
        roundRect(ctx, x, top, bw, height, 2);
        ctx.fillStyle = `${color}cc`;
        ctx.fill();

        if (p.type === 'wrong') {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(key.center, Math.min(rollH - 3, yEnd), 3 + 2 * (p.severity ?? 0), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* -------------------------------------------------------- the hit line */
      // A run of clean notes lights the line up. This is the single cheapest
      // thing that makes playing well *feel* like playing well — the score
      // read-outs are across the screen and you are looking here.
      const combo = engineNow.comboRef?.current?.count ?? 0;
      // Past your own longest streak on this arrangement, live. The record is
      // the reason to keep the phrase going, and it is worth nothing announced
      // on a results screen twenty seconds after the moment passed.
      const record = bestComboRef.current > 0 && combo > bestComboRef.current;
      const heat = Math.min(
        1,
        Math.max(0, (combo - COMBO_THRESHOLD) / 12) + (record ? 0.35 : 0),
      );
      /* ----------------------------------------------------- hit flourishes */
      const effects = engineNow.effectsRef?.current ?? [];
      for (let i = effects.length - 1; i >= 0; i -= 1) {
        const fx = effects[i];
        const age = (nowMs - fx.at) / HIT_FX_MS;
        if (age >= 1) break; // the list is chronological, so everything older is too
        const key = geom.keys.get(fx.midi);
        if (!key) continue;

        const fade = 1 - age;
        if (fx.type === 'correct' || fx.type === 'timing') {
          // A ring blooming outwards from where the note landed.
          const tone = fx.type === 'correct' ? COLORS.hit : COLORS.late;
          ctx.save();
          ctx.globalAlpha = fade * 0.85;
          ctx.strokeStyle = tone;
          ctx.lineWidth = 2.5 * fade;
          ctx.beginPath();
          ctx.arc(key.center, hitLine, 6 + age * 26, 0, Math.PI * 2);
          ctx.stroke();

          // and a short column of light down the lane it belongs to
          const glow = ctx.createLinearGradient(0, hitLine - 40, 0, hitLine);
          glow.addColorStop(0, 'rgba(0,0,0,0)');
          glow.addColorStop(1, tone);
          ctx.globalAlpha = fade * 0.28;
          ctx.fillStyle = glow;
          ctx.fillRect(key.x, hitLine - 40, key.w, 40);
          ctx.restore();
        } else if (fx.type === 'wrong' || fx.type === 'missed') {
          ctx.save();
          ctx.globalAlpha = fade * 0.5;
          ctx.fillStyle = COLORS.missed;
          ctx.fillRect(key.x, hitLine - 2, key.w, 4);
          ctx.restore();
        }
      }

      if (combo >= COMBO_THRESHOLD) {
        ctx.save();
        ctx.globalAlpha = 0.35 + heat * 0.5;
        ctx.fillStyle = record ? COLORS.record : COLORS.hitLine;
        ctx.font = ROLL_FONT.bar;
        ctx.textAlign = 'right';
        ctx.fillText(
          record ? `NEW BEST · ${combo} in a row` : `${combo} in a row`,
          w - 8,
          hitLine - 8,
        );
        ctx.restore();
      }

      // divider between the "past" strip and the keyboard
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rollH + 0.5);
      ctx.lineTo(w, rollH + 0.5);
      ctx.stroke();

      // A vignette down the sides and top, so the roll reads as a lit space
      // rather than a flat rectangle, and the eye settles on the hit line.
      // Built once per size — it only depends on the geometry, and rebuilding a
      // radial gradient every frame was pure waste.
      const vigSig = `${w}x${rollH}`;
      if (vignetteCache.current.sig !== vigSig) {
        const grad = ctx.createRadialGradient(w / 2, hitLine, 0, w / 2, hitLine, Math.max(w, rollH) * 0.78);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.62, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.42)');
        vignetteCache.current = { sig: vigSig, grad };
      }
      ctx.fillStyle = vignetteCache.current.grad;
      ctx.fillRect(0, 0, w, rollH);

      ctx.restore();

      /* ------------------------------------------------------------ keyboard */
      // The keyboard is a gradient per key plus a shadow per black key, and it
      // was being rebuilt sixty times a second for a picture that only changes
      // when a key goes down or a target arrives. Cached against a signature of
      // exactly those things and blitted the rest of the time.
      {
        const activeInputSig = engineNow.activeInputRef.current;
        let sig = `${COLORS.bg}|${w}|${h}|${dpr}|${range[0]}|${range[1]}|${keyboardHeight}|${playingSettings.current.pianoLabels}|${playingSettings.current.typingOctave}|${input.hoverRef.current}`;
        for (const [midi, press] of activeInputSig) sig += `|p${midi}${press.type}`;
        for (const [midi,note] of soundingNow) sig += `|t${midi}${note.hand}`;
        sig += `|playback${playback}`;

        if (keyboardCache.current.sig !== sig) {
          const layer = keyboardCache.current.canvas ?? document.createElement('canvas');
          layer.width = Math.floor(w * dpr);
          layer.height = Math.floor(KEYBOARD_H * dpr);
          const kctx = layer.getContext('2d');
          kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          kctx.clearRect(0, 0, w, KEYBOARD_H);
          drawKeyboard(kctx, geom, activeInputSig, soundingNow, w, 0, {height:keyboardHeight, labels:playingSettings.current.pianoLabels, octave:playingSettings.current.typingOctave, hover:input.hoverRef.current,playback});
          keyboardCache.current = { sig, canvas: layer };
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(keyboardCache.current.canvas, 0, Math.round(keyboardTop * dpr));
        ctx.restore();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      paintStrike(ctx,{geometry:geom,layout:{w,keyboardTop},activeInput:engineNow.activeInputRef.current,sounding:soundingNow,playback,calm:calmRef.current});
    };


    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [range, keyboardHeight]);

  return <div className="roll-wrap playable-piano stage-dark" ref={wrapRef} role="grid" aria-label="Piano keyboard. Arrow keys select notes; hold Enter or Space to play." aria-activedescendant={input.prefix+'-note-'+input.selected} tabIndex={0} {...input.handlers}>
    <canvas ref={canvasRef} aria-hidden="true" /><PianoAccess input={input}/>
  </div>;
}

export { KEYBOARD_H };
