# Credits

## 3D instruments

The 3D instruments are free models from Sketchfab, used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. The licence asks that each author is credited and that changes are noted. The same credits appear in the app under **Help**.

| Instrument | Model | Author | Licence | Changes |
| --- | --- | --- | --- | --- |
| Guitar | ["Guitar"](https://sketchfab.com/3d-models/guitar-f8ccd75e8c2648ffbbc9e6208ed919c1) | [Ya](https://sketchfab.com/Yarik16) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Violin | ["Violin"](https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046) | [Voldepreuss](https://sketchfab.com/Voldepreuss) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Cello | ["Cello"](https://sketchfab.com/3d-models/cello-ece053225f3a42f1939528b9c9014775) | [VM-Models](https://sketchfab.com/vm-models) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |

### In the whole-instrument view

In free play, **Whole instrument** can also show these. The first three are played there: their strings move and their bows play. The two drum kits answer to being hit: each drum lights and moves, and they keep their own heads and stands.

One model serves a second purpose: the bass guitar is also what the **Bass** is played on.

| Shown with | Model | Author | Licence | Changes |
| --- | --- | --- | --- | --- |
| Guitar | ["Percussion bass guitar"](https://sketchfab.com/3d-models/percussion-bass-guitar-d1f04fc920b8425a9a78b057b532dd89) | [Kanade_Tatibana](https://sketchfab.com/Kanade_Tatibana) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Violin | ["Electric Violin"](https://sketchfab.com/3d-models/electric-violin-71813d2dc6414a0c93b1523d329aba23) | [Belzar Sirus](https://sketchfab.com/belzar.sirus) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Cello | ["Cello"](https://sketchfab.com/3d-models/cello-a1e5e2a37d6a42299dcd5cec06cd1ddc) | [slidon](https://sketchfab.com/slidon) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Drums | ["Drum Kit"](https://sketchfab.com/3d-models/drum-kit-898f2f4ba1704abe9c784066e2b0f751) | [art.katja](https://sketchfab.com/art.katja) | CC BY 4.0 | Each drum made a part of its own, scaled and re-encoded for Practice Deck. |
| Drums | ["Electronic Drum Set"](https://sketchfab.com/3d-models/electronic-drum-set-51b95e62da844b95b6ca871c23b6e858) | [SINNIK](https://sketchfab.com/sinnik) | CC BY 4.0 | Its trailing cable left out, each drum made a part of its own, scaled and re-encoded for Practice Deck. |

The drum kit that is played is built in code and has no model to credit.

"Re-encoded" means the textures were resized and saved as WebP and the model was turned and scaled into the stage's units by `scripts/models/prepare.mjs`; on the six whose strings the stage draws, the parts were also split and renamed. On the two drum kits, the pieces of each drum were gathered into a part of its own, so that it can move and light when it is hit. The second cello was written with an older kind of material, which was converted to the kind the stage draws: its colours and pictures are kept, its gloss is approximated. The originals are not stored in this repository: `models-src/` is ignored. Each prepared file in `public/models/` also carries its credit line in its glTF `asset.copyright` field.

The credit list lives in `src/lib/modelCredits.js`. The Help dialog and the preparation script both read it.
