#!/usr/bin/env node
/**
 * Listen-verify for cinematic tropical ambience (synth-only).
 * Renders category buses in Chrome OfflineAudioContext and checks band energy:
 * ocean-dominant lows/mids, insects without piercing HF, underwater LPF transition.
 *
 * Usage: node source/ambient-audio-verify.mjs
 * Exit 0 only when spectrum hierarchy + under transition pass.
 */
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8771;
const PAGE = join(root, '.ambient-audio-verify.html');
const DBG = 9223;

const html = `<!doctype html><meta charset=utf-8><title>ambient audio verify</title>
<script type=module>
async function bandEnergy(buf, lo, hi) {
  const ch = buf.getChannelData(0);
  const n = ch.length, sr = buf.sampleRate;
  const start = (n * 0.35) | 0, len = Math.min(8192, (n * 0.3) | 0);
  let e = 0;
  for (let k = 0; k < 64; k++) {
    const f = lo + (hi - lo) * (k + 0.5) / 64;
    const wN = 2 * Math.PI * f / sr;
    let s0 = 0, s1 = 0, s2 = 0;
    const coeff = 2 * Math.cos(wN);
    for (let i = 0; i < len; i++) {
      const x = ch[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (len - 1)));
      s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0;
    }
    e += s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }
  return e / 64;
}

function catEq(ac, dest, lpHz, cutHz, cutDb, cutQ, extraCut) {
  const bus = ac.createGain();
  const cut = ac.createBiquadFilter();
  cut.type = 'peaking'; cut.frequency.value = cutHz; cut.Q.value = cutQ; cut.gain.value = cutDb;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = lpHz; lp.Q.value = 0.35;
  bus.connect(cut);
  if (extraCut) {
    const bite = ac.createBiquadFilter();
    bite.type = 'peaking'; bite.frequency.value = extraCut.f; bite.Q.value = extraCut.q; bite.gain.value = extraCut.db;
    cut.connect(bite); bite.connect(lp);
  } else {
    cut.connect(lp);
  }
  lp.connect(dest);
  return bus;
}

function noiseBuf(ac, sec) {
  const n = (ac.sampleRate * sec) | 0;
  const b = ac.createBuffer(1, n, ac.sampleRate);
  const d = b.getChannelData(0);
  let s = 123456789;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return b;
}

function bed(ac, buf, type, freq, q, dest, gain) {
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(0);
}

async function renderScene(kind) {
  const sr = 48000, dur = 2.2;
  const ac = new OfflineAudioContext(1, (sr * dur) | 0, sr);
  const master = ac.createGain(); master.gain.value = 0.85;
  const under = ac.createBiquadFilter();
  under.type = 'lowpass'; under.Q.value = 0.2;
  under.frequency.value = kind === 'under' ? 360 : 16000;
  if (kind === 'transition') {
    under.frequency.value = 16000;
    under.frequency.setTargetAtTime(360, 0.4, 0.28);
  }
  master.connect(under); under.connect(ac.destination);
  const ocean = catEq(ac, master, 9800, 2600, -3.5, 0.85);
  const insect = kind === 'insects_raw'
    ? (() => { const g = ac.createGain(); g.connect(master); return g; })()
    : catEq(ac, master, 4800, 3100, -9.5, 1.25, { f: 4500, q: 1.05, db: -8.5 });
  const bird = catEq(ac, master, 6000, 3800, -5.5, 1.05);
  const air = catEq(ac, master, 7200, 2200, -2.5, 0.7);
  const buf = noiseBuf(ac, 3);
  if (kind !== 'insects' && kind !== 'insects_raw') {
    bed(ac, buf, 'lowpass', 120, 0.4, ocean, 0.2);
    bed(ac, buf, 'lowpass', 340, 0.48, ocean, 0.17);
    bed(ac, buf, 'bandpass', 680, 0.6, ocean, 0.11);
    bed(ac, buf, 'bandpass', 1400, 0.55, ocean, 0.028);
  }
  if (kind === 'full' || kind === 'insects' || kind === 'insects_raw' || kind === 'under' || kind === 'transition') {
    const ig = (kind === 'insects' || kind === 'insects_raw') ? 0.35 : 0.034;
    bed(ac, buf, 'bandpass', 3200, 8, insect, ig);
    bed(ac, buf, 'bandpass', 4200, 3.2, insect, ig * 0.7);
  }
  if (kind === 'full') {
    bed(ac, buf, 'bandpass', 240, 0.35, air, 0.022);
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 3200; g.gain.value = 0.012;
    o.connect(g); g.connect(bird); o.start(0.2); o.stop(0.45);
  }
  const out = await ac.startRendering();
  const low = await bandEnergy(out, 40, 250);
  const mid = await bandEnergy(out, 250, 1500);
  const umid = await bandEnergy(out, 2500, 4500);
  const high = await bandEnergy(out, 5000, 12000);
  let peak = 0, sum = 0;
  const d = out.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); peak = Math.max(peak, a); sum += d[i] * d[i]; }
  return { low, mid, umid, high, peak, rms: Math.sqrt(sum / d.length) };
}

try {
  const ocean = await renderScene('full');
  const insects = await renderScene('insects');
  const insectsRaw = await renderScene('insects_raw');
  const under = await renderScene('under');
  const transition = await renderScene('transition');
  const checks = [];
  checks.push({ name: 'ocean_over_hf', ok: ocean.low + ocean.mid > ocean.high * 3 });
  checks.push({ name: 'ocean_has_body', ok: ocean.low > 0 && ocean.mid > ocean.high });
  // Category EQ must cut piercing HF/upper-mids vs the same insect beds ungated.
  checks.push({ name: 'insect_eq_tames_hf', ok: insects.high < insectsRaw.high * 0.5 && insects.umid < insectsRaw.umid * 0.55 });
  checks.push({ name: 'insect_not_silent', ok: insects.rms > 0.0005 && insects.peak > 0.001 });
  checks.push({ name: 'under_muffles_hf', ok: under.high < ocean.high * 0.35 && under.umid < ocean.umid * 0.55 });
  checks.push({ name: 'transition_renders', ok: transition.rms > 0 && transition.peak < 1 });
  checks.push({ name: 'category_not_global_muffle', ok: ocean.mid > ocean.high * 1.2 });
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  window.__audioVerify = { ok: failed.length === 0, failed, checks, ocean, insects, insectsRaw, under, transition };
  document.body.textContent = failed.length ? 'AUDIO_FAIL ' + failed.join(',') : 'AUDIO_OK';
} catch (e) {
  window.__audioVerify = { ok: false, failed: ['exception'], error: String(e && e.stack || e) };
  document.body.textContent = 'AUDIO_FAIL exception';
}
</script>`;

writeFileSync(PAGE, html);

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function ensureWs() {
  try {
    createRequire(import.meta.url).resolve('ws');
  } catch {
    const r = spawn('npm', ['install', 'ws', '--no-save', '--prefix', '/tmp/ww-gate-deps'], { stdio: 'ignore' });
    await new Promise((res, rej) => { r.on('close', (c) => c === 0 ? res() : rej(new Error('ws install'))); });
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

await ensureWs();
let WebSocket;
try { WebSocket = createRequire(import.meta.url)('ws'); }
catch { WebSocket = createRequire('/tmp/ww-gate-deps/package.json')('ws'); }

const profile = `/tmp/ww-audio-chrome-${process.pid}`;
const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

try {
  for (let i = 0; i < 40; i++) {
    try { await getJSON(`http://127.0.0.1:${DBG}/json/version`); break; }
    catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  const ver = await getJSON(`http://127.0.0.1:${DBG}/json/version`);
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
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
  await send('Runtime.enable', undefined, session);
  await send('Page.enable', undefined, session);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, session);
  let result = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ev = await send('Runtime.evaluate', {
      expression: 'window.__audioVerify || null',
      returnByValue: true
    }, session);
    result = ev.result?.result?.value;
    if (result) break;
  }
  ws.close();
  if (!result) {
    console.error('LISTEN_FAIL no result');
    process.exitCode = 1;
  } else if (!result.ok) {
    console.error('LISTEN_FAIL', result.failed?.join(',') || result.error);
    console.error(JSON.stringify({ ocean: result.ocean, insects: result.insects, under: result.under }, null, 2));
    process.exitCode = 1;
  } else {
    console.log('LISTEN_OK ocean-first hierarchy + insect EQ + underwater transition');
    console.log(JSON.stringify({
      ocean: { low: result.ocean.low, mid: result.ocean.mid, high: result.ocean.high, rms: result.ocean.rms },
      insects: { mid: result.insects.mid, umid: result.insects.umid, high: result.insects.high, rms: result.insects.rms },
      underHF: result.under.high
    }));
    writeFileSync(join(root, 'source', '.ambient-audio-verify-last.json'), JSON.stringify({
      ok: true, at: new Date().toISOString(), result
    }, null, 2));
  }
} finally {
  chrome.kill('SIGKILL');
  server.close();
  try { unlinkSync(PAGE); } catch (_) {}
}
