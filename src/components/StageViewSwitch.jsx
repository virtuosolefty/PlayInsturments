/**
 * Which view of the instrument free play shows: Learn, the playable
 * fingerboard map that lessons use, or the whole instrument. On a phone the
 * second button says only "Whole", leaving room for Reset view; its name stays
 * "Whole instrument".
 *
 * @param {object} props
 * @param {'learn'|'whole'} props.value
 * @param {(value: 'learn'|'whole') => void} props.onChange
 */
export default function StageViewSwitch({ value, onChange }) {
  return (
    <div className="stage-view-toggle" role="group" aria-label="Stage view">
      <button type="button" aria-pressed={value === 'learn'} onClick={() => onChange('learn')}>Learn</button>
      <button type="button" aria-pressed={value === 'whole'} aria-label="Whole instrument" onClick={() => onChange('whole')}>Whole<span className="stage-view-more"> instrument</span></button>
    </div>
  );
}
