import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'source', name), 'utf8');
const css = read('ui.css');
const js = [read('island.js'), read('shaders.js'), read('app.js')].join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Windward</title>
<style>
${css}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="scrim"></div>
<div id="panel">
  <p class="kicker">A leeward coast</p>
  <h1>Windward</h1>
  <p class="lead">An island computed when the page opens. Swell runs in from the west, a reef holds the bay, and the sand keeps going under the water. No textures, no models, no sound files.</p>
  <button id="go" hidden>Go ashore</button>
  <div id="load"><div id="track"><div id="bar"></div></div><p id="status">Reading the chart</p></div>
  <p id="fail" hidden></p>
  <div class="q" role="group" aria-label="Detail">
    <button type="button" data-q="low">Low</button>
    <button type="button" data-q="med">Medium</button>
    <button type="button" data-q="high">High</button>
  </div>
  <div class="keys">
    <b>WASD</b><span>Walk the sand, or swim</span>
    <b>Mouse</b><span>Look. Drag if the pointer is free.</span>
    <b>Q / E</b><span>Dive and rise. Space rises too.</span>
    <b>Shift</b><span>Faster</span>
    <b>F</b><span>Fly</span>
    <b>1 – 6</b><span>Beach, cliff, above, bay, swell, under</span>
    <b>M / H</b><span>Mute, frame time</span>
    <b>Esc</b><span>This card</span>
  </div>
  <p class="fine">Best in Chrome. On a phone, drag to look and walk; a second finger hurries. One HTML file, MIT licensed.</p>
</div>
<button id="menubtn" type="button">Menu</button>
<div id="hint">WASD move · mouse look · F fly · Esc menu</div>
<div id="stats" hidden></div>
<script>
${js}
</script>
</body>
</html>
`;

const out = join(root, 'index.html');
writeFileSync(out, html);
const kb = Buffer.byteLength(html) / 1024;
console.log('index.html', kb.toFixed(1), 'KB');
