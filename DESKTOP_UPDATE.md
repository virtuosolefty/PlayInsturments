# Desktop studio update

The desktop studio now defaults to a warm ivory palette with an indigo accent. The top-right Light/Dark button switches the complete interface, piano roll, guitar tab and Three.js views. The preference is saved on this device.

## Playing

- The selected piece is the main heading. The transport is compact, with named Preview and Metronome controls. Sheet-music and hand selection live in Options.
- Focus hides the coaching panel and expands the music surface. Exit focus restores it.
- Practice preserves the existing scoring, transport, matching, and completed-run grading logic.
- Free play has no score or recorded results. Guitar chord shapes and strumming are available there, with finger numbers and remembered handedness.
- Live accuracy counts only notes already judged, including extra notes. Piece completion is shown separately. Timing is explicitly unmeasured in Wait for me, and detailed events remain available in the collapsed performance section.

## Instruments and setup

Three.js piano keys have rounded edges, ivory and ebony materials, hinged movement, a walnut case, felt and brass trim. The guitar has a locally generated rosewood surface, cream binding, correctly spaced frets, tuning machines, string labels, fret numbers, position markers, and direct string/fret interaction. The accessible fret buttons and 2D fallback remain available.

Instrument setup provides input guidance, MIDI device selection, permission and connection recovery, a sound test with detected-note feedback, and access to existing calibration and external-audio settings. The welcome screen lets a new player choose piano or guitar directly. Modal keyboard focus is contained and restored when closing.

Guitar input supports on-screen playing and MIDI. It does not recognize microphone audio, verify physical finger placement, or grade polyphonic guitar technique. The guitar voice is synthesized. Six authored studies cover open strings, C major, E minor pentatonic, chromatic finger work, D major and A minor picking.

## Library and progress

One library exposes piano pieces and guitar studies, with instrument filters, beginner filtering, search, favorites and continue-practicing shortcuts. Favorites, the selected study/piano piece, theme and handedness persist. Existing progress and backup tools remain under Library → Progress. No account or cloud storage is required; progress stays in this browser.

## Verification

See `review/DESKTOP_VALIDATION.md` for the final automated checks and desktop screenshots. Mobile layout redesign was outside this update's scope. Physical MIDI hardware, acoustic input, cross-browser audio and long-duration device testing are not established by the automated Chromium checks.

## Rendering references

The instrument meshes use Three.js [rounded box geometry](https://threejs.org/docs/pages/RoundedBoxGeometry.html) and [physical materials](https://threejs.org/docs/pages/MeshPhysicalMaterial.html). Models and textures are constructed locally, with no external model download needed for the 3D instruments.
