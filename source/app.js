const PRESETS = {
  low:  { name: 'low',  hres: 384, span: 560, terrain: 240, textent: 460, water: 200, grass: 900,  weed: 0,   palms: 48,  broad: 36,  forest: 380,  rocks: 40, stacks: 6,  birds: 5,  fish: 0.6, reef: 26, seagrass: 420,  shadow: 4, clouds: 3, drops: 5000, refl: 1, scale: 0.72, dpr: 1,    maxPx: 900000 },
  med:  { name: 'med',  hres: 512, span: 560, terrain: 210, textent: 500, water: 248, grass: 2800, weed: 420, palms: 100, broad: 80,  forest: 950,  rocks: 70, stacks: 9,  birds: 8,  fish: 1,   reef: 40, seagrass: 1000, shadow: 6, clouds: 3, drops: 9000, refl: 1, scale: 0.9,  dpr: 1.25, maxPx: 1900000 },
  high: { name: 'high', hres: 640, span: 560, terrain: 300, textent: 530, water: 288, grass: 5600, weed: 800, palms: 160, broad: 130, forest: 1700, rocks: 100, stacks: 12, birds: 12, fish: 1.5, reef: 56, seagrass: 1800, shadow: 10, clouds: 4, drops: 14000, refl: 1, scale: 1,   dpr: 1.5,  maxPx: 3400000 }
};

const WAVES = [
  [1.00, 0.02, 1.45, 44, 0.58],
  [1.00, 0.02, 0.28, 22, 0.75],
  [0.996, 0.09, 0.07, 68, 0.18],
  [0.996, -0.09, 0.045, 33, 0.14],
  [0.86, 0.42, 0.018, 17, 0.08],
  [0.72, -0.62, 0.012, 11, 0.06],
  [0.22, 0.97, 0.16, 52, 0.22],
  [-0.38, 0.92, 0.09, 29, 0.16]
];

const SUN = (function () {
  const v = [-0.74, 0.50, -0.42];
  const L = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / L, v[1] / L, v[2] / L];
})();

const qstr = new URLSearchParams(location.search);
// Startup phases in ms since script start. Read as window.__perf, or printed with ?perf.
const PERF = { t0: performance.now() };
function mark(k) { PERF[k] = Math.round(performance.now() - PERF.t0); }
window.__perf = PERF;
function detectQuality() {
  const q = (qstr.get('q') || '').toLowerCase();
  if (PRESETS[q]) return q;
  let saved = null;
  try { saved = localStorage.getItem('ww-q'); } catch (e) {}
  if (PRESETS[saved]) return saved;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && mem <= 4) return 'low';
  if (coarse || mem <= 4 || cores <= 4) return 'med';
  return 'high';
}

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const barEl = $('bar');
const goEl = $('go');
const panelEl = $('panel');
const scrimEl = $('scrim');
const hintEl = $('hint');
const statsEl = $('stats');
const failEl = $('fail');
const menuBtn = $('menubtn');

function setStatus(text, t) {
  if (statusEl) statusEl.textContent = text;
  if (barEl) barEl.style.transform = 'scaleX(' + Math.max(0.02, t) + ')';
}
function fail(msg) {
  if (failEl) { failEl.hidden = false; failEl.textContent = msg; }
  if (goEl) goEl.hidden = true;
  if (statusEl) statusEl.textContent = 'This coast needs WebGPU.';
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const P = new Float32Array(16);
const V = new Float32Array(16);
const VP = new Float32Array(16);
const INV = new Float32Array(16);
const RVP = new Float32Array(16);
const SHVP = new Float32Array(16);
function ortho(out, l, r, b, t, n, f) {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = 1 / (n - f);
  out[12] = (l + r) / (l - r);
  out[13] = (t + b) / (b - t);
  out[14] = n / (n - f);
  out[15] = 1;
}
function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy * 0.5);
  const ri = 1 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = far * ri; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = near * far * ri; out[15] = 0;
}
function viewFrom(eye, right, up, fwd, out) {
  const zx = -fwd[0], zy = -fwd[1], zz = -fwd[2];
  out[0] = right[0]; out[1] = up[0]; out[2] = zx; out[3] = 0;
  out[4] = right[1]; out[5] = up[1]; out[6] = zy; out[7] = 0;
  out[8] = right[2]; out[9] = up[2]; out[10] = zz; out[11] = 0;
  out[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  out[13] = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
}
function matmul(a, b, o) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}
function invert(a, o) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}

function cameraVectors(yaw, pitch, fwd, right, up) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  fwd[0] = sy * cp; fwd[1] = sp; fwd[2] = -cy * cp;
  right[0] = cy; right[1] = 0; right[2] = sy;
  up[0] = right[1] * fwd[2] - right[2] * fwd[1];
  up[1] = right[2] * fwd[0] - right[0] * fwd[2];
  up[2] = right[0] * fwd[1] - right[1] * fwd[0];
}
function lookYP(dx, dy, dz) {
  const horiz = Math.hypot(dx, dz) || 1e-4;
  return [Math.atan2(dx, -dz), Math.atan2(dy, horiz)];
}

// Vertex kinds. The shader lights each one differently.
const SOLID = 0, BARK = 1, LEAF = 2, CROWN = 3, ROCK = 4, WOOD = 9;
function Mesh() { this.pos = []; this.nrm = []; this.col = []; this.sway = []; this.kind = []; this.uv = []; this.idx = []; }
Mesh.prototype.v = function (x, y, z, nx, ny, nz, r, g, b, s, kind, u, v) {
  const i = this.pos.length / 3;
  this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.col.push(r, g, b); this.sway.push(s || 0);
  this.kind.push(kind || 0); this.uv.push(u || 0, v || 0);
  return i;
};
Mesh.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };
function appendMesh(dst, src, x, y, z, rot, sc, tint, sy) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const base = dst.pos.length / 3;
  const squash = sy || 1;
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  const vc = src.pos.length / 3;
  for (let i = 0; i < vc; i++) {
    let px = src.pos[i * 3] * sc, py = src.pos[i * 3 + 1] * sc * squash, pz = src.pos[i * 3 + 2] * sc;
    const rx = px * c - pz * s, rz = px * s + pz * c;
    dst.pos.push(rx + x, py + y, rz + z);
    let nx = src.nrm[i * 3], ny = src.nrm[i * 3 + 1] / squash, nz = src.nrm[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    dst.nrm.push(nx * c - nz * s, ny, nx * s + nz * c);
    dst.col.push(src.col[i * 3] * tr, src.col[i * 3 + 1] * tg, src.col[i * 3 + 2] * tb);
    dst.sway.push(src.sway[i]);
    dst.kind.push(src.kind[i]); dst.uv.push(src.uv[i * 2], src.uv[i * 2 + 1]);
  }
  for (let k = 0; k < src.idx.length; k++) dst.idx.push(src.idx[k] + base);
}

function icosphere(sub, rad, col) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const norm = (p) => { const L = Math.hypot(p[0], p[1], p[2]); return [p[0] / L, p[1] / L, p[2] / L]; };
  v = v.map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = Object.create(null);
    const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (cache[k] != null) return cache[k];
      const p = norm([(v[a][0] + v[b][0]) * 0.5, (v[a][1] + v[b][1]) * 0.5, (v[a][2] + v[b][2]) * 0.5]);
      v.push(p); cache[k] = v.length - 1; return v.length - 1;
    };
    const nf = [];
    for (let i = 0; i < f.length; i++) {
      const A = f[i][0], B = f[i][1], C = f[i][2];
      const ab = mid(A, B), bc = mid(B, C), ca = mid(C, A);
      nf.push([A, ab, ca], [B, bc, ab], [C, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  const m = new Mesh();
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    const j = (i * 17) % 10 / 10;
    m.v(p[0] * rad, p[1] * rad, p[2] * rad, p[0], p[1], p[2], col[0] * (0.85 + j * 0.2), col[1] * (0.85 + j * 0.2), col[2] * (0.85 + j * 0.2), 0);
  }
  for (let i = 0; i < f.length; i++) m.tri(f[i][0], f[i][1], f[i][2]);
  return m;
}

function cylinder(sides, rings, r0, r1, h, col, swayTop) {
  const m = new Mesh();
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = h * t;
    const r = r0 + (r1 - r0) * t;
    const row = [];
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      row.push(m.v(nx * r, y, nz * r, nx, 0, nz, col[0], col[1], col[2], swayTop * t));
    }
    rows.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rows[i][k], b = rows[i][(k + 1) % sides];
      const c = rows[i + 1][k], d = rows[i + 1][(k + 1) % sides];
      m.tri(a, c, b); m.tri(b, c, d);
    }
  }
  return m;
}

function seeded(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addLeaflet(m, ox, oy, oz, dirx, diry, dirz, len, wid, col, sway) {
  const dl = Math.hypot(dirx, diry, dirz) || 1;
  dirx /= dl; diry /= dl; dirz /= dl;
  let sx = -dirz, sz = dirx;
  const sl = Math.hypot(sx, sz) || 1;
  sx /= sl; sz /= sl;
  const tipC = [col[0] * 1.25, col[1] * 0.95, col[2] * 0.62];
  const vert = (t, side) => {
    const w = wid * (1 - t * 0.86);
    const droop = t * t * len * 0.22;
    const x = ox + dirx * len * t + sx * w * side;
    const y = oy + diry * len * t - droop;
    const z = oz + dirz * len * t + sz * w * side;
    const c = t > 0.62 ? tipC : col;
    return m.v(x, y, z, dirx * 0.2 + sx * side * 0.15, 0.92, dirz * 0.2 + sz * side * 0.15, c[0], c[1], c[2], sway * (0.2 + t * t * 1.15), LEAF, side, t);
  };
  const bL = vert(0.0, 1), bR = vert(0.0, -1);
  const mL = vert(0.42, 1), mR = vert(0.42, -1);
  const tip = vert(1, 0);
  m.tri(bL, mL, bR); m.tri(bR, mL, mR);
  m.tri(mL, tip, mR);
}

// A coconut palm, in metres, leaning along +x. Level 0 carries every leaflet. The
// coarser levels keep fewer, wider leaflets on the same trunk and the same fronds,
// so a palm keeps its shape as it recedes.
function makePalm(seed, lod) {
  const rnd = seeded(seed * 9973 + 17);
  const m = new Mesh();
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const H = 6.5 + rnd() * 5.5, lean = 0.1 + rnd() * rnd() * 0.65, topSway = 0.09;
  const sides = [12, 7, 4][lod], rings = [36, 12, 5][lod];
  // Trunk: out of the ground at an angle, then curving back up toward the light.
  let P = [0, -0.2, 0];
  let last = null;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, s = t * H;
    const th = lean * (1 - 0.92 * Math.pow(t, 0.75));
    const T = [Math.sin(th), Math.cos(th), 0], X = [Math.cos(th), -Math.sin(th), 0];
    const r = 0.125 - 0.03 * t + 0.17 * Math.exp(-s / 0.45) + 0.06 * smooth01(0.92, 1, t);
    const row = [];
    for (let k = 0; k <= sides; k++) {
      const a = k / sides * 6.2832, ca = Math.cos(a), sa = Math.sin(a);
      const nx = X[0] * ca, ny = X[1] * ca, nz = sa;
      row.push(m.v(P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, nx, ny, nz, 0.37, 0.34, 0.3, topSway * t * t, BARK, k / sides, s));
    }
    if (last) for (let k = 0; k < sides; k++) { m.tri(last[k], row[k], last[k + 1]); m.tri(last[k + 1], row[k], row[k + 1]); }
    last = row;
    if (i < rings) P = add(P, T, H / rings);
  }
  const C = P;
  const nf = 20 + ((rnd() * 7) | 0), nd = 1 + ((rnd() * 3) | 0);
  const nseg = [18, 8, 4][lod], lseg = [4, 2, 2][lod];
  for (let j = 0; j < nf + nd; j++) {
    const dead = j >= nf;
    // 0 has just opened at the top of the crown. 1 is about to fall.
    const age = dead ? 1.1 : (j + rnd() * 0.7) / nf;
    const az0 = j * 2.39996 + rnd() * 0.6;
    const el0 = dead ? -1.2 - rnd() * 0.25 : 1.3 - Math.pow(age, 1.1) * 1.75 + (rnd() - 0.5) * 0.3;
    const L = dead ? 2.6 + rnd() : 4.0 + 1.5 * Math.sin(Math.min(1, age * 1.25 + 0.1) * Math.PI) + rnd() * 0.5;
    const droop = dead ? 0.15 : 0.55 + age * 0.7 + rnd() * 0.35;
    const curl = (rnd() - 0.5) * 0.8, twist = (rnd() - 0.5) * 2.2 * (0.3 + age), tipSway = 0.2 + rnd() * 0.14;
    const widthK = 0.024 + rnd() * 0.006, lenK = 0.95 + rnd() * 0.3, hang0 = rnd() * 0.3;
    // Leaflets draw from their own stream, so every level builds the same fronds.
    const fr = seeded(seed * 131 + j * 977 + 5);
    // The rachis starts in the crown and bends over under its own weight, twisting as it goes.
    const pts = [];
    let p = [C[0] + Math.cos(az0) * 0.1, C[1] - 0.3 + (1 - Math.min(age, 1)) * 0.4, C[2] + Math.sin(az0) * 0.1];
    for (let k = 0; k <= nseg; k++) {
      const t = k / nseg;
      const e = el0 - droop * Math.pow(t, 1.5), az = az0 + curl * t * t, ro = twist * t;
      const ce = Math.cos(e), se = Math.sin(e), ca = Math.cos(az), sa = Math.sin(az);
      const T = [ce * ca, se, ce * sa], S0 = [-sa, 0, ca], U0 = [-se * ca, ce, -se * sa];
      const cr = Math.cos(ro), sr = Math.sin(ro);
      const S = [S0[0] * cr + U0[0] * sr, S0[1] * cr + U0[1] * sr, S0[2] * cr + U0[2] * sr];
      const U = [U0[0] * cr - S0[0] * sr, U0[1] * cr - S0[1] * sr, U0[2] * cr - S0[2] * sr];
      pts.push({ p: p, T: T, S: S, U: U });
      p = add(p, T, L / nseg);
    }
    const rc = dead ? [0.3, 0.22, 0.12] : [0.27 - age * 0.05, 0.3 - age * 0.06, 0.1];
    const ring = lod === 0 ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[1, 0], [-1, 0]];
    let prev = null;
    for (let k = 0; k <= nseg; k++) {
      const q = pts[k], t = k / nseg;
      const w = 0.006 + 0.034 * (1 - t) + 0.05 * Math.max(0, 1 - t / 0.12), hgt = w * 0.55;
      const row = ring.map((ab) => {
        const o = add(add(q.p, q.S, ab[0] * w), q.U, ab[1] * hgt);
        const n = lod === 0 ? add(add([0, 0, 0], q.S, ab[0]), q.U, ab[1]) : q.U;
        return m.v(o[0], o[1], o[2], n[0], n[1], n[2], rc[0], rc[1], rc[2], topSway + tipSway * t * t, SOLID);
      });
      if (prev) for (let i = 0; i < (ring.length > 2 ? ring.length : 1); i++) {
        const i1 = (i + 1) % ring.length;
        m.tri(prev[i], row[i], prev[i1]); m.tri(prev[i1], row[i], row[i1]);
      }
      prev = row;
    }
    const per = Math.max(3, Math.round(L * [13, 4.4, 1.6][lod]));
    const W = widthK * [1, 2.8, 7][lod] * (dead ? 0.6 : 1);
    const lift = dead ? -0.2 : 0.45 - age * 0.6;
    const hang = dead ? 2.5 : 0.25 + age * 1.5 + hang0;
    const young = sat(1 - age / 0.3), old = sat((age - 0.72) / 0.28);
    const green = dead ? [0.3, 0.22, 0.1] : [
      0.085 + young * 0.085 + old * 0.11, 0.185 + young * 0.085 + old * 0.02, 0.045 + young * 0.015 + old * 0.015];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < per; i++) {
        const u = (i + 0.5 + (fr() - 0.5) * 0.6) / per, t = 0.14 + u * 0.86;
        const f = Math.min(nseg - 1e-4, t * nseg), k0 = f | 0, A = pts[k0];
        const T = A.T;
        // Short at the base of the frond, longest a third of the way out, short again at the tip.
        const len = (dead ? 0.5 : lenK) * Math.pow(Math.sin(Math.PI * (0.08 + 0.9 * Math.pow(u, 0.6))), 0.75) * (1 - 0.25 * u) * (0.82 + fr() * 0.36);
        const phi = 1.2 - u * 0.65 + (fr() - 0.5) * 0.3, lu = lift + (fr() - 0.5) * 0.35;
        const cp = Math.cos(phi), sp = Math.sin(phi) * side;
        const d = unit([T[0] * cp + A.S[0] * sp + A.U[0] * lu, T[1] * cp + A.S[1] * sp + A.U[1] * lu, T[2] * cp + A.S[2] * sp + A.U[2] * lu]);
        const hg = hang * (0.8 + fr() * 0.4);
        // Darker inside the crown, where the sky is hidden by the fronds above.
        const tone = (0.8 + fr() * 0.4) * (0.5 + 0.5 * smooth01(0.2, 2.4, t * L)) * (1 - 0.22 * Math.min(1, age));
        const sw0 = topSway + tipSway * t * t;
        const B = pts[k0 + 1].p, fk = f - k0;
        let q = [A.p[0] + (B[0] - A.p[0]) * fk, A.p[1] + (B[1] - A.p[1]) * fk, A.p[2] + (B[2] - A.p[2]) * fk];
        let pl = -1, pr = -1;
        for (let k = 0; k <= lseg; k++) {
          const s = k / lseg;
          const dir = unit([d[0], d[1] - hg * Math.pow(s, 1.3), d[2]]);
          let n = cross(T, dir);
          n = Math.hypot(n[0], n[1], n[2]) < 0.05 ? A.U : unit([n[0] * side, n[1] * side, n[2] * side]);
          const a = unit(cross(n, dir));
          const w = W * Math.min(1, 0.4 + s * 4) * Math.pow(1 - Math.pow(s, 2.2), 0.8);
          const brown = old * s * s * 0.7;
          const cr = (green[0] * (1 - brown) + 0.3 * brown) * tone, cg = (green[1] * (1 - brown) + 0.2 * brown) * tone, cb = (green[2] * (1 - brown) + 0.07 * brown) * tone;
          const sw = sw0 + 0.07 * s;
          if (k === lseg) {
            const tip = m.v(q[0], q[1], q[2], n[0], n[1], n[2], cr, cg, cb, sw, LEAF, 0, 1);
            m.tri(pl, tip, pr);
          } else {
            // The blade is folded along its midrib like a shallow roof.
            const l = m.v(q[0] + a[0] * w, q[1] + a[1] * w, q[2] + a[2] * w, n[0] + a[0] * 0.35, n[1] + a[1] * 0.35, n[2] + a[2] * 0.35, cr, cg, cb, sw, LEAF, 1, s);
            const r = m.v(q[0] - a[0] * w, q[1] - a[1] * w, q[2] - a[2] * w, n[0] - a[0] * 0.35, n[1] - a[1] * 0.35, n[2] - a[2] * 0.35, cr, cg, cb, sw, LEAF, -1, s);
            if (pl >= 0) { m.tri(pl, l, pr); m.tri(pr, l, r); }
            pl = l; pr = r;
          }
          q = add(q, dir, len / lseg);
        }
      }
    }
  }
  if (lod < 2) {
    const nuts = 4 + ((rnd() * 7) | 0);
    for (let i = 0; i < nuts; i++) {
      const a = rnd() * 6.283, rr = 0.2 + rnd() * 0.12, from = m.sway.length;
      const nut = icosphere(1, 0.115 + rnd() * 0.03, rnd() < 0.6 ? [0.2, 0.27, 0.07] : [0.3, 0.24, 0.1]);
      appendMesh(m, nut, C[0] + Math.cos(a) * rr, C[1] - 0.45 - rnd() * 0.3, C[2] + Math.sin(a) * rr, rnd() * 6, 1, null, 1.25);
      for (let k = from; k < m.sway.length; k++) m.sway[k] = topSway;
    }
  }
  return m;
}

// A fern: fronds arching out of one crown, each a stalk with a row of pinnae down either
// side, longest in the middle. The coarse level keeps fewer fronds and pinnae.
function makeFern(seed) {
  const rnd = seeded(seed || 2);
  const m = new Mesh();
  const n = 6 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const ang = i / n * Math.PI * 2 + rnd() * 0.5;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const sx = -dz, sz = dx;
    const len = 0.42 + rnd() * 0.22;
    const steps = 7;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const y = Math.sin(t * 1.4) * 0.16 - t * t * 0.05;
      const x = dx * t * len, z = dz * t * len;
      const bell = Math.sin(t * Math.PI);
      const col = [0.08 + rnd() * 0.04, 0.32 + rnd() * 0.1, 0.08];
      for (let side = -1; side <= 1; side += 2) {
        addLeaflet(m, x, y, z, dx * 0.2 + sx * side, 0.15 - t * 0.2, dz * 0.2 + sz * side, 0.08 + bell * 0.1, 0.012, col, 0.45 + t);
      }
    }
  }
  return m;
}

function makeCanopy(seed) {
  const rnd = seeded(seed || 5);
  const m = new Mesh();
  const trunk = cylinder(7, 8, 0.1, 0.045, 0.72, [0.3, 0.2, 0.12], 0.04);
  appendMesh(m, trunk, 0, 0, 0, rnd() * 3, 1, null, 1);
  const leaves = 8 + (seed % 4);
  for (let i = 0; i < leaves; i++) {
    const ang = i * 2.399 + rnd() * 0.2;
    const reach = 0.32 + rnd() * 0.28;
    const col = [0.07 + rnd() * 0.05, 0.26 + rnd() * 0.12, 0.05 + rnd() * 0.03];
    addLeaflet(m, Math.cos(ang) * 0.06, 0.7, Math.sin(ang) * 0.06, Math.cos(ang), 0.15 + rnd() * 0.35, Math.sin(ang), reach, 0.1 + rnd() * 0.04, col, 0.26);
  }
  return m;
}

function makeBroad(seed) {
  const rnd = seeded(seed || 3);
  const m = new Mesh();
  const trunk = cylinder(8, 6, 0.07, 0.035, 0.42, [0.30, 0.22, 0.13], 0.03);
  appendMesh(m, trunk, 0, 0, 0, rnd() * 3, 1, null, 1);
  const fans = 6 + (seed % 3);
  for (let i = 0; i < fans; i++) {
    const ang = i / fans * Math.PI * 2 + rnd() * 0.4;
    const reach = 0.28 + rnd() * 0.22;
    const x = Math.cos(ang) * reach;
    const z = Math.sin(ang) * reach;
    const y = 0.38 + rnd() * 0.22;
    for (let k = 0; k < 5; k++) {
      const a = ang + (k - 2) * 0.28;
      const col = [0.1 + rnd() * 0.06, 0.28 + rnd() * 0.12, 0.07];
      addLeaflet(m, x * 0.25, 0.36, z * 0.25, Math.cos(a), 0.35 + rnd() * 0.3, Math.sin(a), 0.22 + rnd() * 0.12, 0.045, col, 0.35);
    }
    addLeaflet(m, x * 0.15, y, z * 0.15, Math.cos(ang), 0.15, Math.sin(ang), 0.16, 0.05, [0.14, 0.32, 0.08], 0.22);
  }
  return m;
}

function makeShrub(seed) {
  const rnd = seeded(seed || 9);
  const m = new Mesh();
  const fans = 5 + (seed % 3);
  for (let i = 0; i < fans; i++) {
    const ang = i / fans * Math.PI * 2 + rnd();
    const y = 0.02 + rnd() * 0.06;
    for (let k = 0; k < 4; k++) {
      const a = ang + (k - 1.5) * 0.4;
      const col = [0.16 + rnd() * 0.08, 0.34 + rnd() * 0.1, 0.08];
      addLeaflet(m, Math.cos(ang) * 0.04, y, Math.sin(ang) * 0.04, Math.cos(a), 0.55 + rnd() * 0.4, Math.sin(a), 0.18 + rnd() * 0.1, 0.035, col, 0.5);
    }
  }
  return m;
}

function makeRock(seed, lod) {
  // A boulder is a lump that has lost pieces along planes, and has then had its edges
  // worn round: the cuts give it faces, the shared normals take the knife edge off them.
  const src = icosphere(lod ? 2 : 3, 1, [0.4, 0.4, 0.4]);
  const sd = (seed | 0) || 1;
  const rnd = seeded(sd * 7 + 3);
  const planes = [];
  const count = 7 + (Math.abs(sd) % 4);
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.283, py = rnd() * 1.5 - 0.3;
    const l = Math.hypot(1, py);
    planes.push([Math.cos(a) / l, py / l, Math.sin(a) / l, 0.48 + rnd() * 0.38]);
  }
  const n = src.pos.length / 3;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = src.pos[i * 3], y = src.pos[i * 3 + 1], z = src.pos[i * 3 + 2];
    const lump = 1 + (vnoise(x * 1.6 + sd, z * 1.6 + y * 1.3) - 0.5) * 0.55;
    x *= lump; y *= lump; z *= lump;
    for (let k = 0; k < planes.length; k++) {
      const pl = planes[k];
      const d = x * pl[0] + y * pl[1] + z * pl[2] - pl[3];
      if (d > 0) { x -= pl[0] * d; y -= pl[1] * d; z -= pl[2] * d; }
    }
    const fine = (vnoise(x * 6.5 + sd, z * 6.5 + y * 5.1) - 0.5) * 0.07;
    x += src.nrm[i * 3] * fine; z += src.nrm[i * 3 + 2] * fine;
    y = (y + src.nrm[i * 3 + 1] * fine) * (y < 0 ? 0.45 : 0.8);
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  }
  const N = new Float32Array(n * 3);
  for (let f = 0; f < src.idx.length; f += 3) {
    const ia = src.idx[f] * 3, ib = src.idx[f + 1] * 3, ic = src.idx[f + 2] * 3;
    const ux = P[ib] - P[ia], uy = P[ib + 1] - P[ia + 1], uz = P[ib + 2] - P[ia + 2];
    const wx = P[ic] - P[ia], wy = P[ic + 1] - P[ia + 1], wz = P[ic + 2] - P[ia + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const k of [ia, ib, ic]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  const m = new Mesh();
  for (let i = 0; i < n; i++) {
    const mx = P[i * 3], my = P[i * 3 + 1], mz = P[i * 3 + 2];
    const nl = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1, ny = N[i * 3 + 1] / nl;
    // Bedding lines, weathering on top, a dark tide stain at the foot.
    const strata = 0.84 + 0.16 * Math.sin(my * 11 + vnoise(mx * 2.1 + sd, mz * 2.1) * 5);
    const patch = 0.8 + 0.4 * vnoise(mx * 3.3 + sd, mz * 3.3 + my * 2.7);
    const top = ny > 0.55 ? vnoise(mx * 4 + 9, mz * 4) : 0;
    const foot = 1 - 0.45 * smooth01(0.05, -0.3, my);
    const k = strata * patch * foot;
    m.v(mx, my, mz, N[i * 3] / nl, ny, N[i * 3 + 2] / nl, 0.31 * k * (1 - top * 0.2), 0.285 * k * (1 + top * 0.08), 0.25 * k * (1 - top * 0.25), 0, ROCK);
  }
  for (let f = 0; f < src.idx.length; f += 3) m.tri(src.idx[f], src.idx[f + 1], src.idx[f + 2]);
  return m;
}

// The same clearings in the tree placement and in the ground under the trees.
// Sines, so the shader can evaluate exactly what this does.
function forestNoise(x, z) {
  return Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.5)
    + 0.6 * Math.sin((x + z) * 0.053 + 2.1) * Math.sin((x - z) * 0.047 + 0.4)
    + 0.35 * Math.sin(x * 0.11 + 3.0) * Math.sin(z * 0.13 + 1.0);
}
function forestMask(x, z, h, grad) {
  return smooth01(1.9, 4.4, h) * (1 - smooth01(0.55, 1.0, grad)) * smooth01(-0.62, -0.12, forestNoise(x, z));
}

// A limb: a tube along a line of points, tapering, with wood for a surface. flare swells
// the foot into buttress roots.
function addLimb(m, pts, r0, r1, sides, col, sway0, sway1, flare) {
  const n = pts.length, rows = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const rx = Math.abs(tz) > 0.9 ? 1 : 0, rz = 1 - rx;
    let ux = ty * rz, uy = tz * rx - tx * rz, uz = -ty * rx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    const t = i / (n - 1), r = r0 + (r1 - r0) * t, row = [];
    for (let k = 0; k <= sides; k++) {
      const ang = k / sides * 6.2832, c = Math.cos(ang), sn = Math.sin(ang);
      const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
      const rr = r * (1 + (flare ? flare * Math.pow(1 - t, 5) * (0.5 + Math.max(0, Math.cos(ang * 3 + flare * 40))) : 0));
      row.push(m.v(p[0] + nx * rr, p[1] + ny * rr, p[2] + nz * rr, nx, ny, nz, col[0], col[1], col[2], sway0 + (sway1 - sway0) * t, WOOD, k / sides, len));
    }
    rows.push(row);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k], d = rows[i + 1][k + 1]; m.tri(a, c, b); m.tri(b, c, d); }
}

// A forest tree: a buttressed trunk that bows, limbs that rise and then reach out, and a
// spreading crown of leaf masses, one at the end of each limb. The shader turns the surface
// of each mass into leaves. Three levels of detail share the same shape.
function makeTree(seed, lod) {
  const sd = (seed | 0) || 1, rnd = seeded(sd * 13 + 5), m = new Mesh();
  const th = 0.4 + rnd() * 0.22, lean = (rnd() - 0.5) * 0.14, bow = (rnd() - 0.5) * 0.07, r0 = 0.024 + rnd() * 0.011;
  const bark = [0.21 + rnd() * 0.05, 0.17 + rnd() * 0.04, 0.125 + rnd() * 0.03];
  const at = (t) => [lean * t * t + bow * Math.sin(t * 3.1416), th * t, bow * 0.6 * Math.sin(t * 2.2)];
  const rings = [7, 4, 2][lod], pts = [];
  for (let i = 0; i <= rings; i++) pts.push(at(Math.pow(i / rings, 1.6)));
  if (lod === 2) pts.push([lean, th + 0.22, 0]);
  const flare = 0.7 + rnd() * 0.9;
  addLimb(m, pts, r0, r0 * 0.6, [9, 6, 4][lod], bark, 0, 0.012, lod < 2 ? flare : 0);
  const lobes = 5 + (Math.abs(sd) % 4), spread = 0.2 + rnd() * 0.12, hue = rnd();
  for (let i = 0; i < lobes; i++) {
    const blob = icosphere(lod ? 1 : 2, 1, [0.1, 0.1, 0.1]), n = blob.pos.length / 3;
    const ang = i * 2.399 + rnd() * 0.8;
    const rr = i === 0 ? 0 : spread * (0.6 + rnd() * 0.7);
    const size = (i === 0 ? 0.27 : 0.18) + rnd() * 0.09;
    const cy = th + (i === 0 ? 0.17 : rnd() * 0.15) + size * 0.3;
    const cx = Math.cos(ang) * rr + lean, cz = Math.sin(ang) * rr;
    const flat = 0.5 + rnd() * 0.2;
    if (lod < 2) {
      const s0 = at(i === 0 ? 1 : 0.68 + rnd() * 0.3), e = [cx, cy - size * flat * 0.2, cz], q = [];
      const c = [s0[0] + (e[0] - s0[0]) * 0.25, s0[1] + (e[1] - s0[1]) * 0.8, s0[2] + (e[2] - s0[2]) * 0.25];
      for (let k = 0; k <= 3; k++) { const t = k / 3, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t; q.push([s0[0] * a + c[0] * b + e[0] * d, s0[1] * a + c[1] * b + e[1] * d, s0[2] * a + c[2] * b + e[2] * d]); }
      addLimb(m, q, r0 * (i === 0 ? 0.6 : 0.36), r0 * 0.13, [5, 4][lod], bark, 0.012, 0.03, 0);
    }
    for (let v = 0; v < n; v++) {
      const x = blob.pos[v * 3], y = blob.pos[v * 3 + 1], z = blob.pos[v * 3 + 2];
      const lump = 0.72 + 0.4 * vnoise(x * 2.3 + sd + i * 3.1, z * 2.3 + y * 1.9) + 0.22 * vnoise(x * 5.3 + i * 7.7, z * 5.3 + y * 4.1 + sd);
      const px = x * lump * size, py = y * lump * size * (y < 0 ? flat * 0.55 : flat), pz = z * lump * size;
      blob.pos[v * 3] = px + cx; blob.pos[v * 3 + 1] = py + cy; blob.pos[v * 3 + 2] = pz + cz;
      // Lit leaves on top, the shaded inside of the crown underneath.
      const up = Math.max(0, Math.min(1, y * 0.5 + 0.5));
      const lightK = 0.35 + 0.65 * up * up;
      blob.col[v * 3] = (0.05 + hue * 0.025) * lightK;
      blob.col[v * 3 + 1] = (0.115 + hue * 0.03) * lightK;
      blob.col[v * 3 + 2] = (0.03 + (1 - hue) * 0.012) * lightK;
      blob.sway[v] = 0.03 + up * 0.035;
      blob.kind[v] = CROWN;
    }
    appendMesh(m, blob, 0, 0, 0, 0, 1, null, 1);
  }
  return m;
}

function makeSkiff() {
  const m = new Mesh();
  const sec = 7;
  const rings = [];
  for (let i = 0; i <= sec; i++) {
    const t = i / sec;
    const z = -1.35 + t * 3.05;
    const bow = t > 0.72 ? (t - 0.72) / 0.28 : 0;
    const mid = Math.sin(Math.min(t, 0.72) / 0.72 * Math.PI);
    const beam = (0.18 + 0.42 * mid) * (1 - bow * 0.92);
    const lift = bow * 0.62;
    const keel = 0.02 + lift;
    const gun = 0.36 + lift * 0.25;
    const wood = [0.45, 0.31, 0.16];
    const dark = [0.32, 0.22, 0.11];
    const row = [];
    row.push(m.v(0, keel, z, 0, -0.4, t - 0.5, dark[0], dark[1], dark[2], 0));
    row.push(m.v(-beam, keel + 0.06, z, -1, 0.1, 0, wood[0], wood[1], wood[2], 0));
    row.push(m.v(-beam * 0.9, gun, z, -0.6, 0.5, 0, wood[0] * 1.05, wood[1] * 1.05, wood[2], 0));
    row.push(m.v(beam * 0.9, gun, z, 0.6, 0.5, 0, wood[0] * 1.05, wood[1] * 1.05, wood[2], 0));
    row.push(m.v(beam, keel + 0.06, z, 1, 0.1, 0, wood[0], wood[1], wood[2], 0));
    rings.push(row);
  }
  for (let i = 0; i < sec; i++) {
    for (let k = 0; k < 4; k++) {
      const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k], d = rings[i + 1][k + 1];
      m.tri(a, b, c); m.tri(b, d, c);
    }
  }
  // transom
  const r0 = rings[0];
  m.tri(r0[0], r0[2], r0[1]); m.tri(r0[0], r0[3], r0[4]); m.tri(r0[0], r0[4], r0[2] > 0 ? r0[3] : r0[3]);
  // seats
  function box(x, y, z, sx, sy, sz, col) {
    const p = [
      [-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]
    ];
    const id = [];
    for (let i = 0; i < 8; i++) id.push(m.v(x + p[i][0] * sx, y + p[i][1] * sy, z + p[i][2] * sz, 0, 1, 0, col[0], col[1], col[2], 0));
    const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    for (let f = 0; f < faces.length; f++) {
      const q = faces[f];
      m.tri(id[q[0]], id[q[1]], id[q[2]]); m.tri(id[q[0]], id[q[2]], id[q[3]]);
    }
  }
  box(0, 0.2, -0.35, 0.28, 0.035, 0.12, [0.38, 0.26, 0.13]);
  box(0, 0.2, 0.55, 0.24, 0.035, 0.1, [0.38, 0.26, 0.13]);
  // oars, lying across the gunwale
  box(0, 0.4, 0.1, 0.85, 0.015, 0.03, [0.55, 0.48, 0.32]);
  return m;
}

function grassGeom() {
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (let a = 0; a < 4; a++) {
    const ang = a * Math.PI / 4 + (a === 3 ? 0.2 : 0);
    const c = Math.cos(ang), s = Math.sin(ang);
    const lean = 0.18 + (a % 2) * 0.08;
    const h = 0.85 + (a % 3) * 0.12;
    const corn = [[-0.16, 0, 0, 0], [0.16, 0, 1, 0], [0.035, h, 1, 1], [-0.035, h, 0, 1]];
    for (let i = 0; i < 4; i++) {
      const px = corn[i][0], py = corn[i][1];
      pos.push(px * c + lean * py * s, py, px * s - lean * py * c);
      uv.push(corn[i][2], corn[i][3]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

function birdGeom() {
  const pos = [], wing = [], idx = [];
  const add = (x, y, z, w) => { pos.push(x, y, z); wing.push(w); return pos.length / 3 - 1; };
  // A spindle of a body with a head and a fanned tail, and wings in two parts: the arm out to
  // the wrist, then the hand swept back to a point.
  const nose = add(0, 0.01, 0.3, 0), back = add(0, 0.045, 0.02, 0), belly = add(0, -0.04, 0.04, 0), rump = add(0, 0.005, -0.2, 0);
  const sl = add(-0.04, 0.0, 0.05, 0), sr = add(0.04, 0.0, 0.05, 0), beak = add(0, 0.0, 0.37, 0);
  const tl = add(-0.06, 0.0, -0.36, 0), tr = add(0.06, 0.0, -0.36, 0);
  idx.push(nose, sl, back, nose, back, sr, nose, belly, sl, nose, sr, belly, rump, back, sl, rump, sr, back, rump, sl, belly, rump, belly, sr, rump, tl, tr, beak, sl, sr);
  for (const sg of [-1, 1]) {
    const a0 = add(sg * 0.04, 0.02, 0.1, sg), a1 = add(sg * 0.3, 0.02, 0.13, sg), a2 = add(sg * 0.27, 0.012, -0.03, sg), a3 = add(sg * 0.04, 0.02, -0.07, sg);
    const h1 = add(sg * 0.62, 0.0, -0.03, sg * 2), h2 = add(sg * 0.6, 0.0, -0.055, sg * 2);
    idx.push(a0, a1, a2, a0, a2, a3, a1, h1, h2, a1, h2, a2);
  }
  return { pos: new Float32Array(pos), wing: new Float32Array(wing), idx: new Uint16Array(idx) };
}

function packInterleaved(pos, uv) {
  const n = pos.length / 3;
  const o = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    o[i * 6] = pos[i * 3]; o[i * 6 + 1] = pos[i * 3 + 1]; o[i * 6 + 2] = pos[i * 3 + 2];
    o[i * 6 + 4] = uv[i * 2]; o[i * 6 + 5] = uv[i * 2 + 1];
  }
  return o;
}
function packBird(pos, wing) {
  const n = pos.length / 3;
  const o = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    o[i * 4] = pos[i * 3]; o[i * 4 + 1] = pos[i * 3 + 1]; o[i * 4 + 2] = pos[i * 3 + 2]; o[i * 4 + 3] = wing[i];
  }
  return o;
}
// Every prototype mesh in one vertex buffer and one index buffer.
// 13 floats a vertex: position, normal, colour, sway, kind, uv.
const VSTRIDE = 13;
function packMeshes(list) {
  let nv = 0, ni = 0;
  for (const m of list) { nv += m.pos.length / 3; ni += m.idx.length; }
  const o = new Float32Array(nv * VSTRIDE), idx = new Uint32Array(ni);
  const ranges = [];
  let v0 = 0, i0 = 0;
  for (const m of list) {
    const n = m.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const at = (v0 + i) * VSTRIDE;
      o[at] = m.pos[i * 3]; o[at + 1] = m.pos[i * 3 + 1]; o[at + 2] = m.pos[i * 3 + 2];
      o[at + 3] = m.nrm[i * 3]; o[at + 4] = m.nrm[i * 3 + 1]; o[at + 5] = m.nrm[i * 3 + 2];
      o[at + 6] = m.col[i * 3]; o[at + 7] = m.col[i * 3 + 1]; o[at + 8] = m.col[i * 3 + 2];
      o[at + 9] = m.sway[i]; o[at + 10] = m.kind[i]; o[at + 11] = m.uv[i * 2]; o[at + 12] = m.uv[i * 2 + 1];
    }
    idx.set(m.idx, i0);
    ranges.push({ first: i0, count: m.idx.length, base: v0 });
    v0 += n; i0 += m.idx.length;
  }
  return { vert: o, idx: idx, ranges: ranges };
}

// Plants and rocks are a few prototype meshes drawn many times. An instance is
// 12 floats: position and yaw, scale and vertical stretch, tint.
const ISTRIDE = 12;
function Scatter() { this.protos = []; this.data = []; this.kind = []; }
// lods: meshes from finest to coarsest. cuts: the distance where each one hands over.
Scatter.prototype.proto = function (lods, radius, cuts) {
  this.protos.push({ lods: lods, r: radius, cuts: cuts || [] });
  return this.protos.length - 1;
};
Scatter.prototype.add = function (id, x, y, z, rot, sc, tint, sy) {
  const t = tint || [1, 1, 1];
  this.data.push(x, y, z, rot, sc, sy || 1, 0, 0, t[0], t[1], t[2], 0);
  this.kind.push(id);
};
Scatter.prototype.finish = function () {
  const meshes = [];
  this.slot0 = [];
  for (const p of this.protos) { this.slot0.push(meshes.length); for (const m of p.lods) meshes.push(m); }
  this.packed = packMeshes(meshes);
  this.n = this.kind.length;
  this.data = new Float32Array(this.data);
  this.slotOf = new Int16Array(this.n);
  this.counts = new Int32Array(meshes.length);
  this.starts = new Int32Array(meshes.length);
};
// Cull, pick a level of detail, and group by mesh. Writes instances into out at
// offset at (in instances) and returns the draws. vp null means no frustum test.
Scatter.prototype.collect = function (out, at, vp, ex, ey, ez, reach, coarser) {
  const d = this.data, counts = this.counts, starts = this.starts, slotOf = this.slotOf;
  counts.fill(0);
  for (let i = 0; i < this.n; i++) {
    const o = i * ISTRIDE, p = this.protos[this.kind[i]];
    const x = d[o], y = d[o + 1], z = d[o + 2], r = p.r * d[o + 4];
    const dist = Math.hypot(x - ex, y - ey, z - ez);
    let slot = -1;
    if (dist - r < reach) {
      let ok = true;
      if (vp) {
        const cy = y + r * 0.5;
        const cw = vp[3] * x + vp[7] * cy + vp[11] * z + vp[15];
        const cx = vp[0] * x + vp[4] * cy + vp[8] * z + vp[12];
        const cv = vp[1] * x + vp[5] * cy + vp[9] * z + vp[13];
        // Outside the view, or smaller than a couple of pixels.
        ok = cw > -r && Math.abs(cx) < cw + r * 2.2 && Math.abs(cv) < cw + r * 2.2 && r > dist * 0.003;
      }
      if (ok) {
        let lod = coarser;
        while (lod < p.cuts.length && dist > p.cuts[lod]) lod++;
        slot = this.slot0[this.kind[i]] + Math.min(lod, p.lods.length - 1);
        counts[slot]++;
      }
    }
    slotOf[i] = slot;
  }
  let run = at;
  const draws = [];
  for (let s = 0; s < counts.length; s++) {
    starts[s] = run;
    if (counts[s]) { const g = this.packed.ranges[s]; draws.push(g.first, g.count, g.base, run, counts[s]); }
    run += counts[s];
  }
  for (let i = 0; i < this.n; i++) {
    const s = slotOf[i];
    if (s < 0) continue;
    const o = i * ISTRIDE, t = starts[s]++ * ISTRIDE;
    for (let k = 0; k < ISTRIDE; k++) out[t + k] = d[o + k];
  }
  draws.end = run;
  return draws;
};

function gridMesh(n, heightAt) {
  const pos = new Float32Array(n * n * (heightAt ? 3 : 2));
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), v = j / (n - 1);
      if (heightAt) {
        const x = heightAt.x0 + u * heightAt.size;
        const z = heightAt.z0 + v * heightAt.size;
        const o = (j * n + i) * 3;
        pos[o] = x; pos[o + 1] = heightAt.fn(x, z); pos[o + 2] = z;
      } else {
        pos[(j * n + i) * 2] = u; pos[(j * n + i) * 2 + 1] = v;
      }
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx[t++] = a; idx[t++] = a + n; idx[t++] = a + 1;
      idx[t++] = a + 1; idx[t++] = a + n; idx[t++] = a + n + 1;
    }
  }
  return { pos: pos, idx: idx };
}

function downhillYaw(world, x, z) {
  const e = 2.5;
  const dx = fieldSample(world, x + e, z) - fieldSample(world, x - e, z);
  const dz = fieldSample(world, x, z + e) - fieldSample(world, x, z - e);
  return Math.atan2(-dx, dz);
}

// Look toward the water across a stretch of sand, not down the long axis of a spit.
// A real strip of sand with the sea a few meters downhill. The random hunt
// misses it: the shelf is only a handful of meters wide.
function findBeach(world) {
  const step = world.step;
  const stride = Math.max(1, (world.res / 180) | 0);
  let best = null, bs = -1e9;
  for (let j = stride; j < world.res - stride; j += stride) {
    for (let i = stride; i < world.res - stride; i += stride) {
      const x = world.org + i * step;
      const z = world.org + j * step;
      const h = fieldSample(world, x, z);
      if (h < 0.3 || h > 0.95) continue;
      const s = fieldSlope(world, x, z);
      if (s < 0.03 || s > 0.26) continue;
      const e = step * 2;
      const dx = fieldSample(world, x + e, z) - fieldSample(world, x - e, z);
      const dz = fieldSample(world, x, z + e) - fieldSample(world, x, z - e);
      const gl = Math.hypot(dx, dz) || 1;
      const fx = -dx / gl, fz = -dz / gl;
      let hit = -1;
      for (let d = 2; d <= 18; d += 2) {
        if (fieldSample(world, x + fx * d, z + fz * d) < -0.02) { hit = d; break; }
      }
      if (hit < 3 || hit > 12) continue;
      const inland = fieldSample(world, x - fx * 8, z - fz * 8);
      if (inland < h + 0.35) continue;
      const sc = (x < -80 ? 3 : 0) + (6 - Math.abs(h - 0.5) * 3) - s * 2 - Math.abs(hit - 5) * 0.08;
      if (sc > bs) { bs = sc; best = { x: x, z: z, h: h, fx: fx, fz: fz, hit: hit }; }
    }
  }
  return best;
}

function seawardYaw(world, x, z) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 36; i++) {
    const yaw = i / 36 * Math.PI * 2;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    let hit = -1;
    for (let d = 4; d <= 42; d += 2) {
      if (fieldSample(world, x + fx * d, z + fz * d) < -0.04) { hit = d; break; }
    }
    if (hit < 8 || hit > 32) continue;
    const rx = Math.cos(yaw), rz = Math.sin(yaw);
    const hL = fieldSample(world, x + rx * 12, z + rz * 12);
    const hR = fieldSample(world, x - rx * 12, z - rz * 12);
    const wide = (hL > 0.05 && hL < 2.4 && hR > 0.05 && hR < 2.4) ? 1 : 0;
    const inland = fieldSample(world, x - fx * 8, z - fz * 8);
    const score = wide * 12 + (inland > fieldSample(world, x, z) ? 3 : 0) - Math.abs(hit - 16) * 0.15;
    if (score > bestScore) { bestScore = score; best = yaw; }
  }
  return best;
}

function hunt(world, rnd, n, score) {
  let best = null, bs = -1e9;
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 640;
    const z = (rnd() - 0.5) * 520;
    const h = fieldSample(world, x, z);
    const s = fieldSlope(world, x, z);
    const sc = score(x, z, h, s);
    if (sc > bs) { bs = sc; best = { x: x, z: z, h: h, s: s, score: sc }; }
  }
  return best && best.score > -10 ? best : null;
}

function smooth01(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const PLACES = {
  lagoon: { title: 'Tropical Lagoon', line: 'Clear water over pale sand', swatch: 'linear-gradient(#cfe7ea, #2f9d96 46%, #e4d2ae)', amp: 0.55, spd: 0.85, frq: 0.9, dir: 0.08, layers: 7, cx: 0.9, rough: 0.06, refl: 0.9, refr: 1.2, alpha: 1, depthK: 0.55, sun: 1.08, sky: 1.05, sunAng: -0.1, sim: 1, rip: 0.75, ripSpd: 0.95, disturb: 0.85, ripSize: 1.15, deep: [0.01, 0.1, 0.13], shal: [0.06, 0.34, 0.3], mood: [0.55, 0, 0.12, 0.65], dist: 22, pitch: 0.36, spot: 3 },
  ocean: { title: 'Open Ocean', line: 'Long swell running to the horizon', swatch: 'linear-gradient(#b7cbe4, #1d5f98 42%, #0c335c)', amp: 1.15, spd: 0.78, frq: 0.62, dir: 0.04, layers: 8, cx: 0.72, rough: 0.14, refl: 1.12, refr: 0.68, alpha: 0.9, depthK: 1.35, sun: 1, sky: 1, sunAng: 0.05, sim: 0.9, rip: 0.5, ripSpd: 0.8, disturb: 0.75, ripSize: 1.7, deep: [0.006, 0.028, 0.075], shal: [0.02, 0.09, 0.13], mood: [0.22, 0.04, 0.32, 0.8], dist: 52, pitch: 0.16, spot: 4 },
  cove: { title: 'Hidden Cove', line: 'Quiet water under the cliff', swatch: 'linear-gradient(#c5d0c4, #6e9084 44%, #314e4c)', amp: 0.58, spd: 0.92, frq: 1.02, dir: 0.32, layers: 6, cx: 0.78, rough: 0.1, refl: 0.86, refr: 1.02, alpha: 1, depthK: 0.82, sun: 0.96, sky: 0.98, sunAng: 0.22, sim: 0.95, rip: 0.65, ripSpd: 0.85, disturb: 0.8, ripSize: 1.05, deep: [0.012, 0.055, 0.09], shal: [0.05, 0.2, 0.18], mood: [0.32, 0.1, 0.22, 1.0], dist: 18, pitch: 0.4, spot: 1 },
  lake: { title: 'Calm Lake', line: 'A glass surface and a long reflection', swatch: 'linear-gradient(#e4ebe6, #8aa4a6 52%, #3c5552)', amp: 0.1, spd: 0.38, frq: 0.88, dir: 0.2, layers: 4, cx: 0.4, rough: 0.03, refl: 1.28, refr: 0.7, alpha: 0.94, depthK: 1.05, sun: 0.9, sky: 0.96, sunAng: 0.16, sim: 0.65, rip: 0.32, ripSpd: 0.5, disturb: 0.5, ripSize: 1.7, deep: [0.014, 0.042, 0.05], shal: [0.04, 0.11, 0.09], mood: [0.12, 0.14, 0.48, 0.2], dist: 30, pitch: 0.12, spot: 3 },
  storm: { title: 'Stormy Ocean', line: 'A heavy sky and a short, steep sea', swatch: 'linear-gradient(#8b9094, #2a3842 48%, #141c22)', amp: 1.42, spd: 1.18, frq: 0.92, dir: 0.35, layers: 8, cx: 1.15, rough: 0.2, refl: 0.78, refr: 0.55, alpha: 0.8, depthK: 1.2, sun: 0.46, sky: 0.66, sunAng: 0.42, sim: 1.05, rip: 0.9, ripSpd: 1.15, disturb: 1.05, ripSize: 1.6, deep: [0.01, 0.025, 0.04], shal: [0.025, 0.06, 0.07], mood: [0, 0.62, 0.38, 1.05], dist: 34, pitch: 0.4, spot: 4 },
  reef: { title: 'Shallow Reef', line: 'The bottom showing through turquoise', swatch: 'linear-gradient(#d7f0ea, #2eae9e 40%, #e7d3a4)', amp: 0.26, spd: 0.95, frq: 1.18, dir: 0, layers: 6, cx: 0.95, rough: 0.05, refl: 0.55, refr: 1.45, alpha: 1, depthK: 0.28, sun: 1.12, sky: 1.06, sunAng: -0.04, sim: 1, rip: 0.85, ripSpd: 1, disturb: 0.75, ripSize: 0.95, deep: [0.02, 0.15, 0.15], shal: [0.22, 0.46, 0.32], mood: [0.62, 0, 0.08, 0.35], dist: 16, pitch: 0.78, tx: 196, tz: -2, yaw: 2.6 },
  pool: { title: 'Swimming Pool', line: 'Still water, and the sand underneath', swatch: 'linear-gradient(#e7f2f2, #8fd0cc 58%, #d5e0cf)', amp: 0.035, spd: 0.32, frq: 1.7, dir: 0, layers: 2, cx: 0.22, rough: 0.02, refl: 1.1, refr: 1.5, alpha: 1, depthK: 0.2, sun: 1.1, sky: 1.06, sunAng: 0.18, sim: 1, rip: 0.5, ripSpd: 0.6, disturb: 0.55, ripSize: 0.65, deep: [0.02, 0.18, 0.22], shal: [0.28, 0.52, 0.46], mood: [0.35, 0, 0.04, 0.12], dist: 9, pitch: 1.02, spot: 3 }
};
const PLACE_ALIAS = { tropical: 'lagoon', calm: 'ocean', deep: 'ocean', shallow: 'reef', storm: 'storm', pool: 'pool', lake: 'lake', lagoon: 'lagoon', ocean: 'ocean', cove: 'cove', reef: 'reef' };
const WP_KEYS = ['amp', 'spd', 'frq', 'dir', 'layers', 'cx', 'rough', 'refl', 'refr', 'alpha', 'depthK', 'sun', 'sky', 'sunAng', 'sim', 'rip', 'ripSpd', 'disturb', 'ripSize'];
const wp = {
  amp: 1, spd: 1, frq: 1, dir: 0, layers: 8, cx: 1, rough: 0, refl: 1, refr: 1, alpha: 1, depthK: 1,
  sun: 1, sky: 1, sunAng: 0, sim: 1, rip: 1, ripSpd: 1, disturb: 1, ripSize: 1.3, paused: 0,
  deep: [0.01, 0.05, 0.11], shal: [0.02, 0.13, 0.16], mood: [0, 0, 0, 1]
};
let orbit = false;
let orbitYaw = 0.5, orbitPitch = 0.38, orbitDist = 28;
let targetX = 0, targetZ = 0;
let simOx = -60, simOz = -60;
const simDomain = 120;
let pendingSplat = null;
let ripClear = 0;
let trip = null;
let capTimer = 0;
let downX = 0, downY = 0, moved = 0;

function waveY(world, x, z, time) {
  const damp = fieldDamp(world, x, z);
  const D = Math.max(-fieldSample(world, x, z), 0.25);
  const frq = Math.max(wp.frq, 0.2);
  const cs = Math.cos(wp.dir), sn = Math.sin(wp.dir);
  const kP = Math.PI * 2 / WAVES[0][3] * frq;
  const wP = Math.sqrt(9.81 * kP);
  let y = 0;
  const n = Math.max(1, Math.min(WAVES.length, wp.layers | 0));
  for (let i = 0; i < n; i++) {
    const w = WAVES[i];
    const len0 = Math.hypot(w[0], w[1]) || 1;
    const dx0 = w[0] / len0, dz0 = w[1] / len0;
    const dx = dx0 * cs - dz0 * sn, dz = dx0 * sn + dz0 * cs;
    const len = w[3] / frq;
    const k = Math.PI * 2 / len;
    const feel = 1 - smooth01(len * 0.08, len * 0.45, D);
    let As = w[2] * wp.amp * env.sea * damp * (1 + feel * 0.85);
    if (i < 2) As *= 1 - 0.74 * smooth01(2, 9, D);
    if (i >= 4) As *= wp.cx;
    const Q = Math.min(w[4] + feel * 0.45, 1.05);
    const steep = k * As * Q;
    if (steep > 0.72) As *= 0.72 / steep;
    As *= 1 - (1 - smooth01(0.35, 1.6, D)) * 0.65;
    const omega = (i === 1 ? wP * (k / kP) : Math.sqrt(9.81 * k)) * wp.spd;
    y += As * Math.sin(k * (dx * x + dz * z) - omega * time);
  }
  return y;
}

function lerpAng(a, b, u) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}
function ease01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
function copyWp() {
  const o = { deep: wp.deep.slice(), shal: wp.shal.slice(), mood: wp.mood.slice() };
  WP_KEYS.forEach((k) => { o[k] = wp[k]; });
  return o;
}
function mixWp(a, b, u) {
  WP_KEYS.forEach((k) => {
    wp[k] = (k === 'dir' || k === 'sunAng') ? lerpAng(a[k], b[k], u) : a[k] + (b[k] - a[k]) * u;
  });
  for (let i = 0; i < 3; i++) {
    wp.deep[i] = a.deep[i] + (b.deep[i] - a.deep[i]) * u;
    wp.shal[i] = a.shal[i] + (b.shal[i] - a.shal[i]) * u;
  }
  for (let i = 0; i < 4; i++) wp.mood[i] = a.mood[i] + (b.mood[i] - a.mood[i]) * u;
}
function putPlace(p) {
  WP_KEYS.forEach((k) => { wp[k] = p[k]; });
  wp.deep[0] = p.deep[0]; wp.deep[1] = p.deep[1]; wp.deep[2] = p.deep[2];
  wp.shal[0] = p.shal[0]; wp.shal[1] = p.shal[1]; wp.shal[2] = p.shal[2];
  wp.mood[0] = p.mood[0]; wp.mood[1] = p.mood[1]; wp.mood[2] = p.mood[2]; wp.mood[3] = p.mood[3];
}
function destOf(p) {
  let tx, tz, yaw;
  if (p.tx != null) {
    tx = p.tx; tz = p.tz; yaw = p.yaw;
  } else {
    const s = spots[p.spot] || spots[0];
    const fx = Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    tx = s ? s.x + fx * 14 : 0;
    tz = s ? s.z + fz * 14 : 0;
    yaw = s ? s.yaw + Math.PI : 0;
  }
  return { yaw: yaw, pitch: p.pitch, dist: p.dist, tx: tx, tz: tz };
}
function applyOrbitPose() {
  const op = -orbitPitch;
  const cp = Math.cos(op), sp = Math.sin(op);
  const fx = Math.sin(orbitYaw) * cp;
  const fy = sp;
  const fz = -Math.cos(orbitYaw) * cp;
  camX = targetX - fx * orbitDist;
  camY = 0.4 - fy * orbitDist;
  camZ = targetZ - fz * orbitDist;
  yaw = orbitYaw;
  pitch = op;
}
function showCaption(p) {
  const el = $('caption');
  if (!el) return;
  el.replaceChildren();
  const b = document.createElement('b');
  b.textContent = p.title;
  const s = document.createElement('span');
  s.textContent = p.line;
  el.append(b, s);
  el.classList.add('show');
  capTimer = 3.6;
}
function markPlace(id) {
  document.querySelectorAll('#places button').forEach((b) => b.classList.toggle('on', b.dataset.place === id));
}
function settlePlace(id) {
  const p = PLACES[id];
  if (!p) return;
  putPlace(p);
  const d = destOf(p);
  orbitYaw = d.yaw; orbitPitch = d.pitch; orbitDist = d.dist;
  targetX = d.tx; targetZ = d.tz;
  applyOrbitPose();
  markPlace(id);
  showCaption(p);
}
function startTrip(id) {
  const p = PLACES[id];
  if (!p) return;
  const d = destOf(p);
  trip = {
    t: 0, dur: 2.8, id: id,
    from: { yaw: orbitYaw, pitch: orbitPitch, dist: orbitDist, tx: targetX, tz: targetZ, wp: copyWp() },
    to: d, wp: null
  };
  const snap = { deep: p.deep.slice(), shal: p.shal.slice(), mood: p.mood.slice() };
  WP_KEYS.forEach((k) => { snap[k] = p[k]; });
  trip.wp = snap;
  markPlace(id);
  showCaption(p);
}
function advanceTrip(dt) {
  trip.t += dt;
  const u = ease01(trip.t / trip.dur);
  mixWp(trip.from.wp, trip.wp, u);
  orbitYaw = lerpAng(trip.from.yaw, trip.to.yaw, u);
  orbitPitch = trip.from.pitch + (trip.to.pitch - trip.from.pitch) * u;
  orbitDist = trip.from.dist + (trip.to.dist - trip.from.dist) * u;
  targetX = trip.from.tx + (trip.to.tx - trip.from.tx) * u;
  targetZ = trip.from.tz + (trip.to.tz - trip.from.tz) * u;
  applyOrbitPose();
  const apart = Math.hypot(trip.to.tx - trip.from.tx, trip.to.tz - trip.from.tz);
  camY += Math.sin(Math.PI * u) * Math.min(72, apart * 0.28);
  if (camY > 320) camY = 320;
  if (u >= 1) trip = null;
}
function enterPlace(name, animate) {
  const id = PLACE_ALIAS[name] || name;
  if (!PLACES[id]) return;
  orbit = true;
  if (animate) startTrip(id);
  else { trip = null; settlePlace(id); }
}
function dropRipple(cx, cy) {
  const canvas = $('c');
  const rect = canvas.getBoundingClientRect();
  const nx = ((cx - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((cy - rect.top) / rect.height) * 2;
  cameraVectors(yaw, pitch, fwd, right, up);
  const th = Math.tan((60 * Math.PI / 180) * 0.5);
  const aspect = rect.width / Math.max(rect.height, 1);
  let dx = fwd[0] + right[0] * nx * th * aspect + up[0] * ny * th;
  let dy = fwd[1] + right[1] * nx * th * aspect + up[1] * ny * th;
  let dz = fwd[2] + right[2] * nx * th * aspect + up[2] * ny * th;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  if (dy > -0.0008) return;
  const t = -camY / dy;
  if (t < 0.2 || t > 500) return;
  const x = camX + dx * t;
  const z = camZ + dz * t;
  const half = simDomain * 0.5;
  if (Math.abs(x - (simOx + half)) > half * 0.9 || Math.abs(z - (simOz + half)) > half * 0.9) {
    simOx = x - half;
    simOz = z - half;
    ripClear = 1;
  }
  pendingSplat = { x: x, z: z, s: 0.34 * wp.disturb, r: Math.max(0.35, wp.ripSize) };
}
function bindStudio() {
  const nav = $('places');
  if (!nav) return;
  Object.keys(PLACES).forEach((id) => {
    const p = PLACES[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.place = id;
    b.className = 'card';
    const sw = document.createElement('i');
    sw.style.background = p.swatch;
    const name = document.createElement('b');
    name.textContent = p.title;
    const line = document.createElement('span');
    line.textContent = p.line;
    b.append(sw, name, line);
    b.addEventListener('click', () => {
      document.body.classList.remove('places-open');
      enterPlace(id, mode === 2);
    });
    nav.append(b);
  });
  $('placebtn').addEventListener('click', () => document.body.classList.toggle('places-open'));
  $('hourbtn').addEventListener('click', () => stepHour(false));
  $('skybtn').addEventListener('click', () => stepWeather(false));
  $('walkbtn').addEventListener('click', () => {
    trip = null;
    orbit = false;
    mode = 2;
    document.body.classList.remove('places-open', 'cinema');
    $('hint').textContent = 'WASD move · mouse look · Q dive · 1–6 places · Esc menu';
    showHint = 6;
    $('hint').classList.add('show');
  });
  const musicBtn = $('musicbtn');
  if (musicBtn) musicBtn.addEventListener('click', () => { musicOn = !musicOn; paintMusic(); });
  $('watchbtn').addEventListener('click', () => {
    const on = !document.body.classList.contains('cinema');
    document.body.classList.toggle('cinema', on);
    document.body.classList.remove('places-open', 'cinema-peek');
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('cinema', 'cinema-peek');
  });
  addEventListener('mousemove', (e) => {
    if (!document.body.classList.contains('cinema')) return;
    document.body.classList.toggle('cinema-peek', e.clientY > innerHeight - 88);
  });
}

const SIM_WGSL = `struct Sim {
  splat: vec4<f32>,
  k: vec4<f32>,
  origin: vec2<f32>,
  pad: vec2<f32>,
}
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> S: Sim;
struct SV { @builtin(position) clip: vec4<f32> }
@vertex fn vs(@builtin(vertex_index) i: u32) -> SV {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: SV;
  o.clip = vec4<f32>(p[i], 0.0, 1.0);
  return o;
}
@fragment fn fs(in: SV) -> @location(0) vec4<f32> {
  let dim = 256;
  let p = vec2<i32>(in.clip.xy);
  let c = textureLoad(srcTex, p, 0);
  let h = c.r;
  let v = c.g;
  let L = textureLoad(srcTex, clamp(p + vec2<i32>(-1, 0), vec2<i32>(0), vec2<i32>(dim - 1)), 0).r;
  let R = textureLoad(srcTex, clamp(p + vec2<i32>(1, 0), vec2<i32>(0), vec2<i32>(dim - 1)), 0).r;
  let U = textureLoad(srcTex, clamp(p + vec2<i32>(0, -1), vec2<i32>(0), vec2<i32>(dim - 1)), 0).r;
  let D = textureLoad(srcTex, clamp(p + vec2<i32>(0, 1), vec2<i32>(0), vec2<i32>(dim - 1)), 0).r;
  let lap = L + R + U + D - 4.0 * h;
  let edge = f32(p.x == 0 || p.y == 0 || p.x == dim - 1 || p.y == dim - 1);
  var nv = v * mix(S.k.y, 0.8, edge) + lap * S.k.x;
  var nh = h + nv;
  let uv = (vec2<f32>(p) + vec2<f32>(0.5)) / f32(dim);
  let xz = S.origin + uv * S.k.z;
  let d = length(xz - S.splat.xy);
  let rad = max(S.splat.w, 0.35);
  if (S.splat.z != 0.0 && d < rad * 3.2) {
    let g = exp(-(d * d) / (rad * rad));
    let ring = exp(-(d * d) / (rad * rad * 2.6));
    nh += S.splat.z * (g * 1.15 - ring * 0.62);
  }
  return vec4<f32>(clamp(nh, -1.6, 1.6), clamp(nv, -0.8, 0.8), 0.0, 1.0);
}
`;

let audio = null;
let score = null;
let muted = false;
let musicOn = true;
let musicVol = 0.72;
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const seconds = 28;
  const dur = ac.sampleRate * seconds;
  const buf = ac.createBuffer(1, dur, ac.sampleRate);
  const data = buf.getChannelData(0);
  let s = 123456789;
  for (let i = 0; i < dur; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  const fade = (ac.sampleRate * 0.6) | 0;
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    data[dur - fade + i] = data[dur - fade + i] * (1 - u) + data[i] * u;
  }
  const burst = ac.createBuffer(1, (ac.sampleRate * 1.6) | 0, ac.sampleRate);
  burst.getChannelData(0).set(data.subarray(0, burst.length));
  const master = ac.createGain();
  master.gain.value = 0.85;
  const under = ac.createBiquadFilter();
  under.type = 'lowpass'; under.frequency.value = 16000; under.Q.value = 0.2;
  master.connect(under); under.connect(ac.destination);
  function bed(type, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(0, Math.random() * 20);
    return { gain: g, filter: f };
  }
  const surf = bed('lowpass', 480, 0.55);
  const hiss = bed('highpass', 2200, 0.45);
  const wind = bed('bandpass', 260, 0.35);
  const insects = bed('highpass', 3400, 0.7);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.047;
  const lfoG = ac.createGain(); lfoG.gain.value = 160;
  lfo.connect(lfoG); lfoG.connect(surf.filter.frequency); lfo.start();
  const lfo2 = ac.createOscillator();
  lfo2.frequency.value = 0.013;
  const lfo2G = ac.createGain(); lfo2G.gain.value = 90;
  lfo2.connect(lfo2G); lfo2G.connect(wind.filter.frequency); lfo2.start();
  const api = {
    ac: ac, master: master, under: under,
    surf: surf.gain, hiss: hiss.gain, wind: wind.gain, insects: insects.gain,
    shoreAmt: 0.4, alive: true, hush: 1, birds: 1
  };
  // ---- What lives in the air, by ear. Nothing here is a loop: each singer keeps its own
  // time, and how many are singing follows the hour, the rain, the wind and the trees.
  // A rasp: a band of noise beaten at a steady rate, which is how a cicada's tymbal and a
  // dragonfly's wings both make their sound.
  const rasp = (band, q, beatHz, depth, to) => {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = q;
    const beat = ac.createGain(); beat.gain.value = 1 - depth;
    const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = beatHz;
    const od = ac.createGain(); od.gain.value = depth; o.connect(od); od.connect(beat.gain);
    const g = ac.createGain(); g.gain.value = 0;
    const p = ac.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f); f.connect(beat); beat.connect(g); g.connect(p); p.connect(to);
    src.start(0, Math.random() * 20); o.start();
    return g.gain;
  };
  const bus = () => { const g = ac.createGain(); g.gain.value = 0; g.connect(master); return g; };
  const cicadas = bus(), crickets = bus(), chorus = bus();
  for (let i = 0; i < 4; i++) {
    // Each cicada sings in bouts of its own length, swelling in and dying away.
    const g = rasp(4300 + Math.random() * 3200, 14, 110 + Math.random() * 120, 0.5, cicadas);
    const bout = () => {
      if (!api.alive) return;
      const t = ac.currentTime, len = 4 + Math.random() * 10, peak = 0.4 + Math.random() * 0.6;
      g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + 1.5 + Math.random() * 2);
      g.setValueAtTime(peak, t + len); g.exponentialRampToValueAtTime(0.0001, t + len + 2.5);
      setTimeout(bout, (len + 3 + Math.random() * 9) * 1000);
    };
    setTimeout(bout, Math.random() * 8000);
  }
  for (let i = 0; i < 6; i++) {
    // Each cricket has its own pitch, its own number of pulses to a chirp and its own pace,
    // and now and then stops to listen.
    const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
    o.frequency.value = 4100 + Math.random() * 1300; g.gain.value = 0; p.pan.value = Math.random() * 1.8 - 0.9;
    o.connect(g); g.connect(p); p.connect(crickets); o.start();
    const loud = 0.15 + Math.random() * 0.5, n = 2 + ((Math.random() * 3) | 0), gap = 0.45 + Math.random() * 0.9;
    const call = () => {
      if (!api.alive) return;
      const t = ac.currentTime + 0.02;
      for (let k = 0; k < n; k++) { const a = t + k * 0.034; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(loud, a + 0.006); g.gain.linearRampToValueAtTime(0, a + 0.02); }
      setTimeout(call, (gap * (0.9 + Math.random() * 0.25) + (Math.random() < 0.06 ? 2 + Math.random() * 6 : 0)) * 1000);
    };
    setTimeout(call, Math.random() * 3000);
  }
  // The far chorus after dark: thousands of small singers heard as one shimmer.
  rasp(6200, 5, 38, 0.6, chorus).value = 1;
  const rain = bed('highpass', 1500, 0.3), patter = bed('bandpass', 420, 0.5), rustle = bed('highpass', 2800, 0.3);
  const hum = (type, f) => {
    const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = f * 5; g.gain.value = 0;
    o.connect(lp); lp.connect(g); g.connect(master); o.start();
    return { g: g.gain, f: o.frequency };
  };
  // Wings close to the ear: a bee's drone, a mosquito's whine, the dry rattle of a dragonfly.
  const bee = hum('sawtooth', 210), mosq = hum('triangle', 590), dfly = rasp(700, 1.2, 33, 0.9, master);
  let wetness = 0, woods = 0;
  // s: heat, dark, low (sun), dawn, rain, gust in m/s, wood 0..1, alt, under, heard.
  api.air = (s) => {
    const m = muted ? 0 : 1, dry = 1 - Math.min(1, s.rain * 3), up = Math.exp(-Math.max(s.alt, 0) * 0.04) * (s.under ? 0 : 1);
    const near = (d, r) => (d == null ? 0 : Math.pow(Math.max(0, 1 - d / r), 2));
    const ease = (p, v) => { p.value += (v - p.value) * 0.15; };
    cicadas.gain.value = m * 0.05 * s.heat * dry * (0.25 + 0.75 * s.wood) * up * api.hush;
    crickets.gain.value = m * 0.045 * s.dark * dry * (0.4 + 0.6 * s.wood) * up;
    chorus.gain.value = m * 0.03 * Math.max(s.dark, s.low * 0.5) * dry * up;
    rain.gain.value = m * 0.1 * s.rain * (s.under ? 0.15 : 1);
    patter.gain.value = m * 0.09 * s.rain * s.rain * (s.under ? 0.3 : 1);
    rustle.gain.value = m * 0.03 * Math.min(2, s.gust * s.gust / 30) * (0.3 + 0.7 * s.wood) * up;
    ease(bee.g, m * 0.05 * near(s.heard.bee, 1.2)); bee.f.value = 205 + 18 * Math.sin(ac.currentTime * 11);
    ease(mosq.g, m * 0.02 * near(s.heard.mosquito, 1));
    ease(dfly, m * 0.07 * near(s.heard.dragonfly, 1.2));
    // Cicadas go quiet when a bird calls close by, and take a while to start again.
    api.hush += (1 - api.hush) * 0.004;
    api.birds = (1 - s.dark) * dry * (0.5 + s.dawn);
    wetness = s.rain; woods = s.wood;
  };
  // Single drops off the leaves, heard one at a time under trees in light rain.
  const drip = () => {
    if (!api.alive) return;
    if (!muted && wetness > 0.03 && Math.random() < 0.3 + woods) {
      const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
      src.buffer = burst; f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 4000; f.Q.value = 6; p.pan.value = Math.random() * 2 - 1;
      g.gain.setValueAtTime(0.02 + Math.random() * 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
      src.connect(f); f.connect(g); g.connect(p); p.connect(master);
      src.start(t, Math.random()); src.stop(t + 0.1);
    }
    setTimeout(drip, 40 + Math.random() * 260 / Math.max(wetness, 0.1));
  };
  drip();
  // Birds. A singer keeps a phrase of its own: the same notes in the same order every time,
  // a little faster or slower, from the same place, the way a bird repeats its song.
  const note = (t, f0, f1, len, peak, pan, type, trill) => {
    const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
    o.type = type; p.pan.value = pan;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    if (trill) {
      const v = ac.createOscillator(), vg = ac.createGain();
      v.frequency.value = trill; vg.gain.value = f0 * 0.09; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + len + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.03, len * 0.3));
    g.gain.setValueAtTime(peak, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(p); p.connect(master); o.start(t); o.stop(t + len + 0.05);
  };
  const R = (a, b) => a + Math.random() * (b - a);
  const singers = [0, 0, 0, 1, 1, 2, 2, 3].map((kind) => {
    const ph = [];
    if (kind === 0) {
      // A warbler: a run of short slurred notes.
      for (let k = 0, t = 0, n = 4 + ((Math.random() * 4) | 0); k < n; k++) { const f = R(2400, 5200), len = R(0.05, 0.13); ph.push([t, f, f * R(0.7, 1.4), len, 0]); t += len + R(0.03, 0.09); }
    } else if (kind === 1) {
      // A dove: three soft low notes, the middle one long.
      const f = R(470, 560);
      ph.push([0, f, f * 1.07, 0.22, 0], [0.36, f * 1.12, f, 0.5, 0], [1.02, f, f * 0.94, 0.3, 0]);
    } else if (kind === 2) {
      // A trill held on one pitch after two lead-in notes.
      const f = R(3000, 4200);
      ph.push([0, f * 0.8, f * 0.9, 0.07, 0], [0.12, f * 0.9, f, 0.07, 0], [0.26, f, f * R(0.96, 1.04), R(0.5, 1.1), R(14, 22)]);
    } else {
      // A gull over the water: a string of falling cries, each a little lower.
      for (let k = 0, n = 3 + ((Math.random() * 4) | 0); k < n; k++) ph.push([k * 0.38, 1650 - k * 45, 950 - k * 30, 0.27, 31]);
    }
    return { kind: kind, ph: ph, pan: R(-0.85, 0.85), far: R(0.3, 1) };
  });
  function sing(b, again) {
    if (!api.alive || muted) return;
    // Gulls belong to the shore, songbirds to the trees.
    if (b.kind === 3 ? api.shoreAmt < 0.25 : false) return;
    const t = ac.currentTime + 0.03, pace = R(0.92, 1.1), tune = R(0.985, 1.015);
    const peak = [0.03, 0.05, 0.022, 0.03][b.kind] * b.far;
    for (const n of b.ph) note(t + n[0] * pace, n[1] * tune, n[2] * tune, n[3] * pace, peak, b.pan, b.kind === 3 ? 'triangle' : 'sine', n[4]);
    if (b.far > 0.7) api.hush = 0.25;
    const end = (b.ph[b.ph.length - 1][0] + 0.6) * pace;
    // It sings its phrase a few times over, and sometimes another of its kind answers.
    if (again > 0) setTimeout(() => sing(b, again - 1), (end + R(0.7, 2.2)) * 1000);
    else if (Math.random() < 0.35) { const o = singers.filter((x) => x.kind === b.kind && x !== b)[0]; if (o) setTimeout(() => sing(o, 0), (end + R(0.6, 2)) * 1000); }
  }
  function crash() {
    if (!api.alive || muted) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = burst;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.8);
    const g = ac.createGain();
    const loud = 0.04 + api.shoreAmt * 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(loud, t + 0.05 + Math.random() * 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 + Math.random() * 0.7);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 1.5);
  }
  function later(fn, lo, hi) {
    const wait = (lo + Math.random() * (hi - lo)) * 1000;
    setTimeout(() => {
      if (!api.alive) return;
      fn();
      later(fn, lo, hi);
    }, wait);
  }
  later(() => {
    // Birds sing most at first light, less through the day, and not in rain or at night.
    if (Math.random() > api.birds) return;
    sing(singers[(Math.random() * singers.length) | 0], (Math.random() * 3) | 0);
  }, 3.5, 11);
  later(crash, 4.0, 12.0);
  try {
    score = createScore(ac, under);
    score.start();
  } catch (err) {
    console.error(err);
  }
  return api;
}

function paintMusic() {
  const b = $('musicbtn');
  if (!b) return;
  b.textContent = musicOn ? 'Music' : 'Quiet';
  b.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
}

const K = Object.create(null);
['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].forEach((c) => { K[c] = 0; });
let lookX = 0, lookY = 0, dragging = false, touchN = 0;

// T moves the clock to the next part of the day. R changes the weather, which then stays
// until R is pressed again past the end of the list, where the island takes it back.
function stepHour(back) { envNextStop(back); showCaption(envLabel()); }
function stepWeather(back) {
  const names = Object.keys(WEATHER), i = names.indexOf(env.wx) + (back ? -1 : 1);
  env.auto = i < 0 || i >= names.length;
  envSet(names[(i + names.length) % names.length], false);
  env.hold = env.auto ? 240 : 1e9;
  showCaption(envLabel());
}
function bootKeys() {
  addEventListener('keydown', (e) => {
    if (K[e.code] != null) { K[e.code] = 1; e.preventDefault(); }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      musicVol = Math.min(1, Math.max(0.15, musicVol + (e.code === 'BracketRight' ? 0.08 : -0.08)));
    }
    if (e.repeat) return;
    if (e.code === 'KeyM') { muted = !muted; if (audio) audio.master.gain.value = muted ? 0 : 0.9; }
    if (e.code === 'KeyN') { musicOn = !musicOn; paintMusic(); }
    if (e.code === 'KeyH') statsEl.hidden = !statsEl.hidden;
    if (e.code === 'KeyF' && mode === 2 && !orbit) fly = !fly;
    if (e.code === 'Escape') {
      if (document.body.classList.contains('cinema')) {
        document.body.classList.remove('cinema', 'cinema-peek');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
      if (document.body.classList.contains('places-open')) {
        document.body.classList.remove('places-open');
        return;
      }
      openMenu();
    }
    if (e.code === 'KeyC' && mode === 2) $('watchbtn').click();
    if (e.code === 'KeyT' && mode > 0) stepHour(e.shiftKey);
    if (e.code === 'KeyR' && mode > 0) stepWeather(e.shiftKey);
    if (e.code >= 'Digit1' && e.code <= 'Digit6' && mode === 2) goSpot(e.code.charCodeAt(5) - 49);
  });
  addEventListener('keyup', (e) => { if (K[e.code] != null) K[e.code] = 0; });
  const canvas = $('c');
  canvas.addEventListener('mousedown', (e) => {
    if (mode !== 2 || e.button !== 0) return;
    dragging = true;
    if (orbit) { downX = e.clientX; downY = e.clientY; moved = 0; return; }
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });
  canvas.addEventListener('wheel', (e) => {
    if (!orbit || mode !== 2) return;
    orbitDist = Math.min(180, Math.max(4, orbitDist * (e.deltaY > 0 ? 1.08 : 0.92)));
    applyOrbitPose();
    e.preventDefault();
  }, { passive: false });
  addEventListener('mouseup', (e) => {
    if (orbit && dragging && moved < 6 && mode === 2) dropRipple(e.clientX, e.clientY);
    dragging = false;
  });
  addEventListener('mousemove', (e) => {
    if (mode !== 2) return;
    if (orbit && dragging) {
      if (trip) trip = null;
      orbitYaw -= e.movementX * 0.005;
      orbitPitch = Math.max(0.08, Math.min(1.25, orbitPitch + e.movementY * 0.004));
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      applyOrbitPose();
      return;
    }
    if (document.pointerLockElement === canvas || dragging) { lookX += e.movementX; lookY += e.movementY; }
  });
  canvas.addEventListener('touchstart', (e) => {
    touchN = e.touches.length;
    if (mode === 2) e.preventDefault();
    if (orbit && e.touches[0]) { touchLX = e.touches[0].clientX; touchLY = e.touches[0].clientY; moved = 0; }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (mode !== 2 || !e.touches.length) return;
    const t = e.touches[0];
    if (orbit && e.touches.length === 1 && touchLX != null) {
      if (trip) trip = null;
      orbitYaw -= (t.clientX - touchLX) * 0.007;
      orbitPitch = Math.max(0.08, Math.min(1.25, orbitPitch + (t.clientY - touchLY) * 0.006));
      moved += Math.abs(t.clientX - touchLX) + Math.abs(t.clientY - touchLY);
      applyOrbitPose();
    } else if (orbit && e.touches.length >= 2) {
      orbitDist = Math.min(180, Math.max(4, orbitDist * 0.985));
      applyOrbitPose();
    } else if (touchLX != null) {
      lookX += (t.clientX - touchLX) * 1.4; lookY += (t.clientY - touchLY) * 1.4;
    }
    touchLX = t.clientX; touchLY = t.clientY; touchN = e.touches.length;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (orbit && e.touches.length === 0 && moved < 8 && t) dropRipple(t.clientX, t.clientY);
    touchN = e.touches.length;
    if (!e.touches.length) { touchLX = null; touchLY = null; }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== $('c') && mode === 2 && !orbit && !qstr.has('shot')) openMenu();
  });
}
let touchLX = null, touchLY = null;

let mode = 0, fly = false, dive = 0;
let camX = 90, camY = 52, camZ = 200, yaw = 0.4, pitch = -0.35;
let world = null, spots = [], q = null;
const fwd = new Float32Array(3), right = new Float32Array(3), up = new Float32Array(3);
const rfwd = new Float32Array(3), rright = new Float32Array(3), rup = new Float32Array(3);
let introT = 0, introFrom = null, introTo = null;

function openMenu() {
  if (mode === 0) return;
  mode = 0;
  document.body.classList.remove('playing', 'places-open', 'cinema', 'cinema-peek');
  if (document.pointerLockElement) document.exitPointerLock();
}
function goSpot(i) {
  orbit = false;
  const s = spots[i];
  if (!s) return;
  camX = s.x; camY = s.y; camZ = s.z; yaw = s.yaw; pitch = s.pitch;
  fly = s.fly; dive = s.dive || 0;
  mode = 2;
}

async function main() {
  try {
    let dropped = false;
    try {
      if (sessionStorage.getItem('ww-boot') === '1') {
        const order = ['high', 'med', 'low'];
        const cur = localStorage.getItem('ww-q') || detectQuality();
        const i = order.indexOf(cur);
        if (i >= 0 && i < order.length - 1) {
          localStorage.setItem('ww-q', order[i + 1]);
          sessionStorage.removeItem('ww-boot');
          dropped = true;
        }
      }
    } catch (e) {}
    if (dropped) { location.reload(); return; }
    try { sessionStorage.setItem('ww-boot', '1'); } catch (e) {}

    const qName = detectQuality();
    q = PRESETS[qName];
    document.querySelectorAll('[data-q]').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === qName);
      b.addEventListener('click', () => {
        try { localStorage.setItem('ww-q', b.dataset.q); sessionStorage.removeItem('ww-boot'); } catch (e) {}
        const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u.pathname + '?' + u.searchParams.toString();
      });
    });
    if (!navigator.gpu) { fail('This browser has no WebGPU. Chrome or Edge on a current machine will open it.'); return; }
    setStatus('Asking the graphics driver', 0.06);
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) { fail('WebGPU is switched off in this browser. In Chrome, it is on by default.'); return; }
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (ev) => {
      const msg = (ev.error && (ev.error.message || ev.error)) || 'gpu error';
      console.error('GPU ' + msg);
      window.__gpuerr = String(msg);
    });
    mark('device');
    const canvas = $('c');
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();

    const code = shaderCode(q.hres, q.span);
    const mod = device.createShaderModule({ code: code });
    const blitMod = device.createShaderModule({ code: blitShaderCode() });
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    const oceanMod = device.createShaderModule({ code: OCEAN_WGSL });
    const VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    const ubLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } }]
    });
    const geoLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 1, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: VS | FS, texture: { sampleType: 'depth' } },
        { binding: 4, visibility: VS | FS, sampler: { type: 'comparison' } },
        { binding: 5, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 6, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 7, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 8, visibility: VS | FS, texture: { sampleType: 'float' } },
        { binding: 9, visibility: VS | FS, sampler: { type: 'filtering' } },
        { binding: 10, visibility: VS | FS, texture: { sampleType: 'depth' } }
      ]
    });
    const simLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: FS, buffer: { type: 'uniform' } }
      ]
    });
    const waterLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: FS, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: FS, texture: { sampleType: 'float' } },
        { binding: 3, visibility: FS, sampler: { type: 'filtering' } },
        { binding: 4, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 5, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 6, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 7, visibility: FS, texture: { sampleType: 'float' } }
      ]
    });
    const blitLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 1, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: FS, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: FS, texture: { sampleType: 'float' } },
        { binding: 4, visibility: FS, sampler: { type: 'filtering' } }
      ]
    });
    // The air pass reads the scene's depth and nothing else from the second group.
    const airLayout = device.createBindGroupLayout({ entries: [{ binding: 1, visibility: FS, texture: { sampleType: 'depth' } }] });
    const geoPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout] });
    const skyPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout] });
    const waterPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, waterLayout] });
    const blitPL = device.createPipelineLayout({ bindGroupLayouts: [blitLayout] });

    const meshBuffers = [
      { arrayStride: VSTRIDE * 4, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
        { shaderLocation: 3, offset: 36, format: 'float32' },
        { shaderLocation: 4, offset: 40, format: 'float32' },
        { shaderLocation: 5, offset: 44, format: 'float32x2' }
      ] },
      { arrayStride: ISTRIDE * 4, stepMode: 'instance', attributes: [
        { shaderLocation: 6, offset: 0, format: 'float32x4' },
        { shaderLocation: 7, offset: 16, format: 'float32x4' },
        { shaderLocation: 8, offset: 32, format: 'float32x4' }
      ] }
    ];
    const depthOn = (fmt, write, cmp) => ({ format: fmt, depthWriteEnabled: write, depthCompare: cmp });
    const pipes = {};
    // Every pipeline starts compiling now, in the driver, while this thread shapes the coast.
    const jobs = [];
    const pipe = (name, desc) => { jobs.push(device.createRenderPipelineAsync(desc).then((p) => { pipes[name] = p; })); };
    const sceneFmt = 'rgba16float';
    const skyDesc = {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsSky' },
      fragment: { module: mod, entryPoint: 'fsSky', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthOn('depth32float', true, 'always')
    };
    pipe('sky', skyDesc);
    pipe('skyBake', {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsSky' },
      fragment: { module: mod, entryPoint: 'fsSkyBake', targets: [{ format: sceneFmt, blend: {
        color: { srcFactor: 'constant', dstFactor: 'one-minus-constant', operation: 'add' },
        alpha: { srcFactor: 'constant', dstFactor: 'one-minus-constant', operation: 'add' }
      } }] },
      primitive: { topology: 'triangle-list' }
    });
    pipe('terrain', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsTerrain', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      fragment: { module: mod, entryPoint: 'fsTerrain', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    pipe('mesh', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsMesh', buffers: meshBuffers },
      fragment: { module: mod, entryPoint: 'fsMesh', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    const shadowBias = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2, depthBiasClamp: 0 };
    pipe('shadowTerrain', {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowTerrain', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: shadowBias
    });
    pipe('shadowMesh', {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowMesh', buffers: meshBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: shadowBias
    });
    pipe('fish', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsFish', buffers: meshBuffers },
      fragment: { module: mod, entryPoint: 'fsFish', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    const bugBuffers = [meshBuffers[0], { arrayStride: BUG_STRIDE * 4, stepMode: 'instance', attributes: [6, 7, 8, 9, 10, 11].map((l, i) => ({ shaderLocation: l, offset: i * 16, format: 'float32x4' })) }];
    // Insects go straight onto the finished frame, after the water, so a clear wing over the
    // lagoon is a film over the lagoon and not a hole in it.
    pipe('bug', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsBug', buffers: bugBuffers },
      fragment: { module: mod, entryPoint: 'fsBug', targets: [{ format: format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth24plus', true, 'less')
    });
    pipe('shadowBug', {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowBug', buffers: bugBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: shadowBias
    });
    pipe('shadowFish', {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowFish', buffers: meshBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: shadowBias
    });
    pipe('grass', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsGrass', buffers: [
        { arrayStride: 24, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 16, format: 'float32x2' }
        ] },
        { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }] }
      ] },
      fragment: { module: mod, entryPoint: 'fsGrass', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    pipe('bird', {
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsBird', buffers: [
        { arrayStride: 16, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32' }
        ] },
        { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }] }
      ] },
      fragment: { module: mod, entryPoint: 'fsBird', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    pipe('water', {
      layout: waterPL,
      vertex: { module: mod, entryPoint: 'vsWater', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: mod, entryPoint: 'fsWater', targets: [{ format: format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth24plus', false, 'less')
    });
    pipe('shore', {
      layout: waterPL,
      vertex: { module: mod, entryPoint: 'vsShore', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: mod, entryPoint: 'fsWater', targets: [{
        format: format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // The beach mesh is coarser than the sheet, so a depth test hides the wash
      // behind the sand it is running over. Trees and cliffs are still rejected
      // in the fragment shader.
      depthStencil: depthOn('depth24plus', false, 'always')
    });
    const airPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, airLayout] });
    pipe('drops', {
      layout: airPL,
      vertex: { module: mod, entryPoint: 'vsDrops' },
      fragment: { module: mod, entryPoint: 'fsDrops', targets: [{ format: format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth24plus', false, 'less')
    });
    pipe('air', {
      layout: airPL,
      vertex: { module: mod, entryPoint: 'vsSky' },
      fragment: { module: mod, entryPoint: 'fsAir', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list' }
    });
    pipe('blit', {
      layout: blitPL,
      vertex: { module: blitMod, entryPoint: 'vsBlit' },
      fragment: { module: blitMod, entryPoint: 'fsBlit', targets: [{ format: format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthOn('depth24plus', true, 'always')
    });
    const simPL = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
    pipe('sim', {
      layout: simPL,
      vertex: { module: simMod, entryPoint: 'vs' },
      fragment: { module: simMod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' }
    });

    const oceanLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } }
      ]
    });
    const oceanPL = device.createPipelineLayout({ bindGroupLayouts: [oceanLayout] });
    const oceanPipes = {};
    for (const [key, entry] of [['evolve', 'evolve'], ['rows', 'ifft_rows'], ['cols', 'ifft_cols'], ['slopes', 'slopes']]) {
      jobs.push(device.createComputePipelineAsync({
        layout: oceanPL, compute: { module: oceanMod, entryPoint: entry }
      }).then((p) => { oceanPipes[key] = p; }));
    }
    const pipesReady = Promise.all(jobs);
    pipesReady.catch(() => {});
    mark('kick');

    setStatus('Sculpting the coast', 0.1);
    world = await buildWorldAsync(q.hres, q.span, (t) => setStatus('Sculpting the coast', 0.1 + t * 0.45));

    mark('heights');
    setStatus('Planting the ridge', 0.58);
    await new Promise((r) => setTimeout(r, 0));
    const rnd = mulberry32(0x51A7C0DE);
    const sunYaw = Math.atan2(SUN[0], -SUN[2]);
    const sdx = Math.sin(sunYaw), sdz = -Math.cos(sunYaw);
    const beach = hunt(world, rnd, 5000, (x, z, h, s) => {
      if (h < 0.25 || h > 0.85 || s > 0.16 || x > -40) return -1;
      if (fieldSample(world, x + sdx * 6, z + sdz * 6) > -0.8) return -1;
      if (fieldSample(world, x - sdx * 5, z - sdz * 5) < 0.4) return -1;
      return 8 - Math.abs(h - 0.45) * 5 - s * 6 - Math.abs(z) * 0.003;
    }) || { x: -150, z: 6, h: 0.5 };
    const cliff = hunt(world, rnd, 2000, (x, z, h, s) => {
      if (h < 12 || h > 34 || s < 0.28) return -1;
      return s * 2 + (z > 20 ? 1.5 : 0) + (x < 40 ? 0.4 : 0);
    }) || { x: -10, z: 90, h: 20 };
    const lagoon = hunt(world, rnd, 2000, (x, z, h, s) => {
      if (h < 0.35 || h > 1.3 || s > 0.3 || x < 50) return -1;
      const w = fieldSample(world, x + 18, z);
      if (w > -0.3 || w < -3) return -1;
      return 4 - Math.abs(h - 0.6) - s;
    }) || { x: 130, z: 8, h: 0.6 };

    const shore = findBeach(world);
    const face = sunYaw;
    let standX, standZ, byaw, pitchBeach, eye;
    if (shore) {
      // Along the beach with the sun off to one side: the wash, the palms and their
      // shadows are all lit across the frame instead of seen through the glare.
      byaw = Math.atan2(shore.fx, -shore.fz) + 1.22;
      const back = 2.4;
      standX = shore.x - shore.fx * back;
      standZ = shore.z - shore.fz * back;
      const standH = fieldSample(world, standX, standZ);
      eye = Math.max(standH, 0.05) + 1.62;
      pitchBeach = -0.1;
    } else {
      byaw = downhillYaw(world, beach.x, beach.z);
      standX = beach.x; standZ = beach.z;
      eye = beach.h + 1.55;
      pitchBeach = -0.2;
    }
    spots = [
      { x: standX, y: eye, z: standZ, yaw: byaw, pitch: pitchBeach, fly: false, dive: 0 },
      { x: cliff.x, y: cliff.h + 1.7, z: cliff.z, yaw: downhillYaw(world, cliff.x, cliff.z), pitch: -0.28, fly: false, dive: 0 },
      { x: 30, y: 168, z: 150, yaw: 0, pitch: -0.7, fly: true, dive: 0 },
      { x: lagoon.x, y: lagoon.h + 1.6, z: lagoon.z, yaw: downhillYaw(world, lagoon.x, lagoon.z), pitch: -0.16, fly: false, dive: 0 },
      { x: beach.x + sdx * 38, y: 2.6, z: beach.z + sdz * 38, yaw: face + Math.PI, pitch: -0.05, fly: true, dive: 0 },
      { x: (lagoon.x + 150) * 0.5, y: -1.1, z: lagoon.z, yaw: face, pitch: 0.45, fly: false, dive: 2.2 }
    ];
    // Aerial look-at
    const aerial = spots[2];
    const yp = lookYP(10 - aerial.x, 6 - aerial.y, 0 - aerial.z);
    aerial.yaw = yp[0]; aerial.pitch = yp[1];

    const scatter = new Scatter();
    const pick = (ids, x, z) => ids[Math.abs(Math.floor(x * 7.3 + z * 3.1)) % ids.length];
    const protoSet = (seeds, make, radius) => seeds.map((sd) => scatter.proto([make(sd)], radius));
    const rockIds = [4, 11, 23, 37, 52, 68].map((sd) => scatter.proto([makeRock(sd, 0), makeRock(sd, 1)], 1.3, [45]));
    const palmIds = [3, 8, 21].map((sd) => scatter.proto([makePalm(sd, 0), makePalm(sd, 1), makePalm(sd, 2)], 9, [30, 110]));
    // A palm leans the way the ground falls, toward the open light over the water.
    const leanYaw = (x, z) => {
      const gx = fieldSample(world, x + 3, z) - fieldSample(world, x - 3, z), gz = fieldSample(world, x, z + 3) - fieldSample(world, x, z - 3);
      return Math.atan2(-gz, -gx) + (rnd() - 0.5) * 1.4;
    };
    const shrubIds = protoSet([5, 9, 14], makeShrub, 0.5);
    const canopyIds = protoSet([6, 13], makeCanopy, 1.1);
    const fernIds = protoSet([7, 12, 19], makeFern, 0.8);
    const broadIds = protoSet([2, 15, 28], makeBroad, 0.9);
    let palms = 0, broads = 0, shrubs = 0, rocks = 0, stacks = 0, ferns = 0, canopies = 0;
    const fernBudget = Math.max(10, (q.broad * 0.55) | 0);
    const canopyBudget = Math.max(4, (q.broad * 0.28) | 0);
    const clearR = 9;
    const sideX = -sdz, sideZ = sdx;
    const rowOx = shore ? shore.x : beach.x;
    const rowOz = shore ? shore.z : beach.z;
    const rowInX = shore ? -shore.fx : -sdx;
    const rowInZ = shore ? -shore.fz : -sdz;
    const rowSideX = shore ? -shore.fz : sideX;
    const rowSideZ = shore ? shore.fx : sideZ;
    const shrubBudget = Math.max(8, (q.broad * 0.45) | 0);
    for (let i = 0; i < 9 && palms < q.palms; i++) {
      const along = shore
        ? (Math.sign(i - 4.5) * (3.8 + Math.abs(i - 4) * 4.0))
        : (i - 4) * (7.5 + (i % 3));
      const back = shore ? (1.2 + (i % 3) * 1.1) : (7 + (i % 3) * 3.5);
      const x = rowOx + rowInX * back + rowSideX * along;
      const z = rowOz + rowInZ * back + rowSideZ * along;
      const h = fieldSample(world, x, z);
      if (h < 0.4 || h > 4.5) continue;
      const tint = [0.9 + rnd() * 0.16, 0.92 + rnd() * 0.14, 0.84 + rnd() * 0.16];
      scatter.add(pick(palmIds, x, z), x, h, z, leanYaw(x, z), 0.85 + rnd() * 0.3, tint, 0.92 + rnd() * 0.2);
      palms++;
    }
    for (let i = 0; i < (q.palms + q.broad) * 20 && (palms < q.palms || broads < q.broad || shrubs < shrubBudget || ferns < fernBudget || canopies < canopyBudget); i++) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      if (Math.hypot(x - beach.x, z - beach.z) < clearR) continue;
      const clump = vnoise(x * 0.012, z * 0.012);
      const tint = [0.86 + rnd() * 0.22, 0.9 + rnd() * 0.18, 0.84 + rnd() * 0.2];
      if (palms < q.palms && h > 0.6 && h < 5.5 && s < 0.32 && clump > 0.42) {
        scatter.add(pick(palmIds, x, z), x, h, z, leanYaw(x, z), 0.8 + rnd() * 0.4, tint, 0.9 + rnd() * 0.25);
        palms++;
      } else if (shrubs < shrubBudget && h > 0.35 && h < 2.4 && s < 0.36 && clump > 0.36) {
        scatter.add(pick(shrubIds, x, z), x, h, z, rnd() * 6.28, 1.8 + rnd() * 1.5, tint, 0.7 + rnd() * 0.5);
        shrubs++;
      } else if (canopies < canopyBudget && h > 7 && h < 24 && s < 0.3 && clump > 0.5) {
        scatter.add(pick(canopyIds, x, z), x, h, z, rnd() * 6.28, 5.2 + rnd() * 2.4, tint, 0.9 + rnd() * 0.25);
        canopies++;
      } else if (ferns < fernBudget && h > 1.4 && h < 12 && s < 0.34 && clump > 0.58) {
        scatter.add(pick(fernIds, x, z), x, h, z, rnd() * 6.28, 1.3 + rnd() * 0.9, tint, 0.6 + rnd() * 0.4);
        ferns++;
      } else if (broads < q.broad && h > 3.2 && h < 18 && s < 0.38 && clump > 0.46) {
        scatter.add(pick(broadIds, x, z), x, h, z, rnd() * 6.28, 5.8 + rnd() * 2.8, tint, 0.85 + rnd() * 0.3);
        broads++;
      }
    }
    // Flowering shrubs, in the open where the sun reaches: behind the beach, by the lagoon,
    // and along the edge of the forest. Every blossom is somewhere a bee or a butterfly can go.
    const blooms = [], perch = [];
    const flowerIds = [0, 1, 2, 3, 4, 5].map((sd) => { const f = makeFlowerShrub(sd + 1, 0); return { id: scatter.proto([f.mesh, makeFlowerShrub(sd + 1, 1).mesh], 1.3, [16]), blooms: f.blooms }; });
    const plantFlower = (x, z) => {
      const h = fieldSample(world, x, z);
      if (h < 0.7 || h > 9 || fieldSlope(world, x, z) > 0.35) return false;
      const f = flowerIds[(rnd() * flowerIds.length) | 0], rot = rnd() * 6.28, sc = 0.9 + rnd() * 0.5, c = Math.cos(rot), s = Math.sin(rot), B = f.blooms;
      scatter.add(f.id, x, h - 0.02, z, rot, sc, [0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2], 1);
      for (let i = 0; i < B.length; i += 6) {
        blooms.push(x + (B[i] * c - B[i + 2] * s) * sc, h - 0.02 + B[i + 1] * sc, z + (B[i] * s + B[i + 2] * c) * sc, B[i + 3] * c - B[i + 4] * s, B[i + 3] * s + B[i + 4] * c);
        perch.push(x, z, sc, scatter.kind.length - 1, B[i + 5]);
      }
      return true;
    };
    for (let i = 0; i < 6; i++) { const back = 9.5 + (i % 3) * 2.2, along = (i - 2.5) * 4.6; plantFlower(rowOx + rowInX * back + rowSideX * along, rowOz + rowInZ * back + rowSideZ * along); }
    for (let i = 0, n = 0; i < 40 && n < 4; i++) { const a = rnd() * 6.28, r = 3 + rnd() * 6; if (plantFlower(lagoon.x + Math.cos(a) * r, lagoon.z + Math.sin(a) * r)) n++; }
    for (let i = 0, n = 0; i < 3000 && n < q.broad; i++) {
      const x = (rnd() - 0.5) * 450, z = (rnd() - 0.5) * 390, h = fieldSample(world, x, z);
      if (h < 2.2 || vnoise(x * 0.02 + 9, z * 0.02) < 0.52 || forestMask(x, z, h, fieldSlope(world, x, z)) > 0.45) continue;
      if (plantFlower(x, z)) n++;
    }
    // The interior is forest. Crowns touch, with clearings where the mask opens.
    const treeIds = [31, 48, 65, 82, 99, 116, 133, 150, 167].map((sd) => scatter.proto([makeTree(sd, 0), makeTree(sd, 1), makeTree(sd, 2)], 0.75, [55, 170]));
    let trees = 0;
    for (let i = 0; i < q.forest * 30 && trees < q.forest; i++) {
      const x = (rnd() - 0.5) * 470;
      const z = (rnd() - 0.5) * 410;
      const h = fieldSample(world, x, z);
      if (h < 1.9) continue;
      const fm = forestMask(x, z, h, fieldSlope(world, x, z));
      if (fm < 0.25 + rnd() * 0.5) continue;
      // Taller in the sheltered middle, lower and wind-pressed near the coast.
      const tall = 7.5 + smooth01(3, 14, h) * 6 + rnd() * 5;
      const tint = [0.8 + rnd() * 0.45, 0.82 + rnd() * 0.36, 0.75 + rnd() * 0.5];
      scatter.add(treeIds[(rnd() * treeIds.length) | 0], x, h - 0.15, z, rnd() * 6.28, tall, tint, 0.85 + rnd() * 0.4);
      trees++;
    }
    for (let i = 0; i < q.rocks * 20 && rocks < q.rocks; i++) {
      const x = (rnd() - 0.5) * 500;
      const z = (rnd() - 0.5) * 420;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      if (h < 0.15 || h > 3.2 || s > 0.62) continue;
      if (Math.hypot(x - beach.x, z - beach.z) < 4) continue;
      if (vnoise(x * 0.04, z * 0.04) < 0.58) continue;
      const sc = 0.35 + rnd() * 1.1;
      scatter.add(pick(rockIds, x, z), x, h - sc * 0.28, z, rnd() * 6, sc, [0.8 + rnd() * 0.25, 0.75 + rnd() * 0.2, 0.68 + rnd() * 0.18], 0.45 + rnd() * 0.55);
      rocks++;
    }
    const stackList = [];
    for (let i = 0; i < q.stacks * 30 && stacks < q.stacks; i++) {
      const x = -40 - rnd() * 160;
      const z = (rnd() - 0.5) * 220;
      const h = fieldSample(world, x, z);
      if (h < -6 || h > -0.4) continue;
      const sc = 1.5 + rnd() * 2.8;
      scatter.add(rockIds[stacks % 2], x, h - sc * 0.2, z, rnd() * 6, sc, [0.9, 0.86, 0.8], 1.05 + rnd() * 0.9);
      stackList.push(x, h + sc * 0.3, z, sc * 0.9);
      stacks++;
    }
    // Skiff and a buoy, so the beach and the bay have a scale.
    scatter.add(scatter.proto([makeSkiff()], 2), beach.x + 3.5, beach.h, beach.z + 1.2, byaw - 0.5 + Math.PI * 0.5, 1.15, null, 1);
    scatter.add(scatter.proto([icosphere(1, 0.28, [0.75, 0.08, 0.06])], 0.4), lagoon.x + 16, 0.12, lagoon.z + 4, 0, 1, null, 1.15);
    const reef = plantReef(world, scatter, q);
    // How open each plant stands to the trade wind: full on the windward shore, less in the
    // lee of high ground, and less again for the small things under the forest.
    for (let o = 0; o < scatter.data.length; o += ISTRIDE) {
      const x = scatter.data[o], y = scatter.data[o + 1], z = scatter.data[o + 2];
      let lee = 0;
      for (const d of [14, 32, 60]) lee = Math.max(lee, (fieldSample(world, x - 0.94 * d, z - 0.35 * d) - y - 1.5) / d);
      scatter.data[o + 6] = Math.max(0.3, 1 - lee * 4) * (y > 2 && scatter.data[o + 4] < 3 ? 0.6 : 1);
    }
    for (let i = 3; i < perch.length; i += 5) perch[i] = scatter.data[perch[i] * ISTRIDE + 6];
    scatter.finish();
    const fishLife = new FishLife(world, reef, q, stackList);
    const fishPack = packMeshes(fishMeshes());
    // The underwater place: beside a coral head that has a school over it.
    {
      // The one whose water is nearest two metres deep, so there is room to swim round it.
      let s = null, best = 9;
      for (const c of fishLife.schools) {
        if (c.sp !== 0) continue;
        const a = Math.atan2(lagoon.z - c.hz, lagoon.x - c.hx);
        // Inside the reef, where the water is quiet.
        const d = Math.abs(fieldSample(world, c.hx, c.hz) + 2) + (fieldSample(world, c.hx + Math.cos(a) * 3.2, c.hz + Math.sin(a) * 3.2) > -1.5 || c.hx > 180 ? 5 : 0);
        if (d < best) { best = d; s = c; }
      }
      if (s) {
        const a = Math.atan2(lagoon.z - s.hz, lagoon.x - s.hx);
        const ux = s.hx + Math.cos(a) * 3.2, uz = s.hz + Math.sin(a) * 3.2;
        const look = lookYP(s.hx - ux, 0.1, s.hz - uz);
        spots[5] = { x: ux, y: -1, z: uz, yaw: look[0], pitch: look[1], fly: false, dive: 1.35 };
      }
    }

    const grassList = [];
    const weedList = [];
    for (let i = 0; i < (q.grass + q.weed) * 8 && (grassList.length < q.grass || weedList.length < q.weed); i++) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      const fromBeach = Math.hypot(x - beach.x, z - beach.z);
      if (grassList.length < 70 && h > 0.28 && h < 1.15 && s < 0.18 && fromBeach > 16 && fromBeach < 70) {
        grassList.push(x, z, rnd() * 6.28, 0.22 + rnd() * 0.2);
      } else if (grassList.length < q.grass && h > 1.5 && h < 28 && s < 0.48 && vnoise(x * 0.03, z * 0.03) > 0.38) {
        grassList.push(x, z, rnd() * 6.28, 0.45 + rnd() * 0.55);
      } else if (weedList.length < q.weed && h < -0.35 && h > -3.2 && s < 0.5 && x > 20) {
        weedList.push(x, z, rnd() * 6.28, -(0.7 + rnd() * 0.8));
      }
    }
    const grassInst = new Float32Array(grassList.length + weedList.length);
    grassInst.set(grassList, 0);
    grassInst.set(weedList, grassList.length);
    const grassCount = grassInst.length / 4;

    const birdMeta = new Float32Array(Math.max(q.birds, 1) * 4);
    const birdData = new Float32Array(Math.max(q.birds, 1) * 4);
    for (let i = 0; i < q.birds; i++) {
      const ang = rnd() * 6.28;
      const rad = 25 + rnd() * 110;
      birdMeta[i * 4] = Math.cos(ang) * rad;
      birdMeta[i * 4 + 1] = Math.sin(ang) * rad * 0.8;
      birdMeta[i * 4 + 2] = ang + 1.4 + rnd() * 0.6;
      birdMeta[i * 4 + 3] = 14 + rnd() * 36;
    }

    mark('planting');
    setStatus('Tuning the swell', 0.78);
    await new Promise((r) => setTimeout(r, 0));

    const infos = await Promise.all([mod, blitMod, simMod, oceanMod].map((m) => m.getCompilationInfo()));
    const errs = [].concat(...infos.map((n) => n.messages)).filter((m) => m.type === 'error');
    if (errs.length) {
      fail(errs.map((e) => e.lineNum + ':' + e.linePos + '  ' + e.message).join('\n'));
      return;
    }
    mark('wgsl');
    const uf = new Float32Array(224);
    const ur = new Float32Array(224);
    const un = new Float32Array(224);
    for (let i = 0; i < 8; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      uf[88 + i * 4] = w[0] / L; uf[89 + i * 4] = w[1] / L; uf[90 + i * 4] = w[2]; uf[91 + i * 4] = w[3];
      uf[120 + i] = w[4];
    }
    ur.set(uf);

    const ubuf = device.createBuffer({ size: 896, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const rbuf = device.createBuffer({ size: 896, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const nbuf = device.createBuffer({ size: 896, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const htex = device.createTexture({
      size: [q.hres, q.hres],
      format: 'rg32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    device.queue.writeTexture(
      { texture: htex },
      world.data,
      { bytesPerRow: q.hres * 8, rowsPerImage: q.hres },
      { width: q.hres, height: q.hres }
    );

    function upload(array, usage) {
      const size = Math.max(4, (array.byteLength + 3) & ~3);
      const b = device.createBuffer({ size: size, usage: usage, mappedAtCreation: true });
      new Uint8Array(b.getMappedRange()).set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      b.unmap();
      return b;
    }
    const terrain = gridMesh(q.terrain, {
      x0: -q.textent, z0: -q.textent, size: q.textent * 2,
      fn: (x, z) => fieldSample(world, x, z)
    });
    const water = gridMesh(q.water, null);
    const shoreMesh = gridMesh(112, null);
    const packed = scatter.packed;
    const g = grassGeom();
    const grassVert = packInterleaved(g.pos, g.uv);
    const bgeom = birdGeom();
    const birdVert = packBird(bgeom.pos, bgeom.wing);

    const terrainVB = upload(terrain.pos, GPUBufferUsage.VERTEX);
    const terrainIB = upload(terrain.idx, GPUBufferUsage.INDEX);
    const waterVB = upload(water.pos, GPUBufferUsage.VERTEX);
    const waterIB = upload(water.idx, GPUBufferUsage.INDEX);
    const shoreVB = upload(shoreMesh.pos, GPUBufferUsage.VERTEX);
    const shoreIB = upload(shoreMesh.idx, GPUBufferUsage.INDEX);
    const meshVB = upload(packed.vert, GPUBufferUsage.VERTEX);
    const meshIB = upload(packed.idx, GPUBufferUsage.INDEX);
    // Three lists share one instance buffer each frame: the view, its mirror, and the near shadow.
    const instArr = new Float32Array(Math.max(1, scatter.n) * 3 * ISTRIDE);
    const instB = device.createBuffer({ size: instArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    // The island-wide shadow map sees every plant at its coarsest level, and is drawn once per sun angle.
    const farArr = new Float32Array(Math.max(1, scatter.n) * ISTRIDE);
    const farDraws = scatter.collect(farArr, 0, null, 0, 0, 0, 1e9, 9);
    const instFarB = upload(farArr, GPUBufferUsage.VERTEX);
    let mainDraws = [], reflDraws = [], shadowFor = null;
    function drawMeshes(pass, pipeline, bg, buf, draws) {
      if (!draws.length) return;
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, meshVB); pass.setVertexBuffer(1, buf); pass.setIndexBuffer(meshIB, 'uint32');
      for (let i = 0; i < draws.length; i += 5) pass.drawIndexed(draws[i + 1], draws[i + 4], draws[i], draws[i + 2], draws[i + 3]);
    }
    function drawMeshes2(pass, pipeline, bg, vb, ib, buf, draws) {
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, vb); pass.setVertexBuffer(1, buf); pass.setIndexBuffer(ib, 'uint32');
      for (let i = 0; i < draws.length; i += 5) pass.drawIndexed(draws[i + 1], draws[i + 4], draws[i], draws[i + 2], draws[i + 3]);
    }
    const grassVB = upload(grassVert, GPUBufferUsage.VERTEX);
    const grassIB = upload(g.idx, GPUBufferUsage.INDEX);
    const grassInstB = upload(grassInst, GPUBufferUsage.VERTEX);
    const birdVB = upload(birdVert, GPUBufferUsage.VERTEX);
    const birdIB = upload(bgeom.idx, GPUBufferUsage.INDEX);
    const birdInstB = device.createBuffer({ size: Math.max(16, birdData.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const fishVB = upload(fishPack.vert, GPUBufferUsage.VERTEX);
    const fishIB = upload(fishPack.idx, GPUBufferUsage.INDEX);
    const bugLife = new BugLife(world, blooms, perch);
    const bugPack = packMeshes(bugMeshes());
    const bugVB = upload(bugPack.vert, GPUBufferUsage.VERTEX), bugIB = upload(bugPack.idx, GPUBufferUsage.INDEX);
    const bugArr = new Float32Array(bugLife.agents.length * BUG_STRIDE);
    const bugInstB = device.createBuffer({ size: bugArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    let bugDraws = [], bugCam = null, sunView = 0, sunTurn = 0;
    const fishArr = new Float32Array(Math.max(1, fishLife.n) * ISTRIDE);
    const fishInstB = device.createBuffer({ size: fishArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    let fishDraws = [];

    mark('buffers');
    setStatus('Warming the light', 0.9);
    await pipesReady;
    mark('pipelines');
    const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const shadowSamp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const shadowTex = device.createTexture({
      size: [2048, 2048],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    const shadowView = shadowTex.createView();
    // A second, tight shadow map around the eye. The island map has 33 cm texels,
    // which cannot hold the shadow of a leaflet. This one has 2.5 cm texels.
    const NEAR_R = 26, NEAR_RES = 2048;
    const nearView = device.createTexture({
      size: [NEAR_RES, NEAR_RES], format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    }).createView();
    const nearPass = {
      colorAttachments: [],
      depthStencilAttachment: { view: nearView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };
    const NEARVP = new Float32Array(16);
    const bgUBN = device.createBindGroup({ layout: ubLayout, entries: [{ binding: 0, resource: { buffer: nbuf } }] });
    let nearDraws = [];
    // The sky panorama. Sizes match SKYW and SKYH in the shader.
    const SKYW = 1536, SKYH = 384, SKY_STRIPS = 16;
    const skyView = device.createTexture({
      size: [SKYW, SKYH], format: sceneFmt,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    }).createView();
    const skySamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    const skyPass = { colorAttachments: [{ view: skyView, loadOp: 'load', storeOp: 'store' }] };
    let skyStrip = 0, skyFor = null, skyFresh = 0, skySettle = 0;
    const shapeH0 = makeOceanH0(OCEAN_N, 220, [9.0, 0.6], 0.0006, [5, 56], 0.3, 0, 11);
    const glintH0 = makeOceanH0(OCEAN_N, 4, [4.5, 0.3], 0.002, [0.08, 0.45], 0, 0.3, 29);
    const oceanU = new Float32Array(4);
    function oceanCascade(h0, size) {
      const store = (data, extra) => {
        const b = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | (extra || 0), mappedAtCreation: true });
        new Float32Array(b.getMappedRange()).set(data);
        b.unmap();
        return b;
      };
      const ub = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const tex = device.createTexture({
        size: [OCEAN_N, OCEAN_N],
        format: 'rgba16float',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
      });
      const view = tex.createView();
      const bg = device.createBindGroup({
        layout: oceanLayout,
        entries: [
          { binding: 0, resource: { buffer: store(h0) } },
          { binding: 1, resource: { buffer: store(new Float32Array(h0.length)) } },
          { binding: 2, resource: { buffer: ub } },
          { binding: 3, resource: view }
        ]
      });
      return { size, ub, view, bg };
    }
    const chopH0 = makeOceanH0(OCEAN_N, 24, [6.5, 1.5], 0.001, [0.45, 5], 0, 0.1, 47, 1.6);
    const cascades = [oceanCascade(shapeH0, 220), oceanCascade(glintH0, 4), oceanCascade(chopH0, 24)];
    mark('ocean');
    const shoreSim = await createShore(
      device, world,
      shore || { x: -150, z: 6, fx: -1, fz: 0 },
      cascades[0].view
    );
    mark('shore');
    const shadowPass = {
      colorAttachments: [],
      depthStencilAttachment: { view: shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };
    let sceneTex = null, sceneDepth = null, swapDepth = null, reflTex = null, reflDepth = null, airTex = null, bgAir = null;
    const READ = qstr.has('read');
    let readTex = null, readDepth = null, readBuf = null, readBpr = 0;
    let bgGeoSet = [null, null], bgGeoR, bgUB, bgUBR, bgBlit, bgWater;
    let viewW = 2, viewH = 2;
    const hview = htex.createView();
    const ripTex = [0, 1].map(() => device.createTexture({
      size: [256, 256],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    }));
    const ripViews = ripTex.map((t) => t.createView());
    const simBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const simU = new Float32Array(12);
    const simBG = [0, 1].map((i) => device.createBindGroup({
      layout: simLayout,
      entries: [
        { binding: 0, resource: ripViews[i] },
        { binding: 1, resource: { buffer: simBuf } }
      ]
    }));
    let ripIndex = 0;
    const simPass = {
      colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }]
    };
    {
      const enc0 = device.createCommandEncoder();
      for (let i = 0; i < 2; i++) {
        simPass.colorAttachments[0].view = ripViews[i];
        enc0.beginRenderPass(simPass).end();
      }
      device.queue.submit([enc0.finish()]);
    }

    const airPass = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] };
    function destroyTex(t) { if (t) t.destroy(); }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      let w = Math.max(2, Math.floor(innerWidth * dpr * q.scale));
      let h = Math.max(2, Math.floor(innerHeight * dpr * q.scale));
      if (w * h > q.maxPx) {
        const k = Math.sqrt(q.maxPx / (w * h));
        w = Math.max(2, (w * k) | 0); h = Math.max(2, (h * k) | 0);
      }
      canvas.width = w; canvas.height = h;
      context.configure({ device: device, format: format, alphaMode: 'opaque' });
      destroyTex(sceneTex); destroyTex(sceneDepth); destroyTex(swapDepth); destroyTex(reflTex); destroyTex(reflDepth); destroyTex(airTex);
      sceneTex = device.createTexture({ size: [w, h], format: sceneFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      sceneDepth = device.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      swapDepth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const rw = Math.max(2, w >> 1), rh = Math.max(2, h >> 1);
      reflTex = device.createTexture({ size: [rw, rh], format: sceneFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      reflDepth = device.createTexture({ size: [rw, rh], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      airTex = device.createTexture({ size: [rw, rh], format: sceneFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      viewW = w; viewH = h;
      if (READ) {
        if (readTex) readTex.destroy();
        if (readDepth) readDepth.destroy();
        if (readBuf) readBuf.destroy();
        readBpr = (Math.ceil((w * 4) / 256) * 256);
        readTex = device.createTexture({ size: [w, h], format: format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        readDepth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
        readBuf = device.createBuffer({ size: readBpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      }
      const sv = sceneTex.createView(), sd = sceneDepth.createView(), rv = reflTex.createView(), av = airTex.createView();
      airPass.colorAttachments[0].view = av;
      bgAir = device.createBindGroup({ layout: airLayout, entries: [{ binding: 1, resource: sd }] });
      const geoGroup = (buf, view) => device.createBindGroup({
        layout: geoLayout,
        entries: [
          { binding: 0, resource: { buffer: buf } },
          { binding: 1, resource: hview },
          { binding: 2, resource: view },
          { binding: 3, resource: shadowView },
          { binding: 4, resource: shadowSamp },
          { binding: 5, resource: { buffer: shoreSim.ubuf } },
          { binding: 6, resource: shoreSim.stateView },
          { binding: 7, resource: shoreSim.wetView },
          { binding: 8, resource: skyView },
          { binding: 9, resource: skySamp },
          { binding: 10, resource: nearView }
        ]
      });
      bgGeoSet = [geoGroup(ubuf, ripViews[0]), geoGroup(ubuf, ripViews[1])];
      bgGeoR = geoGroup(rbuf, ripViews[0]);
      bgUB = device.createBindGroup({ layout: ubLayout, entries: [{ binding: 0, resource: { buffer: ubuf } }] });
      bgUBR = device.createBindGroup({ layout: ubLayout, entries: [{ binding: 0, resource: { buffer: rbuf } }] });
      bgBlit = device.createBindGroup({ layout: blitLayout, entries: [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: sv },
        { binding: 2, resource: sd },
        { binding: 3, resource: av },
        { binding: 4, resource: samp }
      ] });
      bgWater = device.createBindGroup({ layout: waterLayout, entries: [
        { binding: 0, resource: sv },
        { binding: 1, resource: sd },
        { binding: 2, resource: rv },
        { binding: 3, resource: samp },
        { binding: 4, resource: cascades[0].view },
        { binding: 5, resource: cascades[1].view },
        { binding: 6, resource: cascades[2].view },
        { binding: 7, resource: av }
      ] });
    }
    resize();
    addEventListener('resize', resize);

    const scenePass = {
      colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.45, g: 0.55, b: 0.62, a: 1 } }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };
    const reflPass = {
      colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };
    const swapPass = {
      colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.55, g: 0.65, b: 0.72, a: 1 } }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };

    function drawWorld(pass, ub, geo, birds, draws) {
      pass.setPipeline(pipes.sky); pass.setBindGroup(0, geo); pass.draw(3);
      pass.setPipeline(pipes.terrain); pass.setBindGroup(0, geo);
      pass.setVertexBuffer(0, terrainVB); pass.setIndexBuffer(terrainIB, 'uint32');
      pass.drawIndexed(terrain.idx.length);
      drawMeshes(pass, pipes.mesh, geo, instB, draws);
      if (birds && q.birds) {
        pass.setPipeline(pipes.bird); pass.setBindGroup(0, geo);
        pass.setVertexBuffer(0, birdVB); pass.setVertexBuffer(1, birdInstB);
        pass.setIndexBuffer(birdIB, 'uint16');
        pass.drawIndexed(bgeom.idx.length, q.birds);
      }
      if (birds && fishDraws.length) drawMeshes2(pass, pipes.fish, geo, fishVB, fishIB, fishInstB, fishDraws);
      if (birds && grassCount) {
        pass.setPipeline(pipes.grass); pass.setBindGroup(0, geo);
        pass.setVertexBuffer(0, grassVB); pass.setVertexBuffer(1, grassInstB);
        pass.setIndexBuffer(grassIB, 'uint16');
        pass.drawIndexed(g.idx.length, grassCount);
      }
    }

    const fov = 60 * Math.PI / 180;
    const near = 0.08, far = 36000;
    let time = parseFloat(qstr.get('t') || '2.5') || 0;
    envLight(0);
    env.cloud = [Math.cos(0.36) * 0.00855 * time, Math.sin(0.36) * 0.00855 * time];
    // Captures hold the hour and the weather still unless asked to let them run.
    if (qstr.has('shot') || qstr.has('studio')) { env.run = env.auto = qstr.has('flow'); }
    if (qstr.has('tod')) env.hour = parseFloat(qstr.get('tod')) || ENV_H0;
    if (qstr.has('wx')) { envSet(qstr.get('wx'), true); env.auto = false; }
    let last = performance.now();
    const ft = new Float32Array(40);
    let ftI = 0, ftN = 0, frames = 0, adaptLeft = 3, ready = false;
    let showHint = 0;
    let shoreWarm = 110;
    let fishCam = null, birdNear = 0;

    const nearC = [0, 0, 0];
    function fillCam(arr, eyeX, eyeY, eyeZ, cyaw, cpitch, clipBelow, underFlag) {
      cameraVectors(cyaw, cpitch, fwd, right, up);
      const eye = [eyeX, eyeY, eyeZ];
      viewFrom(eye, right, up, fwd, V);
      perspective(P, fov, viewW / viewH, near, far);
      matmul(P, V, VP);
      invert(VP, INV);
      arr.set(VP, 0); arr.set(INV, 16);
      arr[48] = eyeX; arr[49] = eyeY; arr[50] = eyeZ; arr[51] = time;
      arr[55] = underFlag;
      arr[60] = 0.73; arr[61] = 0.79; arr[62] = 0.84; arr[63] = Math.tan(fov * 0.5);
      arr[64] = right[0]; arr[65] = right[1]; arr[66] = right[2]; arr[67] = viewW / viewH;
      arr[68] = up[0]; arr[69] = up[1]; arr[70] = up[2]; arr[71] = clipBelow;
      arr[72] = fwd[0]; arr[73] = fwd[1]; arr[74] = fwd[2]; arr[75] = qstr.has('noshadow') ? 0 : q.shadow;
      arr[79] = q.clouds;
      arr[84] = viewW; arr[85] = viewH; arr[86] = q.refl && !qstr.has('norefl') ? 1 : 0;
      arr[128] = wp.amp * env.sea; arr[129] = wp.spd; arr[130] = wp.frq; arr[131] = wp.dir;
      arr[132] = wp.rough; arr[133] = wp.refl; arr[134] = wp.refr; arr[135] = wp.alpha;
      arr[136] = wp.sun; arr[137] = wp.sky; arr[138] = wp.layers; arr[139] = wp.paused;
      arr[140] = wp.deep[0]; arr[141] = wp.deep[1]; arr[142] = wp.deep[2]; arr[143] = wp.depthK;
      arr[144] = wp.shal[0]; arr[145] = wp.shal[1]; arr[146] = wp.shal[2]; arr[147] = wp.rip;
      arr[148] = simOx; arr[149] = simOz; arr[150] = simDomain; arr[151] = wp.cx;
      arr[152] = wp.mood[0]; arr[153] = env.cover; arr[154] = env.haze; arr[155] = wp.mood[3];
      envWrite(arr, 188, wp.sunAng, wp.sun);
      // Sun-space matrix. The light sits up-sun of the island and looks back down its own rays.
      const lx = arr[52], ly = arr[53], lz = arr[54];
      const sfx = -lx, sfy = -ly, sfz = -lz;
      let srx = lz, sry = 0, srz = -lx;
      const srl = Math.hypot(srx, sry, srz) || 1;
      srx /= srl; sry /= srl; srz /= srl;
      const sux = sry * sfz - srz * sfy;
      const suy = srz * sfx - srx * sfz;
      const suz = srx * sfy - sry * sfx;
      viewFrom([lx * 280, ly * 280, lz * 280], [srx, sry, srz], [sux, suy, suz], [sfx, sfy, sfz], V);
      ortho(P, -340, 340, -260, 300, 6, 620);
      matmul(P, V, SHVP);
      arr.set(SHVP, 156);
      // The near box sits ahead of the eye and moves in whole texels, so its edges do not crawl.
      const hx = fwd[0], hz = fwd[2], hl = Math.hypot(hx, hz) || 1;
      let ncx = eyeX + hx / hl * NEAR_R * 0.55, ncy = Math.max(eyeY - 1.5, 0), ncz = eyeZ + hz / hl * NEAR_R * 0.55;
      const tex = NEAR_R * 2 / NEAR_RES;
      const pa = ncx * srx + ncy * sry + ncz * srz, pb = ncx * sux + ncy * suy + ncz * suz;
      const da = Math.round(pa / tex) * tex - pa, db = Math.round(pb / tex) * tex - pb;
      ncx += srx * da + sux * db; ncy += sry * da + suy * db; ncz += srz * da + suz * db;
      nearC[0] = ncx; nearC[1] = ncy; nearC[2] = ncz;
      viewFrom([ncx + lx * 120, ncy + ly * 120, ncz + lz * 120], [srx, sry, srz], [sux, suy, suz], [sfx, sfy, sfz], V);
      ortho(P, -NEAR_R, NEAR_R, -NEAR_R, NEAR_R, 1, 240);
      matmul(P, V, NEARVP);
      arr.set(NEARVP, 172);
      const over = wp.mood[1];
      arr[60] = 0.73 * (1 - over * 0.4) + over * 0.52;
      arr[61] = 0.79 * (1 - over * 0.35) + over * 0.54;
      arr[62] = 0.84 * (1 - over * 0.22) + over * 0.58;
    }

    device.lost.then((info) => { window.__gpuerr = 'lost ' + (info && info.message); console.error('LOST', info && info.message); });
    function frame(now) {
      try { frameBody(now); } catch (err) { window.__gpuerr = String(err && err.stack || err); console.error('FRAME', err); }
    }
    function frameBody(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mode === 2) { if (!wp.paused) time += dt * wp.sim; }
      else time += dt;
      frames++;
      if (frames === 1) mark('frame1');
      if (!ready && frames > 1) {
        ready = true;
        mark('ready');
        if (qstr.has('perf')) console.log('PERF ' + JSON.stringify(PERF));
        window.__ready = 1;
        try { sessionStorage.removeItem('ww-boot'); } catch (e) {}
        goEl.hidden = false;
        statusEl.textContent = '';
        barEl.parentElement.hidden = true;
      }
      ft[ftI] = dt; ftI = (ftI + 1) % ft.length; if (ftN < ft.length) ftN++;
      if (frames === 50 && adaptLeft > 0 && !qstr.has('shot')) {
        let sum = 0; for (let i = 0; i < ftN; i++) sum += ft[i];
        if (sum / ftN > 0.028 && q.scale > 0.45) { q.scale = Math.max(0.45, q.scale * 0.8); adaptLeft--; resize(); }
      }

      envStep(dt, time, wp.mood[1], wp.mood[2], wp.dir, wp.amp);

      if (mode === 0 && !qstr.has('shot')) {
        const a = time * 0.045;
        camX = Math.sin(a) * 230 + 24;
        camZ = Math.cos(a) * 190 - 10;
        camY = 42 + Math.sin(a * 0.8) * 7;
        const lp = lookYP(8 - camX, 4 - camY, -6 - camZ);
        yaw = lp[0]; pitch = lp[1];
      } else if (mode === 1 && introFrom) {
        introT += dt / 2.3;
        const t = introT < 1 ? introT * introT * (3 - 2 * introT) : 1;
        camX = introFrom.x + (introTo.x - introFrom.x) * t;
        camY = introFrom.y + (introTo.y - introFrom.y) * t;
        camZ = introFrom.z + (introTo.z - introFrom.z) * t;
        let dyaw = introTo.yaw - introFrom.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        yaw = introFrom.yaw + dyaw * t;
        pitch = introFrom.pitch + (introTo.pitch - introFrom.pitch) * t;
        if (Math.abs(lookX) + Math.abs(lookY) > 12) introT = 1;
        if (introT >= 1) { mode = 2; showHint = 7; fly = false; dive = 0; }
      } else if (mode === 2 && orbit) {
        if (trip) { advanceTrip(dt); }
        else {
        const ofx = Math.sin(orbitYaw), ofz = -Math.cos(orbitYaw);
        const orx = Math.cos(orbitYaw), orz = Math.sin(orbitYaw);
        const osp = (K.ShiftLeft || K.ShiftRight) ? 22 : 9;
        if (K.KeyW) { targetX += ofx * osp * dt; targetZ += ofz * osp * dt; }
        if (K.KeyS) { targetX -= ofx * osp * dt; targetZ -= ofz * osp * dt; }
        if (K.KeyD) { targetX += orx * osp * dt; targetZ += orz * osp * dt; }
        if (K.KeyA) { targetX -= orx * osp * dt; targetZ -= orz * osp * dt; }
        if (K.KeyE || K.Space) orbitDist = Math.max(4, orbitDist - 16 * dt);
        if (K.KeyQ) orbitDist = Math.min(160, orbitDist + 16 * dt);
        applyOrbitPose();
        const orr = Math.hypot(camX, camZ);
        if (orr > 980) { camX *= 980 / orr; camZ *= 980 / orr; }
        if (camY > 320) camY = 320;
        if (camY < 0.35) camY = 0.35;
        }
      } else if (mode === 2) {
        yaw += lookX * 0.00215; pitch -= lookY * 0.00215;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
        const sprint = K.ShiftLeft || K.ShiftRight || touchN >= 2;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);
        let mx = 0, my = 0, mz = 0;
        const forward = (K.KeyW || touchN >= 1) ? 1 : 0;
        const back = K.KeyS ? 1 : 0;
        if (fly) {
          const fxx = fx * cp, fzz = fz * cp, fyy = sp;
          if (forward) { mx += fxx; my += fyy; mz += fzz; }
          if (back) { mx -= fxx; my -= fyy; mz -= fzz; }
          const rx = Math.cos(yaw), rz = Math.sin(yaw);
          if (K.KeyD) { mx += rx; mz += rz; }
          if (K.KeyA) { mx -= rx; mz -= rz; }
          if (K.KeyE || K.Space) my += 1;
          if (K.KeyQ) my -= 1;
          const spm = sprint ? 46 : 13;
          const ml = Math.hypot(mx, my, mz) || 1;
          camX += mx / ml * spm * dt; camY += my / ml * spm * dt; camZ += mz / ml * spm * dt;
        } else {
          const rx = Math.cos(yaw), rz = Math.sin(yaw);
          if (forward) { mx += fx; mz += fz; }
          if (back) { mx -= fx; mz -= fz; }
          if (K.KeyD) { mx += rx; mz += rz; }
          if (K.KeyA) { mx -= rx; mz -= rz; }
          const ml = Math.hypot(mx, mz);
          const ground = fieldSample(world, camX, camZ);
          const wy = waveY(world, camX, camZ, time);
          const swimming = ground < wy - 0.25;
          // Slower under water, so the fish are watched and not chased.
          const spm = swimming ? (dive > 0.7 ? (sprint ? 3.6 : 1.5) : (sprint ? 7.5 : 3.2)) : (sprint ? 8.2 : 4.1);
          if (ml > 0) {
            const nx = camX + mx / ml * spm * dt;
            const nz = camZ + mz / ml * spm * dt;
            const nh = fieldSample(world, nx, nz);
            if (nh < ground + 0.75) { camX = nx; camZ = nz; }
          }
          const gh = fieldSample(world, camX, camZ);
          const wh = waveY(world, camX, camZ, time);
          if (gh < wh - 0.25) {
            if (K.KeyQ) dive = Math.min(6, dive + dt * 1.6);
            else if (K.KeyE || K.Space) dive = Math.max(0, dive - dt * 2.2);
            // Just under the surface a swimmer bobs back up. Further down they stay where they are.
            else if (dive < 0.7) dive = Math.max(0, dive - dt * 0.35);
            camY = Math.max(gh + 0.45, wh + 0.42 - dive);
          } else {
            dive = 0;
            camY = gh + 1.65;
          }
        }
        const rr = Math.hypot(camX, camZ);
        if (rr > 980) { camX *= 980 / rr; camZ *= 980 / rr; }
        if (camY > 320) camY = 320;
        if (camY < -8) camY = -8;
      }
      lookX = 0; lookY = 0;

      fishLife.update(dt, time, camX, camY, camZ);
      if (fishCam) {
        // A capture framing: stay beside one fish, or back from its school, and look at it.
        const s = fishCam.s, i = s.first + Math.min(fishCam.i, s.n - 1), wide = fishCam.d > 1.6;
        const tx = wide ? s.cx : fishLife.px[i], ty = wide ? s.cy : fishLife.py[i], tz = wide ? s.cz : fishLife.pz[i];
        if (fishCam.a == null) {
          // Beside the fish, on whichever side is open water.
          const B = fishLife.blocks, a0 = (wide ? s.face : fishLife.yaw[i]) + Math.PI * 0.5 + fishCam.turn;
          for (let k = 0; k < 8 && fishCam.a == null; k++) {
            const a = a0 + [0, 3.1416, 0.6, -0.6, 2.5, -2.5, 1.3, -1.3][k], x = tx + Math.cos(a) * fishCam.d, z = tz + Math.sin(a) * fishCam.d;
            let free = fieldSample(world, x, z) < ty - 0.1;
            for (let o = 0; o < B.length && free; o += 4) free = Math.hypot(x - B[o], ty - B[o + 1], z - B[o + 2]) > B[o + 3] + 0.25;
            if (free || k === 7) fishCam.a = a;
          }
        }
        camX = tx + Math.cos(fishCam.a) * fishCam.d; camZ = tz + Math.sin(fishCam.a) * fishCam.d;
        camY = Math.min(waveY(world, camX, camZ, time) - 0.3, Math.max(ty + fishCam.d * 0.12 + fishCam.up, fieldSample(world, camX, camZ) + 0.12));
        const lp = lookYP(tx - camX, ty - camY, tz - camZ);
        yaw = lp[0]; pitch = lp[1] + fishCam.tilt;
      }

      bugLife.update(dt, time, camX, camY, camZ);
      if (bugCam && bugCam.a) {
        // A capture framing: close to one insect, from the side the sun is on, looking at it.
        const a = bugCam.a, S = bugLife.sites.bloom, on = BUGS[a.sp].site === 'bloom' && a.site >= 0;
        // Something at a blossom is looked at from in front of the blossom.
        const q0 = (on ? Math.atan2(S[a.site + 4], S[a.site + 3]) : Math.atan2(env.key[2], env.key[0]) + wp.sunAng) + bugCam.turn;
        camX = a.x + Math.cos(q0) * bugCam.d; camZ = a.z + Math.sin(q0) * bugCam.d; camY = a.y + bugCam.up + bugCam.d * (on ? 0.6 : 0.25);
        const lp = lookYP(a.x - camX, a.y - camY, a.z - camZ);
        yaw = lp[0]; pitch = lp[1] + bugCam.tilt;
      }
      if (sunView) {
        // A capture framing: face the light, pitched up by this much of its height.
        const az = Math.atan2(env.key[2], env.key[0]) + wp.sunAng + sunTurn, hl = Math.hypot(env.key[0], env.key[2]);
        const lp = lookYP(Math.cos(az) * hl, env.key[1] * sunView, Math.sin(az) * hl);
        yaw = lp[0]; pitch = lp[1];
      }
      const under = camY < waveY(world, camX, camZ, time) - 0.02 ? 1 : 0;
      // The grid reaches the haze in every direction. A small snap keeps the dense vertices under the camera.
      const eyeH = Math.max(camY, 0.4);
      const cover = Math.min(6400, 2200 + eyeH * 28) * 2;
      const snap = 4;
      const ox = Math.floor(camX / snap) * snap - cover * 0.5;
      const oz = Math.floor(camZ / snap) * snap - cover * 0.5;

      fillCam(uf, camX, camY, camZ, yaw, pitch, 0, under);
      uf[80] = ox; uf[81] = oz; uf[82] = cover; uf[83] = fieldDamp(world, camX, camZ);

      // Reflected camera, for the water mirror.
      cameraVectors(yaw, -pitch, rfwd, rright, rup);
      const rex = camX, rey = -camY, rez = camZ;
      viewFrom([rex, rey, rez], rright, rup, rfwd, V);
      perspective(P, fov, viewW / viewH, near, far);
      matmul(P, V, RVP);
      uf.set(RVP, 32);
      // Reflection uniform: same lighting, reflected view in the main slots.
      ur.set(uf);
      invert(RVP, INV);
      ur.set(RVP, 0); ur.set(INV, 16);
      ur[48] = rex; ur[49] = rey; ur[50] = rez;
      ur[55] = 0; ur[71] = 1;
      cameraVectors(yaw, -pitch, rfwd, rright, rup);
      ur[64] = rright[0]; ur[65] = rright[1]; ur[66] = rright[2];
      ur[68] = rup[0]; ur[69] = rup[1]; ur[70] = rup[2];
      ur[72] = rfwd[0]; ur[73] = rfwd[1]; ur[74] = rfwd[2];

      device.queue.writeBuffer(ubuf, 0, uf);
      device.queue.writeBuffer(rbuf, 0, ur);

      mainDraws = scatter.collect(instArr, 0, uf, camX, camY, camZ, 1e9, 0);
      let instEnd = mainDraws.end;
      if (uf[86] > 0.5) {
        // The mirror is half resolution, so it takes each plant one level coarser.
        reflDraws = scatter.collect(instArr, instEnd, RVP, camX, -camY, camZ, 1e9, 1);
        instEnd = reflDraws.end;
      }
      // What stands near enough to throw a shadow into the near box.
      nearDraws = scatter.collect(instArr, instEnd, null, nearC[0], nearC[1], nearC[2], NEAR_R * 1.6, 0);
      instEnd = nearDraws.end;
      if (instEnd) device.queue.writeBuffer(instB, 0, instArr, 0, instEnd * ISTRIDE);
      // The same frame data with the near matrix in the shadow slot, for the near shadow pass.
      un.set(uf); un.set(NEARVP, 156);
      device.queue.writeBuffer(nbuf, 0, un);
      // Fish are seen under water from 44 m at most, and from the air only close by.
      fishDraws = fishLife.collect(fishArr, uf, camX, camY, camZ, under ? 44 : 30, fishPack.ranges);
      if (fishDraws.end) device.queue.writeBuffer(fishInstB, 0, fishArr, 0, fishDraws.end * ISTRIDE);

      bugDraws = under ? [] : bugLife.collect(bugArr, uf, camX, camY, camZ, uf[63] * 2 / viewH, bugPack.ranges);
      if (bugDraws.end) device.queue.writeBuffer(bugInstB, 0, bugArr, 0, bugDraws.end * BUG_STRIDE);
      if (q.birds) {
        for (let i = 0; i < q.birds; i++) {
          let x = birdMeta[i * 4], z = birdMeta[i * 4 + 1], hd = birdMeta[i * 4 + 2];
          const sp = 7 + (i % 5) * 1.6;
          const dist = Math.hypot(x, z) || 1;
          const home = Math.atan2(-z, -x);
          let turn = home - hd;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          hd += (dist > 150 ? turn * 0.45 : Math.sin(time * 0.19 + i * 1.7) * 0.28) * dt;
          x += Math.cos(hd) * sp * dt;
          z += Math.sin(hd) * sp * dt;
          const ground = fieldSample(world, x, z);
          const y = Math.max(birdMeta[i * 4 + 3] + Math.sin(time * 0.35 + i) * 3.5, ground + 9);
          birdMeta[i * 4] = x; birdMeta[i * 4 + 1] = z; birdMeta[i * 4 + 2] = hd;
          birdData[i * 4] = x;
          birdData[i * 4 + 1] = y;
          birdData[i * 4 + 2] = z;
          birdData[i * 4 + 3] = hd;
          // Capture only: bird=<metres> flies the first three past the camera.
          if (birdNear && i < 3) birdData.set([camX + Math.sin(yaw) * birdNear + Math.cos(yaw) * (i - 1) * 1.3, camY + 0.3 * i, camZ - Math.cos(yaw) * birdNear + Math.sin(yaw) * (i - 1) * 1.3, yaw + [0, 0.9, -2.2][i]], i * 4);
        }
        device.queue.writeBuffer(birdInstB, 0, birdData);
      }

      if (pendingSplat && !wp.paused) {
        simU[0] = pendingSplat.x; simU[1] = pendingSplat.z; simU[2] = pendingSplat.s; simU[3] = pendingSplat.r;
        pendingSplat = null;
      } else simU[2] = 0;
      simU[4] = Math.min(0.4, 0.16 * wp.ripSpd * wp.sim);
      simU[5] = 0.996;
      simU[6] = simDomain;
      simU[8] = simOx; simU[9] = simOz;
      device.queue.writeBuffer(simBuf, 0, simU);

      const enc = device.createCommandEncoder();
      for (let ci = 0; ci < cascades.length; ci++) {
        const c = cascades[ci];
        oceanU[0] = time;
        oceanU[1] = c.size;
        device.queue.writeBuffer(c.ub, 0, oceanU);
        const steps = ['evolve', 'rows', 'cols', 'slopes'];
        for (let s = 0; s < steps.length; s++) {
          const cp = enc.beginComputePass();
          cp.setPipeline(oceanPipes[steps[s]]);
          cp.setBindGroup(0, c.bg);
          if (s === 1 || s === 2) cp.dispatchWorkgroups(OCEAN_N);
          else cp.dispatchWorkgroups(OCEAN_N / 16, OCEAN_N / 16);
          cp.end();
        }
      }
      // The surf starts from still water and is run forward over the first frames,
      // so the first picture does not wait for it.
      for (let k = 0; k < 11 && shoreWarm > 0; k++, shoreWarm--) {
        const e = device.createCommandEncoder();
        shoreSim.encode(e, time - shoreWarm * 0.04, 0.04);
        device.queue.submit([e.finish()]);
      }
      if (!wp.paused) shoreSim.encode(enc, time, dt);
      if (mode === 2 && !wp.paused) {
        if (ripClear) {
          for (let i = 0; i < 2; i++) {
            simPass.colorAttachments[0].view = ripViews[i];
            enc.beginRenderPass(simPass).end();
          }
          ripClear = 0;
          ripIndex = 0;
        }
        simPass.colorAttachments[0].view = ripViews[1 - ripIndex];
        const rpSim = enc.beginRenderPass(simPass);
        rpSim.setPipeline(pipes.sim);
        rpSim.setBindGroup(0, simBG[ripIndex]);
        rpSim.draw(3);
        rpSim.end();
        ripIndex = 1 - ripIndex;
      }
      const geoNow = bgGeoSet[ripIndex];
      {
        // The whole sky at once the first time. After the sun or the weather moves it is
        // replaced a quarter at a time, then each bake is blended into the last so the
        // march's sampling noise averages away. After that, one strip a frame.
        // A slow change, the clock or a cloud bank building, is followed a strip at a time.
        const key = wp.sunAng * 7 + env.hour * 2 + env.cover * 3 + env.haze;
        let strips = 8;
        if (skyFor === null) strips = SKY_STRIPS;
        if (skyFor === null || Math.abs(key - skyFor) > 0.03) { skyFresh = SKY_STRIPS; skySettle = 24; }
        skyFor = key;
        const fresh = skyFresh > 0;
        if (fresh) skyFresh -= strips;
        else if (skySettle > 0) skySettle--;
        else strips = 1;
        const bp = enc.beginRenderPass(skyPass);
        bp.setPipeline(pipes.skyBake); bp.setBindGroup(0, bgUB);
        // Once settled, each bake counts for less, so the sub-texel jitter averages over more of them.
        const mixK = fresh ? 1 : skySettle > 0 ? 0.3 : 0.12;
        bp.setBlendConstant([mixK, mixK, mixK, mixK]);
        const sw = SKYW / SKY_STRIPS;
        for (let k = 0; k < strips; k++) {
          bp.setScissorRect(skyStrip * sw, 0, sw, SKYH);
          bp.draw(3);
          skyStrip = (skyStrip + 1) % SKY_STRIPS;
        }
        bp.end();
      }
      // The island's shadow map is redrawn when the light has moved half a degree.
      if (!shadowFor || uf[52] * shadowFor[0] + uf[53] * shadowFor[1] + uf[54] * shadowFor[2] < 0.99996) {
        shadowFor = [uf[52], uf[53], uf[54]];
        const spass = enc.beginRenderPass(shadowPass);
        spass.setPipeline(pipes.shadowTerrain); spass.setBindGroup(0, bgUB);
        spass.setVertexBuffer(0, terrainVB); spass.setIndexBuffer(terrainIB, 'uint32');
        spass.drawIndexed(terrain.idx.length);
        drawMeshes(spass, pipes.shadowMesh, bgUB, instFarB, farDraws);
        spass.end();
      }
      {
        const np = enc.beginRenderPass(nearPass);
        np.setPipeline(pipes.shadowTerrain); np.setBindGroup(0, bgUBN);
        np.setVertexBuffer(0, terrainVB); np.setIndexBuffer(terrainIB, 'uint32');
        np.drawIndexed(terrain.idx.length);
        drawMeshes(np, pipes.shadowMesh, bgUBN, instB, nearDraws);
        if (fishDraws.length) drawMeshes2(np, pipes.shadowFish, bgUBN, fishVB, fishIB, fishInstB, fishDraws);
        if (bugDraws.length) drawMeshes2(np, pipes.shadowBug, bgUBN, bugVB, bugIB, bugInstB, bugDraws);
        np.end();
      }
      if (uf[86] > 0.5) {
        reflPass.colorAttachments[0].view = reflTex.createView();
        reflPass.depthStencilAttachment.view = reflDepth.createView();
        const rp = enc.beginRenderPass(reflPass);
        drawWorld(rp, bgUBR, bgGeoR, false, reflDraws);
        rp.end();
      }
      scenePass.colorAttachments[0].view = sceneTex.createView();
      scenePass.depthStencilAttachment.view = sceneDepth.createView();
      const sp = enc.beginRenderPass(scenePass);
      drawWorld(sp, bgUB, geoNow, true, mainDraws);
      sp.end();
      {
        const ap = enc.beginRenderPass(airPass);
        ap.setPipeline(pipes.air); ap.setBindGroup(0, geoNow); ap.setBindGroup(1, bgAir);
        ap.draw(3);
        ap.end();
      }

      const drawSwap = (colorView, depthView) => {
        swapPass.colorAttachments[0].view = colorView;
        swapPass.depthStencilAttachment.view = depthView;
        const pass = enc.beginRenderPass(swapPass);
        pass.setPipeline(pipes.blit); pass.setBindGroup(0, bgBlit); pass.draw(3);
        pass.setPipeline(pipes.water); pass.setBindGroup(0, geoNow); pass.setBindGroup(1, bgWater);
        pass.setVertexBuffer(0, waterVB); pass.setIndexBuffer(waterIB, 'uint32');
        pass.drawIndexed(water.idx.length);
        pass.setPipeline(pipes.shore);
        pass.setVertexBuffer(0, shoreVB); pass.setIndexBuffer(shoreIB, 'uint32');
        pass.drawIndexed(shoreMesh.idx.length);
        if (bugDraws.length) drawMeshes2(pass, pipes.bug, geoNow, bugVB, bugIB, bugInstB, bugDraws);
        if (!under) {
          // Spray always, where waves break; rain and its splashes by how hard it is falling;
          // motes by how much the damp air and the low sun have to show.
          pass.setPipeline(pipes.drops); pass.setBindGroup(0, geoNow); pass.setBindGroup(1, bgAir);
          pass.draw(6, 2304, 0, 60000);
          const rain = Math.round(env.v[1] * q.drops);
          if (rain > 20) { pass.draw(6, rain, 0, 0); pass.draw(6, rain >> 2, 0, 20000); }
          const motes = Math.round(q.drops * 0.2 * Math.min(1, env.humid + env.mist) * (1 - env.night));
          if (motes > 20) pass.draw(6, motes, 0, 40000);
        }
        pass.end();
      };
      if (READ && readTex) drawSwap(readTex.createView(), readDepth.createView());
      if (!(READ && frames === 16)) drawSwap(context.getCurrentTexture().createView(), swapDepth.createView());
      let doRead = false;
      if (READ && readTex && frames === 16) {
        enc.copyTextureToBuffer(
          { texture: readTex },
          { buffer: readBuf, bytesPerRow: readBpr, rowsPerImage: viewH },
          { width: viewW, height: viewH }
        );
        doRead = true;
        window.__stage = 'copy';
      }
      device.queue.submit([enc.finish()]);
      if (doRead) {
        const wCap = viewW, hCap = viewH, bprCap = readBpr, fmtCap = format, buf = readBuf;
        device.queue.onSubmittedWorkDone().then(() => buf.mapAsync(GPUMapMode.READ)).then(() => {
          const data = new Uint8Array(buf.getMappedRange());
          const img = new Uint8ClampedArray(wCap * hCap * 4);
          const bgra = fmtCap === 'bgra8unorm';
          for (let y = 0; y < hCap; y++) {
            for (let x = 0; x < wCap; x++) {
              const s = y * bprCap + x * 4, d = (y * wCap + x) * 4;
              img[d] = data[bgra ? s + 2 : s];
              img[d + 1] = data[s + 1];
              img[d + 2] = data[bgra ? s : s + 2];
              img[d + 3] = 255;
            }
          }
          buf.unmap();
          const c2 = document.createElement('canvas');
          c2.width = wCap; c2.height = hCap;
          c2.getContext('2d').putImageData(new ImageData(img, wCap, hCap), 0, 0);
          window.__png = c2.toDataURL('image/png');
          requestAnimationFrame(frame);
        }).catch((err) => { window.__gpuerr = String(err); console.error('READ', err); });
        return;
      }

      if (!statsEl.hidden && ftN) {
        let sum = 0; for (let i = 0; i < ftN; i++) sum += ft[i];
        const fps = (ftN / sum).toFixed(0);
        statsEl.textContent = fps + ' fps  ·  ' + q.name + '  ·  ' + viewW + '×' + viewH;
      }
      if (score) score.setAudible(mode > 0 && musicOn && !muted, musicVol);
      if (audio && mode > 0) {
        const alt = Math.max(camY, 0);
        const shore = Math.exp(-Math.abs(camY) * 0.08) * (0.35 + 0.65 * fieldDamp(world, camX, camZ));
        const land = fieldSample(world, camX, camZ);
        const nearBreak = Math.exp(-Math.max(land, 0) * 0.35) * (land < 3 ? 1 : 0.35);
        audio.shoreAmt = nearBreak;
        audio.surf.gain.value = (muted ? 0 : 0.16) * shore * (under ? 0.25 : 1);
        audio.hiss.gain.value = (muted ? 0 : 0.045) * nearBreak * (under ? 0.1 : 1);
        // The same gust that is bending the plants here, by ear.
        const gust = env.speed * (0.4 + 1.4 * vnoise((camX - env.gustOff[0]) * 0.018, (camZ - env.gustOff[1]) * 0.018) * env.v[5]);
        const sy = env.sun[1], dark = smooth01(0.1, -0.08, sy);
        audio.wind.gain.value = (muted ? 0 : 0.05) * (0.3 + Math.min(alt, 80) / 80) * (under ? 0.05 : 1) * (land > 8 ? 1.3 : 0.8) * (0.35 + 0.65 * gust * gust / 20);
        audio.insects.gain.value = (muted ? 0 : 0.02) * Math.max(0, Math.min(1, (land - 0.8) / 5)) * (under ? 0 : 1) * (1 - 0.7 * dark) * (1 - Math.min(1, env.v[1] * 2));
        audio.air({
          heat: smooth01(0.15, 0.6, sy) * (1 - 0.7 * env.cover), dark: dark, low: smooth01(0.4, 0.1, sy) * (1 - dark),
          dawn: smooth01(5, 6, env.hour) * (1 - smooth01(7.5, 9, env.hour)), rain: env.v[1], gust: gust,
          wood: land > 1.2 ? Math.max(0, Math.min(1, forestMask(camX, camZ, land, fieldSlope(world, camX, camZ)) * 1.5)) : 0,
          alt: camY - Math.max(land, 0) - 1.7, under: under, heard: bugLife.heard
        });
        audio.under.frequency.value = under ? 380 : 16000;
      }
      if (showHint > 0) {
        showHint -= dt;
        hintEl.classList.add('show');
        if (showHint <= 0) hintEl.classList.remove('show');
      }
      if (capTimer > 0) {
        capTimer -= dt;
        if (capTimer <= 0) { const cap = $('caption'); if (cap) cap.classList.remove('show'); }
      }
      window.__frames = frames;
      requestAnimationFrame(frame);
    }

    bootKeys();
    bindStudio();
    goEl.addEventListener('click', () => {
      if (!audio) { audio = makeAudio(); if (audio) audio.ac.resume(); }
      document.body.classList.add('playing', 'studio');
      orbit = true;
      mode = 2;
      enterPlace('lagoon', false);
      showHint = 7;
      $('hint').textContent = 'Drag to look · click the water · Places to travel';
    });
    menuBtn.addEventListener('click', () => {
      if (mode === 0) {
        goEl.click();
      } else openMenu();
    });

    if (qstr.has('shot')) {
      const idx = Math.max(0, Math.min(6, parseInt(qstr.get('shot'), 10) || 1));
      // shot=0 keeps the orbit but hides the menu; 1..6 are places
      document.body.classList.add('playing');
      if (qstr.get('shot') !== '0') {
        goSpot(idx - 1);
        if (qstr.get('shot') === '3') fly = true;
        // Framing offsets for captures: turn, tilt, step forward or sideways, rise.
        const num = (k) => parseFloat(qstr.get(k) || '0') || 0;
        yaw += num('dyaw'); pitch += num('dpitch');
        sunView = num('sunview'); sunTurn = num('dyaw');
        camX += Math.sin(yaw) * num('fwd') + Math.cos(yaw) * num('side');
        camZ += -Math.cos(yaw) * num('fwd') + Math.sin(yaw) * num('side');
        if (qstr.has('up')) { fly = true; camY += num('up'); }
        birdNear = num('bird');
        // fish=<species> frames one fish (fd under 1.6 m) or its school; calm stops them minding the camera;
        // warm runs the animals for that many seconds first.
        fishLife.calm = qstr.has('calm');
        if (qstr.has('fish')) {
          const fs = fishLife.find(parseInt(qstr.get('fish'), 10) || 0, parseInt(qstr.get('nth') || '0', 10));
          if (fs) {
            fly = true;
            fishCam = { s: fs, i: parseInt(qstr.get('fi') || '0', 10), d: num('fd') || 0.5, turn: num('turn'), up: num('fup'), tilt: num('tilt'), a: null };
            camX = fs.cx; camY = fs.cy; camZ = fs.cz;
          }
        }
        for (let k = 0; k < num('warm') * 20; k++) fishLife.update(0.05, time + k * 0.05, camX, camY, camZ);
        // shade=<height> stands the camera in the shadow of the nearest palm's crown, taken
        // to be that many metres up, so the light has to come through the fronds.
        if (qstr.has('shade')) {
          envStep(0, time, wp.mood[1], wp.mood[2], wp.dir, wp.amp);
          // The nearest palm whose shadow falls on dry land: a low sun throws it a long way.
          const D = scatter.data, az = Math.atan2(env.key[2], env.key[0]) + wp.sunAng, hl = Math.hypot(env.key[0], env.key[2]) / Math.max(env.key[1], 0.05);
          let bd = 1e9, bx = camX, bz = camZ;
          for (let i = 0; i < scatter.n; i++) if (palmIds.includes(scatter.kind[i])) {
            const o = i * ISTRIDE, t = ((num('shade') || 8.5) * D[o + 4] - 1.6) * hl, x = D[o] - Math.cos(az) * t, z = D[o + 2] - Math.sin(az) * t, d = Math.hypot(D[o] - camX, D[o + 2] - camZ);
            if (d < bd && fieldSample(world, x, z) > 0.6) { bd = d; bx = x; bz = z; }
          }
          camX = bx; camZ = bz; camY = fieldSample(world, camX, camZ) + 1.6;
          fly = true;
        }
        // bug=<kind> frames the nearest one from bd metres, in state bst if given; bwarm runs
        // the insects for that many seconds first so they are in the middle of something.
        if (qstr.has('bug')) {
          envStep(0, time, wp.mood[1], wp.mood[2], wp.dir, wp.amp);
          bugLife.calm = true;
          // bat=<n> first walks the camera to the n-th place that kind lives.
          const hab = bugLife.sites[(BUGS.find((b) => b.id === qstr.get('bug')) || BUGS[0]).site];
          if (qstr.has('bat') && hab.length) { const k = ((num('bat') * 37) % (hab.length / 5) | 0) * 5; camX = hab[k] + 1.5; camZ = hab[k + 2] + 1.5; camY = Math.max(fieldSample(world, camX, camZ), 0) + 1.6; }
          for (let k = 0; k < (num('bwarm') || 8) * 30; k++) bugLife.update(1 / 30, time + k / 30, camX, camY, camZ);
          const st = qstr.has('bst') ? num('bst') : null;
          bugCam = { a: bugLife.find(qstr.get('bug'), st) || bugLife.find(qstr.get('bug'), null), d: num('bd') || 0.3, turn: num('turn'), up: num('fup'), tilt: num('tilt') };
          if (bugCam.a) { fly = true; if (qstr.has('hold')) { bugCam.a.t = 1e3; bugCam.a.pin = true; } }
          console.log('DBG bug ' + JSON.stringify(bugLife.lvl) + ' sites ' + Object.keys(bugLife.sites).map((k) => k + ':' + bugLife.sites[k].length / 5).join(' ') + ' found ' + (bugCam.a ? [bugCam.a.x, bugCam.a.y, bugCam.a.z, bugCam.a.st].join(',') : 'none'));
        }
      }
      barEl.parentElement.hidden = true;
      statusEl.textContent = '';
    } else if (qstr.has('studio')) {
      document.body.classList.add('playing', 'studio');
      orbit = true;
      enterPlace(qstr.get('preset') || 'lagoon', false);
      mode = 2;
      barEl.parentElement.hidden = true;
      statusEl.textContent = '';
      if (qstr.has('read')) pendingSplat = { x: targetX, z: targetZ, s: 0.5, r: 1.8 };
    }

    function encodeOcean(enc, t) {
      for (let ci = 0; ci < cascades.length; ci++) {
        const c = cascades[ci];
        oceanU[0] = t;
        oceanU[1] = c.size;
        device.queue.writeBuffer(c.ub, 0, oceanU);
        const steps = ['evolve', 'rows', 'cols', 'slopes'];
        for (let s = 0; s < steps.length; s++) {
          const cp = enc.beginComputePass();
          cp.setPipeline(oceanPipes[steps[s]]);
          cp.setBindGroup(0, c.bg);
          if (s === 1 || s === 2) cp.dispatchWorkgroups(OCEAN_N);
          else cp.dispatchWorkgroups(OCEAN_N / 16, OCEAN_N / 16);
          cp.end();
        }
      }
    }
    {
      const seedEnc = device.createCommandEncoder();
      shoreSim.seed(seedEnc);
      device.queue.submit([seedEnc.finish()]);
    }

    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    fail((err && err.stack) || String(err));
  }
}

main();
