# Studio validation

The original baseline had 492 passing unit tests and one failing library test. That test assumed MIDI filenames always matched song IDs. Reading the real manifest URLs exposed five pre-existing metadata mismatches, which were corrected against the bundled MIDI files without changing the music.

- Full unit suite: **504 passed**, including the original piano, routing, timing, parser, storage and grading coverage and new guitar mapping/audio-selection tests.
- Focused Chromium browser suite: **11 passed** with no retries. Coverage includes boot, reload, all drawer tabs, song selection, scoring, history, guitar audio, authored frets, chord controls, instrument/settings persistence, both Three.js views, repeated view switches, context-loss fallback, search and phone layout.
- Production build: **passed**. Vite still reports large chunks for the existing audio/notation/Three.js dependencies; startup optimization remains on the roadmap.
- Optional piano sample CDN requests are unavailable in this environment. Browser tests record those failures separately and verify that the app remains on its offline synthesized piano. App/runtime errors are still failures.
- Screenshots: desktop piano/guitar in 2D and 3D, plus phone layouts. Captures reported no uncaught page errors.
- No physical MIDI controller, MIDI guitar, microphone recognition, screen reader or production hosting environment was tested.

Commands:

```text
npm test
npm run test:studio
npm run build
```

The focused browser configuration uses port 5187 so it does not accidentally test another running application. The full historical E2E suite contains older expected-failure cases; the focused suite is the release check for this update.
