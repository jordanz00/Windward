import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'source', name), 'utf8');
const css = read('ui.css');
const js = [read('island.js'), read('shaders.js'), read('ocean.js'), read('shore.js'), read('score.js'), read('app.js')].join('\n');

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
  <p class="lead">A coast drawn when the page opens. Clear water in the lagoon, swell offshore, weather that changes when you travel. Nothing to tune. Click the water and watch it answer.</p>
  <button id="go" hidden>Enter</button>
  <div id="load"><div id="track"><div id="bar"></div></div><p id="status">Reading the chart</p></div>
  <p id="fail" hidden></p>
  <div class="q" role="group" aria-label="Detail">
    <button type="button" data-q="low">Low</button>
    <button type="button" data-q="med">Medium</button>
    <button type="button" data-q="high">High</button>
  </div>
  <div class="keys">
    <b>Drag</b><span>Look around. Scroll comes closer. Click the water.</span>
    <b>Places</b><span>Lagoon, ocean, cove, lake, storm, reef, pool</span>
    <b>Walk</b><span>Step onto the sand. WASD, Q to dive, F to fly.</span>
    <b>Watch</b><span>Hide the interface. C does the same.</span>
    <b>1 – 6</b><span>Beach, cliff, above, bay, swell, under</span>
    <b>Music</b><span>N quiets the score. [ and ] set how present it is.</span>
    <b>Esc</b><span>This card</span>
  </div>
  <p class="fine">Best in Chrome. On a phone, drag to look and tap the water. One HTML file, MIT licensed.</p>
</div>
<nav id="places" aria-label="Places"></nav>
<div id="chrome">
  <button id="placebtn" type="button">Places</button>
  <button id="walkbtn" type="button">Walk</button>
  <button id="watchbtn" type="button">Watch</button>
  <button id="musicbtn" type="button" aria-pressed="true">Music</button>
</div>
<div id="caption"></div>
<button id="menubtn" type="button">Menu</button>
<div id="hint">Drag to look · click the water</div>
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
