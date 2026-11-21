# Windward

A small island you can walk, swim, and fly, drawn in the browser with WebGPU. The coast, the swell, the reef, the trees, and the sound are all computed when the page opens. There are no image files, no 3D models, and no audio files. The page you open is one HTML file.

It is in the same spirit as [Abyssal Garden](https://github.com/Noniv/abyssal-garden): one self-contained page, no engine, everything procedural. The place is different. This one is above the water, with a real swell, a beach, and a bay.

Best in Chrome. It also runs in Edge, and on a phone at Low detail.

## Try it

Open `index.html` in Chrome, or serve the folder and open that address. WebGPU wants a normal browser context; if a double-click does nothing useful, use a local server:

```bash
python3 -m http.server 4177
```

Wait for the coast to finish generating, then press **Enter**. You arrive over the lagoon. Drag to look, scroll to come closer, and click the water. **Places** is the way from one body of water to another: the lagoon, the open ocean, a cove under the cliff, a calm lake, a storm, the reef, and a still pool. The flight between them eases, and the light changes with the place. **Walk** steps onto the sand. **Watch**, or `C`, hides the interface.

| | |
|---|---|
| Look | Drag. Scroll zooms. `Q` and `E` dolly |
| Move the view | `W` `A` `S` `D` |
| Ripple | Click or tap the water |
| Travel | Places |
| Walk the island | Walk, then mouse look. `F` flies. `1`–`6` are places |
| Dive / rise | `Q` / `E` while walking (Space also rises) |
| Just watch | Watch, or `C`. Esc brings the controls back |
| Mute | `M` |
| Frame time | `H` |
| Menu | `Esc` |

On a phone, drag to look and tap the water. A second finger is Shift once you are walking. **Menu** brings the card back.

Low, Medium, and High are the same island with less or more in it. The choice is remembered. If a load dies, the next one steps down a level.

You stay on the sand. Step into the water and you swim; hold `Q` to go under and look up through the surface. `F` lets the camera leave the ground.

## How it is built

`source/` is the readable copy. `node source/build.mjs` writes `index.html` next to this file.

| File | What it is |
|---|---|
| `source/island.js` | The fixed-seed coast: beach, cliffs, bay, reef, and where the swell is allowed to stand up |
| `source/shaders.js` | WGSL: sky, terrain, plants, and the water |
| `source/ocean.js` | The spectral sea: two FFT wave tiles and the slopes that glitter |
| `source/shore.js` | Shallow water on the beach: run-up, foam, and the sand it leaves wet |
| `source/app.js` | WebGPU, the camera, the boats and trees, the sound |
| `source/ui.css` | The card on top of the picture |

The water is a Gerstner swell running with the wind, with a bound harmonic that peaks the crests. As the bottom rises the crest leans forward and breaks into foam; the lagoon stays sheltered. On the beach a shallow-water grid, finer than the island mesh, takes the swell onto the sand. The water runs up as a thin sheet from its own momentum, and the foam is carried with that flow. The wind sea is two headings on two scales, so the crests do not repeat as one pattern. A third spectral cascade carries the 0.45 to 5 m chop that gives water its texture, the swell stays low offshore and stands up where the bottom shoals, and foam is drawn as a network whose ribbons widen with the simulated density. The interior is forest over leaf litter, rocks are cut along planes, and wet sand reflects the sky. Palms carry feathered fronds, the inland trees are a different shape, and the sound is a drifting surf bed with separate wave breaks and bird calls. Under that, an original score called Beneath the Blue unfolds at a slow tempo: written chords and melodic phrases, played by a pad, a bell, a soft pluck, and a rounded bass. N quiets it. The bracket keys set its presence. The surface mesh is packed tightly around the camera and runs out to the haze, so a crest nearby stays a curve. Past the mesh, the same sea is drawn to the horizon, and the island sits in open water in every direction. Color comes from depth: sand shows through the shallows, red light dies first offshore, and the glancing angle reflects the sky. The surface bends the view of the bottom, and the same waves focus the sun into caustics on the sand. A half-resolution mirror puts the island in the water. The long swell is still Gerstner. The shorter waves are a spectral tile, solved on the GPU, and the sun path is the facets of that surface: a pixel lights only when a facet faces the sun. Under the surface, the disk of sky is the refraction out of the water; outside that cone the surface reflects.

A click writes into a height field on the GPU. The impulse is a crest with a trough around it, so the ring reads as a disturbance in the surface rather than a flat circle. It travels, meets the next click, and dies away. The swell is a set of layered waves, and the finer texture is the spectral tile, which drops out of the reflection once a pixel is wider than the wave. Looking along the water reflects the shore and the sky. Looking down shows the bottom through the water, darker and bluer as it gets deeper. There is no control panel. Each place chooses the swell, the color of the water, the sky, and where the camera sits: Tropical Lagoon, Open Ocean, Hidden Cove, Calm Lake, Stormy Ocean, Shallow Reef, and Swimming Pool.

The seabed is a height field filled on the CPU once, then read by the GPU. Sunlight is a depth map of the ground and the trees, so a trunk throws a shadow across the sand and into the water. Plants and rocks are a few dozen prototype meshes, built once and drawn as instances; the wind moves the tips more than the trunk. Sound is filtered noise in the Web Audio API.

Nothing is allocated per frame on purpose: the uniform buffer, the bird list, and the scratch matrices are reused.

### Geometry, light and startup

- **Instances.** Every plant, rock and boat is one of a few dozen prototype meshes in a single vertex buffer. Each placed copy is twelve floats: position, yaw, scale, tint. Every frame the CPU culls the copies against the view, picks a level of detail by distance, and writes one instance buffer that serves the main view, the mirror and the near shadow map.
- **Palms.** A coconut palm is a curved, tapering trunk with leaf-scar rings and 20 to 26 fronds placed by age: young ones upright, old ones hanging and yellowing. Each frond is a curved rachis carrying separate folded leaflets. Three levels of detail share the same fronds, so a palm does not change shape as it recedes. The other trees, shrubs and ferns have not been rebuilt this way yet.
- **Shadows.** One depth map covers the island and is redrawn only when the sun moves. A second, 2048 texels across 52 m, follows the viewer so leaflets and trunks cast sharp shadows on the sand nearby.
- **Sky.** Air and clouds are one small panorama: Rayleigh and Mie scattering, and cumulus marched through a slab with the march starting at each cloud's surface. It is baked a strip per frame and read by the sky, by reflections in water and wet sand, and by the haze.
- **Sand.** Dry sand is shaded from a height: pits with raised rims, wind ripples in patches, and grain. Each scale is left out once it is smaller than a pixel. Below a ragged line the sand is damp, darker and smooth, and the last high wash has left a wrack line.
- **Startup.** Render pipelines compile in parallel while the height field and the planting run. The surf simulation warms up over the first frames instead of before them. `window.__perf` holds the time of each startup step in milliseconds, and `?perf` in the address logs it.

Measured on a software rasterizer (lavapipe, no GPU), from navigation to a settled frame: 10.1 s before this structure, 1.2 s after. The built page is 252 KB, 74 KB gzipped. Frame rate on real GPUs has not been measured.

## License

[MIT](LICENSE). The idea of a single-file procedural WebGPU world, and the shape of the controls, comes from Abyssal Garden by Maksymilian Dendura, which is also MIT. The coast, the shaders, and the page are written for this project.
