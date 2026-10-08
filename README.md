# Practice Deck

Practice Deck is a browser-based piano, guitar, violin, cello and drums practice studio. Play on the screen, use computer keys for piano and drums, or connect a MIDI controller. Follow falling notes, learn short guided phrases, and keep your progress in your browser.

## Use it online

Once the GitHub Pages deployment completes, open:

**https://virtuosolefty.github.io/PlayInsturments/**

No download or account is required. Sound starts after you click **Enable sound** or play an instrument control.

## Run it on your computer

You need [Node.js 20 or newer](https://nodejs.org/).

```bash
git clone https://github.com/virtuosolefty/PlayInsturments.git
cd PlayInsturments
npm install
npm run dev
```

Open the address shown in the terminal, normally `http://localhost:5173`.

To test the production version:

```bash
npm run build
npm run preview
```

## Getting started

1. Choose Piano, Guitar, Violin, Cello or Drums on the welcome page.
2. Select **Try piano**, **Try guitar**, **Try violin**, **Try cello** or **Try drums** to play a short guided phrase.
3. Click **Enable sound** when the browser asks you to start audio.
4. Use the on-screen instrument, the computer keyboard for piano and drums, or a MIDI controller.
5. Return to the learning home to continue your saved lesson, explore pieces, or download a progress backup.

Your results and settings stay in the current browser. There is no account or cloud sync, so download a backup from the learning home if you want to protect or move your progress.

## What works

- Piano: on-screen keys, computer keyboard, and Web MIDI input.
- Guitar: on-screen fretboard, chord shapes, strum controls, and MIDI note input. On the 3D stage, lessons and free play's **Learn** view show the neck straight across, with each string numbered; at full detail, **Whole instrument** shows a 3D model of an acoustic guitar that you can turn by dragging. The 2D trainer is a rosewood fretboard with true fret spacing.
- Violin and cello: on the 3D stage at full detail, 3D models with finger tapes, numbered finger markers and a bow that plays the sounding string; free play opens on **Learn**, and **Whole instrument** shows the violin at three-quarters and the cello standing on its endpin. Otherwise, a drawn fingerboard with finger tapes. Press and hold a place to bow it, drag along a string to slide, or bow near the bridge for an open string (keyboard: arrows, then hold Enter or Space). Six first-position lessons each, a finger chart in Learn mode, and a scale explorer in Free play.
- Drums: a nine-piece kit (kick, snare, closed and open hi-hat, three toms, crash and ride). Lessons scroll as lanes, one a drum, each tile showing the key that plays it. Hit the 3D kit, the on-screen pads, the computer keys (each drum is the letter it starts with: K, S, H, O, T, M, F, C, R), or a pad controller or electronic kit sending the standard General MIDI drum notes. Six lessons from finding each drum to a beat with a fill, and a free-play kit you can turn by dragging the floor. The 3D kit is built in code, so there is no model to download; the drum sounds are synthesized.
- Other instruments to look at: in free play at full detail, **Whole instrument** opens a pop-up with a picture of each instrument there is to see (a bass guitar, an electric violin, an antique cello, an acoustic and an electronic drum kit, as each is added). Choose one to see it whole and turn it; **Learn** goes back to the instrument you play.
- Light and dark themes, guided lessons, practice feedback, favourites, and local backups.
- Three-dimensional piano, guitar, violin, cello and drum kit views with a simpler 2D trainer option. **Instrument settings → 3D detail** chooses Full (the 3D models), Light (the simpler built-in guitar and 2D violin and cello) or Auto, and says which is in use.

For the best MIDI experience, use a current Chromium-based browser such as Chrome or Edge. Firefox and Safari can still use the on-screen instruments, but do not provide Web MIDI support. Microphone or acoustic-instrument recognition is not included.

## GitHub Pages

The included workflow publishes each push to `main` to GitHub Pages. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the deployment source if GitHub has not selected it automatically. The published site appears at the online link above once the workflow succeeds.

## Development checks

```bash
npm test
npm run build
npm run test:e2e
```

The application uses React, Vite, Tone.js, VexFlow, and Three.js.

## Project structure

```text
.github/workflows/   GitHub Pages deployment
docs/design/         UX reviews and design notes
docs/validation/     Validation notes and reference screenshots
e2e/                 Playwright tests (tests/, helpers/, pages/, fixtures/)
e2e/config/          Focused Playwright suites (studio, guitar, reference piano)
public/              Static files: songs, preview images, manifest
scripts/             Build, song-generation and screenshot tools
src/components/      React components
src/hooks/           React hooks
src/lib/             Instruments, audio, scoring and storage logic, with unit tests
src/lib/stage/       The 3D string stage: studio, framing, turning, model loading
src/styles/          Stylesheets, loaded in order from src/main.jsx
public/models/       The prepared 3D guitar, violin and cello (see CREDITS.md)
scripts/models/      Prepares downloaded models: node scripts/models/prepare.mjs
```

How each feature works, the code layout and the test suite are described in [docs/developer-notes.md](docs/developer-notes.md); the plan for the 3D string instruments is [docs/design/strings-3d-plan.md](docs/design/strings-3d-plan.md).

Run a focused suite with `npm run test:studio`, or `npx playwright test --config e2e/config/guitar.config.js`.

## Credits

The 3D guitar, violin and cello are free models from Sketchfab, used under the Creative Commons Attribution 4.0 licence. Their authors are credited in [CREDITS.md](CREDITS.md) and in the app under **Help**.

## Privacy

Practice history is stored locally in your browser. Shared lesson links contain only the selected instrument and lesson identifier; they do not include your scores or practice history.
