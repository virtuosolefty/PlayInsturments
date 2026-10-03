/**
 * Shaded fittings for the drawn violin / cello: scroll, pegs, f-holes, bridge
 * and tailpiece. Gradients and the blur filter they reference are defined once
 * in BowedArt's <defs> under the same `id` prefix.
 */

// Violin pegs: G and D on the bass side, A and E on the treble side; the
// higher of each pair sits nearer the nut. Top of the drawing is the treble side.
export const PEGS = [{ x: 118, side: 1 }, { x: 160, side: 1 }, { x: 128, side: -1 }, { x: 170, side: -1 }];

const SCROLL_X = 52;

function spiral(cx, cy, r0, turns = 2.4) {
  const steps = 90, points = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = r0 - (r0 - 5) * (i / steps);
    points.push(`${(cx + r * Math.cos(t - 1.2)).toFixed(1)},${(cy + r * Math.sin(t - 1.2)).toFixed(1)}`);
  }
  return `M${points.join(' L')}`;
}

function arc(cx, cy, r, from, to) {
  const at = deg => `${(cx + r * Math.cos(deg * Math.PI / 180)).toFixed(1)},${(cy + r * Math.sin(deg * Math.PI / 180)).toFixed(1)}`;
  return `M${at(from)} A${r},${r} 0 0 1 ${at(to)}`;
}

export function Scroll({ id, cy, r }) {
  return <g className="bowed-scroll">
    <ellipse cx={SCROLL_X + 5} cy={cy + 9} rx={r} ry={r * 0.96} fill="#000" opacity=".3" filter={`url(#${id}-blur)`} />
    <circle cx={SCROLL_X} cy={cy} r={r} fill={`url(#${id}-scroll)`} stroke="#2e1406" strokeWidth="1.6" />
    <circle cx={SCROLL_X} cy={cy} r={r - 3.6} fill="none" stroke="#2a1006" strokeOpacity=".45" strokeWidth="1" />
    <path d={arc(SCROLL_X, cy, r - 1.8, 195, 285)} fill="none" stroke="#ffe6bd" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
    <path d={arc(SCROLL_X, cy, r - 1.8, 15, 95)} fill="none" stroke="#1c0b04" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
    <path d={spiral(SCROLL_X + 1.4, cy + 1.8, r - 6)} fill="none" stroke="#ffd9a3" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
    <path d={spiral(SCROLL_X, cy, r - 6)} fill="none" stroke="#2c1206" strokeOpacity=".9" strokeWidth="3.6" strokeLinecap="round" />
    <circle cx={SCROLL_X} cy={cy} r="5.4" fill="#22100a" />
    <circle cx={SCROLL_X - 1.5} cy={cy - 1.8} r="1.8" fill="#ffe6bd" opacity=".5" />
    <circle cx={SCROLL_X} cy={cy} r={r} fill={`url(#${id}-gloss)`} />
  </g>;
}

export function Pegbox({ id, cy, nutX, hwN }) {
  return <g className="bowed-pegbox">
    <path d={`M${nutX},${cy - hwN + 6} L102,${cy - 40} L102,${cy + 60} L${nutX},${cy + hwN + 8} Z`} fill="#000" opacity=".28" filter={`url(#${id}-blur)`} />
    <path d={`M${nutX},${cy - hwN} L100,${cy - 46} Q84,${cy} 100,${cy + 46} L${nutX},${cy + hwN} Z`} fill={`url(#${id}-maple)`} stroke="#2e1406" strokeWidth="1.5" />
    <path d={`M${nutX - 4},${cy - hwN + 11} L108,${cy - 33} Q100,${cy} 108,${cy + 33} L${nutX - 4},${cy + hwN - 11} Z`} fill="#0f0704" />
    <path d={`M${nutX},${cy - hwN + 1.5} L100.5,${cy - 45}`} stroke="#ffe0b0" strokeOpacity=".45" strokeWidth="1.4" fill="none" />
    <path d={`M${nutX},${cy + hwN - 1.5} L100.5,${cy + 45}`} stroke="#1c0b04" strokeOpacity=".5" strokeWidth="1.4" fill="none" />
  </g>;
}

export function Pegs({ id, cy, nutX, hwN, cello }) {
  const edge = x => 46 + (hwN - 46) * ((x - 100) / (nutX - 100));
  return PEGS.map(({ x, side }, s) => {
    const wall = cy + side * edge(x), hy = wall + side * 36, rx = cello ? 19 : 16, ry = cello ? 25 : 22;
    return <g key={s} className="bowed-peg">
      <ellipse cx={x + 3} cy={hy + 6} rx={rx} ry={ry} fill="#000" opacity=".34" filter={`url(#${id}-blur)`} />
      <line x1={x} y1={cy - side * 20} x2={x} y2={wall + side * 16} stroke="#1a110e" strokeWidth="7" strokeLinecap="round" />
      <rect x={x - 7.5} y={side > 0 ? wall + 1.5 : wall - 9.5} width="15" height="8" rx="2.5" fill={`url(#${id}-boxwood)`} stroke="#8d7143" strokeWidth=".8" />
      <ellipse cx={x} cy={hy} rx={rx} ry={ry} fill={`url(#${id}-peg)`} stroke="#050303" strokeWidth="1.5" />
      <ellipse cx={x} cy={hy} rx={rx - 3.4} ry={ry - 3.4} fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="1" />
      <ellipse cx={x - rx * 0.28} cy={hy - side * ry * 0.28 - ry * 0.12} rx={rx * 0.34} ry={ry * 0.38} fill={`url(#${id}-gloss)`} opacity=".9" />
      <circle cx={x} cy={hy} r="4" fill={`url(#${id}-boxwood)`} stroke="#6f5530" strokeWidth=".8" />
    </g>;
  });
}

/** One f-hole: long axis along the strings, a small eye toward the neck, a larger one toward the tail. */
function fHolePath(L) {
  const h = L / 2;
  return `M${-h},-9 C${-h * 0.5},-15 ${-h * 0.35},8 0,8 S${h * 0.55},12 ${h},17`;
}

export function FHoles({ bridgeX, cy, offset, scale, tilt = 4 }) {
  const L = 150 * scale, h = L / 2;
  return [-1, 1].map(side => <g key={side} className="bowed-fhole" transform={`translate(${bridgeX} ${cy + side * offset}) scale(1 ${side}) rotate(${-tilt})`}>
    <path d={fHolePath(L)} fill="none" stroke="#ffe6bd" strokeOpacity=".28" strokeWidth="8.6" strokeLinecap="round" transform="translate(0 1.4)" />
    <path d={fHolePath(L)} fill="none" stroke="#0e0502" strokeWidth="6" strokeLinecap="round" />
    <circle cx={-h} cy="-9" r={6.6 * scale} fill="#0e0502" stroke="#ffe6bd" strokeOpacity=".28" strokeWidth="1.4" />
    <circle cx={h} cy="17" r={8.6 * scale} fill="#0e0502" stroke="#ffe6bd" strokeOpacity=".28" strokeWidth="1.4" />
    <path d="M-2.4,12 l0,-5.5 M2.4,12 l0,-5.5" stroke="#0e0502" strokeWidth="1.8" strokeLinecap="round" />
  </g>);
}

export function Tailpiece({ id, tailX, cy, strings }) {
  const shape = `M${tailX},${cy - 50} L${tailX + 190},${cy - 66} Q${tailX + 214},${cy} ${tailX + 190},${cy + 66} L${tailX},${cy + 50} Q${tailX - 8},${cy} ${tailX},${cy - 50} Z`;
  return <g className="bowed-tailpiece">
    <path d={shape} transform="translate(6 12)" fill="#000" opacity=".32" filter={`url(#${id}-blur)`} />
    <path d={shape} fill={`url(#${id}-ebony)`} stroke="#050303" strokeWidth="1.2" />
    <path d={`M${tailX + 4},${cy - 44} L${tailX + 186},${cy - 59}`} stroke="#fff" strokeOpacity=".16" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d={`M${tailX + 150},${cy} h40`} stroke={`url(#${id}-boxwood)`} strokeWidth="3" strokeLinecap="round" />
    {Array.from({ length: strings }, (_, s) => {
      const y = cy + ((strings - 1) / 2 - s) * 24;
      return <g key={s}>
        <circle cx={tailX + 28} cy={y + 2} r="8" fill="#000" opacity=".4" />
        <circle cx={tailX + 26} cy={y} r="7.4" fill={`url(#${id}-metal)`} stroke="#5a5a62" strokeWidth="1" />
        <circle cx={tailX + 26} cy={y} r="2.4" fill="#4f4f57" />
        <path d={`M${tailX + 21},${y - 2.5} A6,6 0 0 1 ${tailX + 27},${y - 6}`} stroke="#fff" strokeOpacity=".8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>;
    })}
  </g>;
}

export function Bridge({ id, bridgeX, cy, half, strings, stringY }) {
  const body = `M${bridgeX - 7},${cy - half} Q${bridgeX + 2},${cy - half - 4} ${bridgeX + 7},${cy - half} L${bridgeX + 7},${cy + half} Q${bridgeX + 2},${cy + half + 4} ${bridgeX - 7},${cy + half} Z`;
  return <g className="bowed-bridge">
    <path d={body} transform="translate(9 5)" fill="#000" opacity=".4" filter={`url(#${id}-blur-narrow)`} />
    <path d={body} fill={`url(#${id}-bridge)`} stroke="#9c733c" strokeWidth="1.3" />
    <path d={`M${bridgeX - 5.4},${cy - half + 4} V${cy + half - 4}`} stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" />
    {[cy - half - 2, cy + half - 14].map(y => <rect key={y} x={bridgeX - 11} y={y} width="22" height="16" rx="4" fill={`url(#${id}-bridge)`} stroke="#9c733c" strokeWidth="1.2" />)}
    {Array.from({ length: strings }, (_, s) => <rect key={s} x={bridgeX - 3} y={stringY(s, bridgeX) - 1.8} width="6" height="3.6" rx="1.6" fill="#5a3d1a" opacity=".7" />)}
  </g>;
}
