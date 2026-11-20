const PRESETS = {
  low:  { name: 'low',  hres: 384, span: 560, terrain: 160, textent: 460, water: 168, grass: 900,  weed: 0,   palms: 48,  broad: 36,  rocks: 40, stacks: 6,  birds: 0,  shadow: 4, clouds: 3, refl: 0, scale: 0.72, dpr: 1,    maxPx: 900000 },
  med:  { name: 'med',  hres: 512, span: 560, terrain: 210, textent: 500, water: 190, grass: 2800, weed: 420, palms: 100, broad: 80,  rocks: 70, stacks: 9,  birds: 8,  shadow: 6, clouds: 3, refl: 1, scale: 0.9,  dpr: 1.25, maxPx: 1900000 },
  high: { name: 'high', hres: 640, span: 560, terrain: 300, textent: 530, water: 230, grass: 5600, weed: 800, palms: 160, broad: 130, rocks: 100, stacks: 12, birds: 12, shadow: 10, clouds: 4, refl: 1, scale: 1,   dpr: 1.5,  maxPx: 3400000 }
};

const WAVES = [
  [1.00, 0.02, 1.45, 44, 0.58],
  [1.00, 0.02, 0.28, 22, 0.75],
  [0.996, 0.09, 0.07, 68, 0.18],
  [0.996, -0.09, 0.045, 33, 0.14],
  [0.98, 0.18, 0.018, 13, 0.08],
  [0.98, -0.20, 0.012, 9, 0.06],
  [0.12, 0.99, 0.02, 52, 0.08],
  [-0.06, 1.00, 0.01, 27, 0.05]
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

function makePalm() {
  const m = new Mesh();
  const sides = 7, seg = 9;
  const rings = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = t * 1.02;
    const lean = t * t * 0.1;
    const scar = (i & 1) ? 1.1 : 0.9;
    const r = (0.078 * (1 - t * 0.58) + 0.016) * scar;
    const shade = (i & 1) ? 0.72 : 1;
    const row = [];
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2;
      row.push(m.v(lean + Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a), 0.08, Math.sin(a), 0.36 * shade, 0.32 * shade, 0.26 * shade, t * 0.08));
    }
    rings.push(row);
  }
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
      m.tri(a, c, b); m.tri(b, c, d);
    }
  }
  // A frond is a rachis with two rows of leaflets that sag off it. The jagged
  // width is what reads as separate leaflets once the tree is small on screen.
  function frond(ang, len, rise, droop, width, col, sway0, steps) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const px = -dz, pz = dx;
    let pc = -1, pl = -1, pr = -1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const rad = 0.02 + t * len;
      const y = 1.04 + Math.sin(t * Math.PI * rise) * 0.24 - t * t * droop;
      const jag = (s & 1) ? 1.35 : 0.55;
      const w = (Math.sin(Math.min(t * 1.05 + 0.08, 1) * Math.PI) * width + 0.01) * jag;
      const cx = 0.1 + dx * rad, cz = dz * rad;
      const g = col[1] * (0.7 + (1 - t) * 0.45);
      const sway = sway0 + t * 0.7;
      const C = m.v(cx, y, cz, dx, 0.8, dz, col[0] * 0.65, g * 0.7, col[2] * 0.5, sway * 0.45);
      const L = m.v(cx + px * w, y - w * 0.62, cz + pz * w, px, 0.4, pz, col[0], g, col[2], sway);
      const R = m.v(cx - px * w, y - w * 0.62, cz - pz * w, -px, 0.4, -pz, col[0] * 0.82, g * 0.88, col[2] * 0.9, sway);
      if (pc >= 0) {
        m.tri(pc, C, pl); m.tri(pl, C, L);
        m.tri(pc, pr, C); m.tri(pr, R, C);
      }
      pc = C; pl = L; pr = R;
    }
  }
  for (let f = 0; f < 14; f++) frond(f / 14 * Math.PI * 2, 0.74, 0.46, 0.8, 0.125, [0.18, 0.38, 0.07], 0.42, 8);
  for (let f = 0; f < 5; f++) frond(f / 5 * Math.PI * 2 + 0.3, 0.32, 1.15, 0.04, 0.06, [0.24, 0.50, 0.12], 0.22, 4);
  for (let f = 0; f < 8; f++) frond(f / 8 * Math.PI * 2 + 0.15, 0.34, 0.12, 0.62, 0.04, [0.34, 0.26, 0.09], 0.12, 3);
  return m;
}

function makeBroad() {
  const m = new Mesh();
  const trunk = cylinder(7, 5, 0.14, 0.05, 0.4, [0.33, 0.23, 0.12], 0.04);
  appendMesh(m, trunk, 0, 0, 0, 0, 1, null, 1);
  const flare = cylinder(7, 1, 0.22, 0.13, 0.1, [0.28, 0.19, 0.11], 0);
  appendMesh(m, flare, 0, 0, 0, 0.35, 1, null, 1);
  const leaf = icosphere(1, 0.4, [0.12, 0.27, 0.08]);
  for (let i = 0; i < leaf.pos.length / 3; i++) {
    const h = ((i * 7) % 5) / 5;
    leaf.pos[i * 3] *= 0.82 + h * 0.36;
    leaf.pos[i * 3 + 2] *= 1.08 - h * 0.22;
    const ny = leaf.nrm[i * 3 + 1];
    const up = ny > 0.2 ? 1.2 : 0.55;
    leaf.col[i * 3] *= up * 0.8;
    leaf.col[i * 3 + 1] *= up;
    leaf.col[i * 3 + 2] *= up * 0.65;
    leaf.sway[i] = 0.1 + Math.max(ny, 0) * 0.18;
  }
  function limb(x0, y0, z0, x1, y1, z1, r0, r1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let hx = 0, hy = 1, hz = 0;
    if (Math.abs(uy) > 0.85) { hx = 1; hy = 0; }
    let sx = uy * hz - uz * hy, sy = uz * hx - ux * hz, sz = ux * hy - uy * hx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const tx = sy * uz - sz * uy, ty = sz * ux - sx * uz, tz = sx * uy - sy * ux;
    const sides = 5, seg = 3, rows = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, r = r0 + (r1 - r0) * t;
      const cx = x0 + dx * t, cy = y0 + dy * t - Math.sin(t * Math.PI) * 0.025, cz = z0 + dz * t;
      const row = [];
      for (let k = 0; k < sides; k++) {
        const a = k / sides * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const ox = (sx * ca + tx * sa) * r, oy = (sy * ca + ty * sa) * r, oz = (sz * ca + tz * sa) * r;
        row.push(m.v(cx + ox, cy + oy, cz + oz, ox, oy, oz, 0.31, 0.21, 0.11, 0.04));
      }
      rows.push(row);
    }
    for (let i = 0; i < seg; i++) {
      for (let k = 0; k < sides; k++) {
        const a = rows[i][k], b = rows[i][(k + 1) % sides];
        const c = rows[i + 1][k], d = rows[i + 1][(k + 1) % sides];
        m.tri(a, c, b); m.tri(b, c, d);
      }
    }
  }
  const arms = [
    [0.46, 0.58, 0.06, 0.62],
    [-0.44, 0.52, -0.1, 0.58],
    [0.08, 0.66, -0.42, 0.55],
    [-0.1, 0.5, 0.44, 0.56],
    [0.3, 0.72, -0.22, 0.46],
    [-0.26, 0.68, 0.2, 0.48]
  ];
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    limb(a[0] * 0.18, 0.3, a[2] * 0.18, a[0], a[1] - 0.06, a[2], 0.05, 0.022);
    appendMesh(m, leaf, a[0], a[1], a[2], i * 0.9, a[3], [0.82 + (i % 3) * 0.08, 1, 0.78], 0.4);
  }
  appendMesh(m, leaf, 0, 0.58, 0, 0.4, 0.72, [0.95, 1, 0.86], 0.42);
  return m;
}

function makeRock() {
  const m = icosphere(1, 1, [0.45, 0.42, 0.37]);
  for (let i = 0; i < m.pos.length / 3; i++) {
    const h = ((i * 13) % 11) / 11;
    const k = 0.78 + h * 0.4;
    m.pos[i * 3] *= k;
    m.pos[i * 3 + 1] *= 0.62 + h * 0.28;
    m.pos[i * 3 + 2] *= 1.12 - h * 0.3;
    m.col[i * 3] *= 0.85 + h * 0.3;
    m.col[i * 3 + 1] *= 0.85 + h * 0.25;
    m.col[i * 3 + 2] *= 0.82 + h * 0.2;
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
  for (let a = 0; a < 3; a++) {
    const ang = a * Math.PI / 3;
    const c = Math.cos(ang), s = Math.sin(ang);
    const corn = [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]];
    for (let i = 0; i < 4; i++) {
      pos.push(corn[i][0] * c, corn[i][1], corn[i][0] * s);
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
  // body
  const a = add(0, 0, 0.28, 0), b = add(0, 0.04, -0.22, 0), c = add(0, 0.07, 0.0, 0), d = add(0, -0.03, 0.0, 0);
  idx.push(a, c, b, a, b, d);
  // wings
  const l0 = add(-0.05, 0.02, 0.05, -1), l1 = add(-0.62, 0.0, 0.12, -1), l2 = add(-0.58, 0.0, -0.08, -1), l3 = add(-0.05, 0.02, -0.08, -1);
  idx.push(l0, l1, l2, l0, l2, l3);
  const r0 = add(0.05, 0.02, 0.05, 1), r1 = add(0.62, 0.0, 0.12, 1), r2 = add(0.58, 0.0, -0.08, 1), r3 = add(0.05, 0.02, -0.08, 1);
  idx.push(r0, r2, r1, r0, r3, r2);
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
function waveY(world, x, z, time) {
  const damp = fieldDamp(world, x, z);
  const D = Math.max(-fieldSample(world, x, z), 0.25);
  const kP = Math.PI * 2 / WAVES[0][3];
  const wP = Math.sqrt(9.81 * kP);
  let y = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i];
    const len = Math.hypot(w[0], w[1]) || 1;
    const dx = w[0] / len, dz = w[1] / len;
    const k = Math.PI * 2 / w[3];
    const feel = 1 - smooth01(w[3] * 0.08, w[3] * 0.45, D);
    let As = w[2] * damp * (1 + feel * 0.85);
    const Q = Math.min(w[4] + feel * 0.45, 1.05);
    const steep = k * As * Q;
    if (steep > 0.72) As *= 0.72 / steep;
    As *= 1 - (1 - smooth01(0.35, 1.6, D)) * 0.65;
    const omega = i === 1 ? wP * (k / kP) : Math.sqrt(9.81 * k);
    y += As * Math.sin(k * (dx * x + dz * z) - omega * time);
  }
  return y;
}

let audio = null;
let muted = false;
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const dur = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, dur, ac.sampleRate);
  const data = buf.getChannelData(0);
  let s = 123456789;
  for (let i = 0; i < dur; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  const master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  function loop(filterType, freq, q) {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { gain: g, filter: f };
  }
  const surf = loop('lowpass', 640, 0.6);
  const wind = loop('bandpass', 420, 0.35);
  const under = ac.createBiquadFilter();
  under.type = 'lowpass'; under.frequency.value = 18000; under.Q.value = 0.2;
  // rewire master through the muffler
  master.disconnect();
  master.connect(under); under.connect(ac.destination);
  return { ac: ac, master: master, under: under, surf: surf.gain, wind: wind.gain };
}

const K = Object.create(null);
['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].forEach((c) => { K[c] = 0; });
let lookX = 0, lookY = 0, dragging = false, touchN = 0;

function bootKeys() {
  addEventListener('keydown', (e) => {
    if (K[e.code] != null) { K[e.code] = 1; e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === 'KeyM') { muted = !muted; if (audio) audio.master.gain.value = muted ? 0 : 0.9; }
    if (e.code === 'KeyH') statsEl.hidden = !statsEl.hidden;
    if (e.code === 'KeyF' && mode === 2) fly = !fly;
    if (e.code === 'Escape') openMenu();
    if (e.code >= 'Digit1' && e.code <= 'Digit6' && mode === 2) goSpot(e.code.charCodeAt(5) - 49);
  });
  addEventListener('keyup', (e) => { if (K[e.code] != null) K[e.code] = 0; });
  const canvas = $('c');
  canvas.addEventListener('mousedown', (e) => { if (mode === 2) { dragging = true; if (document.pointerLockElement !== canvas) canvas.requestPointerLock(); } });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (mode !== 2) return;
    if (document.pointerLockElement === canvas || dragging) { lookX += e.movementX; lookY += e.movementY; }
  });
  canvas.addEventListener('touchstart', (e) => {
    touchN = e.touches.length;
    if (mode === 2) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (mode !== 2 || !e.touches.length) return;
    const t = e.touches[0];
    if (touchLX != null) { lookX += (t.clientX - touchLX) * 1.4; lookY += (t.clientY - touchLY) * 1.4; }
    touchLX = t.clientX; touchLY = t.clientY; touchN = e.touches.length;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => { touchN = e.touches.length; if (!e.touches.length) { touchLX = null; touchLY = null; } });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== $('c') && mode === 2 && !qstr.has('shot')) openMenu();
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
  document.body.classList.remove('playing');
  if (document.pointerLockElement) document.exitPointerLock();
}
function goSpot(i) {
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

    const byaw = downhillYaw(world, beach.x, beach.z);
    const face = sunYaw;
    spots = [
      { x: beach.x, y: beach.h + 1.55, z: beach.z, yaw: face, pitch: -0.05, fly: false, dive: 0 },
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
    const palm = makePalm();
    const broad = makeBroad();
    const rock = makeRock();
    let palms = 0, broads = 0, rocks = 0, stacks = 0;
    const clearR = 9;
    const sideX = -sdz, sideZ = sdx;
    for (let i = 0; i < 7 && palms < q.palms; i++) {
      const along = (i - 3) * 9;
      const back = 8 + (i % 2) * 5;
      const x = beach.x - sdx * back + sideX * along;
      const z = beach.z - sdz * back + sideZ * along;
      const h = fieldSample(world, x, z);
      if (h < 0.35 || h > 5) continue;
      appendMesh(staticMesh, palm, x, h, z, rnd() * 6.28, 8.5 + (i % 3) * 1.6, [0.92, 1, 0.88], 1);
      palms++;
    }
    for (let i = 0; i < (q.palms + q.broad) * 14 && (palms < q.palms || broads < q.broad); i++) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      if (Math.hypot(x - beach.x, z - beach.z) < clearR) continue;
      const n = vnoise(x * 0.017, z * 0.017);
      const tint = [0.86 + rnd() * 0.28, 0.88 + rnd() * 0.24, 0.86 + rnd() * 0.2];
      if (palms < q.palms && h > 0.7 && h < 7.5 && s < 0.38 && n > 0.36) {
        appendMesh(staticMesh, palm, x, h, z, rnd() * 6.28, 8 + rnd() * 4, tint, 1);
        palms++;
      } else if (broads < q.broad && h > 4.2 && h < 26 && s < 0.42 && n > 0.42) {
        appendMesh(staticMesh, broad, x, h, z, rnd() * 6.28, 8 + rnd() * 4, tint, 1);
        broads++;
      }
    }
    for (let i = 0; i < q.rocks * 20 && rocks < q.rocks; i++) {
      const x = (rnd() - 0.5) * 500;
      const z = (rnd() - 0.5) * 420;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      if (h < 0.15 || h > 2.4 || s > 0.55) continue;
      if (Math.hypot(x - beach.x, z - beach.z) < 4) continue;
      if (vnoise(x * 0.05, z * 0.05) < 0.62) continue;
      const sc = 0.25 + rnd() * 0.7;
      appendMesh(staticMesh, rock, x, h - sc * 0.35, z, rnd() * 6, sc, [0.75 + rnd() * 0.3, 0.7 + rnd() * 0.25, 0.62 + rnd() * 0.2], 0.55 + rnd() * 0.5);
      rocks++;
    }
    for (let i = 0; i < q.stacks * 30 && stacks < q.stacks; i++) {
      const x = -40 - rnd() * 160;
      const z = (rnd() - 0.5) * 220;
      const h = fieldSample(world, x, z);
      if (h < -6 || h > -0.5) continue;
      const sc = 1.6 + rnd() * 3.4;
      appendMesh(staticMesh, rock, x, h - sc * 0.25, z, rnd() * 6, sc, [0.55, 0.52, 0.48], 1.3 + rnd() * 0.8);
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
      if (grassList.length < q.grass && h > 1.5 && h < 28 && s < 0.48 && vnoise(x * 0.03, z * 0.03) > 0.38) {
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
      birdMeta[i * 4] = 40 + rnd() * 150;
      birdMeta[i * 4 + 1] = 0.08 + rnd() * 0.12;
      birdMeta[i * 4 + 2] = rnd() * 6.28;
      birdMeta[i * 4 + 3] = 32 + rnd() * 26;
    }

    setStatus('Tuning the swell', 0.78);
    await new Promise((r) => setTimeout(r, 0));

    const code = shaderCode(q.hres, q.span);
    const mod = device.createShaderModule({ code: code });
    const blitMod = device.createShaderModule({ code: blitShaderCode() });
    const info = await mod.getCompilationInfo();
    const binfo = await blitMod.getCompilationInfo();
    const errs = info.messages.concat(binfo.messages).filter((m) => m.type === 'error');
    if (errs.length) {
      fail(errs.map((e) => e.lineNum + ':' + e.linePos + '  ' + e.message).join('\n'));
      return;
    }

    const uf = new Float32Array(128);
    const ur = new Float32Array(128);
    for (let i = 0; i < 8; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      uf[88 + i * 4] = w[0] / L; uf[89 + i * 4] = w[1] / L; uf[90 + i * 4] = w[2]; uf[91 + i * 4] = w[3];
      uf[120 + i] = w[4];
    }
    ur.set(uf);

    const ubuf = device.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const rbuf = device.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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
        { binding: 1, visibility: VS | FS, texture: { sampleType: 'unfilterable-float' } }
      ]
    });
    const waterLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: FS, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: FS, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: FS, texture: { sampleType: 'float' } },
        { binding: 3, visibility: FS, sampler: { type: 'filtering' } }
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
    const packed = packMesh(staticMesh);
    const g = grassGeom();
    const grassVert = packInterleaved(g.pos, g.uv);
    const bgeom = birdGeom();
    const birdVert = packBird(bgeom.pos, bgeom.wing);

    const terrainVB = upload(terrain.pos, GPUBufferUsage.VERTEX);
    const terrainIB = upload(terrain.idx, GPUBufferUsage.INDEX);
    const waterVB = upload(water.pos, GPUBufferUsage.VERTEX);
    const waterIB = upload(water.idx, GPUBufferUsage.INDEX);
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
    pipes.blit = await pipe({
      layout: blitPL,
      vertex: { module: blitMod, entryPoint: 'vsBlit' },
      fragment: { module: blitMod, entryPoint: 'fsBlit', targets: [{ format: format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthOn('depth24plus', true, 'always')
    });

    const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    let sceneTex = null, sceneDepth = null, swapDepth = null, reflTex = null, reflDepth = null;
    const READ = qstr.has('read');
    let readTex = null, readDepth = null, readBuf = null, readBpr = 0;
    let bgGeo, bgGeoR, bgUB, bgUBR, bgBlit, bgWater;
    let viewW = 2, viewH = 2;
    const hview = htex.createView();

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
      bgGeo = device.createBindGroup({ layout: geoLayout, entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: hview }] });
      bgGeoR = device.createBindGroup({ layout: geoLayout, entries: [{ binding: 0, resource: { buffer: rbuf } }, { binding: 1, resource: hview }] });
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
        { binding: 3, resource: samp }
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
      arr[52] = SUN[0]; arr[53] = SUN[1]; arr[54] = SUN[2]; arr[55] = underFlag;
      arr[56] = 1.08; arr[57] = 0.98; arr[58] = 0.84; arr[59] = 0.92;
      arr[60] = 0.73; arr[61] = 0.79; arr[62] = 0.84; arr[63] = Math.tan(fov * 0.5);
      arr[64] = right[0]; arr[65] = right[1]; arr[66] = right[2]; arr[67] = viewW / viewH;
      arr[68] = up[0]; arr[69] = up[1]; arr[70] = up[2]; arr[71] = clipBelow;
      arr[72] = fwd[0]; arr[73] = fwd[1]; arr[74] = fwd[2]; arr[75] = qstr.has('noshadow') ? 0 : q.shadow;
      arr[79] = q.clouds;
      arr[84] = viewW; arr[85] = viewH; arr[86] = q.refl && !qstr.has('norefl') ? 1 : 0;
    }

    device.lost.then((info) => { window.__gpuerr = 'lost ' + (info && info.message); console.error('LOST', info && info.message); });
    function frame(now) {
      try { frameBody(now); } catch (err) { window.__gpuerr = String(err && err.stack || err); console.error('FRAME', err); }
    }
    function frameBody(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
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
      const cover = Math.min(18000, 2800 + eyeH * 55) * 2;
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
          const rad = birdMeta[i * 4], sp = birdMeta[i * 4 + 1], ph = birdMeta[i * 4 + 2], yb = birdMeta[i * 4 + 3];
          const a = time * sp + ph;
          birdData[i * 4] = Math.cos(a) * rad + 10;
          birdData[i * 4 + 1] = yb + Math.sin(a * 2) * 3.5;
          birdData[i * 4 + 2] = Math.sin(a) * rad * 0.82;
          birdData[i * 4 + 3] = a + 1.5708;
        }
        device.queue.writeBuffer(birdInstB, 0, birdData);
      }

      const enc = device.createCommandEncoder();
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
      drawWorld(sp, bgUB, bgGeo, true);
      sp.end();

      const drawSwap = (colorView, depthView) => {
        swapPass.colorAttachments[0].view = colorView;
        swapPass.depthStencilAttachment.view = depthView;
        const wp = enc.beginRenderPass(swapPass);
        wp.setPipeline(pipes.blit); wp.setBindGroup(0, bgBlit); wp.draw(3);
        wp.setPipeline(pipes.water); wp.setBindGroup(0, bgGeo); wp.setBindGroup(1, bgWater);
        wp.setVertexBuffer(0, waterVB); wp.setIndexBuffer(waterIB, 'uint32');
        wp.drawIndexed(water.idx.length);
        wp.end();
      };
      if (READ && readTex) drawSwap(readTex.createView(), readDepth.createView());
      drawSwap(context.getCurrentTexture().createView(), swapDepth.createView());
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
      if (audio && mode > 0) {
        const alt = Math.max(camY, 0);
        const shore = Math.exp(-Math.abs(camY) * 0.08) * (0.35 + 0.65 * fieldDamp(world, camX, camZ));
        audio.surf.gain.value = (muted ? 0 : 0.22) * shore * (under ? 0.25 : 1);
        audio.wind.gain.value = (muted ? 0 : 0.07) * (0.25 + Math.min(alt, 80) / 80) * (under ? 0.05 : 1);
        audio.under.frequency.value = under ? 380 : 16000;
      }
      if (showHint > 0) {
        showHint -= dt;
        hintEl.classList.add('show');
        if (showHint <= 0) hintEl.classList.remove('show');
      }
      window.__frames = frames;
      requestAnimationFrame(frame);
    }

    bootKeys();
    goEl.addEventListener('click', () => {
      if (!audio) { audio = makeAudio(); if (audio) audio.ac.resume(); }
      const s = spots[0];
      introFrom = { x: camX, y: camY, z: camZ, yaw: yaw, pitch: pitch };
      introTo = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch };
      introT = 0;
      mode = 1;
      document.body.classList.add('playing');
      $('c').requestPointerLock();
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
    }

    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    fail((err && err.stack) || String(err));
  }
}

main();
