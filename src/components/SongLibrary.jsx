import PieceArt from './PieceArt.jsx';
import Icon from './Icon.jsx';
import { useMemo, useRef, useState } from 'react';
import Collections from './Collections.jsx';
import { assessFit, describeFit } from '../lib/arrange.js';
import { shortName } from '../lib/collections.js';
import { atTempo } from '../lib/path.js';
import { noteName } from '../lib/theory.js';

/**
 * Difficulty is deliberately not stars. Earned stars sit inches away on the
 * same row meaning something entirely different — how well you played it, not
 * how hard it is — and two identical glyphs that close together is a puzzle,
 * not a design.
 */
const LEVEL = ['', 'easy', 'easy+', 'medium', 'hard', 'hard+'];

const BADGE_LABEL = {
  fits: '✓ fits',
  shift: '↕ octave',
  fold: '⤢ folds',
};

/**
 * Only when the piece had to be moved to reach your hands. "✓ fits" on all
 * nineteen rows says nothing — it is the same badge in the same place every
 * time — while costing the title the fifty pixels that tell two arrangements
 * of Für Elise apart.
 */
function FitBadge({ assessment, quiet = false }) {
  if (!assessment || assessment.verdict === 'unknown') return null;
  if (quiet && assessment.verdict === 'fits') return null;
  return (
    <span className={`fit-badge ${assessment.verdict}`} title={describeFit(assessment)}>
      {BADGE_LABEL[assessment.verdict]}
    </span>
  );
}

/**
 * The best rating, and — when it was not earned at the written speed — what
 * speed it *was* earned at.
 *
 * Five stars at 60% is not five stars, and this badge used to say it was. The
 * rating is not withheld: slowing a piece down until it is clean is the method
 * the app teaches, so scoring that zero would punish taking its advice. It is
 * qualified instead.
 */
function EarnedStars({ count, rate = 1 }) {
  if (!count) return null;
  const slow = !atTempo(rate);
  const pct = Math.round(rate * 100);
  return (
    <span
      className="earned"
      title={slow ? `Best: ${count} of 5 stars, played at ${pct}%` : `Best: ${count} of 5 stars at full speed`}
    >
      {'★'.repeat(count)}
      {slow && <i className="at-rate">{pct}%</i>}
    </span>
  );
}

/** "45s" is readable; "184s" is arithmetic, and "17.1s" is a measurement. */
const runtime = (seconds) => {
  const whole = Math.round(seconds ?? 0);
  return whole < 60 ? `${whole}s` : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export default function SongLibrary({
  library,
  activeId,
  onPick,
  onLoadFile,
  localScores,
  window: keyWindow,
  starsBySong = {},
  starRates = {},
  suggestedId = null,
  onListen,
  favorites = [], onFavorite, searchQuery,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [reachableOnly, setReachableOnly] = useState(false);
  const [composer, setComposer] = useState(null);
  const [localQuery, setQuery] = useState('');
  const query = searchQuery ?? localQuery;
  const inputRef = useRef(null);

  const choose = (name, song) => {
    setComposer(name);
    if (song) onPick(song);
  };

  const handleFiles = (files) => {
    for (const file of files) onLoadFile(file);
  };

  const rated = useMemo(
    () => library.map((song) => ({ song, assessment: assessFit(song.range, keyWindow) })),
    [library, keyWindow],
  );
  const inScope = rated.filter(({ song }) => (!composer || song.composer === composer) &&
    `${song.title} ${song.composer ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = reachableOnly ? inScope.filter((r) => r.assessment.verdict !== 'fold') : inScope;
  const hidden = inScope.length - shown.length;

  return (
    <>
      <details className="composer-browser"><summary>Browse composers</summary><Collections
        library={library}
        activeComposer={composer}
        onPick={choose}
        onListen={onListen}
      /></details>

      <div className="section">
        <h2 className="section-title">
          {composer ? shortName(composer) : 'Practice library'}
          <label className="toggle tiny" title="Hide pieces wider than your keyboard can reach">
            <input
              type="checkbox"
              checked={reachableOnly}
              onChange={(e) => setReachableOnly(e.target.checked)}
            />
            reachable only
          </label>
        </h2>
        {searchQuery === undefined && <label className="library-search"><span className="sr-only">Search pieces and composers</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pieces or composers…" /></label>}
        {shown.length === 0 && <p className="hint" role="status">No pieces match. Try another title or clear your filters.</p>}
        <div className="song-list">
          {shown.map(({ song, assessment }) => (
            <div className="song-row" key={song.id}><button
              key={song.id}
              className={`song ${activeId === song.id ? 'active' : ''} ${
                suggestedId === song.id ? 'suggested' : ''
              }`}
              onClick={() => onPick(song)}
              title={`${song.title} — ${song.composer}`}
            >
              {/* One line per piece, not two. Nineteen pieces at two lines each
                  was still most of two screens for a list whose whole job is
                  being scanned. The composer moved to the row's tooltip and to
                  the filter chips above: at this pane width it only ever
                  appeared as a truncated fragment, and the titles need the
                  room to tell two arrangements of the same piece apart. */}
              <PieceArt title={song.title} composer={song.composer} />
              <span className="song-body">
                <span className="name">
                  {song.title}
                  <EarnedStars count={starsBySong[song.id]} rate={starRates[song.id]} />
                </span>
                <span className="meta">
                  {song.composer && <span className="by">{shortName(song.composer)}</span>}
                  {suggestedId === song.id && <span className="next-up">next</span>}
                  <span className={`level l${song.difficulty}`}>{LEVEL[song.difficulty]}</span>
                  <FitBadge assessment={assessment} quiet />
                  <span className="secs">{runtime(song.approxDuration)}</span>
                </span>
              </span>
            </button><button className="favorite-toggle" aria-label={`${favorites.includes(song.id) ? 'Unfavorite' : 'Favorite'} ${song.title}`} aria-pressed={favorites.includes(song.id)} onClick={() => onFavorite?.(song.id)}><Icon name={favorites.includes(song.id) ? 'heartFill' : 'heart'} size={18} /></button></div>
          ))}
        </div>
        {hidden > 0 && (
          <p className="hint">
            {hidden} piece{hidden === 1 ? '' : 's'} hidden — they need more keys than you have. Switch fitting to
            “Fit my keys” to play them anyway.
          </p>
        )}
      </div>

      {localScores.length > 0 && (
        <div className="section">
          <h2 className="section-title">Your files</h2>
          <div className="song-list">
            {localScores.map((score) => (
              <button
                key={score.id}
                className={`song ${activeId === score.id ? 'active' : ''}`}
                onClick={() => onPick({ id: score.id, local: true })}
              >
                <span className="name">
                  {score.title}
                  <FitBadge assessment={assessFit(score.range, keyWindow)} />
                </span>
                <span className="meta">
                  {score.source.toUpperCase()} · {score.noteCount} notes · {score.key.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Folded shut. Both of these are read once and then never again, and
          together they were a third of a screen of permanent furniture under a
          list that has to be scrolled. */}
      <details className="section fold">
        <summary>Load your own file</summary>
        <div
          className={`file-drop ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          Drop a <strong>.mid</strong> or <strong>.musicxml</strong> here,
          <br />
          or{' '}
          <label>
            browse
            <input
              ref={inputRef}
              type="file"
              accept=".mid,.midi,.xml,.musicxml"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </div>
      </details>

      <details className="section fold">
        <summary>Play with your computer keys</summary>
        <p className="hint">
          <kbd>A</kbd>–<kbd>J</kbd> is the middle-C octave, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd>{' '}
          <kbd>Y</kbd> <kbd>U</kbd> the black keys, <kbd>Z</kbd>–<kbd>M</kbd> an octave lower.
          Clicking the on-screen keys works too.
        </p>
      </details>
    </>
  );
}
