# Showcase — Windward

**One-liner:** A procedural WebGPU tropical island — walk, swim, and fly in one self-contained page.  
**Live:** https://jordanz00.github.io/Windward/  
**Source:** https://github.com/jordanz00/Windward  

## The piece

Open the page. Wait for the coast to generate. Press Enter — you are on the beach. The day passes; weather moves; volumetric clouds cast shade; the reef and underwater flora live under the lagoon; the deep holds sixgills and a rare wreck emerge; night brings a real star field and moon. An original score plays with the island. Everything you see and hear is computed, not streamed as assets.

## Highlights

- **Volumetric clouds** — fly-through density with shadows and shafts  
- **Cinematic Spaces (`1`–`7`)** — Golden Paradise through Moonlit Island; light eases and the camera flies  
- **Ocean shoreline** — crest pitch into a breaking lip, curl, and wash on the beach  
- **Underwater flora** — kelp, seagrass, and soft reef life under the lagoon  
- **Night sky** — Hipparcos stars, Milky Way, real moon (Space 7)  
- **Audio / music** — synthesised ambience plus *Beneath the Blue* (`N`)  
- **Deep ocean & sharks** — living abyss; signature bluntnose sixgill (basin + wreck)  

## Stills

README hero `media/golden-hour.jpg` (Palm Beach golden hour) plus gallery (`media/clouds.jpg`, `media/shore-curl.jpg`, `media/flora.jpg`, `media/night-sky.jpg`, and siblings) plus the live demo. Real app frames, UI hidden — no AI art.

## How it was made

WebGPU shaders and JS modules build terrain, spectral sea, shore run-up, sky, life, and sound. An AI coding workflow under founder direction assembled the experiment; the founder set taste and approvals rather than hand-authoring the app.

## Constraints that mattered

- One HTML file, no external meshes/images/audio packs  
- Browser WebGPU (Chrome best; phone on Low)  
- Short build window; demo-first, not productize-first  
- Hard size ceilings (`budget-gate`); score and deep-sea cast load deferred  

## Open it

1. Visit https://jordanz00.github.io/Windward/ (Chrome recommended)  
2. Or clone the repo and open `index.html` via a local server (`python3 -m http.server 4177`)  
3. Enter → look with mouse, move with WASD; Spaces (`1`–`7`) / Places (Shift+`1`–`6`) / Fly / Watch / `N` music as on the card  
4. Optional captures: `?space=4` clouds, `?space=7` moonlit, `?shark=basin` / `?shark=wreck`  

Full controls: [README](../../README.md). Profile: [PROJECT_PROFILE.md](PROJECT_PROFILE.md).
