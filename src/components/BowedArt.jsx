import { memo } from 'react';
import { VIEW } from '../lib/bowedGeometry.js';
import { Bridge, FHoles, PEGS, Pegbox, Pegs, Scroll, Tailpiece } from './BowedHardware.jsx';

/**
 * The still parts of a violin or cello, drawn top-down with the scroll on the
 * left: scroll and pegbox, ebony fingerboard, spruce top with purfling and
 * f-holes, bridge and tailpiece. Strings, tapes, markers and touch zones are
 * drawn by BowedStage on top of this.
 *
 * Light falls from the upper left: every part carries a soft highlight on that
 * side, a contact shadow on the other, and a blurred shadow onto what is under it.
 */
const WOOD = {
  violin: { top: ['#f3b96f', '#d07f33', '#8a3c14', '#461b09'], maple: ['#d68a43', '#8e4719'], fScale: 1, body: 1, scroll: 44, purfling: 1 },
  cello: { top: ['#d9733f', '#a63f1c', '#601f0b', '#2c0e05'], maple: ['#c2692f', '#7a3514'], fScale: 1.22, body: 1.08, scroll: 48, purfling: 1.25 },
};

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

const stops = (list, offsets) => list.map((color, i) => <stop key={i} offset={offsets[i]} stopColor={color} />);

function Defs({ id, wood }) {
  return <defs>
    <radialGradient id={`${id}-top`} cx="78%" cy="50%" r="75%">{stops(wood.top, [0, .45, .8, 1])}</radialGradient>
    <linearGradient id={`${id}-maple`} x1="0" y1="0" x2="0" y2="1">{stops([wood.maple[1], wood.maple[0], wood.maple[1]], [0, .5, 1])}</linearGradient>
    <linearGradient id={`${id}-ebony`} x1="0" y1="0" x2="0" y2="1">{stops(['#3a302b', '#1a1513', '#0d0a09', '#2a2321'], [0, .2, .8, 1])}</linearGradient>
    <radialGradient id={`${id}-scroll`} cx="36%" cy="32%" r="72%">{stops(['#f0a860', wood.maple[0], wood.maple[1], '#4a1f0a'], [0, .35, .8, 1])}</radialGradient>
    <radialGradient id={`${id}-gloss`} cx="34%" cy="28%" r="62%">
      <stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset=".5" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
    </radialGradient>
    <radialGradient id={`${id}-peg`} cx="36%" cy="30%" r="80%">{stops(['#6a544a', '#2b201b', '#0d0908'], [0, .5, 1])}</radialGradient>
    <linearGradient id={`${id}-boxwood`} x1="0" y1="0" x2="1" y2="1">{stops(['#f2e0b0', '#d3b676', '#a58449'], [0, .5, 1])}</linearGradient>
    <radialGradient id={`${id}-metal`} cx="35%" cy="30%" r="75%">{stops(['#ffffff', '#cfcfd6', '#8a8a93'], [0, .5, 1])}</radialGradient>
    <linearGradient id={`${id}-bridge`} x1="0" y1="0" x2="1" y2="0">{stops(['#fbebc6', '#e8cc96', '#c79f62'], [0, .5, 1])}</linearGradient>
    <linearGradient id={`${id}-bone`} x1="0" y1="0" x2="1" y2="0">{stops(['#fffaf0', '#ebdfc6', '#bfae8a'], [0, .5, 1])}</linearGradient>
    <linearGradient id={`${id}-board-sheen`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset=".6" stopColor="#fff" stopOpacity=".04" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
    <linearGradient id={`${id}-varnish`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".3" stopColor="#fff" stopOpacity=".2" />
      <stop offset=".42" stopColor="#fff" stopOpacity="0" /><stop offset=".7" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
    <pattern id={`${id}-grain`} width="1200" height="5" patternUnits="userSpaceOnUse">
      <path d="M0 1 C300 .6 600 1.6 1200 1" stroke="#2a0e0430" strokeWidth=".9" fill="none" />
      <path d="M0 3 C400 2.7 800 3.4 1200 3" stroke="#fff3dc20" strokeWidth=".7" fill="none" />
      <path d="M0 4.4 C300 4.8 700 4 1200 4.4" stroke="#2a0e0418" strokeWidth=".6" fill="none" />
    </pattern>
    <linearGradient id={`${id}-rosin`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
    <filter id={`${id}-blur`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
    {/* Narrow shapes need a region measured in their own widths, or the blur is cut off at the sides. */}
    <filter id={`${id}-blur-narrow`} x="-200%" y="-15%" width="500%" height="130%"><feGaussianBlur stdDeviation="6" /></filter>
  </defs>;
}

/** Edge, purfling (black-white-black inlay) and varnish, painted inside the body clip. */
function Edge({ id, outline, k }) {
  const band = (inset, stroke, extra = {}) => <path d={outline} fill="none" stroke={stroke} strokeWidth={inset * 2 * k} {...extra} />;
  return <>
    {band(35, '#2a0f04', { strokeOpacity: .4 })}
    {band(13, '#160a04')}
    {band(10.6, '#f0dfb6', { strokeOpacity: .92 })}
    {band(8.2, '#160a04')}
    {band(6.6, `url(#${id}-top)`)}
    {band(1.2, '#ffe9c4', { strokeOpacity: .5 })}
  </>;
}

function BowedArt({ instrument, layout }) {
  const wood = WOOD[instrument] ?? WOOD.violin;
  const { nutX, bridgeX, fingerboardEnd: fbEnd, halfWidth, stringY, strings } = layout;
  const { cy, height: H } = VIEW;
  const hwN = halfWidth(nutX), hwE = halfWidth(fbEnd);
  const bodyX = Math.min(690, fbEnd - 186);
  const outline = bodyOutline(bodyX, cy, wood.body);
  const bridgeHalf = halfWidth(bridgeX) + 8;
  const id = instrument === 'cello' ? 'cello' : 'violin';
  const board = `M${nutX},${cy - hwN} L${fbEnd},${cy - hwE} Q${fbEnd + 22},${cy} ${fbEnd},${cy + hwE} L${nutX},${cy + hwN} Z`;
  return (
    <g className="bowed-art" aria-hidden="true">
      <Defs id={id} wood={wood} />

      {/* Body: drawn past the view box on purpose; the stage crops it like a photo. */}
      <clipPath id={`${id}-body-clip`}><path d={outline} /></clipPath>
      <path d={outline} transform="translate(8 18)" fill="#000" opacity=".34" filter={`url(#${id}-blur)`} />
      <path className="bowed-body" fill={`url(#${id}-top)`} d={outline} />
      <g clipPath={`url(#${id}-body-clip)`}>
        <rect x={bodyX - 10} y={-260} width={1000} height={H + 520} fill={`url(#${id}-grain)`} />
        <Edge id={id} outline={outline} k={wood.purfling} />
        <rect x={bodyX - 10} y={-260} width={1000} height={H + 520} fill={`url(#${id}-varnish)`} />
      </g>
      <FHoles bridgeX={bridgeX} cy={cy} offset={bridgeHalf + 4} scale={wood.fScale} />
      <rect x={layout.bow.x0} y={cy - halfWidth(layout.bow.x1)} width={layout.bow.x1 - layout.bow.x0} height={halfWidth(layout.bow.x1) * 2} fill={`url(#${id}-rosin)`} opacity=".22" />

      <Tailpiece id={id} tailX={bridgeX + 40} cy={cy} strings={strings} />
      <Bridge id={id} bridgeX={bridgeX} cy={cy} half={bridgeHalf} strings={strings} stringY={stringY} />

      {/* Neck: pegbox, pegs and scroll. */}
      <Pegbox id={id} cy={cy} nutX={nutX} hwN={hwN} />
      <Pegs id={id} cy={cy} nutX={nutX} hwN={hwN} cello={instrument === 'cello'} />
      <Scroll id={id} cy={cy} r={wood.scroll} />

      {/* Fingerboard: ebony, widening toward the body, with a rounded end. */}
      <path d={board} transform="translate(5 11)" fill="#000" opacity=".4" filter={`url(#${id}-blur)`} />
      <path className="bowed-fingerboard" d={board} fill={`url(#${id}-ebony)`} />
      <path d={board} fill={`url(#${id}-board-sheen)`} />
      <path d={`M${nutX},${cy - hwN + 2} L${fbEnd},${cy - hwE + 2}`} stroke="#fff" strokeOpacity=".22" strokeWidth="2" />
      <path d={`M${nutX},${cy + hwN - 1.5} L${fbEnd},${cy + hwE - 1.5}`} stroke="#000" strokeOpacity=".5" strokeWidth="2" />
      <rect x={nutX - 6} y={cy - hwN - 1} width="8" height={hwN * 2 + 2} rx="2.5" fill={`url(#${id}-bone)`} stroke="#a89878" />
      {Array.from({ length: strings }, (_, s) => (
        <line key={s} x1={nutX - 4} y1={stringY(s, nutX)} x2={PEGS[s].x} y2={cy + PEGS[s].side * 14} stroke="#c9c6c0" strokeWidth={1.2 + (strings - 1 - s) * 0.5} opacity=".85" />
      ))}
    </g>
  );
}

export default memo(BowedArt);
