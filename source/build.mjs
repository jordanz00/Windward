import { readFileSync, writeFileSync } from 'fs';
import { gzipSync, brotliCompressSync, constants as zc } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, 'source', name), 'utf8');
const css = read('ui.css');
const parts = ['gpu.js', 'island.js', 'shaders.js', 'ocean.js', 'shore.js', 'score.js', 'fish.js', 'env.js', 'insects.js', 'bench.js', 'app.js'];
// Source stays readable. The shipped page is compacted: comments and spare whitespace
// are removed, but names and template-literal structure stay intact so errors still
// map to written code. --dev keeps the source whole.
const dev = process.argv.includes('--dev');

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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Windward</title>
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
<b>Look</b><span>In Walk or Fly, click the view to lock the mouse. Esc releases.</span>
<b>Walk</b><span>WASD to move. Shift to run. Q to dive. Space rises.</span>
<b>Fly</b><span>F or Fly. WASD, Space up, Ctrl down, Shift faster.</span>
<b>Places</b><span>Orbit a place: drag to look, scroll to zoom. Lagoon, ocean, cove, lake, storm, reef, pool</span>
<b>Watch</b><span>Hide the interface. C does the same.</span>
<b>Day</b><span>T next hour, R weather. N music.</span>
<b>1 – 6</b><span>Beach, cliff, above, bay, swell, under</span>
<b>B / G</b><span>Timed bench path / scenic fly of the same route. Quality preset stays fixed</span>
<b>Esc</b><span>Release look, then open this card</span>
</div>
<p class="fine">Best in Chrome. On a phone, drag to look while walking; tap the water. One HTML file, MIT licensed.</p>
</div>
<nav id="places" aria-label="Places"></nav>
<div id="chrome">
<button id="placebtn" type="button">Places</button>
<button id="walkbtn" type="button" aria-pressed="true">Walk</button>
<button id="flybtn" type="button" aria-pressed="false">Fly</button>
<button id="watchbtn" type="button">Watch</button>
<button id="hourbtn" type="button">Hour</button>
<button id="skybtn" type="button">Weather</button>
<button id="musicbtn" type="button" aria-pressed="true">Music</button>
</div>
<div id="caption"></div>
<button id="menubtn" type="button">Menu</button>
<div id="hint">Click to look</div>
<div id="stats" hidden></div>
<script>${js}</script>
</body>
</html>
`;

const outPath = join(root, 'index.html');
writeFileSync(outPath, html);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const wgsl = (text) => (text.match(/`[^`]*`/g) || []).filter((t) => /(?:\bfn\b|@vertex|@fragment|@compute|struct\s+\w+)/.test(t)).reduce((n, t) => n + Buffer.byteLength(t), 0);
const br = brotliCompressSync(Buffer.from(html), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } });
console.log('source     ' + kb(Buffer.byteLength(jsFull) + Buffer.byteLength(css)) + ', of which script ' + kb(Buffer.byteLength(jsFull)) + ' and in it shaders ' + kb(wgsl(jsFull)));
console.log('index.html ' + kb(Buffer.byteLength(html)) + (dev ? ' (dev build)' : '') + ', gzip ' + kb(gzipSync(html, { level: 9 }).length) + ', brotli ' + kb(br.length) + ', of which script ' + kb(Buffer.byteLength(js)) + ' and in it shaders ' + kb(wgsl(js)));
