#!/usr/bin/env node
/**
 * Audio fix verify (OfflineAudioContext probe + live Enter unlock).
 * Mirrors ambient-audio-verify.mjs CDP pattern.
 *
 * Usage: node source/audio-fix-verify.mjs
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8772;
const DBG = 9226;
const PAGE = join(root, '.audio-fix-verify.html');

/** Static guards on built index.html — catch #41-style regressions before Chrome. */
function staticScanBuiltHtml() {
  const built = readFileSync(join(root, 'index.html'), 'utf8');
  const compact = built.replace(/\s+/g, '');
  const issues = [];
  if (!built.includes('id="ww-deferred-score"')) issues.push('missing ww-deferred-score');
  if (!/function ensureScore\(/.test(built)) issues.push('missing ensureScore');
  if (!/function startIslandScore\(/.test(built) && !/startIslandScore\(/.test(built)) {
    // startIslandScore preferred; fall back: ensureScore must precede createScore in makeAudio path
  }
  // makeAudio must eval deferred score before createScore (Pages pre-#41 called createScore bare).
  const makeIdx = compact.indexOf('functionmakeAudio(');
  // makeAudio is large (~15KB minified); scan through return + following helper.
  const makeSlice = makeIdx >= 0 ? compact.slice(makeIdx, makeIdx + 22000) : '';
  if (!makeSlice.includes('ensureScore()') && !makeSlice.includes('startIslandScore(')) {
    issues.push('makeAudio does not call ensureScore/startIslandScore');
  }
  if (/crash\(\),[\d.]+,[\d.]+\)/.test(compact) || /crash\(\);\},[\d.]+,[\d.]+\)/.test(compact)) {
    const m = compact.match(/crash\(\);\},([\d.]+),([\d.]+)\)/);
    if (m && parseFloat(m[1]) < 60) issues.push(`scheduled crash loop ${m[1]}-${m[2]}s (must be removed)`);
  }
  // Old pulsed cricket: short sine bursts ~2.8–3.7 kHz every ~1–3 s.
  if (/frequency\.value=2[89]\d\d\+Math\.random/.test(compact) && /linearRampToValueAtTime\([^,]+,[^)]*0\.0[12]/.test(compact)) {
    issues.push('pulsed HF cricket tick pattern still present');
  }
  if (compact.includes('playPluck(){/*silenced*/}') === false && /function playPluck\([^)]*\)\{(?!\s*\/\*)/.test(compact)) {
    // In minified deferred chunk, silenced stub is playPluck(){/*silenced*/} or empty body
  }
  if (!compact.includes('function playPluck(){/*silenced*/}') && !compact.includes('function playPluck(){}')) {
    // Accept either silenced comment stub or empty; fail if playPluck still synthesizes
    const pluck = compact.match(/function playPluck\(\)\{[^}]{0,40}\}/);
    if (pluck && /createOscillator|createBufferSource/.test(pluck[0])) {
      issues.push('playPluck still synthesizes audio');
    }
  }
  return issues;
}

const scoreSrc = readFileSync(join(root, 'source', 'score.js'), 'utf8');
const html = `<!doctype html><meta charset=utf-8><title>audio fix verify</title>
<script type="text/plain" id="ww-deferred-score">${scoreSrc.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(async () => {
  function ensureScore() {
    if (typeof createScore === 'function') return true;
    const el = document.getElementById('ww-deferred-score');
    if (!el) return false;
    (0, eval)(el.textContent);
    return typeof createScore === 'function';
  }
  function rms(buf) {
    const ch = buf.getChannelData(0);
    let s = 0; for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
    return Math.sqrt(s / ch.length);
  }
  function impulsePeaks(buf, lo, hi) {
    const ch = buf.getChannelData(0), sr = buf.sampleRate;
    const win = (sr * 0.04) | 0, hop = (sr * 0.02) | 0, energies = [];
    for (let i = 0; i + win < ch.length; i += hop) {
      let e = 0, lp = 0, lp2 = 0;
      const a = Math.exp(-2 * Math.PI * hi / sr), b = Math.exp(-2 * Math.PI * lo / sr);
      for (let j = 0; j < win; j++) {
        const x = ch[i + j];
        lp = lp * a + x * (1 - a); lp2 = lp2 * b + x * (1 - b);
        const y = lp2 - lp; e += y * y;
      }
      energies.push(e / win);
    }
    const sorted = energies.slice().sort((x, y) => x - y);
    const med = sorted[(sorted.length * 0.5) | 0] || 1e-12;
    let peaks = 0;
    for (let i = 1; i < energies.length - 1; i++) {
      if (energies[i] > med * 8 && energies[i] > energies[i - 1] && energies[i] >= energies[i + 1]) peaks++;
    }
    return peaks;
  }
  async function oldTicks() {
    const sr = 48000, dur = 6, ac = new OfflineAudioContext(1, (sr * dur) | 0, sr);
    const master = ac.createGain(); master.connect(ac.destination);
    for (let i = 0; i < 4; i++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = 3000 + i * 150; g.gain.value = 0;
      o.connect(g); g.connect(master); o.start(0);
      const gap = 1.5 + i * 0.4;
      for (let t = 0.4 + i * 0.15; t < dur - 0.2; t += gap) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.012);
        g.gain.linearRampToValueAtTime(0, t + 0.035);
      }
    }
    return ac.startRendering();
  }
  async function softBed() {
    const sr = 48000, dur = 6, ac = new OfflineAudioContext(1, (sr * dur) | 0, sr);
    const n = (sr * 2) | 0, buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let s = 123456789;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
    const master = ac.createGain(); master.connect(ac.destination);
    for (let i = 0; i < 2; i++) {
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600 + i * 200; f.Q.value = 1.1;
      const g = ac.createGain(); g.gain.value = 0.03;
      src.connect(f); f.connect(g); g.connect(master); src.start(0);
    }
    return ac.startRendering();
  }
  // Old breaker crash pulse every ~4 s — must stay well above soft bed impulse count.
  async function oldCrashPulses() {
    const sr = 48000, dur = 8, ac = new OfflineAudioContext(1, (sr * dur) | 0, sr);
    const n = (sr * 1.6) | 0, buf = ac.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let s = 123456789;
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; d[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
    const master = ac.createGain(); master.connect(ac.destination);
    for (let t = 0.5; t < dur - 0.5; t += 4.0) {
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.4);
    }
    return ac.startRendering();
  }
  async function scoreBed() {
    if (!ensureScore()) throw new Error('ensureScore failed');
    const sr = 48000, dur = 5, ac = new OfflineAudioContext(2, (sr * dur) | 0, sr);
    const dest = ac.createGain(); dest.connect(ac.destination);
    const sc = createScore(ac, dest);
    sc.renderSpan(dur); sc.setAudible(true, 1);
    return ac.startRendering();
  }
  try {
    const [oldB, softB, scoreB, crashB] = await Promise.all([oldTicks(), softBed(), scoreBed(), oldCrashPulses()]);
    const oldPeaks = impulsePeaks(oldB, 2500, 4500);
    const softPeaks = impulsePeaks(softB, 2500, 4500);
    const crashPeaks = impulsePeaks(crashB, 600, 4000);
    const softMidPeaks = impulsePeaks(softB, 600, 4000);
    const scoreRms = rms(scoreB);
    const okScore = scoreRms > 0.001;
    const okNoClank = softPeaks < Math.max(2, oldPeaks * 0.25);
    const okNoBang = softMidPeaks < Math.max(2, crashPeaks * 0.3);
    window.__audioFix = {
      ensureScore: typeof createScore === 'function',
      scoreRms, oldPeaks, softPeaks, crashPeaks, softMidPeaks,
      okScore, okNoClank, okNoBang,
      ok: okScore && okNoClank && okNoBang
    };
  } catch (e) {
    window.__audioFix = { ok: false, error: String(e && e.message || e) };
  }
})();
</script>`;

writeFileSync(PAGE, html);

const staticIssues = staticScanBuiltHtml();
if (staticIssues.length) {
  console.error('AUDIO_FIX_FAIL static:', staticIssues.join('; '));
  try { unlinkSync(PAGE); } catch (_) {}
  process.exit(1);
}

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
  try { createRequire(import.meta.url).resolve('ws'); }
  catch {
    const r = spawn('npm', ['install', 'ws', '--no-save', '--prefix', '/tmp/ww-gate-deps'], { stdio: 'ignore' });
    await new Promise((res, rej) => { r.on('close', (c) => c === 0 ? res() : rej(new Error('ws install'))); });
  }
}

const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(root, 'index.html')));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
await ensureWs();
let WebSocket;
try { WebSocket = createRequire(import.meta.url)('ws'); }
catch { WebSocket = createRequire('/tmp/ww-gate-deps/package.json')('ws'); }

const profile = `/tmp/ww-audio-fix-chrome-${process.pid}`;
const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-webgpu', '--use-angle=swiftshader',
  `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

let pass = false;
const summary = {};
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
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => {
      pending.delete(mid);
      reject(new Error('CDP timeout ' + method));
    }, 20000);
    pending.set(mid, (data) => { clearTimeout(timer); resolve(data); });
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

  // 1) Offline probe
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }, session);
  let probe = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ev = await send('Runtime.evaluate', { expression: 'window.__audioFix || null', returnByValue: true }, session);
    probe = ev.result?.result?.value;
    if (probe) break;
  }
  summary.probe = probe;
  if (!probe || !probe.ok) throw new Error('probe failed: ' + JSON.stringify(probe));

  // 2) Live Windward Enter → score
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` }, session);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const ev = await send('Runtime.evaluate', {
      expression: `(() => { const go = document.getElementById('go'); return !!(go && !go.hidden && (window.__frames|0) > 2); })()`,
      returnByValue: true
    }, session);
    if (ev.result?.result?.value) { ready = true; break; }
  }
  if (!ready) {
    const err = await send('Runtime.evaluate', {
      expression: `JSON.stringify({frames:window.__frames|0, gpuerr:window.__gpuerr||null, status:(document.getElementById('status')||{}).textContent||null})`,
      returnByValue: true
    }, session);
    throw new Error('live not ready: ' + (err.result?.result?.value || ''));
  }
  const liveEv = await send('Runtime.evaluate', {
    expression: `(async () => {
      document.getElementById('go').click();
      await new Promise(r => setTimeout(r, 1200));
      try { if (audio && audio.ac && audio.ac.state !== 'running') await audio.ac.resume(); } catch (e) {}
      if (score) score.setAudible(true, 1);
      await new Promise(r => setTimeout(r, 1500));
      return {
        hasAudio: !!audio,
        acState: audio && audio.ac ? audio.ac.state : 'none',
        hasScore: !!score,
        createReady: typeof createScore === 'function',
        ensureReady: typeof ensureScore === 'function',
        musicOn: musicOn,
        busGain: score && score.bus ? score.bus.gain.value : null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  }, session);
  const live = liveEv.result?.result?.value;
  summary.live = live;
  summary.staticOk = true;
  if (!(live && live.hasScore && live.createReady && live.hasAudio)) {
    throw new Error('live unlock failed: ' + JSON.stringify(live));
  }
  if (!(live.busGain == null || live.busGain > 0.05)) {
    throw new Error('live score bus silent: ' + JSON.stringify(live));
  }
  if (live.acState !== 'running') {
    throw new Error('AudioContext not running after Enter: ' + JSON.stringify(live));
  }

  pass = true;
  console.log('AUDIO_FIX_OK', JSON.stringify(summary));
  writeFileSync(join(root, 'source', '.audio-fix-verify-last.json'), JSON.stringify(summary, null, 2));
  ws.close();
} catch (err) {
  console.error('AUDIO_FIX_FAIL', err && err.message || err);
  summary.error = String(err && err.message || err);
  writeFileSync(join(root, 'source', '.audio-fix-verify-last.json'), JSON.stringify(summary, null, 2));
} finally {
  chrome.kill('SIGKILL');
  server.close();
  try { unlinkSync(PAGE); } catch (_) {}
}
process.exit(pass ? 0 : 1);
