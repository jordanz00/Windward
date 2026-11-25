# Photoreal breaking surf — localized 3D breaker ribbon

**Branch:** `cursor/breaking-surf-mesh-3d27`  
**Base:** PR #50 `cursor/photoreal-ocean-visual-abb3` (`7a62bdb` tip)

## Goal

Add multi-valued breaker geometry on top of FFT + Gerstner hinge + SWE — without raising global amplitude or foam brightness as a substitute for curl.

## Implemented

| Piece | Where | Notes |
| --- | --- | --- |
| Shared `breakerEvt` | `source/shaders.js` | One event from `seaAt` (brk/jac/disp/nrm) + shore vel/depth; drives lip, whitewater, spray, lighting |
| Breaker ribbon mesh | `vsBreaker` + `app.js` | 64×8 / 96×10 / 128×12 (low/med/high); alongshore × cross-section; live-gated (no permanent tube) |
| Draw path | `pipes.breaker` after shore | Additive over sheets; `sheet=2` in `fsWater` |
| Jagged seams | `shoreWarp`, sheet ownership soft weights, waterline ragged alpha, vsShore run-up noise | Soft handoff vs binary discard |
| Foam holes | `holeGate` + lace in collapse foam; tongue-gated SWE foam seed | Clear-water gaps between tongues |
| Collapse spray | `vsDrops` uses `breakerEvt` | Spray from collapse region, not freckles |
| SWE dump irregularity | `source/shore.js` | Dual-cusp tongue + crest pulse dump |
| Island damp | `source/island.js` | Full amp through breaker belt (`ss(0.2,-0.05,h)`) |
| FFT coherence | `source/ocean.js` comment | Tiles stay deep-water; ribbon owns overturn |

## Gates

- `node source/build.mjs` — budget OK (~195.9 KB critical gzip / 200)
- `node source/wgsl-gate.mjs` — STATIC OK, LOAD OK `playing: true`

## Proof media

Store: `/cursor/stores/bc-7ad563dd-c02b-400f-85f1-8699b84dfe10/media/breaking-surf/`

- `beach-breaker.png`, `beach-breaker-b.png`, `frame-00..02.png`
- `capture-meta.json` — SwiftShader headless

## Honest verification

| Claim | Status |
| --- | --- |
| Ribbon mesh + pipeline compiles and draws | **Verified** (wgsl-gate load + `?read` stills) |
| Shared event wires geometry / foam / spray / SWE | **Implemented** (code path) |
| Photoreal curling lip / tube on real GPU | **Not visually verified** — SwiftShader softens overhang; real Chrome/GPU is acceptance |
| Jagged waterline fully gone | **Improved in code**; still visible under SwiftShader low-Q |

Do **not** treat SwiftShader captures as photoreal acceptance.
