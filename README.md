# Windward

A tropical island you can walk, swim, and fly — drawn in the browser with WebGPU as a single HTML file. Coast, ocean, reef, plants, weather, wildlife, and sound are generated when the page opens. No image, model, or audio assets.

In the same spirit as [Abyssal Garden](https://github.com/Noniv/abyssal-garden): one self-contained page, no engine, everything procedural. Shared techniques — water fog, caustics, plant sway, surface refraction, procedural ambience — are adapted here for a tropical island above and below the waterline.

**[Try it in your browser](https://jordanz00.github.io/Windward/)** · Best in Chrome. Also runs in Edge, and on a phone at Low detail. Free, MIT license.

![Palm Beach at golden hour — ocean and late sun](media/golden-hour.jpg)

## Try it

Open the [live page](https://jordanz00.github.io/Windward/), or clone the repo and open `index.html` in Chrome. WebGPU needs a normal browser context; if a local file open fails, serve the folder:

```bash
python3 -m http.server 4177
```

Wait for the coast to finish generating, then press **Enter**. First person on the beach: mouse looks, `W` `A` `S` `D` or arrows move. Click the view if look is not locked. **Spaces** (`1`–`7`) eases seven cinematic looks and flies to each viewpoint. **Places** jumps to one of six spots (`Shift`+`1`–`6`). **Fly** (`F`) leaves the ground. **Watch** (`C`) hides the UI. Music and ambience start with the island — `N` toggles the score, `M` mutes.

| | |
|---|---|
| Look | Mouse (click the view if needed). Esc releases |
| Move | `W` `A` `S` `D` or arrows · Shift run / boost |
| Jump | Space (on dry ground) |
| Ripple | Click the water (or tap on a phone) |
| Travel | Places · Shift+`1`–`6` |
| Spaces | `1`–`7` ease light and fly to that look. Cards change light only; Shift-click or double-click also flies |
| Fly | `F` · `W` follows look · Space up · `Q` down |
| Dive / rise | `Q` dive · Space rise while swimming |
| Watch | `C` · Esc restores controls |
| Time of day | Hour, or `T` (Shift reverses) |
| Weather | Weather, or `R` (Shift reverses) |
| Mute / audio | `M` mute · `N` music · `X` effects · `[` `]` music level |
| Frame time | `H` — FPS, CPU/GPU ms when available |
| Benchmark | `B` timed fly-through · `G` same path · `?bench=1` after Enter |
| Menu | `Esc` |

On a phone, drag to look; tap water to ripple. **Walk** puts you on foot; **Menu** brings the card back.

Low, Medium, and High are the same island with less or more detail. The choice is remembered; a failed load steps down one level.

Step into the water to swim; hold `Q` to dive. `Shift+6` puts you beside a coral head. `1`–`7` run the cinematic spaces. `F` frees the camera from the ground.

| | |
|---|---|
| ![Palm Beach at golden hour](media/beach.jpg) | ![Coral garden under the surface](media/coral.jpg) |

## Gallery

Real frames from the running app — UI hidden, no AI art.

![Nine places and skies](media/nine-views.jpg)

| Volumetric clouds | Through the cloud deck |
|---|---|
| ![Cumulus over the shore](media/clouds.jpg) | ![Looking up into the volume](media/clouds-deck.jpg) |

| Shore curl | Underwater flora |
|---|---|
| ![Breaking lip and wash on the beach](media/shore-curl.jpg) | ![Kelp, seagrass, and reef life](media/flora.jpg) |

| Night sky | Storm deck |
|---|---|
| ![Moonlit island under real stars](media/night-sky.jpg) | ![Rain over the lagoon](media/clouds-storm.jpg) |

| Thunderstorm | Sunset | Cliff overlook |
|---|---|---|
| ![Beach thunderstorm](media/storm.jpg) | ![Offshore at sunset](media/sunset.jpg) | ![Cliff overlook under clouds](media/cliff.jpg) |

| Breaking shore | Photoreal beach | Forest light |
|---|---|---|
| ![Crest pitch and whitewater](media/breaking-wave.jpg) | ![Golden-hour shore](media/photoreal-beach.jpg) | ![Shafts under the canopy](media/forest.jpg) |

| Deep ocean | Sixgill wreck | Basin patrol |
|---|---|---|
| ![Abyssal basin](media/deep-ocean.jpg) | ![Sixgill under the wreck](media/shark-wreck.jpg) | ![Sixgill on basin patrol](media/shark-basin.jpg) |

Individual views also live in `media/views/`. Early visitor stills remain in `media/before/` for comparison.

## What is in the page

- **Island.** Fixed-seed coast with beach, cliffs, bay, and reef. Instanced palms, forest trees, grass, shrubs, and rocks; wind moves foliage. Contact shadows so trunks, grass, and flowers shade sand and water.
- **Ocean.** Spectral swell and chop, nearshore run-up and foam, crest pitch into a breaking lip and wash on the shore, depth-based colour, reflections, and clickable ripples. Underwater: reef, seagrass, kelp and soft flora, schools of fish, caustics, and Beer's-law fog into a living deep ocean.
- **Deep sea and sharks.** Deferred deep cast — bluntnose sixgill (signature SE-basin patrol + rare wreck emerge), bigeye sixgill, Greenland, cookiecutter, Portuguese dogfish — with lanternfish and reef wildlife above. Capture helpers: `?shark=basin` / `?shark=wreck`.
- **Sky and weather.** Day cycle from dawn through night; weather from clear to thunderstorm. Fly climbs through real cloud density — cumulus, a broken higher band, cirrus near 12 km — with grey cores, silver rim, cloud shadows, and shafts. Night uses a real astronomical sky (Hipparcos stars, analytic Milky Way, Meeus moon) from a Saint Lucia observer.
- **Cinematic Spaces (`1`–`7`).** Golden Paradise, Tropical Morning, Blue Paradise, Cloud Kingdom, Sunset Dream, Tropical Storm, Moonlit Island — light eases over a few seconds and the camera flies to each look's view. Space 7 holds tonight's real moon. Places (`Shift`+`1`–`6`) still jump to fixed spots.
- **Life and sound.** Insects near flowers and canopy; birds; reef and deep wildlife; surf, wind, and weather ambience. An original score (*Beneath the Blue*) toggles with `N`. Everything is synthesised in the Web Audio API — no recordings.

Capture helpers (`?tod=`, `?wx=`, `?shot=`, `?space=`, `?shark=`, and related flags) are documented in [WINDWARD_NOTES.md](WINDWARD_NOTES.md).

## How it is built

`source/` is the readable copy. `node source/build.mjs` writes `index.html` and reports sizes. The shipped page strips comments and spare whitespace but keeps names so runtime errors still map to source. `node source/build.mjs --dev` packs the page without that strip.

| File | Role |
|---|---|
| `source/gpu.js` | Bind-group, layout, and pass helpers |
| `source/island.js` | Fixed-seed coast and bathymetry |
| `source/sky.js` | Atmosphere, weather map, volumetric clouds, panorama bake |
| `source/shaders.js` | Terrain, plants, air, and water WGSL |
| `source/ocean.js` | Spectral sea (FFT tiles) and shared wave lookup |
| `source/shore.js` | Nearshore run-up, foam, wet sand, shore break |
| `source/fish.js` | Reef, coral, seagrass, kelp/flora, fish |
| `source/deep-sea.js` | Deferred deep sharks / mesopelagic cast |
| `source/astro.js` / `astro-data.js` | Night sky, moon, star map |
| `source/birds.js` | Bird life |
| `source/stream.js` | World streaming / LOD helpers |
| `source/env.js` | Shared hour, sun/moon, weather, wind |
| `source/insects.js` | Insects and flowering shrubs |
| `source/score.js` | Deferred original score (*Beneath the Blue*) |
| `source/app.js` | WebGPU app, camera, vegetation, audio |
| `source/bench.js` | Repeatable fly-through benchmark |
| `source/ui.css` | Overlay UI |
| `source/build.mjs` | Packs the files above into `index.html` |

Nothing is allocated per frame on purpose: uniforms, instance lists, and scratch matrices are reused. Plants and rocks are prototype meshes drawn as instances. Sunlight uses depth maps so trunks, grass, and flowers shade sand and water.

## Size

Kilobytes are 1024 bytes. `node source/build.mjs` prints current figures; roughly:

| | |
|---|---|
| Source (with comments) | ~821 KB |
| of which shaders (WGSL) | ~257 KB |
| `index.html` | ~547 KB |
| gzipped | ~202 KB (cap 400) |
| brotli | ~173 KB (cap 350) |
| critical gzip (css+js) | ~194 KB (cap 200) |

Hard size ceilings are enforced by `node source/budget-gate.mjs`. Score and deep-sea/sharks load deferred inside the same HTML file. The page fetches nothing after load: no images, models, audio, fonts, or external scripts. README images under `media/` are for GitHub only.

## Performance

Resolution follows frame rate: under ~40 fps the page draws fewer pixels (down to half the preset), and restores them when there is headroom. If the menu stays under ~22 fps on an auto-chosen preset, it reloads one level down. `?dyn=0` disables this; captures and the `B` benchmark never use it.

Plant density, cloud quality, shadows, reflections, and water detail stay at the chosen preset. Use `H` and `B` to compare builds by GPU milliseconds, not FPS alone.

## Known limits

- Requires WebGPU. Without it, the page shows a message instead of the island.
- High detail is aimed at a desktop GPU; use Medium or Low if the frame rate is poor.
- Thin palm leaflets can shimmer; optional `?msaa=4` helps where it works, but is known to break on at least one Mac.
- Phones run at Low detail; expect a modest frame rate on weaker devices.

## How it was made

A free-time open-source experiment. The founder works in multimedia, video, and animation — not as an experienced software engineer — and directed the build in [Cursor](https://cursor.com), primarily with Fable 5.2 and other models (Grok and Auto used sparingly). About a week of that work was enough to put something on GitHub. [WINDWARD_NOTES.md](WINDWARD_NOTES.md) holds compact notes on layout, systems, and trade-offs.

Main inspiration: [Abyssal Garden](https://github.com/Noniv/abyssal-garden) by Maksymilian Dendura.

## License

[MIT](LICENSE). The idea of a single-file procedural WebGPU world, and the shape of the controls, comes from Abyssal Garden (also MIT). The coast, shaders, and page are written for this project.
