import { useEffect, useRef } from 'react';

/**
 * The three things every dialog in this app was missing.
 *
 * Escape did not close the report, the welcome card or the calibrator; opening
 * one left focus behind it on whatever you had clicked; and closing one left
 * focus nowhere at all, which for anybody driving by keyboard means being
 * dropped at the top of the document.
 *
 * Focus enters the dialog, cycles through its visible controls, and returns
 * to its opener when closed. Hidden and disabled controls are skipped.
 *
 * @param {object} options
 * @param {Function} options.onClose called on Escape — omit for a dialog that
 *   must be answered rather than dismissed
 * @param {boolean} [options.open]
 * @returns {object} ref to put on the dialog element
 */
export function useDialog({ onClose, open = true } = {}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previous = document.activeElement;
    const node = ref.current;

    // The first control, or the dialog itself when it has none yet. Without
    // this, a screen reader carries on reading from wherever the page was.
    const focusable = node?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? node)?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Tab' && node) {
        const controls = [...node.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (!first) { e.preventDefault(); node.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key !== 'Escape' || !closeRef.current) return;
      e.stopPropagation();
      closeRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Only if focus is still inside the dialog being torn down; something
      // else may legitimately have claimed it.
      if (!node || node.contains(document.activeElement) || document.activeElement === document.body) previous?.focus?.();
    };
  }, [open]);

  return ref;
}
