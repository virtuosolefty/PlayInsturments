# Guided beginner learning

This update connects the existing piano and guitar instruments to a guided desktop learning journey. Open **Learning path** in the top navigation. New visitors can choose **Guide me from the beginning** in the welcome dialog.

## What changed

- A learning home with a clear next lesson, instrument selection, daily practice sequence, and a roadmap showing the current stage.
- Six explicit lesson steps: Sound, First note, Listen, Follow along, Practice, and Check progress.
- A sound test with listener confirmation. Sending a test tone never generates input events or awards progress.
- An interactive first-note task with a named piano key or guitar string/fret. Incorrect input gets a specific, calm hint.
- Saved lesson, step, practice tempo, and daily-session position for each instrument. Returning never starts playback automatically.
- Small tempo increases between attempts; the assessment stays at the written tempo. Keyboard shortcuts cannot silently change a guided lesson's mode or tempo.
- Separate guided-completion and mastery messages. Existing pass, mastery, scoring, and stage-unlock thresholds are retained.
- A guitar curriculum using existing studies plus authored first-fret, Em, Am, chord-change, and first-tune lessons. Chord lessons can be played using the on-screen strum buttons or MIDI.
- Daily practice runs the existing path recommendations in sequence and ends with a completion message and the next lesson.
- A fixed lesson toolbar and a quieter coach panel, expandable result details, keyboard focus after navigation, light/dark styling, and reduced-motion support.
- Lesson loading has a retry, cancels stale requests, prepares the relevant 3D renderer, and preloads the next score without playing it.

## Progress rules

Follow along uses the existing Wait mode. Completed runs and feedback are saved, but do not pass mastery checks because timing is not measured. A completed Practice run at the written tempo needs 3 stars to pass an exercise. Every exercise in a stage needs 4 stars to open the next stage. Guided completion cannot award stars or change these thresholds.

Piano retains its five-stage curriculum and recital rewards. Guitar has four stages: open strings, first notes, two chords, and a first tune. Notes, chords, sound, grading, and history all use the existing shared engine. No microphone recognition was added; guitar input is on-screen or MIDI.

The daily run goal remains a count of completed runs. Completing the guided daily sequence is shown separately; it is not presented as a new mastery award or a minutes-based goal.

## Validation

Verified on September 27, 2026: 558 unit tests passed, 33 distinct browser scenarios passed, and the production build completed. The browser run includes 32 main regression scenarios plus the narrow desktop preview check; the short-desktop scenario was rerun after that final layout fix.

The test suite covers sound confirmation, first-note input, separate instrument progress, no autoplay after reload, complete guided phrases, truthful mastery gates, chord scoring, daily completion, loading failure/retry, themes, reduced motion, and short desktop layouts. Existing checks cover free play, MIDI, sustain, gliding, picking, strumming, loops, setup, and 3D fallback.

The lesson guide remains reachable when the desktop app's preview pane is narrower than 900 pixels. This reuses the existing slide-over panel rather than adding a mobile redesign.

Mobile redesign and acoustic-guitar pitch recognition remain outside this update. The production build retains the existing large-chunk warnings for the music/3D libraries.

## Design references

- [flowkey](https://www.flowkey.com/en): separate demonstration, guided learning, and practice steps.
- [Melodics Practice Mode](https://support.melodics.com/en/articles/6777027-practice-mode): wait mode and gradual tempo progression.
- [Soundslice looping](https://www.soundslice.com/help/en/player/basic/4/looping/): focus on a manageable phrase with less competing interface detail.
