const PRESETS = {
  low:  { name: 'low',  hres: 384, span: 560, terrain: 240, textent: 460, water: 200, grass: 900,  weed: 0,   palms: 48,  broad: 36,  rocks: 40, stacks: 6,  birds: 5,  shadow: 4, clouds: 3, refl: 1, scale: 0.72, dpr: 1,    maxPx: 900000 },
  med:  { name: 'med',  hres: 512, span: 560, terrain: 210, textent: 500, water: 248, grass: 2800, weed: 420, palms: 100, broad: 80,  rocks: 70, stacks: 9,  birds: 8,  shadow: 6, clouds: 3, refl: 1, scale: 0.9,  dpr: 1.25, maxPx: 1900000 },
  high: { name: 'high', hres: 640, span: 560, terrain: 300, textent: 530, water: 288, grass: 5600, weed: 800, palms: 160, broad: 130, rocks: 100, stacks: 12, birds: 12, shadow: 10, clouds: 4, refl: 1, scale: 1,   dpr: 1.5,  maxPx: 3400000 }
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

function Mesh() { this.pos = []; this.nrm = []; this.col = []; this.sway = []; this.idx = []; }
Mesh.prototype.v = function (x, y, z, nx, ny, nz, r, g, b, s) {
  const i = this.pos.length / 3;
  this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.col.push(r, g, b); this.sway.push(s || 0);
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
    return m.v(x, y, z, dirx * 0.2 + sx * side * 0.15, 0.92, dirz * 0.2 + sz * side * 0.15, c[0], c[1], c[2], sway * (0.2 + t * t * 1.15));
  };
  const bL = vert(0.0, 1), bR = vert(0.0, -1);
  const mL = vert(0.42, 1), mR = vert(0.42, -1);
  const tip = vert(1, 0);
  m.tri(bL, mL, bR); m.tri(bR, mL, mR);
  m.tri(mL, tip, mR);
}

function makePalm(seed) {
  const rnd = seeded(seed || 1);
  const m = new Mesh();
  const sides = 8, seg = 16;
  const height = 0.94 + rnd() * 0.18;
  const bend = (rnd() - 0.32) * 0.5;
  const bendZ = (rnd() - 0.5) * 0.26;
  const twist = rnd() * 6.28;
  const rings = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = height * (t * 0.9 + t * t * 0.1);
    const ox = Math.sin(t * 2.2) * bend * t;
    const oz = bendZ * t * t;
    const flare = t < 0.08 ? 1.65 - t * 6 : 1;
    const collar = (t > 0.58 && (i & 1)) ? 1.2 : 1;
    const r = (0.072 * (1 - t * 0.52) + 0.018) * flare * collar;
    const scar = collar > 1 ? 0.7 : 1;
    const row = [];
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2 + twist + t * 0.35;
      const nx = Math.cos(a), nz = Math.sin(a);
      const rib = 1 + 0.045 * Math.sin(k * 2.0 + i * 0.6);
      const streak = 0.76 + 0.24 * (0.5 + 0.5 * Math.sin(k * 1.7 + seed));
      const bark = 0.36 * scar * streak;
      row.push(m.v(ox + nx * r * rib, y, oz + nz * r * rib, nx, 0.14, nz, bark, bark * 0.7, bark * 0.4, t * t * 0.045));
    }
    rings.push(row);
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
      m.tri(a, c, b); m.tri(b, c, d);
    }
  }
  const crownX = Math.sin(2.2) * bend, crownY = height, crownZ = bendZ;
  const gap = rnd() * Math.PI * 2;
  function frond(ang, len, lift, droop, leaf, green, sway0, dead) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const sx = -dz, sz = dx;
    const steps = dead ? 7 : 12;
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const arch = Math.sin(t * Math.PI * lift) * (0.22 + len * 0.12) - t * t * droop;
      pts.push([crownX + dx * t * len, crownY + arch, crownZ + dz * t * len, t]);
    }
    const rach = dead ? [0.4, 0.3, 0.14] : [0.22, 0.28, 0.1];
    for (let s = 0; s < steps; s++) {
      const a = pts[s], b = pts[s + 1];
      const w = 0.01 * (1 - a[3] * 0.55);
      const sway = sway0 * (0.06 + a[3] * a[3]);
      const aL = m.v(a[0] + sx * w, a[1], a[2] + sz * w, dx, 0.7, dz, rach[0], rach[1], rach[2], sway);
      const aR = m.v(a[0] - sx * w, a[1], a[2] - sz * w, dx, 0.7, dz, rach[0] * 0.8, rach[1] * 0.85, rach[2], sway);
      const bL = m.v(b[0] + sx * w, b[1], b[2] + sz * w, dx, 0.7, dz, rach[0], rach[1], rach[2], sway + 0.04);
      const bR = m.v(b[0] - sx * w, b[1], b[2] - sz * w, dx, 0.7, dz, rach[0] * 0.8, rach[1] * 0.85, rach[2], sway + 0.04);
      m.tri(aL, bL, aR); m.tri(aR, bL, bR);
    }
    for (let s = 1; s < steps; s++) {
      const p = pts[s];
      const bell = Math.sin(Math.min(p[3] * 1.05, 1) * Math.PI);
      const ll = leaf * (0.22 + bell * 0.9) * (dead ? 0.45 : 1);
      if (ll < 0.02) continue;
      for (let side = -1; side <= 1; side += 2) {
        const bias = side < 0 ? 0.78 + rnd() * 0.2 : 0.95 + rnd() * 0.12;
        const spread = 0.78 + p[3] * 0.2;
        const dirx = dx * (0.18 - p[3] * 0.08) + sx * side * spread;
        const dirz = dz * (0.18 - p[3] * 0.08) + sz * side * spread;
        const diry = 0.06 - droop * (0.2 + p[3] * 0.7);
        const tone = dead
          ? [0.38 + rnd() * 0.08, 0.28, 0.12]
          : [green[0] * (0.72 + rnd() * 0.4), green[1] * (0.78 + rnd() * 0.28), green[2] * (0.65 + rnd() * 0.4)];
        addLeaflet(m, p[0], p[1], p[2], dirx, diry, dirz, ll * bias, (dead ? 0.02 : 0.028) + bell * 0.016, tone, sway0 * (0.4 + p[3]));
      }
    }
  }
  const living = 9 + (seed % 4);
  for (let f = 0; f < living; f++) {
    const ang = f * 2.399963 + rnd() * 0.12;
    const around = Math.abs(Math.atan2(Math.sin(ang - gap), Math.cos(ang - gap)));
    if (around < 0.42 && rnd() < 0.75) continue;
    const age = rnd();
    frond(ang, 0.82 + rnd() * 0.26, 0.5 + rnd() * 0.22, 0.28 + age * 0.38, 0.24 + rnd() * 0.07, [0.09, 0.36, 0.07], 0.32 + rnd() * 0.22, false);
  }
  frond(rnd() * 6.28, 0.26, 1.2, 0.02, 0.11, [0.2, 0.48, 0.13], 0.1, false);
  frond(gap, 0.48, 0.15, 0.8, 0.09, [0.4, 0.3, 0.14], 0.18, true);
  return m;
}

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

function makeRock(seed) {
  const m = icosphere(2, 1, [0.42, 0.40, 0.36]);
  const n = m.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
    const nx = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz = m.nrm[i * 3 + 2];
    const rough = vnoise(x * 2.4 + seed, z * 2.4) * 0.22 + vnoise(x * 6.5, y * 6.5 + seed) * 0.08;
    const crevice = vnoise(x * 1.3 + 4.0, z * 1.3) > 0.72 ? -0.08 : 0;
    m.pos[i * 3] = x + nx * (rough + crevice);
    m.pos[i * 3 + 1] = (y + ny * rough) * (y < 0 ? 0.45 : 0.72);
    m.pos[i * 3 + 2] = z + nz * (rough + crevice);
    const lichen = ny > 0.45 ? vnoise(x * 3.0, z * 3.0) : 0;
    const shade = 0.72 + rough * 1.4;
    m.col[i * 3] = (0.40 * shade) * (1 - lichen * 0.35);
    m.col[i * 3 + 1] = (0.38 * shade) * (1 - lichen * 0.1) + lichen * 0.08;
    m.col[i * 3 + 2] = 0.34 * shade * (1 - lichen * 0.2);
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
  const nose = add(0, 0.012, 0.32, 0);
  const head = add(0, 0.05, 0.2, 0);
  const back = add(0, 0.04, -0.04, 0);
  const belly = add(0, -0.032, 0.04, 0);
  const tail = add(0, 0.005, -0.36, 0);
  const tailL = add(-0.055, 0.0, -0.28, 0);
  const tailR = add(0.055, 0.0, -0.28, 0);
  const beak = add(0, 0.02, 0.44, 0);
  idx.push(nose, head, belly, head, back, belly, back, tail, belly, tailL, tail, back, tailR, back, tail, nose, beak, head);
  const li0 = add(-0.04, 0.03, 0.08, -1), li1 = add(-0.3, 0.02, 0.1, -1), li2 = add(-0.26, 0.012, -0.05, -1), li3 = add(-0.04, 0.02, -0.05, -1);
  idx.push(li0, li1, li2, li0, li2, li3);
  const lo0 = add(-0.26, 0.02, 0.07, -2), lo1 = add(-0.58, 0.0, 0.03, -2), lo2 = add(-0.52, 0.0, -0.07, -2), lo3 = add(-0.24, 0.012, -0.04, -2);
  idx.push(lo0, lo1, lo2, lo0, lo2, lo3);
  const ri0 = add(0.04, 0.03, 0.08, 1), ri1 = add(0.3, 0.02, 0.1, 1), ri2 = add(0.26, 0.012, -0.05, 1), ri3 = add(0.04, 0.02, -0.05, 1);
  idx.push(ri0, ri2, ri1, ri0, ri3, ri2);
  const ro0 = add(0.26, 0.02, 0.07, 2), ro1 = add(0.58, 0.0, 0.03, 2), ro2 = add(0.52, 0.0, -0.07, 2), ro3 = add(0.24, 0.012, -0.04, 2);
  idx.push(ro0, ro2, ro1, ro0, ro3, ro2);
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
function packMesh(mesh) {
  const n = mesh.pos.length / 3;
  const o = new Float32Array(n * 10);
  for (let i = 0; i < n; i++) {
    const o10 = i * 10;
    o[o10] = mesh.pos[i * 3]; o[o10 + 1] = mesh.pos[i * 3 + 1]; o[o10 + 2] = mesh.pos[i * 3 + 2];
    o[o10 + 3] = mesh.nrm[i * 3]; o[o10 + 4] = mesh.nrm[i * 3 + 1]; o[o10 + 5] = mesh.nrm[i * 3 + 2];
    o[o10 + 6] = mesh.col[i * 3]; o[o10 + 7] = mesh.col[i * 3 + 1]; o[o10 + 8] = mesh.col[i * 3 + 2];
    o[o10 + 9] = mesh.sway[i];
  }
  return { vert: o, idx: new Uint32Array(mesh.idx) };
}

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
    let As = w[2] * wp.amp * damp * (1 + feel * 0.85);
    if (i < 2) As *= 0.3 + 0.7 * (1 - smooth01(2, 8, D));
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
    shoreAmt: 0.4, alive: true
  };
  function chirp(kind) {
    if (!api.alive || muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const p = ac.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    const f0 = kind === 1 ? 700 + Math.random() * 400 : 1600 + Math.random() * 1600;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(180, f0 * (0.55 + Math.random() * 0.8)), t + 0.09 + Math.random() * 0.08);
    const peak = kind === 1 ? 0.03 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + Math.random() * 0.22);
    o.connect(g); g.connect(p); p.connect(master);
    o.start(t); o.stop(t + 0.55);
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
    const kind = Math.random() < 0.3 ? 1 : 0;
    chirp(kind);
    if (Math.random() < 0.4) setTimeout(() => chirp(kind), 160 + Math.random() * 420);
  }, 2.2, 8.5);
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
    const canvas = $('c');
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();

    setStatus('Sculpting the coast', 0.1);
    world = await buildWorldAsync(q.hres, q.span, (t) => setStatus('Sculpting the coast', 0.1 + t * 0.45));

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
      // Off the sun, so the wash reads along the beach instead of through the glare.
      byaw = Math.atan2(shore.fx, -shore.fz) + 0.72;
      const back = 2.4;
      standX = shore.x - shore.fx * back;
      standZ = shore.z - shore.fz * back;
      const standH = fieldSample(world, standX, standZ);
      eye = Math.max(standH, 0.05) + 1.62;
      pitchBeach = -0.26;
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

    const staticMesh = new Mesh();
    const rock = makeRock(4);
    const stackRock = makeRock(11);
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
      appendMesh(staticMesh, makePalm((x * 13 + z * 7) | 0), x, h, z, rnd() * 6.28, 7.4 + rnd() * 2.8, tint, 0.88 + rnd() * 0.28);
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
        appendMesh(staticMesh, makePalm((x * 19.1 + z * 3.7) | 0), x, h, z, rnd() * 6.28, 6.6 + rnd() * 3.4, tint, 0.86 + rnd() * 0.3);
        palms++;
      } else if (shrubs < shrubBudget && h > 0.35 && h < 2.4 && s < 0.36 && clump > 0.36) {
        appendMesh(staticMesh, makeShrub((x * 5 + z) | 0), x, h, z, rnd() * 6.28, 1.8 + rnd() * 1.5, tint, 0.7 + rnd() * 0.5);
        shrubs++;
      } else if (canopies < canopyBudget && h > 7 && h < 24 && s < 0.3 && clump > 0.5) {
        appendMesh(staticMesh, makeCanopy((x * 4.1 + z * 2.2) | 0), x, h, z, rnd() * 6.28, 5.2 + rnd() * 2.4, tint, 0.9 + rnd() * 0.25);
        canopies++;
      } else if (ferns < fernBudget && h > 1.4 && h < 12 && s < 0.34 && clump > 0.58) {
        appendMesh(staticMesh, makeFern((x * 6.3 + z) | 0), x, h, z, rnd() * 6.28, 1.3 + rnd() * 0.9, tint, 0.6 + rnd() * 0.4);
        ferns++;
      } else if (broads < q.broad && h > 3.2 && h < 18 && s < 0.38 && clump > 0.46) {
        appendMesh(staticMesh, makeBroad((x * 8.2 + z * 4.4) | 0), x, h, z, rnd() * 6.28, 5.8 + rnd() * 2.8, tint, 0.85 + rnd() * 0.3);
        broads++;
      }
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
      appendMesh(staticMesh, makeRock((x * 3 + z) | 0), x, h - sc * 0.28, z, rnd() * 6, sc, [0.8 + rnd() * 0.25, 0.75 + rnd() * 0.2, 0.68 + rnd() * 0.18], 0.45 + rnd() * 0.55);
      rocks++;
    }
    for (let i = 0; i < q.stacks * 30 && stacks < q.stacks; i++) {
      const x = -40 - rnd() * 160;
      const z = (rnd() - 0.5) * 220;
      const h = fieldSample(world, x, z);
      if (h < -6 || h > -0.4) continue;
      const sc = 2.2 + rnd() * 4.2;
      appendMesh(staticMesh, stackRock, x, h - sc * 0.2, z, rnd() * 6, sc, [0.62, 0.58, 0.52], 1.15 + rnd() * 0.9);
      stacks++;
    }
    // Skiff and a buoy, so the beach and the bay have a scale.
    const skiff = makeSkiff();
    appendMesh(staticMesh, skiff, beach.x + 3.5, beach.h, beach.z + 1.2, byaw + Math.PI * 0.5, 1.15, null, 1);
    const buoy = icosphere(1, 0.28, [0.75, 0.08, 0.06]);
    appendMesh(staticMesh, buoy, lagoon.x + 16, 0.12, lagoon.z + 4, 0, 1, null, 1.15);

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

    setStatus('Tuning the swell', 0.78);
    await new Promise((r) => setTimeout(r, 0));

    const code = shaderCode(q.hres, q.span);
    const mod = device.createShaderModule({ code: code });
    const blitMod = device.createShaderModule({ code: blitShaderCode() });
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    const oceanMod = device.createShaderModule({ code: OCEAN_WGSL });
    const info = await mod.getCompilationInfo();
    const binfo = await blitMod.getCompilationInfo();
    const sinfo = await simMod.getCompilationInfo();
    const oinfo = await oceanMod.getCompilationInfo();
    const errs = info.messages.concat(binfo.messages, sinfo.messages, oinfo.messages).filter((m) => m.type === 'error');
    if (errs.length) {
      fail(errs.map((e) => e.lineNum + ':' + e.linePos + '  ' + e.message).join('\n'));
      return;
    }

    const uf = new Float32Array(176);
    const ur = new Float32Array(176);
    for (let i = 0; i < 8; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      uf[88 + i * 4] = w[0] / L; uf[89 + i * 4] = w[1] / L; uf[90 + i * 4] = w[2]; uf[91 + i * 4] = w[3];
      uf[120 + i] = w[4];
    }
    ur.set(uf);

    const ubuf = device.createBuffer({ size: 704, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const rbuf = device.createBuffer({ size: 704, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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

    const VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    const ubLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } }]
    });
    const geoLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 1, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: FS, texture: { sampleType: 'depth' } },
        { binding: 4, visibility: FS, sampler: { type: 'comparison' } },
        { binding: 5, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 6, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 7, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } }
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
        { binding: 6, visibility: FS, texture: { sampleType: 'unfilterable-float' } }
      ]
    });
    const blitLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
        { binding: 1, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: FS, texture: { sampleType: 'depth' } }
      ]
    });
    const geoPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout] });
    const skyPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout] });
    const waterPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, waterLayout] });
    const blitPL = device.createPipelineLayout({ bindGroupLayouts: [blitLayout] });

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
    const packed = packMesh(staticMesh);
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
    const grassVB = upload(grassVert, GPUBufferUsage.VERTEX);
    const grassIB = upload(g.idx, GPUBufferUsage.INDEX);
    const grassInstB = upload(grassInst, GPUBufferUsage.VERTEX);
    const birdVB = upload(birdVert, GPUBufferUsage.VERTEX);
    const birdIB = upload(bgeom.idx, GPUBufferUsage.INDEX);
    const birdInstB = device.createBuffer({ size: Math.max(16, birdData.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    const depthOn = (fmt, write, cmp) => ({ format: fmt, depthWriteEnabled: write, depthCompare: cmp });
    async function pipe(desc) { return device.createRenderPipelineAsync(desc); }
    setStatus('Warming the light', 0.9);
    const sceneFmt = 'rgba16float';
    const pipes = {};
    const skyDesc = {
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsSky' },
      fragment: { module: mod, entryPoint: 'fsSky', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthOn('depth32float', true, 'always')
    };
    pipes.sky = await pipe(skyDesc);
    pipes.terrain = await pipe({
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsTerrain', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      fragment: { module: mod, entryPoint: 'fsTerrain', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    pipes.mesh = await pipe({
      layout: geoPL,
      vertex: { module: mod, entryPoint: 'vsMesh', buffers: [{ arrayStride: 40, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
        { shaderLocation: 3, offset: 36, format: 'float32' }
      ] }] },
      fragment: { module: mod, entryPoint: 'fsMesh', targets: [{ format: sceneFmt }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth32float', true, 'less')
    });
    const shadowBias = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2, depthBiasClamp: 0 };
    pipes.shadowTerrain = await pipe({
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowTerrain', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: shadowBias
    });
    pipes.shadowMesh = await pipe({
      layout: skyPL,
      vertex: { module: mod, entryPoint: 'vsShadowMesh', buffers: [{ arrayStride: 40, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
        { shaderLocation: 3, offset: 36, format: 'float32' }
      ] }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: shadowBias
    });
    pipes.grass = await pipe({
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
    pipes.bird = await pipe({
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
    pipes.water = await pipe({
      layout: waterPL,
      vertex: { module: mod, entryPoint: 'vsWater', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: mod, entryPoint: 'fsWater', targets: [{ format: format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOn('depth24plus', false, 'less')
    });
    pipes.shore = await pipe({
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
    pipes.blit = await pipe({
      layout: blitPL,
      vertex: { module: blitMod, entryPoint: 'vsBlit' },
      fragment: { module: blitMod, entryPoint: 'fsBlit', targets: [{ format: format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthOn('depth24plus', true, 'always')
    });
    const simPL = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
    const simPipe = await pipe({
      layout: simPL,
      vertex: { module: simMod, entryPoint: 'vs' },
      fragment: { module: simMod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' }
    });

    const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const shadowSamp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const shadowTex = device.createTexture({
      size: [2048, 2048],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    const shadowView = shadowTex.createView();
    const oceanLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } }
      ]
    });
    const oceanPL = device.createPipelineLayout({ bindGroupLayouts: [oceanLayout] });
    const oceanEntry = (name) => device.createComputePipelineAsync({
      layout: oceanPL, compute: { module: oceanMod, entryPoint: name }
    });
    const oceanPipes = {
      evolve: await oceanEntry('evolve'),
      rows: await oceanEntry('ifft_rows'),
      cols: await oceanEntry('ifft_cols'),
      slopes: await oceanEntry('slopes')
    };
    const shapeH0 = makeOceanH0(OCEAN_N, 220, [9.0, 0.6], 0.0006, [5, 80], 0.4, 0, 11);
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
    const shoreSim = await createShore(
      device, world,
      shore || { x: -150, z: 6, fx: -1, fz: 0 },
      cascades[0].view
    );
    const shadowPass = {
      colorAttachments: [],
      depthStencilAttachment: { view: shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    };
    let sceneTex = null, sceneDepth = null, swapDepth = null, reflTex = null, reflDepth = null;
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
      destroyTex(sceneTex); destroyTex(sceneDepth); destroyTex(swapDepth); destroyTex(reflTex); destroyTex(reflDepth);
      sceneTex = device.createTexture({ size: [w, h], format: sceneFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      sceneDepth = device.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      swapDepth = device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const rw = Math.max(2, w >> 1), rh = Math.max(2, h >> 1);
      reflTex = device.createTexture({ size: [rw, rh], format: sceneFmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      reflDepth = device.createTexture({ size: [rw, rh], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });
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
      const sv = sceneTex.createView(), sd = sceneDepth.createView(), rv = reflTex.createView();
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
          { binding: 7, resource: shoreSim.wetView }
        ]
      });
      bgGeoSet = [geoGroup(ubuf, ripViews[0]), geoGroup(ubuf, ripViews[1])];
      bgGeoR = geoGroup(rbuf, ripViews[0]);
      bgUB = device.createBindGroup({ layout: ubLayout, entries: [{ binding: 0, resource: { buffer: ubuf } }] });
      bgUBR = device.createBindGroup({ layout: ubLayout, entries: [{ binding: 0, resource: { buffer: rbuf } }] });
      bgBlit = device.createBindGroup({ layout: blitLayout, entries: [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: sv },
        { binding: 2, resource: sd }
      ] });
      bgWater = device.createBindGroup({ layout: waterLayout, entries: [
        { binding: 0, resource: sv },
        { binding: 1, resource: sd },
        { binding: 2, resource: rv },
        { binding: 3, resource: samp },
        { binding: 4, resource: cascades[0].view },
        { binding: 5, resource: cascades[1].view },
        { binding: 6, resource: cascades[2].view }
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

    function drawWorld(pass, ub, geo, birds) {
      pass.setPipeline(pipes.sky); pass.setBindGroup(0, ub); pass.draw(3);
      pass.setPipeline(pipes.terrain); pass.setBindGroup(0, geo);
      pass.setVertexBuffer(0, terrainVB); pass.setIndexBuffer(terrainIB, 'uint32');
      pass.drawIndexed(terrain.idx.length);
      if (packed.idx.length) {
        pass.setPipeline(pipes.mesh); pass.setBindGroup(0, geo);
        pass.setVertexBuffer(0, meshVB); pass.setIndexBuffer(meshIB, 'uint32');
        pass.drawIndexed(packed.idx.length);
      }
      if (birds && q.birds) {
        pass.setPipeline(pipes.bird); pass.setBindGroup(0, geo);
        pass.setVertexBuffer(0, birdVB); pass.setVertexBuffer(1, birdInstB);
        pass.setIndexBuffer(birdIB, 'uint16');
        pass.drawIndexed(bgeom.idx.length, q.birds);
      }
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
    let last = performance.now();
    const ft = new Float32Array(40);
    let ftI = 0, ftN = 0, frames = 0, adaptLeft = 3, ready = false;
    let showHint = 0;

    function fillCam(arr, eyeX, eyeY, eyeZ, cyaw, cpitch, clipBelow, underFlag) {
      cameraVectors(cyaw, cpitch, fwd, right, up);
      const eye = [eyeX, eyeY, eyeZ];
      viewFrom(eye, right, up, fwd, V);
      perspective(P, fov, viewW / viewH, near, far);
      matmul(P, V, VP);
      invert(VP, INV);
      arr.set(VP, 0); arr.set(INV, 16);
      arr[48] = eyeX; arr[49] = eyeY; arr[50] = eyeZ; arr[51] = time;
      const ca = Math.cos(wp.sunAng), sa = Math.sin(wp.sunAng);
      const sx = SUN[0] * ca - SUN[2] * sa;
      const sz = SUN[0] * sa + SUN[2] * ca;
      const sl = Math.hypot(sx, SUN[1], sz) || 1;
      arr[52] = sx / sl; arr[53] = SUN[1] / sl; arr[54] = sz / sl; arr[55] = underFlag;
      arr[56] = 1.08 * wp.sun; arr[57] = 0.98 * wp.sun; arr[58] = 0.84 * wp.sun; arr[59] = 0.92;
      arr[60] = 0.73; arr[61] = 0.79; arr[62] = 0.84; arr[63] = Math.tan(fov * 0.5);
      arr[64] = right[0]; arr[65] = right[1]; arr[66] = right[2]; arr[67] = viewW / viewH;
      arr[68] = up[0]; arr[69] = up[1]; arr[70] = up[2]; arr[71] = clipBelow;
      arr[72] = fwd[0]; arr[73] = fwd[1]; arr[74] = fwd[2]; arr[75] = qstr.has('noshadow') ? 0 : q.shadow;
      arr[79] = q.clouds;
      arr[84] = viewW; arr[85] = viewH; arr[86] = q.refl && !qstr.has('norefl') ? 1 : 0;
      arr[128] = wp.amp; arr[129] = wp.spd; arr[130] = wp.frq; arr[131] = wp.dir;
      arr[132] = wp.rough; arr[133] = wp.refl; arr[134] = wp.refr; arr[135] = wp.alpha;
      arr[136] = wp.sun; arr[137] = wp.sky; arr[138] = wp.layers; arr[139] = wp.paused;
      arr[140] = wp.deep[0]; arr[141] = wp.deep[1]; arr[142] = wp.deep[2]; arr[143] = wp.depthK;
      arr[144] = wp.shal[0]; arr[145] = wp.shal[1]; arr[146] = wp.shal[2]; arr[147] = wp.rip;
      arr[148] = simOx; arr[149] = simOz; arr[150] = simDomain; arr[151] = wp.cx;
      arr[152] = wp.mood[0]; arr[153] = wp.mood[1]; arr[154] = wp.mood[2]; arr[155] = wp.mood[3];
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
      if (!ready && frames > 8) {
        ready = true;
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

      const wantUnder = camY < waveY(world, camX, camZ, time) - 0.05 ? 1 : 0;

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
          const spm = swimming ? (sprint ? 7.5 : 3.2) : (sprint ? 8.2 : 4.1);
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
            else dive = Math.max(0, dive - dt * 0.35);
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
        rpSim.setPipeline(simPipe);
        rpSim.setBindGroup(0, simBG[ripIndex]);
        rpSim.draw(3);
        rpSim.end();
        ripIndex = 1 - ripIndex;
      }
      const geoNow = bgGeoSet[ripIndex];
      {
        const spass = enc.beginRenderPass(shadowPass);
        spass.setPipeline(pipes.shadowTerrain); spass.setBindGroup(0, bgUB);
        spass.setVertexBuffer(0, terrainVB); spass.setIndexBuffer(terrainIB, 'uint32');
        spass.drawIndexed(terrain.idx.length);
        if (packed.idx.length) {
          spass.setPipeline(pipes.shadowMesh); spass.setBindGroup(0, bgUB);
          spass.setVertexBuffer(0, meshVB); spass.setIndexBuffer(meshIB, 'uint32');
          spass.drawIndexed(packed.idx.length);
        }
        spass.end();
      }
      if (uf[86] > 0.5) {
        reflPass.colorAttachments[0].view = reflTex.createView();
        reflPass.depthStencilAttachment.view = reflDepth.createView();
        const rp = enc.beginRenderPass(reflPass);
        drawWorld(rp, bgUBR, bgGeoR, false);
        rp.end();
      }
      scenePass.colorAttachments[0].view = sceneTex.createView();
      scenePass.depthStencilAttachment.view = sceneDepth.createView();
      const sp = enc.beginRenderPass(scenePass);
      drawWorld(sp, bgUB, geoNow, true);
      sp.end();

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
        audio.wind.gain.value = (muted ? 0 : 0.05) * (0.3 + Math.min(alt, 80) / 80) * (under ? 0.05 : 1) * (land > 8 ? 1.3 : 0.8);
        audio.insects.gain.value = (muted ? 0 : 0.02) * Math.max(0, Math.min(1, (land - 0.8) / 5)) * (under ? 0 : 1);
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
      const idx = Math.max(0, Math.min(5, parseInt(qstr.get('shot'), 10) || 1));
      // shot=0 keeps the orbit but hides the menu; 1..6 are places
      document.body.classList.add('playing');
      if (qstr.get('shot') !== '0') {
        goSpot(idx - 1);
        if (qstr.get('shot') === '3') fly = true;
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
      const t0 = parseFloat(qstr.get('t') || '2.5') || 0;
      const seedEnc = device.createCommandEncoder();
      shoreSim.seed(seedEnc);
      device.queue.submit([seedEnc.finish()]);
      const steps = 110;
      const hdt = 0.04;
      let t = t0 - steps * hdt;
      for (let i = 0; i < steps; i++) {
        t += hdt;
        const e = device.createCommandEncoder();
        if (i % 8 === 0) encodeOcean(e, t);
        shoreSim.encode(e, t, hdt);
        device.queue.submit([e.finish()]);
      }
      await device.queue.onSubmittedWorkDone();
    }

    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    fail((err && err.stack) || String(err));
  }
}

main();
