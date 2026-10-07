/**
 * One icon set for the whole app. Stroke icons on a 24px grid (Lucide-style
 * geometry), drawn in currentColor so they follow text and theme colours.
 * Replaces the mix of Unicode glyphs (▶ ■ ↻ ⟲ ♪ ♩ ⚙ ◧) that rendered at a
 * different weight, size and baseline in every font.
 */
const PATHS = {
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  restart: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  loop: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  headphones: <path d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />,
  turn: <><path d="m9 10-5 5 5 5" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></>,
  metronome: <><path d="M9.5 3h5l4.5 18H5z" /><path d="m12 15 5-8" /></>,
  panel: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  volume: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
  heart: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  heartFill: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" fill="currentColor" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  focus: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /></>,
  minimize: <><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.8 1.6 2.8 2.5 2.8z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 15.3A8.3 8.3 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3Z" />,
  sparkle: <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />,
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.8, ...rest }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}
