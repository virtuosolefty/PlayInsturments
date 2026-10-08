import { useEffect, useMemo, useState } from 'react';
import { modelAvailable } from '../lib/stage/modelAvailability.js';
import { modelsFor, otherModels } from '../lib/stageModels.js';

const NONE = Object.freeze([]);

/**
 * The instruments the whole-instrument view can show right now: the one that
 * is played, and each of the others whose files are there (see
 * modelAvailability.js). Until `wanted`, nothing is asked of the server and
 * only the played one is listed.
 *
 * @param {string} instrument
 * @param {boolean} wanted whether the stage could offer a choice at all (free play, full detail)
 * @returns {object[]} from stageModels.js, the played one first
 */
export function useAvailableModels(instrument, wanted) {
  const [found, setFound] = useState({ instrument, ids: NONE });
  useEffect(() => {
    if (!wanted) return undefined;
    let current = true;
    const others = otherModels(instrument);
    Promise.all(others.map(model => modelAvailable(model.id))).then(there => {
      if (current) setFound({ instrument, ids: others.filter((_, index) => there[index]).map(model => model.id) });
    });
    return () => { current = false; };
  }, [instrument, wanted]);
  // What was found for another instrument says nothing about this one.
  const ids = found.instrument === instrument ? found.ids : NONE;
  return useMemo(() => modelsFor(instrument).filter(model => model.played || ids.includes(model.id)), [instrument, ids]);
}
