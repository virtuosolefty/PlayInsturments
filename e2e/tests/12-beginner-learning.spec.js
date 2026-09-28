import { test, expect } from '@playwright/test';
import { watchSound } from '../helpers/sound.js';

const base = {settingsVersion:5,onboarded:true,renderer:'canvas',countInBars:0,errorCues:false};
const record = (lessonId,step='follow') => ({lessonId,step,rate:.65,soundConfirmed:true,firstNoteDone:true,listened:true,followed:false,practised:false,completed:{}});
async function seed(page, settings={}, songs={}) {
  await page.addInitScript(({settings,songs})=>{
    if(!localStorage.getItem('piano-practice-coach:v1'))localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs,settings}));
  },{settings:{...base,...settings},songs});
}
async function autoFollow(page) {
  await page.evaluate(async()=>{
    const {emitSyntheticMidi}=await import('/src/lib/midiInput.js');
    let lastAt=0;
    window.__followTimer=setInterval(()=>{
      if(performance.now()-lastAt<300)return;
      const hint=document.querySelector('.wait-hint');if(!hint)return;
      const notes=[...hint.textContent.matchAll(/([A-G])([#b]?)(-?\d+)/g)].map(([,n,a,o])=>12*(+o+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[n])+(a==='#'?1:a==='b'?-1:0));
      if(!notes.length)return;lastAt=performance.now();
      notes.forEach(midi=>{emitSyntheticMidi({type:'noteon',midi,velocity:.72});setTimeout(()=>emitSyntheticMidi({type:'noteoff',midi}),140);});
    },100);
  });
}
test('a new learner confirms sound, plays the first note, and resumes without autoplay',async({page})=>{
  await seed(page,{onboarded:false});await page.goto('/');
  await page.getByRole('button',{name:'Guide me from the beginning →'}).click();
  await expect(page.getByRole('heading',{name:'A clear path to your first song.'})).toBeVisible();
  await page.getByRole('button',{name:'Start my first lesson'}).click();
  await expect(page.locator('.studio-heading h2')).toHaveText('Home Five — Right Hand');
  await watchSound(page);await page.getByRole('button',{name:'Play a test note',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await expect(page.getByRole('button',{name:'I heard it'})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
  await page.getByRole('button',{name:'I heard it'}).click();
  await page.locator('body').click({position:{x:400,y:500}});await page.keyboard.press('s');
  await expect(page.locator('.lesson-note-feedback')).toContainText('different note');
  await expect(page.getByRole('button',{name:'Play C4 on screen'})).toBeVisible();
  await page.getByRole('button',{name:'Play C4 on screen'}).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Listen');
  await page.reload();
  await expect(page.getByRole('button',{name:'Listen to the phrase',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Listen');
});

test('a full guided piano phrase saves learning without passing mastery and retains practice tempo',async({page})=>{
  test.setTimeout(90_000);
  await seed(page,{learningView:'lesson',learning:{piano:record('path-01-home-five-right')}});
  await page.goto('/');await expect(page.getByRole('button',{name:'Play this step',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Play this step',exact:true}).click();await autoFollow(page);
  await expect(page.locator('.lesson-result h3')).toHaveText('Guided practice completed',{timeout:65_000});
  await page.evaluate(()=>clearInterval(window.__followTimer));
  await expect(page.locator('.lesson-result')).toContainText('timing was not assessed');
  await page.getByRole('button',{name:'Next: add a rhythm →'}).click();
  const speed=page.getByRole('slider',{name:'Lesson practice speed'});await speed.fill('0.75');
  await page.reload();await expect(speed).toHaveValue('0.75');
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Practice');
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
  await page.getByRole('button',{name:'Save & leave'}).click();
  await expect(page.locator('.learning-roadmap > header')).toContainText('1 guided · 0 / 15 checks passed');
  await expect(page.locator('.learning-stage-lessons button').filter({hasText:'Home Five — Left Hand'})).toBeDisabled();
});

test('guitar first notes and an instrument switch keep separate saved lessons',async({page})=>{
  await seed(page,{learningView:'home',learning:{piano:record('path-01-home-five-right','practice')}});await page.goto('/');
  await page.getByRole('group',{name:'Learning instrument'}).getByRole('button',{name:'Guitar',exact:true}).click();
  await expect(page.locator('.next-lesson-card h3')).toHaveText('Meet the six strings');
  await expect(page.locator('.daily-learning-card')).not.toContainText('Home Five');
  await page.getByRole('button',{name:'Start my first lesson'}).click();
  await page.getByRole('button',{name:'Play a test note',exact:true}).click();await page.getByRole('button',{name:'I heard it'}).click();
  await expect(page.locator('.first-note-target')).toContainText('string 6 · open');
  await page.getByRole('button',{name:'String 6, open, E2',exact:true}).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Listen');
  await page.getByRole('button',{name:'Save & leave'}).click();
  await page.getByRole('group',{name:'Learning instrument'}).getByRole('button',{name:'Piano',exact:true}).click();
  await page.getByRole('button',{name:'Continue learning'}).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Practice');
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
});

test('a guitar chord mastery check uses the shared scoring and offers the correct next lesson',async({page})=>{
  test.setTimeout(45_000);
  const songs=Object.fromEntries(['guitar-open-strings','guitar-first-frets','guitar-c-major'].map(id=>[id,{troubleMap:{},totalRuns:1,sessions:[{mode:'practice',rate:1,stars:4,overall:90,variant:'guitar:standard:12',at:new Date().toISOString()}]}]));
  await seed(page,{practiceInstrument:'guitar',learningView:'lesson',learning:{guitar:{...record('guitar-first-em','check'),followed:true,practised:true}}},songs);
  await page.goto('/');await expect(page.getByRole('button',{name:'Start mastery check',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Enable sound',exact:true}).click();
  await page.evaluate(async()=>{
    const {emitSyntheticMidi}=await import('/src/lib/midiInput.js');
    const {GUITAR_STUDIES}=await import('/src/lib/guitar.js');const score=GUITAR_STUDIES.find(s=>s.id==='guitar-first-em');
    document.querySelector('.lesson-transport .primary').addEventListener('click',()=>{
      score.notes.forEach(note=>{setTimeout(()=>emitSyntheticMidi({type:'noteon',midi:note.midi,velocity:note.velocity}),note.time*1000+50);setTimeout(()=>emitSyntheticMidi({type:'noteoff',midi:note.midi}),note.time*1000+300);});
    },{once:true});
  });
  await page.getByRole('button',{name:'Start mastery check',exact:true}).click();
  await expect(page.locator('.lesson-result h3')).toHaveText('Lesson mastered',{timeout:25_000});
  await page.getByRole('button',{name:'Continue to the next lesson →'}).click();
  await expect(page.locator('.studio-heading h2')).toHaveText('Your next chord · Am');
  await expect(page.getByRole('button',{name:'Listen to the phrase',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
});

test('failed lesson loading has a retry and cannot start the previous score',async({page})=>{
  await seed(page,{learningView:'home'});
  await page.route('**/songs/path-01-home-five-right.mid',route=>route.fulfill({status:503,body:'Temporarily unavailable'}));
  await page.goto('/');await page.getByRole('button',{name:'Start my first lesson'}).click();
  await expect(page.locator('.lesson-load-state')).toContainText('could not load');
  await expect(page.locator('.lesson-transport button').first()).toBeDisabled();
  await page.locator('body').click({position:{x:400,y:500}});await page.keyboard.press('Space');
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
  await page.unroute('**/songs/path-01-home-five-right.mid');
  await page.getByRole('button',{name:'Retry lesson'}).click();
  await expect(page.getByRole('button',{name:'Play a test note',exact:true})).toBeEnabled();
  await expect(page.locator('.studio-heading h2')).toHaveText('Home Five — Right Hand');
});

test('daily guided completion advances the saved queue and closes with a clear next lesson',async({page})=>{
  test.setTimeout(70_000);
  const day=new Date().toLocaleDateString('en-CA');
  await seed(page,{practiceInstrument:'guitar',learningView:'lesson',learning:{guitar:{...record('guitar-first-frets'),daily:{ids:['guitar-first-frets'],index:0,day,complete:false}}}});
  await page.goto('/');await page.getByRole('button',{name:'Play this step',exact:true}).click();await autoFollow(page);
  await expect(page.locator('.lesson-result h3')).toHaveText('Guided practice completed',{timeout:40_000});
  await page.evaluate(()=>clearInterval(window.__followTimer));
  await page.getByRole('button',{name:'Continue today’s practice →'}).click();
  await expect(page.locator('.daily-finished')).toContainText('Today’s practice is complete.');
  await expect(page.locator('.learning-roadmap > header')).toContainText('0 / 7 checks passed');
  await page.reload();await expect(page.locator('.daily-finished')).toBeVisible();
});

test('short desktop layouts, themes and reduced motion preserve usable 3D instruments',async({page})=>{
  test.setTimeout(60_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page,{renderer:'gl',learningView:'home'});await page.goto('/');
  await page.screenshot({path:'review/learning/home-light.png'});
  await page.getByRole('button',{name:'Switch to dark theme'}).click();await page.screenshot({path:'review/learning/home-dark.png'});
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Start my first lesson'}).click();
  await expect(page.locator('.roll-gl canvas').first()).toBeVisible();
  for(const selector of ['.pane.right','.lesson-transport','.roll-area']) {
    const box=await page.locator(selector).boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(1280);expect(box.y+box.height).toBeLessThanOrEqual(720);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.lesson-transport button').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.screenshot({path:'review/learning/piano-3d-dark-720.png'});
  await page.getByRole('group',{name:'Practice instrument'}).getByRole('button',{name:'Guitar',exact:true}).click();
  await page.getByRole('button',{name:'Start my first lesson'}).click();
  await expect(page.locator('.guitar-stage canvas')).toBeVisible();
  const guitar=await page.locator('.guitar-stage').boundingBox();expect(guitar.y+guitar.height).toBeLessThanOrEqual(720);
  await page.screenshot({path:'review/learning/guitar-3d-dark-720.png'});expect(errors).toEqual([]);
});

test('listening completes only at the end, pauses safely, and does not create a grade',async({page})=>{
  await seed(page,{practiceInstrument:'guitar',learningView:'lesson',learning:{guitar:{...record('guitar-first-frets','listen'),listened:false}}});
  await page.goto('/');await page.getByRole('button',{name:'Listen to the phrase',exact:true}).click();
  await page.getByRole('button',{name:'Pause lesson',exact:true}).click();
  await expect(page.getByRole('button',{name:'Now find the notes →'})).toHaveCount(0);
  await page.getByRole('button',{name:'Listen to the phrase',exact:true}).click();
  await expect(page.getByRole('button',{name:'Now find the notes →'})).toBeVisible({timeout:15_000});
  expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
  await page.getByRole('button',{name:'Now find the notes →'}).click();
  await expect(page.locator('.lesson-bar [aria-current="step"]')).toContainText('Follow along');
  await expect(page.getByRole('button',{name:'Pause lesson'})).toHaveCount(0);
});

test('the guide stays reachable in a narrow desktop preview pane',async({page})=>{
  await page.setViewportSize({width:860,height:900});
  await seed(page,{learningView:'home'});await page.goto('/');
  await page.getByRole('button',{name:'Start my first lesson'}).click();
  await expect(page.getByRole('button',{name:'Play a test note',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close lesson guide'}).click();
  await expect(page.getByRole('button',{name:'Play a test note',exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'Open lesson guide'}).click();
  await expect(page.getByRole('button',{name:'Play a test note',exact:true})).toBeVisible();
  const box=await page.locator('.pane.center').boundingBox();expect(box.width).toBeGreaterThan(750);
});
