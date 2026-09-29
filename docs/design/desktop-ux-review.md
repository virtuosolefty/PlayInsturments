# Desktop practice workflow update

Implemented September 27, 2026. Scope: the existing piano and guitar application, preserving its Three.js instruments, practice engine, audio routing, and saved preferences.

## Changes

- Sound output testing is separate from input verification. A test tone cannot claim a controller is working or enter the scoring pipeline. Output tests follow the selected internal or external instrument. Only hardware MIDI input verifies a controller; verification resets when the selected device changes.
- A visible **No sound?** action opens setup and troubleshooting. Audio routing and calibration remain available there.
- **Learn / Free play** makes the workspace distinct from Listen / Practice / Wait for me. The duplicate Preview transport button is replaced by contextual **Hear the phrase** guidance, while **Your turn** remains available during listening.
- Range, labels, touch, key height and appearance live in **Instrument settings**. Learning preferences remain in **Practice settings**. Both support Escape, focus containment, and returning focus to the opener.
- The wider desktop library puts search first, then compact filters, Continue and Today’s plan. Composer browsing is folded. Progress has a direct navigation action; the library has an explicit close button.
- Passage loops show their bar range, draggable boundaries, keyboard controls, restart-position and clear actions. Boundaries snap to bars and cannot cross. Loop creation clamps count-in and end-of-piece positions to valid bars. Guitar's duplicate overview appears when editing a loop.
- The idle sidebar leads with the current learning objective and useful actions. Repeated metadata lives in Piece details. A paused run no longer displays a LIVE badge.
- Reports promote the next recommendation and use explicit action labels such as **Practice bars 3–4** or **Play at 75%**. Existing performance replay is retained and explained.
- Searchable shortcut help, larger desktop controls and body copy, calmer borders, and consistent light/dark colors complete the presentation update.

## Design references from the preceding review

- [flowkey](https://www.flowkey.com/en): clear purposes for listening, waiting, slowing down, and looping.
- [Melodics Practice Mode](https://support.melodics.com/en/articles/6777027-practice-mode): passage boundaries and focused repetition.
- [Soundslice looping](https://www.soundslice.com/help/en/player/basic/4/looping/): direct manipulation of a passage on the music timeline.
- [Jakob Nielsen: progressive disclosure](https://jakobnielsenphd.substack.com/p/progressive-disclosure): keep frequent actions visible and put specialized settings in named panels.
- [Learning Percussion: creative practice](https://learningpercussion.substack.com/p/7-tips-for-creative-practice): purposeful sessions and reviewing your playing.
- [Reddit piano practice discussion](https://www.reddit.com/r/pianolearning/comments/1pvmjul/added_looping_to_my_free_piano_practice_app/): qualitative feedback on simple loop controls and keyboard operation. Individual anecdotes, not representative research.

## Verification

- 545 unit tests passed, including loop-boundary edge cases and existing scoring, audio routing, storage, and instrument logic.
- 24 browser scenarios passed across the regression run and targeted reruns: piano and guitar audio output, scoring, 2D/3D pointer input, strum direction, sustain/blur release, theme persistence, context-loss fallback, favorites, focus mode, controller verification, external output tests, loop dragging/keyboard adjustment, and library/help navigation.
- Desktop visual checks cover 1280×720, 1440×900, and 1920×1080, with light and dark themes. Mobile redesign is outside this update.
- Production build succeeds. Existing bundle-size warnings remain; no bundle optimization is claimed.

Audio checks measure the application's output signal. They do not verify a user's speakers or physical MIDI hardware; controller tests use a simulated Web MIDI device.
