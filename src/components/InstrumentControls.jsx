import { playInput } from '../lib/playInput.js';
export default function InstrumentControls({ settings, setSettings, sustain, onSustain }) {
  const patch = p => setSettings(s => ({...s,...p}));
  return <div className="instrument-controls" aria-label="Piano playing controls">
    <label>Range<select aria-label="Piano visible range" value={settings.pianoRange ?? 'full'} onChange={e=>patch({pianoRange:e.target.value})}><option value="fit">Fit piece</option><option value="two">2 octaves</option><option value="full">Full range</option></select></label>
    <div className="octave-controls"><button aria-label="Lower keyboard octave" disabled={(settings.typingOctave??0)<=-2} onClick={()=>{playInput.releasePrefix('typing-');patch({typingOctave:(settings.typingOctave??0)-1});}}>−</button><span>Octave {settings.typingOctave??0}</span><button aria-label="Raise keyboard octave" disabled={(settings.typingOctave??0)>=2} onClick={()=>{playInput.releasePrefix('typing-');patch({typingOctave:(settings.typingOctave??0)+1});}}>+</button></div>
    <label>Labels<select aria-label="Keyboard labels" value={settings.pianoLabels??'octaves'} onChange={e=>patch({pianoLabels:e.target.value})}><option value="octaves">Octaves</option><option value="notes">Notes</option><option value="keys">Computer keys</option><option value="off">Off</option></select></label>
    <label>Touch<select aria-label="Piano velocity mode" value={settings.pianoVelocityMode??'fixed'} onChange={e=>patch({pianoVelocityMode:e.target.value})}><option value="fixed">Fixed</option><option value="position">Key position</option></select></label>
    <label className="velocity-control">Strength<input aria-label="Playing strength" type="range" min="0.2" max="1" step="0.01" value={settings.playVelocity??0.72} onChange={e=>patch({playVelocity:+e.target.value})}/></label>
    <label className="velocity-control">Key size<input aria-label="Keyboard height" type="range" min="64" max="230" step="1" value={settings.pianoHeight??104} onChange={e=>patch({pianoHeight:+e.target.value})}/></label>
    <button aria-pressed={sustain} onClick={()=>onSustain(!sustain)}>Sustain {sustain?'on':'off'}</button>
  </div>;
}
