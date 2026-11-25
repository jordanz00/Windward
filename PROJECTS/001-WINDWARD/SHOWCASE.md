# Showcase — Windward

**One-liner:** A procedural WebGPU tropical island — walk, swim, and fly in one self-contained page.  
**Live:** https://jordanz00.github.io/Windward/  
**Source:** https://github.com/jordanz00/Windward  

## The piece

Open the page. Wait for the coast to generate. Press Enter — you are on the beach. The day passes; weather moves; the reef lives under the lagoon. Everything you see and hear is computed, not streamed as assets.

## Stills

See README media (`media/lagoon.jpg` and siblings) and the live demo for current captures.

## How it was made

WebGPU shaders and JS modules build terrain, spectral sea, shore run-up, sky, life, and sound. An AI coding workflow under founder direction assembled the experiment; the founder set taste and approvals rather than hand-authoring the app.

## Constraints that mattered

- One HTML file, no external meshes/images/audio packs  
- Browser WebGPU (Chrome best; phone on Low)  
- Short build window; demo-first, not productize-first  

## Open it

1. Visit https://jordanz00.github.io/Windward/ (Chrome recommended)  
2. Or clone the repo and open `index.html` via a local server (`python3 -m http.server 4177`)  
3. Enter → look with mouse, move with WASD; Spaces (`1`–`7`) / Places (Shift+`1`–`6`) / Fly / Watch as on the card  

Full controls: [README](../../README.md). Profile: [PROJECT_PROFILE.md](PROJECT_PROFILE.md).
