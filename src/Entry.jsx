import { lazy, Suspense, useState } from 'react';
import WelcomePage from './components/WelcomePage.jsx';
import { loadSettings, saveSettings } from './lib/storage.js';
import { INSTRUMENTS, PICKER } from './lib/instruments.js';
const App=lazy(()=>import('./App.jsx'));

export default function Entry() {
  const saved=loadSettings();
  const query=new URLSearchParams(window.location.search);
  const base=import.meta.env.BASE_URL;
  const route=window.location.pathname.startsWith(base)
    ? `/${window.location.pathname.slice(base.length)}`.replace(/\/+/g,'/')
    : window.location.pathname;
  const sharedLesson=query.get('lesson');
  const routed=PICKER.find(id=>route===`/${id}/`);
  const requested=INSTRUMENTS.includes(query.get('instrument'))?query.get('instrument'):routed??'piano';
  const publicRoute=['/welcome/',...PICKER.map(id=>`/${id}/`),'/learn/first-melody/'].includes(route);
  const [entered,setEntered]=useState(()=>!!saved.onboarded&&!publicRoute&&!sharedLesson);
  const [startup,setStartup]=useState(null);
  const enter=({kind,instrument=requested,lessonId})=>{
    if(kind!=='resume'){
      const patch={onboarded:true,practiceInstrument:instrument,learningView:kind==='explore'?'studio':'home',
        startIntent:kind==='quick'||kind==='shared'?{kind,instrument,lessonId}:null,entryFreePlay:kind==='explore'};
      saveSettings(patch);setStartup(patch);
    }
    window.history.replaceState({},'', base);
    setEntered(true);
  };
  return entered?<Suspense fallback={<main className="entry-loading" role="status"><span className="eyebrow">PRACTICE DECK</span><h1>Opening your studio…</h1><p>The music will wait for you.</p></main>}><App startupSettings={startup??{}}/></Suspense>:<WelcomePage returning={!!saved.onboarded} initialInstrument={requested} sharedLesson={sharedLesson} onEnter={enter}/>;
}
