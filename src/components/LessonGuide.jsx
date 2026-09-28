import { useEffect, useRef, useState } from 'react';
import { LESSON_STEPS, lessonCanVisit, noteInstruction } from '../lib/learning.js';
import { GUITAR_CHORDS } from '../lib/guitar.js';
import { useGuitarInput } from '../hooks/useGuitarInput.js';
import { playInput } from '../lib/playInput.js';

export function LessonBar({ learning, engine, onShowGuide }) {
  const { record, ready } = learning;
  const playable = !['sound','note'].includes(record.step);
  const steps=record.quick?[{id:'note',label:'Make a sound'},{id:'follow',label:'Play a phrase'},{id:'done',label:'Your next step'}]:LESSON_STEPS;
  return <section className="lesson-bar" aria-label="Lesson steps">
    <ol>{steps.map((step,index) => <li key={step.id}><button aria-current={record.step === step.id ? 'step' : undefined} disabled={!ready || (step.id==='done'?!record.followed:!lessonCanVisit(step.id, record))} onClick={() => step.id==='done'?learning.finishQuick():learning.goStep(step.id)}><span>{String(index+1).padStart(2,'0')}</span>{step.label}</button></li>)}</ol>
    {onShowGuide && <button className="lesson-guide-toggle" onClick={onShowGuide}>Open lesson guide</button>}
    <div className="lesson-transport"><button className={playable ? 'primary' : ''} disabled={!ready || !playable || learning.starting} onClick={() => learning.togglePlay()}>{learning.starting ? 'Preparing sound…' : engine.playing ? 'Pause lesson' : record.step === 'listen' ? 'Listen to the phrase' : record.step === 'check' ? 'Start mastery check' : playable ? 'Play this step' : 'Follow the guide →'}</button><button disabled={!ready || !playable || learning.starting} onClick={() => learning.togglePlay(true)}>Restart step</button><span>{engine.playing ? 'In progress' : 'Ready at your pace'} · {record.step === 'listen' || record.step === 'check' ? 100 : Math.round(record.rate*100)}% speed</span><button className="lesson-save" onClick={learning.openHome}>Save & leave</button></div>
  </section>;
}

function LessonChords({ score, engine, step }) {
  const names = [...new Set(score.notes.map(n => n.chord).filter(Boolean))];
  const { pluck, silence } = useGuitarInput();
  useEffect(() => { silence(); }, [step, engine.playing, silence]);
  if (!names.length) return null;
  const next = (engine.sessionRef.current?.currentGate?.notes ?? score.notes.filter(n => n.time >= engine.songTime - .15)).find(n => n.chord);
  const current = GUITAR_CHORDS.find(c => c.name === (next?.chord ?? names[0]));
  return <div className="lesson-chords"><span className="eyebrow">{next ? 'NEXT CHORD' : 'CHORD SHAPE'} · {current.name}</span><div className="lesson-chord-fingers" aria-label={`${current.name} chord frets, low E to high E`}>{current.frets.map((fret,i) => <span key={i}><small>{['E','A','D','G','B','e'][i]}</small><b>{fret ?? '×'}</b></span>)}</div><p>0 = open · × = skip this string. Fingers: 1 index, 2 middle, 3 ring.</p><div>{names.map(name => <button key={name} onClick={() => { const chord=GUITAR_CHORDS.find(c=>c.name===name); silence(); pluck(chord.frets.flatMap((fret,string)=>fret===null?[]:[{string,fret}]),{spread:24,strength:.72}); }}>Strum {name}</button>)}</div></div>;
}

export default function LessonGuide({ learning, engine, score, guitar, onSetup, path }) {
  const { record, outcome } = learning;
  const [tipOpen, setTipOpen] = useState(false);
  const heading = useRef(null);
  useEffect(() => {
    if (!learning.ready) return;
    heading.current?.focus({ preventScroll: true });
    const pane = heading.current?.closest('.pane.right');
    if (pane) pane.scrollTop = 0;
  }, [record.step, learning.ready]);
  useEffect(() => () => playInput.release('lesson-first-note'), []);
  const first = score?.notes[0];
  const target = engine.sessionRef.current?.currentGate?.notes?.filter(n => n.status === 'pending')?.[0];
  const result = engine.lastResult;
  const passed = ['passed','mastered'].includes(outcome?.kind);
  const copy = {
    sound: ['Let’s make a sound.', 'Play a test note, then confirm you can hear it. This checks the selected sound output.'],
    note: ['Your first note.', guitar ? 'Pluck the highlighted string. An open string needs no finger on a fret.' : 'Find this note on the keyboard. You can click a key, use your computer keys, or play a MIDI controller.'],
    listen: ['Hear the shape of it.', 'Press Listen to the phrase above. Watch where the notes land; you don’t need to play yet.'],
    follow: ['Find the notes. Take your time.', 'Press Play this step. The music waits until you play the next note or chord. Timing is not assessed here.'],
    practice: ['Give the phrase a rhythm.', 'Play at a comfortable speed. After the phrase, choose whether to repeat or raise the tempo a little.'],
    check: ['See what you’ve learned.', 'Play the full phrase in time at 100% speed. Three stars passes the exercise; four stars counts toward the next stage.'],
  }[record.step];
  const next = learning.recommendedId;
  return <section className="lesson-guide" aria-label="Lesson coach">
    <span className="eyebrow">{record.daily && !record.daily.complete ? `TODAY’S PRACTICE · ${record.daily.index+1} OF ${record.daily.ids.length}` : 'YOUR LESSON GUIDE'}</span>
    <h2 ref={heading} tabIndex={-1}>{copy[0]}</h2><p className="lesson-instruction">{copy[1]}</p>
    {!learning.ready && <div role={learning.error ? 'alert' : 'status'} className="lesson-load-state"><strong>{learning.error || 'Preparing your lesson…'}</strong>{learning.error && <><button onClick={learning.retry}>Retry lesson</button><button onClick={onSetup}>Check sound setup</button></>}</div>}
    {learning.ready && record.step === 'sound' && <div className="lesson-actions"><button className="primary" disabled={learning.testing} onClick={learning.sendTest}>{learning.testing ? 'Sending test note…' : 'Play a test note'}</button>{learning.testSent && <><p role="status">Test note sent. Did you hear it?</p><button className="primary" onClick={learning.confirmSound}>I heard it</button></>}<button onClick={onSetup}>No sound? Check setup</button></div>}
    {learning.ready && record.step === 'note' && <div className="first-note-target"><span>LOOK FOR</span><strong>{noteInstruction(first,guitar)}</strong><button onClick={() => {playInput.press('lesson-first-note',first.midi,.72,guitar?{source:'guitar-screen',string:first.string,fret:first.fret}:{});setTimeout(()=>playInput.release('lesson-first-note'),400);}}>Play {first.name} on screen</button><small>Or play this note on the instrument below.</small>{record.quick&&<button onClick={onSetup}>No sound? Check setup</button>}</div>}
    {learning.noteHint && <p className="lesson-note-feedback" role="status">{learning.noteHint}</p>}
    {record.step === 'listen' && record.listened && <div className="lesson-actions"><p className="lesson-success">✓ Demonstration completed</p><button className="primary" onClick={() => learning.goStep('follow')}>Now find the notes →</button></div>}
    {record.step === 'follow' && !record.followed && <div className="lesson-target"><span>NEXT NOTE</span><strong>{noteInstruction(target ?? first,guitar)}</strong><p>{engine.summary?.hit ?? 0} / {score?.noteCount ?? 0} notes found</p></div>}
    {['follow','practice','check'].includes(record.step) && guitar && score && <LessonChords score={score} engine={engine} step={record.step}/>}
    {record.step === 'practice' && <div className="lesson-tempo"><label htmlFor="lesson-speed">Comfortable tempo <b>{Math.round(record.rate*100)}%</b></label><input id="lesson-speed" aria-label="Lesson practice speed" type="range" min=".4" max="1" step=".05" value={record.rate} disabled={engine.playing} onChange={e=>learning.changeRate(+e.target.value)}/><small>Tempo means speed. Adjust it between attempts.</small></div>}
    {outcome && <div className="lesson-result" role="status"><span className="eyebrow">YOUR LAST ATTEMPT</span><h3>{outcome.title}</h3><p>{outcome.message}</p><details><summary>See the numbers</summary><p>{result.summary.hit} notes hit · {result.summary.missed} missed · {result.summary.wrongNotes} extra notes</p><p>{result.grade.complete ? `${result.grade.stars} / 5 stars` : 'Partial attempt'} · {Math.round(result.rate*100)}% speed</p></details></div>}
    {record.step === 'follow' && record.followed && <div className="lesson-actions">{record.quick&&<p className="lesson-success">You played a whole phrase. Your next step is to give it a rhythm.</p>}<button className="primary" onClick={() => record.quick?learning.finishQuick():record.daily && !record.daily.complete ? learning.finishDailyItem() : learning.goStep('practice')}>{record.quick?'Find my next step →':record.daily && !record.daily.complete ? 'Continue today’s practice →' : 'Next: add a rhythm →'}</button>{record.daily && <button onClick={()=>learning.goStep('practice')}>Spend more time on this phrase</button>}</div>}
    {record.step === 'practice' && record.practised && !engine.playing && <div className="lesson-actions">{record.rate < 1 && <button onClick={()=>learning.changeRate(learning.nextRate)}>Try {Math.round(learning.nextRate*100)}% next</button>}<button className="primary" onClick={()=>learning.goStep('check')}>Ready for a check at 100% →</button></div>}
    {record.step === 'check' && outcome && !engine.playing && <div className="lesson-actions">{passed ? <button className="primary" onClick={next && next !== score.id ? ()=>learning.startLesson(next) : learning.openHome}>{next && next !== score.id ? 'Continue to the next lesson →' : 'See your learning path →'}</button> : <button className="primary" onClick={()=>learning.goStep('practice')}>Practise at a slower tempo</button>}</div>}
    {outcome&&!passed&&record.step==='check'&&<button className="lesson-easier" onClick={()=>learning.goStep('follow')}>Take your time with the notes again</button>}
    {!record.quick&&<details className="lesson-requirement"><summary>{path.state.exercises[score?.id]?.passed ? '✓ Check passed · how mastery works' : 'How the next milestone works'}</summary><p>3 stars at 100% speed passes this exercise. Master each exercise with 4 stars to open the next stage. Guided practice is saved separately.</p></details>}
    <button className="lesson-tip-toggle" aria-expanded={tipOpen} onClick={()=>setTipOpen(v=>!v)}>A little help with the terms {tipOpen ? '−' : '+'}</button>
    {tipOpen && <p className="lesson-glossary">{guitar ? 'A fret is a space on the neck. String 1 is the thinnest, high E. Finger numbers describe your fretting hand. Use the on-screen guitar or MIDI input; this app does not listen through a microphone.' : 'C4 is middle C. Finger 1 is your thumb and 5 is your little finger. Notes name the pitch; tempo describes how fast the beat moves.'}</p>}
  </section>;
}
