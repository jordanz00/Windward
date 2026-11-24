# Project 001 — Windward

**Status:** Active (shipped v1 island; ongoing lab piece)  
**Studio role:** First portfolio experiment — not a company product line  

## Concept

A small tropical island you can walk, swim, and fly through, drawn entirely in the browser with WebGPU. Coast, swell, reef, trees, insects, weather, and sound are computed when the page opens. No image files, no 3D models, no audio files — one HTML page.

## Vision

Feel of a real place that was never authored as assets: humid air, shoaling water, shade under palms, a day that moves. In the spirit of single-file procedural demos (e.g. Abyssal Garden): constraint as craft.

## Tech

- WebGPU + WGSL; procedural island, spectral ocean, shore sheet, sky/weather, fish, insects, synthesised audio  
- Readable modules in `source/` → `node source/build.mjs` → shipped `index.html`  
- Live: [jordanz00.github.io/Windward](https://jordanz00.github.io/Windward/)  
- Source of truth for the public mirror: [github.com/jordanz00/Windward](https://github.com/jordanz00/Windward)  
- MIT  

## AI approach

Founder (multimedia / video / animation; not an experienced software engineer) directed a free-time Cursor experiment — primarily Fable 5.2 and other models, Grok/Auto sparingly — aiming for a publishable demo in about a week. Studio docs manage the lab around the piece; **they do not rewrite the app** unless a separate brief is approved.

## Challenges

- Keeping a single-page WebGPU scene stable across browsers and quality presets  
- Ocean / shore / lighting systems that read as one world, not stacked effects  
- Zero-tolerance: Chrome load + shader/pipeline success required before claiming a ship  
- Headless / SwiftShader vs real-GPU verification gaps  

## Lessons

- Honest constraints (no assets, one file) make the work read as art.  
- Verification beats optimism for live Pages.  
- Portfolio/lab framing fits better than business-org framing for this experiment.  

See also [OPERATIONS/LESSONS_LEARNED.md](../../OPERATIONS/LESSONS_LEARNED.md).

## Links

| | |
| --- | --- |
| Showcase | [SHOWCASE.md](SHOWCASE.md) |
| Live demo | https://jordanz00.github.io/Windward/ |
| GitHub | https://github.com/jordanz00/Windward |
| README | [../../README.md](../../README.md) |
| Working notes | [../../WINDWARD_NOTES.md](../../WINDWARD_NOTES.md) |
