import { useMemo, useRef, useState } from 'react';
import BowedArt from './BowedArt.jsx';
import { bowedLayout, VIEW } from '../lib/bowedGeometry.js';
import { BOWED_TAPES } from '../lib/bowed.js';
import { guitarFeedback } from '../lib/instrumentView.js';
import { noteName } from '../lib/theory.js';

const STRING_TONE = {
  violin: { colors: ['#b9b6b0', '#cfccc6', '#dedbd5', '#eeece8'], gauge: [3.4, 2.8, 2.3, 1.5] },
  cello: { colors: ['#aeaaa2', '#c3bfb7', '#d3d0c9', '#e3e1dc'], gauge: [4.6, 3.9, 3.2, 2.6] },
};
// Which strings are wound (cross-hatched), and the silk wrap beside the tailpiece, G/C → E/A.
const WOUND = { violin: [true, true, true, false], cello: [true, true, true, true] };
const SILK = ['#d4503f', '#3f86c9', '#e2b13a', '#58ad68'];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

/** The bow, crossing the strings near the bridge while any string sounds. */
function Bow({ x }) {
  return <g className="bowed-bow" aria-hidden="true">
    <rect x={x - 5} y="-150" width="16" height={VIEW.height + 250} rx="4" fill="#000" opacity=".18" />
    <rect className="bow-hair" x={x - 8} y="-150" width="13" height={VIEW.height + 236} rx="2" />
    <rect className="bow-stick" x={x + 8} y="-160" width="7" height={VIEW.height + 250} rx="3.5" />
    <rect x={x + 9.5} y="-160" width="2" height={VIEW.height + 250} rx="1" fill="#ffffff30" />
    <path className="bow-frog" d={`M${x - 10},${VIEW.height + 70} h28 v46 q-14,10 -28,0 Z`} />
    <circle cx={x + 4} cy={VIEW.height + 93} r="5" fill="#dfe9ee" />
    <rect x={x - 11} y={VIEW.height + 60} width="30" height="10" rx="2" fill="#c9c9cf" />
  </g>;
}

/**
 * A playable violin or cello fingerboard.
 *
 * Press a place to start the bow and release to stop it; drag along a string
 * to slide. The bowing area near the bridge plays open strings. Keyboard:
 * arrows move, Enter or Space bows while held. Feedback states are the
 * guitar's, so the practice engine needs nothing new.
 */
export default function BowedStage({ kit, engine, maxFret, labelMode = 'fingers', labelSize = 14, target = null, selection = null, activePositions, onBow, onLift }) {
  const layout = useMemo(() => bowedLayout({ strings: kit.tuning.length, maxFret, spacing: kit.id === 'cello' ? 34 : 30, spread: kit.id === 'cello' ? 50 : 44 }), [kit, maxFret]);
  const [hover, setHover] = useState(null);
  const [focus, setFocus] = useState({ string: kit.tuning.length - 2, fret: 0 });
  const pressed = useRef(null);
  const pointer = useRef(null);
  const svg = useRef(null);
  // The tab stop must land on a place that exists after Reach narrows.
  const roving = { string: Math.min(focus.string, kit.tuning.length - 1), fret: Math.min(focus.fret, maxFret) };
  const tone = STRING_TONE[kit.id] ?? STRING_TONE.violin;
  const positions = activePositions?.current ?? new Map();
  const active = engine.activeInputRef.current;

  const describe = (string, fret) => {
    const name = kit.stringName(string), finger = kit.finger(fret);
    const place = fret === 0 ? 'open string' : finger != null ? `finger ${finger}` : `${fret} semitones up`;
    return `${name.note} string · ${place} · ${noteName(kit.midi(string, fret))}`;
  };
  const label = (string, fret) => {
    if (labelMode === 'notes') return noteName(kit.midi(string, fret)).replace(/\d/g, '');
    const finger = kit.finger(fret);
    return finger == null ? noteName(kit.midi(string, fret)).replace(/\d/g, '') : String(finger);
  };
  const start = zone => {
    if (!zone) return;
    const current = pressed.current;
    // Trust the ref only while the voice is really sounding: silence() (blur,
    // play/pause) releases voices without telling the stage.
    const live = activePositions?.current.get(zone.string);
    if (current && current.string === zone.string && current.fret === zone.fret && live?.fret === zone.fret) return;
    if (current && current.string !== zone.string) onLift(current.string);
    pressed.current = { string: zone.string, fret: zone.fret };
    onBow({ string: zone.string, fret: zone.fret });
  };
  const stop = () => { if (pressed.current) onLift(pressed.current.string); pressed.current = null; pointer.current = null; };
  const ours = event => pointer.current === null || event.pointerId === pointer.current;
  const release = event => { if (ours(event)) stop(); };
  const zoneAt = event => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el?.dataset?.string) return null;
    return { string: +el.dataset.string, fret: +el.dataset.fret };
  };
  const onPointerDown = event => {
    if (event.button !== 0 || !event.target.dataset?.string || pointer.current !== null) return;
    event.preventDefault();
    pointer.current = event.pointerId;
    svg.current?.setPointerCapture?.(event.pointerId);
    start({ string: +event.target.dataset.string, fret: +event.target.dataset.fret });
  };
  const onPointerMove = event => {
    if (!ours(event)) return;
    const zone = zoneAt(event);
    setHover(zone);
    if (pressed.current && zone) start(zone);
  };
  const onKeyDown = (event, zone) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) start(zone); return; }
    if (!KEYS.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const string = Math.min(kit.tuning.length - 1, Math.max(0, zone.string + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0)));
    const fret = Math.min(maxFret, Math.max(0, event.key === 'Home' ? 0 : event.key === 'End' ? maxFret : zone.fret + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
    stop(); setFocus({ string, fret });
    svg.current?.querySelector(`[data-key="${string}-${fret}"]`)?.focus();
  };
  const onKeyUp = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); stop(); } };

  const states = [];
  for (let s = 0; s < kit.tuning.length; s++) {
    for (let fret = 0; fret <= maxFret; fret++) {
      const midi = kit.midi(s, fret);
      const isHover = hover?.string === s && hover?.fret === fret;
      const expected = target?.string === s && target?.fret === fret;
      const chosen = !!selection?.some(p => p.string === s && p.fret === fret);
      const state = guitarFeedback({ midi, string: s, fret }, active, positions, expected, chosen, isHover);
      if (state !== 'idle') states.push({ string: s, fret, state, x: fret === 0 ? (layout.bow.x0 + layout.bow.x1) / 2 : layout.posX(fret) });
    }
  }
  const sounding = [...positions.values()].filter(p => active.has(p.midi));
  const tapes = BOWED_TAPES[kit.id] ?? [];
  const hint = hover ? describe(hover.string, hover.fret) : 'Press and hold to bow · drag along a string to slide · bow near the bridge for open strings';

  return (
    <div className="bowed-stage" data-held-positions={states.filter(s => s.state === 'held').length} data-target-positions={states.filter(s => s.state === 'target').length} style={{ '--bowed-label-size': labelSize + 'px' }}>
      <svg ref={svg} className="bowed-svg" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={`Playable ${kit.label.toLowerCase()} fingerboard`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onPointerLeave={() => setHover(null)}>
        <BowedArt instrument={kit.id} layout={layout} />
        {tapes.filter(t => t.fret <= maxFret).map(t => {
          const x = layout.posX(t.fret), hw = layout.halfWidth(x);
          return <g key={t.fret} className="bowed-tape" aria-hidden="true">
            <rect x={x - 3.5} y={VIEW.cy - hw} width="7" height={hw * 2} rx="1.5" />
            <text x={x} y={VIEW.cy - hw - 10}>{t.finger}</text>
          </g>;
        })}
        {Array.from({ length: kit.tuning.length }, (_, s) => {
          const ring = sounding.some(p => p.string === s);
          const x1 = layout.nutX, x2 = layout.bridgeX, x3 = layout.bridgeX + 64;
          const y3 = VIEW.cy + ((kit.tuning.length - 1) / 2 - s) * 24, y2 = layout.stringY(s, x2), g = tone.gauge[s];
          const points = `${x1},${layout.stringY(s, x1)} ${x2},${y2} ${x3},${y3}`;
          const wrap = t => `${x2 + (x3 - x2) * t},${y2 + (y3 - y2) * t}`;
          return <g key={s} className={`bowed-string-set ${ring ? 'sounding' : ''}`}>
            <polyline className="bowed-string-shadow" fill="none" strokeWidth={g} points={points} transform="translate(0 2.5)" />
            <polyline className={`bowed-string ${ring ? 'sounding' : ''}`} fill="none" stroke={tone.colors[s]} strokeWidth={g} points={points} />
            {(WOUND[kit.id] ?? WOUND.violin)[s] && <polyline className="bowed-string-wind" fill="none" strokeWidth={g} points={points} />}
            <polyline className="bowed-string-glint" fill="none" strokeWidth={Math.max(0.7, g * 0.28)} points={points} transform={`translate(0 ${-g * 0.22})`} />
            <polyline className="bowed-string-silk" fill="none" stroke={SILK[s]} strokeWidth={g + 0.8} points={`${wrap(0.5)} ${wrap(0.68)}`} />
          </g>;
        })}
        {sounding.length > 0 && <Bow x={(layout.bow.x0 + layout.bow.x1) / 2} />}
        {layout.zones.map(zone => {
          const key = `${zone.string}-${zone.fret}`;
          const xm = (zone.x0 + zone.x1) / 2, h = layout.gap(xm), y = layout.stringY(zone.string, xm) - h / 2;
          const focusable = !zone.bow && roving.string === zone.string && roving.fret === zone.fret;
          return <rect key={key + (zone.bow ? '-bow' : '')} className={`bowed-zone ${zone.bow ? 'bow' : ''}`} x={zone.x0} y={y} width={zone.x1 - zone.x0} height={h}
            data-string={zone.string} data-fret={zone.fret} data-key={zone.bow ? undefined : key}
            role="button" tabIndex={zone.bow ? undefined : focusable ? 0 : -1} aria-label={zone.bow ? `Bow the open ${kit.stringName(zone.string).note} string` : describe(zone.string, zone.fret)}
            onFocus={() => { if (!zone.bow) { setFocus({ string: zone.string, fret: zone.fret }); setHover({ string: zone.string, fret: zone.fret }); } }}
            onBlur={() => { setHover(null); stop(); }}
            onKeyDown={zone.bow ? undefined : e => onKeyDown(e, zone)} onKeyUp={zone.bow ? undefined : onKeyUp} />;
        })}
        {states.map(({ string, fret, state, x }) => {
          const y = layout.stringY(string, x);
          return <g key={`${string}-${fret}`} className={`bowed-marker ${state}`} transform={`translate(${x} ${y})`} aria-hidden="true">
            <circle className="marker-shadow" r={state === 'held' ? 15 : 13.5} cy="2.5" />
            <circle r={state === 'held' ? 15 : 13.5} />
            <text y="0.5">{state === 'possible' ? '' : label(string, fret)}</text>
          </g>;
        })}
        {Array.from({ length: kit.tuning.length }, (_, s) => (
          <text key={s} className="bowed-string-name" x={layout.nutX + 16} y={layout.stringY(s, layout.nutX + 16) - 7} aria-hidden="true">{kit.stringName(s).note}</text>
        ))}
        <text className="bowed-zone-caption" x={(layout.bow.x0 + layout.bow.x1) / 2} y={VIEW.cy - layout.halfWidth(layout.bow.x1) - 12} aria-hidden="true">BOW HERE · OPEN</text>
      </svg>
      <div className="bowed-stage-bottom"><span className="guitar-stage-legend"><i className="played" />Played <i className="next" />{target ? 'Next note' : 'Hover'}{selection && <><i className="root" />Scale</>}</span><span className="guitar-stage-hint" role="status">{hint}</span></div>
    </div>
  );
}
