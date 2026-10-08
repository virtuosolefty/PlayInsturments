import { collectResources, loadInstrumentModel } from './models.js';
import { disposeResources } from './studio.js';

/**
 * otherRigs.js — rigs built on downloaded models: building one safely, and
 * keeping the ones a stage shows in place of its own.
 *
 * The whole-instrument view can show another kind of the instrument on stage
 * (stageModels.js, the rigged ones): a bass guitar, an electric violin. Each
 * gets a rig of its own, so its strings move and its bow plays. A rig is
 * built the first time it is asked for and kept for the life of the stage;
 * one that could not be built is reported, and tried again when next asked
 * for.
 *
 * A rig the stage runner has shown is the runner's to dispose (stageRunner.js
 * keeps and disposes every rig given to `show`). The rest are disposed here
 * when the stage stops, as is one that arrives after that.
 */

/** What a rig owns, for the stage to dispose of with it; empty to begin with. */
export const newOwned = () => ({ geometries: new Set(), materials: new Set(), textures: new Set() });

/**
 * The rig `build` makes on `model`, carrying what it owns and the model's id.
 * If the builder throws, everything made so far is disposed of, and the model
 * with it, before the error goes on.
 *
 * @param {{ scene: object, fit: object }} model from loadInstrumentModel
 * @param {string} id
 * @param {(owned: object, model: object) => object} build the rig's parts; it adds whatever it makes to `owned`
 */
export function rigFrom(model, id, build) {
  const owned = newOwned();
  try {
    return { ...build(owned, model), owned, model: id };
  } catch (error) {
    disposeResources(owned);
    disposeResources(collectResources(model.scene));
    throw error;
  }
}

/** Fetches the model `id` and builds its rig (see `rigFrom`); null when its files could not be loaded. */
export async function loadRig(id, build) {
  const model = await loadInstrumentModel(id);
  return model ? rigFrom(model, id, build) : null;
}

/**
 * The rigs of the other instruments a stage can show, each built once.
 *
 * @param {object} options
 * @param {(id: string) => Promise<object|null>} options.build the rig for a model, with its `owned` resources; null when its files could not be loaded
 * @param {(id: string) => void} options.onReady a rig asked for earlier can now be had
 * @param {(id: string, why: string) => void} options.onFailed
 */
export function otherRigs({ build, onReady, onFailed }) {
  const ready = new Map(), building = new Set(), staged = new Set();
  let stopped = false;
  const start = id => {
    building.add(id);
    // A builder that throws at once is reported like one that fails later.
    Promise.resolve().then(() => build(id)).then(rig => {
      building.delete(id);
      if (stopped) { if (rig) disposeResources(rig.owned); return; }
      if (!rig) { onFailed(id, 'its files could not be loaded'); return; }
      ready.set(id, rig);
      onReady(id);
    }, error => {
      building.delete(id);
      if (!stopped) onFailed(id, error.message);
    });
  };
  return {
    /** The rig for `id` when it is built; until then null, and building starts. */
    get(id) {
      if (stopped) return null;
      if (!ready.has(id) && !building.has(id)) start(id);
      return ready.get(id) ?? null;
    },
    /** Tells this a rig has gone on stage, so the stage runner now disposes of it. */
    staged(rig) { staged.add(rig); },
    stop() {
      stopped = true;
      for (const rig of ready.values()) if (!staged.has(rig)) disposeResources(rig.owned);
      ready.clear();
    },
  };
}
