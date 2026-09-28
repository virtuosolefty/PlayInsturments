# Practice Deck — UI review and release roadmap

Reviewed 20 September 2026. Source: the actual project in `D:\PP`, the supplied screenshots, and browser runs of the updated application.

The current code is newer than the supplied screenshots. It already includes a library drawer, onboarding, lesson paths, an optional Three.js piano stage, notation, latency calibration, local backups, and a substantial test suite. The right approach is to strengthen this foundation while keeping the timing and grading engine stable.

“Top 3” is a product ambition, not a ranking this review can verify. The proposed direction is a focused instrument studio: quick to start, calm while playing, precise about feedback, and enjoyable to return to.

## Implemented in this update

| Area | Change | Reason |
|---|---|---|
| Overall composition | Framed practice surface, quieter graphite panels, consistent mint accent, more deliberate spacing | The instrument and primary action now have a clear visual priority |
| Instrument choice | Visible Piano / Guitar selector with persistent selection | Guitar is a first-class practice mode, rather than a hidden sound preset |
| Session context | Current piece and effective tempo appear above the controls | The selected piece stays identifiable when the feedback sidebar is hidden |
| Player controls | Existing actions and shortcuts retained; clearer Play contrast and compact phone controls | Familiar behavior remains available while the visual hierarchy improves |
| Three.js | Prominent 2D Trainer / 3D Stage controls; existing piano renderer retained; new guitar fretboard | Players can discover the 3D presentation without searching the options panel |
| Guitar tab | Six labeled strings, authored fret numbers, duration tails, beat/bar guides and next-note information | A guitar player sees string and fret information instead of piano keys |
| Guitar input | Clickable frets 0–12, keyboard-accessible buttons, MIDI input, mirrored left-handed view | Basic guitar play works without buying extra hardware |
| Guitar sound | Offline synthesized plucked voice; Em, Am, C, G and D shapes with strumming | Guitar mode has its own sound and a small space for chord exploration |
| Guitar studies | Open strings, C major in first position, and an A minor arpeggio | Every exercise has deliberate, playable string/fret positions |
| Feedback | Separate guitar score IDs and arrangement records; existing accuracy/timing/report pipeline reused | Guitar attempts cannot replace piano personal bests |
| Library | Search by title or composer, useful no-match message, clear switch-back notice in Guitar mode | Larger collections are easier to navigate |
| Onboarding | Instrument-aware instructions and shorter start guidance | New players can begin without understanding the audio architecture |
| Accessibility | Skip link, focus outlines, pressed-state instrument controls, labeled frets, a mobile feedback close button | Core new controls are usable without pointing at a canvas |
| Small screens | Compact transport, contained horizontal fret scrolling, accessible feedback drawer | The page itself does not develop horizontal overflow |
| Reliability | Guitar audio-loading race protection, note/timer cleanup, Three.js disposal and context-loss fallback | A late piano download or instrument switch cannot silently replace the guitar voice |
| Library accuracy | Corrected count, pitch range and duration metadata for five bundled excerpts | The UI now describes the actual files rather than much longer hypothetical arrangements |

The guitar exercise choice persists. Piano hand selection, fitting, transpose and notation preferences are retained across instrument switches. Playback is paused and the loop cleared when switching instruments. Picking or importing a piano piece returns to Piano mode. Existing transport, matching, grading and storage schemas were not rewritten.

## Guitar scope: what works and what still needs work

This release supports an on-screen instrument and standard MIDI note input, including a MIDI guitar or guitar-to-MIDI adapter. It does **not** listen to an acoustic guitar through a microphone or audio interface. The sound is explicitly labeled **synthesized**, not a sampled acoustic guitar.

The exercises score pitch and timing using the existing engine. MIDI pitch alone does not prove which physical string or fret was used. The shown positions are guidance, not verified hand-position detection. Chord strumming is for exploration; these three studies assess individual notes. Switching to the piano library does not automatically produce guitar arrangements.

For acoustic/electric guitar input, the next stage should add input-device selection, permission and signal-level states, a tuner, onset detection, calibrated monophonic pitch tracking, and a visible confidence indicator. Test noise rejection, repeats, harmonics, headphones, and output-to-input feedback before promising scoring. Polyphonic chord recognition and technique grading require separate validation.

## Remaining UI work, in priority order

| Priority | Recommendation | Acceptance target |
|---|---|---|
| P0 | Consolidate instrument setup into one compact connection sheet: on-screen, MIDI, external plugin, and eventually audio input | A beginner can identify what is connected, what will make sound, and how to recover |
| P0 | Replace generic connection failures with reason-specific recovery text; add recoverable audio-start failure/loading states | Denied permission, disconnected hardware, unavailable samples and suspended audio are distinguishable |
| P0 | Complete a keyboard and screen-reader audit of the existing piano canvas, library drawer and options dialog | Focus is contained where appropriate, restored on close, and every core task has an accessible alternative |
| P0 | Verify readable text and touch targets on real phones/tablets, including 200% zoom | No critical action is clipped; small guitar views have a clear scroll affordance or a dedicated playing layout |
| P0 | Audit the repertoire's titles, credits, keys and excerpt descriptions | Descriptions agree with actual MIDI content; short sketches are not presented as complete songs |
| P1 | Add a genuine free-play workspace with no running score | Chord exploration and improvisation do not accidentally become graded attempts |
| P1 | Add named A–B sections and saved practice loops | A player can return directly to a specific phrase next session |
| P1 | Unify the library across instruments with explicit piano/guitar filters | Guitar users can browse studies and authored arrangements without switching back to piano |
| P1 | Add curated guitar arrangements and persist handedness/tuning preferences | Guitar growth extends beyond the three starter studies |
| P1 | Provide local licensed guitar samples and visible download/offline status | Sound quality improves without disguising a failed download |
| P1 | Simplify live feedback to one accuracy measure, timing direction and one actionable cue | Players can interpret feedback while keeping their eyes on the music |
| P1 | Make reports answer “what improved?” and “what should I do next?” in one glance | Compare like-for-like instrument, arrangement, mode and tempo |
| P1 | Add a practice-focused mobile layout, with setup controls collapsed by explicit user choice | The tab and playable controls can be used together on short portrait screens |
| P2 | Add high-contrast and light themes, scalable labels and non-color outcome symbols | Readability improves in bright rooms and for players with low vision |
| P2 | Add optional install/offline caching and a deliberate backup reminder | Returning players understand what is saved locally and what survives losing the browser data |
| P2 | Add localization and clearer inline shortcut help | The interface grows without relying on tiny tooltips or icon knowledge |

## Three.js direction

Keep 2D as the default timing view and Three.js as an optional presentation. Piano perspective changes apparent travel speed; the existing trainer remains useful for precise timing. Guitar tab stays linear in time even when its fretboard is 3D.

The new guitar scene is lazy-loaded, caps pixel density, updates its camera on resize, releases geometry/materials/context on unmount, and falls back when the graphics context is lost. No scene owns the score, audio clock, matching or storage. Avoid camera movement, particles and bloom during practice unless measurements show they improve the experience. Measure low-end GPU frame times before adding more effects. Three.js documents the importance of matching camera and canvas dimensions and limiting rendering resolution in its [responsive rendering guide](https://threejs.org/manual/pages/responsive.html).

## Product benchmarks

These are three useful references, not an asserted market ranking:

- **Yousician:** benchmark the clear separation of practice, notation, tempo, chord guidance and instrument setup. Its [guitar mode documentation](https://support.yousician.com/hc/en-us/articles/201558362-Practice-and-Play-modes-in-guitar) describes these controls.
- **Synthesia:** benchmark immediate visual correspondence between falling notes and the instrument. Its [product overview](https://synthesiagame.com/about) centers that learning interaction.
- **Soundslice:** benchmark phrase-level study, notation and looping, as described in its [practice features](https://www.soundslice.com/features/).

The design recommendation is to combine a clear instrument surface, useful small practice loops, and trustworthy feedback. More visual effects alone will not establish a leading product.

## Verification and production limits

See `review/VALIDATION.md` for the final checks. Screenshots are in `review/`.

Before a public release, test physical MIDI piano/guitar devices, audio interfaces, Safari/Firefox fallback behavior, low-end graphics, screen readers and long sessions. Physical hardware and acoustic-guitar input were not validated in this review. The build still reports large audio/notation/Three.js chunks; measure startup, memory and interaction latency before further bundling changes. The original source also contains extensive production console logging and some older expected-failure browser tests that need maintenance.

There is no cloud sync or service-worker offline install added here. Local progress remains local. The UI update is a tested improvement and a foundation for release work, not a certification that every production requirement is complete.
