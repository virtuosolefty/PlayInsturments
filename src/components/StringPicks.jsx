import { noteName } from '../lib/theory.js';

/**
 * One button for each string of a fretted instrument, to hear it: the chord
 * explorer's (a muted string is greyed out) and the open-strings card's.
 *
 * @param {object} props
 * @param {object} props.kit the instrument (instruments.js)
 * @param {string} props.label the group's accessible name
 * @param {(string: number) => { fret: number, midi: number, note: string } | null} props.placeOf where string `s` is played, or null where it is muted
 * @param {(position: { string: number, fret: number }) => void} props.onPick
 * @param {{ current: Map<number, { fret: number }> }} props.activePositions what is sounding now
 * @param {boolean} [props.leftHanded] lists the strings the other way round
 */
export default function StringPicks({ kit, label, placeOf, onPick, activePositions, leftHanded = false }) {
  const count = kit.tuning.length;
  const strings = Array.from({ length: count }, (_, s) => s);
  const order = leftHanded ? [...strings].reverse() : strings;
  return <div className="chord-audition"><span>Pick a string <small>{leftHanded ? `1 → ${count} · mirrored` : `${count} → 1`}</small></span>
    <div className="chord-string-picks" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${count},minmax(0,1fr))` }}>{order.map(s => {
      const place = placeOf(s), number = kit.stringName(s).number;
      return <button key={s} disabled={!place} className={place && activePositions.current.get(s)?.fret === place.fret ? 'sounding' : ''}
        aria-label={place ? `Pick string ${number}: ${noteName(place.midi)}` : `String ${number} muted`} onClick={() => onPick({ string: s, fret: place.fret })}>
        <small>{number}</small><b>{place ? place.note : '×'}</b>
      </button>;
    })}</div></div>;
}
