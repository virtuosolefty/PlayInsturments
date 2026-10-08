import { disposeResources } from './studio.js';

/**
 * otherRigs.js — the rigs of instruments a stage shows in place of its own.
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
