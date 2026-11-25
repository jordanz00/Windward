import { readFileSync, writeFileSync } from 'fs';
import { gzipSync, brotliCompressSync, constants as zc } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'source', name), 'utf8');
const css = read('ui.css');
// Critical path: first interactive frame (Enter / walk). Deferred stays out of critical gzip.
const parts = ['gpu.js', 'island.js', 'sky.js', 'shaders.js', 'ocean.js', 'shore.js', 'fish.js', 'astro-data.js', 'astro.js', 'env.js', 'insects.js', 'birds.js', 'stream.js', 'app.js'];
// Lazy chunks (AEI Continuous): deep-sea/sharks + bench stay off critical-load gzip.
const deferred = [
  { id: 'ww-deferred-score', files: ['score.js'] },
  { id: 'ww-deferred-deep-sea', files: ['deep-sea.js'] },
  { id: 'ww-deferred-bench', files: ['bench.js'] },
];
// Source stays readable. The shipped page is compacted: comments and spare whitespace
// are removed, but names and template-literal structure stay intact so errors still
// map to written code. --dev keeps the source whole.
const dev = process.argv.includes('--dev');
const noGate = process.argv.includes('--no-gate');

const isIdent = (c) => !!c && /[A-Za-z0-9_$]/.test(c);

// Safe compressor: strips // and /* */ outside strings, collapses whitespace outside
// strings, and strips // line comments inside template literals (WGSL). Handles ${}.
function packCode(text) {
  if (dev) return text;
  let out = '';
  const n = text.length;
  let i = 0;
  // 'code' | 's' | 'd' | 't' | 'tplExpr'
  const stack = ['code'];
  const push = (s) => { stack.push(s); };
  const pop = () => { if (stack.length > 1) stack.pop(); };
  const top = () => stack[stack.length - 1];
  // Brace depth inside ${...} so nested objects do not end the expression early.
  let exprDepth = 0;

  const needsSpace = (a, b) => {
    if (!a || !b) return false;
    if (isIdent(a) && isIdent(b)) return true;
    // `return /re/` must not become `return/re/`.
    if (isIdent(a) && b === '/') return true;
    // Keep `a + ++b`, `a - --b`, `x / /re/`, `<!--`, `<<`, `>>`, `&&`, `||`, `==`, `!=`.
    if ((a === '+' || a === '-') && (b === '+' || b === '-' || b === '=' || b === '>' || isIdent(b))) return true;
    if (a === '/' && (b === '/' || b === '*' || b === '=')) return true;
    if (a === '*' && (b === '/' || b === '=')) return true;
    if (a === '<' && (b === '<' || b === '=' || b === '!')) return true;
    if (a === '>' && (b === '>' || b === '=')) return true;
    if (a === '&' && b === '&') return true;
    if (a === '|' && b === '|') return true;
    if (a === '=' && b === '=') return true;
    if (a === '!' && b === '=') return true;
    if (a === '?' && b === '?') return true;
    return false;
  };
  const maybeSpaceBefore = (b) => {
    if (!out) return;
    const a = out[out.length - 1];
    if (a === ' ' || a === '\n') return;
    if (needsSpace(a, b)) out += ' ';
  };

  while (i < n) {
    const st = top();
    const c = text[i];
    const nxt = i + 1 < n ? text[i + 1] : '';

    if (st === 'code' || st === 'tplExpr') {
      if (c === "'") { out += c; push('s'); i++; continue; }
      if (c === '"') { out += c; push('d'); i++; continue; }
      if (c === '`') { out += c; push('t'); i++; continue; }
      if (c === '/' && nxt === '/') {
        i += 2;
        while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
        continue;
      }
      if (c === '/' && nxt === '*') {
        i += 2;
        while (i + 1 < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (st === 'tplExpr') {
        if (c === '{') { exprDepth++; out += c; i++; continue; }
        if (c === '}') {
          if (exprDepth > 0) { exprDepth--; out += c; i++; continue; }
          out += c; pop(); i++; continue;
        }
      }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        let j = i;
        while (j < n && ' \t\n\r'.includes(text[j])) j++;
        if (j < n) maybeSpaceBefore(text[j]);
        i = j;
        continue;
      }
      out += c; i++; continue;
    }

    if (st === 's') {
      out += c;
      if (c === '\\' && i + 1 < n) { out += text[i + 1]; i += 2; continue; }
      if (c === "'") pop();
      i++; continue;
    }
    if (st === 'd') {
      out += c;
      if (c === '\\' && i + 1 < n) { out += text[i + 1]; i += 2; continue; }
      if (c === '"') pop();
      i++; continue;
    }
    if (st === 't') {
      if (c === '\\' && i + 1 < n) { out += c; out += text[i + 1]; i += 2; continue; }
      if (c === '`') { out += c; pop(); i++; continue; }
      if (c === '$' && nxt === '{') { out += '${'; push('tplExpr'); exprDepth = 0; i += 2; continue; }
      if (c === '/' && nxt === '/') {
        i += 2;
        while (i < n && text[i] !== '\n' && text[i] !== '\r') i++;
        continue;
      }
      if (c === ' ' || c === '\t') {
        let j = i;
        while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
        if (j < n && out && isIdent(out[out.length - 1]) && isIdent(text[j])) out += ' ';
        i = j; continue;
      }
      if (c === '\n' || c === '\r') {
        // WGSL does not need newlines; collapse like other whitespace.
        let j = i;
        while (j < n && ' \t\n\r'.includes(text[j])) j++;
        if (j < n && out) maybeSpaceBefore(text[j]);
        i = j; continue;
      }
      out += c; i++; continue;
    }
    i++;
  }
  return out.trim();
}

function packCss(text) {
  if (dev) return text;
  let s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*([{}:;,>~+])\s*/g, '$1');
  s = s.replace(/;}/g, '}');
  return s.trim();
}

const jsFull = parts.map(read).join('\n');
const js = packCode(jsFull);
const cssOut = packCss(css);
const deferredBlocks = deferred.map((d) => {
  const body = packCode(d.files.map(read).join('\n'));
  return { id: d.id, body, raw: d.files.map(read).join('\n') };
});
const deferredHtml = deferredBlocks
  .map((d) => `<script type="text/plain" id="${d.id}">${d.body}</script>`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Windward</title>
<meta name="description" content="Procedural tropical island in the browser (WebGPU). Volumetric clouds, living ocean, cinematic spaces, and a synthesised score — one HTML file, no assets.">
<meta property="og:title" content="Windward">
<meta property="og:description" content="Procedural tropical island in the browser (WebGPU). Volumetric clouds, living ocean, cinematic spaces, and a synthesised score — one HTML file, no assets.">
<meta property="og:type" content="website">
<meta property="og:image" content="https://jordanz00.github.io/Windward/media/clouds.jpg">
<meta name="twitter:card" content="summary_large_image">
<style>${cssOut}</style>
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
<b>Look</b><span>Move the mouse. If it is not looking, click the view. Esc releases.</span>
<b>Walk</b><span>WASD or arrow keys. Shift runs. Space jumps. In water, Q dives and Space rises.</span>
<b>Fly</b><span>F or Fly. W flies where you look. Space up, Q down, Shift faster.</span>
<b>Places</b><span>Six places worth the trip. Pick one, or Shift and its number, and the camera jumps there.</span>
<b>Spaces</b><span>1–7, or Spaces. Seven looks for this island. Keys ease the light and fly to each look's view. 7 is tonight's real moon. A Spaces card changes light only; Shift-click or double-click also flies.</span>
<b>Watch</b><span>Hide the interface. C does the same.</span>
<b>Day</b><span>T next hour, R weather. N music. X sound effects.</span>
<b>Shift 1 – 6</b><span>Palm beach, cliff overlook, from above, lagoon shallows, offshore, coral garden</span>
<b>B / G</b><span>Timed bench path / scenic fly of the same route. Quality preset stays fixed</span>
<b>Esc</b><span>Release look, then open this card</span>
</div>
<p class="fine">Best in Chrome. On a phone, drag to look while walking; tap the water. One HTML file, MIT licensed.</p>
</div>
<nav id="places" aria-label="Places"></nav>
<nav id="spaces" aria-label="Spaces"></nav>
<div id="chrome">
<nav id="hourmenu" aria-label="Time of day"></nav>
<nav id="weathermenu" aria-label="Weather"></nav>
<div id="chromebar">
<button id="placebtn" type="button">Places</button>
<button id="spacebtn" type="button">Spaces</button>
<button id="walkbtn" type="button" aria-pressed="true">Walk</button>
<button id="flybtn" type="button" aria-pressed="false">Fly</button>
<button id="watchbtn" type="button">Watch</button>
<button id="hourbtn" type="button">Hour</button>
<button id="skybtn" type="button">Weather</button>
<button id="musicbtn" type="button" aria-pressed="true">Music</button>
<button id="sfxbtn" type="button" aria-pressed="true">SFX On</button>
</div>
</div>
<div id="caption"></div>
<button id="menubtn" type="button">Menu</button>
<div id="hint">Click to look</div>
<div id="stats" hidden></div>
${deferredHtml}
<script>${js}</script>
</body>
</html>
`;

const outPath = join(root, 'index.html');
writeFileSync(outPath, html);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const wgsl = (text) => (text.match(/`[^`]*`/g) || []).filter((t) => /(?:\bfn\b|@vertex|@fragment|@compute|struct\s+\w+)/.test(t)).reduce((n, t) => n + Buffer.byteLength(t), 0);
const htmlBuf = Buffer.from(html);
const gz = gzipSync(htmlBuf, { level: 9 });
const br = brotliCompressSync(htmlBuf, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } });
const criticalBuf = Buffer.from(cssOut + '\n' + js);
const critGz = gzipSync(criticalBuf, { level: 9 });
const defRaw = deferredBlocks.reduce((n, d) => n + Buffer.byteLength(d.body), 0);
console.log('source     ' + kb(Buffer.byteLength(jsFull) + Buffer.byteLength(css)) + ', of which script ' + kb(Buffer.byteLength(jsFull)) + ' and in it shaders ' + kb(wgsl(jsFull)));
console.log('index.html ' + kb(htmlBuf.length) + (dev ? ' (dev build)' : '') + ', gzip ' + kb(gz.length) + ', brotli ' + kb(br.length) + ', of which script ' + kb(Buffer.byteLength(js)) + ' and in it shaders ' + kb(wgsl(js)));
console.log('critical   gzip ' + kb(critGz.length) + ' (css+js); deferred raw ' + kb(defRaw) + ' (' + deferredBlocks.length + ' chunk' + (deferredBlocks.length === 1 ? '' : 's') + ')');

if (!noGate && !dev) {
  const r = spawnSync(process.execPath, [join(root, 'source', 'budget-gate.mjs'), '--skip-build'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
