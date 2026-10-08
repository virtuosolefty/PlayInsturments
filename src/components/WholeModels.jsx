import { useEffect, useState } from 'react';
import ModelChooser from './ModelChooser.jsx';
import ModelViewer from './ModelViewer.jsx';
import { modelCredit } from '../lib/modelCredits.js';
import { isStaged, playedModel } from '../lib/stageModels.js';
import { useAvailableModels } from '../hooks/useAvailableModels.js';

/**
 * Which instrument the whole-instrument view shows.
 *
 * Selecting Whole instrument opens a pop-up of pictures (ModelChooser.jsx).
 * What follows a choice depends on the instrument (stageModels.js):
 *
 * - the one that is played is already on the stage, so the pop-up just closes;
 * - one the stage can rig (a bass guitar, an electric violin) is handed to
 *   the stage through `onStage`, which shows it on a rig of its own, so its
 *   strings move and its bow plays; `staged` says which the stage is showing;
 * - one that is only looked at (another drum kit) is shown over the stage in
 *   the viewer (ModelViewer.jsx), and turned by dragging.
 *
 * Whatever is shown in place of the played instrument carries its maker's
 * credit. One that cannot be shown gives the stage back and says so. Only the
 * instruments whose files are there are offered (useAvailableModels.js); with
 * none but the one played, there is nothing to choose and no pop-up.
 *
 * A stage renders this inside its own element, before its bottom bar, so the
 * view switch stays in reach above whatever is shown.
 *
 * @param {object} props
 * @param {string} props.instrument
 * @param {boolean} props.active whether the stage is on its whole-instrument view
 * @param {'auto'|'full'|'light'} [props.quality]
 * @param {(showing: boolean) => void} [props.onShowing] told when the viewer takes, or gives back, the stage
 * @param {string} [props.staged] the id of the instrument the stage itself is showing; the played one unless given
 * @param {(id: string) => void} [props.onStage] asks the stage to show an instrument itself; without it, every other instrument goes to the viewer
 * @param {string} [props.stageNotice] what the stage has to say, e.g. that an instrument it was asked for could not be shown
 */
export default function WholeModels({ instrument, active, quality = 'auto', onShowing, staged, onStage, stageNotice = '' }) {
  const models = useAvailableModels(instrument, active);
  const played = playedModel(instrument);
  const [picked, setPicked] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { setOpen(active); if (!active) setNotice(''); }, [active]);
  useEffect(() => { setPicked(null); setNotice(''); }, [instrument]);

  // A choice made for another instrument is not this one's.
  const shown = active ? models.find(model => model.id === picked && !model.played) ?? null : null;
  const showing = !!shown;
  useEffect(() => { onShowing?.(showing); }, [showing, onShowing]);

  if (models.length < 2 || !played) return null;
  const onStageNow = models.find(model => model.id === staged) ?? played;
  // What stands in the played instrument's place: in the viewer, or on the stage's own rig.
  const other = shown ?? (active && !onStageNow.played ? onStageNow : null);
  const credit = other && modelCredit(other.id);
  const choose = id => {
    const model = models.find(each => each.id === id);
    const toStage = !!onStage && isStaged(model);
    setPicked(toStage ? null : id);
    // The stage shows the instrument it was asked for, or its own again beneath the viewer.
    onStage?.(toStage ? id : played.id);
    setNotice('');
    setOpen(false);
  };
  const failed = why => {
    console.warn(`[stage] the ${shown.label.toLowerCase()} could not be shown, keeping the instrument on the stage:`, why);
    setPicked(null);
    setNotice(`The ${shown.label.toLowerCase()} could not be shown. The ${played.label.toLowerCase()} is back on the stage.`);
  };

  return <>
    {shown && <ModelViewer key={shown.id} model={shown} quality={quality} onFailed={failed} />}
    {other && <div className="model-caption"><strong>{other.label}</strong>{credit && <span>
      <a href={credit.source} target="_blank" rel="noopener noreferrer">“{credit.title}”</a> by <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer">{credit.author}</a> · <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a>
    </span>}</div>}
    {active && <button type="button" className="model-change" onClick={() => setOpen(true)}>Choose instrument</button>}
    <div className="model-notice" role="status">{notice || stageNotice}</div>
    {active && open && <ModelChooser models={models} value={other?.id ?? played.id} onChoose={choose} onClose={() => setOpen(false)} />}
  </>;
}
