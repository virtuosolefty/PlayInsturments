import { useEffect, useRef } from 'react';
import { stringKit } from '../lib/instruments.js';
import { STAGE_COLORS } from '../lib/stageColors.js';

/**
 * Scrolling string lanes, highest string at the top.
 *
 * A fretted instrument (guitar, bass) shows fret numbers, as
 * tablature does. A bowed one shows the finger to use, with the note name
 * above it, because bowed music is read by finger.
 *
 * The tab is part of the stage, which is dark in both interface themes.
 */
export default function StringTab({ instrument = 'guitar', score, engine, pps }) {
  const ref = useRef(null);
  const live = useRef({ score, engine, pps });
  live.current = { score, engine, pps };
  const kit = stringKit(instrument) ?? stringKit('guitar');
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const count = kit.tuning.length;
    const order = Array.from({ length: count }, (_, i) => count - 1 - i);
    let frame;
    const draw = () => {
      const { score: piece, engine: e, pps: zoom } = live.current;
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const now = e.transportRef.current?.now() ?? 0;
      const hit = Math.min(100, w * 0.2);
      const speed = Math.max(48, Math.min(zoom * 0.8, w / 3));
      const lane = (h - 32) / count;
      const yOf = s => 24 + (count - 1 - s + 0.5) * lane;
      ctx.fillStyle = '#0e0e14'; ctx.fillRect(0, 0, w, h);
      const wash = ctx.createLinearGradient(hit, 0, w, 0);
      wash.addColorStop(0, '#252035'); wash.addColorStop(0.6, '#0e0e14');
      ctx.fillStyle = wash; ctx.fillRect(hit, 0, w - hit, h);
      const beat = 60 / piece.bpm;
      const beatsPerBar = piece.timeSignature?.[0] ?? 4;
      for (let b = Math.max(0, Math.floor(now / beat)); b < (now + w / speed) / beat; b++) {
        const x = hit + (b * beat - now) * speed;
        ctx.strokeStyle = b % beatsPerBar === 0 ? '#34344a' : '#1f1f2a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, h - 8); ctx.stroke();
        if (b % beatsPerBar === 0 && x > hit + 24) { ctx.font = '11px sans-serif'; ctx.fillStyle = '#b9b9c8'; ctx.fillText(`BAR ${b / beatsPerBar + 1}`, x + 6, 16); }
      }
      order.forEach(s => {
        const y = yOf(s), name = kit.stringName(s);
        ctx.strokeStyle = '#4a4a5e'; ctx.lineWidth = 1 + (count - 1 - s) * (kit.bowed ? 0.3 : 0.14);
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.font = '600 13px sans-serif'; ctx.fillStyle = '#b9b9c8';
        ctx.fillText(name.note, 24, y + 4);
        ctx.font = '9px sans-serif'; ctx.fillStyle = '#8b8598'; ctx.fillText(String(name.number), 10, y + 3);
      });
      ctx.fillStyle = STAGE_COLORS.hitLine; ctx.fillRect(hit - 1, 24, 2, h - 32);
      ctx.font = '10px sans-serif'; ctx.fillText('PLAY', hit - 13, 16);
      const targets = e.sessionRef.current?.targets ?? piece.notes;
      targets.forEach(n => {
        if (n.string === undefined) return;
        const x = hit + (n.time - now) * speed, y = yOf(n.string);
        if (x < 45 || x > w + 25) return;
        const color = n.status === 'hit' ? STAGE_COLORS.hit : n.status === 'missed' ? STAGE_COLORS.miss : STAGE_COLORS.noteRight;
        ctx.globalAlpha = x < hit - 12 ? 0.5 : 1;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(w, x + n.duration * speed), y); ctx.stroke();
        const radius = Math.min(11, lane * 0.46);
        ctx.fillStyle = '#211d2e'; ctx.beginPath(); ctx.roundRect(x - 12, y - radius, 24, radius * 2, 4); ctx.fill();
        // A missed note is told by its shape as well as its colour: a broken outline.
        ctx.setLineDash(n.status === 'missed' ? [3, 3] : []); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(String(kit.bowed ? (n.finger ?? '·') : n.fret), x, y + 4);
        if (kit.bowed && lane > 34) { ctx.font = '600 10px sans-serif'; ctx.fillText(n.name.replace(/\d/g, ''), x, y - radius - 4); }
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [kit]);
  const label = kit.bowed
    ? `${kit.label} finger chart: ${kit.stringName(kit.tuning.length - 1).note} string at the top, ${kit.stringName(0).note} string at the bottom. Numbers are fingers; 0 is an open string. Play them as they reach the vertical line.`
    : `${kit.label} tablature: ${kit.id === 'guitar' ? 'high E at the top, low E at the bottom' : `string 1 (${kit.stringName(kit.tuning.length - 1).note}) at the top, string ${kit.tuning.length} (${kit.stringName(0).note}) at the bottom`}. Play numbered frets as they reach the vertical line.`;
  return <canvas ref={ref} className="guitar-tab" role="img" aria-label={label} />;
}
