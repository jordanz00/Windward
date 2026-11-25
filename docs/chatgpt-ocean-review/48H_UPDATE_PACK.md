# Windward — 48-Hour Update Pack for ChatGPT Review

**Repo:** jordan-zabady/windward-8148 (Windward / Project 001)  
**As of:** 2026-11-25 (America/New_York)  
**Purpose:** Give ChatGPT a complete, honest picture of what changed so it can recommend the next visual improvements.  
**Architecture rule:** Extend FFT + Gerstner + hinge + SWE. Do **not** propose a full engine rewrite.

---

## 1. Current tips / PRs

| Ref | State | Notes |
| --- | --- | --- |
| `main` tip | `abe19c3` | Includes Stage 1 (#45), same-day ocean (#49 land), volumetric clouds, vines/flora, cinematic viewpoints |
| Open PR **#50** | `cf9c50f` on `cursor/photoreal-ocean-visual-abb3` | Visual staging + #44 lip amplify consolidation — **not merged yet** |
| Baseline hinge tip | `b2bbe71` (#42) | Fine shore mesh owns surf hinge overturn |
| Closed #49 | landed via merge to main | Same-day damp/amp/shoaling drive |
| Closed #44 | **not** merged as PR; geometry folded into #50 | Shore lip amplify |

**Best tip for ChatGPT to reason about “latest ocean code”:** PR #50 head `cf9c50f` (visual branch), which sits on top of current `main`.

---

## 2. Ocean architecture (unchanged pillars)

Still in place:

1. **FFT ocean** (`source/ocean.js`) — multi-cascade Tessendorf-style tiles; deep-water dispersion; JONSWAP-ish peak; shared `oceanTap` with shore.
2. **Gerstner + hinge** (`source/shaders.js` `seaAt`) — long swell, shoaling (`shoreK` / `shoalAmp`), Jacobian, Iribarren-ish spill/plunge/surge, **hinge-jet overturn** (single-valued heightfield limit).
3. **SWE shoreline** (`source/shore.js`) — height/velocity/foam/wetness; seaward coupling band driven by Gerstner+FFT `ocean()`.
4. **Render** (`vsWater` / `vsShore` / `fsWater` / `vsDrops`) — Fresnel, refraction, Beer, foam lace, spray particles, shore sheet.

**Hard limit (documented in audit):** a single heightfield cannot represent a true multi-valued curling tube. Hinge is an approximation. Photoreal curl likely needs a **localized breaker mesh or particle whitewater body**.

---

## 3. Chronological ocean / coastal changes (last ~48h)

### A. Shoreline curl ownership — #42 (`b2bbe71`)

- Fine shore mesh owns surf; open-ocean disk yields there.
- `vsShore` applies full Gerstner **+ hinge XZ** (was missing → no overhang on sheet).
- Plunge forced near beach; hinge `ang` capped so `sin(ang)` stays useful.
- Denser shore presets + `shoreWarp` concentrating verts in breaker belt.

### B. Phase 1 audit + brief — #43

Docs only: `PHOTOREAL_OCEAN_AUDIT.md`, `PHOTOREAL_OCEAN_BRIEF.md`.  
Finding: systems exist; weak link is **combined breaker readability** + heightfield ceiling. Do not spend next cycle on Fresnel cosmetics alone.

### C. Stage 1 shoaling + ocean↔shore coherence — #45 (`af6255b`)

- `shore.js` `ocean()` aligned with `seaAt` (deepW, feel, collapse, envelopes, coupleK/Amp).
- Softer depth-aware seaward coupling; Miche-like foam seed.
- Earlier/stronger `shoreK` / `shoalAmp` in shaders; `vsShore` crest→SWE handoff less flattening.

### D. Same-day amp + beach damp fix — #49 land (`8b9fd10` on main)

**Root cause:** `island.js` heightfield damp + lagoon shelter were muting Gerstner amp on the default beach (~0.28 scale).

Fixes:

- Swash damp dies only on nearly dry sand.
- Softer lagoon lee.
- `seaAt` nearshore `scaleUse` floor.
- Stronger shoaling / hinge / shore dump inland momentum.
- Higher default swell amp / mood foam; tighter FFT wind spread.
- Spray/foam scaled harder from `brk`.

**Honest:** compile + smoke OK; SwiftShader captures did **not** prove coastal photoreal.

### E. Volumetric clouds — landed on main (`b891786`)

- 3D density raymarch, self-shadow, half-res march always-on.
- Relevant for ocean because sky reflections / atmosphere must match.

### F. Visual completion pass — open #50 (`edf1525` → `cf9c50f`)

Focus: **breaking process sequence**, not more amplitude.

Implemented in code:

1. Stage steepen → pitch → curl → fall; **dump delayed to fall** so lip can hang.
2. Residual post-collapse whitewater body (travels, doesn’t vanish).
3. Darker translucent break face under lip (not early whiteout).
4. Foam dens from collapse/section; shore tongues + clear-water holes (anti-strip).
5. Crest-gated irregular SWE dump + alongshore cusp bias.
6. Spray: droplet + mist layers inheriting break jet / wind / gravity.
7. Folded **#44 amplify** into that sequence: wider tip (`pow` 1.55), stronger forward pitch, soft tip drop, lip elevate on curl, denser shore mesh (320/384/448), stronger `shoreWarp`, surfBelt `lipBoost`.

**Gates:** `build.mjs` + `wgsl-gate.mjs` pass (`playing: true`, criticalGzip ~194/200 KB).

**Visual verification:** SwiftShader / `q=low` `?read` frames reviewed — **still not coastal-footage quality**. Photoreal acceptance **not claimed**.

---

## 4. Key files ChatGPT should inspect

| File | Why |
| --- | --- |
| `source/shaders.js` | `seaAt`, `shoreK`, `shoalAmp`, `vsShore`, `shoreWarp`, `fsWater` foam/face, `vsDrops` spray |
| `source/shore.js` | SWE step, seaward `ocean()` coupling, dump, foam advect |
| `source/ocean.js` | FFT spectrum / directional spread / `oceanTap` |
| `source/island.js` | Heightfield damp (wave amp 0..1) — beach mute root cause |
| `source/app.js` | `WAVES`, `WATER`, quality presets / shore resolution |
| `source/sky.js` | Volumetric clouds (atmosphere + ocean reflections) |
| `PROJECTS/001-WINDWARD/PHOTOREAL_OCEAN_AUDIT.md` | Architectural limits |
| `PROJECTS/001-WINDWARD/PHOTOREAL_OCEAN_SAME_DAY.md` | Same-day delivery report |
| `PROJECTS/001-WINDWARD/PHOTOREAL_OCEAN_VISUAL_PASS.md` | Visual pass honesty report |

---

## 5. What looks improved (code-level claims)

- Shared shoaling kinematics between render and SWE drive.
- Beach no longer amplitude-starved by damp/shelter.
- Break stages more explicit; dump not simultaneous with curl.
- Shore run-up receives inland dump momentum from collapse events.
- Foam/spray more event-driven than global brighten.
- Shore sheet denser + warped toward breaker belt for lip verts.
- Clouds more volumetric on main.

---

## 6. What is still wrong / unfinished (priority for ChatGPT)

### P0 — Visual break sequence still not photoreal

SwiftShader captures still show flat/milky nearshore, weak lip curl, weak collapse→wash narrative. Need **real-GPU** med/high validation; code changes alone are insufficient proof.

### P0 — Heightfield cannot true-curl

Recommend ChatGPT propose a **minimal localized breaker representation** (ribbon mesh and/or particle whitewater volume) that:

- samples the same `seaAt` trip/`brk`/depth signals,
- only exists in the breaker belt,
- does not replace FFT/Gerstner/SWE,
- stays in budget.

### P0 — Shoreline wash still can read as a strip

Need irregular tongues, clear-water holes, visible run-up then backwash interacting with next wave — verified in frames, not just shader intent.

### P1 — Spray / mist volume

vsDrops improved, but droplet density and backlit mist still weak at low drop budgets. Need collapse-gated bursts that read in beach close-ups.

### P1 — Atmosphere ↔ ocean

Volumetric clouds landed; still need consistent storm lighting, ocean reflections, and no washed-out horizon hiding the surf.

### P2 — Performance

Preserve WebGPU packing, quality presets, budget gate (gzip≤400 / brotli≤350 / critical≤200). Any breaker mesh/particles must be LOD’d.

---

## 7. Acceptance criteria (still not met)

Do **not** call done until real-GPU captures show:

1. Swell approaching beach  
2. Visible shoaling / steepening  
3. Forward-pitched curling lip  
4. Collapse into aerated whitewater  
5. Airborne spray from that collapse  
6. Irregular run-up tongues on sand  
7. Backwash seaward into next wave  
8. No continuous white foam bar  
9. No flat pond-like waterline  
10. Stable frame rate on med/high  

Distinguish always: **Implemented / Compiled / Smoke-tested / Visually verified on real GPU.**

---

## 8. What we want ChatGPT to produce next

Please propose the **smallest next implementation plan** that maximizes visual realism of the break→wash sequence, given the existing architecture.

Prefer:

1. Localized breaker geometry/particles over more Gerstner amplitude.  
2. Stronger event coupling (one `brk`/trip signal → mesh, foam, spray, SWE dump).  
3. Concrete WGSL/JS edit targets with before/after visual checks.  
4. Capture framing recipes (`?shot=&read&q=med&wx=`).  

Avoid:

- Full ocean engine rewrite  
- More global foam brightness  
- More open-ocean amplitude as a substitute for breaking  
- Claiming photoreal without real-GPU frames  

---

## 9. Capture recipes used (for comparison)

SwiftShader headless (limited fidelity):

- Shore: `?q=low&shot=1&read&rf=40&t=14&space=0`  
- Offshore: `?q=low&shot=5&read&rf=36&t=12&space=2`  

Recommended for real GPU:

- Beach clear: `?q=med&shot=1&space=0` or Blue Paradise space  
- Beach storm: `?q=med&shot=1&wx=storm` or Tropical Storm space  
- Offshore swell: `?q=med&shot=5`  
- Optional GPU readback: `?read&rf=60&seq=4&stride=8`

Artifacts on agent VM (not photoreal proof):  
`/opt/cursor/artifacts/visual-ocean-shore.png`, `visual-ocean-offshore.png`, earlier `photoreal-ocean-*.png`, historical `#42` `breaking-wave-beach-curl.png`.

---

## 10. One-sentence status

Windward now has a coherent extended coastal stack (FFT + shoaled Gerstner hinge + SWE + volumetric clouds) with staged break/wash code on open PR #50, but **has not yet visually proven photoreal breaking surf on a real GPU**, and the heightfield still cannot form a true curling tube without additional localized geometry.
