#!/usr/bin/env node
/**
 * Showcase budget gate — measure index.html; fail if over cap or ceilings raised.
 *
 * Policy: AEI Continuous owns ceilings. This script only measures + enforces.
 * Usage: node source/budget-gate.mjs [--json] [--skip-build]
 */
import { readFileSync, existsSync } from 'fs';
import { gzipSync, brotliCompressSync, constants as zc } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { ACTIVE, CEILINGS, CEILINGS_KIB, KiB } from './budget-caps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wantJson = process.argv.includes('--json');
const skipBuild = process.argv.includes('--skip-build');

// Locked literals — must match CEILINGS_KIB. Raising CEILINGS without this fails.
const LOCKED_LITERALS = Object.freeze({
  pageGzip: 400,
  pageBrotli: 350,
  criticalGzip: 200,
});

function fail(msg) {
  console.error('budget-gate FAIL: ' + msg);
  process.exit(1);
}

function kb(n) {
  return (n / KiB).toFixed(1) + ' KB';
}

function checkCeilingsLocked() {
  for (const k of Object.keys(LOCKED_LITERALS)) {
    if (CEILINGS_KIB[k] !== LOCKED_LITERALS[k]) {
      fail(
        `ceiling ${k} is ${CEILINGS_KIB[k]} KiB but locked literal is ${LOCKED_LITERALS[k]} KiB — ` +
          'agents must not raise budgets (AEI Continuous / founder approval required)',
      );
    }
    if (CEILINGS_KIB[k] > LOCKED_LITERALS[k]) {
      fail(`ceiling ${k} raised above founder lock`);
    }
  }
  for (const k of Object.keys(ACTIVE)) {
    if (ACTIVE[k] > CEILINGS[k]) {
      fail(`active ${k} (${ACTIVE[k]}) exceeds ceiling (${CEILINGS[k]})`);
    }
  }
}

function extract(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

function deferredPayloads(html) {
  const out = [];
  const re = /<script\b[^>]*\bid=["']ww-deferred-[^"']+["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function measure(htmlBuf) {
  const html = htmlBuf.toString('utf8');
  const css = extract(html, 'style');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  let criticalJs = '';
  for (const [, attrs, body] of scripts) {
    if (/\bid\s*=\s*["']ww-deferred-/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']text\/plain["']/i.test(attrs)) continue;
    criticalJs += body;
  }

  const criticalBuf = Buffer.from(css + '\n' + criticalJs);
  const pageGzip = gzipSync(htmlBuf, { level: 9 }).length;
  const pageBrotli = brotliCompressSync(htmlBuf, {
    params: { [zc.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  const criticalGzip = gzipSync(criticalBuf, { level: 9 }).length;
  const deferred = deferredPayloads(html);
  const deferredRaw = deferred.reduce((n, s) => n + Buffer.byteLength(s), 0);

  return {
    pageRaw: htmlBuf.length,
    pageGzip,
    pageBrotli,
    criticalRaw: criticalBuf.length,
    criticalGzip,
    deferredRaw,
    deferredChunks: deferred.length,
    caps: {
      pageGzip: ACTIVE.pageGzip,
      pageBrotli: ACTIVE.pageBrotli,
      criticalGzip: ACTIVE.criticalGzip,
    },
    ceilingsKib: { ...CEILINGS_KIB },
  };
}

function enforce(m) {
  const checks = [
    ['pageGzip', m.pageGzip, ACTIVE.pageGzip],
    ['pageBrotli', m.pageBrotli, ACTIVE.pageBrotli],
    ['criticalGzip', m.criticalGzip, ACTIVE.criticalGzip],
  ];
  const failed = [];
  for (const [name, got, cap] of checks) {
    const ok = got <= cap;
    const line = `  ${name.padEnd(14)} ${kb(got).padStart(10)} / ${kb(cap)} ${ok ? 'OK' : 'OVER'}`;
    console.log(line);
    if (!ok) failed.push(name);
  }
  if (failed.length) fail('over budget: ' + failed.join(', '));
}

checkCeilingsLocked();

if (!skipBuild) {
  const r = spawnSync(process.execPath, [join(root, 'source', 'build.mjs'), '--no-gate'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

const indexPath = join(root, 'index.html');
if (!existsSync(indexPath)) fail('index.html missing — run node source/build.mjs first');

const htmlBuf = readFileSync(indexPath);
const m = measure(htmlBuf);

if (wantJson) {
  console.log(JSON.stringify(m, null, 2));
} else {
  console.log('budget-gate — showcase sizes (AEI Continuous ceilings)');
  console.log(
    `  page raw ${kb(m.pageRaw)}, deferred chunks ${m.deferredChunks} (${kb(m.deferredRaw)} raw)`,
  );
}

enforce(m);
console.log('budget-gate passed');
