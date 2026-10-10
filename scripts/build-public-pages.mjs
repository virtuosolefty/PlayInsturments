import fs from 'node:fs';
import path from 'node:path';
import { publicLibrary } from './public-library.mjs';

// Static, readable entry pages also work without JavaScript. Set PUBLIC_SITE_URL
// at release time to add the real canonical origin and a sitemap.
const appShell=fs.readFileSync('dist/index.html','utf8');
const basePath=process.env.GITHUB_PAGES==='true'?'/PlayInsturments/':'/';
const origin=process.env.PUBLIC_SITE_URL ? new URL(process.env.PUBLIC_SITE_URL).origin : null;
const href=route=>`${basePath}${route}`;
const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const pages=[
  ['','Practice Deck — play piano, guitar, strings and drums at your pace','Play your first melody, one note at a time. Explore piano, guitar, bass, violin, cello and drums on screen, follow short lessons, and save your progress.','Your first melody starts here.'],
  ['welcome/','Meet Practice Deck — your music, your pace','A calm practice studio for piano, guitar, bass, violin, cello and drums. Start on screen with no account, and build confidence one phrase at a time.','A little music. A little every day.'],
  ['piano/','Learn your first piano notes — Practice Deck','Explore a virtual piano with three-dimensional keys, falling notes, guided lessons, and optional MIDI input.','Find your first piano notes.'],
  ['guitar/','Explore guitar strings and chords — Practice Deck','Learn guitar note positions, Em and Am chord shapes, and original short melodies with an interactive on-screen fretboard. Switch to bass for low notes, roots and a first bass line.','Six strings. So many possibilities.'],
  ['violin/','Learn your first violin notes — Practice Deck','Bow the open strings, find first-position fingers with tapes, play your first scales and Twinkle, Twinkle on an interactive on-screen violin.','Four strings. A bow. Your first tune.'],
  ['cello/','Learn your first cello notes — Practice Deck','Bow the open strings, find first-position fingers, and play C major, D major and Twinkle, Twinkle on an interactive on-screen cello.','Low, warm strings. Your first scale.'],
  ['drums/','Play your first drum beat — Practice Deck','Meet a nine-piece kit in three dimensions, keep a steady pulse, and build your first beat and fill with on-screen pads, computer keys or a MIDI controller.','Kick, snare, hi-hat. Your first beat starts here.'],
  ['learn/first-melody/','Play your first melody — Practice Deck','Make a sound, follow a short phrase at your pace, then give it a rhythm. A guided introduction to piano and guitar.','From your first note to a phrase.'],
];
for(const [route,title,description,heading] of pages){
  let html=appShell.replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/,`$1${escape(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/,`$1${escape(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/,`$1${escape(description)}`);
  const image=`${origin??''}${href(`media/${fs.existsSync(`public/media/${route.slice(0,-1)}-studio.png`)?route.slice(0,-1):'piano'}-studio.png`)}`;
  html=html.replace('</head>',`<meta property="og:image" content="${escape(image)}" />\n${origin?`<link rel="canonical" href="${escape(origin+href(route))}" /><meta property="og:url" content="${escape(origin+href(route))}" />`:''}</head>`);
  html=html.replace('<div id="root"></div>',`<div id="public-intro" class="welcome-page"><main style="max-width:960px;margin:80px auto;padding:24px"><a href="${href('')}">Practice Deck</a><h1>${escape(heading)}</h1><p>${escape(description)}</p><h2>Start with a small musical win</h2><ol><li>Find a key or string on the screen.</li><li>Follow a phrase. The notes wait for you.</li><li>Build a rhythm and return to your saved place.</li></ol><p>Use the on-screen instrument, computer keys for piano and drums, a MIDI controller, or your own instrument through the microphone, one note at a time. There is a tuner too. Your progress is stored in this browser; you can download a backup.</p><nav><a href="${href('piano/')}">Piano</a> · <a href="${href('guitar/')}">Guitar</a> · <a href="${href('violin/')}">Violin</a> · <a href="${href('cello/')}">Cello</a> · <a href="${href('drums/')}">Drums</a> · <a href="${href('learn/first-melody/')}">First melody</a> · <a href="${href('about-data/')}">Your data & compatibility</a></nav><noscript><p>Enable JavaScript to use the interactive instruments. The guide above is available without it.</p></noscript></main></div><div id="root"></div>`);
  const target=path.join('dist',route,'index.html');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html);
}
if(origin){
  fs.writeFileSync('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages.map(p=>p[0]),'about-data/'].map(route=>`<url><loc>${escape(origin+href(route))}</loc></url>`).join('')}</urlset>`);
  fs.writeFileSync('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}${href('sitemap.xml')}\n`);
}
// A build that is going on the web leaves out the songs kept for local use (public-library.mjs).
const songsFile='dist/songs/songs.json';
if((process.env.GITHUB_PAGES==='true'||origin)&&fs.existsSync(songsFile)){
  const {kept,removed,files}=publicLibrary(JSON.parse(fs.readFileSync(songsFile,'utf8')));
  fs.writeFileSync(songsFile,`${JSON.stringify(kept,null,2)}\n`);
  for(const file of files)fs.rmSync(path.join('dist/songs',file),{force:true});
  console.log(`Left ${removed.length} local-only songs (${files.length} files) out of the public build.`);
}
console.log(`Built ${pages.length} public pages${origin?' with canonical links and sitemap':'; canonical origin awaits PUBLIC_SITE_URL'}.`);
