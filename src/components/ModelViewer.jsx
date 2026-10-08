import { useEffect, useRef, useState } from 'react';
import { castShadows } from '../lib/stage/modelFinish.js';
import { barEdges, clearOfBars } from '../lib/stage/stageBars.js';
import { collectResources, loadInstrumentModel } from '../lib/stage/models.js';
import { createStudio, disposeResources } from '../lib/stage/studio.js';
import { STAGE_THEME } from '../lib/stageColors.js';
import { NO_TURN, VIEWER_LENS, isTurned, showcaseShot, turnBy } from '../lib/showcaseView.js';

/** A kit with every bolt modelled is several megabytes; it may take a slow connection this long. */
const DOWNLOAD_LIMIT_MS = 60000;

/**
 * A model that is only shown, standing where the stage's own instrument was:
 * framed whole between the stage's bottom bar and its own caption, and turned
 * by dragging. It has its own studio, so the stage beneath is left exactly as
 * it was for the way back to Learn.
 *
 * A frame is drawn only when something changed. The model's files are fetched
 * once a page (models.js); a stalled or broken download calls `onFailed`.
 *
 * @param {object} props
 * @param {{ id: string, label: string }} props.model from stageModels.js
 * @param {'auto'|'full'|'light'} [props.quality]
 * @param {(why: string) => void} props.onFailed
 */
export default function ModelViewer({ model, quality = 'auto', onFailed }) {
  const host = useRef(null);
  const latest = useRef(null);
  latest.current = { onFailed };
  const reset = useRef(() => {});
  const [ready, setReady] = useState(false);
  const [turned, setTurned] = useState(false);
  const name = model.label.toLowerCase();

  useEffect(() => {
    const el = host.current;
    let studio;
    try {
      studio = createStudio(el, { theme: STAGE_THEME, quality });
    } catch (error) {
      latest.current.onFailed(error.message);
      return undefined;
    }
    const canvas = studio.renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    let stopped = false, raf = 0, dirty = false, shot = null, turn = NO_TURN, drag = null, bounds;
    // The viewer covers the stage, whose bars lie over it: the caption at the top, the view switch at the bottom.
    const stage = el.parentElement ?? el;
    setReady(false);
    setTurned(false);

    const frame = () => {
      bounds = clearOfBars(barEdges(stage, { top: '.model-caption' }));
      if (shot && studio.frame(shot, { view: VIEWER_LENS, turn, bounds })) dirty = true;
    };
    const aim = () => { if (shot && studio.aim(shot, { view: VIEWER_LENS, turn, bounds })) dirty = true; };
    const tick = () => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (!dirty || document.hidden) return;
      dirty = false;
      studio.render();
    };

    loadInstrumentModel(model.id, { timeoutMs: DOWNLOAD_LIMIT_MS }).then(loaded => {
      if (stopped) { if (loaded) disposeResources(collectResources(loaded.scene)); return; }
      if (!loaded) { latest.current.onFailed('its files could not be loaded'); return; }
      try {
        castShadows(loaded.scene);
        const found = collectResources(loaded.scene);
        for (const kind of ['geometries', 'materials', 'textures']) found[kind].forEach(item => studio.owned[kind].add(item));
        studio.scene.add(loaded.scene);
        studio.fitGround(loaded.fit.bounds);
        shot = showcaseShot(loaded.fit);
        frame();
        el.dataset.ready = 'true';
        setReady(true);
      } catch (error) {
        latest.current.onFailed(error.message);
      }
    }, error => { if (!stopped) latest.current.onFailed(error.message); });

    const onDown = event => {
      if (event.button > 0 || !shot) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: turn };
      try { canvas.setPointerCapture?.(event.pointerId); } catch { /* turn without capture */ }
      canvas.style.cursor = 'grabbing';
    };
    const onMove = event => {
      if (!drag || event.pointerId !== drag.id) return;
      turn = turnBy(drag.from, event.clientX - drag.x, event.clientY - drag.y);
      setTurned(isTurned(turn));
      aim();
    };
    const onUp = event => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      canvas.style.cursor = 'grab';
    };
    const onLost = event => { event.preventDefault(); latest.current.onFailed('the graphics context was lost'); };
    reset.current = () => { turn = NO_TURN; setTurned(false); frame(); };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('webglcontextlost', onLost);
    const resize = new ResizeObserver(frame);
    resize.observe(el);
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      reset.current = () => {};
      delete el.dataset.ready;
      studio.dispose();
    };
  }, [model.id, quality]);

  return <div className="model-viewer" ref={host} role="group" aria-label={`Three-dimensional ${name}`} data-model={model.id}>
    {!ready && <div className="model-viewer-preparing" role="status">Preparing the {name}…</div>}
    {turned && <button type="button" className="guitar-reset-view model-reset" onClick={() => reset.current()}>Reset view</button>}
  </div>;
}
