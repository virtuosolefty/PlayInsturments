import PieceArt from './PieceArt.jsx';
import Icon from './Icon.jsx';
import { useState } from 'react';
import SongLibrary from './SongLibrary.jsx';
import { GUITAR_STUDIES } from '../lib/guitar.js';

export default function StudioLibrary({ instrument, onInstrument, onPickGuitar, favorites = [], onFavorite, recentId, dailySet = [], dailyProgress, onPlan, ...props }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const guitar = instrument === 'guitar';
  const matches = song => (filter !== 'favorites' || favorites.includes(song.id)) && (level === 'all' || (song.difficulty ?? 1) <= 2);
  const recent = (guitar ? GUITAR_STUDIES : props.library).find(s => s.id === recentId);
  const choose = song => guitar ? onPickGuitar(song.id) : props.onPick(song);
  const studies = GUITAR_STUDIES.filter(matches).filter(s => `${s.title} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const searching = query.trim() || filter !== 'all' || level !== 'all';
  return <>
    <div className="library-intro">
      <h2>Find your next piece.</h2>
      <label className="library-search"><span className="sr-only">{guitar ? 'Search guitar studies' : 'Search pieces and composers'}</span><input type="search" placeholder={guitar ? 'Search guitar studies…' : 'Search pieces or composers…'} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="library-filter-row">
        <div className="library-instruments" role="group" aria-label="Library instrument">{['piano', 'guitar'].map(v => <button key={v} aria-pressed={instrument === v} onClick={() => { onInstrument(v); setQuery(''); }}>{v === 'piano' ? 'Piano' : 'Guitar'}</button>)}</div>
        <div className="library-filters"><button aria-pressed={filter === 'favorites'} onClick={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')}><Icon name="heart" size={14} /> Favorites</button><select aria-label="Difficulty" value={level} onChange={e => setLevel(e.target.value)}><option value="all">All levels</option><option value="beginner">Beginner</option></select></div>
      </div>
      {searching ? <button className="clear-library-filters" onClick={() => { setQuery(''); setFilter('all'); setLevel('all'); }}>Clear search and filters</button> : <div className="library-start">
        {recent && <button className="resume-piece" onClick={() => choose(recent)}><span>CONTINUE</span><strong>{recent.title}</strong><span>Open piece →</span></button>}
        {!guitar && dailySet.length > 0 && <button className="plan-preview" onClick={onPlan}><span>TODAY’S PLAN · {dailyProgress?.done ?? 0}/{dailyProgress?.goal ?? 3} RUNS</span><strong>{dailyProgress?.met ? 'Your daily goal is complete' : dailySet[0].label}</strong><span>View your practice plan →</span></button>}
      </div>}
    </div>
    {guitar ? <div className="section">
      <h2 className="section-title">Guitar studies <span>{studies.length} pieces</span></h2>
      <div className="song-list">{studies.map(s => <div className="song-row" key={s.id}><button className={'song ' + (props.activeId === s.id ? 'active' : '')} onClick={() => onPickGuitar(s.id)}><PieceArt title={s.title} kind="guitar" /><span className="song-body"><span className="name">{s.title}</span><span className="meta"><span className="level l1">Beginner</span><span className="secs">{Math.round(s.duration)}s · {s.bpm} bpm</span></span><span className="song-description">{s.description}</span></span></button><button className="favorite-toggle" aria-label={(favorites.includes(s.id) ? 'Unfavorite ' : 'Favorite ') + s.title} aria-pressed={favorites.includes(s.id)} onClick={() => onFavorite(s.id)}><Icon name={favorites.includes(s.id) ? 'heartFill' : 'heart'} size={18} /></button></div>)}</div>
      {!studies.length && <p className="hint" role="status">No studies match. Clear your search or filters to see all pieces.</p>}
      <p className="library-save-note">Standard tuning. For chord shapes and strumming, choose Free play.</p>
    </div> : <SongLibrary {...props} searchQuery={query} library={props.library.filter(matches)} favorites={favorites} onFavorite={onFavorite} />}
    <p className="library-save-note">Saved on this device. Export or restore a backup in Progress.</p>
  </>;
}
