import { useMemo, useState } from 'react';
import { composersIn, shortName } from '../lib/collections.js';

/**
 * Browse by who wrote it.
 *
 * Sits above the song list and filters it. Each piece can be heard before it is
 * practised — "Listen" starts the reference performance so you know what you
 * are committing to, which matters most for exactly the pieces you have not met
 * before.
 */
export default function Collections({ library, activeComposer, onPick, onListen }) {
  const composers = useMemo(() => composersIn(library), [library]);
  const [open, setOpen] = useState(false);
  if (!composers.length) return null;

  const current = composers.find((c) => c.name === activeComposer) ?? null;

  return (
    <div className="section collections">
      <h2 className="section-title">
        Composers
        {activeComposer && (
          <button className="ghost" onClick={() => onPick(null)}>
            show all
          </button>
        )}
      </h2>

      <div className="composer-chips">
        {composers.map((composer) => (
          <button
            key={composer.name}
            className={`composer-chip ${activeComposer === composer.name ? 'on' : ''}`}
            onClick={() => onPick(activeComposer === composer.name ? null : composer.name)}
            title={`${composer.name}${composer.life ? ` · ${composer.life}` : ''}`}
          >
            {shortName(composer.name)}
            <i>{composer.songs.length}</i>
          </button>
        ))}
      </div>

      {current && (
        <div className="composer-card">
          <div className="composer-head">
            <strong>{current.name}</strong>
            {current.life && <span>{current.life}</span>}
          </div>
          {current.blurb && <p className="hint">{current.blurb}</p>}

          <div className="composer-works">
            {current.songs.map((song) => (
              <div className="work" key={song.id}>
                <button className="work-title" onClick={() => onPick(current.name, song)}>
                  {song.title}
                </button>
                <button
                  className="ghost work-listen"
                  onClick={() => onListen(song)}
                  title="Hear it played through — nothing is scored"
                >
                  ▶ listen
                </button>
              </div>
            ))}
          </div>

          <button className="ghost composer-more" onClick={() => setOpen((v) => !v)}>
            {open ? 'fewer details' : 'about these pieces'}
          </button>
          {open && (
            <ul className="composer-notes">
              {current.songs.map((song) => (
                <li key={song.id}>
                  <strong>{song.title}</strong> — {song.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
