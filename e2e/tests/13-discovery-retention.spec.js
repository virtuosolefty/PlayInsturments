import {test,expect} from '@playwright/test';
import {watchSound} from '../helpers/sound.js';
test.use({launchOptions:{args:[]}});
const key='piano-practice-coach:v1';
async function seed(page,settings={},days={}) {
 await page.addInitScript(({settings,days,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,songs:{},days,settings:{settingsVersion:5,onboarded:true,renderer:'canvas',countInBars:0,learningView:'home',...settings}}));},{settings,days,key});
}
async function data(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}

test('welcome explains inputs, defers the studio and allows choosing either instrument',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto('/');
 await expect(page.getByRole('heading',{name:/That first melody/})).toBeVisible();
 expect(requests.some(url=>/src\/App.jsx|src\/lib\/audio.js|three/.test(url))).toBe(false);
 await page.getByRole('group',{name:'Preview instrument'}).getByRole('button',{name:'Guitar'}).click();
 await expect(page.getByRole('button',{name:'Try guitar'})).toBeVisible();
 await page.getByText('Do I need an instrument?').click();await expect(page.locator('.welcome-faq')).toContainText('Microphone recognition of acoustic instruments is not supported');
 await page.getByRole('button',{name:'Switch to dark theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.screenshot({path:'test-results/screens/retention/welcome-dark.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Switch to light theme'}).click();await page.screenshot({path:'test-results/screens/retention/welcome-light.png',fullPage:true,animations:'disabled'});
});

for(const instrument of ['piano','guitar'])test(`quick ${instrument} starts with a real audible note and resumes without autoplay`,async({page})=>{
 await seed(page,{onboarded:false});await page.goto('/');
 if(instrument==='guitar')await page.getByRole('group',{name:'Preview instrument'}).getByRole('button',{name:'Guitar'}).click();
 await page.getByRole('button',{name:`Try ${instrument}`}).click();
 await expect(page.locator('.lesson-bar li')).toHaveCount(3);
 const play=page.getByRole('button',{name:instrument==='guitar'?'Play E2 on screen':'Play C4 on screen'});
 await expect(play).toBeVisible();await watchSound(page);await play.click();
 await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
 await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Play a phrase');
 expect(Object.keys((await data(page)).songs)).toEqual([]);
 await page.reload();await expect(page.getByRole('button',{name:'Play this step',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
 expect((await data(page)).settings.learning[instrument].firstNoteDone).toBe(true);
});

test('a completed quick phrase offers a next step while mastery remains untouched',async({page})=>{
 test.setTimeout(65_000);await seed(page,{practiceInstrument:'guitar',learningView:'lesson',learning:{guitar:{lessonId:'guitar-first-frets',step:'follow',quick:true,rate:1,firstNoteDone:true,completed:{}}}});await page.goto('/');
 await page.getByRole('button',{name:'Play this step',exact:true}).click();
 await page.evaluate(async()=>{
  const {emitSyntheticMidi}=await import('/src/lib/midiInput.js');let last=0;
  window.__notes=setInterval(()=>{if(performance.now()-last<300)return;const hint=document.querySelector('.wait-hint');if(!hint)return;
   const notes=[...hint.textContent.matchAll(/([A-G])([#b]?)(-?\d+)/g)].map(([,n,a,o])=>12*(+o+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[n])+(a==='#'?1:a==='b'?-1:0));if(!notes.length)return;last=performance.now();notes.forEach(midi=>{emitSyntheticMidi({type:'noteon',midi,velocity:.72});setTimeout(()=>emitSyntheticMidi({type:'noteoff',midi}),100);});
  },100);
 });
 await page.getByRole('button',{name:'Find my next step →'}).click({timeout:45_000});await page.evaluate(()=>clearInterval(window.__notes));
 await expect(page.locator('.learning-roadmap > header')).toContainText('1 guided · 0 / 7 checks passed');
 expect((await data(page)).settings.learning.guitar.quick).toBe(false);
});

test('previews make sound without recording input, and stop when leaving home',async({page})=>{
 await seed(page);await page.goto('/');await expect(page.locator('.next-lesson-card h3')).toHaveText('Home Five — Right Hand');await watchSound(page);
 await page.evaluate(async()=>{window.__inputs=[];(await import('/src/lib/midiInput.js')).midiInput.onMessage(e=>window.__inputs.push(e));window.__auditions=0;const {audio}=await import('/src/lib/audio.js');const play=audio.play.bind(audio);audio.play=(...args)=>{window.__auditions++;return play(...args);};});
 await page.getByRole('button',{name:'Hear a short preview'}).click();await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
 expect(Object.keys((await data(page)).songs)).toEqual([]);expect(await page.evaluate(()=>window.__inputs)).toEqual([]);
 await page.getByRole('button',{name:'Start my first lesson'}).click();await expect(page.locator('.lesson-guide')).toBeVisible();
 const played=await page.evaluate(()=>window.__auditions);await page.waitForTimeout(1200);expect(await page.evaluate(()=>window.__auditions)).toBe(played);
});

test('a slow preview cannot start after switching instruments',async({page})=>{
 await seed(page);await page.goto('/');
 await page.route('**/songs/twinkle-mini.mid',async route=>{await new Promise(r=>setTimeout(r,1200));await route.continue();});
 await page.evaluate(async()=>{window.__previewNotes=[];const {audio}=await import('/src/lib/audio.js');const play=audio.play.bind(audio);audio.play=(...args)=>{window.__previewNotes.push(args[0]);return play(...args);};});
 await page.getByRole('button',{name:'Preview Twinkle (two-octave version)',exact:true}).click();
 await page.getByRole('group',{name:'Learning instrument'}).getByRole('button',{name:'Guitar',exact:true}).click();
 await expect(page.locator('.next-lesson-card h3')).toHaveText('Meet the six strings');
 await page.waitForTimeout(1700);expect(await page.evaluate(()=>window.__previewNotes)).toEqual([]);
});

test('collections and favourites persist and open the selected instrument without autoplay',async({page})=>{
 await seed(page);await page.goto('/');await page.getByRole('button',{name:'Favorite Twinkle (two-octave version)',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Your favourites',exact:true}).click();
 await expect(page.locator('.discovery-card')).toHaveCount(1);await page.locator('.discovery-card').getByRole('button',{name:'Explore piece →'}).click();
 await expect(page.locator('.studio-heading h2')).toHaveText('Twinkle (two-octave version)');await expect(page.locator('.pad-play')).toContainText('Play');
});

test('weekly goal counts genuine days and survives reload without inventing activity',async({page})=>{
 await seed(page);await page.goto('/');await expect(page.locator('.weekly-practice h3')).toHaveText('0 of 3 practice days this week');
 await page.getByRole('combobox',{name:'Weekly practice days'}).selectOption('2');await page.reload();
 await expect(page.locator('.weekly-practice h3')).toHaveText('0 of 2 practice days this week');expect((await data(page)).days).toEqual({});
 await page.getByRole('button',{name:'One phrase',exact:true}).click();await expect(page.locator('.daily-learning-card li')).toHaveCount(1);
 await page.getByRole('button',{name:'Start today’s practice'}).click();await expect(page.locator('.lesson-guide')).toBeVisible();
 expect((await data(page)).settings.learning.piano.daily.ids).toHaveLength(1);
});

test('shared links resolve safely and exclude all saved history',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await seed(page);await page.goto('/');
 await page.getByRole('button',{name:'Copy lesson link'}).click();const url=await page.evaluate(()=>navigator.clipboard.readText());
 expect([...new URL(url).searchParams.keys()]).toEqual(['instrument','lesson']);
 await page.goto(url);await expect(page.getByRole('button',{name:'Open shared lesson'})).toBeVisible();await page.getByRole('button',{name:'Open shared lesson'}).click();
 await expect(page.locator('.studio-heading h2')).toHaveText('Home Five — Right Hand');await expect(page.locator('.pad-play')).toContainText('Play');
 await page.goto('/?instrument=piano&lesson=not-a-real-lesson');await page.getByRole('button',{name:'Open shared lesson'}).click();await expect(page.getByRole('alert')).toContainText('not in the library');
 await expect(page.locator('.learning-home')).toBeVisible();
});

test('download and restore preserve learning settings and require explicit replacement',async({page})=>{
 await seed(page,{weeklyPracticeGoal:5,favoritePieces:['twinkle-mini'],learning:{piano:{lessonId:'path-01-home-five-right',step:'practice',rate:.75,followed:true,completed:{}}}});await page.goto('/');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download progress backup'}).click();const download=await downloadPromise;const file=await download.path();
 await page.getByRole('combobox',{name:'Weekly practice days'}).selectOption('2');await page.getByRole('button',{name:'Restore a backup'}).click();await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
 await expect(page.getByRole('alertdialog',{name:'Confirm restore'})).toBeVisible();expect((await data(page)).settings.weeklyPracticeGoal).toBe(2);
 await page.getByRole('button',{name:'Replace',exact:true}).click();await expect(page.locator('.learning-home')).toBeVisible();await expect(page.getByRole('combobox',{name:'Weekly practice days'})).toHaveValue('5');
 expect((await data(page)).settings.learning.piano.rate).toBe(.75);
});

test('home keeps all actions reachable in both themes and at desktop zoom',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page);await page.goto('/');
 await expect(page.locator('.next-lesson-card h3')).toHaveText('Home Five — Right Hand');await page.screenshot({path:'test-results/screens/retention/home-light.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'Switch to dark theme'}).click();await page.screenshot({path:'test-results/screens/retention/home-dark.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:800,height:600});await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Download progress backup'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Download progress backup'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('a visitor can still enter the chosen instrument when browser storage is unavailable',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage blocked','SecurityError');};});
 await page.goto('/guitar/');await page.getByRole('button',{name:'Try guitar'}).click();
 await expect(page.getByRole('button',{name:'Play E2 on screen'})).toBeVisible();
 await expect(page.locator('.studio-heading h2')).toHaveText('Meet the six strings');
 await expect(page.locator('.saved-locally')).toHaveText('Changes not saved');
 await page.getByRole('button',{name:'Play E2 on screen'}).click();await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Play a phrase');
});
