/**
 * Which view of the instrument free play shows: Learn, the playable
 * fingerboard map that lessons use, or the whole instrument.
 *
 * @param {object} props
 * @param {'learn'|'whole'} props.value
 * @param {(value: 'learn'|'whole') => void} props.onChange
 */
export default function StageViewSwitch({ value, onChange }) {
  return (
    <div className="stage-view-toggle" role="group" aria-label="Stage view">
      <button type="button" aria-pressed={value === 'learn'} onClick={() => onChange('learn')}>Learn</button>
      <button type="button" aria-pressed={value === 'whole'} onClick={() => onChange('whole')}>Whole instrument</button>
    </div>
  );
}
