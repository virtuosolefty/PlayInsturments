import { noteName } from './theory.js';
import { PIANO_COLORS, handColor, handEdge, keyLight, noteColor, stageNoteBounds } from './pianoStage.js';
import { roundRect } from './rollPaint.js';

/** Shared note faces, rims and strike light for the flat and Three.js stages. */
export function paintStageNotes(ctx, { notes, geometry, now, pps, hitLine, project = (x,y) => ({x,y}), depth = 0, labels = 'note', faces = true, calm = false, ghost }) {
  for (const note of notes ?? []) {
    const key = geometry.keys.get(note.midi);
    const box = stageNoteBounds(note, key, now, pps, hitLine);
    if (!box) continue;
    // Keep the glow on the top face of a 3D bevel; an outline around its whole
    // silhouette conceals the shaded sides and makes the prism look flat.
    const ix=faces?0:box.w*.045, iy=faces?0:box.h*.045;
    const a=project(box.x+ix,box.top+iy,depth), b=project(box.x+box.w-ix,box.top+iy,depth);
    const c=project(box.x+box.w-ix,box.bottom-iy,depth), d=project(box.x+ix,box.bottom-iy,depth);
    const color=noteColor(note), edge=note.status==='hit'||note.status==='missed'?color:handEdge(note);
    const approach=Math.max(0,1-Math.max(0,note.time-now)/1.4);
    ctx.save();
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();
    if (faces) {
      const fill=ctx.createLinearGradient(a.x,a.y,c.x,c.y);
      fill.addColorStop(0,color+'aa');fill.addColorStop(1,color+'ed');
      ctx.fillStyle=fill;ctx.fill();
    }
    ctx.shadowColor=handColor(note);ctx.shadowBlur=calm?3:faces?8+approach*8:3+approach*5;
    ctx.strokeStyle=edge;ctx.lineWidth=faces?1.2+approach*.4:.8+approach*.3;ctx.lineJoin='round';ctx.stroke();
    ctx.shadowBlur=0;
    if(labels!=='none' && c.x-d.x>13 && d.y-a.y>15) {
      const p=project(key.center,box.bottom-iy-5,depth);
      ctx.fillStyle=PIANO_COLORS.noteInk;ctx.font='500 11px Inter, sans-serif';ctx.textAlign='center';
      ctx.fillText(labels==='finger'&&note.finger?String(note.finger):noteName(note.midi).replace(/-?\d+$/,''),p.x,p.y,Math.max(9,c.x-d.x-2));
    }
    const delta=ghost?.deltas?.[note.id];
    const gy=hitLine-(note.time+(delta??0)/1000-now)*pps;
    if(Number.isFinite(delta)&&Math.abs(delta)>12&&gy>0&&gy<hitLine){
      const l=project(box.x-2,gy,depth),r=project(box.x+box.w+2,gy,depth);
      ctx.strokeStyle=PIANO_COLORS.ghost;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(r.x,r.y);ctx.stroke();
    }
    ctx.restore();
  }
}

export function paintChordLabels(ctx, chords, { now, pps, hitLine, geometry, project=(x,y)=>({x,y}) }) {
  let previousY=-Infinity;
  for(const chord of chords){
    const y=hitLine-(chord.time-now)*pps;
    if(y<20||y>hitLine-12)continue;
    const key=geometry.keys.get(chord.midi);
    if(!key)continue;
    const p=project(Math.max(4,key.x-16),y-8,0);
    if(Math.abs(p.y-previousY)<20)continue;
    ctx.save();ctx.font='12px Inter, sans-serif';ctx.textAlign=key.x>65?'right':'left';
    ctx.fillStyle='#c8bfd7';ctx.shadowColor=PIANO_COLORS.bg;ctx.shadowBlur=5;
    ctx.fillText(chord.symbol,p.x,p.y);ctx.restore();previousY=p.y;
  }
}

export function paintStrike(ctx, { geometry, layout, activeInput, sounding, playback, project=(x,y)=>({x,y}), depth=0, calm=false }) {
  const y=layout.keyboardTop, a=project(0,y,depth), b=project(layout.w,y,depth);
  ctx.save();ctx.strokeStyle='#f8efff';ctx.lineWidth=1.2;ctx.shadowColor='#ded0ff';ctx.shadowBlur=calm?3:7;
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.shadowBlur=0;
  for(const key of geometry.keys.values()){
    const color=keyLight(key.midi,activeInput,sounding,playback);
    if(!color)continue;
    const p=project(key.center,y,depth), l=project(key.x,y,depth),r=project(key.x+key.w,y,depth);
    const radius=Math.max(12,(r.x-l.x)*1.1);
    const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);
    glow.addColorStop(0,color+'a0');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*1.5);
    ctx.shadowColor=color;ctx.shadowBlur=calm?4:14;ctx.fillStyle='#fff5ea';
    roundRect(ctx,l.x+1,p.y-1,Math.max(1,r.x-l.x-2),2,1);ctx.fill();ctx.shadowBlur=0;
  }
  ctx.restore();
}
