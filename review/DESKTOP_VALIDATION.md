# Desktop validation — 21 September 2026

The desktop update was validated in the staged project before applying the same verified files to `D:\PP`.

| Check | Result |
| --- | --- |
| `npm test` | 511 tests passed across 28 files |
| `npm run test:studio` | 17 Chromium browser tests passed, with no retries |
| `npm run build` | Production build passed |
| Desktop visual review | Seven screenshots captured at 1536 × 960; no application page errors during capture |

Browser coverage includes piece selection, completed results and saved history, audible piano fallback and guitar output, guitar exercises and chords, repeated instrument and renderer switching, WebGL recovery, theme persistence during active practice, separate live accuracy and completion, Free Play without recorded results, favorites and resume, handedness, setup focus management, and Focus view.

The optional piano sample service was unavailable during testing; the tests verified the existing offline Web Audio synthesizer fallback. The production build reports large chunks for the audio, Three.js and notation dependencies. A successful build is not a performance certification.

## Desktop screenshots

- [Piano, light](desktop/piano-light.png)
- [3D piano, light](desktop/piano-3d-light.png)
- [3D piano, dark](desktop/piano-3d-dark.png)
- [3D guitar, light](desktop/guitar-3d-light.png)
- [3D guitar, dark](desktop/guitar-3d-dark.png)
- [Guitar Free Play](desktop/guitar-free-play.png)
- [Instrument setup](desktop/setup.png)

Mobile redesign was excluded as requested. Physical MIDI hardware, microphone recognition, cross-browser audio behavior and long-duration hardware performance were not validated by these Chromium checks. No microphone recognition feature is implemented.
