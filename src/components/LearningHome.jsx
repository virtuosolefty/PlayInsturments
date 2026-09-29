import { InstrumentIcon } from './StudioHeader.jsx';
import { INSTRUMENTS, instrumentInfo } from '../lib/instruments.js';
import { dayKey } from '../lib/streaks.js';
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { pieceDetails, weeklyPractice, sharedLessonUrl } from '../lib/discovery.js';
import DiscoverPieces from './DiscoverPieces.jsx';
import { exportHistory } from '../lib/storage.js';

export function LearningSummary({ learning, state, onOpen }) {
  const guided = Object.values(learning.record.completed).filter(item => item.guided).length;
  return <section className="learning-summary">
    <span className="eyebrow">YOUR LEARNING JOURNEY</span>
    <h3>Small steps. Visible progress.</h3>
    <p>{guided} guided {guided === 1 ? 'lesson' : 'lessons'} completed · {state.passedCount} checks passed</p>
    <button onClick={onOpen}>Continue your learning path →</button>
    <p className="hint">Guided practice builds familiarity. A check at the written tempo measures readiness for the next lesson.</p>
  </section>;
}

export default function LearningHome({ learning, path, instrument, onInstrument, onExplore, onLibrary, days, settings, setSettings, preview, onPick, onFavorite, onBackup, storageProblem }) {
  const base=import.meta.env.BASE_URL;
  const heading = useRef(null);
  const [message,setMessage]=useState('');
  const [sessionSize,setSessionSize]=useState('full');
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { record, entries, recommendedId } = learning;
  const saved = entries.find(e => e.id === record.lessonId);
  const savedPassed = path.state.exercises[saved?.id]?.passed;
  const current = saved && !record.daily?.complete && (!savedPassed || record.step !== 'check') ? saved : entries.find(e => e.id === recommendedId);
  const resume = !!saved && current?.id === saved.id;
  const stage = path.state.stages.find(s => s.exercises.includes(current?.id));
  const guided = Object.values(record.completed).filter(item => item.guided).length;
  const dailyComplete = record.daily?.complete && record.daily.day === dayKey();
  const detail=pieceDetails(current);
  const week=weeklyPractice(days,settings.weeklyPracticeGoal);
  const completedAny=guided>0||path.state.passedCount>0;
  const share=async()=>{
    try { await navigator.clipboard.writeText(sharedLessonUrl(instrument,current.id));setMessage('Lesson link copied. Your progress stays private.'); }
    catch {setMessage('Copy this lesson link: '+sharedLessonUrl(instrument,current.id));}
  };
  const backup=()=>{
    const url=URL.createObjectURL(new Blob([exportHistory()],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`practice-deck-${dayKey()}.json`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Backup download requested. Keep it somewhere safe.');
  };
  return <main className="learning-home" aria-labelledby="learning-home-title">
    <div className="learning-home-inner">
      <header className="learning-home-heading">
        <div><span className="eyebrow">{resume?'WELCOME BACK':'YOUR NEXT SMALL STEP'}</span><h2 id="learning-home-title" ref={heading} tabIndex={-1}>{resume?'A little more music today.':'A clear path to your first song.'}</h2><p>{resume?`Pick up ${current.title} where you left off. Your place is waiting.`:'Find your notes, play a phrase, and make it your own.'}</p></div>
        <div className="learning-instruments" role="group" aria-label="Learning instrument">{INSTRUMENTS.map(value => <button key={value} aria-pressed={instrument === value} onClick={() => onInstrument(value)}><InstrumentIcon instrument={value}/>{instrumentInfo(value).label}</button>)}</div>
      </header>
      {dailyComplete && <div className="daily-finished" role="status"><strong>Today’s practice is complete.</strong><span>You worked through {record.daily.ids.length} {record.daily.ids.length === 1 ? 'piece' : 'pieces'}. Your next lesson is ready whenever you are.</span></div>}
      <div className="learning-home-grid">
        <section className="next-lesson-card">
          <div className="learning-card-meta"><span className="eyebrow">{resume ? 'PICK UP WHERE YOU LEFT OFF' : 'START HERE'}</span><span>{stage?.name ?? 'Your next lesson'}</span></div>
          <h3>{current?.title ?? 'Preparing your lessons…'}</h3>
          <p className="next-skill">{detail.skill || 'Find your first note and build a short phrase, one step at a time.'}</p>
          <div className="next-piece-facts"><span>{detail.level}</span><span>{detail.length}</span><span>{resume?`Next: ${{sound:'check your sound',note:'find your first note',listen:'hear the phrase',follow:'follow the notes',practice:'build your rhythm',check:'check your progress'}[record.step]}`:'No rush. The notes can wait.'}</span></div>
          {record.completed[current?.id]?.comfortableRate > 0 && <p className="comfortable-best">Your best comfortable tempo: {Math.round(record.completed[current.id].comfortableRate * 100)}%</p>}
          <div className="lesson-method"><span>01 <b>Hear it</b></span><span>02 <b>Find the notes</b></span><span>03 <b>Build a rhythm</b></span></div>
          <button className="primary" disabled={!current} onClick={() => learning.startLesson(current.id)}>{resume ? 'Continue learning' : record.lessonId ? 'Start the next lesson' : 'Start my first lesson'} <span aria-hidden="true">→</span></button>
          <div className="next-secondary"><button disabled={!current} onClick={()=>preview.play(current)}>{preview.id===current?.id?(preview.loading?'Loading preview…':'■ Stop preview'):'▷ Hear a short preview'}</button><button disabled={!current} onClick={share}>Copy lesson link</button></div>
          <span className="learning-save-note">{storageProblem?'Your browser could not save recent changes. This session may not be available after you leave.':'Your place is saved on this device. Nothing starts until you’re ready.'}</span>
        </section>
        <section className="daily-learning-card">
          <span className="eyebrow">MAKE ROOM FOR MUSIC</span><h3>Today’s practice</h3>
          <p>Choose what fits your day. Every phrase is a useful step.</p>
          <div className="practice-size" role="group" aria-label="Practice session length"><button aria-pressed={sessionSize==='short'} onClick={()=>setSessionSize('short')}>One phrase</button><button aria-pressed={sessionSize==='full'} onClick={()=>setSessionSize('full')}>Full sequence</button></div>
          <ol>{(sessionSize==='short'?learning.dailyItems.filter(item=>item.kind==='work').slice(0,1).length?learning.dailyItems.filter(item=>item.kind==='work').slice(0,1):learning.dailyItems.slice(0,1):learning.dailyItems).map(item => <li key={item.songId}><span>{({ warmup:'Warm up',work:'Your current lesson',preview:'A preview',recital:'Play for enjoyment' })[item.kind]}</span><strong>{item.label}</strong></li>)}</ol>
          <button onClick={()=>learning.startDaily(sessionSize)} disabled={!learning.dailyItems.length}>{dailyComplete ? 'Practise again' : 'Start today’s practice'}</button>
          <span className="hint">{path.progress.done} / {path.progress.goal} completed runs today</span>
        </section>
      </div>
      <section className="weekly-practice" aria-label="Weekly practice goal"><div><span className="eyebrow">A HABIT THAT FITS YOUR LIFE</span><h3>{week.count>=week.goal?'You made room for music.':`${week.count} of ${week.goal} practice days this week`}</h3><p>Finish a run or practise for three minutes to count a day. Rest days are welcome.</p></div><div className="week-days" aria-label={`${week.count} practice days this week`}>{week.days.map((day,i)=><span key={day.date} className={`${day.done?'done':''} ${day.today?'today':''}`} title={`${day.date}${day.done?': practised':day.future?': coming up':': not yet'}`}><small>{['M','T','W','T','F','S','S'][i]}</small><b aria-label={`${day.date}: ${day.done?'practised':day.future?'coming up':'not yet'}`}>{day.done?'✓':day.today?'·':'—'}</b></span>)}</div><label>Weekly goal<select aria-label="Weekly practice days" value={week.goal} onChange={e=>setSettings(s=>({...s,weeklyPracticeGoal:+e.target.value}))}>{[2,3,5].map(n=><option key={n} value={n}>{n} days</option>)}</select></label></section>
      <DiscoverPieces entries={entries} instrument={instrument} favorites={settings.favoritePieces??[]} onFavorite={onFavorite} onPick={onPick} preview={preview}/>
      <section className="learning-roadmap" aria-labelledby="roadmap-title">
        <header><div><span className="eyebrow">ONE LESSON AT A TIME</span><h3 id="roadmap-title">Your {instrument} path</h3></div><p>{guided} guided · {path.state.passedCount} / {path.state.total} checks passed</p></header>
        <details className="learning-rule"><summary>How practice, passing and mastery work</summary><p>A completed guided lesson is saved as practice. Earn <strong>3 stars at 100% speed</strong> to pass an exercise; <strong>4 stars on every exercise</strong> opens the next stage. You can explore library pieces at any time.</p></details>
        <div className="learning-stages">{path.state.stages.map((item, index) => {
          const isCurrent = item.id === stage?.id;
          return <details key={item.id} open={isCurrent || undefined} className={`${item.cleared ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}>
            <summary><span className="learning-stage-number">{item.cleared ? '✓' : String(index + 1).padStart(2,'0')}</span><span><strong>{item.name}</strong><small>{item.goal}</small></span><span className="stage-state">{item.cleared ? 'Completed' : isCurrent ? 'You are here' : item.unlocked ? 'Available' : 'Coming up'}</span></summary>
            <div className="learning-stage-lessons">{item.entries.map(entry => <button key={entry.id} disabled={!entry.unlocked} onClick={() => learning.startLesson(entry.id)}><span>{entries.find(e => e.id === entry.id)?.title ?? entry.id}</span><small>{entry.mastered ? 'Mastered' : entry.passed ? 'Check passed · aim for 4 stars' : record.completed[entry.id]?.guided ? 'Guided practice completed' : entry.unlocked ? 'Ready to learn' : 'Complete the previous step'}</small></button>)}</div>
          </details>;
        })}</div>
      </section>
      <section className="learning-backup"><div><h3>{storageProblem?'Saving needs your attention.':completedAny?'Keep the progress you’ve earned.':'Your practice, kept on this device.'}</h3><p>{storageProblem?'An export contains previously saved history. Recent unsaved changes may be missing.':'Download a backup to protect your lessons and history. Restore it from Progress on another browser.'}</p></div><button onClick={backup}>Download progress backup</button><button onClick={onBackup}>Restore a backup</button></section>
      {message&&<p className="home-message" role="status">{message}</p>}
      <footer className="learning-home-footer"><span>Make room for curiosity, too.</span><button onClick={onExplore}>Explore freely</button><button onClick={onLibrary}>Browse the library</button></footer>
      <div className="learning-public-links"><a href={`${base}welcome/`}>About Practice Deck</a><a href={`${base}about-data/`}>Your data & compatibility</a></div>
    </div>
  </main>;
}
