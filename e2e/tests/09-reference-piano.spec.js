import { test, expect } from '@playwright/test';

test('the compact Three.js keyboard picks raised black and white keys across its full width',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs:{},settings:{onboarded:true,settingsVersion:4,renderer:'gl',pianoRange:'full',pianoHeight:104}})));
  await page.goto('/');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  await page.getByRole('group',{name:'Workspace',exact:true}).getByRole('button',{name:'Free play',exact:true}).click();
  await page.getByRole('button',{name:'Focus',exact:true}).click();
  await expect(page.getByRole('gridcell')).toHaveCount(88);
  const grid=page.getByRole('grid');
  await expect.poll(async()=>{const b=await grid.boundingBox();return b.y+b.height;}).toBeGreaterThan(page.viewportSize().height-30);
  const picks=await grid.evaluate(async el=>{
    const [{buildKeyboardGeometry},{PIANO_CAMERA,stagedCamera,projectOnto,acrossAt},{midiInput}]=await Promise.all([import('/src/lib/keyboard.js'),import('/src/lib/rollCamera.js'),import('/src/lib/midiInput.js')]);
    window.__pianoPicks=[];midiInput.onMessage(m=>window.__pianoPicks.push(m));
    const rect=el.getBoundingClientRect(),w=el.clientWidth,h=el.clientHeight;
    const geometry=buildKeyboardGeometry(21,108,w);
    const shot=stagedCamera(w,h,w/h,PIANO_CAMERA);
    return [22,60,61,106].map(midi=>{
      const key=geometry.keys.get(midi),p=projectOnto(shot,h-104+(key.black?35:85),key.black?30:18);
      return {midi,x:rect.x+w/2+(key.center-w/2)/acrossAt(shot,p.depth)*w/2,y:rect.y+(1-p.y)*h/2};
    });
  });
  for(const pick of picks){
    await page.mouse.move(pick.x,pick.y);await page.mouse.down();
    await expect.poll(()=>page.evaluate(()=>window.__pianoPicks.filter(m=>m.type==='noteon').at(-1)?.midi)).toBe(pick.midi);
    await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>window.__pianoPicks.filter(m=>m.type==='noteoff').at(-1)?.midi)).toBe(pick.midi);
  }
});
