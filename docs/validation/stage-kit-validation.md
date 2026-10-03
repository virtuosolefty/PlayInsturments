# String instrument looks and the 3D stage kit — 2 October 2026

The plan this belongs to is [STRINGS_3D_PLAN.md](../design/strings-3d-plan.md). This note covers what is built so far: the redrawn instruments and Phase 0.

## Delivered

- **Violin and cello drawing.** Purfling, varnish sheen, shaped f-holes, a shaded scroll and pegs, bridge and tailpiece with shadows, wound strings with a glint and a silk wrap. The cello has a deeper varnish, a larger scroll and larger f-holes. Touch zones and audio are unchanged.
- **Guitar headstock and top.** Rosewood veneer with binding, a pearl inlay and a truss-rod cover in place of a flat black shape; warmer fretboard and neck; a stronger burst.
- **Stage kit.** `GuitarStage.jsx` is split into `src/lib/stage/` (studio, environment, framing, quality, pacing) and `guitarNeck.js`, `guitarRig.js`, `guitarStageView.js`.
- **Two detail levels.** Full adds a studio for frets, strings and lacquer to reflect. Light is the stage as it was. Auto picks by renderer. The control is under Instrument settings → 3D detail.
- **Drawing on demand.** The stage draws only when a marker, a string or the framing changes, and lowers its resolution a step at a time when frames arrive late.
- **Failure handling.** If the reflections cannot be built the stage drops to light. If the stage cannot be built it falls back to the 2D trainer and leaves nothing behind.
- **Welcome page.** The React warning about `fetchPriority` is gone.
- **Model preparation, started.** `scripts/models/` reads and writes glTF and splits a mesh into its disconnected parts, using only libraries already installed.

## Checks

- `npm test`: 698 tests pass across 46 files. There were 601 before; 68 new ones cover the stage modules and the code-built guitar, 29 cover the model tools.
- The code-built guitar is pinned by a test to the positions, sizes and materials the old `GuitarStage.jsx` used, written out as literals.
- Browser specs, in headless Chromium (software-rendered):

  | Spec | Result |
  | --- | --- |
  | 00 smoke | 3 of 3 |
  | 06 studio guitar | 3 of 4. The failure expects the text "Guitar · synthesized"; the app shows "Sound ready". It fails the same way on the backup taken before this work. |
  | 07 desktop studio | 6 of 6 |
  | 08 instrument interactions | 7 of 7 on most runs. "The first quick piano tap" fails about one run in twelve, on the backup as well. |
  | 10 guitar polish | 3 of 3 |
  | 12 beginner learning | 9 of 9 |
  | 13 discovery and retention | 12 of 12 |
  | 14 bowed strings | 5 of 5 |
  | 15 stage quality (new) | 4 of 4 |

- Three tests that timed out at 45 seconds before this work now pass: the context-loss test in 06, the desktop-heights test in 08 and the layout test in 10. Under software rendering the stage used to redraw at about 4 frames a second without pause; it now draws only on change, and those specs run about four times faster.
- Measured on an Intel UHD integrated GPU, full tier, Free play, while re-plucking a string:

  | Pixel density | Result |
  | --- | --- |
  | 1× | 60 fps, no late frames |
  | 1.5× | 60 fps, no late frames |
  | 2× | Starts at 46 fps, settles at 1.5× resolution within a few seconds, then 60 fps with no late frames |

  Idle, the stage draws nothing.
- Both failure paths were simulated in a browser: a renderer that cannot be created, and reflections that cannot be built.
- Context-loss recovery checked on the real GPU and by spec 06.
- An independent code review found no critical or high issues. Both medium findings are fixed (the failure path, and the test pinning the guitar). Of the low findings, one is deferred: the stage is still rebuilt when only the visible fret range changes.
- Light and dark themes inspected for the guitar in both tiers, the violin and the cello.

Screenshots: [guitar, full tier](stage-kit/guitar-full-lesson.png), [guitar, Free play](stage-kit/guitar-full-free-play.png), [guitar, light tier](stage-kit/guitar-light-lesson.png), [guitar before](stage-kit/guitar-before.png), [violin while bowing](stage-kit/violin-bowing.png), [violin before](stage-kit/violin-before.png), [cello](stage-kit/cello.png), [cello before](stage-kit/cello-before.png).

## Limits

- Specs 01 to 05, 09 and 11 were not run. They cover piano flows, data integrity and imports, which this work does not touch.
- Real-GPU checks were on one machine and one browser engine. No discrete GPU, phone, Firefox or Safari was tested.
- The full tier's lighting was tuned against the code-built guitar and will need another pass once the downloaded models are in.
- The downloaded models are not integrated. The three files have to be downloaded from Sketchfab by the project owner first.
- The welcome-page preview images still show the older drawings.

## Revision 5: camera views and tone mapping

The UI concepts chosen from the realism study were G3, V3 and C3 for lessons and G1, V1 and C1 for free play. What of them can be built before the models arrive is built for the guitar.

### Delivered

- **Lesson view (G3).** A fixed 22° lens instead of 32°: the neck runs straight across the stage, and the frets splay less toward the headstock.
- **Free-play turning (G1).** Drag the background to turn the guitar up to 25° either way and 10° to 12° up or down. A double-click or the Reset view button eases it back; with reduced motion it jumps. A drag that starts on the neck plays the note there, and a press that moves less than 4 px stays a click. Lessons cannot be turned, and going back to a lesson straightens a turned guitar.
- **Limits fitted to the stage.** The limits shrink, evenly, until every corner of the playable surface stays between the stage's top and bottom bars at every extreme. Measured with the stage's real bars: the full neck keeps 100% of the range at 1440×900 and 91% at 1280×720; first position keeps 61% and 41%, because the short neck is framed from close by. A phone's 165 px stage leaves no room, so turning and its hint are switched off there.
- **Reset view and the keyboard.** Pressed from the keyboard, the button stays put and greyed once the view is back, so focus is not dropped; it goes when focus moves on. A pointer click lets it go at once.
- **Tone mapping.** Khronos PBR Neutral instead of ACES, after comparing both in each theme on the full tier: ACES greyed the spruce and paled the copper root markers.
- **Touch.** Only the free-play stage takes over one-finger drags, and pinch zoom still works there; a lesson page still scrolls when swiped over the stage.

### Checks

- `npm test`: 740 tests pass across 48 files, 42 of them new: `turntable.js` (orbit, drag, ease, fitting, pointer handling), `views.js`, the on-screen projection in `framing.js`, and the playable-surface corners in `guitarNeck.js`.
- Browser specs, headless Chromium (software-rendered): 16 stage views (new) 6 of 6; 15 stage quality 4 of 4; 10 guitar polish 3 of 3; 07 desktop studio 6 of 6; 08 instrument interactions 7 of 7; 14 bowed strings 5 of 5; 00 smoke, 12 beginner learning and 13 discovery 24 of 24; 06 studio guitar 3 of 4, the same "Guitar · synthesized" failure as before.
- The first-position test in spec 16 was run once with the fitting switched off: it failed, the fifth fret's label rising under the top bar, so it does guard the fitting.
- Intel UHD integrated GPU, full tier, Free play, while dragging the guitar continuously: 60 fps with no late frames at 1×, 1.5× and 2× pixel density. A turn moves only the camera: no canvas resize, no shadow redraw, and at most one re-aim per frame however often the pointer reports.
- An independent code review found no critical or high issues. All three medium findings are fixed: the hint crowding a phone stage once Reset view appeared, a spec that could not catch a stray note, and keyboard focus dropped by Reset view. Of the five low ones, four are fixed (drag threshold and turned-state test, limits that let a first-position neck leave the stage, missing tests, pinch zoom) and the fifth is a guard: the camera framing now rejects the old `frame(span, flip)` call instead of silently losing left-handed mirroring.
- Found afterwards in the app's browser pane: a press the browser will not capture (there, a synthetic test event) made the turntable throw. Capture failing is now harmless, with a test.

Screenshots, real GPU: lesson [dark 1440×900](concept-views/after-lesson-dark-1440x900.png), [light 1280×720](concept-views/after-lesson-light-1280x720.png); free play [dark](concept-views/after-free-dark-1440x900.png), [turned, dark](concept-views/after-free-turned-dark-1440x900.png), [turned, light](concept-views/after-free-turned-light-1440x900.png), [phone](concept-views/after-free-dark-390x844.png); before: [lesson](concept-views/before-lesson-dark-1440x900.png), [free play](concept-views/before-free-dark-1440x900.png). The rest are in [concept-views](concept-views).

### Limits

- G1's three-quarter starting pose, and all of V3, V1, C3 and C1, wait for the downloaded models. The code-built guitar has almost no depth below its top surface, so it only holds up when seen from above, which is why free play turns it from the old overhead pose.
- In lessons at 1280×720 the legend still covers the lowest tuners, as before; Phase 1 reframes the lesson view around the model.
- Found while checking, and the same on the source from before this work: at 820×1180 the free-play stage was 1115 px wide inside the window and clipped, and at phone and tablet widths it was only 165 px tall, with the top bar and string names crowding the neck. Fixed on 3 October; see [NARROW_LAYOUT_VALIDATION.md](narrow-layout-validation.md).
