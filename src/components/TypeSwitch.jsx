import { instrumentInfo, variantsOf } from '../lib/instruments.js';

/**
 * Which kind of an instrument: Guitar or Bass. It is shown
 * wherever an instrument is chosen or its studio controls sit, and only for an
 * instrument that has a second kind.
 *
 * @param {object} props
 * @param {string} props.instrument the instrument now shown (instruments.js)
 * @param {(id: string) => void} props.onChange given the instrument of the kind chosen
 * @param {string} [props.className]
 */
export default function TypeSwitch({ instrument, onChange, className = '' }) {
  const kinds = variantsOf(instrument);
  if (!kinds) return null;
  return <div className={`type-switch ${className}`.trim()} role="group" aria-label="Instrument type">
    {kinds.map(id => <button key={id} type="button" aria-pressed={instrument === id} onClick={() => { if (instrument !== id) onChange(id); }}>{instrumentInfo(id).label}</button>)}
  </div>;
}
