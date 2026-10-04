/**
 * Puts a turned stage view back. On a phone it shrinks to its icon, leaving
 * room for the view switch beside it; its name stays "Reset view". It reports
 * its focus so the stage can keep it in place while it has keyboard focus.
 *
 * @param {object} props
 * @param {boolean} props.turned whether there is a turn to undo
 * @param {() => void} props.onReset
 * @param {(focused: boolean) => void} props.onFocusChange
 */
export default function ResetViewButton({ turned, onReset, onFocusChange }) {
  return <button type="button" className="guitar-reset-view" aria-label="Reset view" aria-disabled={!turned}
    onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)} onClick={onReset}>
    <svg className="reset-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8a4.5 4.5 0 1 0 1.32-3.18" />
      <path d="M4.6 2.3v2.6h2.6" />
    </svg>
    <span className="reset-text">Reset view</span>
  </button>;
}
