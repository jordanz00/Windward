# Windward

A small island you can walk, swim, and fly, drawn in the browser with WebGPU. The coast, the swell, the reef, the trees, and the sound are all computed when the page opens. There are no image files, no 3D models, and no audio files. The page you open is one HTML file.

It is in the same spirit as [Abyssal Garden](https://github.com/Noniv/abyssal-garden): one self-contained page, no engine, everything procedural. The place is different. This one is above the water, with a real swell, a beach, and a bay.

Best in Chrome. It also runs in Edge, and on a phone at Low detail.

## Try it

Open `index.html` in Chrome, or serve the folder and open that address. WebGPU wants a normal browser context; if a double-click does nothing useful, use a local server:

```bash
python3 -m http.server 4177
```

Wait for the coast to finish generating, then press **Go ashore**.

| | |
|---|---|
| Look | Mouse, or drag |
| Move | `W` `A` `S` `D` |
| Dive / rise | `Q` / `E` (Space also rises) |
| Faster | Shift |
| Fly | `F` |
| Places | `1` beach, `2` cliff, `3` above, `4` bay, `5` in the swell, `6` underwater |
| Mute | `M` |
| Frame time | `H` |
| Menu | `Esc` |

On a phone, drag to look and walk. A second finger is Shift. **Menu** brings the card back.

Low, Medium, and High are the same island with less or more in it. The choice is remembered. If a load dies, the next one steps down a level.

You stay on the sand. Step into the water and you swim; hold `Q` to go under and look up through the surface. `F` lets the camera leave the ground.

## How it is built

`source/` is the readable copy. `node source/build.mjs` writes `index.html` next to this file.

| File | What it is |
|---|---|
| `source/island.js` | The fixed-seed coast: beach, cliffs, bay, reef, and where the swell is allowed to stand up |
| `source/shaders.js` | WGSL: sky, terrain, plants, and the water |
| `source/app.js` | WebGPU, the camera, the boats and trees, the sound |
| `source/ui.css` | The card on top of the picture |

The water is a Gerstner swell running with the wind, with a bound harmonic that peaks the crests. As the bottom rises the wave steepens and breaks into foam; the lagoon stays sheltered. The surface mesh is packed tightly around the camera and runs out to the haze, so a crest nearby stays a curve. Past the mesh, the same sea is drawn to the horizon, and the island sits in open water in every direction. Color comes from depth: sand shows through the shallows, red light dies first offshore, and the glancing angle reflects the sky. The surface bends the view of the bottom, and the same waves focus the sun into caustics on the sand. A half-resolution mirror puts the island in the water. The sun glint is left bright and the tonemap brings it back into range. Under the surface, the disk of sky is the refraction out of the water; outside that cone the surface reflects.

The seabed is a height field filled on the CPU once, then read by the GPU. Trees, the skiff, and the stacks are meshes built from spheres, cylinders, and strips. Sound is filtered noise in the Web Audio API.

Nothing is allocated per frame on purpose: the uniform buffer, the bird list, and the scratch matrices are reused.

## License

[MIT](LICENSE). The idea of a single-file procedural WebGPU world, and the shape of the controls, comes from Abyssal Garden by Maksymilian Dendura, which is also MIT. The coast, the shaders, and the page are written for this project.
