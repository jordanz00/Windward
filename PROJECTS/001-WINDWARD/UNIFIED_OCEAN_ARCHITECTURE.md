# Windward — Unified Ocean & Coastal Fluid Simulation

**Priority:** P0 architecture stabilization  
**Status:** Milestone A in progress (this PR). Milestones B–G planned; not claimed done.

## Principle

One coherent ocean simulation with multiple **rendering** representations — not multiple competing water-motion simulations.

FFT, Gerstner, and SWE may coexist only if they exchange consistent physical state. Rendering must not invent displacement that contradicts the simulation.

## Target regions

| Region | Responsibility |
| --- | --- |
| Deep ocean | FFT spectral generation + propagation |
| Transition | Dispersive shoaling / refraction / transformation |
| Shoreline | Nonlinear fluid flow, breaking, run-up, backwash |

These are tightly coupled physical regions, not three independently animated surfaces.

## Component roles (target)

| Component | Role |
| --- | --- |
| FFT (`ocean.js`) | Deep-water generation + coastal boundary forcing |
| Gerstner | Offshore representation only where needed; no competing nearshore free surface |
| Hinge / `breakerEvt` | Breaking-**event** detection + shared signals (foam/spray) — not a second surface |
| SWE (`shore.js`) | Authoritative nearshore fluid solver (evolve → conservative FV; later Boussinesq) |
| `foamCover` / `vsDrops` | Render from simulated breaking / transport fields |
| `shoreFetch` | Read canonical coastal state |
| `fsWater` | Shade the unified free surface |

## Milestone order

| Milestone | Goal |
| --- | --- |
| **A** | Restore shoreline stability + performance; disable competing localized geometry |
| **B** | Authoritative shared water-state interface + single sampling API |
| **C** | Conservative FFT → coastal boundary coupling (no double-counted energy) |
| **D** | Stabilize FV transport, wet/dry, run-up/backwash |
| **E** | Incremental dispersive (Boussinesq) correction — only after D is green |
| **F** | Reconnect foam / spray / materials to unified state |
| **G** | Optional localized volumetric breaker **driven by shared event** (not a new wave) |

Do **not** migrate Boussinesq in one pass. A broken conservative solver is worse than the current hybrid.

## Milestone A (this delivery)

**Root cause:** stacked lip-amplify + localized breaker ribbon + dual nearshore displacement produced mesh seams, self-intersecting tips, and CPU/GPU collision mismatch. `#57` fixed mesh/fetch/ownership continuity but kept `#52` ribbon and overdriven tip throw.

**Changes:**

1. Disable breaker ribbon draw (prefer coherent heightfield surf).
2. Dial hinge tip throw / bandK / lipR back to coherent levels; hinge = open-ocean event signal only (gated out of the surf belt).
3. Ocean disk yields XZ+Y by depth only (no per-vert `shoreFetch` — that tanked FPS); sheet owns coastal free surface via soft ownership.
4. Shore sheet = one free surface: seaward `seaAt` (phase-matched to ocean) → mid-surf blend → SWE η on wash; Dirichlet rim injects swell into the fluid solver.
5. Align CPU `waveY` with nearshore seaAt height family for walk/swim.
6. Preserve `#57` continuity (cell-center UV, identity warp, soft ownership, SWE positivity); widen ownership fade + cut fragment shoreFetch foam samples.

**Not claimed:** unified coupled solver, Boussinesq, real-GPU photoreal accept, measured perf improvement beyond gate smoke.

## References

- Celeris-WebGPU nearshore wave simulator (dispersive GPU coastal reference)
- Adaptive deep/shallow coupling literature
- Hybrid particle + shallow-water breaking representations

## Gates

`node source/build.mjs` · `node source/wgsl-gate.mjs` — STATIC + LOAD OK required for every product change.
