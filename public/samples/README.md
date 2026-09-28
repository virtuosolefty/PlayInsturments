# Using your own piano samples

You asked for the sound to come from a studio instrument collection. One honest
constraint up front: **a browser cannot load a VST/AU plugin.** Plugins are
native code that expects a host process (Ableton, Logic, Reaper…) and there is
no web sandbox that can run them. What a browser *can* do is play the same
multisampled recordings the plugin ships with — which is where the actual piano
sound lives anyway.

So the app looks for a sample pack here first, and only falls back to the CDN
grand piano or the built-in synth if it doesn't find one.

## Layout

Drop your samples in this folder and add a `manifest.json` next to them:

```
public/samples/
  manifest.json
  C1.mp3  Ds1.mp3  Fs1.mp3  A1.mp3
  C2.mp3  Ds2.mp3  Fs2.mp3  A2.mp3
  …
```

```json
{
  "name": "My Studio Grand",
  "baseUrl": "/samples/",
  "release": 1.2,
  "attack": 0,
  "samples": {
    "C1":  "C1.mp3",
    "D#1": "Ds1.mp3",
    "F#1": "Fs1.mp3",
    "A1":  "A1.mp3",
    "C2":  "C2.mp3",
    "D#2": "Ds2.mp3",
    "F#2": "Fs2.mp3",
    "A2":  "A2.mp3",
    "C3":  "C3.mp3",
    "C4":  "C4.mp3",
    "C5":  "C5.mp3",
    "C6":  "C6.mp3",
    "C7":  "C7.mp3"
  }
}
```

The keys are the pitches your files actually record; anything in between is
pitch-shifted from the nearest one. Every three or four semitones is plenty —
one sample per octave already sounds good, and every extra sample costs load
time.

Notes on getting samples out of a commercial library:

- `.wav`, `.mp3` and `.ogg` all work. WAV is best quality, MP3 loads fastest.
- Many libraries ship plain WAVs inside their content folders; those can be
  copied here directly.
- SFZ packs are the easiest to convert: the `<region>` definitions already tell
  you which file maps to which key.
- Encrypted/proprietary container formats (Kontakt `.nki`, most flagship
  libraries) can't be read by anything except their own player. For those, bounce
  a chromatic scale of single notes out of your DAW — one note per octave, a few
  seconds each, released naturally — and use those files here.
- Check your library's licence before redistributing anything; using samples
  locally for your own practice is a different matter from shipping them.

## Fallback order

1. `public/samples/manifest.json` — this folder, if present
2. Salamander Grand Piano (sampled acoustic grand, loaded from CDN)
3. Web Audio synthesis — no downloads, works offline, sounds synthetic

The active instrument is shown as a chip in the top-right of the app, so you can
always tell which one you got.
