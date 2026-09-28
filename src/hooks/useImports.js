import { useCallback, useEffect, useState } from 'react';
import { loadScoreFromFile } from '../lib/score.js';
import {
  listScoreFiles,
  packFromFiles,
  putSamplePack,
  putScoreFile,
  supported as vaultSupported,
} from '../lib/vault.js';
import { audio } from '../lib/audio.js';

/** How many imported pieces stay in the drawer. */
const MAX_LOCAL = 12;

/**
 * Files you bring in yourself: scores to practise, and samples to play them
 * with. Both go through the IndexedDB vault so they survive a reload.
 *
 * Extracted from App for the 800-line ceiling, and it is a clean seam: nothing
 * here touches the transport, the score being practised, or the Path.
 *
 * @param {Function} onError somewhere to put a message a person should read
 * @param {Function} onScoreLoaded called with a freshly imported score
 */
export function useImports({ onError, onScoreLoaded }) {
  const [localScores, setLocalScores] = useState([]);

  const loadFile = useCallback(
    async (file) => {
      try {
        onError(null);
        const loaded = await loadScoreFromFile(file);
        if (loaded.notes.length === 0) throw new Error('no playable notes found in the file');
        setLocalScores((prev) =>
          [loaded, ...prev.filter((s) => s.id !== loaded.id)].slice(0, MAX_LOCAL),
        );
        onScoreLoaded(loaded);

        // Keep the bytes, not the parsed score: re-reading the original file is
        // cheap and means a change to the parser reaches everything you imported.
        const isXml = /\.(xml|musicxml)$/i.test(file.name);
        putScoreFile({
          id: loaded.id,
          name: file.name,
          kind: isXml ? 'musicxml' : 'midi',
          data: isXml ? await file.text() : await file.arrayBuffer(),
        }).catch((err) => console.warn('[vault] could not remember the import:', err.message));
      } catch (err) {
        onError(`Could not read "${file.name}": ${err.message}`);
      }
    },
    [onError, onScoreLoaded],
  );

  // Bring back everything imported in previous sessions.
  useEffect(() => {
    let cancelled = false;
    listScoreFiles()
      .then(async (entries) => {
        const restored = [];
        const lost = [];
        for (const entry of (entries ?? []).sort((a, b) => b.addedAt - a.addedAt)) {
          try {
            const blob =
              entry.kind === 'musicxml'
                ? new Blob([entry.data], { type: 'application/xml' })
                : new Blob([entry.data]);
            // eslint-disable-next-line no-await-in-loop
            restored.push(await loadScoreFromFile(new File([blob], entry.name)));
          } catch {
            // This used to be swallowed on the grounds that it was "not worth a
            // toast on load". But the file does not come back and nothing else
            // ever mentions it, so from the other side of the screen a piece you
            // imported has simply vanished and the app is the thing that lost
            // it. Naming them costs one line and is the difference between a
            // file that failed to open and an app that eats your work.
            lost.push(entry.name);
          }
        }
        if (cancelled) return;
        if (restored.length) setLocalScores(restored.slice(0, MAX_LOCAL));
        if (lost.length) {
          onError(
            `${lost.length === 1 ? 'One saved file' : `${lost.length} saved files`} could not be reopened and ${lost.length === 1 ? 'is' : 'are'} not in your library: ${lost.join(', ')}. Import ${lost.length === 1 ? 'it' : 'them'} again if you still have the original.`,
          );
        }
      })
      // A browser with no IndexedDB at all has not lost anything — there was
      // never a vault to read. Everything else genuinely failed to open a store
      // that may well have files in it, which is worth saying.
      .catch((err) => {
        if (cancelled || !vaultSupported()) return;
        onError(`Your imported files could not be read back (${err.message}).`);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const loadSamples = useCallback(
    async (files) => {
      try {
        onError(null);
        const pack = packFromFiles(files, files[0]?.name ? 'Your piano' : 'Imported pack');
        if (!pack.count) {
          throw new Error(
            'none of those filenames say which note they record — try names like C4.wav or Ds3.wav',
          );
        }
        await putSamplePack({ name: pack.name, files: pack.files });
        await audio.start();
        await audio.reloadInstrument();
        const skipped = pack.skipped.length ? `, skipped ${pack.skipped.length} unnamed` : '';
        onError(`Loaded ${pack.count} samples${skipped}. That's your piano now.`);
      } catch (err) {
        onError(`Could not use those samples: ${err.message}`);
      }
    },
    [onError],
  );

  return { localScores, loadFile, loadSamples };
}
