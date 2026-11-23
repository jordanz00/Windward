# WINDWARD_NOTES

Compact working notes. Update, do not grow.

## Layout
- `source/*.js` -> `node source/build.mjs` -> `index.html` (single file, budget 200 KB gz).
- Order: gpu, island, sky, shaders, ocean, fish, env, insects, app. One WGSL module from `shaderCode()`.
- Frame uniform 244 floats. Env block at 188. Sky vec4s: cldA 220, cldB 224, cldC 228, skyS 232, skyD 236, cldE 240.

## Sky (source/sky.js)
- Noise 96^3 rgba8 (compute, once). Weather map 512^2 (radial warp, WX_K 30 km): r cumulus, g tower, b anvil, a deck.
- Cloud shadow map (CS_K 5 km): r sun transmittance, g occluder height. Read by land, water, air pass, animals via `cloudShade`.
- Panorama: 2 layers x 5 mips, baked one strip per frame, alternate layers, blended (`skyBlend`). Mip 4 = `skyDim` for irradiance.
- Shafts: in bake, air in-scatter removed along shadowed stretches of each ray (shadow map). No screen-space streaks.
- Camera altitude clamp 2..400 m in bake. Camera never above cloud base.
- Quality: `q.clouds` 1..3 -> march steps / light taps; `q.sky` [W,H,strips,shadowN].

## Light (source/env.js)
- `env.space` = sun above the air. `keyCol = space * envSunT(sy, haze)` (Chapman, same as WGSL `sunT`). No gold tints anywhere.
- Exposure meter is view-dependent: `env.face` (camera . sun) set in app before `envStep`.
- Cumulus thins with sun height (`heat`) in `envSky`.
- Air pass (`fsAir`): L = a * (sunCol * vis * cloudShade * phase + skyDim). Normalised HG phase. No boosts.

## Known traps
- Water vs near plane: `vsWater` slides verts level, never flattens onto near plane (was drawing sea in the sky when looking up).
- Water pipeline uses 15 of 16 sampled textures.
- `encCounted` facade must forward any new encoder method.

## Test (no GPU here: SwiftShader, software)
- Harness in /tmp/harness (not in repo): `scenes.sh <out> <html> <port> [names]`, `dev.sh` sky-only page, `dbg.mjs` patched builds.
- Capture params: `?shot=N&q=high&wx=..&tod=..&read[&rf=frame]`, plus `dyaw dpitch sunview shade up fwd side`.
- App capture 1-4 min each at 800x500.

## Measured (SwiftShader, 4 cores, 800x500, High; s/frame, before -> after)
- beach up 10.0 -> 2.1, cliff panorama 8.0 -> 3.3, sunset 8.0 -> 2.0, golden side 10.0 -> 3.3, towers 8.0 -> 1.8.
- Build: gzip 117.4 KB, brotli 99.4 KB (was 113.8 / 96.5).
- Adjacent frames: sky diff ~0; 40 frames apart: cloud edges only (drift), no strip seams.

## Open
- Shore sheet has a straight vertical edge where it meets the sea mesh (pre-existing; seen at beach, left of frame).
- Bird's-eye: straight boundary low in frame over the lagoon (pre-existing).
- No real-GPU timings yet.
