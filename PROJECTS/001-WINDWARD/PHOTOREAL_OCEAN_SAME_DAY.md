# Photoreal Ocean — Same-Day Delivery Report

**Date:** 2026-11-25 (America/New_York)  
**PR:** https://cursor.com/codebase/jordan-zabady/windward-8148/pull/49  
**Branch:** `cursor/photoreal-ocean-same-day-abb3`  
**Note:** Stage 1 shoaling/coupling landed via #45; this PR is the same-day amp + damp fix follow-up.  
**Approach:** Extend existing FFT / Gerstner / hinge / SWE — no engine rewrite.

## Files changed

| File | Role |
| --- | --- |
| `source/island.js` | Wave damp: keep amp through breaker belt; soften lagoon shelter mute |
| `source/shaders.js` | Stronger shoaling; bigger hinge lip/curl/dump; nearshore `scaleUse` floor; spray/foam tied harder to `brk`; `vsShore` crest→SWE handoff |
| `source/shore.js` | `ocean()` aligned with `seaAt`; soft depth-aware coupling; break dump mass/momentum inland; longer run-up sheet |
| `source/ocean.js` | Tighter wind-aligned FFT directional spread |
| `source/app.js` | Higher default swell amp / mood foam |
| `index.html` | Packed build |
| `PROJECTS/001-WINDWARD/PHOTOREAL_OCEAN_*.md` | Brief / Stage 1 / this report |
| `OPERATIONS/ACTIVE_PROJECTS.md` | Status |

## Features implemented (code)

**P0 — Wave propagation / shoaling**

- Shared shoaling kinematics between `seaAt` and shore `ocean()` (k-bunch, shoalAmp, deepW, feel, collapse).
- Earlier mid-depth stand-up; stronger shoalAmp growth (cap 1.75).
- Nearshore amplitude floor so heightfield damp cannot mute the surf.
- Lagoon shelter / swash damp no longer starve the default beach.

**P0 — Breaking**

- Wider crest packs trip more often; larger lip radius, tip throw, face tilt, dump, `brk`.
- `vsShore` lipBoost + prefers crest over flattening sheet blend.

**P0 — Shoreline**

- Soft seaward coupling + Miche-like foam seed.
- Collapse dump injects inland momentum (`-S`) + mass into SWE (hinge was missing from drive).
- Lower foreshore friction; taller sheet cap for readable wash.

**P1 — Foam / spray**

- Foam density and spray force/jet/rise scaled from `S.brk` / fold / shore foam.
- Shore lace tongues + backwash filaments strengthened slightly.

**P2 — Lighting**

- Not the focus this pass (existing Fresnel / absorption / SSS retained).

## Tests actually performed

| Test | Result |
| --- | --- |
| `node source/build.mjs` | Pass (budget OK; criticalGzip ~191.8 / 200 KB) |
| `node source/wgsl-gate.mjs` | Pass (static + WebGPU compile + smoke `playing: true`) |
| Headless SwiftShader `?read` captures | Partial — PNGs written under `/opt/cursor/artifacts/photoreal-ocean-*.png`; mapAsync often ~100–240s; some timeouts |
| Visual review of captures | **Honest:** SwiftShader / `q=low` beach frames still read flatter than prior #42 daytime curl refs; full coastal-footage acceptance **not** claimed on this VM |
| Real discrete GPU beach pass | **Not run** in this environment |

## Known remaining issues

1. **True multi-valued overturn** still impossible on a single heightfield — hinge is an approximation; localized breaker mesh/particles still the next architectural step.
2. **SwiftShader captures** under-represent displacement / foam; founder should validate on a real GPU (med/high preset, beach + storm).
3. **Acceptance criteria** (visible curl collapse, clear run-up/backwash cycle, spray bursts) need real-GPU confirmation before calling photoreal “done.”
4. Shore drive still approximates hinge dump (scalar dump push), not full overturn volume.

## Performance

- Smoke load ready ~3.5–8 s on this VM (varies with SwiftShader load).
- Packed page ~539 KB raw / ~200 KB gzip — under showcase ceilings.
- No new dependencies; no architecture replacement.

## Verdict

Same-day **code delivery** of the highest-leverage sim/coherence fixes is on PR #45.  
Same-day **visual photoreal acceptance** against coastal footage is **not** verified here — treat captures as compile-path evidence only until a real-GPU review.
