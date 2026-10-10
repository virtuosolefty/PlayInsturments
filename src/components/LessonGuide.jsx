import { useEffect, useRef, useState } from 'react';
import { LESSON_STEPS, lessonCanVisit, lessonWords, noteInstruction } from '../lib/learning.js';
import { useStringInput } from '../hooks/useGuitarInput.js';
import { playInput } from '../lib/playInput.js';
import { isStringed, stringKit } from '../lib/instruments.js';
import NextNoteCard, { ComputerKey } from './NextNoteCard.jsx';

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

/** The chord a strummed lesson is on: its frets string by string, and a button to hear each chord of the lesson. */
function LessonChords({ kit, score, engine, step }) {
  const names = [...new Set(score.notes.map(n => n.chord).filter(Boolean))];
  const { pluck, silence } = useStringInput(kit.id);
  useEffect(() => { silence(); }, [step, engine.playing, silence]);
  if (!names.length) return null;
  const next = (engine.sessionRef.current?.currentGate?.notes ?? score.notes.filter(n => n.time >= engine.songTime - .15)).find(n => n.chord);
  const current = kit.chords.find(c => c.name === (next?.chord ?? names[0]));
  const count = kit.tuning.length, letter = s => kit.stringName(s).note;
  // The guitar's two E strings are told apart the way chord charts do it: the high one in lower case.
  const short = s => (s === count - 1 && letter(s) === letter(0) ? letter(s).toLowerCase() : letter(s));
  return <div className="lesson-chords"><span className="eyebrow">{next ? 'NEXT CHORD' : 'CHORD SHAPE'} · {current.name}</span><div className="lesson-chord-fingers" aria-label={`${current.name} chord frets, string ${count} (${letter(0)}) to string 1 (${letter(count - 1)})`}>{current.frets.map((fret,i) => <span key={i}><small>{short(i)}</small><b>{fret ?? '×'}</b></span>)}</div><p>0 = open · × = skip this string. Fingers: 1 index, 2 middle, 3 ring.</p><div>{names.map(name => <button key={name} onClick={() => { const chord=kit.chords.find(c=>c.name===name); silence(); pluck(chord.frets.flatMap((fret,string)=>fret===null?[]:[{string,fret}]),{spread:24,strength:.72}); }}>Strum {name}</button>)}</div></div>;
}

export default function LessonGuide({ learning, engine, score, instrument = 'piano', onSetup, path, typingOctave = 0 }) {
  const kit = stringKit(instrument);
  const fretted = !!kit?.fretted;
  const words = lessonWords(instrument);
  const { record, outcome } = learning;
  const [tipOpen, setTipOpen] = useState(false);
  const heading = useRef(null);
  useEffect(() => {
    if (!learning.ready) return;
    heading.current?.focus({ preventScroll: true });
    const pane = heading.current?.closest('.pane.right');
    if (pane) pane.scrollTop = 0;
  }, [record.step, learning.ready]);
  const firstNoteTimer = useRef(null);
  useEffect(() => () => { clearTimeout(firstNoteTimer.current); playInput.release('lesson-first-note'); }, []);
  const first = score?.notes[0];
  const target = engine.sessionRef.current?.currentGate?.notes?.filter(n => n.status === 'pending')?.[0];
  const result = engine.lastResult;
  const passed = ['passed','mastered'].includes(outcome?.kind);
  // The lesson as the path has it: once it is finished the next one is open, whatever the stars say.
  const entry = path.state.exercises[score?.id];
  const finished = !!entry?.finished;
  const copy = {
    sound: ['Let’s make a sound.', 'Play a test note, then confirm you can hear it. This checks the selected sound output.'],
    note: ['Your first note.', instrument === 'drums' ? 'Hit the drum with the blue ring. Tap it on the kit, tap its pad, or press its letter.' : fretted ? 'Pluck the highlighted string. An open string needs no finger on a fret.' : kit?.bowed ? 'Bow the highlighted string. Press and hold near the bridge for an open string.' : 'Find this note on the keyboard. You can click a key, use your computer keys, or play a MIDI controller.'],
    listen: ['Hear the shape of it.', 'Press Listen to the phrase above. Watch where the notes land; you don’t need to play yet.'],
    follow: words.follow,
    practice: ['Give the phrase a rhythm.', 'Play at a comfortable speed. After the phrase, choose whether to repeat or raise the tempo a little.'],
    check: ['See what you’ve learned.', 'Play the full phrase in time at 100% speed. Three stars passes the check and four masters the lesson. The next lesson is open either way.'],
  }[record.step];
  const next = learning.recommendedId;
  // Offered beside the lesson's own next step, never in place of it: the quick introduction and today's practice have their own way on.
  const canMoveOn = finished && !passed && !!next && next !== score?.id && !engine.playing && !record.quick && !(record.daily && !record.daily.complete)
    && (record.step === 'follow' ? record.followed : ['practice', 'check'].includes(record.step));
  return <section className="lesson-guide" aria-label="Lesson coach">
    <span className="eyebrow">{record.daily && !record.daily.complete ? `TODAY’S PRACTICE · ${record.daily.index+1} OF ${record.daily.ids.length}` : 'YOUR LESSON GUIDE'}</span>
    <h2 ref={heading} tabIndex={-1}>{copy[0]}</h2><p className="lesson-instruction">{copy[1]}</p>
    {!learning.ready && <div role={learning.error ? 'alert' : 'status'} className="lesson-load-state"><strong>{learning.error || 'Preparing your lesson…'}</strong>{learning.error && <><button onClick={learning.retry}>Retry lesson</button><button onClick={onSetup}>Check sound setup</button></>}</div>}
    {learning.ready && record.step === 'sound' && <div className="lesson-actions"><button className="primary" disabled={learning.testing} onClick={learning.sendTest}>{learning.testing ? 'Sending test note…' : 'Play a test note'}</button>{learning.testSent && <><p role="status">Test note sent. Did you hear it?</p><button className="primary" onClick={learning.confirmSound}>I heard it</button></>}<button onClick={onSetup}>No sound? Check setup</button></div>}
    {learning.ready && record.step === 'note' && <div className="first-note-target"><span>LOOK FOR</span><strong>{noteInstruction(first,instrument)}</strong><ComputerKey midi={first?.midi} instrument={instrument} typingOctave={typingOctave}/><button onClick={() => {playInput.press('lesson-first-note',first.midi,.72,isStringed(instrument)?{source:`${instrument}-screen`,string:first.string,fret:first.fret}:{});clearTimeout(firstNoteTimer.current);firstNoteTimer.current=setTimeout(()=>playInput.release('lesson-first-note'),kit?.bowed?900:400);}}>Play {first.name} on screen</button><small>{words.below}</small>{record.quick&&<button onClick={onSetup}>No sound? Check setup</button>}</div>}
    {learning.noteHint && <p className="lesson-note-feedback" role="status">{learning.noteHint}</p>}
    {record.step === 'listen' && record.listened && <div className="lesson-actions"><p className="lesson-success">✓ Demonstration completed</p><button className="primary" onClick={() => learning.goStep('follow')}>{words.find}</button></div>}
    {record.step === 'follow' && !record.followed && <NextNoteCard note={target ?? first} instrument={instrument} found={engine.summary?.hit ?? 0} total={score?.noteCount ?? 0} typingOctave={typingOctave}/>}
    {['follow','practice','check'].includes(record.step) && fretted && score && <LessonChords kit={kit} score={score} engine={engine} step={record.step}/>}
    {record.step === 'practice' && <div className="lesson-tempo"><label htmlFor="lesson-speed">Comfortable tempo <b>{Math.round(record.rate*100)}%</b></label><input id="lesson-speed" aria-label="Lesson practice speed" type="range" min=".4" max="1" step=".05" value={record.rate} disabled={engine.playing} onChange={e=>learning.changeRate(+e.target.value)}/><small>Tempo means speed. Adjust it between attempts.</small></div>}
    {outcome && <div className="lesson-result" role="status"><span className="eyebrow">YOUR LAST ATTEMPT</span><h3>{outcome.title}</h3><p>{outcome.message}</p><details><summary>See the numbers</summary><p>{result.summary.hit} notes hit · {result.summary.missed} missed · {result.summary.wrongNotes} extra notes</p><p>{result.grade.complete ? `${result.grade.stars} / 5 stars` : 'Partial attempt'} · {Math.round(result.rate*100)}% speed</p></details></div>}
    {record.step === 'follow' && record.followed && <div className="lesson-actions">{record.quick&&<p className="lesson-success">You played a whole phrase. Your next step is to give it a rhythm.</p>}<button className="primary" onClick={() => record.quick?learning.finishQuick():record.daily && !record.daily.complete ? learning.finishDailyItem() : learning.goStep('practice')}>{record.quick?'Find my next step →':record.daily && !record.daily.complete ? 'Continue today’s practice →' : 'Next: add a rhythm →'}</button>{record.daily && <button onClick={()=>learning.goStep('practice')}>Spend more time on this phrase</button>}</div>}
    {record.step === 'practice' && record.practised && !engine.playing && <div className="lesson-actions">{record.rate < 1 && <button onClick={()=>learning.changeRate(learning.nextRate)}>Try {Math.round(learning.nextRate*100)}% next</button>}<button className="primary" onClick={()=>learning.goStep('check')}>Ready for a check at 100% →</button></div>}
    {record.step === 'check' && outcome && !engine.playing && <div className="lesson-actions">{passed ? <button className="primary" onClick={next && next !== score.id ? ()=>learning.startLesson(next) : learning.openHome}>{next && next !== score.id ? 'Continue to the next lesson →' : 'See your learning path →'}</button> : <button className="primary" onClick={()=>learning.goStep('practice')}>Practise at a slower tempo</button>}</div>}
    {outcome&&!passed&&record.step==='check'&&<button className="lesson-easier" onClick={()=>learning.goStep('follow')}>Take your time with the notes again</button>}
    {canMoveOn&&<button className="lesson-easier lesson-move-on" onClick={()=>learning.startLesson(next)}>Move on to the next lesson →</button>}
    {!record.quick&&<details className="lesson-requirement"><summary>{entry?.passed ? '✓ Check passed · how mastery works' : finished ? '✓ Lesson finished · how the stars work' : 'How lessons open and stars are earned'}</summary><p>Play this lesson through once, at any speed or with the notes waiting for you, and the next lesson opens. Stars say how well you know it: 3 at 100% speed passes the check and 4 masters it.</p></details>}
    <button className="lesson-tip-toggle" aria-expanded={tipOpen} onClick={()=>setTipOpen(v=>!v)}>A little help with the terms {tipOpen ? '−' : '+'}</button>
    {tipOpen && <p className="lesson-glossary">{words.glossary ? words.glossary : kit?.bowed ? `${kit.label} strings are numbered from the highest (1) to the lowest (4). Finger numbers describe your left hand: 1 index to 4 little finger; 0 is an open string. The tapes on the fingerboard mark first-position fingers. Use the on-screen fingerboard, MIDI input, or your own instrument through the microphone (Input & sound).` : fretted ? `A fret is a space on the neck. String 1 is ${kit.stringName(kit.tuning.length - 1).note}, the one nearest the floor as you hold the ${kit.label.toLowerCase()}. Finger numbers describe your fretting hand. Use the on-screen ${kit.label.toLowerCase()}, MIDI input, or your own instrument through the microphone (Input & sound).` : 'C4 is middle C. Finger 1 is your thumb and 5 is your little finger. Notes name the pitch; tempo describes how fast the beat moves.'}</p>}
  </section>;
}
