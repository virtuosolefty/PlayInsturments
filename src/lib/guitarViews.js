import { buildModelGuitarRig } from './guitarModelRig.js';
import { collectResources, loadInstrumentModel } from './stage/models.js';
import { disposeResources } from './stage/studio.js';

const newOwned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });
/** Runs `callback` at a quiet moment, so readying the model does not land on the frame that built it. */
const whenQuiet = callback => (globalThis.requestIdleCallback ?? (fn => setTimeout(fn, 200)))(callback);

/**
 * The two guitars free play switches between: the one built in code for the
 * Learn view (lessons use it too), where its wider strings are easier to play,
 * and the downloaded model for the Whole instrument view, which only it can
 * show. The model is fetched the first time free play opens on the full tier,
 * readied to draw while the player is still in Learn, and kept on hand, so
 * switching back and forth does not wait.
 *
 * @param {object} run the stage runner (stageRunner.js)
 * @param {object} options
 * @param {object} options.drawn the guitar built in code, already on stage
 * @param {boolean} options.full whether the stage is at full detail; only then is the model fetched
 * @param {number} options.maxFret
 * @param {{ current: { view: string, stageView: 'learn'|'whole' } }} options.latest
 * @param {(state: 'loading'|'ready'|'failed') => void} options.onState
 * @param {() => void} options.onShow called before a different guitar goes on stage
 * @param {(why: string) => void} options.onBroken called when a guitar cannot go on stage at all
 * @param {() => object|null} [options.other] the rig of another instrument chosen for the Whole instrument view
 *   (a bass guitar: see stage/otherRigs.js), or null when none is chosen or it is not built yet
 * @param {(rig: object) => void} [options.onOther] called when that rig goes on stage
 */
export function guitarViews(run, { drawn, full, maxFret, latest, onState, onShow, onBroken, other = () => null, onOther = () => {} }) {
  let model = null, loading = false, failed = false, abandoned = false, modelShown = false;
  const wantsWhole = () => latest.current.view === 'freePlay' && latest.current.stageView === 'whole';
  const show = () => {
    const whole = wantsWhole(), chosen = whole ? other() : null;
    const next = chosen ?? (whole && model ? model : drawn);
    if (run.rig === next) return;
    onShow();
    try {
      run.show(next);
      if (next === model) modelShown = true;
      if (next === chosen) onOther(chosen);
    } catch (error) { onBroken(error.message); }
  };
  // Shaders compiled and textures uploaded now spare the first switch to Whole instrument a stall.
  const ready = () => whenQuiet(() => {
    if (abandoned || modelShown) return;
    try { run.prepare(model); } catch (error) { console.warn('[stage] the downloaded guitar could not be readied ahead of time:', error.message); }
  });
  const giveUp = why => {
    if (why) console.warn('[stage] the downloaded guitar could not be set up, keeping the drawn one:', why);
    loading = false; failed = true;
    onState('failed');
    // A stage held for the model shows the drawn guitar instead.
    run.release();
  };
  const build = loaded => {
    const owned = newOwned();
    try {
      return { ...buildModelGuitarRig({ owned, maxFret, model: loaded, lacquered: true }), owned, maxFret, model: 'guitar' };
    } catch (error) {
      disposeResources(owned);
      disposeResources(collectResources(loaded.scene));
      giveUp(error.message);
      return null;
    }
  };
  const load = () => {
    if (!full || model || loading || failed) return;
    loading = true;
    onState('loading');
    loadInstrumentModel('guitar').then(loaded => {
      if (abandoned) { if (loaded) disposeResources(collectResources(loaded.scene)); return; }
      if (!loaded) { giveUp(); return; }
      model = build(loaded);
      if (!model) return;
      loading = false;
      onState('ready');
      show();
      ready();
    }, error => { if (!abandoned) giveUp(error.message); });
  };
  return {
    /** Shows the guitar the current view wants, fetching the model the first time free play opens. */
    apply() { if (latest.current.view === 'freePlay') load(); show(); },
    /** Lets the next request for the model try again after one that failed. */
    retry() { failed = false; },
    /** A model that never went on stage is not the runner's to dispose. */
    stop() { abandoned = true; if (model && !modelShown) disposeResources(model.owned); },
  };
}
