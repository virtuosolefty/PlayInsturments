import { useRef } from 'react';
export default function SurfaceDivider({ value, onChange, label = 'Instrument height', min = 140, max = 230 }) {
  const drag = useRef(null);
  const set = v => onChange(Math.max(min,Math.min(max,Math.round(v))));
  return <div className="surface-divider" role="separator" tabIndex={0} aria-label={label} aria-orientation="horizontal" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    onPointerDown={e=>{drag.current={y:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)set(drag.current.value+drag.current.y-e.clientY);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();set(e.key==='Home'?min:e.key==='End'?max:value+(e.key==='ArrowUp'?10:-10));}}}><i/></div>;
}
