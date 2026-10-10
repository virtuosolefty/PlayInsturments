/**
 * Which view of the instrument free play shows: the playable one that lessons
 * use, named for what it is (the fretboard, the fingerboard, the practice
 * kit), or the whole instrument. It is not called "Learn": the workspace
 * switch above the stage already has a Learn, and two of them on one screen
 * meant two different things. On a phone the buttons say only their `short`
 * name ("Frets", "Fingers", "Kit") and "Whole", leaving room for Reset view;
 * their names stay the full ones.
 *
 * @param {object} props
 * @param {'learn'|'whole'} props.value
 * @param {(value: 'learn'|'whole') => void} props.onChange
 * @param {string} props.label what the playable view is called on this stage
 * @param {string} props.short what it is called where there is no room for that
 */
export default function StageViewSwitch({ value, onChange, label, short }) {
  return (
    <div className="stage-view-toggle" role="group" aria-label="Stage view">
      <button type="button" aria-pressed={value === 'learn'} aria-label={label} onClick={() => onChange('learn')}><span className="stage-view-long">{label}</span><span className="stage-view-short" aria-hidden="true">{short}</span></button>
      <button type="button" aria-pressed={value === 'whole'} aria-label="Whole instrument" onClick={() => onChange('whole')}>Whole<span className="stage-view-more"> instrument</span></button>
    </div>
  );
}
