# Downloaded guitar, violin and cello on the 3D stage — 3 October 2026

The plan this belongs to is [STRINGS_3D_PLAN.md](../design/strings-3d-plan.md), revision 6. This note covers Phases 1 and 3: the three Sketchfab models prepared, measured and made playable, on the full tier.

## Delivered

- **Guitar** in lessons (G3: the neck straight across) and free play (G1: the whole guitar from three-quarters, turnable, with a Close-up for playing; revision 7 below replaces the Close-up). The light tier keeps the guitar built in code, unchanged.
- **Violin and cello** in lessons (V3, C3: scroll on the left, highest string on top, tapes, numbered markers) and free play (V1: the violin from three-quarters; C1: the cello standing on its endpin). Both are turnable and have a Close-up, and the cello lies down as the camera swings in. A bow built in code rests on the sounding string and travels while it sounds. The light tier keeps the 2D fingerboard. So does any stage whose model or graphics fail.
- **Press and hold to bow** on the 3D neck, drag to slide, release to stop, as on the 2D fingerboard. The 2D fingerboard stays under the 3D stage as a keyboard-accessible panel.
- **Credits** for the three CC BY 4.0 models, in the Help dialog and in [CREDITS.md](../../CREDITS.md).
- **Model files**: guitar 2.3 MB, violin 1.9 MB, cello 1.3 MB, quantized (they were 3.5, 2.5 and 1.7 MB).

## Checks

- `npm test`: 888 tests pass across 61 files. New modules each have their own tests: model preparation (fits, quantizing, the glTF writer), model loading and its measurement check, the lacquer, both rigs, the bowed neck, bow and labels, the box framing, the pose blending, the stage bars, and the stage runner with a fake studio.
- Browser specs, headless Chromium (software rendering):

  | Spec | Result |
  | --- | --- |
  | 10 guitar polish | 3 of 3 |
  | 14 bowed strings | 5 of 5 |
  | 15 stage quality | 4 of 4 |
  | 16 stage views | 6 of 6 |
  | 17 narrow studio | 11 of 11 |
  | 18 guitar model (new) | 3 of 3 |
  | 19 bowed model (new) | 5 of 5 |
  | 06 studio guitar | 3 of 4. The known failure: it expects "Guitar · synthesized"; the app shows "Sound ready". It fails the same way on source from before this work. |
  | 08 instrument interactions | 7 of 7 |

- Measured on the Intel UHD integrated GPU, full tier, frame intervals while dragging the view in free play:

  | Instrument and view | 1× | 1.5× | 2× |
  | --- | --- | --- | --- |
  | Guitar, whole | 60 fps, no late frames | 60 fps, no late frames | 60 fps, no late frames |
  | Guitar, close-up | 60 fps, no late frames | 60 fps, no late frames | 60 fps, no late frames |
  | Violin, whole | 60 fps, no late frames | 60 fps, no late frames | 60 fps, no late frames |
  | Cello, standing | 60 fps, no late frames | 60 fps, no late frames | 60 fps, no late frames |

- Picking checked on the real GPU: in the guitar close-up, clicks on fret 4 of the G string, fret 1 of the low E and fret 12 of the A string played B3, F2 and A3, left- and right-handed. On the violin, holding the A string at the first tape played B4. Sliding to the second tape passed through C5 to C#5, and releasing stopped it.

## Code review

A review of the guitar integration found two serious problems and several smaller ones. All are fixed, and the main ones now have tests:

- The 1.5 s hold for the model was cancelled the moment the stage opened, so the drawn guitar flashed up first on the full tier. This was a regression from moving the stage loop into `stageRunner.js`.
- `frameBox` could loop for ever if the stage's bars ever covered the middle of the screen. It now falls back to the whole screen and caps its search.
- The whole-guitar framing, an iterative fit, ran on every frame of a drag or a Close-up swing (about 13 ms). It is now worked out once per stage shape (3 ms) and kept.
- Left-handed: the floor and shadow are now laid under the mirrored guitar. Reduced motion: the turn limits now follow a Close-up at once.
- A turned view no longer jumps when Close-up is pressed. A model whose measurements do not add up is refused before it replaces the drawn guitar. The stage now watches its bars, so a button appearing in one moves the framing.

A second review covered the violin and cello. It loaded the quantized models in Chromium with three's own loader and found their parts within 0.0004 units of the measurements. It found the bow clearing its neighbouring strings on all eight strings, and every resource disposed on swap and stop. It found these problems, now fixed:

- The shadow is drawn only when asked, and nothing asked when the cello stood up or lay down, so the floor kept the old silhouette. It is now redrawn on every frame of the cello's move (tested). The bow no longer casts a shadow: redrawing the shadow on every frame of a bow stroke cost more than it showed.
- The 3D violin and cello canvas now claims every touch, as the 2D fingerboard does. Otherwise a phone could cancel a held note to scroll.
- A model download now gives up after 20 seconds, so a stalled one gives way to the 2D fingerboard instead of "Preparing…" for ever (tested).
- If the studio can only start at light detail, the violin and cello now give way to the 2D fingerboard, as the light tier should.
- Open strings can be bowed near the bridge, as on the 2D fingerboard, wherever the bridge is in view (tested). Checked on the GPU: holding by the violin's bridge played the open G with the bow on the G string.
- The labels over the 3D stage are hidden from screen readers. The 2D finger buttons below say the same in full.

## Screenshots

In [models/](models), all on the real GPU at 1440 × 900 (one at phone width):

| | |
| --- | --- |
| Guitar, free play | `guitar-free-showcase-dark.png`, `guitar-free-showcase-light.png`, `guitar-free-closeup-dark.png`, `guitar-free-lefty-dark.png`, `guitar-free-phone-dark.png` |
| Guitar, lesson | `guitar-lesson-dark.png`, `guitar-lesson-light.png` |
| Violin | `violin-free-bowing-dark.png`, `violin-free-closeup-light.png`, `violin-lesson-held-dark.png` |
| Cello | `cello-free-upright-dark.png`, `cello-free-upright-light.png`, `cello-free-closeup-dark.png`, `cello-lesson-dark.png` |
| Whole page | `page-guitar-free-play.png`, `page-violin-free-play.png` (a note held, the bow on the D string), `page-violin-lesson.png`, `page-cello-free-play.png` |

## Revision 7: Learn | Whole instrument (3 October 2026, later)

What changed, as the plan's revision 7 records it:

- Free play's stage has a **Learn | Whole instrument** switch in place of Close-up, and opens on Learn. Lessons have no switch.
- The guitar built in code plays in lessons and in Learn; the downloaded guitar shows only in Whole instrument. It is fetched the first time free play opens at full detail, never for a lesson, and both guitars stay loaded. If the model cannot be loaded, the switch goes away.
- String names show number and pitch (6 E2 … 1 E4; violin 4 G3 … 1 E5; cello 4 C2 … 1 A3). A name moved off its string to make room gets a leader back to the string at the nut.
- The piano lesson's next-note card shows the computer key for the note at the chosen keyboard octave, and a progress bar; the first-note card shows the key.
- Fixed: opening the app on a lesson's first-note step crashed it ("Cannot read properties of undefined (reading 'name')"). Before the piano library loaded, a missing lesson and a missing score counted as a match, so the lesson looked ready.

Checks:

- `npm test`: 909 tests pass across 62 files. New: the runner keeping an instrument it takes off and resetting the floor for one without its own, the string column and its leaders (including left-handed and a nut behind the name), the next-note card, and when a lesson counts as ready.
- Browser specs, headless Chromium: 10, 15, 16, 17, 18 and 19 pass, 32 of 32; 08, 12, 13 and 14 pass, 33 of 33. Specs 18 and 19 now check the switch, which guitar each view shows, that a lesson does not fetch the guitar model, and the new string names.
- On the real GPU (screenshots below): both guitars in their views, violin and cello in both views, leaders on a phone in both themes, and the piano cards at keyboard octaves 0 and 1 (F4 is F at octave 0; D4 is X at octave 1).

Screenshots in [stage-views/](stage-views):

| | |
| --- | --- |
| Guitar | `guitar-learn-dark.png`, `guitar-whole-dark.png`, `guitar-learn-phone-dark.png`, `guitar-learn-phone-light.png` |
| Violin and cello | `violin-learn-dark.png`, `violin-learn-phone-dark.png`, `cello-learn-phone-light.png`, `cello-whole-dark.png` |
| Piano lesson | `piano-next-note-dark.png`, `piano-next-note-light.png`, `piano-first-note-dark.png` |

The screenshots listed earlier, under Screenshots, show revision 6: there the lesson and the close-up used the downloaded guitar.

## Known limits

- The guitar file is above the 1.5 MB target; its tuners are 49,000 triangles.
- The real proportions put the strings close together at the nut. On a phone the Learn view's targets are small; the 2D buttons stay one click away.
- In lessons the violin and cello maps reach from the scroll to just past the last visible place, so the bridge and the bow are off stage; free play shows them.
