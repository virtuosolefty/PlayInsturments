import { useEffect, useState } from 'react';
import { MODEL_CREDITS } from '../lib/modelCredits.js';
import { modelAvailable } from '../lib/stage/modelAvailability.js';

/** A played instrument's model carries the instrument's own name, and ships with the app. */
const isPlayed = credit => credit.model === credit.instrument;
const PLAYED = Object.freeze(MODEL_CREDITS.filter(isPlayed));

/**
 * The credits to show: one for every model on this site. The instruments that
 * are only shown are prepared from downloads, one at a time, so each is
 * credited once its files are there (see modelAvailability.js).
 *
 * @returns {object[]} from modelCredits.js, in its order
 */
export function useShownCredits() {
  const [shown, setShown] = useState(PLAYED);
  useEffect(() => {
    let current = true;
    Promise.all(MODEL_CREDITS.map(credit => isPlayed(credit) || modelAvailable(credit.model))).then(there => {
      if (current) setShown(MODEL_CREDITS.filter((_, index) => there[index]));
    });
    return () => { current = false; };
  }, []);
  return shown;
}
