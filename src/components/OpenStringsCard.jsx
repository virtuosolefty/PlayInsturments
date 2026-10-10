import StringPicks from './StringPicks.jsx';

/**
 * Free play beside a fretted instrument that has no chords to explore (the
 * bass plays one note at a time): its open strings to pick, and how hard.
 * It takes the chord explorer's place and its styles (ChordCard.jsx).
 *
 * @param {object} props
 * @param {object} props.kit the instrument (instruments.js)
 */
export default function OpenStringsCard({ kit, onPick, settings, setSettings, leftHanded, activePositions }) {
  const name = kit.label.toLowerCase();
  return <section className="chord-card open-strings-card section" aria-label="Open strings">
    <div className="chord-card-title"><span className="eyebrow">OPEN STRINGS</span><span className="chord-voicing">{kit.tuning.map((_, s) => kit.stringName(s).note).join(' ')}</span></div>
    <div className="chord-card-heading"><div><strong>One note at a time.</strong><span>The {name} holds the music up from underneath.</span></div></div>
    <StringPicks kit={kit} label="Play open strings" leftHanded={leftHanded} onPick={onPick} activePositions={activePositions}
      placeOf={s => ({ fret: 0, midi: kit.tuning[s], note: kit.stringName(s).note })} />
    <details className="chord-feel"><summary>Feel <small>{Math.round((settings.guitarStrength??.72)*100)}%</small></summary><div className="chord-dynamics">
      <label>Strength <output>{Math.round((settings.guitarStrength??.72)*100)}%</output><input aria-label="Pluck strength" type="range" min=".2" max="1" step=".01" value={settings.guitarStrength??.72} onChange={e => setSettings(s => ({...s,guitarStrength:+e.target.value}))}/></label>
    </div></details>
    <p className="hint">Click between the frets to play any note.<br/>Try the root of a chord on each beat, then add the note five steps above it.</p>
  </section>;
}
