import { test, expect } from '@playwright/test';
import { seedSettings } from '../helpers/studio.js';
import { watchSound } from '../helpers/sound.js';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { renderer: 'canvas' });
  await page.addInitScript(() => {
    window.__testInput = {id:'test-input',name:'Test MIDI keyboard',state:'connected',onmidimessage:null};
    window.__sentOutput = [];
    const output = {id:'test-output',name:'Test synth',state:'connected',send: (message,time) => window.__sentOutput.push({message,time})};
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>({inputs:new Map([['test-input',window.__testInput]]),outputs:new Map([['test-output',output]]),onstatechange:null})});
  });
  await page.goto('/');
  await expect(page.locator('.studio-heading h2')).toContainText('C Major');
});

test('output test makes sound without falsely verifying controller input or grading', async ({ page }) => {
  await page.getByRole('group',{name:'Sound and input'}).getByRole('button',{name:/Input & sound|Controller connected/}).click();
  const dialog=page.getByRole('dialog',{name:'Your instrument, ready to play.'});
  await dialog.getByRole('button',{name:/^MIDI controller/}).click();
  await dialog.getByRole('button',{name:/Look for a device|Refresh devices/}).click();
  await expect(dialog.getByRole('combobox',{name:'MIDI input'})).toHaveValue('test-input');
  await page.evaluate(async()=>{window.__testNotes=[];(await import('/src/lib/midiInput.js')).midiInput.onMessage(m=>window.__testNotes.push(m));});
  await watchSound(page);
  await dialog.getByRole('button',{name:'Play a test note',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await expect(dialog.locator('.setup-detected')).toContainText('Input not verified');
  expect(await page.evaluate(()=>window.__testNotes)).toEqual([]);
  await page.evaluate(async()=>{(await import('/src/lib/midiInput.js')).emitSyntheticMidi({type:'noteon',midi:64,velocity:.7});});
  await expect(dialog.locator('.setup-detected')).toContainText('Input not verified');
  await page.evaluate(()=>window.__testInput.onmidimessage({data:[144,62,100],timeStamp:performance.now()}));
  await expect(dialog.locator('.setup-detected')).toContainText('Received D4 from your MIDI controller');
  await page.evaluate(()=>window.__testInput.onmidimessage({data:[128,62,0],timeStamp:performance.now()}));
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('piano-practice-coach:v1')).songs))).toEqual([]);
});

test('test tone respects an external output and never falls back to browser notes', async ({ page }) => {
  await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('piano-practice-coach:v1'));d.settings.instrumentSource='external';d.settings.inputMethod='midi';localStorage.setItem('piano-practice-coach:v1',JSON.stringify(d));});
  await page.reload();
  await page.getByRole('group',{name:'Sound and input'}).getByRole('button',{name:/Input & sound|Controller connected/}).click();
  const dialog=page.getByRole('dialog',{name:'Your instrument, ready to play.'});
  await dialog.getByRole('button',{name:/Look for a device|Refresh devices/}).click();
  await page.evaluate(()=>window.__sentOutput=[]);
  await dialog.getByRole('button',{name:'Play a test note',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__sentOutput.filter(e=>(e.message[0]&240)===144).length)).toBe(1);
  expect(await page.evaluate(()=>window.__sentOutput.filter(e=>(e.message[0]&240)===128).length)).toBe(1);
  await expect(dialog.locator('.setup-detected')).toContainText('Input not verified');
});

test('loop handles edit shared loop, support keyboard and drag, and can be cleared', async ({ page }) => {
  await page.getByRole('button',{name:'Loop',exact:true}).click();
  await expect(page.locator('.passage-summary')).toContainText('Loop: bars 1–4');
  const start=page.getByRole('slider',{name:'Loop start',exact:true});
  const end=page.getByRole('slider',{name:'Loop end',exact:true});
  await start.focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.passage-summary')).toContainText('Loop: bars 2–4');
  await end.focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.passage-summary')).toContainText('Loop: bars 2–5');
  const b=await end.boundingBox(), timeline=await page.locator('.minimap canvas').boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await page.mouse.move(timeline.x+timeline.width*.75,b.y+b.height/2);await page.mouse.up();
  await expect(page.locator('.passage-summary')).toContainText('Loop: bars 2–6');
  await page.getByRole('button',{name:'Restart passage',exact:true}).click();
  await expect(page.getByRole('slider',{name:'Position in piece',exact:true})).toHaveAttribute('aria-valuenow','3');
  await page.getByRole('button',{name:'Clear loop',exact:true}).click();
  await expect(start).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Loop',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('search, plan, progress, named settings and help remain discoverable', async ({ page }) => {
  await page.getByRole('button',{name:'Library',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Search pieces and composers'});
  const bounds=await search.boundingBox();expect(bounds.y).toBeLessThan(280);
  await search.fill('Ode to Joy');
  await expect(page.locator('.song-row:visible .song .name')).toHaveText([/Ode to Joy/, /Ode to Joy/]);
  await page.getByRole('button',{name:'Clear search and filters'}).click();
  await page.locator('.plan-preview').click();
  await expect(page.getByRole('tab',{name:'Today’s plan'})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Close library'}).click();
  await page.getByRole('button',{name:'Progress',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Progress',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button',{name:'Close library'}).click();
  await page.getByRole('button',{name:'Instrument settings',exact:true}).click();
  await page.getByRole('combobox',{name:'Keyboard labels'}).selectOption('notes');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Instrument settings',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search shortcuts'}).fill('loop');
  await expect(page.locator('.shortcut-list > div')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'More',exact:true})).toBeFocused();
});
