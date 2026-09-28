import { isC } from './keyboard.js';
import { pianoLabel } from './instrumentView.js';
import { KEYBOARD_H } from './rollGeometry.js';
import { BLACK_H_RATIO, roundRect } from './rollPaint.js';
import { keyLight } from './pianoStage.js';
export function drawKeyboard(ctx, geom, activeInput, soundingNow, w, keyboardTop, options = {}) {
  const height = options.height ?? KEYBOARD_H;
  ctx.fillStyle = '#17121f'; ctx.fillRect(0,keyboardTop,w,height);
  const draw = key => {
    const pressed=activeInput.get(key.midi), hover=key.midi===options.hover;
    const tint=keyLight(key.midi,activeInput,soundingNow,options.playback);
    const top=keyboardTop+2+(tint?2:0), h=(key.black?height*BLACK_H_RATIO:height-5)-(tint?2:0);
    const face=ctx.createLinearGradient(0,top,0,top+h);
    face.addColorStop(0,tint??(key.black?'#24202d':'#bab7c3'));
    face.addColorStop(.18,tint??(key.black?'#17141e':'#dddae3'));
    face.addColorStop(1,tint??(key.black?'#0e0c14':'#e8e5ec'));
    ctx.save(); if(key.black){ctx.shadowColor='#00000040';ctx.shadowBlur=3;ctx.shadowOffsetY=3;}
    ctx.fillStyle=face;roundRect(ctx,key.x+.5,top,key.w-1,h-1,2);ctx.fill();ctx.restore();
    ctx.fillStyle=key.black?'#ffffff10':'#00000020';ctx.fillRect(key.x+1,top+h-4,key.w-2,2);
    if(hover){ctx.strokeStyle=key.black?'#c3b5ff':'#6251b7';ctx.lineWidth=2;roundRect(ctx,key.x+2,top+2,key.w-4,h-5,2);ctx.stroke();}
    if(pressed&&pressed.type!=='free'){ctx.fillStyle='#35263d';ctx.font='bold 12px Inter, sans-serif';ctx.textAlign='center';ctx.fillText(pressed.type==='wrong'?'×':pressed.type==='timing'?'~':'✓',key.center,top+h-26);}
    if(key.w>=24||isC(key.midi)){
      ctx.fillStyle=tint?'#35263d':key.black?'#b9b2c5':'#615b6e';ctx.font='10px Inter, sans-serif';ctx.textAlign='center';
      ctx.fillText(pianoLabel(key.midi,options.labels,options.octave),key.center,top+h-10,Math.max(12,key.w-2));
    }
  };
  for(const key of geom.keys.values())if(!key.black)draw(key);
  for(const key of geom.keys.values())if(key.black)draw(key);
}
