# Tablets, phones and small laptops — 3 October 2026

Started as "the guitar's free-play stage is cramped on tablets and phones". The cause turned out to be wider than the stage, so the fix is too.

## What was wrong

Measured with Playwright on the dev server, before the change:

| Width | Problem |
| --- | --- |
| 701–900px (tablet) | The top bar did not wrap and needed about 1156px. The studio's grid had no column size, so its one column grew to about 1117px to fit the bar, and every pane below was cut off on the right: the instrument picker, the lesson transport, the stage at fret 11. |
| 901–1099px (small laptop) | Same cause, smaller: at 1024px the top bar ran 59px past the window (182px at 901px), cutting off the theme switch and the right-hand column. |
| 900px and below | Free play's stage was a fixed 165px strip, with about 650px of empty space under it on a tablet. |
| 900px and below | The chord explorer (guitar) and scale explorer (violin, cello) sit in the side column, which at this width is a slide-over. Free play has no button to open it, so they could not be reached. |
| Phone | On the 165px stage the chord name, subtitle and open-string buttons wrapped onto the neck; the six string names were about 6px apart and drawn over each other; fret numbers 8 to 12 overlapped. |

## What changed

- **The studio never grows past the window.** `.app` has one `minmax(0, 1fr)` column (`styles.css`).
- **The top bar takes a second line up to 900px** instead of one line that does not fit (`polish.css`).
- **901–1099px: the top bar fits on one line.** The brand's name and "No sound?" (which opens the same setup as Instrument setup beside it) are hidden, the gaps tighten, and the sound strip may shrink. Its flex basis stays 256px, so its width depends on the space left and not on its label: switching sound on still moves nothing (`practice-ux.css`).
- **The studio header keeps its title readable up to 1099px.** Where the title would get less than 160px beside the learn, instrument and focus buttons, the buttons move to a line of their own (`practice-ux.css`).
- **Free play on tablets and phones:** the stage takes `clamp(200px, min(58vw, 45dvh), 480px)` of height (476px on an 820px tablet, 226px on a 390px phone, 200px on a phone held sideways), and the chord or scale explorer appears under it instead of in the hidden slide-over (`guitar.css`, `App.jsx`). Up-and-down swipes on the stage scroll; sideways drags turn the guitar (`strings.css`).
- **Phones:** the stage's top bar keeps to the chord name and compact open-string buttons; the explorers read in one column instead of three (the third was 54px wide); string names get a halo in the page colour where they overlap the headstock (`guitar.css`).
- **Phones held sideways:** the top bar keeps to one scrolling line, faded at its right edge, and the header drops its eyebrow and description, so the workspace keeps 120px instead of 14px (`polish.css`).
- **Labels that cannot all fit give way** (`guitarStageView.js`). String names are spread apart, in order and centred on the strings, when the strings are closer at the nut than the names are tall, and kept between the stage's top bar and legend. Fret numbers that would overlap are dropped, keeping 1, 12, 5, 7, 3 and 9 first. On a roomy stage both leave every label exactly where it was. A stored text size that is not a number falls back to the standard size.

Lessons keep their 165px stage on tablets and phones; on a tablet they now fit the window too.

## Checks

- `npm test`: 756 tests pass across 48 files; 16 are new for the label spreading, thinning and fitting.
- New browser spec `17-narrow-studio` (11 tests): tablet free play fits the window, has a stage of 260px or more, and the chord explorer under it plays a strummed chord; a tablet lesson fits and keeps its 165px stage; the violin scale explorer shows under its stage; on a phone the string names and fret numbers do not overlap, the stage's top bar stays on the stage and above the string names, and the explorer can be scrolled to, used, and is one column; on a phone held sideways the top bar is one line, the stage fits the screen and the header's buttons stay clickable; at 901, 960 and 1024px the top bar fits and switching sound on does not move it; at 901px it still fits with a drill's back button; from 701 to 1024px the header title stays at least 150px wide with the buttons clear of it. The first eight fail on the source from before this change; the last three cover failures a code review measured in the first version of this fix.
- Other specs: 10, 15 and 16 pass; 00, 06, 07, 08, 11, 12, 13 and 14 pass except 06 "Guitar · synthesized"; 01's first test and six tests in 02, 03 and 04 (IndexedDB backup, settings across a reload) fail, and fail the same way on the source from before this change, so they are older problems.
- Whole-page screenshots at 1280×720 and 1440×900, lesson and free play in both themes, plus piano and violin: pixel-identical before and after. At 1024×768 they differ, as intended: the right-hand column was cut off before, and the header's buttons now sit under the title.
- An independent code review of the first version found one high issue (the header title squeezed to 1px at 901px and 23px at 701px, its text running under the buttons) and two medium ones (on phones the stage was sized by width only, did not scroll under a swipe, and ran taller than a sideways screen; the top bar had 4px to spare at 901px with a controller connected, and overflowed with a drill's back button). All three are fixed, along with three of its low findings (a `gap` that cancelled a `row-gap`, string names overlapping the legend in a phone lesson, a NaN gap from a corrupt text size) and its notes on the tests.

Screenshots: tablet free play [before](narrow-layout/before-tablet-free-dark-820x1180.png), [after, dark](narrow-layout/after-tablet-free-dark-820x1180.png), [after, light](narrow-layout/after-tablet-free-light-820x1180.png); tablet lesson [before](narrow-layout/before-tablet-learn-dark-820x1180.png), [after](narrow-layout/after-tablet-learn-dark-820x1180.png); phone [before](narrow-layout/before-phone-free-dark-390x844.png), [stage after, dark](narrow-layout/after-phone-stage-dark-390x844.png), [stage after, light](narrow-layout/after-phone-stage-light-390x844.png), [explorer after](narrow-layout/after-phone-explorer-dark-390x844.png); [phone held sideways, after](narrow-layout/after-landscape-free-dark-844x390.png); 1024px [before](narrow-layout/before-laptop-free-light-1024x768.png), [after](narrow-layout/after-laptop-free-light-1024x768.png).

## Limits

- On a phone the studio's top bar and header (title, Learn and Free play, instrument picker, Focus) still take most of the first screen: the workspace scrolls inside 288px on a 390×844 phone and 82px on a 360×640 one, as before. The stage and explorer are reached by scrolling it. Letting the whole page scroll on phones would fix this properly; it is a larger change to the studio's layout.
- On a phone the chord's open-string, muted and finger marks on the neck still overlap where the strings are 6px apart; the explorer under the stage shows the same shape clearly.
- The violin and cello drawing on a phone shows only the scroll and the first finger places. It looked the same before this change; the 3D violin and cello views (Phase 3) replace it.
- At 1024px the string names are spread slightly (the strings are about 12px apart there) and the header takes 34px more height; above 1100px nothing moves.
