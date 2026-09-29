# Practice Deck

Practice Deck is a browser-based piano, guitar, violin and cello practice studio. Play on the screen, use computer keys for piano, or connect a MIDI controller. Follow falling notes, learn short guided phrases, and keep your progress in your browser.

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

1. Choose Piano, Guitar, Violin or Cello on the welcome page.
2. Select **Try piano**, **Try guitar**, **Try violin** or **Try cello** to play a short guided phrase.
3. Click **Enable sound** when the browser asks you to start audio.
4. Use the on-screen instrument, computer keyboard for piano, or a MIDI controller.
5. Return to the learning home to continue your saved lesson, explore pieces, or download a progress backup.

Your results and settings stay in the current browser. There is no account or cloud sync, so download a backup from the learning home if you want to protect or move your progress.

## What works

- Piano: on-screen keys, computer keyboard, and Web MIDI input.
- Guitar: on-screen fretboard, chord shapes, strum controls, and MIDI note input. The 3D view shows the headstock and acoustic body; the 2D trainer is a rosewood fretboard with true fret spacing.
- Violin and cello: a drawn fingerboard with finger tapes. Press and hold a place to bow it, drag along a string to slide, or bow near the bridge for an open string (keyboard: arrows, then hold Enter or Space). Six first-position lessons each, a finger chart in Learn mode, and a scale explorer in Free play.
- Light and dark themes, guided lessons, practice feedback, favourites, and local backups.
- Three-dimensional piano and guitar views with a simpler 2D trainer option.

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
src/styles/          Stylesheets, loaded in order from src/main.jsx
```

Run a focused suite with `npm run test:studio`, or `npx playwright test --config e2e/config/guitar.config.js`.

## Privacy

Practice history is stored locally in your browser. Shared lesson links contain only the selected instrument and lesson identifier; they do not include your scores or practice history.
