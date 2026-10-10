import { PICKER, familyOf, instrumentInfo } from '../lib/instruments.js';

/**
 * The row of instruments to choose from: one button for each of the six, the
 * one whose family `current` belongs to pressed. The welcome page, the
 * studio's header, the learning home and the library each wear it their own
 * way, through `className` and what a button holds.
 *
 * @param {object} props
 * @param {string} props.current the instrument now shown, or the picker's id for it
 * @param {(picker: string) => void} props.onPick given the picker id of the button pressed
 * @param {string} props.label the group's accessible name
 * @param {string} [props.className]
 * @param {(picker: string) => import('react').ReactNode} [props.content] what a button holds; its name by default
 * @param {(picker: string) => object} [props.buttonProps] extra attributes for a button, such as a tooltip
 */
export default function InstrumentButtons({ current, onPick, label, className, content = id => instrumentInfo(id).label, buttonProps }) {
  const family = familyOf(current);
  return <div className={className} role="group" aria-label={label}>
    {PICKER.map(id => <button key={id} aria-pressed={family === id} onClick={() => onPick(id)} {...buttonProps?.(id)}>{content(id)}</button>)}
  </div>;
}
