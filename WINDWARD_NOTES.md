# WINDWARD_NOTES

Compact working notes. Update, do not grow.

## Layout
- `source/*.js` -> `node source/build.mjs` -> `index.html` (single file, budget 200 KB gz).
- Order: gpu, island, sky, shaders, ocean, fish, env, insects, app. One WGSL module from `shaderCode()`.
- Frame uniform 244 floats. Env block at 188. Sky vec4s: cldA 220, cldB 224, cldC 228, skyS 232, skyD 236, cldE 240.

## Sky (source/sky.js)
- Noise 96^3 rgba8 (compute, once). Weather map 512^2 (radial warp, WX_K 30 km): r cumulus, g tower, b anvil, a deck.
- Cloud shadow map (CS_K 5 km): r sun transmittance, g occluder height. Read by land, water, air pass, animals via `cloudShade`.
- Panorama: 2 layers x 5 mips, baked one strip per frame, alternate layers, blended (`skyBlend`). Mip 4 = `skyDim` (radiance, for reflections).
- Sky irradiance: `fsSkyIrr` bakes a 32x15 table into a corner of mip 3 (u = azimuth, v = normal.y; cosine-weighted mean of mip 4 plus ground bounce). `skyIrr(n)` reads it. This, not zenith radiance, lights surfaces.
- Sky radiance scale 5.6 in `atmosphere()`: sets sky/sun on level ground to a clear humid day's proportion.
- Shafts: in bake, air in-scatter removed along shadowed stretches of each ray (shadow map). No screen-space streaks.
- Camera altitude clamp 2..400 m in bake. Camera never above cloud base.
- Quality: `q.clouds` 1..3 -> march steps / light taps; `q.sky` [W,H,strips,shadowN].

## Light (source/env.js)
- `env.space` = sun above the air. `keyCol = space * envSunT(sy, haze)` (Chapman, same as WGSL `sunT`). No gold tints anywhere.
- Exposure meter is view-dependent: `env.face` (camera . sun) set in app before `envStep`.
- Cumulus thins with sun height (`heat`) in `envSky`.
- Air pass (`fsAir`): L = a * (sunCol * vis * cloudShade * phase + skyDim). Normalised HG phase. No boosts.
- `shade()`: sun * shadow + `skyIrr` * canopy visibility + canopy bounce. Fresnel is roughness-limited (rough surfaces never mirror at grazing: grass and leaf edges went white).
- Aerial perspective: `airMix`/`airKeep` = `pathKeep` through the same air as the sky, plus humidity veil. No other distance haze.
- Humidity rises at dusk (`dusk` in `envStep`) as at dawn: that is what makes forest shafts at golden hour.
- Exposure 0.74 * (L0/Lc)^0.47. Albedos are physical (grass ~0.1); do not brighten them to fix a dark frame.
- Evening air: `env.low` (0 with the sun above ~24 deg, 1 near the horizon; uniform `F.day.w`) gates the meter and the tone curve; the sky terms are zero by themselves for a high sun. Captures of the framed afternoon are pixel-identical before and after. With a low sun the meter also reads the sky's own glow (`glow`, more when facing the sun), so the lens no longer opens for the dim ground until the sky is white; multiple scattering in `atmosphere()` loses with the sun's path once that path is deep (dome dims and loses blue); `tonemap` keeps part of a bright colour's hue (0.4 * low) instead of bleaching per channel; dusk fill starts at sy 0.06, air-pass shafts last to sy -0.02. No tint, no added pass or texture sample.

## Plants (source/app.js)
- Forest tree: trunk + limbs, per lobe a solid hull (kind CROWN, never alpha-tested) and leaf sprays (kind LEAF, 4 verts / 2 tris each). LOD0 hull 0.78 + all sprays, LOD1 hull 0.92 + 1 spray in 4 (bigger leaves), LOD2 hull only.
- Crown hull shading (`fsMesh` kind 3): leaf-cell tone and tilt at three scales chosen by pixel footprint; far = boughs. No discard, no dither.
- Broad/canopy plants: LOD0 arched multi-segment blades (`addLeaflet` segs), LOD1 flat 3-tri blades.
- Antialiasing: OFF by default since the Reddit launch; `?msaa=4` turns it on. On the owner's Mac the MSAA path drew trees and underwater objects in random colours, and `?msaa=0` cured it. Never reproduced in SwiftShader. Root cause unknown; ruled out: load-after-discard (the MS colour target is only ever cleared, drawn and resolved in one pass), altitude LOD bias, caustic dispersion. Untested suspects: `@builtin(sample_mask)` output with `discard` in `fsMesh`, centroid varyings, NaN samples poisoning the rgba16float resolve, varyings without centroid in terrain/fish. Without MSAA there is no LOD cross-fade (`scatter.fade = MS > 1`) and sub-pixel leaflets shimmer. When on: the scene and the mirror are 4x MSAA (`MS` in `main`). Colour resolves into `sceneTex`; `sceneDepth` stays multisampled (`texture_depth_multisampled_2d`, layout letter `m`) and later passes read sample 0, except `fsWater`, which covers a pixel by the share of samples the scene leaves open and takes the furthest as its bed. Any pipeline with a fragment stage and `depth32float` gets the samples. `MeshV`/`GrassV` varyings are centroid: read at the pixel centre a sub-pixel leaflet extrapolated to colours no leaf has. Without MSAA sub-pixel leaflets were on or off per pixel as they swayed: the flashing in palms and trees.
- LOD cross-fade (view and mirror; shadow maps switch): past a cut a plant is drawn at both levels for up to 14 m, the finer level's share falling 1 -> 0. No screen-door: wood shares the pixel's four samples between the two copies by `@builtin(sample_mask)` (complementary sets, 2x2 ordered rounding = 16 steps); each leaf comes and goes whole by its own number, which rides in the fraction of the vertex kind (`Mesh.leaf()`, under 0.4; everything reading the kind rounds). Share rides in instance `i1.z` with the wind exposure; `windExpo()` strips it. No fade without MSAA (`scatter.fade`). View cuts scale with canvas pixel size (`near` in `collect`, 1 at ~1400 px high, 0.4 at least); mirror and shadows keep `far`.
- Wind (`plantLean`, `boughAt`): lean saturates with wind speed; boughs rock on top of the plant's own rocking, phased by where they stand on the plan; leaf flutter phased per leaf. Tree sway weights are in metres (x14). `meshPlace` and `meshPlaceLean` share one call, so both LOD copies, the shadow and perched insects move together. Open: crown foliage moves up to ~0.4 m against its limbs in gusts.
- `Scatter.collect`: view culls plants under 1.5 px; mirror culls small far plants; near shadow culls small casters past 0.42 of reach.
- `?perf` logs CPU ms/frame and plant triangles (view / mirror / near shadow). Cliff view was 2100k / 1411k / 2023k before the cross-fade moved the view's cuts out; `trees` scene view went 1409k -> 3101k with it (mirror, shadow unchanged). Cost on a real GPU not measured.

## Walking, places, sound (source/app.js)
- Walk collision: `walkBuild` puts trunks and rocks (circles), reef domes, and a link closing any gap between two columns too narrow to walk through, on a 4 m grid; `walkStep` moves in 0.12 m sub-steps and pushes out of anything entered, so the walker slides round. `walkTop` makes rocks and coral a floor for the eye. Eye = max(ground + 1.65, water + 0.42, top).
- Places = the six views (`PLACES`, `spots`, keys 1-6). `goPlace(i, true)` travels (`advanceTrip`: rise, cross, settle; retargets from where it is; Walk/Fly cancel). Water is always `WATER`; there are no water presets.
- View 4 is found by `findShallows` on the height field (knee-deep, bank near one side, open sea on the other, sun behind). It and `findBeach` take no random numbers: keep every `rnd()`/`hunt` call in `main()` in order or the island replants.
- Audio: sources -> `master` -> `sfx` gain -> `under` filter -> out; score joins at `under`. SFX button / X (`ww-sfx` in localStorage), Music N, mute-all M.

- The day opens at `ENV_OPEN` (17.65, golden hour) and holds there until the hour is first changed; captures with `shot=` and no `tod=` still open at `ENV_H0`, the framed afternoon.
- Evening air: `airTau` adds a thin ground haze scaled by `F.day.w` (0 by day), which is what the low sun's shafts stand in.

## Shafts under trees

- `motes(p, fld)` in the air pass: sun-only in-scatter per metre, `0.0009*land + 0.016*wood`, falling off 16 m above the ground, with its own lobe `0.05 + 0.3*hg(mu, 0.5)`. No extinction and no sky light, so it adds shafts without fogging the shade. Far march counts it at half strength, fading over ~200 m. First try (0.0035/0.02, lobe 0.06+0.5*hg(0.6), no far fade) washed out near trunks and veiled the whole palm grove. Test views: `shot=1&wx=clear&at=-62,60,210,6&tod=17.2&sunview=1` (forest toward a low sun) and `shot=1&wx=clear&tod=16.5&sunview=0.7&shade` (palm grove).
- Limit: forest crowns are solid hulls in the shadow map, so shafts come between crowns and through palm fronds, not through single forest leaves. Fixing that means cutting holes in the crown's shadow, not more air.

## Frame rate

- Dynamic resolution (`dynScale` in `main`, applied at the end of `resize()`): one-second windows; under 40 fps the scale drops x0.85 (x0.7 under 24) to a floor of 0.5; over 55 fps for 8 windows it rises x1/0.85. A drop that gains under 5% is undone and locks further drops (not fill-bound). A rise taken back within 6 s sets a ceiling. Under 22 fps at the floor (or locked) for 4 windows: on the menu with a guessed preset (`autoQ`) it stores `ww-auto` in sessionStorage and reloads one preset down; in play it shows a hint once. Off for `?shot`, `?read`, `?dyn=0` and while `WW_BENCH.active()`. Thresholds are guesses: no real GPU was available. Reason: a Reddit visitor reported a slide show; desktop defaults to High.
- Known cost not addressed: grass is ~0.9 M vertices at High with no culling (8x what it was before the grass rework).

## Camera

- Controls are first person from Enter: `goPlace(0)` on the beach, walking, pointer lock requested by the Enter click. The orbit view (`openOrbit`) is now only `?studio`; a move key there hands over to walk or fly. Arrows alias WASD (`ARROWS`), `blur` clears held keys, Space hops on dry ground (`hop` lifts the eye only; collision stays at standing height), flying W/S follow pitch, dragging looks when the lock is refused. Ctrl still sinks in Fly but is not advertised: Ctrl+W closes the tab and cannot be prevented. A click with the mouse locked ripples the water at the centre of the view. A device with only a coarse pointer still opens in the orbit view, as before. None of this was driven by hand in a browser.

- After every mode but walking, the eye is held 0.45 m above the highest ground within 0.9 m (one clamp before `lookX = 0`). Places (orbit) had only `camY >= 0.35`, so an orbit swung over a hill put the eye inside the island, where the sea is drawn. Not captured: no parameter puts the camera under ground.

## Grass, bark, sea floor

- `cylinder()` (tree-fern, understory and shrub stems) is WOOD with a seam and uv, like `addLimb`. As SOLID these stems were flat brown from close to.
- `media/*.jpg` are README screenshots (1280x720, software renderer, `shot=4&wx=clouds`, `shot=1`, `shot=6&wx=clear&warm=12&dpitch=-0.3`). `og:image` in the page points at `media/lagoon.jpg` on Pages; the page itself still loads nothing.
- Grass tuft: 9 blades of two segments (`grassGeom`). Sizes: every tuft cut by its own factor and two smaller ones sown at its foot from `seeded(40507)`, after the main `rnd()` loop, so nothing else replants. `vsGrass`: bend is a share of the blade's own height (tip furthest, dips), gusts roll downwind as a wave, blades within 1.3 m of the eye lean away and lie down (eye under 3.2 m above that ground; seaweed too).
- Trunks: palm 18 sides / 48 rings, forest trunk 16 sides, limbs 10; bark shaders add cross cracks, scar lips, deeper furrows.
- Sea floor: `caustic(p, foot)` is a colour: two layers of the interference field (the second rotated), domain-warped by noise, combined with `min` into a net of threads, three taps with red and blue displaced, projected up the refracted sun (`sunUnder`, never under 41 deg). Cells are 0.5 m at every depth (sized by depth, the net drew contour bands on slopes). It is normalised so its mean equals the flat light it replaced, and fades to that mean where a pixel covers more than a cell (`foot`), so shallows seen from the shore keep their brightness. The function before it was saturated over 90% of the bed and showed no net. With the eye under water the net is raised to the power 1.6 and renormalised (x0.71), since nothing smears it there; at the old contrast it barely showed against the bright sand. With the eye under water (`F.under`) the bed's sun term and absorption path use the refracted sun and the surface's Fresnel loss.

## Shadows
- Near cascade (2048^2, 20 m) is drawn every frame, texel-snapped. Baking only on eye movement froze swaying casters and made shadows jump.

## Water
- `vsWater` band-limits displacement by the vertex's own grid cell (`WGRID`, `kSwell`, `kShape`): coarse cells along the grid axes stood up as rows of teeth on the horizon.
- Planar reflection holds land and plants only (no sky draw; alpha = coverage). Sky reflection is analytic per wave normal.
- Shadow dims the water body (`bodyK`), foam and sun glitter, never the mirrored sky.
- Sea floor is read wherever scene depth < 0.99999. The old 0.9995 cut made all water past ~200 m bottomless (dark lagoon from the air, hard line across the frame).
- Everything drawn after the blit (water, shore sheet, insects, drops) is hidden by land in its fragment shader, from the scene's depth texture (`hidden()`, top of `fsWater`). The blit writes no depth; the swap pass depth buffer holds insects only. Do not go back to a `frag_depth` copy plus hardware test.
- Shore sheet: hidden by anything more than 0.2 m off its own surface in world height. The old depth epsilon let it draw over trunks at any range and over the forest from the air.

## Known traps
- User screenshot (Chrome/macOS, old build, Fly, low sun): water-coloured patches on forest crowns. Not reproduced on SwiftShader beyond the shore sheet; real-GPU check still owed.
- Water vs near plane: `vsWater` slides verts level, never flattens onto near plane (was drawing sea in the sky when looking up).
- Water pipeline uses 15 of 16 sampled textures.
- `encCounted` facade must forward any new encoder method.

## Test (no GPU here: SwiftShader, software)
- Harness in /tmp/harness (not in repo): `scenes.sh <out> <html> [names]` captures, `places.mjs` trips, `walk.mjs` collision runs, `evalpage.mjs` one expression in the page.
- Capture params: `?shot=N&q=high&wx=..&tod=..&read[&rf=frame]`, plus `dyaw dpitch sunview shade up fwd side`, `at=x,z,yawDeg,pitchDeg,height`, `no=water,shore,drops,air`, `perf`.
- Not verified here: real-GPU frame times (MSAA cost included), anything by ear (the audio context stays suspended headless).
- App capture 1-4 min each at 800x500.

## Measured (SwiftShader, 4 cores, 800x500, High; s/frame, before -> after)
- beach up 10.0 -> 2.1, cliff panorama 8.0 -> 3.3, sunset 8.0 -> 2.0, golden side 10.0 -> 3.3, towers 8.0 -> 1.8.
- Build: gzip 120.5 KB, brotli 102.3 KB.
- Walk runs (`walk.mjs high`, 3 x 600): 0 deadlocks, 0 held at the start (was 410 / 400). LOD collect: 15800 distances, largest change of share 1/64. Places: 84 trips, none through the ground. Exposure 17:42 away from / toward the sun: 1.76 -> 1.33, 1.25 -> 0.85.
- Adjacent frames: sky diff ~0; 40 frames apart: cloud edges only (drift), no strip seams.

## Open
- Shore sheet has a straight vertical edge where it meets the sea mesh (pre-existing; seen at beach, left of frame).
- Bird's-eye: straight boundary low in frame over the lagoon (pre-existing).
- No real-GPU timings yet.
- Sky looking at a low sun: one cloud near the frame's edge is cut by a straight vertical line (seen at `shot=5&tod=17.7&sunview=1`, also before the evening work).

## Thunderstorm

- `WEATHER.storm` sits after `shower` in the cycle; left alone, a shower turns into one a quarter of the time. Strikes start once rain > 0.6 and cover > 0.5.
- `bolt` / `boltStep` in `env.js`: strike position (70% within about 35 degrees of where the camera faces), strokes `[time, strength, decay]`, `bolt.now` is the brightness this frame. Thunder is queued at distance / 343 s and played by `audio.thunder(d)`.
- Uniforms `F.bolt` (xyz position, w brightness divided by exposure) and `F.boltB` (seed, channel shown) at floats 244..251; the frame buffers are 1008 bytes.
- Light is added at lookup, never baked: `skyLook` (cloud glow, weighted by `1 - alpha` and by how thin the cloud is against mip 4), `skyDim` (air pass, wet glints), `skyIrr` via `boltOn(n)` (everything `shade()` lights), rain streaks. Water gets it through `skyReflect`.
- `boltSeen` in `fsSky` draws the channel as the ray's nearest pass to an upright at the strike, offset by three octaves of 1D noise, with two forks. It is drawn in the sky pass, so anything nearer hides it and nothing further than the strike exists to be wrongly in front.
- At most three strokes to a flash (WCAG's limit is three flashes a second). With `prefers-reduced-motion` a flash is one slow swell at 0.35.
- Off in `read`/`shot` captures. `?bolt=1` holds a ground stroke ahead of the camera, `?bolt=2` an in-cloud flash, `&far=<m>` sets its distance.
- Not verified: the timing and loudness of thunder (no audio in the harness), and the flicker in motion on a real GPU.

- Found while testing the storm on the real page: `api.air` named `airCoastF`, which does not exist, in the gust whoosh (gust over 7 m/s and rising). It threw and stopped the frame loop for good. It had been there since the shared-wind commit and would trip in Wind gusts and Tropical shower with sound running; now `airCoast.filter`. The capture harness never ran it because captures have no audio.

## Visual polish (foliage, grounding, water LOD, shore rocks)

- Leaf shade: dry leaves are rougher (`*1.48`) and take a softer specular (`0.48` vs `1.85`); wet weather only lifts leaf gloss a little while non-leaf wet stays shinier. Leaflets use tip/midrib/blotch thickness → variable transmission. Crown hulls derive leaf/gloss from `leafCells` so thin clump edges filter green light.
- Grass + flower shrubs cast into near and island shadow maps (`shadowGrass` early-compile; blades widened/extruded in the depth pass; flower petals extruded toward the light). Contact AO still mottles sand under meadow/flower patches as a soft fill.
- Grass blade feet darkened via `uv.y`.
- Water: `seaBands` fine fade widened 28→260 m; chop fades on its own distance/footprint with band.x only softening; capillary and chopField keep ranges widened.
- Shore rock clusters on the wet-sand strip left/right of the skiff (budget from `q.rocks`, seaward axis from `downhillYaw`), partially buried.
- Dove/owl coo removed from singers (soft low notes read as a hoot). Ambient SFX is tropical only: warbler / trill / chirp cascade (≥~2.4 kHz) plus cicadas/crickets/insects — all synthesised, no samples.

