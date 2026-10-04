import { STRING_FONT_MAX } from '../lib/guitarStageView.js';

/**
 * The text a 3D string stage writes over the instrument (guitarStageView.js
 * `stageLabels`, bowedStageView.js `bowedLabels`), with a leader from each
 * string name that had to move off its string back to where the string leaves
 * the nut. A string name shows its number and its pitch in separate parts, so
 * the pitch can be found on its own.
 *
 * @param {object} props
 * @param {object[]} props.labels
 * @param {number} props.labelSize the chosen text size; string names are drawn no larger than STRING_FONT_MAX
 * @param {boolean} [props.decorative] hide the labels from assistive technology, where controls elsewhere say the same
 */
export default function StageLabels({ labels, labelSize, decorative = false }) {
  const leaders = labels.filter(label => label.leader);
  return <>
    {leaders.length > 0 && <svg className="guitar-stage-leaders" aria-hidden="true">
      {leaders.map(({ leader: { from, to } }, i) => <g key={i}>
        <line className="halo" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      </g>)}
    </svg>}
    {labels.map((label, i) => <span key={i} aria-hidden={decorative || undefined}
      className={`guitar-position-label ${label.kind}${label.root ? ' root' : ''}`}
      style={{ left: label.x, top: label.y, fontSize: label.kind === 'string' ? Math.min(labelSize, STRING_FONT_MAX) : labelSize }}>
      {label.number == null ? label.text : <><span className="string-number">{label.number}</span> <span className="string-note">{label.text}</span></>}
    </span>)}
  </>;
}
