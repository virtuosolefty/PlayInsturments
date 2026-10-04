import { useEffect, useState } from 'react';

/**
 * Which view free play's 3D stage shows: 'learn', the playable fingerboard
 * map that lessons use, or 'whole', the whole instrument. Free play always
 * opens on Learn: leaving it puts the view back.
 *
 * @param {string} view the studio's view, 'lesson' or 'freePlay'
 * @returns {['learn'|'whole', (value: 'learn'|'whole') => void]}
 */
export function useStageView(view) {
  const [stageView, setStageView] = useState('learn');
  useEffect(() => { if (view !== 'freePlay') setStageView('learn'); }, [view]);
  return [stageView, setStageView];
}
