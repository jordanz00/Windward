# Photoreal Ocean — Visual Completion Pass

**Date:** 2026-11-25 (America/New_York)  
**PR branch:** `cursor/photoreal-ocean-visual-abb3`  
**Baseline:** `#49` / same-day work already on `main` (`abe19c3`) + volumetric clouds  
**Approach:** Incremental — break sequence + wash/spray/foam readability. **No amplitude race. No engine rewrite.**

## Goal

Make the existing simulation read as a coherent break→wash→backwash sequence, not “rise, turn white, vanish.”

## Consolidation (last 24h)

Already on `main` before this PR: Stage 1 shoaling (#45), same-day damp/amp (#49 land), volumetric clouds, vines/flora, cinematic viewpoints.

This PR adds visual staging + integrates unmerged **#44 shoreline curl amplify** lip geometry (wider tip, forward pitch, denser shore sheet, breaker warp) without abandoning dump-on-fall sequencing.

## Files changed

| File | Change |
| --- | --- |
| `source/shaders.js` | Staged steepen→pitch→curl→fall; dump delayed to fall; residual wash body; #44 wider tip / forward pitch / soft oy / lip elevate; darker face; collapse-gated foam; tongue/hole shore foam; layered spray; denser `shoreWarp` + surfBelt lipBoost |
| `source/shore.js` | Crest-gated collapse dump; alongshore cusp irregularity for tongues |
| `source/app.js` | Denser shore mesh presets (320/384/448) from #44 |
| `index.html` | Packed build |

## Implemented (code)

| Item | Status |
| --- | --- |
| Break stage separation (curl holds, dump on fall) | Implemented |
| Post-collapse residual whitewater body | Implemented |
| Darker face under lip (not early whiteout) | Implemented |
| Foam dens from collapse/section, not whole-crest paint | Implemented |
| Shore foam tongues + clear-water holes | Implemented |
| Crest-gated irregular SWE dump | Implemented |
| Spray: break-jet inheritance + mist/droplet layers | Implemented |
| Clouds | Already volumetric on `main` (`b891786`) — not retouched here |

## Compiled / tested

| Gate | Result |
| --- | --- |
| `node source/build.mjs` | Pass (criticalGzip 194.1 / 200 KB) |
| `node source/wgsl-gate.mjs` | Pass — smoke `playing: true` |

## Visually verified?

**No — not to coastal-footage standard.**

Captures written (SwiftShader / `q=low` `?read`):

- `/opt/cursor/artifacts/visual-ocean-shore.png`
- `/opt/cursor/artifacts/visual-ocean-offshore.png`

Review of those frames: still no clear lip curl / collapse sequence; shore can read milky; offshore chop without breaking geometry. **Do not claim photoreal acceptance from this VM.**

## Known remaining gaps (honest)

1. Single-valued heightfield still cannot form a true multi-valued tube — localized breaker mesh/particles still needed for photoreal curl.
2. Real discrete-GPU beach + storm captures required for acceptance.
3. Uniform waterline / milky shallows may still appear depending on framing and quality preset.
4. Spray density may remain sparse at `q=low` drop budgets.

## Performance

- No new dependencies; architecture intact.
- Budget gate passed after volumetric clouds already on main.

## Definition of done vs this pass

| Criterion | This pass |
| --- | --- |
| Code for staged break→wash | Yes |
| Compile + smoke | Yes |
| Real-GPU photoreal match | **No** |
| Convincing coastal footage | **Not claimed** |
