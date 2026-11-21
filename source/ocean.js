// Spectral ocean. Two tiled FFT cascades: a wind-sea that displaces the
// mesh, and a short-wave field whose slopes break the sun into glitter.
// The long swell stays in the Gerstner set so the horizon is not a tiled patch.

const OCEAN_N = 128;

// WGSL shared by everything that reads a cascade: the texel at `p` (in tiles, any value),
// wrapped and weighted between its four neighbours. The sea's shader and the surf's solver
// both include it, so the wave a breaker rides is the wave that is drawn.
const OCEAN_TAP_WGSL = `
fn oceanTap(tex: texture_2d<f32>, p: vec2<f32>) -> vec4<f32> {
  let q = fract(p) * ${OCEAN_N}.0;
  let i = vec2<i32>(floor(q));
  let f = fract(q);
  let j = (i + 1) & vec2<i32>(${OCEAN_N - 1});
  let k = i & vec2<i32>(${OCEAN_N - 1});
  return mix(mix(textureLoad(tex, k, 0), textureLoad(tex, vec2<i32>(j.x, k.y), 0), f.x),
             mix(textureLoad(tex, vec2<i32>(k.x, j.y), 0), textureLoad(tex, j, 0), f.x), f.y);
}
`;

const OCEAN_WGSL = `
struct OceanU {
  time: f32,
  size: f32,
  pad0: f32,
  pad1: f32,
}
@group(0) @binding(0) var<storage, read> h0s: array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write> spec: array<vec2<f32>>;
@group(0) @binding(2) var<uniform> U: OceanU;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;

const ON: u32 = 128u;
const OLOG: u32 = 7u;
const TAU: f32 = 6.28318530718;
const GRAV: f32 = 9.81;

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}
fn brev7(x: u32) -> u32 {
  var v = x & 0xffu;
  v = ((v & 0x55u) << 1u) | ((v & 0xaau) >> 1u);
  v = ((v & 0x33u) << 2u) | ((v & 0xccu) >> 2u);
  v = ((v & 0x0fu) << 4u) | ((v & 0xf0u) >> 4u);
  return (v >> 1u) & 0x7fu;
}
fn k_of(i: u32, size: f32) -> f32 {
  var n = i32(i);
  if (n >= 64) { n = n - 128; }
  return f32(n) * TAU / size;
}

@compute @workgroup_size(16, 16)
fn evolve(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= ON || z >= ON) { return; }
  let idx = z * ON + x;
  let nx = (ON - x) % ON;
  let nz = (ON - z) % ON;
  let h0 = h0s[idx];
  let h0n = h0s[nz * ON + nx];
  let k = vec2<f32>(k_of(x, U.size), k_of(z, U.size));
  let len = length(k);
  let w = sqrt(GRAV * len);
  let ph = w * U.time;
  let e = vec2<f32>(cos(ph), sin(ph));
  let en = vec2<f32>(e.x, -e.y);
  let a = cmul(h0, e);
  let b = cmul(vec2<f32>(h0n.x, -h0n.y), en);
  spec[idx] = a + b;
}

var<workgroup> col: array<vec2<f32>, 128>;

fn butterfly(tid: u32) {
  for (var stage = 0u; stage < OLOG; stage++) {
    workgroupBarrier();
    let span = 1u << (stage + 1u);
    let half = span >> 1u;
    let inGroup = tid & (span - 1u);
    if (inGroup < half) {
      let i0 = tid;
      let i1 = tid + half;
      let ang = TAU * f32(inGroup) / f32(span);
      let w = vec2<f32>(cos(ang), sin(ang));
      let a = col[i0];
      let b = cmul(col[i1], w);
      col[i0] = a + b;
      col[i1] = a - b;
    }
  }
  workgroupBarrier();
}

@compute @workgroup_size(128)
fn ifft_rows(@builtin(workgroup_id) gid: vec3<u32>, @builtin(local_invocation_index) tid: u32) {
  let row = gid.x;
  col[tid] = spec[row * ON + brev7(tid)];
  butterfly(tid);
  spec[row * ON + tid] = col[tid] / f32(ON);
}

@compute @workgroup_size(128)
fn ifft_cols(@builtin(workgroup_id) gid: vec3<u32>, @builtin(local_invocation_index) tid: u32) {
  let c = gid.x;
  col[tid] = spec[brev7(tid) * ON + c];
  butterfly(tid);
  spec[tid * ON + c] = col[tid] / f32(ON);
}

@compute @workgroup_size(16, 16)
fn slopes(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  if (x >= ON || y >= ON) { return; }
  let h = spec[y * ON + x].x;
  let hr = spec[y * ON + (x + 1u) % ON].x;
  let hl = spec[y * ON + (x + ON - 1u) % ON].x;
  let hu = spec[((y + 1u) % ON) * ON + x].x;
  let hd = spec[((y + ON - 1u) % ON) * ON + x].x;
  let e = U.size / f32(ON);
  let dx = (hr - hl) / (2.0 * e);
  let dz = (hu - hd) / (2.0 * e);
  textureStore(outTex, vec2<i32>(i32(x), i32(y)), vec4<f32>(h, dx, dz, 1.0));
}
`;

function oceanRand(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function oceanGauss(rnd) {
  const u = Math.max(1e-7, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}
function oceanBreve(x, bits) {
  let y = 0;
  for (let i = 0; i < bits; i++) y = (y << 1) | ((x >> i) & 1);
  return y;
}
// Inverse FFT matching the GPU butterflies, used only to scale the spectrum.
function oceanIfft2(h0, n) {
  const bits = Math.log2(n) | 0;
  const spec = new Float32Array(h0);
  const col = new Float32Array(n * 2);
  const pass = (read, write, stride, count) => {
    for (let g = 0; g < count; g++) {
      for (let tid = 0; tid < n; tid++) {
        const src = read(g, oceanBreve(tid, bits));
        col[tid * 2] = src[0];
        col[tid * 2 + 1] = src[1];
      }
      for (let stage = 0; stage < bits; stage++) {
        const span = 1 << (stage + 1);
        const half = span >> 1;
        const next = new Float32Array(col);
        for (let tid = 0; tid < n; tid++) {
          const inGroup = tid & (span - 1);
          if (inGroup < half) {
            const i0 = tid, i1 = tid + half;
            const ang = Math.PI * 2 * inGroup / span;
            const wr = Math.cos(ang), wi = Math.sin(ang);
            const br = col[i1 * 2] * wr - col[i1 * 2 + 1] * wi;
            const bi = col[i1 * 2] * wi + col[i1 * 2 + 1] * wr;
            next[i0 * 2] = col[i0 * 2] + br;
            next[i0 * 2 + 1] = col[i0 * 2 + 1] + bi;
            next[i1 * 2] = col[i0 * 2] - br;
            next[i1 * 2 + 1] = col[i0 * 2 + 1] - bi;
          }
        }
        col.set(next);
      }
      for (let tid = 0; tid < n; tid++) write(g, tid, col[tid * 2] / n, col[tid * 2 + 1] / n);
    }
  };
  const row = new Float32Array(spec);
  pass(
    (g, i) => [spec[g * n * 2 + i * 2], spec[g * n * 2 + i * 2 + 1]],
    (g, i, re, im) => { row[g * n * 2 + i * 2] = re; row[g * n * 2 + i * 2 + 1] = im; },
    1, n
  );
  pass(
    (g, i) => [row[i * n * 2 + g * 2], row[i * n * 2 + g * 2 + 1]],
    (g, i, re, im) => { spec[i * n * 2 + g * 2] = re; spec[i * n * 2 + g * 2 + 1] = im; },
    n, n
  );
  return spec;
}

// h0 is tightly packed vec2 (re, im). size is the tile in meters.
// band is [minWavelength, maxWavelength] in meters. target is the std-dev
// of height (shape) or of slope (glint) after the inverse transform.
function makeOceanH0(n, size, wind, A, band, target, slopeTarget, seed, tilt) {
  const rnd = oceanRand(seed);
  const h0 = new Float32Array(n * n * 2);
  const g = 9.81;
  const wx = wind[0], wz = wind[1];
  const wlen = Math.hypot(wx, wz) || 1;
  const wdx = wx / wlen, wdz = wz / wlen;
  const L = (wlen * wlen) / g;
  const kOf = (i) => {
    let k = i;
    if (k >= n / 2) k -= n;
    return k * Math.PI * 2 / size;
  };
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const kx = kOf(x), kz = kOf(z);
      const k2 = kx * kx + kz * kz;
      const o = (z * n + x) * 2;
      if (k2 < 1e-8) { h0[o] = 0; h0[o + 1] = 0; continue; }
      const k = Math.sqrt(k2);
      const lambda = Math.PI * 2 / k;
      if (lambda < band[0] || lambda > band[1]) { h0[o] = 0; h0[o + 1] = 0; continue; }
      const kd = (kx * wdx + kz * wdz) / k;
      // A wind sea with a wide spread, plus a narrower swell from another heading.
      // cos^2 alone lines every crest up with the wind.
      const spread = (c, s) => Math.pow(Math.max(0, 0.5 * (1 + c)), s);
      const sdx = wdx * 0.41 - wdz * 0.91;
      const sdz = wdx * 0.91 + wdz * 0.41;
      const swell = (kx * sdx + kz * sdz) / k;
      const longW = Math.max(0, Math.min(1, (lambda - 12) / 30));
      // The second heading stays broad. A tile holds only a handful of long modes, and
      // a narrow lobe of them is a ruled grid from the air.
      const dir = spread(kd, 2) * 0.8 + spread(swell, 3) * (0.3 + longW * 0.15);
      // tilt lifts the short end of the band. Wind chop keeps its slope there.
      const phillips = A * Math.exp(-1 / (k2 * L * L)) / (k2 * k2) * dir * (tilt ? Math.pow(k, tilt) : 1);
      // Phillips puts nearly all the energy in the longest waves the band allows, and
      // a tile has only a few of those. Rolling them off moves the peak to wavelengths
      // the tile holds dozens of, in many directions, so no single train is visible.
      const u = Math.max(0, Math.min(1, (lambda - band[1] * 0.42) / (band[1] * 0.58)));
      const roll = 1 - u * u * (3 - 2 * u);
      const amp = Math.sqrt(Math.max(phillips, 0) * 0.5) * roll;
      h0[o] = oceanGauss(rnd) * amp;
      h0[o + 1] = oceanGauss(rnd) * amp;
    }
  }
  // A real height field needs h0(-k) = conj(h0(k)).
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const nx = (n - x) % n, nz = (n - z) % n;
      if (nz * n + nx < z * n + x) continue;
      const o = (z * n + x) * 2;
      const p = (nz * n + nx) * 2;
      h0[p] = h0[o];
      h0[p + 1] = -h0[o + 1];
    }
  }
  h0[0] = 0; h0[1] = 0;
  const spatial = oceanIfft2(h0, n);
  let hs = 0, hn = 0, ss = 0, sn = 0;
  const e = size / n;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const h = spatial[(z * n + x) * 2];
      hs += h * h; hn++;
      const hr = spatial[(z * n + ((x + 1) % n)) * 2];
      const hl = spatial[(z * n + ((x + n - 1) % n)) * 2];
      const dx = (hr - hl) / (2 * e);
      ss += dx * dx; sn++;
    }
  }
  const hStd = Math.sqrt(hs / hn) || 1;
  const sStd = Math.sqrt(ss / sn) || 1;
  const scale = slopeTarget ? (slopeTarget / sStd) : (target / hStd);
  for (let i = 0; i < h0.length; i++) h0[i] *= scale;
  return h0;
}
