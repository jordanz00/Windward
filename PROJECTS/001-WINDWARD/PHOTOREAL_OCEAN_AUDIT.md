# Phase 1 — Existing ocean engine audit

**Date:** 2026-11-25 (America/New_York)  
**Sources audited:** `source/ocean.js`, `source/shore.js`, `source/shaders.js`, wiring in `source/app.js`  
**Tip of `main` at audit:** `b2bbe71` (includes Shoreline curl/break #42)  
**Method:** Read implementation; no guessing. No shader/product build in this phase.

---

## Executive finding

Windward already has the three pillars the brief assumes:

1. **Spectral FFT ocean** (multi-cascade Tessendorf-style tiles)  
2. **Gerstner swell + hinge-jet breaking approximation** in `seaAt`  
3. **Shallow-water (SWE) shoreline solver** with foam, wet sand, and seaward coupling  

The weakness is not “missing systems.” It is **how they combine into the visible breaker**, plus a hard geometric limit: **a single heightfield (even with horizontal tip displacement) cannot represent a true multi-valued overturning surface**. Recent #42 correctly moved the hinge onto the fine shore sheet and fixed several lip bugs; that improves *readability* of the approximation — it does **not** remove the heightfield ceiling the brief calls out.

**Recommendation alignment:** Build a localized breaking representation next (mesh ribbon and/or particle whitewater), then polish material. Do not spend the next cycle on isolated Fresnel/foam cosmetics.

---

## 1. How FFT ocean waves are generated

**File:** `source/ocean.js`

- Resolution `OCEAN_N = 128`.
- GPU path: `evolve` (deep-water dispersion `ω = √(g|k|)`) → `ifft_rows` / `ifft_cols` → `slopes` writes `rgba16float` as `(h, ∂h/∂x, ∂h/∂z, 1)`.
- Spectrum `makeOceanH0`: Phillips base + directional wind/spread + cross-swell + **JONSWAP peak** + Hermitian conjugate symmetry; CPU IFFT used only to normalize height or slope std-dev.
- Explicit comment: FFT tiles are **deep-water open sea**, not SWE. Depth, shoaling, and breaking live in Gerstner (`seaAt`) + shore grid.

**Cascades wired in `app.js`:**

| Cascade | Tile size | Role |
| --- | --- | --- |
| Shape | 220 m | Mesh displacement (mid body) |
| Glint | 4 m | Slope field for sun glitter |
| Chop | 24 m | Wind chop between swell and capillaries |

Shared sampler `OCEAN_TAP_WGSL` / `oceanTap` is included in both ocean and shore WGSL so the shore coupling band samples the **same** shape field the water draws.

**Long swell** is intentionally **not** FFT: Gerstner set in `seaAt` owns horizon-scale trains so the disk is not a tiled patch.

---

## 2. Displacement and normals

**Primary field:** `seaAt(xz, scale, depth)` in `shaders.js`

- Up to 8 Gerstner layers (`WAVES` in `app.js` + steepness `Q`).
- Horizontal + vertical Gerstner displacement; analytic normals from the same phases.
- Near shore: `shoreK` / `shoalAmp` (frequency hold, shorter `k`, amplitude growth as group velocity falls), mild crest refraction toward bed gradient, crest-line drift offshore.
- Steepness capped (`k A Q > 0.72` → amplitude reduced) — prevents numerical fold in the base Gerstner field.

**FFT contribution:**

- `shapeField` / `chopField` add height and slopes; `waveWeights` + `seaLod` fade cascades with distance/grazing.
- Vertex (`vsWater` / `vsShore`) and fragment weights are shared so lit normals track mesh LOD.
- Capillary bands add fine slope for glitter; `waterFresnel` + `ggxGlint` for material.

**Jacobian** `(1−jxx)(1−jzz)−jxz²` is tracked for fold/foam/caustic focus — a Tessendorf-style signal, not a separate overturn mesh.

---

## 3. How the hinge-jet breaking approximation works

Inside `seaAt`, for primary bands `i ≤ 2` when `kUse * D < 2.35`:

1. **Trip** where depth-limited wave height (`H/h`) or steepness crosses thresholds, gated by along-crest `crestPack` (patches, not a continuous bar).
2. Soft **Iribarren ξ** weights spill / plunge / crumple / surge.
3. Phase stages: steepen → pitch → curl → fall.
4. **Hinge jet:** tip verts rotate in the crest section (`ang` capped ~0.9–2.0 rad after #42), mid-face holds height, tip throws shoreward, then dumps down — intended to read as lip → collapse.
5. Outputs: extra `disp`, tilted normals, `brk` scalar, Jacobian increments.

**Spray:** `vsDrops` shore-spray slots use `seaAt.brk` + Jacobian focus + shore foam/velocity; camera-local lattice, not a persistent whitewater volume.

**#42 fixes already on `main` (relevant):**

- Fine shore sheet now owns surf (draws bed ~to −2.55 m); open-ocean disk yields there.
- `vsShore` applies full Gerstner + **hinge XZ** (previously missing → no overhang on sheet).
- Surf→SWE mix no longer flattens the breaker belt; SWE dominates only after sand handoff.
- Hinge `ang` capped so `sin(ang)` does not zero the tip throw.
- Plunge forced near beach (tropical ξ often scored surge/spill).
- Denser shore mesh presets + `shoreWarp` concentrating verts in the breaker belt.

---

## 4. Why breaking waves still do not look fully convincing

Documented architectural limits (not “forgot to turn a knob”):

| Limit | Evidence |
| --- | --- |
| **Single-valued surface** | Comments in `seaAt`: “FFT / Gerstner stay single-valued; overturn is a hinge jet.” One `y` per horizontal sample; overhang is only tip XZ throw on a connected triangle sheet. True tube / multi-valued lip is impossible without extra geometry or particles. |
| **Steepness clamp** | Base Gerstner never reaches genuine overturn; hinge is a post-process add-on on already-capped waves. |
| **Render vs solve mismatch** | Shore SWE drive (`ocean()` in `shore.js`) uses Gerstner + FFT height/velocity **without** the hinge overturn displacement. The lip the eye sees is not the mass/momentum the wash integrates. |
| **Spray ≠ collapse volume** | Spray is sparse camera cells keyed by `brk`; no suspended droplet field or collapsing whitewater body. |
| **Foam can still dominate the read** | Shore foam + `foamCover` lace are strong; if hinge scale is weak on a given GPU/preset, the beach still reads as “white band on a sheet.” |
| **Mesh resolution budget** | Shore sheet 256–384² over the SWE domain (~0.32 m sim cells). Lip features smaller than a few triangles smear. |

Cosmetic shader-only passes cannot clear the heightfield ceiling.

---

## 5. Shoreline solver ↔ ocean wave information

**File:** `source/shore.js`

- Grid: `320 × 176`, `dx = 0.32` m (~102 × 56 m).
- State: `(h, vel.xy, foam)` + wet map `(wet, bed, groundFoam)`.
- Scheme: well-balanced HLL shallow-water with bed; foam advected with volume flux; wet-sand residual; rock bed stamps.
- **Seaward coupling band** (`off` / `z` rows): mixes cell state toward `ocean(xz, depth)` — shoaled Gerstner (4 bands) + `oceanSample` FFT height, depth-aware `coupleK` / `coupleAmp`.
- Uniforms track `wp.amp/spd/dir/frq` and `WAVES[]` so weather/place swell agree with the drawn sea **at the parameter level**.

**Gaps:**

- Coupling does not ingest hinge/`brk` / overturn geometry.
- Drawn beach heightfield cusps are sim-only (visual beach stays smooth by design) — good for fingers of wash, but breaker silhouette is entirely the render mesh’s job.
- Two water draws: camera-centered ocean disk (`vsWater`) + shore sheet (`vsShore`). #42 reduced the worst disconnect; residual seams remain a risk at the disk/sheet handoff.

---

## 6. Geometry resolution

| Surface | Preset resolution | Notes |
| --- | --- | --- |
| Ocean disk | water 200 / 248 / 288 | Radial rings; far cells huge — fine for swell, poor for nearshore lip (hence shore sheet) |
| Shore sheet | shore 256 / 320 / 384 | Owns surf after #42; `shoreWarp` packs verts into breaker belt |
| FFT | 128² × 3 tiles | Adequate for mid/chop; not a breaker mesh |
| SWE | 320×176 @ 0.32 m | Good for wash/foam; not for curling geometry |

---

## 7. Timing, coordinates, amplitudes

- Shared simulation `time`; shore substeps CFL-limited (`dt/n`, n≤5).
- Shore frame axes: `along` / `sea` from beach normal; origin from `findBeach` anchor.
- Swell heading set onshore at plant time (`wp.dir` / `WATER.dir`).
- FFT shape sampled in rotated world xz / 220 m — same tap as water.
- Amplitude path: `wp.amp * env.sea` into both Gerstner uniforms and shore drive.

**Agreement is intentional and mostly coherent.** The remaining inconsistency is **kinematic**: hinge overturn on the sheet vs non-hinge SWE drive.

---

## 8. Can the current architecture support actual overturning geometry?

| Approach | Compatible with keep-FFT/SWE? | Verdict |
| --- | --- | --- |
| More hinge / steeper Gerstner on the heightfield | Yes | Diminishing returns; still single-valued |
| Localized **breaker ribbon mesh** (or short strip of verts) driven by crest trip | Yes — additive draw | Matches brief; preserves island/ocean |
| Particle / foam-volume whitewater + spray | Partially present (drops); needs denser, collapse-coupled emission | Matches brief for collapse/whitewater |
| Full 3D free-surface / SPH rewrite | No (unnecessary rewrite) | Reject for Windward scope |
| Pure material / Fresnel polish first | Orthogonal | Explicitly deprioritized by founder |

**Answer:** The **stack can host** real overturn as an **additive localized system**. The **current surface representation cannot**. Phase 3 should introduce geometry (or dense particles) that can occupy multiple heights at one horizontal position, fed by the existing trip/`brk`/SWE signals — not another foam texture on a flat sheet.

---

## Mapping brief phases → current state

| Brief phase | Current state | Next engineering move |
| --- | --- | --- |
| 1 Audit | Done (this doc) | Founder read + approve Phase 3 approach |
| 2 Open ocean | Strong baseline (3 FFT + Gerstner + capillary) | Incremental spectra/LOD; not the first build |
| 3 Breaking | Hinge approx + #42 sheet ownership | **Localized overturn system** |
| 4 Shoreline | SWE foam/wet/backwash present | Feed breaker collapse into SWE; timing irregularity |
| 5 Material | Fresnel, absorption, caustics, turquoise/deep already | Polish after geometry reads |
| 6 Validation | Showcase views exist; no formal five-scene ocean harness | Add capture checklist once Phase 3 lands |

---

## Honest gaps (do not claim without evidence)

- No real-GPU screenshot comparison was run in this audit phase.  
- Headless / SwiftShader can under-read hinge lips (#42 notes SwiftShader specifically).  
- “Photorealistic” and “genuinely curling” remain **aspirational** until Phase 3+ validation scenes pass.

---

## Suggested first build (pending approval only)

1. Design a **localized breaker strip** (or particle whitewater volume) spawned where `seaAt` trip/`brk` is high along the shore sheet.  
2. Keep FFT + SWE + island untouched except thin coupling hooks.  
3. Validate with Palm Beach close-up + Offshore scenes before material polish.  
4. Gate with existing `build.mjs` / `wgsl-gate` / budget caps; AEI evidence if claiming a measured win.
