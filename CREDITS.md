# Credits

## 3D instruments

The guitar, violin and cello on the 3D stage are free models from Sketchfab, used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. The licence asks that each author is credited and that changes are noted. The same credits appear in the app under **Help**.

| Instrument | Model | Author | Licence | Changes |
| --- | --- | --- | --- | --- |
| Guitar | ["Guitar"](https://sketchfab.com/3d-models/guitar-f8ccd75e8c2648ffbbc9e6208ed919c1) | [Ya](https://sketchfab.com/Yarik16) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Violin | ["Violin"](https://sketchfab.com/3d-models/violin-0162dea1b1044cd281c57af5e5fc2046) | [Voldepreuss](https://sketchfab.com/Voldepreuss) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |
| Cello | ["Cello"](https://sketchfab.com/3d-models/cello-ece053225f3a42f1939528b9c9014775) | [VM-Models](https://sketchfab.com/vm-models) | CC BY 4.0 | The strings between nut and bridge replaced, scaled and re-encoded for Practice Deck. |

"Re-encoded" means the parts were split and renamed, the textures were resized and saved as WebP, and the model was turned and scaled into the stage's units by `scripts/models/prepare.mjs`. The originals are not stored in this repository: `models-src/` is ignored. Each prepared file in `public/models/` also carries its credit line in its glTF `asset.copyright` field.

The credit list lives in `src/lib/modelCredits.js`. The Help dialog and the preparation script both read it.
