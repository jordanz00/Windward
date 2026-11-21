import { readFileSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'source', name), 'utf8');
const css = read('ui.css');
const parts = ['gpu.js', 'island.js', 'shaders.js', 'ocean.js', 'shore.js', 'score.js', 'fish.js', 'env.js', 'insects.js', 'app.js'];
// The source is written to be read. The page that ships is the same text with the
// comment lines, the blank lines and the indentation taken out: no line is joined to
// another and no name is changed, so what runs is what is written. --dev keeps it whole.
const dev = process.argv.includes('--dev');
const pack = (text) => dev ? text : text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
const jsFull = parts.map(read).join('\n');
const js = pack(jsFull);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Windward</title>
<style>
${pack(css)}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="scrim"></div>
<div id="panel">
  <p class="kicker">A leeward coast</p>
  <h1>Windward</h1>
  <p class="lead">A coast drawn when the page opens. Clear water in the lagoon, swell offshore, a day that passes and weather that comes and goes. Nothing to tune. Click the water and watch it answer.</p>
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
    <b>Day</b><span>The hours pass on their own. T moves to the next part of the day, R changes the weather.</span>
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
  <button id="hourbtn" type="button">Hour</button>
  <button id="skybtn" type="button">Weather</button>
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
// What the page weighs, said every build so a change in it is seen. Shader source is the
// text inside the multi-line template strings, which are all WGSL.
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const wgsl = (text) => (text.match(/`[^`]*`/g) || []).filter((t) => t.includes('\n')).reduce((n, t) => n + Buffer.byteLength(t), 0);
console.log('source     ' + kb(Buffer.byteLength(jsFull) + Buffer.byteLength(css)) + ', of which script ' + kb(Buffer.byteLength(jsFull)) + ' and in it shaders ' + kb(wgsl(jsFull)));
console.log('index.html ' + kb(Buffer.byteLength(html)) + (dev ? ' (dev build)' : '') + ', gzip ' + kb(gzipSync(html, { level: 9 }).length) + ', of which script ' + kb(Buffer.byteLength(js)) + ' and in it shaders ' + kb(wgsl(js)));
