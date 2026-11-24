# Showcase — Windward

**One-liner:** A procedural WebGPU tropical island — walk, swim, and fly in one self-contained page.  
**Live:** https://jordanz00.github.io/Windward/  
**Source:** https://github.com/jordanz00/Windward  

## The piece

Open the page. Wait for the coast to generate. Press Enter — you are on the beach. The day passes; weather moves; the reef lives under the lagoon; the deep holds sixgills and a rare wreck emerge. Everything you see and hear is computed, not streamed as assets.

## Highlights

- **Breaking waves** — crest pitch/collapse and shore whitewater, not foam paint alone  
- **Deep ocean** — Beer's-law fog into a living abyss under the lagoon  
- **Sharks & wildlife** — signature bluntnose sixgill (basin + wreck emerge), plus reef and mesopelagic cast  
- **Photoreal lighting** — day cycle, Spaces looks, contact shadows on sand and water  
- **Volumetric clouds** — fly-through density with cloud shadows and shafts  

## Stills

README gallery (`media/lagoon.jpg`, `media/breaking-wave.jpg`, `media/deep-ocean.jpg`, `media/shark-wreck.jpg`, and siblings) plus the live demo. Real app frames, UI hidden — no AI art.

## How it was made

WebGPU shaders and JS modules build terrain, spectral sea, shore run-up, sky, life, and sound. An AI coding workflow under founder direction assembled the experiment; the founder set taste and approvals rather than hand-authoring the app.

## Constraints that mattered

- One HTML file, no external meshes/images/audio packs  
- Browser WebGPU (Chrome best; phone on Low)  
- Short build window; demo-first, not productize-first  
- Hard size ceilings (`budget-gate`); deep-sea cast loads deferred  

## Open it

1. Visit https://jordanz00.github.io/Windward/ (Chrome recommended)  
2. Or clone the repo and open `index.html` via a local server (`python3 -m http.server 4177`)  
3. Enter → look with mouse, move with WASD; Spaces (`1`–`7`) / Places (Shift+`1`–`6`) / Fly / Watch as on the card  
4. Optional captures: `?shark=basin` / `?shark=wreck` for the sixgill beats  

Full controls: [README](../../README.md). Profile: [PROJECT_PROFILE.md](PROJECT_PROFILE.md).
