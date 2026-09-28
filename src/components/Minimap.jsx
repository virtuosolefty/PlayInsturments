import { useEffect, useMemo, useRef } from 'react';
import { PIANO_COLORS } from '../lib/pianoStage.js';
import { secondsPerBar } from '../lib/passages.js';
import { loopLabel, moveLoopBoundary } from '../lib/loopSelection.js';

const HEIGHT = 40;

const COLORS = {
  // Matched to PianoRoll's laneWhite. The two are screens set into the same
  // plate a few pixels apart, and a blue cast on one of them showed.
  bg: '#0a0d13',
  right: PIANO_COLORS.right,
  left: PIANO_COLORS.left,
  accompaniment: 'rgba(255,255,255,0.16)',
  trouble: '#ff5d6c',
  loop: 'rgba(77,212,192,0.10)',
  played: 'rgba(77,212,192,0.07)',
  head: '#4dd4c0',
};

/**
 * The whole piece at a glance.
 *
 * This replaced a four-pixel progress bar that told you a percentage. A
 * percentage says how far through you are; the shape of the music tells you
 * what is coming — where it climbs, where it thins out, and where the bars you
 * keep fumbling are waiting. Every input already existed: the notes, the
 * trouble map accumulated across runs, and the loop region.
 *
 * The static picture is cached to an offscreen canvas and only rebuilt when the
 * piece or the marks change, so the sixty-times-a-second work is one blit and a
 * playhead rather than a redraw of every note.
 */
export default function Minimap({ theme = 'light', score, troubleSpots = [], loop, engine, onSeek, onLoopChange }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: HEIGHT, dpr: 1 });
  const layerRef = useRef(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const range = useMemo(() => {
    if (!score?.notes?.length) return [60, 72];
    const midis = score.notes.map((n) => n.midi);
    return [Math.min(...midis), Math.max(...midis)];
  }, [score]);

  /** Repaint the cached layer: notes, trouble marks, loop shading. */
  const paintLayer = useRef(() => {});
  paintLayer.current = () => {
    const { w, dpr } = sizeRef.current;
    if (!w || !score?.duration) return;

    const layer = layerRef.current ?? document.createElement('canvas');
    layerRef.current = layer;
    layer.width = Math.floor(w * dpr);
    layer.height = Math.floor(HEIGHT * dpr);
    const ctx = layer.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, HEIGHT);

    ctx.fillStyle = theme === 'light' ? '#eeece8' : '#131319';
    ctx.fillRect(0, 0, w, HEIGHT);

    if (loop) {
      const from = (loop[0] / score.duration) * w;
      ctx.fillStyle = COLORS.loop;
      ctx.fillRect(from, 0, ((loop[1] - loop[0]) / score.duration) * w, HEIGHT);
    }

    const [lo, hi] = range;
    const span = Math.max(1, hi - lo);
    const pad = 5;
    const usable = HEIGHT - pad * 2;

    for (const note of score.notes) {
      const x = (note.time / score.duration) * w;
      const width = Math.max(1.2, (note.duration / score.duration) * w);
      const y = pad + (1 - (note.midi - lo) / span) * usable;
      ctx.fillStyle = note.accompaniment
        ? COLORS.accompaniment
        : note.hand === 'left'
          ? COLORS.left
          : COLORS.right;
      ctx.globalAlpha = note.accompaniment ? 1 : 0.75;
      ctx.fillRect(x, y - 1, width, 2.4);
    }
    ctx.globalAlpha = 1;

    // Where you keep going wrong, marked along the bottom.
    if (troubleSpots.length) {
      const worst = Math.max(...troubleSpots.map((t) => t.weight), 1);
      for (const spot of troubleSpots) {
        const x = (spot.time / score.duration) * w;
        ctx.fillStyle = COLORS.trouble;
        ctx.globalAlpha = 0.35 + 0.65 * (spot.weight / worst);
        ctx.fillRect(x - 1, HEIGHT - 3, 2.5, 3);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* --------------------------------------------------------------- sizing */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      sizeRef.current = { w, h: HEIGHT, dpr };
      paintLayer.current();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Rebuild the cached picture only when what it shows actually changes.
  useEffect(() => {
    paintLayer.current();
  }, [theme, score, troubleSpots, loop, range]);

  /* ------------------------------------------------------------ draw loop */
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const layer = layerRef.current;
      if (!canvas || !layer) return;

      const { w, dpr } = sizeRef.current;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const duration = scoreDurationRef.current;
      if (!duration) return;
      const songTime = engineRef.current?.transportRef?.current?.now() ?? 0;
      const x = (Math.max(0, songTime) / duration) * w;

      ctx.fillStyle = COLORS.played;
      ctx.fillRect(0, 0, x, HEIGHT);

      ctx.strokeStyle = COLORS.head;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scoreDurationRef = useRef(0);
  scoreDurationRef.current = score?.duration ?? 0;

  const seek = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    onSeek?.(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (score?.duration ?? 0));
  };

  const duration = score?.duration ?? 0;
  const bar = secondsPerBar(score);
  const updateBoundary = (edge, time) => {
    if (!loopRef.current || !duration) return;
    const next = moveLoopBoundary(loopRef.current, edge, time, score);
    loopRef.current = next;
    onLoopChange?.(next);
  };
  const drag = (event, edge) => {
    const rect = canvasRef.current.getBoundingClientRect();
    updateBoundary(edge, ((event.clientX - rect.left) / rect.width) * duration);
  };
  const moveWithKey = (event, edge) => {
    let time = loop[edge];
    if (['ArrowLeft', 'ArrowDown'].includes(event.key)) time -= bar;
    else if (['ArrowRight', 'ArrowUp'].includes(event.key)) time += bar;
    else if (event.key === 'Home') time = 0;
    else if (event.key === 'End') time = duration;
    else return;
    event.preventDefault();
    event.stopPropagation();
    updateBoundary(edge, time);
  };
  const bars = Math.max(1, Math.ceil(duration / bar));
  const stride = Math.max(1, Math.ceil(bars / 12));

  return (
    <div className="passage-timeline">
      <div className="passage-summary"><span role="status">{loopLabel(loop, score)}</span>{loop ? <div><button onClick={() => onSeek?.(loop[0])}>Restart passage</button><button onClick={() => onLoopChange?.(null)}>Clear loop</button></div> : <span className="timeline-hint">Click to jump · use Loop to repeat a passage</span>}</div>
      <div className="minimap" ref={wrapRef}>
        <canvas ref={canvasRef} style={{ height: HEIGHT }} onPointerDown={seek} role="slider" tabIndex={0} aria-label="Position in piece" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.max(0, Math.min(duration, engine.songTime ?? 0))} aria-valuetext={`${Math.floor(Math.max(0, engine.songTime ?? 0) / bar) + 1} of ${bars} bars`} onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          onSeek?.(Math.max(0, Math.min(duration, e.key === 'Home' ? 0 : e.key === 'End' ? duration : (engine.songTime ?? 0) + (e.key === 'ArrowRight' ? bar : -bar))));
        }} />
        {loop && duration > 0 && <>
          <div className="loop-selection" aria-hidden="true" style={{ left: `${loop[0] / duration * 100}%`, width: `${(loop[1] - loop[0]) / duration * 100}%` }} />
          {[0, 1].map(edge => <button key={edge} className={`loop-boundary edge-${edge}`} role="slider" aria-label={edge === 0 ? 'Loop start' : 'Loop end'} aria-valuemin={edge === 0 ? 0 : moveLoopBoundary(loop, 1, 0, score)[1]} aria-valuemax={edge === 0 ? moveLoopBoundary(loop, 0, duration, score)[0] : duration} aria-valuenow={loop[edge]} aria-valuetext={edge === 0 ? `Start of bar ${Math.floor(loop[0] / bar) + 1}` : `End of bar ${Math.ceil(loop[1] / bar)}`} style={{ left: `clamp(12px, ${loop[edge] / duration * 100}%, calc(100% - 12px))` }} title="Drag to adjust · arrow keys move one bar" onKeyDown={e => moveWithKey(e, edge)} onPointerDown={e => { e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drag(e, edge); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { drag(e, edge); e.currentTarget.releasePointerCapture(e.pointerId); } }}><span aria-hidden="true">{edge === 0 ? '‹' : '›'}</span></button>)}
        </>}
      </div>
      <div className="timeline-bars" aria-hidden="true">{Array.from({ length: Math.ceil(bars / stride) }, (_, i) => <span key={i} style={{ left: `${i * stride * bar / (duration || 1) * 100}%` }}>{i * stride + 1}</span>)}</div>
    </div>
  );
}
