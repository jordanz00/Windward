// Abyssal Garden–style development benchmark (inspired by Noniv/abyssal-garden, MIT).
// After Enter: B runs the timed path, G flies it without logging. ?bench=1 auto-starts B.
// Holds the chosen quality preset fixed (no silent resolution cuts) during the run.
const WW_BENCH = (() => {
  const LOGN = 1 << 14;
  const logFrame = new Float32Array(LOGN);
  const logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, nFrame = 0, nGpu = 0, lastT = 0;
  let path = null, pathLut = null, pathLen = 0, flyT = 0, flyDur = 55;
  let api = null;

  const stop = () => {
    flying = false;
    if (bench && nFrame > 8 && api && api.report) api.report(summarize());
    bench = false;
    flyT = 0;
  };

  const summarize = () => {
    const st = (a, n) => {
      const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += s[i];
      const p01 = s[Math.min(n - 1, Math.floor(n * 0.01))];
      return {
        n,
        avg: sum / n,
        p99: s[Math.min(n - 1, Math.floor(n * 0.99))],
        p01,
        max: s[n - 1],
        min: s[0]
      };
    };
    const f = st(logFrame, nFrame);
    const g = nGpu ? st(logGpu, nGpu) : null;
    const fpsAvg = 1000 / f.avg;
    const fps1 = 1000 / f.p99;
    return {
      frames: f.n,
      fpsAvg,
      fps1pct: fps1,
      frameMs: f,
      gpuMs: g,
      res: api && api.resolution ? api.resolution() : null,
      draws: api && api.draws ? api.draws() : null,
      instances: api && api.instances ? api.instances() : null,
      gpuQuery: !!g
    };
  };

  const fmt = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;

  const print = (r) => {
    const lines = [
      `Windward bench ${r.res ? r.res.w + '×' + r.res.h : '?'}  ${r.frames} frames`,
      `FPS     avg ${r.fpsAvg.toFixed(1)}  1% low ${r.fps1pct.toFixed(1)}`,
      `frame   ${fmt(r.frameMs)}`,
      `GPU     ${r.gpuMs ? fmt(r.gpuMs) : 'timestamp-query unavailable'}`,
      r.draws != null ? `draws   ${r.draws}` : '',
      r.instances != null ? `inst    ${r.instances}` : ''
    ].filter(Boolean);
    const text = lines.join('\n');
    console.log('BENCH ' + JSON.stringify(r));
    if (api && api.show) api.show(text);
    return text;
  };

  // Catmull-Rom over [x,y,z,yaw,pitch] keys with arc-length table (AG flyLUT idea).
  const buildPath = (keys, seconds) => {
    flyDur = seconds || 55;
    const n = keys.length;
    const M = 2048;
    const len = new Float32Array(M + 1);
    let px = keys[0][0], py = keys[0][1], pz = keys[0][2];
    const sample = (s) => {
      let i = Math.floor(s) | 0;
      if (i > n - 2) i = n - 2;
      const u = s - i;
      const i0 = Math.max(0, i - 1), i1 = i, i2 = i + 1, i3 = Math.min(n - 1, i + 2);
      const out = [0, 0, 0, 0, 0];
      for (let o = 0; o < 5; o++) {
        const a = keys[i0][o], b = keys[i1][o], c = keys[i2][o], d = keys[i3][o];
        out[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
      }
      return out;
    };
    for (let k = 0; k <= M; k++) {
      const p = sample(k / M * (n - 1));
      if (k) len[k] = len[k - 1] + Math.hypot(p[0] - px, p[1] - py, p[2] - pz);
      px = p[0]; py = p[1]; pz = p[2];
    }
    const lut = new Float32Array(M + 1);
    for (let k = 0, j = 0; k <= M; k++) {
      const d = k / M * len[M];
      while (j < M - 1 && len[j + 1] < d) j++;
      lut[k] = (j + (d - len[j]) / Math.max(len[j + 1] - len[j], 1e-6)) / M * (n - 1);
    }
    path = { sample, n };
    pathLut = lut;
    pathLen = M;
  };

  const poseAt = (t) => {
    let s = t / flyDur;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    s = s * s * (3 - 2 * s) * 0.25 + s * 0.75;
    s *= pathLen;
    let k = Math.floor(s) | 0;
    if (k > pathLen - 1) k = pathLen - 1;
    const spl = pathLut[k] + (pathLut[k + 1] - pathLut[k]) * (s - k);
    return path.sample(spl);
  };

  return {
    enabled: false,
    install(hooks) {
      api = hooks;
      this.enabled = true;
      if (hooks.keys) {
        hooks.keys((code) => {
          if (code === 'KeyB' || code === 'KeyG') {
            if (flying) { stop(); return true; }
            if (!path) return false;
            flying = true;
            bench = code === 'KeyB';
            flyT = 0; lastT = 0; nFrame = nGpu = 0;
            if (bench && api.lockQuality) api.lockQuality(true);
            if (api.show) api.show(bench ? 'Benchmark running…' : 'Fly-through…');
            return true;
          }
          if (/Digit[1-6]/.test(code) && flying) { stop(); return false; }
          return false;
        });
      }
    },
    setPath(keys, seconds) { buildPath(keys, seconds); },
    active() { return flying; },
    isBench() { return bench; },
    // Call once per frame before render when flying. Returns pose or null.
    tick(now) {
      if (!flying || !path) return null;
      if (!lastT) lastT = now;
      const dtr = Math.min(100, now - lastT);
      lastT = now;
      flyT += dtr / 1000;
      if (bench && nFrame < LOGN) logFrame[nFrame++] = dtr;
      if (flyT >= flyDur) {
        const r = bench ? summarize() : null;
        if (bench && api && api.lockQuality) api.lockQuality(false);
        stop();
        if (r) print(r);
        return null;
      }
      return poseAt(flyT);
    },
    recordGpu(ms) {
      if (bench && ms > 0 && ms < 1e3 && nGpu < LOGN) logGpu[nGpu++] = ms;
    },
    summarize,
    print
  };
})();
