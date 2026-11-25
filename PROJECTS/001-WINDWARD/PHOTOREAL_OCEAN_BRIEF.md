# Windward — Photorealistic Ocean Engineering Project

**Status:** Visual-completion pass in flight — staged break/wash/spray; **photoreal acceptance not claimed**  
**Project:** 001-WINDWARD  
**Related:** [PHOTOREAL_OCEAN_AUDIT.md](PHOTOREAL_OCEAN_AUDIT.md) · [PHOTOREAL_OCEAN_SAME_DAY.md](PHOTOREAL_OCEAN_SAME_DAY.md) · [PHOTOREAL_OCEAN_VISUAL_PASS.md](PHOTOREAL_OCEAN_VISUAL_PASS.md) · [EXCELLENCE_SPRINT.md](EXCELLENCE_SPRINT.md) · [QUALITY_CHECKLIST.md](QUALITY_CHECKLIST.md)

## Framing

Stop treating ocean quality as isolated cosmetic shader tweaks.

Two related but distinct goals:

1. **Photorealistic open ocean** — layered swell, chop, glitter, material response.
2. **Convincing tropical shoreline** — waves that steepen, curl, crash, foam, and wash onto sand.

Preserve Windward’s existing architecture (FFT cascades, Gerstner swell, shallow-water shore solver, island, camera/controls) where possible. The critical upgrade is **breaking-wave geometry**, not foam paint or mirror polish alone.

## Priority order (founder recommendation)

1. Breaking-wave system (highest)
2. Shoreline coupling / wash
3. Open-ocean spectral quality
4. Photorealistic water material
5. Visual validation scenes + captures

Beautiful reflections cannot compensate for waves that do not actually break.

## Phases (work order)

| Phase | Goal | Gate |
| --- | --- | --- |
| 1 Audit | Document real implementation limits (done — see audit) | Evidence from `source/` |
| 2 Open ocean | Multi-scale FFT / wind spectra / chop / normals | Visual + gates |
| 3 Breaking waves | Localized overturn / whitewater / spray (not heightfield foam) | Acceptance: visible forward curl + collapse |
| 4 Shoreline | Run-up, foam advect/dissipate, backwash, wet sand, irregular timing | Shared wave info with render |
| 5 Water material | Fresnel, absorption, SSS approx, glints, caustics | Lighting/angle response |
| 6 Validation | Five scenes + screenshots/recordings vs photo refs | Real running app |

## Non-negotiables

- Preserve island and existing features  
- Preserve controls and camera behavior  
- Avoid unnecessary rewrites  
- Maintain acceptable GPU performance  
- Test on the actual running application  
- Do **not** claim completion from compilation alone  

## Acceptance tests

| Test | Required result |
| --- | --- |
| Open ocean | Natural, layered, moving swells |
| Wave crest | Clearly visible forward curl |
| Wave impact | Convincing collapse and whitewater |
| Beach | Foam washes up and recedes |
| Close-up | Water looks convincing, not a flat animated texture |

## External references (study, do not copy blindly)

- [Ultra Water](https://github.com/robhawkes/ultra-water) — FFT, shoreline breakers, foam, caustics  
- [Ocean Water Lab](https://github.com/rahulbhola877/ocean-water-lab) — depth-dependent breaking, foam streaks  
- [Web Ocean](https://github.com/noniv/web-ocean) — multi-scale FFT, sun glitter (no shoreline surf)  
- [Open Ocean](https://github.com/0-robert/open-ocean) — cascades, persistent foam, shading  

## Implementation stages (build order)

| Stage | Focus | Notes |
| --- | --- | --- |
| 1 | Shoaling + ocean↔shore drive agreement | In progress — see [PHOTOREAL_OCEAN_STAGE1.md](PHOTOREAL_OCEAN_STAGE1.md) |
| 2 | Breaking geometry (hinge / optional breaker layer) | After Stage 1 signals share kinematics |
| 3 | Swash / backwash / mass conservation | Extend `shore.js` SWE |
| 4 | Foam + spray tied to break intensity | Not independent lace/paint |
| 5 | Material polish | Only after sim reads |

Overall **priority** (what matters most visually) still follows the founder list above. **Build order** follows Stage 1→5 so systems share one wave field.

## Approval

- **Phase 1 (audit):** executed from `main` sources; merged as #43.  
- **Stage 1 (shoaling / coupling):** approved to build from the Cursor photoreal implementation brief (extend existing architecture; no cosmetic-first rewrite).  
- **Stage 2+ breaker mesh vs hinge-only:** still needs a founder call after Stage 1 lands — audit recommends a localized breaker representation beyond heightfield.
