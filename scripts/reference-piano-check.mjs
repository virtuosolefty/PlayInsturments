import { chromium, expect } from '@playwright/test';
import { watchSound } from '../e2e/helpers/sound.js';
import { mkdirSync } from 'node:fs';

const browser=await chromium.launch();
try {
  mkdirSync('review/reference-piano',{recursive:true});
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs:{},settings:{onboarded:true,settingsVersion:4,theme:'dark',renderer:'gl',pianoRange:'full',countInBars:0,pianoLabels:'octaves',pianoHeight:104,mode:'listen'}})));
  await page.goto(process.argv[2]??'http://127.0.0.1:5187/');
  await expect(page.locator('.roll-gl canvas')).toHaveCount(2);
  await expect(page.getByRole('gridcell')).toHaveCount(88);
  await page.getByRole('button',{name:'Focus',exact:true}).click();
  const grid=page.getByRole('grid');
  await expect.poll(async()=>{const b=await grid.boundingBox();return b.y+b.height;}).toBeGreaterThan(850);
  await watchSound(page);
  await page.getByRole('button',{name:/^Play/}).first().click();
  await expect.poll(()=>page.evaluate(()=>window.__studioHeardSound)).toBe(true);
  await page.waitForTimeout(2750);
  await page.screenshot({path:'review/reference-piano/three-playing.png'});
  await page.getByRole('button',{name:/^Pause/}).first().click();
  await page.waitForTimeout(180);
  await page.screenshot({path:'review/reference-piano/three-paused.png'});
  await page.getByRole('button',{name:'Exit focus',exact:true}).click();
  await page.getByRole('button',{name:'2D Trainer',exact:true}).click();
  await page.getByRole('button',{name:/^Play/}).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({path:'review/reference-piano/two-playing.png'});
  await page.getByRole('button',{name:/^Pause/}).first().click();
  await page.getByRole('button',{name:'Switch to light theme'}).click();
  await page.screenshot({path:'review/reference-piano/light.png'});
  expect(errors).toEqual([]);
  console.log(JSON.stringify({keys:88,sound:true,pageErrors:errors,focus:await grid.boundingBox()}));
}finally{await browser.close();}
