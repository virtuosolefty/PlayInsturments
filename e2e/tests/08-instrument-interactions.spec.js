import { test, expect } from '@playwright/test';
import { watchSound } from '../helpers/sound.js';
const workspace=(p,name)=>p.getByRole('group',{name:'Workspace',exact:true}).getByRole('button',{name,exact:true});
const guitar=p=>p.getByRole('group',{name:'Practice instrument'}).getByRole('button',{name:'Guitar',exact:true}).click();
const events=p=>p.evaluate(()=>window.__notes);
const onCount=p=>expect.poll(async()=>(await events(p)).filter(m=>m.type==='noteon').length);
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs:{},settings:{onboarded:true,countInBars:0,settingsVersion:5,renderer:'canvas'}})));
  await page.goto('/');await expect(page.locator('.piece-title')).toContainText('C Major');
  await page.evaluate(async()=>{window.__notes=[];(await import('/src/lib/midiInput.js')).midiInput.onMessage(m=>window.__notes.push(m));});
});
test('the first quick piano tap both unlocks audio and makes sound',async({page})=>{
  await workspace(page,'Free play').click();
  await watchSound(page);
  const keys=page.getByRole('grid'),b=await keys.boundingBox();
  await page.mouse.click(b.x+b.width*.5,b.y+b.height-28);
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await expect(page.locator('.audio-slot')).toContainText('Sound ready');
  await expect(page.locator('.audio-slot')).toHaveAttribute('title',/Web Audio synth|Grand Piano|sample/i);
});
test('pointer notes last until release, glide, and cancel in 2D and 3D',async({page})=>{
  await workspace(page,'Free play').click();
  for(const renderer of ['2D Trainer','3D Stage']){
    await setRenderer(page, renderer);
    const keys=page.getByRole('grid');await expect(keys).toBeVisible();
    await page.waitForTimeout(400);
    await page.evaluate(()=>window.__notes=[]);
    const b=await keys.boundingBox();const y=b.y+b.height-28;
    await page.mouse.move(b.x+b.width*.46,y);await page.mouse.down();
    await onCount(page).toBe(1);await page.waitForTimeout(450);
    expect((await events(page)).filter(m=>m.type==='noteoff')).toHaveLength(0);
    await page.mouse.move(b.x+b.width*.58,y);await onCount(page).toBe(2);
    await page.mouse.up();
    await expect.poll(async()=>(await events(page)).filter(m=>m.type==='noteoff').length).toBe(2);
    await page.mouse.down();await onCount(page).toBe(3);
    await keys.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
    await expect.poll(async()=>(await events(page)).filter(m=>m.type==='noteoff').length).toBe(3);
  }
});
test('piano navigation is one tab stop, supports sustain and releases on blur',async({page})=>{
  await workspace(page,'Free play').click();
  const keys=page.getByRole('grid');await keys.focus();await page.keyboard.press('Home');
  const before=await keys.getAttribute('aria-activedescendant');await page.keyboard.press('ArrowRight');
  expect(await keys.getAttribute('aria-activedescendant')).not.toBe(before);
  await page.keyboard.down('Space');await onCount(page).toBe(1);await page.keyboard.up('Space');
  await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
  await page.getByRole('button',{name:'Sustain off',exact:true}).click();await expect(page.getByRole('button',{name:'Sustain on',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await page.locator('#practice-stage').focus();await page.keyboard.down('a');await onCount(page).toBe(2);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('a');
  await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sustain off',exact:true})).toHaveAttribute('aria-pressed','false');
  expect((await events(page)).filter(m=>m.type==='noteoff')).toHaveLength(2);
});
test('guitar picks identify one position, MIDI shows alternatives, and fret navigation roves',async({page})=>{
  await guitar(page);await workspace(page,'Free play').click();
  await page.getByRole('button',{name:'String 2, open, B3',exact:true}).click();
  await expect(page.locator('.guitar-string .held')).toHaveCount(1);
  await expect(page.locator('.guitar-string .possible')).toHaveCount(0);
  const button=page.getByRole('button',{name:'String 3, fret 4, B3',exact:true});await button.focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button',{name:'String 3, fret 5, C4',exact:true})).toBeFocused();
  await expect(page.locator('.guitar-fretboard button[tabindex="0"]')).toHaveCount(1);
  await page.waitForTimeout(1100);
  await page.evaluate(async()=>{(await import('/src/lib/midiInput.js')).emitSyntheticMidi({type:'noteon',midi:59,velocity:.7});});
  await expect(page.locator('.guitar-string .held')).toHaveCount(0);
  await expect.poll(()=>page.locator('.guitar-string .possible').count()).toBeGreaterThan(1);
});
test('3D picking uses the visible string and fret, including the left-handed view',async({page})=>{
  await guitar(page);await workspace(page,'Free play').click();await setRenderer(page, '3D Stage');
  for(const left of [false,true]){
    await page.getByRole('checkbox',{name:'Left-handed'}).setChecked(left);await page.waitForTimeout(500);
    const f=await page.locator('.guitar-position-label.fret').getByText('4',{exact:true}).boundingBox();
    const s=await page.locator('.guitar-position-label.string').getByText('G3',{exact:true}).boundingBox();
    await page.evaluate(()=>window.__notes=[]);await page.mouse.click(f.x+f.width/2,s.y+s.height/2);
    await expect.poll(async()=>(await events(page)).find(m=>m.type==='noteon')?.midi).toBe(59);
    await expect(page.locator('.guitar-stage')).toHaveAttribute('data-held-positions','1');
    await expect(page.locator('.guitar-stage')).toHaveAttribute('data-possible-positions','0');
    await page.waitForTimeout(1100);
  }
});
test('up and down strums use opposite string order and selected strength',async({page})=>{
  await guitar(page);await workspace(page,'Free play').click();
  // Strength and spread fold away under Feel, which says what they are set to.
  await page.locator('.chord-feel > summary').click();
  await page.getByRole('slider',{name:'Strum strength',exact:true}).fill('0.5');
  await expect(page.locator('.chord-feel > summary')).toContainText('50%');
  await page.getByRole('button',{name:'↓ Strum Em',exact:true}).click();await onCount(page).toBe(6);
  const down=(await events(page)).filter(m=>m.type==='noteon');expect(down.map(m=>m.string)).toEqual([0,1,2,3,4,5]);expect(down.every(m=>m.velocity===.5)).toBe(true);
  await page.evaluate(()=>window.__notes=[]);await page.getByRole('button',{name:'↑ Up strum',exact:true}).click();await onCount(page).toBe(6);
  expect((await events(page)).filter(m=>m.type==='noteon').map(m=>m.string)).toEqual([5,4,3,2,1,0]);
});
test('instruments fit desktop heights and resizing preserves the playing area',async({page})=>{
  for(const viewport of [{width:1280,height:720},{width:1366,height:768},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await setRenderer(page, '3D Stage');
    const footer=await page.locator('.studio-footer').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(viewport.height);
    if(await page.getByRole('group',{name:'Practice instrument'}).getByRole('button',{name:'Piano',exact:true}).getAttribute('aria-pressed') === 'true'){
      await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
      const size=page.getByRole('slider',{name:'Keyboard height'});await size.focus();await page.keyboard.press('ArrowUp');await expect(size).toHaveValue('105'); await page.keyboard.press('Escape');
    }
    await guitar(page);await expect(page.locator('.guitar-stage canvas')).toBeVisible();
    const neck=await page.locator('.guitar-stage').boundingBox();expect(neck.height).toBeGreaterThanOrEqual(175);expect(neck.y+neck.height).toBeLessThan(viewport.height-28);
  }
});

async function setRenderer(page, name) {
 await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).click();
 await page.keyboard.press('Escape');
}
