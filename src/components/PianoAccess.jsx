import { noteName } from '../lib/theory.js';
export default function PianoAccess({ input }) {
  return <><span className="instrument-hover" aria-hidden="true">{input.hint || 'Hold a key to play · drag to glide'}</span><div className="sr-only" role="row">{Array.from({length: input.high-input.low+1}, (_,i) => input.low+i).map(midi => <span role="gridcell" key={midi} id={`${input.prefix}-note-${midi}`} aria-selected={midi===input.selected}>{noteName(midi)}{midi===60?' · middle C':''}</span>)}</div></>;
}
