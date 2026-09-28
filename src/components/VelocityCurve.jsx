import { applyCurve, IDENTITY_CURVE, isIdentity } from '../lib/velocity.js';

/**
 * The correction curve, drawn.
 *
 * Lifted from how piano plug-ins draw the same thing, with one change that
 * matters: the vertical axis is labelled in dynamics markings rather than in
 * MIDI numbers. Pianoteq does this too, and it is right for the same reason
 * here and more so — the score this app judges you against is written in ppp
 * to fff, so those are the units the answer belongs in. "Your mezzo-forte
 * comes out at 78" is a fact about a protocol.
 *
 * Horizontal is what your controller reports, 0 to 127, because that is the
 * thing you cannot change and are working around.
 */

/** Where each marking sits on the corrected axis. */
const DYNAMICS = [
  ['fff', 1],
  ['ff', 0.85],
  ['f', 0.7],
  ['mf', 0.55],
  ['mp', 0.42],
  ['p', 0.28],
  ['pp', 0.15],
  ['ppp', 0],
];

const W = 200;
const H = 150;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 6;
const PAD_R = 6;

const px = (v) => PAD_L + v * (W - PAD_L - PAD_R);
const py = (v) => H - PAD_B - v * (H - PAD_B - PAD_T);

export default function VelocityCurve({ curve = IDENTITY_CURVE, points = null }) {
  const active = !isIdentity(curve);

  // Sampled rather than drawn from the control points: this then renders any
  // curve shape correctly, including the identity, without a second code path.
  const line = Array.from({ length: 33 }, (_, i) => {
    const x = i / 32;
    return `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(applyCurve(x, curve)).toFixed(1)}`;
  }).join(' ');

  return (
    <div className={`velocity-curve ${active ? 'on' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={
        active
          ? 'Your velocity curve: the range your keyboard reports, mapped onto the range the music is written in'
          : 'No velocity correction — your keyboard is judged exactly as it reports'
      }>
        {DYNAMICS.map(([label, at]) => (
          <g key={label}>
            <line className="grid" x1={PAD_L} x2={W - PAD_R} y1={py(at)} y2={py(at)} />
            <text className="axis" x={PAD_L - 4} y={py(at) + 3} textAnchor="end">
              {label}
            </text>
          </g>
        ))}

        {[0, 0.25, 0.5, 0.75, 1].map((at) => (
          <g key={at}>
            <line className="grid" x1={px(at)} x2={px(at)} y1={PAD_T} y2={H - PAD_B} />
            <text className="axis" x={px(at)} y={H - 4} textAnchor="middle">
              {Math.round(at * 127)}
            </text>
          </g>
        ))}

        {/* What no correction would look like, kept underneath so the shape of
            the correction is legible as a departure from it. */}
        {active && (
          <line className="identity" x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} />
        )}

        <path className="curve" d={line} />

        {points &&
          ['soft', 'normal', 'hard'].map((k) => (
            <circle key={k} className="point" cx={px(points[k])} cy={py(applyCurve(points[k], curve))} r="3" />
          ))}
      </svg>
    </div>
  );
}
