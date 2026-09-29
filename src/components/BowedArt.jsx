import { memo } from 'react';
import { VIEW } from '../lib/bowedGeometry.js';

/**
 * The still parts of a violin or cello, drawn top-down with the scroll on the
 * left: scroll and pegbox, ebony fingerboard, spruce top with f-holes, bridge
 * and tailpiece. Strings, tapes, markers and touch zones are drawn by
 * BowedStage on top of this.
 */
const WOOD = {
  violin: { top: ['#e3a257', '#c16f2b', '#7d3512', '#43190a'], maple: ['#c77a37', '#8e4719'], label: 'violin' },
  cello: { top: ['#d0773c', '#a24a1f', '#5f230c', '#301006'], maple: ['#b8652d', '#7a3514'], label: 'cello' },
};
// Violin pegs: G and D on the bass side, A and E on the treble side; the
// higher of each pair sits nearer the nut. Top of the drawing is the treble side.
const PEGS = [{ x: 118, side: 1 }, { x: 160, side: 1 }, { x: 128, side: -1 }, { x: 170, side: -1 }];

function spiral(cx, cy, r0, turns = 2.4) {
  const steps = 90, points = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = r0 - (r0 - 5) * (i / steps);
    points.push(`${(cx + r * Math.cos(t - 1.2)).toFixed(1)},${(cy + r * Math.sin(t - 1.2)).toFixed(1)}`);
  }
  return `M${points.join(' L')}`;
}

function fHole(x, y, flip) {
  const s = flip ? -1 : 1;
  return `M${x - 70},${y - s * 10} C${x - 46},${y - s * 22} ${x - 28},${y + s * 4} ${x},${y} S${x + 44},${y + s * 18} ${x + 66},${y + s * 7}`;
}

/** Violin-family outline from the neck root: upper bout, corners, C-bouts. */
function bodyOutline(x, cy, k = 1) {
  const half = (points, sign) => points.map(([px, py]) => `${x + px},${cy + sign * py * k}`).join(' ');
  const top = [
    ['C', [[0, 110], [52, 188], [142, 190]]],
    ['C', [[218, 192], [266, 176], [284, 170]]],
    ['C', [[296, 132], [330, 120], [400, 120]]],
    ['C', [[468, 120], [500, 132], [514, 172]]],
    ['C', [[545, 198], [610, 214], [720, 214]]],
  ];
  const upper = top.map(([cmd, pts]) => `${cmd}${half(pts, -1)}`).join(' ');
  const lower = [...top].reverse().map(([cmd, pts], i, all) => {
    const start = i + 1 < all.length ? all[i + 1][1][2] : [0, 0];
    return `${cmd}${half([pts[1], pts[0], start], 1)}`;
  }).join(' ');
  return `M${x},${cy} ${upper} L${x + 900},${cy - 214 * k} L${x + 900},${cy + 214 * k} L${x + 720},${cy + 214 * k} ${lower} Z`;
}

function BowedArt({ instrument, layout }) {
  const wood = WOOD[instrument] ?? WOOD.violin;
  const { nutX, bridgeX, fingerboardEnd: fbEnd, halfWidth, stringY, strings } = layout;
  const { cy, width: W, height: H } = VIEW;
  const hwN = halfWidth(nutX), hwE = halfWidth(fbEnd);
  const bodyX = Math.min(690, fbEnd - 186);
  const outline = bodyOutline(bodyX, cy, instrument === 'cello' ? 1.08 : 1);
  const scrollR = instrument === 'cello' ? 48 : 44;
  const pegboxEdge = x => 46 + (hwN - 46) * ((x - 100) / (nutX - 100));
  const tailX = bridgeX + 40;
  const bridgeHalf = halfWidth(bridgeX) + 8;
  const id = wood.label;
  return (
    <g className="bowed-art" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-top`} cx="78%" cy="50%" r="75%">
          <stop offset="0" stopColor={wood.top[0]} /><stop offset=".45" stopColor={wood.top[1]} />
          <stop offset=".8" stopColor={wood.top[2]} /><stop offset="1" stopColor={wood.top[3]} />
        </radialGradient>
        <linearGradient id={`${id}-maple`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wood.maple[1]} /><stop offset=".5" stopColor={wood.maple[0]} /><stop offset="1" stopColor={wood.maple[1]} />
        </linearGradient>
        <linearGradient id={`${id}-ebony`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2320" /><stop offset=".18" stopColor="#15110f" /><stop offset=".82" stopColor="#0f0c0b" /><stop offset="1" stopColor="#262020" />
        </linearGradient>
        <radialGradient id={`${id}-scroll`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={wood.maple[0]} /><stop offset="1" stopColor={wood.maple[1]} />
        </radialGradient>
        <pattern id={`${id}-grain`} width="1200" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 2 C300 1.4 600 2.8 1200 2" stroke="#2a0e0414" strokeWidth="1.1" fill="none" />
          <path d="M0 5.4 C400 5 800 6 1200 5.2" stroke="#fff3dc10" strokeWidth=".8" fill="none" />
        </pattern>
        <linearGradient id={`${id}-rosin`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Body: drawn past the view box on purpose; the stage crops it like a photo. */}
      <clipPath id={`${id}-body-clip`}><path d={outline} /></clipPath>
      <path d={outline} transform="translate(6 14)" fill="#000" opacity=".12" />
      <path className="bowed-body" fill={`url(#${id}-top)`} d={outline} />
      <g clipPath={`url(#${id}-body-clip)`}>
        <rect x={bodyX - 10} y={-260} width={1000} height={H + 520} fill={`url(#${id}-grain)`} />
        <path d={outline} fill="none" stroke="#1c0c06" strokeWidth="26" />
        <path d={outline} fill="none" stroke={`url(#${id}-top)`} strokeWidth="20" />
        <path d={outline} fill="none" stroke="#2a0f04" strokeOpacity=".38" strokeWidth="70" />
        <path d={outline} fill="none" stroke="#ffe7c2" strokeOpacity=".3" strokeWidth="4" />
      </g>
      {[-1, 1].map(side => <g key={side} className="bowed-fhole">
        <path d={fHole(bridgeX - 4, cy + side * (bridgeHalf + 22), side > 0)} fill="none" stroke="#150804" strokeWidth="6.5" strokeLinecap="round" />
        <circle cx={bridgeX - 76} cy={cy + side * (bridgeHalf + 22) - side * 10} r="6.5" fill="#150804" />
        <circle cx={bridgeX + 64} cy={cy + side * (bridgeHalf + 22) + side * 7} r="6.5" fill="#150804" />
        <path d={`M${bridgeX - 4},${cy + side * (bridgeHalf + 16)} l0,${side * 12}`} stroke="#150804" strokeWidth="2" />
      </g>)}
      <rect x={layout.bow.x0} y={cy - halfWidth(layout.bow.x1)} width={layout.bow.x1 - layout.bow.x0} height={halfWidth(layout.bow.x1) * 2} fill={`url(#${id}-rosin)`} opacity=".22" />

      {/* Tailpiece and fine tuners. */}
      <path d={`M${tailX},${cy - 50} L${tailX + 190},${cy - 66} Q${tailX + 214},${cy} ${tailX + 190},${cy + 66} L${tailX},${cy + 50} Q${tailX - 8},${cy} ${tailX},${cy - 50} Z`} fill={`url(#${id}-ebony)`} />
      {Array.from({ length: strings }, (_, s) => <g key={s}>
        <circle cx={tailX + 26} cy={cy + ((strings - 1) / 2 - s) * 24} r="6.5" fill="#c9c9cf" stroke="#6f6f76" strokeWidth="1.2" />
        <circle cx={tailX + 26} cy={cy + ((strings - 1) / 2 - s) * 24} r="2" fill="#77777e" />
      </g>)}

      {/* Bridge: maple, standing on two feet between the f-hole notches. */}
      <path className="bowed-bridge" d={`M${bridgeX - 7},${cy - bridgeHalf} Q${bridgeX + 2},${cy - bridgeHalf - 4} ${bridgeX + 7},${cy - bridgeHalf} L${bridgeX + 7},${cy + bridgeHalf} Q${bridgeX + 2},${cy + bridgeHalf + 4} ${bridgeX - 7},${cy + bridgeHalf} Z`} fill="#ecd1a1" stroke="#b58a52" strokeWidth="1.5" />
      <rect x={bridgeX - 11} y={cy - bridgeHalf - 2} width="22" height="16" rx="3" fill="#dcbd89" stroke="#b58a52" />
      <rect x={bridgeX - 11} y={cy + bridgeHalf - 14} width="22" height="16" rx="3" fill="#dcbd89" stroke="#b58a52" />

      {/* Neck: pegbox, pegs and scroll. */}
      <path d={`M${nutX},${cy - hwN} L100,${cy - 46} Q84,${cy} 100,${cy + 46} L${nutX},${cy + hwN} Z`} fill={`url(#${id}-maple)`} stroke="#3a1a0a" strokeWidth="1.5" />
      <path d={`M${nutX - 4},${cy - hwN + 11} L108,${cy - 33} Q100,${cy} 108,${cy + 33} L${nutX - 4},${cy + hwN - 11} Z`} fill="#140a06" />
      {PEGS.map(({ x, side }, s) => {
        const wall = cy + side * pegboxEdge(x);
        return <g key={s} className="bowed-peg">
          <line x1={x} y1={cy - side * 20} x2={x} y2={wall + side * 16} stroke="#1a110e" strokeWidth="7" strokeLinecap="round" />
          <rect x={x - 7} y={side > 0 ? wall + 2 : wall - 9} width="14" height="7" rx="2" fill="#d9bf8f" />
          <ellipse cx={x} cy={wall + side * 36} rx={instrument === 'cello' ? 19 : 16} ry={instrument === 'cello' ? 25 : 22} fill="#1b1311" stroke="#3a2b25" strokeWidth="1.5" />
          <ellipse cx={x - 4} cy={wall + side * 30} rx="5" ry="9" fill="#ffffff14" />
          <circle cx={x} cy={wall + side * 36} r="3.6" fill="#d9bf8f" />
        </g>;
      })}
      <circle cx={52} cy={cy} r={scrollR} fill={`url(#${id}-scroll)`} stroke="#3a1a0a" strokeWidth="1.5" />
      <path d={spiral(52, cy, scrollR - 6)} fill="none" stroke="#3b1a09" strokeWidth="3.4" strokeLinecap="round" opacity=".85" />
      <circle cx={52} cy={cy} r="5" fill="#2a1207" />

      {/* Fingerboard: ebony, widening toward the body, with a rounded end. */}
      <path className="bowed-fingerboard" d={`M${nutX},${cy - hwN} L${fbEnd},${cy - hwE} Q${fbEnd + 22},${cy} ${fbEnd},${cy + hwE} L${nutX},${cy + hwN} Z`} fill={`url(#${id}-ebony)`} />
      <path d={`M${nutX},${cy - hwN + 2} L${fbEnd},${cy - hwE + 2}`} stroke="#ffffff1c" strokeWidth="2" />
      <rect x={nutX - 6} y={cy - hwN - 1} width="8" height={hwN * 2 + 2} rx="2" fill="#efe4cc" stroke="#b9a98a" />
      {Array.from({ length: strings }, (_, s) => (
        <line key={s} x1={nutX - 4} y1={stringY(s, nutX)} x2={PEGS[s].x} y2={cy + PEGS[s].side * 14} stroke="#c9c6c0" strokeWidth={1.2 + (strings - 1 - s) * 0.5} opacity=".85" />
      ))}
    </g>
  );
}

export default memo(BowedArt);
