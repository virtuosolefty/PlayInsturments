import PieceArt from './PieceArt.jsx';
import Icon from './Icon.jsx';
import { useState } from 'react';
import SongLibrary from './SongLibrary.jsx';
import { INSTRUMENTS, instrumentInfo, instrumentKit, usesKit } from '../lib/instruments.js';

export default function StudioLibrary({ instrument, onInstrument, onPickStudy, favorites = [], onFavorite, recentId, dailySet = [], dailyProgress, onPlan, ...props }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const guitar = usesKit(instrument);
  const kit = instrumentKit(instrument);
  const label = instrumentInfo(instrument).label;
  const allStudies = kit?.studies ?? [];
  const matches = song => (filter !== 'favorites' || favorites.includes(song.id)) && (level === 'all' || (song.difficulty ?? 1) <= 2);
  const recent = (guitar ? allStudies : props.library).find(s => s.id === recentId);
  const choose = song => guitar ? onPickStudy(song.id) : props.onPick(song);
  const studies = allStudies.filter(matches).filter(s => `${s.title} ${s.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const searching = query.trim() || filter !== 'all' || level !== 'all';
  return <>
    <div className="library-intro">
      <h2>Find your next piece.</h2>
      <label className="library-search"><span className="sr-only">{guitar ? `Search ${label.toLowerCase()} studies` : 'Search pieces and composers'}</span><input type="search" placeholder={guitar ? `Search ${label.toLowerCase()} studies…` : 'Search pieces or composers…'} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="library-filter-row">
        <div className="library-instruments" role="group" aria-label="Library instrument">{INSTRUMENTS.map(v => <button key={v} aria-pressed={instrument === v} onClick={() => { onInstrument(v); setQuery(''); }}>{instrumentInfo(v).label}</button>)}</div>
        <div className="library-filters"><button aria-pressed={filter === 'favorites'} onClick={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')}><Icon name="heart" size={14} /> Favorites</button><select aria-label="Difficulty" value={level} onChange={e => setLevel(e.target.value)}><option value="all">All levels</option><option value="beginner">Beginner</option></select></div>
      </div>
      {searching ? <button className="clear-library-filters" onClick={() => { setQuery(''); setFilter('all'); setLevel('all'); }}>Clear search and filters</button> : <div className="library-start">
        {recent && <button className="resume-piece" onClick={() => choose(recent)}><span>CONTINUE</span><strong>{recent.title}</strong><span>Open piece →</span></button>}
        {!guitar && dailySet.length > 0 && <button className="plan-preview" onClick={onPlan}><span>TODAY’S PLAN · {dailyProgress?.done ?? 0}/{dailyProgress?.goal ?? 3} RUNS</span><strong>{dailyProgress?.met ? 'Your daily goal is complete' : dailySet[0].label}</strong><span>View your practice plan →</span></button>}
      </div>}
    </div>
    {guitar ? <div className="section">
      <h2 className="section-title">{label} studies <span>{studies.length} pieces</span></h2>
      <div className="song-list">{studies.map(s => <div className="song-row" key={s.id}><button className={'song ' + (props.activeId === s.id ? 'active' : '')} onClick={() => onPickStudy(s.id)}><PieceArt title={s.title} kind="guitar" /><span className="song-body"><span className="name">{s.title}</span><span className="meta"><span className="level l1">Beginner</span><span className="secs">{Math.round(s.duration)}s · {s.bpm} bpm</span></span><span className="song-description">{s.description}</span></span></button><button className="favorite-toggle" aria-label={(favorites.includes(s.id) ? 'Unfavorite ' : 'Favorite ') + s.title} aria-pressed={favorites.includes(s.id)} onClick={() => onFavorite(s.id)}><Icon name={favorites.includes(s.id) ? 'heartFill' : 'heart'} size={18} /></button></div>)}</div>
      {!studies.length && <p className="hint" role="status">No studies match. Clear your search or filters to see all pieces.</p>}
      <p className="library-save-note">{kit?.drums ? 'Nine pieces, each on its own key. To explore the kit with no score, choose Free play.' : kit?.bowed ? `${instrumentInfo(instrument).detail}. For scales and open-string bowing, choose Free play.` : 'Standard tuning. For chord shapes and strumming, choose Free play.'}</p>
    </div> : <SongLibrary {...props} searchQuery={query} library={props.library.filter(matches)} favorites={favorites} onFavorite={onFavorite} />}
    <p className="library-save-note">Saved on this device. Export or restore a backup in Progress.</p>
  </>;
}
