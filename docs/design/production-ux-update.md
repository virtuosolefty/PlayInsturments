# Discovery and return-visit UX update

The desktop experience now has a public introduction, a shorter first musical win, and a learning home built around what to play next. Open `/welcome/` to see the new introduction even if you have visited before. Returning visitors at `/` keep their saved workspace.

## Implemented

- Public welcome with real instrument screenshots, piano/guitar selection, explicit free exploration, light/dark themes, input compatibility, and sound/data help. The studio and audio libraries load only after entry.
- A quick introduction: make a real note, follow a phrase in Wait mode, and choose the next step. The existing six-step guided path remains available. Quick completion does not award mastery or claim timing accuracy.
- A clearer continue card with an achievable skill, score duration, short audition, and a shareable lesson link. Auditions do not emit MIDI input, alter the live score, or record practice. They stop on navigation, instrument changes, Escape, or hiding the tab; late loads are cancelled.
- Three curated collections for each instrument, with previews, prerequisites, difficulty, and persistent favourites. Exploring a library piece does not change checkpoint rules.
- One-phrase or full-sequence daily practice. A flexible 2-, 3-, or 5-day weekly goal uses the existing practice ledger. Visits, previews, and future dates never count as practice days.
- Quieter mastery explanations and an option to return to guided notes after a difficult check. Existing pass/mastery thresholds, input, timing and grading algorithms are preserved.
- Direct progress download and restore access. Restoring now reloads saved preferences and lesson state correctly. First entry still works when browser storage is blocked, with a visible save-failure status.
- Public piano, guitar and first-melody pages with readable HTML before JavaScript, descriptive metadata and sharing images. A data/compatibility page explains browser storage, backups, supported inputs, and optional sample requests.

## Validation

- 564 unit tests across 35 files passed.
- 35 distinct browser scenarios passed across studio smoke checks, instrument interactions, sound/output controls, existing guided learning, and the new discovery/return flows. A legacy smoke selector was updated to match the existing “Today’s plan” and “Settings” labels; its three smoke scenarios were rerun successfully.
- New quick-entry audio tests use normal browser autoplay restrictions, rather than the older suite's permissive autoplay flag. These check the app's output signal, not physical speakers.
- Six built public routes were checked with JavaScript disabled. Automated WCAG A/AA scans of welcome light/dark, home light/dark, and guided piano light reported no violations. This is a scoped automated check, not a claim of complete accessibility conformance.
- Production build and light/dark screenshots reviewed. Existing warnings for the larger studio, Three.js and notation chunks remain; these are deferred behind the welcome page or relevant feature.

## Public launch work that still needs a configured service

This update does not create accounts, host the project publicly, or send practice information to an analytics service. Progress backup/restore is functional; cloud sync needs an authentication/storage service and an explicit data model. Reminders need a consent-based delivery service.

For a public build, set `PUBLIC_SITE_URL` to the actual HTTPS origin before `npm run build`. The page builder then includes canonical URLs, absolute sharing images, `robots.txt`, and a sitemap. Without a configured domain, it deliberately omits canonical URLs and sitemap rather than publishing a placeholder domain. Localhost lesson links work only where that localhost instance is reachable.

Before public release, connect the chosen error/performance reporting and privacy-conscious analytics service. Measure demo starts, the first successful note, phrase completion, abandonment, sound failures and next-day/seven-day returns. Count actual practice events, not time with a tab open; establish a baseline before setting conversion targets. Test the first-phrase and return journeys with 5–8 beginners. No growth or retention lift has been measured yet.

No mobile redesign, acoustic-guitar recognition, leaderboard or subscription system was added.
