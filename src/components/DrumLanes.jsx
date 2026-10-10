import { useEffect, useRef } from 'react';
import { drumForMidi, drumLanes } from '../lib/drums.js';
import { STAGE_COLORS } from '../lib/stageColors.js';

const LABEL_WIDTH = 96;
const TOP = 24;

/**
 * Scrolling lanes, one a drum, top of the kit at the top: the drum notation a
 * beginner can read without learning a stave. A tile carries the key that
 * plays its drum. Hands are blue and the foot is amber, as on the piano roll.
 *
 * Part of the stage, so it is dark in both interface themes.
 */
export default function DrumLanes({ score, engine, pps }) {
  const ref = useRef(null);
  const live = useRef({ score, engine, pps });
  live.current = { score, engine, pps };
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let frame;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { score: piece, engine: e, pps: zoom } = live.current;
      const lanes = drumLanes(piece);
      const { width: w, height: h } = canvas.getBoundingClientRect();
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = e.transportRef.current?.now() ?? 0;
      const hit = LABEL_WIDTH + Math.min(64, w * 0.08);
      const speed = Math.max(60, Math.min(zoom * 0.9, w / 2.5));
      const lane = (h - TOP - 8) / lanes.length;
      const yOf = index => TOP + (index + 0.5) * lane;

      ctx.fillStyle = '#0e0e14'; ctx.fillRect(0, 0, w, h);
      const wash = ctx.createLinearGradient(hit, 0, w, 0);
      wash.addColorStop(0, '#252035'); wash.addColorStop(0.6, '#0e0e14');
      ctx.fillStyle = wash; ctx.fillRect(hit, 0, w - hit, h);

      const beat = 60 / piece.bpm;
      const beatsPerBar = piece.timeSignature?.[0] ?? 4;
      for (let b = Math.max(0, Math.floor(now / beat)); b < (now + w / speed) / beat; b += 1) {
        const x = hit + (b * beat - now) * speed;
        if (x < hit) continue;
        const bar = b % beatsPerBar === 0;
        ctx.strokeStyle = bar ? '#34344a' : '#1f1f2a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, TOP); ctx.lineTo(x, h - 8); ctx.stroke();
        ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillStyle = bar ? '#b9b9c8' : '#6f6f82';
        // The count a drummer says aloud: the bar number on one, then two, three, four.
        // Clear of the word PLAY over the line.
        if (x > hit + 22) ctx.fillText(bar ? `BAR ${b / beatsPerBar + 1}` : String((b % beatsPerBar) + 1), x + 5, 16);
      }

      lanes.forEach((drum, index) => {
        const y = yOf(index);
        ctx.strokeStyle = '#4a4a5e'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(LABEL_WIDTH, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.textAlign = 'left';
        ctx.font = '600 12px sans-serif'; ctx.fillStyle = '#d6d6e2';
        ctx.fillText(drum.short, 12, y + 4);
        ctx.font = '600 11px monospace'; ctx.fillStyle = '#8b8598';
        ctx.fillText(drum.key.toUpperCase(), LABEL_WIDTH - 16, y + 4);
      });

      ctx.fillStyle = STAGE_COLORS.hitLine; ctx.fillRect(hit - 1, TOP, 2, h - TOP - 8);
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PLAY', hit, 16);

      const laneOf = new Map(lanes.map((drum, index) => [drum.id, index]));
      const size = Math.max(16, Math.min(26, lane * 0.7));
      const targets = e.sessionRef.current?.targets ?? piece.notes;
      for (const note of targets) {
        const drum = drumForMidi(note.midi);
        const index = drum ? laneOf.get(drum.id) : undefined;
        if (index === undefined) continue;
        const x = hit + (note.time - now) * speed;
        if (x < LABEL_WIDTH + size / 2 || x > w + size) continue;
        const y = yOf(index);
        const color = note.status === 'hit' ? STAGE_COLORS.hit : note.status === 'missed' ? STAGE_COLORS.miss : drum.limb === 'foot' ? STAGE_COLORS.noteLeft : STAGE_COLORS.noteRight;
        ctx.globalAlpha = x < hit - 10 ? 0.45 : 1;
        ctx.fillStyle = '#211d2e'; ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x - size / 2, y - size / 2, size, size, 5); ctx.fill();
        // A missed hit is told by its shape as well as its colour: a broken outline.
        ctx.setLineDash(note.status === 'missed' ? [3, 3] : []); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.font = `700 ${Math.round(size * 0.55)}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(drum.key.toUpperCase(), x, y + size * 0.2);
        ctx.globalAlpha = 1;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  const lanes = drumLanes(score);
  const label = `Drum lanes, top to bottom: ${lanes.map(drum => drum.short).join(', ')}. Each tile shows the key that plays its drum. Hit it as it reaches the vertical line.`;
  return <canvas ref={ref} className="guitar-tab drum-lanes" role="img" aria-label={label} data-lanes={lanes.length} />;
}
