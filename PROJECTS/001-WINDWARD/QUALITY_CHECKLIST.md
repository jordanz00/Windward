# Windward quality checklist

Refuse to call the project “finished” for a major public showcase until these are **honestly** excellent — or explicitly labeled limited.

Rate each: `todo` · `improving` · `good` · `excellent` · `blocked` (with note).  
Claims of improvement need evidence (AEI bar when engineering changes).

| Area | Standard | Status | Notes |
| --- | --- | --- | --- |
| Startup | Fast, reliable loading; Enter without pipeline errors | improving | wgsl-gate / Pages; real-GPU still required for confidence |
| Graphics | Cohesive visual quality; first 30s breathtaking | todo | Excellence Sprint Phase 1 |
| Water | Convincing surface + underwater behavior | improving | Horseshoe swirl (WSR-50) needs real-GPU |
| Audio | Immersive, balanced soundscape | improving | Score deferred for critical gzip; immersion pass later |
| Wildlife | Believable movement and interactions | improving | Birds/insects/fish present; polish believability |
| Weather | Changes personality of the place, not only particles | todo | Phase 2 |
| Controls | Intuitive, responsive, discoverable | improving | Card exists; first-run guidance |
| Performance | Stable across supported hardware | todo | Mid-range + iGPU + Low phone; not only high-end |
| Accessibility | Clear controls and settings | todo | |
| Reliability | No major console errors or broken states | improving | Zero-tolerance load gate |

## Hardware bar

Test beyond the development machine:

- High-performance desktop  
- Mid-range desktop  
- Integrated graphics  
- Lower-power / phone (Low preset)  

Label headless/SwiftShader ≠ real-GPU.

## Experience metrics (preferred over stars alone)

Track when feasible:

- Successful launches  
- Time spent exploring  
- Error / broken-state rate  
- Browser + GPU mix  
- Developer feedback  
- Return visits / version retries  

Stars are a signal; **successful felt experience** is the product.
