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

## Plants (source/app.js)
- Forest tree: trunk + limbs, per lobe a solid hull (kind CROWN, never alpha-tested) and leaf sprays (kind LEAF, 4 verts / 2 tris each). LOD0 hull 0.78 + all sprays, LOD1 hull 0.92 + 1 spray in 4 (bigger leaves), LOD2 hull only. Cuts [0, 50] + bias 28 m.
- Crown hull shading (`fsMesh` kind 3): leaf-cell tone and tilt at three scales chosen by pixel footprint; far = boughs. No discard, no dither.
- Broad/canopy plants: LOD0 arched multi-segment blades (`addLeaflet` segs), LOD1 flat 3-tri blades.
- `Scatter.collect`: LOD hysteresis 6% (view only); view culls plants under 1.5 px; mirror culls small far plants; near shadow culls small casters past 0.42 of reach.
- `?perf` logs CPU ms/frame and plant triangles (view / mirror / near shadow). Cliff view: 2256k / 1411k / under 2024k (was 2975k / 1734k / 1882k before the leaf crowns, 4930k / 3193k / 3589k with 7-vertex leaves).

## Shadows
- Near cascade (2048^2, 20 m) is drawn every frame, texel-snapped. Baking only on eye movement froze swaying casters and made shadows jump.

## Water
- `vsWater` band-limits displacement by the vertex's own grid cell (`WGRID`, `kSwell`, `kShape`): coarse cells along the grid axes stood up as rows of teeth on the horizon.
- Planar reflection holds land and plants only (no sky draw; alpha = coverage). Sky reflection is analytic per wave normal.
- Shadow dims the water body (`bodyK`), foam and sun glitter, never the mirrored sky.
- Sea floor is read wherever scene depth < 0.99999. The old 0.9995 cut made all water past ~200 m bottomless (dark lagoon from the air, hard line across the frame).

## Known traps
- Water vs near plane: `vsWater` slides verts level, never flattens onto near plane (was drawing sea in the sky when looking up).
- Water pipeline uses 15 of 16 sampled textures.
- `encCounted` facade must forward any new encoder method.

## Test (no GPU here: SwiftShader, software)
- Harness in /tmp/harness (not in repo): `scenes.sh <out> <html> <port> [names]`, `dev.sh` sky-only page, `dbg.mjs` patched builds.
- Capture params: `?shot=N&q=high&wx=..&tod=..&read[&rf=frame]`, plus `dyaw dpitch sunview shade up fwd side`, `at=x,z,yawDeg,pitchDeg,height`, `no=water,shore,drops,air`, `perf`.
- Not verified here: real-GPU frame times, motion stability (no MSAA/TAA: thin geometry still aliases under motion).
- App capture 1-4 min each at 800x500.
