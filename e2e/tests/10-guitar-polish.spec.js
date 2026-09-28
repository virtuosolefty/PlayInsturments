import { test, expect } from '@playwright/test';
import { watchSound } from '../helpers/sound.js';

const freePlay = p => p.getByRole('group',{name:'Workspace',exact:true}).getByRole('button',{name:'Free play',exact:true}).click();

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('piano-practice-coach:v1')) localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs:{},settings:{settingsVersion:5,onboarded:true,renderer:'gl',practiceInstrument:'guitar',countInBars:0}}));
  });
  await page.goto('/');
  await expect(page.locator('.guitar-stage canvas')).toBeVisible();
});

test('chord labels agree with the neck; individual previews sound and respect muted strings', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await freePlay(page);
  await page.evaluate(async () => { window.__guitarNotes=[]; (await import('/src/lib/midiInput.js')).midiInput.onMessage(m=>window.__guitarNotes.push(m)); });
  await page.getByRole('button',{name:'D',exact:true}).click();
  await page.getByRole('group',{name:'Chord labels'}).getByRole('button',{name:'Notes',exact:true}).click();
  await expect(page.locator('.guitar-position-label.finger')).toHaveText(['D','A','D','F#']);
  await expect(page.locator('.guitar-position-label.muted')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'String 6 muted',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'String 5 muted',exact:true})).toBeDisabled();
  await watchSound(page);
  await page.getByRole('button',{name:'Pick string 1: F#4',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.__guitarNotes.filter(m=>m.type==='noteon').map(m=>[m.midi,m.string,m.fret]))).toEqual([[66,5,2]]);
  await expect(page.locator('.guitar-stage')).toHaveAttribute('data-held-positions','1');
  await page.getByRole('group',{name:'Chord labels'}).getByRole('button',{name:'Intervals',exact:true}).click();
  await expect(page.locator('.guitar-position-label.finger')).toHaveText(['R','5','R','3']);
  await page.getByRole('checkbox',{name:'Left-handed'}).check();
  await expect(page.getByRole('group',{name:'Preview chord strings'}).getByRole('button').first()).toHaveAccessibleName('Pick string 1: F#4');
  await page.reload(); await freePlay(page);
  await expect(page.getByRole('group',{name:'Chord labels'}).getByRole('button',{name:'Intervals',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('checkbox',{name:'Left-handed'})).toBeChecked();
  expect(errors).toEqual([]);
});

test('open-string audition and chord labels work in the accessible fallback', async ({page}) => {
  await freePlay(page); await watchSound(page);
  await page.getByRole('button',{name:'Play open string 6: E2',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await page.getByRole('button',{name:'C',exact:true}).click();
  await page.getByRole('group',{name:'Chord labels'}).getByRole('button',{name:'Notes',exact:true}).click();
  await setRenderer(page, '2D Trainer');
  const root=page.getByRole('button',{name:'String 5, fret 3, C3',exact:true});
  await expect(root).toHaveText('C');
  await root.focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button',{name:'String 5, fret 4, C#3',exact:true})).toBeFocused();
});

test('desktop light, dark, first-position and focus layouts stay usable', async ({page}) => {
  await freePlay(page);
  for(const viewport of [{width:1280,height:720},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    const footer=await page.locator('.studio-footer').boundingBox();
    expect(footer.y+footer.height).toBeLessThanOrEqual(viewport.height);
    const hint=await page.locator('.chord-card .hint').boundingBox();
    expect(hint.y+hint.height).toBeLessThan(viewport.height);
    await page.screenshot({path:`review/guitar-upgrade/light-${viewport.height}.png`});
  }
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
  await page.getByRole('combobox',{name:'Visible guitar frets'}).selectOption('5');
  await expect(page.locator('.guitar-position-label.fret')).toHaveCount(5);
  await page.getByRole('button',{name:'C',exact:true}).click();
  await page.getByRole('group',{name:'Chord labels'}).getByRole('button',{name:'Notes',exact:true}).click();
  await page.screenshot({path:'review/guitar-upgrade/dark-first-position.png'});
  await page.getByRole('button',{name:'Focus',exact:true}).click();
  await expect(page.locator('.guitar-workspace > .chord-card')).toBeVisible();
  await page.screenshot({path:'review/guitar-upgrade/focus.png'});
  await expect(page.getByRole('button',{name:'↓ Strum C',exact:true})).toBeInViewport();
});

async function setRenderer(page, name) {
 await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
 await page.getByRole('button',{name,exact:true}).click();
 await page.keyboard.press('Escape');
}
