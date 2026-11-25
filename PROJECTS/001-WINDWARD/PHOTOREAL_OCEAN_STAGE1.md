# Photoreal Ocean — Stage 1 (Shoaling + Ocean↔Shore Coherence)

**Status:** In progress  
**Branch:** `cursor/photoreal-ocean-stage1-abb3`  
**Baseline tip:** `b2bbe71` (curl/break hinge) + Phase 1 audit on `main` (`369af41`)  
**Related:** [PHOTOREAL_OCEAN_BRIEF.md](PHOTOREAL_OCEAN_BRIEF.md) · [PHOTOREAL_OCEAN_AUDIT.md](PHOTOREAL_OCEAN_AUDIT.md)

## Why this stage first

Founder priority order still ranks **breaking-wave geometry** highest overall. Implementation order for a coherent sim, matching the Cursor brief, starts with **shared wave physics** so later breaker / swash / foam / spray work on one signal:

1. Wave propagation and shoaling (this stage)
2. Breaking geometry (Stage 2)
3. Shoreline swash / backwash (Stage 3)
4. Foam and spray tied to break intensity (Stage 4)
5. Material polish only after the sim reads (Stage 5)

Stage 1 does **not** add foam noise or Fresnel cosmetics.

## Goal

Make deep→shallow wave behavior and the SWE seaward drive agree with the same shoaling kinematics the renderer uses in `seaAt`, so mass, momentum, and foam seed track the crest the eye sees.

## Changes

| Area | File | Change |
| --- | --- | --- |
| Shore drive | `source/shore.js` `ocean()` | Match `seaAt`: deep-water swell attenuation, depth `feel`, shallow collapse, crest envelopes, same steepness caps |
| Coupling band | `source/shore.js` `csShore` | Wider/softer row blend + depth-aware weight; Miche-like foam seed from drive steepness / H/h |
| Shoaling | `source/shaders.js` `shoreK` / `shoalAmp` / `seaAt` | Earlier mid-depth stand-up; slightly stronger shoal growth; smoother deep→shallow amp |
| Crest→SWE | `source/shaders.js` `vsShore` | Keep Gerstner/hinge longer into ankle depth; less crest flattening at sheet handoff |

## Out of scope (later stages)

- Localized breaker mesh / particle whitewater body
- Full hinge dump into SWE mass (true lip volume)
- Foam lace redesign / reflection polish
- New FFT cascade architecture

## Gates (this branch)

| Gate | Result |
| --- | --- |
| `node source/build.mjs` | Passed (budget-gate OK; criticalGzip 191.6 / 200 KB) |
| `node source/wgsl-gate.mjs` | Passed — static OK + WebGPU compile + smoke load (`playing: true`) |

Visual photoreal acceptance (scenes A–H in the Cursor brief) is **not** claimed from compile alone. Stage 1 acceptance below is sim-coherence scoped; full coastal-footage comparison waits on real-GPU captures after merge/review.

## Acceptance (Stage 1 only)

- Waves visibly slow / shorten / steepen approaching the beach (not only foam brightening) — code path aligned; visual confirm pending real-GPU
- Coupling band does not freeze a hard white strip at a fixed row — soft row + depth gate landed
- Shore height/velocity drive is recognizably the same swell family as the rendered Gerstner field — `ocean()` mirrors `seaAt` shoaling terms
- Existing hinge/break path still compiles and runs (no regression to #42 lip ownership) — wgsl-gate smoke OK
