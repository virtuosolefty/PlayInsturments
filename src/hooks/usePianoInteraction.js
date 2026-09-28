import { useEffect, useId, useRef, useState } from 'react';
import { playInput } from '../lib/playInput.js';
import { noteName } from '../lib/theory.js';

export function usePianoInteraction({ pick, range, settings = {}, onSeek }) {
  const prefix = 'pointer-' + useId();
  const pointers = useRef(new Map());
  const hoverRef = useRef(null);
  const [focused, setFocused] = useState(60);
  const [hint, setHint] = useState('');
  const low = range?.[0] ?? 48, high = range?.[1] ?? 84;
  const selected = Math.min(high, Math.max(low, focused));
  const velocity = depth => settings.pianoVelocityMode === 'position' ? 0.2 + 0.8 * Math.max(0, Math.min(1, depth)) : (settings.playVelocity ?? 0.72);
  const clear = () => { pointers.current.clear(); playInput.releasePrefix(prefix); hoverRef.current = null; };
  useEffect(() => { window.addEventListener('blur', clear); return () => { window.removeEventListener('blur', clear); clear(); }; }, [prefix, low, high]);
  const identify = event => {
    const target = pick(event);
    hoverRef.current = target?.midi ?? null;
    setHint(target?.midi != null ? `${noteName(target.midi)} · ${Math.round(velocity(target.depth) * 127)} velocity` : '');
    return target;
  };
  const end = event => { pointers.current.delete(event.pointerId); playInput.release(`${prefix}-${event.pointerId}`); };
  const handlers = {
    onPointerDown(event) {
      if (event.button !== 0) return;
      const target = identify(event);
      if (target?.midi == null) { if (target?.time != null) onSeek?.(target.time); return; }
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId);
      setFocused(target.midi); pointers.current.set(event.pointerId, target.midi);
      playInput.press(`${prefix}-${event.pointerId}`, target.midi, velocity(target.depth), {source:'piano-screen'});
    },
    onPointerMove(event) {
      const target = identify(event);
      if (!pointers.current.has(event.pointerId)) return;
      if (pointers.current.get(event.pointerId) === target?.midi) return;
      playInput.release(`${prefix}-${event.pointerId}`);
      pointers.current.set(event.pointerId, target?.midi ?? null);
      if (target?.midi != null) playInput.press(`${prefix}-${event.pointerId}`, target.midi, velocity(target.depth), {source:'piano-screen'});
    },
    onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end,
    onPointerLeave() { if (!pointers.current.size) { hoverRef.current = null; setHint(''); } },
    onFocus() { hoverRef.current = selected; },
    onBlur() { clear(); },
    onKeyDown(event) {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        let next = selected;
        if (event.key === 'ArrowLeft') next--;
        if (event.key === 'ArrowRight') next++;
        if (event.key === 'ArrowUp') next += 12;
        if (event.key === 'ArrowDown') next -= 12;
        if (event.key === 'Home') next = low;
        if (event.key === 'End') next = high;
        next = Math.min(high, Math.max(low, next));
        setFocused(next); hoverRef.current = next; setHint(noteName(next));
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) playInput.press(prefix+'-key', next, settings.playVelocity ?? 0.72);
      }
    },
    onKeyUp(event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); playInput.release(prefix+'-key'); } },
  };
  return { handlers, hoverRef, hint, selected, low, high, prefix };
}
