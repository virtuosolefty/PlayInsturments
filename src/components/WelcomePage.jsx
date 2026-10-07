import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../lib/storage.js';
import { INSTRUMENTS, instrumentInfo } from '../lib/instruments.js';
import Icon from './Icon.jsx';

const PREVIEW_ALT = {
  piano: 'The Practice Deck piano with three-dimensional keys and falling notes',
  guitar: 'The Practice Deck acoustic guitar with a three-dimensional fretboard, headstock and soundhole',
  violin: 'The Practice Deck violin fingerboard with finger tapes, scroll, bridge and f-holes',
  cello: 'The Practice Deck cello fingerboard with finger tapes, scroll, bridge and f-holes',
};

export default function WelcomePage({ onEnter, returning, initialInstrument='piano', sharedLesson=null }) {
  const base=import.meta.env.BASE_URL;
  const [instrument,setInstrument]=useState(initialInstrument);
  const [theme,setTheme]=useState(()=>loadSettings().theme==='dark'?'dark':'light');
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;},[theme]);
  const toggleTheme=()=>{const next=theme==='light'?'dark':'light';setTheme(next);saveSettings({theme:next});};
  // The preview image's `fetchpriority` is lowercase on purpose: React 18 warns about the camelCase prop. Spell it `fetchPriority` once the project is on React 19.
  return <div className="welcome-page">
    <a className="skip-link" href="#welcome-main">Skip to introduction</a>
    <header className="welcome-nav"><a className="welcome-brand" href={`${base}welcome/`} aria-label="Practice Deck home"><i className="mark" aria-hidden="true" />Practice Deck</a><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a>{INSTRUMENTS.map(id=><a key={id} href={`${base}${id}/`}>{instrumentInfo(id).label}</a>)}<button onClick={toggleTheme} aria-label={`Switch to ${theme==='light'?'dark':'light'} theme`}><Icon name={theme==='light'?'moon':'sun'} />{theme==='light'?'Dark':'Light'}</button>{returning&&<button onClick={()=>onEnter({kind:'resume'})}>Continue learning →</button>}</nav></header>
    <main id="welcome-main">
      <section className="welcome-hero">
        <div className="welcome-copy"><span className="eyebrow">A LITTLE MUSIC. A LITTLE EVERY DAY.</span><h1>That first melody?<br/><em>You can play it.</em></h1><p>A calm place to explore piano, guitar, violin and cello. Follow the notes, take your time, and hear your progress.</p>
          {sharedLesson&&<p className="shared-invitation">A lesson has been shared with you. Open it when you’re ready; playback starts only when you press Play.</p>}
          <div className="welcome-cta"><button className="primary" onClick={()=>onEnter({kind:sharedLesson?'shared':'quick',instrument,lessonId:sharedLesson})}>{sharedLesson?'Open shared lesson':`Try ${instrument}`} <span aria-hidden="true">→</span></button><button onClick={()=>onEnter({kind:'home',instrument})}>Guide me from the beginning →</button></div>
          <p className="welcome-reassurance">No account needed. Start with your mouse or computer keyboard.</p>
          <button className="welcome-text-action" onClick={()=>onEnter({kind:'explore',instrument})}>Explore freely</button>
        </div>
        <div className="welcome-preview"><div className="welcome-preview-bar"><span><i/> INSIDE THE STUDIO</span><div role="group" aria-label="Preview instrument">{INSTRUMENTS.map(value=><button key={value} aria-pressed={instrument===value} onClick={()=>setInstrument(value)}>{instrumentInfo(value).label}</button>)}</div></div><img src={`${base}media/${instrument}-studio.png`} width="1280" height="720" alt={PREVIEW_ALT[instrument] ?? PREVIEW_ALT.piano} fetchpriority="high"/><div className="welcome-preview-caption"><span>Real instruments. A little guidance.</span><span>Light & dark themes</span></div></div>
      </section>
      <section id="how-it-works" className="welcome-method" aria-labelledby="welcome-method-title"><div><h2 id="welcome-method-title">From curious to “I played that.”</h2></div><ol><li><b>01</b><h3>Make a sound</h3><p>Find your first key or string. Nothing plays until you choose.</p></li><li><b>02</b><h3>Follow a phrase</h3><p>The music waits for your next note. There’s no rush.</p></li><li><b>03</b><h3>Make it yours</h3><p>Build a rhythm, try a song, and come back to your saved place.</p></li></ol></section>
      <section className="welcome-faq" aria-label="Before you start"><h2>A few things to know.</h2><details><summary>Do I need an instrument?</summary><p>You can start on screen. Piano also works with computer keys, and every instrument accepts MIDI input. Violin and cello are played by pressing and holding the on-screen fingerboard. Microphone recognition of acoustic instruments is not supported.</p></details><details><summary>What happens to my progress?</summary><p>Lessons and preferences are saved in this browser. Download a backup from your learning home or Progress to move or protect your practice history. Account sync is not available.</p></details><details><summary>What if I can’t hear anything?</summary><p>Use Enable sound, then No sound? in the studio. You can check the output and send a test note. A simpler instrument remains available if samples cannot load.</p></details><details><summary>Can I take a break?</summary><p>Yes. Pause whenever you need to. Your place is saved, and returning never starts playback automatically.</p></details></section>
    </main><footer className="welcome-footer"><span>Practice Deck · Your music. Your pace.</span><a href={`${base}learn/first-melody/`}>Your first melody</a><a href={`${base}about-data/`}>Your data & compatibility</a></footer>
  </div>;
}
