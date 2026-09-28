import { useState } from 'react';
import { COLLECTIONS, collectionEntries, pieceDetails } from '../lib/discovery.js';
import PieceArt from './PieceArt.jsx';

export default function DiscoverPieces({ entries, instrument, favorites, onFavorite, onPick, preview }) {
  const [selection,setSelection]=useState('first');
  const collections=COLLECTIONS[instrument];
  const selected=collections.some(c=>c.id===selection)||selection==='favorites'?selection:'first';
  const pieces=collectionEntries(entries,instrument,selected,favorites);
  return <section className="discover-pieces" aria-labelledby="discover-title">
    <header><div><span className="eyebrow">FOLLOW YOUR CURIOSITY</span><h3 id="discover-title">Find something you’ll love playing.</h3></div><span>Listen first. Explore at your pace.</span></header>
    <div className="discovery-tabs" role="group" aria-label="Song collections">{[...collections,{id:'favorites',title:'Your favourites'}].map(c=><button key={c.id} aria-pressed={selected===c.id} onClick={()=>{preview.stop();setSelection(c.id);}}>{c.title}</button>)}</div>
    <p>{collections.find(c=>c.id===selected)?.description ?? 'The pieces you saved, ready when you are.'}</p>
    <div className="discovery-grid">{pieces.map(piece=>{const detail=pieceDetails(piece);return <article className="discovery-card" key={piece.id}>
      <div className="discovery-art"><PieceArt title={piece.title} kind={instrument}/><span>{detail.level}</span><button aria-label={`${favorites.includes(piece.id)?'Unfavorite':'Favorite'} ${piece.title}`} aria-pressed={favorites.includes(piece.id)} onClick={()=>onFavorite(piece.id)}>{favorites.includes(piece.id)?'♥':'♡'}</button></div>
      <h4>{piece.title}</h4><span className="piece-length">{detail.length} · {piece.bpm} bpm</span><p>{detail.needs}</p>
      <div className="discovery-actions"><button aria-label={`${preview.id===piece.id?'Stop preview of':'Preview'} ${piece.title}`} onClick={()=>preview.play(piece)}>{preview.id===piece.id?(preview.loading?'Loading…':'■ Stop preview'):'▷ Preview'}</button><button onClick={()=>{preview.stop();onPick(piece);}}>Explore piece →</button></div>
    </article>;})}</div>
    {!pieces.length&&<p className="discovery-empty" role="status">Save a piece with the heart button to find it here.</p>}
    {preview.error&&<p role="alert">{preview.error}</p>}
    <small className="discovery-note">Exploring a piece never skips a learning-path checkpoint. Previews do not count as practice.</small>
  </section>;
}

