import { useEffect, useRef, useState } from 'react';
import { ACESFilmicToneMapping, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, RingGeometry, Scene, ShadowMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GUITAR_COLORS, GUITAR_TUNING, guitarMidi } from '../lib/guitar.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { noteName } from '../lib/theory.js';
import { chordFullName, chordPositionLabel, chordTone } from '../lib/guitarPresentation.js';
import { STRING_POSTS, buildGuitarFrame } from '../lib/guitarBody.js';

const NECK_Z = 0.72; // the neck is drawn narrower than life; see instrument.scale.z

// Generated locally: no model downloads or textures on the audio path.
function woodTexture(base, grain) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 128);
  for (let row = 0; row < 180; row++) {
    ctx.strokeStyle = grain; ctx.globalAlpha = 0.012 + (row % 7) * 0.003; ctx.lineWidth = 0.5 + (row % 3) * 0.5;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) { const y = row * 0.74 + Math.sin(x / (90 + row % 20) + row) * 1.4; if (x === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

export default function GuitarStage({ engine, score, onPluck, onContextLost, leftHanded, theme = 'light', chord = null, activePositions, maxFret = 12, labelSize = 14, labelMode = 'fingers', focusPosition = null }) {
  const host = useRef(null);
  const latest = useRef(null);
  const [hover, setHover] = useState('');
  const [labels, setLabels] = useState([]);
  latest.current = { engine, score, onPluck, onContextLost, leftHanded, chord, activePositions, focusPosition, labelMode };
  useEffect(() => {
    const el = host.current; let renderer;
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); }
    catch (error) { latest.current.onContextLost(error.message); return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    el.prepend(renderer.domElement);
    const scene = new Scene(), instrument = new Group(); scene.add(instrument); instrument.scale.z = NECK_Z;
    const light = theme !== 'dark';
    scene.add(new HemisphereLight(light ? '#fff9ee' : '#e9e6ff', '#352a23', 1.2));
    const key = new DirectionalLight('#fff4e6', 2.4); key.position.set(-3, 9, 4); key.castShadow = true;
    Object.assign(key.shadow.camera,{left:-13,right:14,top:6,bottom:-6,near:.1,far:30});
    key.shadow.mapSize.set(1024,1024); key.shadow.normalBias = .035; key.shadow.bias = -.0003;
    key.shadow.camera.updateProjectionMatrix(); scene.add(key);
    const rim = new DirectionalLight('#e5e3fa', .7); rim.position.set(3, 4, -6); scene.add(rim);
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const box = new RoundedBoxGeometry(1,1,1,2,0.075); geometries.add(box);
    const hitBox = new BoxGeometry(1,1,1); geometries.add(hitBox);
    const disk = new CylinderGeometry(0.15,0.15,0.026,32); geometries.add(disk);
    const ring = new RingGeometry(.12,.165,32); ring.rotateX(-Math.PI/2); geometries.add(ring);
    const rosewood = woodTexture('#211512', '#b87d55'), maple = woodTexture('#745033', '#cf9766');
    textures.add(rosewood); textures.add(maple);
    const mat = (color, props = {}) => { const m = new MeshPhysicalMaterial({ color, roughness: 0.68, clearcoat: 0.08, clearcoatRoughness: 0.65, ...props }); materials.add(m); return m; };
    const rose = mat('#ffffff', { map: rosewood }), mapleMat = mat('#ffffff', { map: maple });
    const chrome = mat('#dddce1', { metalness: 0.78, roughness: 0.22 });
    const ivory = mat('#f4e9d6', { roughness: 0.27 }), binding = mat('#c4a67e');
    const shadowGeometry = new PlaneGeometry(36,12); geometries.add(shadowGeometry);
    const shadowMaterial = new ShadowMaterial({opacity:light?.20:.4}); materials.add(shadowMaterial);
    const ground = new Mesh(shadowGeometry,shadowMaterial); ground.rotation.x=-Math.PI/2; ground.position.y=-.58; ground.receiveShadow=true; scene.add(ground);
    const mesh = (geometry, material, x,y,z, sx=1,sy=1,sz=1) => { const o = new Mesh(geometry, material); o.position.set(x,y,z); o.scale.set(sx,sy,sz); instrument.add(o); o.castShadow = true; o.receiveShadow = true; return o; };
    // A rounded neck with cream binding and a rosewood playing surface, running
    // from a 3+3 headstock into an acoustic body (both built in guitarBody.js).
    mesh(box, mapleMat, -0.15,-0.29,0,12.3,0.5,3.56);
    mesh(box, binding,0,-0.04,0,12.55,0.08,3.58);
    mesh(box, rose,0,.05,0,12.5,0.18,3.47);
    mesh(box,ivory,-6.12,0.135,0,0.12,0.13,3.48);
    const fretX = f => -6.05 + 24.1 * (1 - 2 ** (-f / 12));
    for (let f=1; f<=12; f++) mesh(box,chrome,fretX(f),0.18,0,0.044,0.09,3.48);
    const pearl = mat('#f6efe2', { roughness: 0.22, iridescence: 0.7, iridescenceIOR: 1.35, clearcoat: 0.6 });
    [3,5,7,9,12].forEach(f => {
      const x=(fretX(f-1)+fretX(f))/2;
      mesh(disk,pearl,x,0.148,f===12?0.47:0,0.85,0.55,0.85);
      if(f===12) mesh(disk,pearl,x,0.148,-0.47,0.85,0.55,0.85);
    });
    // Body and headstock in real proportions: undo the neck's squash.
    const real = new Group(); real.scale.z = 1 / NECK_Z; instrument.add(real);
    real.add(buildGuitarFrame(mat, { geometries, materials, textures }));

    const strings = [], targets = [], dots = [];
    const inactive = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }); materials.add(inactive);
    GUITAR_TUNING.forEach((pitch,s) => {
      const z=(2.5-s)*0.56;
      const gauge=0.014+(5-s)*0.004;
      const wire = mesh(box,mat(s<3?'#c6aa79':'#e9e5da',{metalness:0.75,roughness:0.25}),5.7,0.23,z,23.65,gauge,gauge);
      // Past the nut each string bends to its tuner post on the headstock.
      const zr=z*NECK_Z, dx=STRING_POSTS[s]+6.12, dz=(s<3?1.2:-1.2)-zr, run=Math.hypot(dx,dz);
      const tail=new Mesh(box,wire.material); tail.position.set(-6.12+dx/2,0.17,zr+dz/2); tail.scale.set(run,gauge,gauge); tail.rotation.y=Math.atan2(-dz,dx); tail.castShadow=true; real.add(tail);
      strings.push(wire);

      for(let f=0;f<=maxFret;f++) {
        const x=f===0?-6.45:(fretX(f-1)+fretX(f))/2;
        const width=f===0?0.5:fretX(f)-fretX(f-1);
        const hit=mesh(hitBox,inactive,x,0.28,z,width,0.14,0.53);
        hit.userData={midi:guitarMidi(s,f),string:s,fret:f}; hit.castShadow=false; hit.receiveShadow=false; targets.push(hit);
        const m=mat(GUITAR_COLORS[s],{roughness:0.8,emissiveIntensity:0});
        const dot=mesh(disk,m,x,0.3,z,1.55,1,1.55); dot.userData=hit.userData; dot.castShadow=false; dot.receiveShadow=false; dots.push(dot);
      }
    });
    const updateLabels=()=>{
      instrument.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const project=(text,x,y,z,kind,root=false)=>{const p=new Vector3(x,y,z).applyMatrix4(instrument.matrixWorld).project(camera);return {text,x:(p.x+1)*el.clientWidth/2,y:(1-p.y)*el.clientHeight/2,kind,root};};
      setLabels([...GUITAR_TUNING.map((pitch,s)=>({...project(noteName(pitch),-6.12,.3,(2.5-s)*.56,'string'),x:latest.current.leftHanded?el.clientWidth-28:28})), ...Array.from({length:maxFret},(_,i)=>{const f=i+1;return project(String(f),(fretX(f-1)+fretX(f))/2,.14,-2.13,'fret');}), ...GUITAR_TUNING.flatMap((_,s)=>{const shape=latest.current.chord,f=shape?.frets[s];return !shape||f>maxFret?[]:[project(chordPositionLabel(shape,s,latest.current.labelMode),f==null||f===0?-6.45:(fretX(f-1)+fretX(f))/2,.35,(2.5-s)*.56,f==null?'muted':'finger',chordTone(shape,s)?.root)];})]);
    };
    const resize = () => {
      const w=el.clientWidth,h=el.clientHeight; if(!w||!h)return;
      renderer.setSize(w,h); camera.aspect=w/h;
      // Frame the string names, headstock and neck; at twelve frets, also the
      // shoulder of the body and part of the soundhole.
      const left=-9.6, right=fretX(maxFret)+(maxFret>=12?2.6:0.4), center=(left+right)/2;
      const distance=Math.max(6.1,(right-left)/2/(Math.tan(16*Math.PI/180)*camera.aspect)*1.06);
      const look = center * instrument.scale.x; camera.position.set(look,distance*.89,distance*.46); camera.lookAt(look,0,0); camera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate=true; updateLabels();
    };
    const observer=new ResizeObserver(resize); observer.observe(el); resize();
    const ray=new Raycaster(),pointer=new Vector2(); let hovered=null;
    const find = event => {
      const bounds=renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
      ray.setFromCamera(pointer,camera); return ray.intersectObjects(targets)[0]?.object;
    };
    const move = event => { hovered=find(event)??null; renderer.domElement.style.cursor=hovered?'pointer':'default'; setHover(hovered?'String '+(6-hovered.userData.string)+' · '+(hovered.userData.fret?'fret '+hovered.userData.fret:'open')+' · '+noteName(hovered.userData.midi):''); };
    const leave=()=>{hovered=null;setHover('');};
    const click=event=>{ if(event.button!==0)return; const target=find(event);if(target) latest.current.onPluck(target.userData); };
    const lost=event=>{event.preventDefault();latest.current.onContextLost('The graphics context was lost');};
    renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerleave',leave);
    renderer.domElement.addEventListener('pointerdown',click);renderer.domElement.addEventListener('webglcontextlost',lost);
    const calm=window.matchMedia('(prefers-reduced-motion: reduce)'); let frame, labelChord, lastLabelMode;
    const draw=()=>{
      const {engine:e,score:piece,leftHanded:left,chord:shape}=latest.current;
      if(shape!==labelChord || lastLabelMode!==latest.current.labelMode){labelChord=shape;lastLabelMode=latest.current.labelMode;updateLabels();}
      const now=e.transportRef.current?.now()??0;
      const next=(e.sessionRef.current?.targets??piece.notes).find(n=>n.status!=='hit'&&n.time>=Math.max(0,now)-0.1);
      const flip=left?-1:1; if(instrument.scale.x!==flip){instrument.scale.x=flip;resize();}
      const positions=latest.current.activePositions?.current??new Map();
      const counts={held:0,possible:0,target:0};
      dots.forEach(dot=>{
        const d=dot.userData, focused=latest.current.focusPosition;
        const state=guitarFeedback(d,e.activeInputRef.current,positions,!shape&&next?.string===d.string&&next?.fret===d.fret,shape?.frets[d.string]===d.fret,(hovered&&hovered.userData===d)||(focused?.string===d.string&&focused?.fret===d.fret));
        dot.visible=state!=='idle'; if(state in counts)counts[state]++;
        const verdict=e.activeInputRef.current.get(d.midi)?.type;
        dot.material.color.set(state==='held'?(verdict==='wrong'?'#c95d74':verdict==='timing'?'#c69548':'#63dbb6'):state==='target'||state==='hover'?'#7160c6':state==='possible'?'#cfb980':chordTone(shape,d.string)?.root?'#e3ad77':'#f1ebdf');
        dot.material.transparent=true; dot.material.opacity=state==='possible'?.38:1;
        dot.geometry=state==='target'||state==='possible'||state==='hover'?ring:disk; dot.scale.setScalar(state==='held'?1.7:1.5);
      });
      el.dataset.heldPositions=counts.held;el.dataset.possiblePositions=counts.possible;el.dataset.targetPositions=counts.target;
      strings.forEach((wire,s)=>{const entry=positions.get(s),active=entry&&e.activeInputRef.current.has(entry.midi);wire.material.emissive.set(active?'#3fbc98':'#000000'); wire.material.emissiveIntensity=active?.35:0; wire.position.y=.23+(!calm.matches&&active?Math.sin(performance.now()*.065+s)*.012*Math.exp(-(performance.now()-entry.at)/400):0);});
      if(!document.hidden) renderer.render(scene,camera);
      frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);
    return ()=>{
      cancelAnimationFrame(frame);observer.disconnect();
      renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerleave',leave);
      renderer.domElement.removeEventListener('pointerdown',click);renderer.domElement.removeEventListener('webglcontextlost',lost);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
    };
  },[theme,maxFret]);
  return <div className="guitar-stage" ref={host} role="group" aria-label="Three-dimensional guitar fretboard">
    <div className="guitar-stage-top"><div><strong>{chord ? chordFullName(chord) : 'Fretboard'}</strong><span>{chord ? 'Open-position voicing' : 'Standard tuning · E A D G B E'}</span></div>{chord && <div className="guitar-open-picks" role="group" aria-label="Play open strings"><span>OPEN STRINGS</span>{[0,1,2,3,4,5].map(s=><button key={s} aria-label={'Play open string '+(6-s)+': '+noteName(GUITAR_TUNING[s])} onClick={()=>onPluck({string:s,fret:0})}>{noteName(GUITAR_TUNING[s])}</button>)}</div>}</div>
    {labels.map((label,i)=><span key={i} className={'guitar-position-label '+label.kind+(label.root?' root':'')} style={{left:label.x,top:label.y,fontSize:label.kind==='string'?Math.min(labelSize,13):labelSize}}>{label.text}</span>)}
    <div className="guitar-stage-bottom"><span className="guitar-stage-legend">{chord && <><i className="root"/>Root </>}<i className="played"/>Played <i className="next"/>{chord?'Hover':'Next note'}</span><span className="guitar-stage-hint">{hover||'Click between frets to play · ○ open string'}</span></div>
  </div>;
}
