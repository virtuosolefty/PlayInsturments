import { useEffect, useRef } from 'react';
import { isBlackKey } from '../lib/theory.js';

const LOW = 21; // A0
const HIGH = 108; // C8
const HEIGHT = 26;

/**
 * A whole 88-key piano, an inch wide, with your controller's window lit on it.
 *
 * Borrowed from the strip along the top of GarageBand's keyboard, and it earns
 * its place here more than it does there: this app already reasons about which
 * keys you physically have, and until now said so in words — "25 keys · C3–C5"
 * — which is a fact you have to decode rather than a picture you can read.
 * Dragging or clicking moves the window, the same as the octave buttons.
 */
export default function KeyboardMap({ window: keyWindow, range, onMove }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef({ keyWindow, range });
  stateRef.current = { keyWindow, range };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      if (!w) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, HEIGHT);

      const { keyWindow: win, range: pieceRange } = stateRef.current;
      const whites = [];
      for (let m = LOW; m <= HIGH; m += 1) if (!isBlackKey(m)) whites.push(m);
      const ww = w / whites.length;

      // white keys
      let wi = 0;
      const xOf = new Map();
      for (let m = LOW; m <= HIGH; m += 1) {
        if (isBlackKey(m)) {
          xOf.set(m, wi * ww - ww * 0.3);
        } else {
          xOf.set(m, wi * ww);
          const inWindow = win && m >= win[0] && m <= win[1];
          ctx.fillStyle = inWindow ? '#e9edf4' : '#39424f';
          ctx.fillRect(wi * ww, 0, Math.max(1, ww - 0.7), HEIGHT);
          wi += 1;
        }
      }

      // black keys on top
      for (let m = LOW; m <= HIGH; m += 1) {
        if (!isBlackKey(m)) continue;
        const inWindow = win && m >= win[0] && m <= win[1];
        ctx.fillStyle = inWindow ? '#20262f' : '#1b212a';
        ctx.fillRect(xOf.get(m), 0, Math.max(1, ww * 0.6), HEIGHT * 0.62);
      }

      // What the piece itself asks for, ticked underneath — so you can see at a
      // glance whether your window covers it.
      if (pieceRange) {
        const from = xOf.get(Math.max(LOW, pieceRange[0])) ?? 0;
        const to = (xOf.get(Math.min(HIGH, pieceRange[1])) ?? w) + ww;
        ctx.fillStyle = 'rgba(77,212,192,0.85)';
        ctx.fillRect(from, HEIGHT - 2.5, Math.max(2, to - from), 2.5);
      }

      if (win) {
        const from = xOf.get(win[0]) ?? 0;
        const to = (xOf.get(win[1]) ?? w) + ww;
        ctx.strokeStyle = 'rgba(77,212,192,0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(from - 0.5, 0.75, to - from + 1, HEIGHT - 1.5);
      }
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [keyWindow, range]);

  const moveTo = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const centre = Math.round(LOW + fraction * (HIGH - LOW));
    const width = keyWindow[1] - keyWindow[0];
    onMove?.(Math.round(centre - width / 2));
  };

  return (
    <div className="keyboard-map" ref={wrapRef} title="Your controller against a full 88 keys — click to move it">
      <canvas ref={canvasRef} style={{ height: HEIGHT }} onPointerDown={moveTo} />
    </div>
  );
}
