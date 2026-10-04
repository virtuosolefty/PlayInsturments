# Strings in 3D — review and plan

Guitar, violin and cello stages · 3 October 2026 · revision 7 · Phases 0, 1 and 3 built: the three downloaded models are on stage

Revision 2 recorded three decisions (downloaded models, tab stays the lesson default with the highway as a view, no hand model) and checked every point against paid apps. Revision 3 chose the models. Revision 4 records Phase 0 as built. Revision 5 records the UI concepts chosen from the [realism study](https://claude.ai/artifact/FUJ5Rft2YbGwMGH9Ae1gJ2) and the parts of them built so far. Revision 6 records the guitar, violin and cello models on stage (Phases 1 and 3), a correction to C3, and a Close-up control that free play needed (see Chosen views). Revision 7 replaces that control with a **Learn | Whole instrument** switch, gives the two guitar views a guitar each, numbers the string names, and adds the computer key and a progress bar to the piano lesson's next-note card.

## Status

| Phase | State |
| --- | --- |
| 0 — Shared stage kit | Built and verified, including model loading, the credits (Help dialog and `CREDITS.md`) and a shared stage runner (revision 6). |
| 1 — Guitar model | Built. Full tier, in free play's Whole instrument view; lessons, free play's Learn view and the light tier use the guitar built in code (revision 7). |
| 3 — Violin and cello | Built. Full tier only; the light tier keeps the 2D fingerboard. |
| 2, 4, 5 | Not started. |

## Built in revision 7

- **Learn | Whole instrument.** In free play the stage's bottom bar has a two-way switch in place of the Close-up button. Learn is the playable fingerboard view, the one lessons use, and free play now opens on it. Whole instrument shows the whole model, turnable, without labels. Lessons have no switch. (`src/components/StageViewSwitch.jsx`.)
- **A guitar per view.** Learn uses the guitar built in code, whose strings sit wider apart at the nut and are easier to hit; Whole instrument uses the downloaded model, which only it can show. The model is fetched the first time free play opens at full detail, not for lessons, and both guitars stay loaded, so switching is immediate. If the model cannot be loaded the switch goes away and Learn stays. The violin and the cello have one model each, used in both views. (`guitarViews` in `GuitarStage.jsx`; the runner's `show()` keeps the instrument it takes off; `studio.resetGround()` gives the drawn guitar back the floor the studio was built with.)
- **Numbered string names.** Each string name shows its number and its pitch with the octave: 6 E2 to 1 E4 on the guitar, 4 G3 to 1 E5 on the violin, 4 C2 to 1 A3 on the cello. Where strings are too close at the nut for the names to sit level with them, as on a phone, the names are moved apart and a thin leader ties each one back to its string at the nut. (`stringColumn` in `guitarStageView.js`, `src/components/StageLabels.jsx`.)
- **Piano next-note card.** The lesson's Find the notes card shows the computer key that plays the next note at the chosen keyboard octave, and a bar for the share of the phrase found; the first-note card shows the key too. Touch screens leave the key out. (`src/components/NextNoteCard.jsx`.)
- **Fix.** Opening the app on a lesson's first-note step crashed it ("Cannot read properties of undefined (reading 'name')"): before the piano library had loaded, a missing lesson and a missing score counted as a match, so the lesson looked ready. `lessonReady` in `src/lib/learning.js` now needs the lesson.

## Built in revision 6

- **Models.** `scripts/models/prepare.mjs` turns each Sketchfab download into `public/models/<name>.glb` plus a JSON of measurements. It splits parts, measures each string's ends at the nut and bridge, and drops the stretch between, which the stage draws so it can vibrate and be played. It keeps the strings' ends past the nut and bridge, so they still reach the tuners and the tailpiece. It scales every model to 24.1 units of string, re-encodes textures as WebP and quantizes the vertices (`KHR_mesh_quantization`). Sizes: guitar 2.3 MB (1.6 MB gzipped), violin 1.9 MB, cello 1.3 MB. The guitar is still above the 1.5 MB target; its tuners alone are 49,000 triangles, and simplifying them needs a mesh simplifier we do not have yet.
- **The guitar's frets land on the model's own.** The nut and scale come from a least-squares fit to the model's 20 frets; the worst fret is 0.013 units off (`fretFitWorst` in `guitar.json`).
- **Guitar** (`src/lib/guitarModelRig.js`): our strings at a light acoustic gauge, click targets and markers placed along each measured string, pearl inlays laid on the fretboard by ray casting down onto it, and a clear coat on the body and a satin one on the neck.
- **Violin and cello** (`src/lib/bowedRig.js`, `bowedNeck.js`, `bowedBow.js`, `bowedStageView.js`, `src/components/BowedStage3D.jsx`): strings, a press target and a numbered marker at every finger place, tapes that follow the fingerboard's curve, and a bow built in code. The bow rests on the sounding string near the bridge, tipped to clear the others, and travels down and up while the note sounds. Press and hold bows, dragging slides, and releasing stops, as on the 2D fingerboard; holding a string near the bridge bows it open. The 2D fingerboard stays under the 3D stage in a "Show finger buttons · keyboard accessible" panel, and takes over if the model or the graphics fail.
- **Stage runner** (`src/lib/stage/stageRunner.js`): framing, turning, the Close-up swing, swapping a model in, holding the first frame up to 1.5 s for it, and drawing on demand. Both stages run on it; each keeps only its own markers, labels and pointer handling.
- **Framing** (`src/lib/stage/framing.js`): `frameBox` stands the camera to show a whole model from a given direction, inside the band the stage's bars leave, centred on what it shows; `blendPoses` swings the camera between views around what it looks at.
- **Checks:** unit tests for every new module, including the runner with a fake studio. Two new e2e specs: `18-guitar-model` and `19-bowed-model`. They cover the model loading, the Close-up, press-and-hold on the 3D neck, the light tier, and the fallback when a model file is missing. Measured on the Intel integrated GPU, full tier: 60 fps while dragging at 1×, 1.5× and 2× pixel density, for all three instruments, in the showcase and in the close-up.

## Chosen views

Decision, 2 October 2026: lessons use the fingerboard maps **G3, V3 and C3**; free play uses **G1, V1 and C1**. The other nine concepts in the study are not planned, except that the note highway (G4) is already Phase 4.

| Concept | Where | Camera | State |
| --- | --- | --- | --- |
| G3 Fretboard Focus | Guitar lessons, and free play's Learn view | Fixed in lessons. 22° lens, neck straight across the stage, nut on the left, fret numbers above the neck, string names at the left edge. | Built, on the code-built guitar in both tiers (revision 7; revision 6 used the downloaded guitar in the full tier). |
| G1 Studio Showcase | Guitar free play | 32° lens. The whole guitar from beyond the body on the treble side, the neck running up and away to the right, fitted between the stage's bars. Drag the background to turn it up to 25° either way and 10° to 12° up or down; double-click or Reset view to ease back. The **Learn | Whole instrument** switch moves between this view and the playable neck. | Built, on the downloaded guitar, at full detail. Learn shows the code-built guitar, which has only the neck view: it is a top surface with almost no depth. |
| V3 Fingerboard Map | Violin lessons | Fixed long lens, scroll on the left, E string on top, finger tapes with their numbers, numbered finger markers, press and hold to bow. | Built. Framed from the scroll to just past the last visible place, so first-position places are large enough to press; the bridge and the bow are off to the right. |
| V1 Concert Spotlight | Violin free play | Three-quarter from the treble side at 30°, turnable as G1; the bow appears on the string being played and travels while it sounds. Learn and Whole instrument as G1, on the one violin model. | Built. |
| C3 Fingerboard Map | Cello lessons | As V3, with cello finger spacing. | Built. **Corrected:** no mirroring is needed. The prepared model, shown true with its scroll on the left, has the A string on top and the C string at the bottom, as the mockup shows. Revision 5 said a true cello would have the C string on top; that was wrong. |
| C1 Upright Stage | Cello free play | The cello standing on its endpin, front three-quarter, full height, with a floor shadow and the bow across the strings. Learn lays the cello down as the camera swings in, keeping it on the floor all the way. | Built. |

Free play needed one control the study did not draw. The study flagged the problem in its watch-outs for G1 and V1: with the whole instrument in view, the places near the nut are a few pixels apart, too small to press. Revision 6 opened free play on the showcase, with a **Close-up** button in the stage's bottom bar to swing the camera in to the playable neck. Revision 7 makes it a two-way **Learn | Whole instrument** switch and opens on Learn, so free play starts where it can be played. Labels show only in Learn.

Built in revision 5:
- `src/lib/stage/views.js`: the lesson and free-play views (lens, camera height, how far each may turn).
- `src/lib/stage/turntable.js`: turning by drag within limits, easing back, and the pointer wiring; drags that start on something playable are left to it. `fitLimits` shrinks the limits until the playable surface stays between the top and bottom bars at every extreme, so a short neck, framed from close by, turns less. Each loaded model will pass its own playable surface the same way.
- `studio.aim()` moves only the camera, so a drag never resizes the canvas or redraws the shadow.
- Tone mapping is Khronos PBR Neutral instead of ACES. Side by side on the full tier, ACES greyed the spruce and paled the copper root markers; Neutral keeps them as authored.
- Checks: unit tests for both modules, and `e2e/tests/16-stage-views.spec.js` (turning, double-click and button reset, picking still works, lessons stay fixed, returning to a lesson straightens the view).

## Where we stand

Checked at 1440×900 in the dark theme, lesson and Free play, against our own piano view.

| Instrument | What it is today | What holds it back |
| --- | --- | --- |
| Guitar | A Three.js model built in code: neck, headstock, part of the body. | Lit by three plain lights with no environment, so frets, tuners and strings read as flat grey. The camera never moves. In Free play the guitar fills about half the stage. No bridge, the neck is a box, and the lower tuners are cut off by the legend in lessons. |
| Violin | A flat top-down SVG drawing. | An illustration beside a 3D guitar and a 3D piano. No perspective, no real light, almost nothing moves. |
| Cello | The violin drawing in a darker colour with larger f-holes. | Same proportions as the violin, so it does not read as a cello. |
| All three | A flat tab strip above the instrument, plus a dot or ring on the neck. | The music and the instrument are two separate panels. A correct note changes a dot's colour and nothing else. |

## Validation against paid apps

Sources are public docs, help pages, store listings and reviews. I have not used these apps hands-on, and I could not view their screens directly.

| Plan point | Verdict | Evidence | Change to the plan |
| --- | --- | --- | --- |
| Notes should travel to the fret in the same 3D scene as the neck | Confirmed | [Rocksmith](https://en.wikipedia.org/wiki/Rocksmith): coloured notes move from background to foreground along numbered fret lanes onto the fretboard. | Keep. Add the cues below. |
| The camera should follow the playing position | Confirmed | Rocksmith: the camera focuses on the frets in use and shows an ideal hand position that moves along the neck. | Keep. Add an anchor zone: a lit four-fret span showing where the hand sits. |
| Keep the flat tab as the lesson default | Confirmed | [Yousician](https://support.yousician.com/hc/en-us/articles/206932099-How-to-read-guitar-tablature), [Fender Play](https://lausd-instructor.fender.com/hc/en-us/articles/360043847032-Practice-Mode), [Gibson App](https://musictech.com/news/gear/gibson-namm-2021-gibson-app/) and [Ultimate Guitar Pro](https://help.ultimate-guitar.com/en/articles/6741560-what-do-i-get-if-i-subscribe-to-pro) all teach from a flat scrolling tab. Only Rocksmith leads with a 3D highway. | Keep as decided: tab by default, highway as a view. |
| Whole-stage feedback on hit and miss | Confirmed | [Yousician](https://www.stuff.tv/?p=354110) reddens the screen and dulls the audio on a miss. Fender Play overlays where you played well or badly on the tab. [Trala](https://violinlounge.com/?p=4200) stops you and says higher or lower. | Keep. Our tab already colours hit and missed notes, so no change there. |
| Realistic materials and lighting matter | Confirmed | [Rocksmith+ art diary](https://www.ubisoft.com/en-gb/game/rocksmith/plus/news-updates/jRUcL6HEPsWB07OFwIg5F/rocksmith-dev-diary-july-2022-art-design): dynamic lighting, a custom pearloid shader, head and neck as the visual focus. | Keep. Downloaded models raise the starting point. |
| Inspect mode: drag to turn the instrument | Confirmed | [Guitar 3D](https://apps.apple.com/us/app/-/id1611157050) ($44.99 a year) offers a spinning, zooming camera plus first-person and split views. [iPlayMusic](https://iplaymusic.com/strings/online-virtual-violin/) rotates the violin while you play. | Keep. Add view presets, below. |
| Left-handed and string-order options | Confirmed | Rocksmith+ has camera angles for both hands and an inverted string mode. Guitar 3D and [Guitar Pro](https://www.guitar-pro.com/docs/gp8/display-options/instrument-views) have left-handed views. | We have left-handed. Add an option to invert string order. |
| A hand on the neck | Confirmed as Guitar 3D's main selling point | Guitar 3D is built around an animated 3D hand and finger transitions. | Dropped by decision. Fingertip pads stay. We do not compete on this. |
| "No violin app shows a 3D instrument" | **Wrong** | iPlayMusic has a free browser violin and cello with a detailed 3D model, rotate and zoom, separate bow and finger control, an Easy Bow mode and 65 recorded samples. | Corrected. A 3D violin alone is not a first. Paid violin apps ([Trala](https://apps.apple.com/app/id1143205265), [tonestro](https://apps.apple.com/us/app/tonestro-learn-to-play-music/id1365630760), [Violy](https://apps.apple.com/app/id1357516375), [Violin Vista](https://apps.apple.com/us/app/-/id6457780326)) still use sheet music and flat charts, so the opening is a 3D instrument joined to guided lessons and feedback. |
| Finger tapes on the violin fingerboard | Confirmed | [Soundslice's visual violin](https://www.soundslice.com/blog/38/introducing-the-visual-violin/) uses tapes and lights notes in time with playback. | Keep the tapes in the 3D version. |

### Points the paid apps have that the plan lacked

1. **Approach cues on the highway (Rocksmith).** The string with a note coming is highlighted, a box grows at the target fret, fret numbers ride under the notes, and sustained notes have tails. Added to Phase 4.
2. **Chord blocks (Rocksmith, Yousician).** A chord arrives as one named block, not six separate notes. Added to Phase 4.
3. **Colour with meaning, and safe for colour-blind players (Yousician).** Yousician colours notes by finger and ships protanopia, deuteranopia and tritanopia themes. We already have one colour per string. Added to Phase 2: a colour-blind-safe palette, and feedback that never relies on colour alone.
4. **Player's-eye view (Guitar 3D, Yousician).** A view from behind the neck, as the player sees their own instrument. Added to Phase 5 as presets: Audience, Player, Top.
5. **Bow behaviour (iPlayMusic).** Bow direction, speed and contact point are visible. Added to Phase 3: up-bow and down-bow travel, and a bow that sits on the string being played.
6. **Recorded sound (iPlayMusic, Guitar 3D).** Both lead with sampled instruments. Our strings use a synthesised voice. This is outside a visual plan, but a premium look with a synth voice will feel mismatched. Listed under risks.

## Target

One lit studio scene per instrument: a believable instrument on a soft floor, notes arriving along the strings, and a clear physical response when a note is played. Guitar, violin, cello and piano should look like they belong to the same product.

## Plan

Sizes are relative: S is about a day of work, M a few days, L a week or more.

### Phase 0 — Shared stage kit and asset pipeline (M)
Built:
- `GuitarStage.jsx` is split into `src/lib/stage/` (renderer, lights, floor, camera framing, label projection, disposal) plus `guitarNeck.js`, `guitarRig.js` and `guitarStageView.js`.
- Image-based lighting from a studio of our own: dim walls and four soft boxes, built in code. Three's stock `RoomEnvironment` was tried first and rejected, because a bright white room reflects as haze over every lacquered surface.
- Two quality tiers. Full adds the studio reflections and a lacquer clearcoat. Light is the stage exactly as it was. Auto picks full on a real GPU and light on software rendering; the choice is under Instrument settings → 3D detail.
- The stage draws only when something on it changes, and gives up resolution a step at a time when frames run late. Measured on an Intel integrated GPU in the full tier: 60 fps at 1×, 1.5× and 2× pixel density (the last by settling at 1.5×), and no drawing at all while idle.
- If the studio reflections cannot be built, the stage drops to the light tier. If the stage cannot be built at all, it falls back to the 2D trainer and nothing is leaked.

Built in revision 6:
- Model loading: `GLTFLoader`, imported only when a model is first wanted; one file per instrument from our own `public/models/`. The bytes are kept for the page, so a rebuilt stage parses again rather than downloading again. A missing or unreadable file, or measurements that do not add up, leave the drawn instrument in place.
- Credits: in the Help dialog and in `CREDITS.md`, from one list in `src/lib/modelCredits.js`.

Still to do:
- Keep the studio alive when only the visible fret range changes. Today the whole stage is rebuilt; with the model's bytes kept that costs a parse and a shader compile, not a download.
- Bring the guitar under 1.5 MB by simplifying its tuners.

### Phase 1 — Guitar model, materials and staging (M)
- Replace the code-built guitar with a downloaded acoustic guitar model in the full tier.
- Fit the playable neck to the model: measure nut and saddle, derive fret positions from the scale length, and add a unit test that our fret maths lands on the model's frets.
- Hide the model's baked strings and draw our own, so they can vibrate, glow and be picked.
- Camera: G1's three-quarter starting pose in free play, so the whole guitar shows and can be turned; G3's fixed map in lessons, framed to clear the legend.
- Floor with a soft contact shadow and a faint vignette.

### Phase 2 — Motion and feedback (M)
- Strings vibrate as a standing wave from the fretted point to the bridge, and deflect to the fret when pressed.
- Hit: a short glow and ring burst. Wrong: a red pulse and a cross. Early or late: amber and an arrow. Shape and colour together.
- Colour-blind-safe string palette as a setting.
- Camera eases along the neck to the playing position; a lit anchor zone marks the four-fret hand span.
- All motion off under reduced motion.

### Phase 3 — 3D violin and cello (M–L)
- Downloaded violin and cello models, each with its own proportions, plus a bow built in code.
- Views: V3 and C3 maps in lessons (C3 is not mirrored, see Chosen views); V1's spotlight and C1's upright stage in free play, both turnable like G1.
- Same fitting step as the guitar: nut, bridge, string paths, and finger tapes placed from the scale length.
- Bow rests on the sounding string, travels down-bow and up-bow, and follows bow pressure.
- Picking by raycast, as the guitar does.
- The SVG stage stays as the light tier. Its e2e specs keep running against it; the 3D stage gets its own specs and exposes the same `data-held-positions` and `data-target-positions`.

### Phase 4 — Note highway for strings (L)
- Notes travel along each string to their fret or finger place and land on the playing line, in the same scene as the instrument.
- Approach cues: highlighted string, growing box at the target, fret number under the note, sustain tails.
- Chords arrive as one named block.
- The tab strip stays the default in lessons; the highway is a view the player switches to.

### Phase 5 — Views and finish (S–M)
- Drag to turn and reset are built for free play (revision 5). The player's-eye views (G2, V2, C2 in the study) were not chosen; they stay a possible later camera toggle.
- Option to invert string order.
- Fingertip pads on the strings for chords and scale shapes. No hand model.
- Regenerate the welcome-page previews.

**Order:** 0 → 1 → 2 → 3 → 4 → 5.

## Models

Decision, 2 October 2026: the free models are good enough, so we download them and do not build our own in Blender. I viewed 20 candidates in Sketchfab's 3D viewer from fixed angles, including the close neck view our stage uses, and read each one's part list and textures through the viewer API. The project owner downloaded the three picks into `models-src/` on 3 October 2026.

| Instrument | Pick | Licence | Triangles | Textures | Why |
| --- | --- | --- | --- | --- | --- |
| Guitar | ["Guitar" by Yarik16](https://sketchfab.com/3d-models/guitar-f8ccd75e8c2648ffbbc9e6208ed919c1) | CC BY 4.0 | 132.6k | 20 at 1K, colour and roughness per part | Body, neck, frets, the two string groups, bridge, nut and tuners are already separate named parts. Crisp frets and tuners up close, a real soundhole, no brand logo. No fret-marker dots, so we add our own. |
| Violin | ["Violin" by Voldepreuss](https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046) | CC BY 4.0 | 74.9k | 4 at 2K, full PBR | Clean red varnish with grain, purfling, a carved scroll and a clean ebony fingerboard. One mesh, so the strings are split off by script. |
| Cello | ["Cello" by vm-models](https://sketchfab.com/3d-models/cello-ece053225f3a42f1939528b9c9014775) | CC BY 4.0 | 22.8k | 9 at 2K, full PBR | Real cello proportions with an endpin, glossy varnish, carved scroll and well-shaped pegs. Two meshes, so the strings are split off by script. |
| Bow | Built in code | — | — | — | The one free bow model I found is untextured flat colour. A bow is a simple shape and we need to animate it, so code is the better source. |

Rejected, with the reason:

- **Museum violin scan, CC0, 1,318 likes** ([link](https://sketchfab.com/3d-models/violin-a784af0713a643b19ffcf65194bc0fbf)): the most realistic of all at mid distance, but it is a scan of a worn antique. The scroll and pegs are lumpy up close, the fingerboard is grey and worn, and violin, strings and bow are one fused 460k-triangle mesh.
- **Violin by topfrank2013**: plank-like wood texture, old baked lighting.
- **Stradivarius violin by iodomarin** and **cello by Lordricker**: good geometry but no textures.
- **Cello by slidon**: photo textures from a real cello, authentic from afar, but blurry and stretched at the neck with a mottled grey fingerboard.
- **Vintage Cello by k4o7sprectre**: parts are separated, but the wood is a generic flat brown and the fingerboard is grey.
- **Guitar by pezcurrel**: every string is a separate part, but it carries a Yamaha logo and most materials are untextured.
- **Western guitar by Tomas_Tew**: good materials, but it carries a Lâg logo.
- **Guitars by Felipe.Lima and luckyardrianto27**: decent, but single meshes, and the second has an odd-looking soundhole.
- **Guitar by Maxscorpionz**: a nylon-string classical guitar, not a steel-string acoustic.

Preparation runs as a Node script, with no Blender: split disconnected parts, drop the model's strings, reduce triangles, resize textures to WebP, compress, and write a small JSON of measured positions (nut, bridge or saddle, each fret, each string path).

Confirmed on 3 October 2026: the violin's and the cello's strings are separate pieces of their meshes, so the script splits them off by shape, as it does the guitar's by material.

Credit lines required by CC BY 4.0 go in `CREDITS.md` and on the About page, each with the author, the link, the licence and a note that the model was modified.

## Guardrails

- **Performance:** 60 fps on an integrated GPU in the full tier, checked at 1×, 1.5× and 2× pixel density. The light tier costs no more than before, and less when idle.
- **Size:** Three.js and each model load only when that instrument opens.
- **Access:** keyboard fret and finger controls, DOM labels, text sizes, left-handed mirroring, light and dark themes and reduced motion all keep working.
- **Untouched:** practice engine, scoring, audio path, studies and saved data.
- **Checks per phase:** unit tests for geometry and model fit, the existing Playwright string specs, and before/after screenshots in both themes at 1280×720 and 1440×900.

## Risks and open items

1. **Model size.** The guitar is 2.3 MB against a 1.5 MB target (see Phase 0).
2. **Small targets in the Learn view on a phone.** The real proportions keep the strings close together at the nut; the 2D fret and finger buttons stay one click away under each 3D stage.
3. **Sound.** The strings use a synthesised voice. Competitors with 3D instruments use recorded samples. Worth a separate plan.
4. **Consistency.** Three models from three artists will differ in style. Shared lighting and a shared floor reduce this but will not remove it.
