import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../hooks/useDialog.js';
import { isStaged, modelImage } from '../lib/stageModels.js';

/**
 * The pop-up that opens when Whole instrument is selected: a picture of each
 * instrument there is to see, to choose one from.
 *
 * It is a dialog over the whole app rather than a panel on the stage, so it
 * has room for its pictures however small the stage is. A picture that cannot
 * be loaded is left out and the card stays usable by its name.
 *
 * @param {object} props
 * @param {object[]} props.models the instruments to choose from (stageModels.js), the one that is played first
 * @param {string} props.value the id of the one being shown
 * @param {(id: string) => void} props.onChoose
 * @param {() => void} props.onClose
 */
export default function ModelChooser({ models, value, onChoose, onClose }) {
  const ref = useDialog({ onClose });
  const [missing, setMissing] = useState(() => new Set());
  // Focus starts on the one being shown, so Enter keeps it and the arrow of attention is where the eye is.
  useEffect(() => { ref.current?.querySelector('.model-card[aria-pressed="true"]')?.focus(); }, [ref]);

  return createPortal(
    <div className="model-chooser-overlay" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report model-chooser" role="dialog" aria-modal="true" aria-labelledby="model-chooser-title" ref={ref} tabIndex={-1}>
        <header className="settings-heading"><h2 id="model-chooser-title">Whole instrument</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <p className="model-chooser-lead">Choose one to see it whole. Drag to turn it round.</p>
        <ul className="model-cards">{models.map(model => <li key={model.id}>
          <button type="button" className={`model-card${missing.has(model.id) ? ' no-picture' : ''}`} aria-pressed={model.id === value} onClick={() => onChoose(model.id)}>
            <span className="model-picture"><img src={modelImage(model.id)} alt="" width="640" height="400" onError={() => setMissing(old => new Set([...old, model.id]))} /></span>
            <strong>{model.label}</strong>
            <span className="model-about">{model.about}</span>
            {model.played ? <small>You play this one</small> : !isStaged(model) && <small className="look-only">To look at</small>}
          </button>
        </li>)}</ul>
      </section>
    </div>,
    document.body,
  );
}
