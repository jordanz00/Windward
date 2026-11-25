# WINDWARD_NOTES

Compact working notes. Update, do not grow.

## Layout
- `source/*.js` -> `node source/build.mjs` -> `index.html` (single file). Showcase budgets (AEI Continuous policy; `node source/budget-gate.mjs` enforces): page gzip ≤400 KB, brotli ≤350 KB, critical-load gzip ≤200 KB. Deep-sea/sharks deferred via `ww-deferred-deep-sea`.
- Order: gpu, island, sky, shaders, ocean, fish, env, insects, app. One WGSL module from `shaderCode()`.
- Frame uniform 268 floats (1072 bytes). Env block at 188. Sky vec4s: cldA 220, cldB 224, cldC 228, skyS 232, skyD 236, cldE 240. Bolt ends at 248. Night sky: astro 252, astroB 256, astroC 260. Float 87 (`pad0`) is the sea-disk exponent. `grassFade` is 264, `cloudOwn` is 265. Star map is group 0 bindings 12 and 13 (`uttdcuttasdffs`). Bake and shadow pipelines do not sample it.

## Night sky (source/astro.js)
- Observer: Saint Lucia, 13.9094 N, 60.9789 W. The island clock is local mean solar time on the UTC date (`?utc=` overrides the date). `env.astroDay` is 1 when that night's highest moon is after midnight.
- Moon: Meeus ch. 47 truncated ELP, TT via Espenak/Meeus ΔT, topocentric parallax and refraction. Phase is the illuminated fraction; the disc's crescent is the real sun against the near-face normal, not a scaled full disc. The drawn disc is 5.5× the true angular size so that crescent reads in the 60° view; its centre stays on the true direction. `?moon=art` restores the old sun+12.6 h full moon. Stars still use the real sidereal time.
- Stars: Hipparcos through magnitude 6 (5044) at real RA/Dec, baked once to a 1024×512 rgba8 map with an analytic Milky Way. No IAU stick-figure lines (those looked like a constellation atlas). Asterisms form from bright-star positions. Sampled in `skyLook` after the panorama, so water reflections get them. Cinematic space 7 (key `7`, `?space=7`) is Moonlit Island: its weather row eases and holds, and the hour is the one when tonight's real moon is highest once the island sun is below the twilight. `?shot` with that space still aims at the moon. `applySpace7` remains for `astro-check.mjs`.
- `node source/astro-check.mjs` checks phase and position against the SunCalc numbers and the star-map round trip. It is not part of the page.

## Sky (source/sky.js)
- Noise 96^3 rgba8 (compute, once). Weather map 512^2 (radial warp, WX_K 30 km): r cumulus, g tower, b anvil, a deck.
- Cloud shadow map (CS_K 5 km): r sun transmittance, g occluder height. Read by land, water, air pass, animals via `cloudShade`.
- Panorama: 2 layers x 5 mips, baked one strip per frame, alternate layers, blended (`skyBlend`). Mip 4 = `skyDim` (radiance, for reflections).
- Sky irradiance: `fsSkyIrr` bakes a 32x15 table into a corner of mip 3 (u = azimuth, v = normal.y; cosine-weighted mean of mip 4 plus ground bounce). `skyIrr(n)` reads it. This, not zenith radiance, lights surfaces.
- Sky radiance scale 5.6 in `atmosphere()`: sets sky/sun on level ground to a clear humid day's proportion.
- Shafts: in bake, air in-scatter removed along shadowed stretches of each ray (shadow map). No screen-space streaks.
- Fly ceiling `FLY_TOP` 16500 m (was 320). Bake eye height 2..16500 m. Above the base the panorama march is finite (no negative shell). Speed grows with height above 80 m so the deck is a short climb.
- Near the base (`camY > base - 70 m`, leave below `base - 170 m`) `cloudOwn` (float 265) hands low cloud to `fsCloudVol` (half-res, scene-depth clipped). Panorama skips that layer and rebakes once. Below the handoff the panorama takes a short fixed march (8/10/12 samples, 0.36 km) from the base, shadow from density, plus three mid-band samples. The adaptive march is `fsCloudVol`.
- `fsCloudVol` steps 14/20/26 near the eye and 6/8/10 across the rest of a tall column, light taps 2/3/4 from `q.clouds` 1..3. A missed low slab still marches cirrus once the eye is within 700 m of 12 km; below that the panorama owns the sheet. Moonlight on the volume uses the same `F.astroB.w` colour as the panorama. `fsAir` folds the cloud buffer into the air target (`foldCloud`), and the sea is composited under that, so a downward view sits in the fog.
- Coverage is the weather field, not a brightness lift: moister provinces, a broken deck from a modest deck amount, a mid band around 2.7–4.2 km only where that deck field is up, cirrus fibres at 12 km. Fair-weather rows carry more cumulus and cirrus. Storm and shower rows are unchanged and stay dark.
- `cloudEnergy`: soft HG body, a low multi-scatter floor, silver rim `mu^6` only on a thin skin. Storm cover×rain dims the floor. A thundercloud flash belongs in the march on top of that, not in the floor.
- Quality: `q.clouds` 1..3 -> march steps / light taps; `q.sky` [W,H,strips,shadowN].

## Light (source/env.js)
- `env.space` = sun above the air. `keyCol = space * envSunT(sy, haze)` (Chapman, same as WGSL `sunT`). No gold tints anywhere.
- Exposure meter is view-dependent: `env.face` (camera . sun) set in app before `envStep`.
- Cumulus thins with sun height (`heat`) in `envSky`.
- Air pass (`fsAir`): L = a * (sunCol * vis * cloudShade * phase + skyDim). Normalised HG phase. No boosts.
- `shade()`: sun * shadow + `skyIrr` * canopy visibility + canopy bounce + cheap ground bounce; contact AO near the floor. Specular uses refracted `Lw` under water. Wet gloss lifts F0. Fresnel is roughness-limited (rough surfaces never mirror at grazing: grass and leaf edges went white).
- Aerial perspective: `airMix`/`airKeep` = `pathKeep` through the same air as the sky, plus humidity veil (clear days stay clear; low sun adds a thin coherent veil). `hazeColor` blends horizon + view-facing panorama.
- Humidity rises at dusk (`dusk` in `envStep`) as at dawn: that is what makes forest shafts at golden hour.
- Exposure 0.74 * (L0/Lc)^0.47. Albedos are physical (grass ~0.1); do not brighten them to fix a dark frame.
- Evening air: `env.low` (0 with the sun above ~24 deg, 1 near the horizon; uniform `F.day.w`) gates the meter and the tone curve; the sky terms are zero by themselves for a high sun. Captures of the framed afternoon are pixel-identical before and after. With a low sun the meter also reads the sky's own glow (`glow`, more when facing the sun), so the lens no longer opens for the dim ground until the sky is white; multiple scattering in `atmosphere()` loses with the sun's path once that path is deep (dome dims and loses blue); `tonemap` keeps part of a bright colour's hue (0.4 * low) instead of bleaching per channel, plus a mild midtone S-curve; dusk fill starts at sy 0.06, air-pass shafts last to sy -0.02. No tint, no added pass or texture sample.
- Photorealism pass (phases 1–4): tropical Beer (`W_SIG`/`W_KD`), softer mid Fresnel + crest SSS in `fsWater`; terrain/bark feed wet/matte gloss into `shade`; low-sun `airTau` denser. Vegetation/wildlife/LOD phases deferred.

## Plants (source/app.js)
- Tropical overgrowth: `clusterField`/`ecoPrefs` (domain-warped moisture/shade/jungle); `makeClimbingVine`/`makeHangingVine`/`makeMossClump`/`makeRootSnarl`; own `seeded(772351)` plant after fronds. Presets `vines`/`moss`. Shader `clusterField` + layered soil/moss/litter in `terrainAlbedo`. Climbing vines stay inland of dry shoreline sand (`beachEdge` / height / beach distance gates); upward-growing “vines” underwater are `makeSeaVine` + denser kelp/seagrass/flowing weed in `plantReef` (`fish.js`).
- Forest tree: trunk + limbs, per lobe a lobed pad (kind CROWN, closed, never alpha-tested) and leaf sprays. Six architectures from the seed: spreading, emergent, round, multi-stem, sparse, slender. Pads are flat with bites in the outline and a tucked belly, so the far hull is that silhouette and not a ball. LOD0 hull 0.80 + sprays + drip-tip rim leaves + a few leaves hung under the pad; LOD1 hull 0.94 + skyline and every fourth spray + half the rim; LOD2 hull 1.04 plus the bough to each pad. Structural `rnd()` runs at every LOD (including multi-stem draws the far mesh does not build) so the cross-fade does not move the crown. Habitat picks the architecture at placement; counts are unchanged.
- Crown hull shading (`fsMesh` kind 3): leaf-cell tone and tilt at three scales chosen by pixel footprint; far = boughs. No discard, no dither.
- Broad/canopy plants: LOD0 arched multi-segment blades (`addLeaflet` segs), LOD1 flat 3-tri blades.
- Antialiasing: OFF by default since the Reddit launch; `?msaa=4` turns it on. On the owner's Mac the MSAA path drew trees and underwater objects in random colours, and `?msaa=0` cured it. Never reproduced in SwiftShader. Root cause unknown; ruled out: load-after-discard (the MS colour target is only ever cleared, drawn and resolved in one pass), altitude LOD bias, caustic dispersion. Untested suspects: `@builtin(sample_mask)` output with `discard` in `fsMesh`, centroid varyings, NaN samples poisoning the rgba16float resolve, varyings without centroid in terrain/fish. Without MSAA there is no LOD cross-fade (`scatter.fade = MS > 1`) and sub-pixel leaflets shimmer. When on: the scene and the mirror are 4x MSAA (`MS` in `main`). Colour resolves into `sceneTex`; `sceneDepth` stays multisampled (`texture_depth_multisampled_2d`, layout letter `m`) and later passes read sample 0, except `fsWater`, which covers a pixel by the share of samples the scene leaves open and takes the furthest as its bed. Any pipeline with a fragment stage and `depth32float` gets the samples. `MeshV`/`GrassV` varyings are centroid: read at the pixel centre a sub-pixel leaflet extrapolated to colours no leaf has. Without MSAA sub-pixel leaflets were on or off per pixel as they swayed: the flashing in palms and trees.
- LOD cross-fade (view and mirror; shadow maps switch): past a cut a plant is drawn at both levels for up to 14 m, the finer level's share falling 1 -> 0. No screen-door: wood shares the pixel's four samples between the two copies by `@builtin(sample_mask)` (complementary sets, 2x2 ordered rounding = 16 steps); each leaf comes and goes whole by its own number, which rides in the fraction of the vertex kind (`Mesh.leaf()`, under 0.4; everything reading the kind rounds). Share rides in instance `i1.z` with the wind exposure; `windExpo()` strips it. No fade without MSAA (`scatter.fade`). View cuts scale with canvas pixel size (`near` in `collect`, 1 at ~1400 px high, 0.4 at least); mirror and shadows keep `far`.
- Wind (`plantLean`, `boughAt`): lean saturates with wind speed; boughs rock on top of the plant's own rocking, phased by where they stand on the plan; leaf flutter phased per leaf. Tree sway weights are in metres (x14). Leaves use the same weight as the pad they sit on, and the extra flutter in `meshPlace` is tip-only (`0.002 + 0.0036 * v`), so a gust moves the crown as one mass. `meshPlace` and `meshPlaceLean` share one call, so both LOD copies, the shadow and perched insects move together.
- `Scatter.collect`: view culls plants under 1.5 px; mirror culls small far plants; near shadow culls small casters past 0.42 of reach.
- `?perf` logs CPU ms/frame and plant triangles (view / mirror / near shadow). Cliff view was 2100k / 1411k / 2023k before the cross-fade moved the view's cuts out; `trees` scene view went 1409k -> 3101k with it (mirror, shadow unchanged). Cost on a real GPU not measured.

## Walking, places, sound (source/app.js)
- Walk collision: `walkBuild` puts trunks and rocks (circles), reef domes, and a link closing any gap between two columns too narrow to walk through, on a 4 m grid; `walkStep` moves in 0.12 m sub-steps and pushes out of anything entered, so the walker slides round. `walkTop` makes rocks and coral a floor for the eye. Eye = max(ground + 1.65, water + 0.42, top).
- Places = the six views (`PLACES`, `spots`). The Places button and Shift+1–6 call `goPlace(i, false)` (instant). Bare 1–7 are cinematic spaces (`SPACES`): `applySpace(i, { cam: true })` runs `envCineBegin` (hour + weather over `dur` seconds, then `env.pin`) and flies to `spot`. Space 7 takes its hour from `astroMoonlitHour` and sets `env.spaceId` to 7. Spaces strip: first click light only; Shift-click / double-click also `goPlace(spot, true)`. Hour or Weather calls `envCineRelease`. `?space=N` snaps under `shot`/`read`, otherwise eases; `spacecam=1` flies on Enter. Water stays `WATER`. Fly and the ocean sim are unchanged.
- View 4 is found by `findShallows` on the height field (knee-deep, bank near one side, open sea on the other, sun behind). It and `findBeach` take no random numbers: keep every `rnd()`/`hunt` call in `main()` in order or the island replants.
- Audio: sources -> `master` -> `sfx` gain -> `under` filter -> out; score joins at `under`. SFX button / X (`ww-sfx` in localStorage), Music N, mute-all M.

- The day opens at `ENV_OPEN` (17.65, golden hour) and holds there until the hour is first changed; captures with `shot=` and no `tod=` still open at `ENV_H0`, the framed afternoon.
- Evening air: `airTau` adds a thin ground haze scaled by `F.day.w` (0 by day), which is what the low sun's shafts stand in.

## Shafts under trees

- Crown hulls were solid in both shadow maps, and the near cascade's coarser leaves are enlarged until they cover the hull, so a hole in the hull alone never reached the ground. `fsShadowMesh` (depth-only) discards hull fragments and crown leaves of plants scaled above 5 (forest trees, not palms) where a sun-aligned `leafCells` crack is. The test uses the leaned point the shadow map draws; the rest pose sits in a different column and the enlarged leaves seal it. Cracks have to be a few metres wide or the soft filter and the limbs close them. Low (`cloudOct` 1) keeps the thicker shade; high opens more columns. The same crack is open in every crown the ray meets, so the beam reaches the floor; trunks and rocks stay solid. Med/high also open a finer field that changes along the ray. No new pass or texture. The air march stays half-res, step count from `cloudOct`, and follows dynamic resolution.
- `motes`: open ground unchanged (`0.0009*land` × exp). Under forest the dust hangs in the volume (`smoothstep` off the floor, exp above ~2 m) and eases in rain; a low sun lifts it (`F.day.w`). No extra extinction. `shade()` adds a floor patch only where that shadow is open, under the roof, within ~2.6 m of the ground. Palm test still `shot=1&wx=clear&tod=16.5&sunview=0.7&shade`. Forest: `shot=1&q=low&wx=clear&tod=15.5&at=-58,64,200,-8,1.7&sunview=0.55&no=drops`.

## Frame rate

- Dynamic resolution (`dynScale` in `main`, applied at the end of `resize()`): one-second windows; under 40 fps the scale drops x0.85 (x0.7 under 24) to a floor of 0.5; over 55 fps for 8 windows it rises x1/0.85. A drop that gains under 5% is undone and locks further drops (not fill-bound). A rise taken back within 6 s sets a ceiling. Under 22 fps at the floor (or locked) for 4 windows: on the menu with a guessed preset (`autoQ`) it stores `ww-auto` in sessionStorage and reloads one preset down; in play it shows a hint once. Off for `?shot`, `?read`, `?dyn=0` and while `WW_BENCH.active()`. Thresholds are guesses: no real GPU was available. Reason: a Reddit visitor reported a slide show; desktop defaults to High.
- Known cost not addressed: grass is ~0.9 M vertices at High with no culling (8x what it was before the grass rework).

## Camera

- Controls are first person from Enter: `goPlace(0)` on the beach, walking, pointer lock requested by the Enter click. The orbit view (`openOrbit`) is now only `?studio`; a move key there hands over to walk or fly. Arrows alias WASD (`ARROWS`), `blur` clears held keys, Space hops on dry ground (`hop` lifts the eye only; collision stays at standing height), flying W/S follow pitch, dragging looks when the lock is refused. Ctrl still sinks in Fly but is not advertised: Ctrl+W closes the tab and cannot be prevented. A click with the mouse locked ripples the water at the centre of the view. A device with only a coarse pointer still opens in the orbit view, as before. None of this was driven by hand in a browser.

- After every mode but walking, the eye is held 0.45 m above the highest ground within 0.9 m (one clamp before `lookX = 0`). Places (orbit) had only `camY >= 0.35`, so an orbit swung over a hill put the eye inside the island, where the sea is drawn. Not captured: no parameter puts the camera under ground.

## Grass, bark, sea floor

- `cylinder()` (tree-fern, understory and shrub stems) is WOOD with a seam and uv, like `addLimb`. As SOLID these stems were flat brown from close to.
- `media/*.jpg` are README screenshots only (the page itself loads nothing). Early visitor stills sit in `media/before/`. Featured stills are tip `998a15d` UI-free `__png` reads (High 960×540, `?shot=&read&rf=8`), editorially cropped/graded to 1280×720 for GitHub: hero `lagoon`, places, storm/night/sunset, cliff/forest, `nine-views.jpg`, and `media/views/`. `og:image` points at `media/lagoon.jpg` on Pages.
- Grass tuft: 9 blades of two segments (`grassGeom`). Sizes: every tuft cut by its own factor and two smaller ones sown at its foot from `seeded(40507)`, after the main `rnd()` loop, so nothing else replants. `vsGrass`: bend is a share of the blade's own height (tip furthest, dips), gusts roll downwind as a wave, blades within 1.3 m of the eye lean away and lie down (eye under 3.2 m above that ground; seaweed too).
- Trunks: palm 18 sides / 48 rings, forest trunk 16 sides, limbs 10; bark shaders add cross cracks, scar lips, deeper furrows.
- Woody stems use `stemY(x,z,h,footR[,footBelow])`: bury past the downhill rim of the foot (`footR·(0.5 + 1.35·slope)`). Palms credit the mesh’s built-in −0.2·sc·sy dip via `footBelow`. Forest was only `h−0.15`, which floated large flared trunks on slopes.
- Sea floor: `caustic(p, foot)` is a colour: two layers of the interference field (the second rotated), domain-warped by noise, combined with `min` into a net of threads, three taps with red and blue displaced, projected up the refracted sun (`sunUnder`, never under 41 deg). Cells are 0.5 m at every depth (sized by depth, the net drew contour bands on slopes). It is normalised so its mean equals the flat light it replaced, and fades to that mean where a pixel covers more than a cell (`foot`), so shallows seen from the shore keep their brightness. The function before it was saturated over 90% of the bed and showed no net. With the eye under water the net is raised to the power 1.6 and renormalised (x0.71), since nothing smears it there; at the old contrast it barely showed against the bright sand. With the eye under water (`F.under`) the bed's sun term and absorption path use the refracted sun and the surface's Fresnel loss.
- Living Deep Ocean: bathymetry runs reef garden → wall → mid shelf → slope → abyss (SE basin/trenches tens of metres; local Math.max raises are weight-gated so they cannot clamp the open sea). Biomes plant accordingly; two 1800s wreck habitats (232,−45 and 240,10) with coral/kelp/fish colonisation; lanternfish (sp 11) + bed/fog biolum in the abyss; kelp/fans use `underSway`; UW audio muffles by depth, pressure rumble, wreck creaks. Streaming coarse LOD also covers flat abyssal cells (`maxY < −8`). Surface FFT / nearshore / optics preserved.

## Shadows
- Near cascade (2048^2, 20 m) is drawn every frame, texel-snapped. Baking only on eye movement froze swaying casters and made shadows jump.
- `shadowGrass` reads the height map (`sampleField` in `vsShadowGrass`), so it has its own layout, `groundPL` (frame uniforms + `htex`), and groups `bgGround` (island map) / `bgGroundN` (near map). The other shadow pipelines are on `skyPL`, uniforms only. It cannot go on `geoPL`: that group samples the two shadow maps the passes are drawing into.
- Flower shrubs cast via `shadowMesh` like other plants (collect keeps small r; petals are LEAF and get the light-axis slab in `vsShadowMesh`).

## Water
- Nearshore Gerstner (not the FFT): `shoreK` holds deep-water frequency and shortens k up to 1.48× as `tanh(kh)` falls; phase speed tracks `sqrt(gk tanh(kh))`. `shoalAmp` grows height only when group velocity drops (cap 1.42) and the 0.72 steepness cap still clips. Refraction turns the crest toward the uphill bed normal by `(1 - c/c_deep)` — a Snell blend, not a traced ray. Open-sea FFT dispersion stays `sqrt(gk)`. The shore SWE drive (`shore.js` `ocean`/`coupleK`) uses the same shorten+shoal so run-up mass matches the drawn crest. Distance fades (`seaFade` / `seaBands` / `waveWeights`) are untouched.
- Breakers are local hybrid overturn: Miche + `crestPack` trip, then a crest-face phase (steepen → pitch → curl → collapse). Plunge uses a hinge jet (sin/cos lip on the upper face). The **fine shore sheet** owns the surf (bed down to ~−2.55 m): `vsShore` applies Gerstner+hinge XZ/Y there; SWE η only on sand. Open-ocean disk yields where the sheet draws — curl was invisible when hinge lived only on the coarse disk and the sheet discarded underwater. Soft Iribarren spill/plunge/collapse/surge. Collapse dumps height and bursts `brk`/fold foam; spray rides the lip jet. Shore couple seeds foam from steep η into SWE. Tip throw is shoreward (+dirN). Not a foam texture.
- Water Fresnel is Schlick at F0 0.02 with the grazing peak pulled down by roughness (`waterFresnel`), shared by the mesh and the horizon fill. The breaking face is Beer through `W_KD`; crest light when the sun is behind the wave is a wrap, not a volume integral. Foam is a wrapped Lambert on top of that, and the GGX glint is eased where Fresnel already mirrors the sky.
- The open sea is a camera-centred disk, not a square of side `cover`. Inner rings (72% of the grid, out to 8 km) keep ~1 m spacing; the rest stretch that same surface out to 30 km, inside the projection far plane. `seaLod` still band-limits swell and shape on that radial spacing (not `max(cell.x, cell.y)`). The same weights scale the fragment normal, the finite-difference shape slope, and the reflection slope. Phase stays the shared Gerstner / FFT field. The shape cascade keeps its second period through that disk so a lone 220 m tile does not read as a square.
- Planar reflection holds land and plants only (no sky draw; alpha = coverage). Sky reflection is analytic per wave normal.
- Shadow dims the water body (`bodyK`), foam and sun glitter, never the mirrored sky.
- Sea floor is read wherever scene depth < 0.99999. The old 0.9995 cut made all water past ~200 m bottomless (dark lagoon from the air, hard line across the frame).
- Everything drawn after the blit (water, shore sheet, insects, drops) is hidden by land in its fragment shader, from the scene's depth texture (`hidden()`, top of `fsWater`). The blit writes no depth; the swap pass depth buffer holds insects only. Do not go back to a `frag_depth` copy plus hardware test.
- Shore sheet: hidden by anything more than 0.2 m off its own surface in world height. The old depth epsilon let it draw over trunks at any range and over the forest from the air.

## Known traps
- User screenshot (Chrome/macOS, old build, Fly, low sun): water-coloured patches on forest crowns. Not reproduced on SwiftShader beyond the shore sheet; real-GPU check still owed.
- Water vs near plane: `vsWater` slides verts level, never flattens onto near plane (was drawing sea in the sky when looking up).
- Water pipeline uses 16 of 16 sampled textures. The star map took the last slot, so the cloud buffer is folded into the air target instead of bound on water.
- `encCounted` facade must forward any new encoder method.

## Test (no GPU here: SwiftShader, software)
- Harness in /tmp/harness (not in repo): `scenes.sh <out> <html> [names]` captures, `places.mjs` trips, `walk.mjs` collision runs, `evalpage.mjs` one expression in the page.
- Capture params: `?shot=N&q=high&wx=..&tod=..&read[&rf=frame]`, plus `dyaw dpitch sunview shade up fwd side`, `at=x,z,yawDeg,pitchDeg,height`, `no=water,shore,drops,air`, `perf`. Multi-frame GPU readback: `?read&rf=N&seq=K&stride=S` fills `window.__pngs` (K frames) without reload.
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
- Daytime cumulonimbus stays visible: `discK` 0.55 and the march's `stormDim` no longer stack into a black void. Belly is darker than the anvil; billows stay readable. Exposure stays partly shut (`0.52`) so the island stays gloomy. Storm anvils are a thicker ice shelf.
- `bolt` / `boltStep` in `env.js`: strike position (70% within about 35 degrees of where the camera faces), strokes `[time, strength, decay]`, `bolt.now` is the brightness this frame. Thunder is queued at distance / 343 s and played by `audio.thunder(d)`.
- Uniforms `F.bolt` (xyz position, w brightness divided by exposure) and `F.boltB` (seed, channel shown) at floats 244..251; the frame buffers are 1008 bytes.
- The flash in the cloud is a density march, not a screen glow. `boltAt(p, d)` is the light at one sample (km). `boltMarch` integrates it. `fsBoltVol` draws that into the sky, additively, only while `bolt.now` is up, and only on sky pixels. `F.cloudOwn` skips the pass when a near-field volume march owns the low cloud; `volStep` adds `boltAt` on each sample so the flash stays inside the deck.
- Sea and plants take `boltOnSurf` (distance to the channel). Rain streaks and the air march take `boltNear`. Neither is a flat full-frame add.
- `boltSeen` in `fsSky` draws the channel as the ray's nearest pass to an upright at the strike, offset by three octaves of 1D noise, with two forks. It is drawn in the sky pass, so anything nearer hides it and nothing further than the strike exists to be wrongly in front.
- At most three strokes to a flash (WCAG's limit is three flashes a second). With `prefers-reduced-motion` a flash is one slow swell at 0.35.
- Off in `read`/`shot` captures. `?bolt=1` holds a ground stroke ahead of the camera, `?bolt=2` an in-cloud flash, `&far=<m>` sets its distance.
- Not verified: thunder by ear, and the flash in motion on a real GPU. The WGSL gate load is green (pipelines include `fsBoltVol`). A longer SwiftShader run loses the device on frame 2 here, and it does the same on unmodified main.

- Found while testing the storm on the real page: `api.air` named `airCoastF`, which does not exist, in the gust whoosh (gust over 7 m/s and rising). It threw and stopped the frame loop for good. It had been there since the shared-wind commit and would trip in Wind gusts and Tropical shower with sound running; now `airCoast.filter`. The capture harness never ran it because captures have no audio.

## Visual polish (foliage, grounding, water LOD, shore rocks)

- Leaf shade: dry leaves are rougher (`*1.48`) and take a softer specular (`0.48` vs `1.85`); wet weather only lifts leaf gloss a little while non-leaf wet stays shinier. Leaflets use tip/midrib/blotch thickness → variable transmission. Crown hulls derive leaf/gloss from `leafCells` so thin clump edges filter green light.
- Grass + flower shrubs cast into near and island shadow maps (`shadowGrass` early-compile; blades widened/extruded in the depth pass; flower petals extruded toward the light). Contact AO still mottles sand under meadow/flower patches as a soft fill.
- Grass blade feet darkened via `uv.y`.
- Water: `seaBands` fine fade widened 28→260 m; chop fades on its own distance/footprint with band.x only softening; capillary and chopField keep ranges widened.
- Shore rock clusters on the wet-sand strip left/right of the skiff (budget from `q.rocks`, seaward axis from `downhillYaw`), partially buried.
- Dove/owl coo removed from singers (soft low notes read as a hoot). Ambient SFX is tropical only: warbler / trill / chirp cascade (≥~2.4 kHz) plus cicadas/crickets/insects — all synthesised, no samples.

