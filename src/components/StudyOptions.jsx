/**
 * The choices in a workspace's Exercise list: the instrument's lessons, then
 * its songs (on the drums, its beats) under a heading of their own, so a tune
 * someone came for is not lost among the scales.
 *
 * @param {object} props
 * @param {{ lessons: object[], songs: object[], songsLabel: string }} props.kit from instruments.js
 */
export default function StudyOptions({ kit }) {
  const option = study => <option key={study.id} value={study.id}>{study.title}</option>;
  return <>
    <optgroup label="Lessons">{kit.lessons.map(option)}</optgroup>
    <optgroup label={kit.songsLabel}>{kit.songs.map(option)}</optgroup>
  </>;
}
