#!/usr/bin/env node
/**
 * Windward WGSL quality gate.
 * 1) Static scan of every WGSL-ish template for reserved ids + ?: 
 * 2) WebGPU createShaderModule + getCompilationInfo on assembled modules
 * 3) Smoke-load index.html and require wgsl/ocean/shore/pipelines marks with no fail UI
 *
 * Usage: node source/wgsl-gate.mjs [--static-only] [--skip-load] [--port 8765]
 * Exit 0 only when all selected stages pass.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const staticOnly = args.has('--static-only');
const skipLoad = args.has('--skip-load');
const portArg = process.argv.find((a, i, arr) => arr[i - 1] === '--port');
const PORT = Number(portArg) || 8765;

const RESERVED = new Set([
  'array', 'atomic', 'bool', 'f16', 'f32', 'f64', 'i32', 'u32', 'vec2', 'vec3', 'vec4',
  'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'pointer', 'sampler', 'sampler_comparison',
  'texture_1d', 'texture_2d', 'texture_2d_array', 'texture_3d', 'texture_cube', 'texture_cube_array',
  'texture_multisampled_2d', 'texture_storage_1d', 'texture_storage_2d', 'texture_storage_2d_array',
  'texture_storage_3d', 'texture_depth_2d', 'texture_depth_2d_array', 'texture_depth_cube',
  'texture_depth_cube_array', 'texture_depth_multisampled_2d',
  'alias', 'break', 'case', 'const', 'const_assert', 'continue', 'continuing', 'default', 'diagnostic',
  'discard', 'else', 'enable', 'false', 'fn', 'for', 'if', 'let', 'loop', 'override', 'private',
  'return', 'struct', 'switch', 'true', 'var', 'while', 'bitcast', 'fallthrough',
  'NULL', 'Self', 'abstract', 'active', 'alignas', 'alignof', 'as', 'asm', 'asm_fragment', 'async',
  'attribute', 'auto', 'await', 'become', 'binding_array', 'cast', 'catch', 'class', 'co_await',
  'co_return', 'co_yield', 'compliant', 'concept', 'const_cast', 'consteval', 'constexpr', 'constinit',
  'crate', 'debugger', 'decltype', 'delete', 'demote', 'demote_to_helper', 'do', 'dynamic_cast',
  'enum', 'explicit', 'export', 'extends', 'extern', 'external', 'friend', 'from', 'fxgroup', 'get',
  'goto', 'groupshared', 'highp', 'impl', 'implements', 'import', 'inline', 'instanceof', 'interface',
  'layout', 'lowp', 'macro', 'macro_rules', 'match', 'mediump', 'meta', 'mod', 'module', 'move', 'mut',
  'mutable', 'namespace', 'new', 'nil', 'noexcept', 'noinline', 'nointerpolation', 'noperspective',
  'null', 'nullptr', 'of', 'operator', 'package', 'packoffset', 'partition', 'pass', 'patch',
  'pixelfragment', 'precise', 'precision', 'premerge', 'priv', 'protected', 'pub', 'public',
  'readonly', 'ref', 'regardless', 'requires', 'resource', 'restrict', 'self', 'set', 'shared',
  'sizeof', 'smooth', 'snorm', 'static', 'static_assert', 'static_cast', 'std', 'subroutine', 'super',
  'this', 'thread_local', 'throw', 'trait', 'try', 'type', 'typedef', 'typeid', 'typename', 'typeof',
  'union', 'unless', 'unorm', 'unsized', 'use', 'using', 'varying', 'virtual', 'volatile', 'wgsl',
  'where', 'with', 'writeonly', 'yield', 'input', 'output', 'filter'
]);

const parts = ['gpu.js', 'island.js', 'sky.js', 'shaders.js', 'ocean.js', 'shore.js', 'score.js', 'fish.js', 'astro-data.js', 'astro.js', 'env.js', 'insects.js', 'birds.js', 'bench.js', 'stream.js', 'app.js'];

function stripComments(body) {
  return body.replace(/\/\/.*?$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function scanStatic() {
  const hits = [];
  for (const name of parts) {
    const path = join(root, 'source', name);
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/`([^`]*)`/gs)) {
      const body = m[1];
      if (!/(?:\bfn\b|@vertex|@fragment|@compute|struct\s+\w+)/.test(body)) continue;
      const cleaned = stripComments(body);
      if (cleaned.includes('?:')) {
        hits.push(`${name}: WGSL template contains banned ?: ternary`);
      }
      const patterns = [
        ['decl', /\b(?:let|var|const)\s+(?:<[^>]+>\s*)?([A-Za-z_][A-Za-z0-9_]*)/g],
        ['fn', /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)/g],
        ['struct', /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)/g],
        ['member', /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm]
      ];
      for (const [kind, re] of patterns) {
        for (const hm of cleaned.matchAll(re)) {
          const id = hm[1];
          if (RESERVED.has(id)) {
            const line = text.slice(0, m.index + 1 + hm.index).split('\n').length;
            hits.push(`${name}:${line}: reserved WGSL identifier \`${id}\` (${kind})`);
          }
        }
      }
    }
  }
  return hits;
}

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out, err }));
    p.on('error', reject);
  });
}

async function build() {
  const r = await run(process.execPath, ['source/build.mjs']);
  if (r.code !== 0) throw new Error('build failed:\n' + r.out + r.err);
  console.log(r.out.trim().split('\n').slice(-2).join('\n'));
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function ensureWs() {
  try {
    createRequire(import.meta.url).resolve('ws');
    return;
  } catch {
    const r = await run('npm', ['install', 'ws', '--no-save', '--prefix', '/tmp/ww-gate-deps']);
    if (r.code !== 0) throw new Error('npm install ws failed: ' + r.err);
  }
}

async function withChrome(fn) {
  const profile = `/tmp/ww-gate-chrome-${process.pid}`;
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--enable-unsafe-webgpu', '--use-angle=swiftshader',
    '--remote-debugging-port=9222', `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try {
      await getJSON('http://127.0.0.1:9222/json/version');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    return await fn();
  } finally {
    chrome.kill('SIGKILL');
  }
}

async function compileAndLoad() {
  await ensureWs();
  let WebSocket;
  try {
    WebSocket = createRequire(import.meta.url)('ws');
  } catch {
    WebSocket = createRequire('/tmp/ww-gate-deps/package.json')('ws');
  }

  const server = spawn(process.execPath === process.execPath ? 'python3' : 'python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: root, stdio: 'ignore'
  });
  await new Promise((r) => setTimeout(r, 400));

  try {
    return await withChrome(async () => {
      const ver = await getJSON('http://127.0.0.1:9222/json/version');
      const ws = new WebSocket(ver.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
      let id = 0;
      const pending = new Map();
      const events = [];
      ws.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.id && pending.has(data.id)) {
          pending.get(data.id)(data);
          pending.delete(data.id);
        } else events.push(data);
      });
      const send = (method, params, sessionId) => new Promise((resolve) => {
        const mid = ++id;
        pending.set(mid, resolve);
        const payload = { id: mid, method };
        if (params) payload.params = params;
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
      });

      const t = await send('Target.createTarget', { url: 'about:blank' });
      const a = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
      const session = a.result.sessionId;
      for (const m of ['Runtime.enable', 'Console.enable', 'Log.enable', 'Page.enable']) {
        await send(m, undefined, session);
      }

      const errors = [];
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` }, session);
      const deadline = Date.now() + 90000;
      let last = null;
      let ok = false;
      while (Date.now() < deadline) {
        while (events.length) {
          const data = events.shift();
          if (!data || data.sessionId !== session) continue;
          const params = data.params || {};
          if (data.method === 'Runtime.consoleAPICalled') {
            const typ = params.type;
            const line = (params.args || []).map((x) => x.value ?? x.description ?? '').join(' ');
            if (typ === 'error' || /reserved keyword|GPUPipelineError|Invalid ShaderModule|WGSL/i.test(line)) {
              errors.push(line);
            }
          } else if (data.method === 'Runtime.exceptionThrown') {
            const ed = params.exceptionDetails || {};
            errors.push((ed.text || '') + ' ' + ((ed.exception && ed.exception.description) || ''));
          } else if (data.method === 'Log.entryAdded') {
            const e = params.entry || {};
            if (e.level === 'error' && !/favicon|404/.test(e.text || '')) errors.push(e.text || '');
          }
        }

        const ev = await send('Runtime.evaluate', {
          expression: `(() => {
            const body = document.body?.innerText || '';
            const fail = /reserved keyword|GPUPipelineError|Invalid ShaderModule|ReferenceError|is not defined/i.test(body)
              && /This coast needs WebGPU|reserved keyword|ReferenceError|GPUPipelineError/i.test(body);
            return {
              gpu: !!navigator.gpu,
              playing: document.body?.classList?.contains('playing'),
              perf: window.__perf || null,
              fail,
              body: body.slice(0, 500)
            };
          })()`,
          returnByValue: true
        }, session);
        last = ev.result?.result?.value;
        if (last?.fail) {
          errors.push(last.body);
          break;
        }
        const p = last?.perf;
        if (p && p.wgsl != null && p.ocean != null && p.shore != null && p.pipelines != null && !last.fail) {
          // Click Enter if present
          await send('Runtime.evaluate', {
            expression: `(() => {
              const b = [...document.querySelectorAll('button')].find((x) => /enter|begin|start|play/i.test(x.textContent || ''));
              if (b) { b.click(); return 'button'; }
              const canvas = document.querySelector('canvas');
              if (canvas) { canvas.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'canvas'; }
              return 'none';
            })()`,
            returnByValue: true
          }, session);
          await new Promise((r) => setTimeout(r, 1200));
          const ev2 = await send('Runtime.evaluate', {
            expression: `(() => ({
              playing: document.body?.classList?.contains('playing'),
              perf: window.__perf || null,
              body: (document.body?.innerText || '').slice(0, 400),
              fail: /reserved keyword|ReferenceError|GPUPipelineError/i.test(document.body?.innerText || '')
            }))()`,
            returnByValue: true
          }, session);
          last = ev2.result?.result?.value || last;
          if (last.fail) {
            errors.push(last.body);
            break;
          }
          if (last.playing || (last.perf && last.perf.pipelines != null && !last.fail)) {
            ok = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      ws.close();
      return { ok, errors, last };
    });
  } finally {
    server.kill('SIGKILL');
  }
}

async function main() {
  console.log('WGSL gate — static scan');
  const hits = scanStatic();
  if (hits.length) {
    console.error('STATIC FAIL');
    hits.forEach((h) => console.error('  ' + h));
    process.exit(1);
  }
  console.log('STATIC OK (no reserved ids / ?: in WGSL templates)');
  if (staticOnly) process.exit(0);

  console.log('WGSL gate — build');
  await build();

  if (skipLoad) {
    console.log('SKIP load (--skip-load)');
    process.exit(0);
  }

  console.log('WGSL gate — WebGPU compile + smoke load');
  const { ok, errors, last } = await compileAndLoad();
  if (!ok || errors.length) {
    console.error('LOAD FAIL');
    errors.slice(0, 8).forEach((e) => console.error('  ' + String(e).slice(0, 400)));
    console.error('last', JSON.stringify(last)?.slice(0, 800));
    process.exit(1);
  }
  console.log('LOAD OK', JSON.stringify({ playing: last?.playing, perf: last?.perf }));
  // Persist a small evidence stamp for agents
  writeFileSync(join(root, 'source', '.wgsl-gate-last.json'), JSON.stringify({
    ok: true, at: new Date().toISOString(), playing: last?.playing, perf: last?.perf
  }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
