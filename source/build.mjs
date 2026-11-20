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
  <p class="lead">An island computed when the page opens, and a sea you can stand over and change. Swell, color, light, and the ripples from a click are all generated while it runs. No textures, no models, no sound files.</p>
  <button id="go" hidden>Open the water</button>
  <div id="load"><div id="track"><div id="bar"></div></div><p id="status">Reading the chart</p></div>
  <p id="fail" hidden></p>
  <div class="q" role="group" aria-label="Detail">
    <button type="button" data-q="low">Low</button>
    <button type="button" data-q="med">Medium</button>
    <button type="button" data-q="high">High</button>
  </div>
  <div class="keys">
    <b>Drag</b><span>Orbit the water. Scroll zooms. Click drops a ripple.</span>
    <b>WASD</b><span>Move the view, or walk the sand after Walk</span>
    <b>Q / E</b><span>Dive and rise. Space rises too.</span>
    <b>Shift</b><span>Faster</span>
    <b>F</b><span>Fly</span>
    <b>1 – 6</b><span>Beach, cliff, above, bay, swell, under</span>
    <b>M / H</b><span>Mute, frame time</span>
    <b>Esc</b><span>This card</span>
  </div>
  <p class="fine">Best in Chrome. On a phone, drag to orbit and tap the water. One HTML file, MIT licensed.</p>
</div>
<aside id="dock">
  <div class="dockhead"><strong>Water</strong><button id="dockhide" type="button">Hide</button></div>
  <p class="docknote">Drag to orbit. Scroll to zoom. Click the water and a ring runs out through the swell.</p>
  <label class="sel">Preset
    <select id="preset">
      <option value="calm">Calm Ocean</option>
      <option value="tropical">Tropical Water</option>
      <option value="deep">Deep Ocean</option>
      <option value="pool">Swimming Pool</option>
      <option value="lake">Lake</option>
      <option value="storm">Stormy Water</option>
      <option value="shallow">Shallow Water</option>
      <option value="custom" selected>Custom</option>
    </select>
  </label>
  <h2>Waves</h2>
  <label class="sl"><span>Height</span><b>1.00</b><input data-k="amp" type="range" min="0" max="2.4" step="0.01" value="1"></label>
  <label class="sl"><span>Frequency</span><b>1.00</b><input data-k="frq" type="range" min="0.35" max="2.2" step="0.01" value="1"></label>
  <label class="sl"><span>Speed</span><b>1.00</b><input data-k="spd" type="range" min="0" max="2" step="0.01" value="1"></label>
  <label class="sl"><span>Direction</span><b>0°</b><input data-k="dir" type="range" min="-3.14" max="3.14" step="0.01" value="0"></label>
  <label class="sl"><span>Layers</span><b>8</b><input data-k="layers" type="range" min="1" max="8" step="1" value="8"></label>
  <label class="sl"><span>Complexity</span><b>1.00</b><input data-k="cx" type="range" min="0" max="1.8" step="0.01" value="1"></label>
  <h2>Appearance</h2>
  <div class="colors">
    <label>Deep color<input id="deepcol" type="color" value="#1a3344"></label>
    <label>Shallow color<input id="shalcol" type="color" value="#1f6d6a"></label>
  </div>
  <label class="sl"><span>Transparency</span><b>1.00</b><input data-k="alpha" type="range" min="0.15" max="1" step="0.01" value="1"></label>
  <label class="sl"><span>Reflectivity</span><b>1.00</b><input data-k="refl" type="range" min="0" max="1.6" step="0.01" value="1"></label>
  <label class="sl"><span>Refraction</span><b>1.00</b><input data-k="refr" type="range" min="0" max="2" step="0.01" value="1"></label>
  <label class="sl"><span>Roughness</span><b>0.00</b><input data-k="rough" type="range" min="0" max="1" step="0.01" value="0"></label>
  <label class="sl"><span>Depth color</span><b>1.00</b><input data-k="depthK" type="range" min="0.15" max="2.2" step="0.01" value="1"></label>
  <h2>Simulation</h2>
  <label class="sl"><span>Speed</span><b>1.00</b><input data-k="sim" type="range" min="0.15" max="2" step="0.01" value="1"></label>
  <label class="sl"><span>Ripple intensity</span><b>1.00</b><input data-k="rip" type="range" min="0" max="2" step="0.01" value="1"></label>
  <label class="sl"><span>Ripple speed</span><b>1.00</b><input data-k="ripSpd" type="range" min="0.25" max="2.2" step="0.01" value="1"></label>
  <label class="sl"><span>Disturbance</span><b>1.00</b><input data-k="disturb" type="range" min="0.15" max="2.2" step="0.01" value="1"></label>
  <label class="sl"><span>Ripple size</span><b>1.30</b><input data-k="ripSize" type="range" min="0.35" max="4" step="0.01" value="1.3"></label>
  <div class="dockq" role="group" aria-label="Quality">
    <button type="button" data-q="low">Low</button>
    <button type="button" data-q="med">Medium</button>
    <button type="button" data-q="high">High</button>
  </div>
  <h2>Light</h2>
  <label class="sl"><span>Sun</span><b>1.00</b><input data-k="sun" type="range" min="0.15" max="1.8" step="0.01" value="1"></label>
  <label class="sl"><span>Sun direction</span><b>0°</b><input data-k="sunAng" type="range" min="-1.2" max="1.2" step="0.01" value="0"></label>
  <label class="sl"><span>Sky</span><b>1.00</b><input data-k="sky" type="range" min="0.25" max="1.6" step="0.01" value="1"></label>
  <div class="dockbtns">
    <button id="pause" type="button">Pause</button>
    <button id="resetr" type="button">Reset water</button>
    <button id="resetc" type="button">Reset camera</button>
    <button id="full" type="button">Fullscreen</button>
    <button id="walk" type="button">Walk</button>
  </div>
</aside>
<button id="dockbtn" type="button">Water</button>
<button id="menubtn" type="button">Menu</button>
<div id="hint">Drag to orbit · scroll to zoom · click the water</div>
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
