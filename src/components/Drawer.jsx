import { useEffect, useState } from 'react';

const TABS = [
  ['songs', 'Songs', 'Pick something to play, or bring in your own files'],
  ['path', 'Today’s plan', "Today's set, the fifteen exercises, and what they have done for your playing"],
  ['keyboard', 'Settings', 'Which controller you are on, and where the sound comes from'],
  ['progress', 'Progress', 'Your practice habit and the pieces you have rated'],
];

/**
 * The library drawer.
 *
 * It had grown to six sections in one scroll doing three unrelated jobs —
 * choosing music, configuring hardware, and reviewing progress — so everything
 * was equally far from everything else. Songs is the default because it is
 * almost always why the drawer gets opened.
 */
export default function Drawer({ songs, path, keyboard, progress, requestedTab, onClose }) {
  const [tab, setTab] = useState('songs');
  useEffect(() => { if (requestedTab?.id) setTab(requestedTab.id); }, [requestedTab]);

  return (
    <>
      <div className="drawer-heading"><strong>Your library</strong>{onClose && <button onClick={onClose} aria-label="Close library">×</button>}</div>
      <div className="drawer-tabs" role="tablist" aria-label="Library sections">
        {TABS.map(([id, label, title]) => (
          <button
            key={id}
            role="tab" id={`library-tab-${id}`} aria-controls={`library-panel-${id}`}
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
            title={title}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="drawer-body">
        {/* Kept mounted rather than swapped: the song list holds a filter and
            the keyboard panel holds a drop zone, and losing either on a tab
            change would be its own small annoyance. */}
        <div role="tabpanel" id="library-panel-songs" aria-labelledby="library-tab-songs" hidden={tab !== 'songs'}>{songs}</div>
        <div role="tabpanel" id="library-panel-path" aria-labelledby="library-tab-path" hidden={tab !== 'path'}>{path}</div>
        <div role="tabpanel" id="library-panel-keyboard" aria-labelledby="library-tab-keyboard" hidden={tab !== 'keyboard'}>{keyboard}</div>
        <div role="tabpanel" id="library-panel-progress" aria-labelledby="library-tab-progress" hidden={tab !== 'progress'}>{progress}</div>
      </div>
    </>
  );
}
