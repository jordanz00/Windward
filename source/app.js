const PRESETS = {
  low:  { name: 'low',  hres: 384, span: 560, terrain: 240, textent: 460, water: 200, grass: 900,  weed: 0,   palms: 48,  broad: 36,  forest: 380,  rocks: 40, stacks: 6,  birds: 5,  fish: 0.6, reef: 26, seagrass: 420,  shadow: 4, clouds: 1, sky: [1536, 384, 16, 256], drops: 5000, refl: 1, scale: 0.72, dpr: 1,    maxPx: 900000 },
  med:  { name: 'med',  hres: 512, span: 560, terrain: 210, textent: 500, water: 248, grass: 2800, weed: 420, palms: 100, broad: 80,  forest: 950,  rocks: 70, stacks: 9,  birds: 8,  fish: 1,   reef: 40, seagrass: 1000, shadow: 6, clouds: 2, sky: [2048, 512, 16, 384], drops: 9000, refl: 1, scale: 0.9,  dpr: 1.25, maxPx: 1900000 },
  high: { name: 'high', hres: 640, span: 560, terrain: 300, textent: 530, water: 288, grass: 5600, weed: 800, palms: 160, broad: 130, forest: 1700, rocks: 100, stacks: 12, birds: 12, fish: 1.5, reef: 56, seagrass: 1800, shadow: 10, clouds: 3, sky: [2560, 640, 32, 512], drops: 14000, refl: 1, scale: 1,   dpr: 1.5,  maxPx: 3400000 }
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
// Capture aid: ?no=water,shore,drops,air leaves those draws out, to see which one owns a fault.
const NO = {};
(qstr.get('no') || '').split(',').forEach((k) => { NO[k] = 1; });
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

// One tube, swept along a line of points, is every trunk, limb, stem, coral branch and
// insect leg on the island. at(t, ang, len, p) describes a place on it, t along and ang
// around, len metres from its foot, on the point p: [radius, r, g, b, sway, kind, u, v].
// With seam each ring repeats its first vertex, for bark whose pattern has to wrap.
// Returns the direction it ends in.
function tube(m, pts, sides, seam, at) {
  const n = pts.length, ring = sides + (seam ? 1 : 0), base = m.pos.length / 3;
  let len = 0, tx = 0, ty = 1, tz = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
    tx = b[0] - a[0]; ty = b[1] - a[1]; tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // Some direction across the line, then the one square to both.
    const rx = Math.abs(tz) > 0.9 ? 1 : 0, rz = 1 - rx;
    let ux = ty * rz, uy = tz * rx - tx * rz, uz = -ty * rx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    if (i) len += Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    for (let k = 0; k < ring; k++) {
      const ang = k / sides * 6.2832, c = Math.cos(ang), sn = Math.sin(ang);
      const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
      const A = at(i / (n - 1), ang, len, p);
      m.v(p[0] + nx * A[0], p[1] + ny * A[0], p[2] + nz * A[0], nx, ny, nz, A[1], A[2], A[3], A[4], A[5], A[6], A[7]);
    }
    if (i) for (let k = 0; k < sides; k++) {
      const q = base + (i - 1) * ring + k, r = base + (i - 1) * ring + (k + 1) % ring;
      m.tri(q, q + ring, r); m.tri(r, q + ring, r + ring);
    }
  }
  return [tx, ty, tz];
}
// A plain upright stem.
function cylinder(sides, rings, r0, r1, h, col, swayTop) {
  const m = new Mesh(), pts = [];
  for (let i = 0; i <= rings; i++) pts.push([0, h * (i / rings), 0]);
  tube(m, pts, sides, false, (t) => [r0 + (r1 - r0) * t, col[0], col[1], col[2], swayTop * t, SOLID, 0, 0]);
  return m;
}

function seeded(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addLeaflet(m, ox, oy, oz, dirx, diry, dirz, len, wid, col, sway, twist, segs) {
  const dl = Math.hypot(dirx, diry, dirz) || 1;
  dirx /= dl; diry /= dl; dirz /= dl;
  let sx = -dirz, sz = dirx;
  const sl = Math.hypot(sx, sz) || 1;
  sx /= sl; sz /= sl;
  const tw = twist || 0;
  const tipC = [col[0] * 1.18, col[1] * 0.92, col[2] * 0.55];
  if (segs > 2) {
    // A broad blade: a stalk, then a long oval that arches over under its own weight, folded
    // along the midrib and a little wavy at the edge. Rows of three vertices, so the fold is real.
    let px = ox, py = oy, pz = oz, prev = -1;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.6) * (1 - 0.2 * t) * (1 + 0.07 * Math.sin(t * 23 + tw * 9));
      // The blade's own direction here: it starts along dir and bends down.
      const bend = t * t * (0.55 + Math.abs(tw) * 0.5), ax = dirx, ay = diry - bend, az = dirz, al = Math.hypot(ax, ay, az) || 1;
      const ux = -ay * dirx / al, uy = Math.hypot(ax, az) / al + 0.2, uz = -ay * dirz / al, ul = Math.hypot(ux, uy, uz) || 1;
      const c = t > 0.8 ? tipC : col, sw = sway * (0.18 + t * t * 1.2), fold = w * 0.3;
      const row = m.v(px, py, pz, ux / ul, uy / ul, uz / ul, c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, sw, LEAF, 0, t);
      for (const side of [1, -1]) {
        m.v(px + sx * (w + tw * t * 0.3 * wid) * side, py + fold, pz + sz * (w + tw * t * 0.3 * wid) * side,
          ux / ul - sx * side * 0.35, uy / ul, uz / ul - sz * side * 0.35, c[0], c[1], c[2], sw, LEAF, side, t);
      }
      if (prev >= 0) {
        m.tri(prev, row, prev + 1); m.tri(prev + 1, row, row + 1);
        m.tri(prev, prev + 2, row); m.tri(prev + 2, row + 2, row);
      }
      prev = row;
      px += ax / al * len / segs; py += ay / al * len / segs; pz += az / al * len / segs;
    }
    return;
  }
  const vert = (t, side) => {
    // Taper, slight fold, midrib bias, and a soft twist along the blade.
    const w = wid * (1 - Math.pow(t, 1.15) * 0.9) * (0.92 + 0.08 * Math.sin(t * 9));
    const fold = side * (0.35 + 0.25 * t) * wid * 0.45;
    const droop = t * t * len * (0.18 + Math.abs(tw) * 0.12);
    const twistOff = tw * t * t * len * 0.12;
    const x = ox + dirx * len * t + sx * (w * side + twistOff) + dirx * fold * 0.15;
    const y = oy + diry * len * t - droop + Math.abs(side) * fold * 0.35;
    const z = oz + dirz * len * t + sz * (w * side + twistOff) + dirz * fold * 0.15;
    const c = t > 0.68 ? tipC : col;
    const nx = dirx * 0.15 + sx * side * 0.35, nz = dirz * 0.15 + sz * side * 0.35;
    return m.v(x, y, z, nx, 0.85 + 0.1 * (1 - Math.abs(side)), nz, c[0], c[1], c[2], sway * (0.18 + t * t * 1.2), LEAF, side, t);
  };
  const bL = vert(0.0, 1), bR = vert(0.0, -1);
  const mL = vert(0.38, 1), mR = vert(0.38, -1);
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
  // Four structural families — genuinely different architecture, not scaled clones.
  // 0 young upright dense · 1 classic mature · 2 coastal lean · 3 old tall sparse
  const family = ((seed * 17 + (rnd() * 97) | 0) % 4);
  const age = family === 0 ? 0.12 + rnd() * 0.22 : family === 3 ? 0.72 + rnd() * 0.28 : 0.28 + rnd() * 0.5;
  const coastal = family === 2 ? 0.65 + rnd() * 0.35 : family === 1 ? rnd() * 0.35 : rnd() * 0.2;
  const H = family === 0 ? 4.2 + rnd() * 1.8
    : family === 2 ? 5.5 + rnd() * 2.8
    : family === 3 ? 8.5 + rnd() * 3.5
    : 6.0 + rnd() * 3.2;
  const lean = family === 2 ? 0.35 + rnd() * 0.55
    : family === 3 ? 0.08 + rnd() * 0.28
    : 0.05 + coastal * 0.35 + rnd() * 0.15;
  const topSway = 0.07 + (1 - age) * 0.045 + (family === 2 ? 0.02 : 0);
  const trunkFat = (family === 0 ? 0.08 : family === 3 ? 0.12 : 0.095) + age * 0.04 + rnd() * 0.028;
  const sides = [12, 7, 4][lod], rings = [36, 12, 5][lod];
  // Trunk: out of the ground at an angle, then curving back up toward the light.
  let P = [0, -0.2, 0];
  let last = null;
  const barkTone = [0.32 + age * 0.1 + family * 0.01, 0.28 + age * 0.06, 0.24 + age * 0.05];
  // S-curve / lateral wander — stronger on coastal and old families.
  const bowZ = (rnd() - 0.5) * (family === 2 ? 0.32 : family === 3 ? 0.22 : 0.14);
  const bowX = (rnd() - 0.5) * (family === 2 ? 0.14 : 0.08);
  const taper = family === 3 ? 0.038 : 0.028;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, s = t * H;
    const th = lean * (1 - 0.92 * Math.pow(t, family === 2 ? 0.62 : 0.75));
    const T = unit([Math.sin(th) + bowX * Math.sin(t * 3.1), Math.cos(th), bowZ * Math.sin(t * 2.7)]);
    const X0 = unit(cross(T, [0, 0, 1]));
    const X = Math.hypot(X0[0], X0[1], X0[2]) < 0.2 ? unit(cross(T, [0, 1, 0])) : X0;
    const Z = unit(cross(X, T));
    // Oval cross-section + scar bumps along the height.
    const oval = 0.9 + 0.12 * Math.sin(t * 9.0 + seed);
    const scar = 1 + (0.04 + age * 0.02) * Math.sin(t * 22.0 + seed * 0.7);
    const r = (trunkFat - taper * t + 0.16 * Math.exp(-s / 0.45) + 0.055 * smooth01(0.92, 1, t)) * scar;
    const row = [];
    for (let k = 0; k <= sides; k++) {
      const a = k / sides * 6.2832, ca = Math.cos(a) * oval, sa = Math.sin(a);
      const nx = X[0] * ca + Z[0] * sa, ny = X[1] * ca + Z[1] * sa, nz = X[2] * ca + Z[2] * sa;
      const shade = 0.92 + 0.1 * Math.sin(a * 3.0 + t * 8.0);
      row.push(m.v(P[0] + nx * r, P[1] + ny * r, P[2] + nz * r, nx, ny, nz, barkTone[0] * shade, barkTone[1] * shade, barkTone[2] * shade, topSway * t * t, BARK, k / sides, s));
    }
    if (last) for (let k = 0; k < sides; k++) { m.tri(last[k], row[k], last[k + 1]); m.tri(last[k + 1], row[k], row[k + 1]); }
    last = row;
    if (i < rings) P = add(P, T, H / rings);
  }
  const C = P;
  // Cap geometry so one palm stays under 65535 verts (packed as uint16).
  const nf = family === 0 ? 22 + ((rnd() * 6) | 0)
    : family === 3 ? 14 + ((rnd() * 5) | 0)
    : family === 2 ? 16 + ((rnd() * 6) | 0)
    : 18 + ((rnd() * 7) | 0);
  const nd = family === 3 ? 2 + ((rnd() * 3) | 0) : 1 + ((rnd() * 2 + age) | 0);
  const nseg = [18, 8, 4][lod], lseg = [4, 3, 2][lod];
  // Whole-crown bias — irregular but coherent attachment around the trunk tip.
  const crownBias = (rnd() - 0.5) * (family === 2 ? 0.75 : 0.5);
  const crownGap = family === 0 ? 0.1 + rnd() * 0.12
    : family === 3 ? 0.24 + rnd() * 0.28
    : 0.15 + rnd() * 0.22;
  const frondLen0 = family === 0 ? 3.2 : family === 3 ? 4.2 : 3.7;
  for (let j = 0; j < nf + nd; j++) {
    const dead = j >= nf;
    // 0 has just opened at the top of the crown. 1 is about to fall.
    const age = dead ? 1.1 : (j + rnd() * 0.7) / nf;
    // Milder azimuth/elevation jitter — extreme random el0 created spiked / broken silhouettes.
    const az0 = j * 2.39996 + crownBias + (rnd() - 0.5) * 0.85 + Math.sin(j * 1.7 + seed) * 0.28;
    const el0 = dead ? -1.2 - rnd() * 0.25
      : (family === 0 ? 1.1 : 0.98) - Math.pow(age, family === 3 ? 0.98 : 1.08) * (family === 3 ? 2.0 : 1.82)
        + (rnd() - 0.5) * 0.28 + crownBias * 0.12;
    const L = dead ? 2.3 + rnd() * 0.8
      : frondLen0 + (family === 3 ? 2.1 : 1.85) * Math.sin(Math.min(1, age * 1.15 + 0.1) * Math.PI) + rnd() * 0.5;
    const droop = dead ? 0.12
      : Math.min(1.85, (family === 3 ? 1.0 : family === 2 ? 0.95 : 0.8) + age * 1.05 + rnd() * 0.35);
    const curl = (rnd() - 0.5) * 1.05 + crownBias * 0.35, twist = (rnd() - 0.5) * 2.2 * (0.25 + age);
    // Restrained tip sway weights — large values tore crowns under wind shaders.
    const tipSwayAmt = 0.08 + rnd() * 0.1;
    const widthK = (family === 0 ? 0.017 : 0.014) + rnd() * 0.008;
    const lenK = 0.78 + rnd() * 0.45, hang0 = rnd() * 0.35 + (family === 3 ? 0.12 : 0);
    const fr = seeded(seed * 131 + j * 977 + 5);
    // Rachis rooted at crown — continuous attachment, no floating stubs.
    const pts = [];
    let p = [C[0] + Math.cos(az0) * 0.08, C[1] - 0.18 + (1 - Math.min(age, 1)) * 0.28, C[2] + Math.sin(az0) * 0.08];
    for (let k = 0; k <= nseg; k++) {
      const t = k / nseg;
      const e = el0 - droop * Math.pow(t, 1.75), az = az0 + curl * t * t * (0.65 + t), ro = twist * t;
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
      const w = 0.006 + 0.032 * (1 - t) + 0.045 * Math.max(0, 1 - t / 0.12), hgt = w * 0.5;
      const row = ring.map((ab) => {
        const o = add(add(q.p, q.S, ab[0] * w), q.U, ab[1] * hgt);
        const n0 = lod === 0 ? add(add([0, 0, 0], q.S, ab[0]), q.U, ab[1]) : q.U;
        const n = unit(n0);
        return m.v(o[0], o[1], o[2], n[0], n[1], n[2], rc[0], rc[1], rc[2], topSway + tipSwayAmt * t * t, SOLID);
      });
      if (prev) for (let i = 0; i < (ring.length > 2 ? ring.length : 1); i++) {
        const i1 = (i + 1) % ring.length;
        m.tri(prev[i], row[i], prev[i1]); m.tri(prev[i1], row[i], row[i1]);
      }
      prev = row;
    }
    // Leaflet density by LOD — avoid oversized mid/far blades that stretch under wind.
    const per = Math.max(3, Math.round(L * [13, 4.8, 1.5][lod]));
    const W = widthK * [1.35, 2.6, 4.2][lod] * (dead ? 0.55 : 1);
    const lift = dead ? -0.15 : 0.28 - age * 0.45;
    const hang = dead ? 1.8 : Math.min(1.55, 0.3 + age * 1.25 + hang0);
    const young = sat(1 - age / 0.3), old = sat((age - 0.72) / 0.28);
    const green = dead ? [0.28, 0.2, 0.1] : [
      0.07 + young * 0.07 + old * 0.1, 0.15 + young * 0.07 + old * 0.025, 0.04 + young * 0.012 + old * 0.012];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < per; i++) {
        if (!dead && fr() < crownGap * (0.4 + age * 0.85)) continue;
        // Stable spacing along rachis — less random stagger = fewer intersecting blades.
        const u = (i + 0.4 + (fr() - 0.5) * 0.35 + (side < 0 ? 0.06 : 0)) / per, t = 0.12 + u * 0.88;
        const f = Math.min(nseg - 1e-4, t * nseg), k0 = f | 0, A = pts[k0];
        const T = A.T;
        const len = (dead ? 0.45 : lenK) * Math.pow(Math.sin(Math.PI * (0.06 + 0.92 * Math.pow(u, 0.55))), 0.72)
          * (1 - 0.3 * u) * (0.82 + fr() * 0.28);
        if (len < 0.08) continue;
        const phi = 1.0 - u * 0.5 + (fr() - 0.5) * 0.28 + side * 0.08;
        const lu = lift + (fr() - 0.5) * 0.28 + (side < 0 ? -0.04 : 0.04);
        const cp = Math.cos(phi), sp = Math.sin(phi) * side;
        const d = unit([T[0] * cp + A.S[0] * sp + A.U[0] * lu, T[1] * cp + A.S[1] * sp + A.U[1] * lu, T[2] * cp + A.S[2] * sp + A.U[2] * lu]);
        const hg = hang * (0.8 + fr() * 0.35);
        const tone = (0.8 + fr() * 0.35) * (0.5 + 0.5 * smooth01(0.15, 2.2, t * L)) * (1 - 0.22 * Math.min(1, age));
        // Shared sway weight along this leaflet (shader phases by uv, not by random per vert).
        const sw0 = topSway + tipSwayAmt * t * t;
        const B = pts[k0 + 1].p, fk = f - k0;
        let q = [A.p[0] + (B[0] - A.p[0]) * fk, A.p[1] + (B[1] - A.p[1]) * fk, A.p[2] + (B[2] - A.p[2]) * fk];
        let pl = -1, pr = -1;
        // Mild fold shared for the whole leaflet — avoids left/right normal spikes.
        const fold0 = 0.28 + fr() * 0.12;
        const twistN = (fr() - 0.5) * 0.1;
        for (let k = 0; k <= lseg; k++) {
          const s = k / lseg;
          const dir = unit([d[0], d[1] - hg * Math.pow(s, 1.25), d[2]]);
          let n = cross(T, dir);
          n = Math.hypot(n[0], n[1], n[2]) < 0.05 ? unit(A.U) : unit([n[0] * side, n[1] * side, n[2] * side]);
          const a = unit(cross(n, dir));
          const w = W * Math.min(1, 0.45 + s * 3.2) * Math.pow(1 - Math.pow(s, 2.1), 0.85);
          const brown = old * s * s * 0.7;
          const cr = (green[0] * (1 - brown) + 0.3 * brown) * tone, cg = (green[1] * (1 - brown) + 0.2 * brown) * tone, cb = (green[2] * (1 - brown) + 0.07 * brown) * tone;
          const sw = sw0 + 0.04 * s;
          if (k === lseg) {
            if (pl < 0 || pr < 0) break;
            const tip = m.v(q[0], q[1], q[2], n[0], n[1], n[2], cr, cg, cb, sw, LEAF, 0, 1);
            m.tri(pl, tip, pr);
          } else {
            const fold = fold0 + 0.18 * s;
            const ax = a[0] + n[0] * twistN, ay = a[1] + n[1] * twistN, az = a[2] + n[2] * twistN;
            const al = Math.hypot(ax, ay, az) || 1;
            const bx = ax / al, by = ay / al, bz = az / al;
            const nl = unit([n[0] + bx * fold, n[1] + by * fold, n[2] + bz * fold]);
            const nr = unit([n[0] - bx * fold, n[1] - by * fold, n[2] - bz * fold]);
            const l = m.v(q[0] + bx * w, q[1] + by * w, q[2] + bz * w, nl[0], nl[1], nl[2], cr, cg, cb, sw, LEAF, 1, s);
            const r = m.v(q[0] - bx * w, q[1] - by * w, q[2] - bz * w, nr[0], nr[1], nr[2], cr * 0.92, cg * 0.95, cb, sw, LEAF, -1, s);
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

// Fallen palm frond litter: a single rachis with a few dry leaflets, for beach / grove floor.
function makeFallenFrond(seed) {
  const rnd = seeded(seed * 419 + 9);
  const m = new Mesh();
  const L = 1.6 + rnd() * 1.4;
  const curl = (rnd() - 0.5) * 0.9;
  const brown = [0.28 + rnd() * 0.1, 0.2 + rnd() * 0.08, 0.08 + rnd() * 0.05];
  const pts = [];
  let p = [0, 0.02, 0];
  const segs = 7;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const yaw = curl * t * t;
    const lift = 0.04 * Math.sin(t * Math.PI) - 0.02 * t;
    const T = [Math.cos(yaw), lift * 4, Math.sin(yaw)];
    const len = Math.hypot(T[0], T[1], T[2]) || 1;
    T[0] /= len; T[1] /= len; T[2] /= len;
    const S = [-T[2], 0, T[0]];
    pts.push({ p: p.slice(), T, S });
    p = [p[0] + T[0] * (L / segs), p[1] + T[1] * (L / segs), p[2] + T[2] * (L / segs)];
  }
  let prev = null;
  for (let k = 0; k <= segs; k++) {
    const q = pts[k], t = k / segs, w = 0.012 * (1 - t * 0.7);
    const a = m.v(q.p[0] + q.S[0] * w, q.p[1], q.p[2] + q.S[2] * w, 0, 1, 0, brown[0], brown[1], brown[2], 0, SOLID);
    const b = m.v(q.p[0] - q.S[0] * w, q.p[1], q.p[2] - q.S[2] * w, 0, 1, 0, brown[0], brown[1], brown[2], 0, SOLID);
    if (prev) { m.tri(prev, a, prev + 1); m.tri(prev + 1, a, b); }
    prev = a;
  }
  const nLeaf = 5 + ((rnd() * 4) | 0);
  for (let i = 0; i < nLeaf; i++) {
    const t = 0.15 + rnd() * 0.75, f = t * segs, k0 = Math.min(segs - 1, f | 0);
    const A = pts[k0], side = rnd() < 0.5 ? -1 : 1;
    const len = 0.18 + rnd() * 0.35 * (1 - t * 0.5);
    const col = [brown[0] * (0.85 + rnd() * 0.3), brown[1] * (0.9 + rnd() * 0.25), brown[2]];
    addLeaflet(m, A.p[0], A.p[1] + 0.01, A.p[2],
      A.T[0] * 0.2 + A.S[0] * side, -0.15 - rnd() * 0.2, A.T[2] * 0.2 + A.S[2] * side,
      len, 0.018 + rnd() * 0.012, col, 0, (rnd() - 0.5) * 0.6);
  }
  return m;
}

// Fern / tree-fern: curved rachis with paired pinnae that shrink toward the tip.
function makeFern(seed) {
  const rnd = seeded(seed || 2);
  const m = new Mesh();
  const tall = (seed % 5) === 0; // occasional tree fern
  const trunkH = tall ? 0.35 + rnd() * 0.55 : 0;
  if (tall) {
    const bark = cylinder(6, 5, 0.045, 0.03, trunkH, [0.22, 0.18, 0.12], 0.02);
    appendMesh(m, bark, 0, 0, 0, rnd() * 3, 1, null, 1);
  }
  const n = tall ? 5 + (seed % 3) : 6 + (seed % 4);
  const baseY = trunkH;
  for (let i = 0; i < n; i++) {
    const ang = i / n * Math.PI * 2 + rnd() * 0.7 + Math.sin(i * 1.7) * 0.2;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const sx = -dz, sz = dx;
    const len = (tall ? 0.55 : 0.38) + rnd() * (tall ? 0.35 : 0.28);
    const lift = tall ? 0.55 + rnd() * 0.35 : 0.35 + rnd() * 0.4;
    const droop = 0.55 + rnd() * 0.7;
    const steps = tall ? 9 : 8;
    const col = [0.06 + rnd() * 0.05, 0.26 + rnd() * 0.14, 0.06 + rnd() * 0.03];
    // Rachis as a thin arched stalk.
    let prev = -1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const e = lift - droop * Math.pow(t, 1.6);
      const x = dx * t * len, z = dz * t * len;
      const y = baseY + Math.sin(Math.max(0, e)) * len * 0.22 + t * len * Math.sin(e) * 0.35 - t * t * len * 0.08;
      const rr = 0.008 * (1 - t * 0.7);
      const a0 = m.v(x + sx * rr, y, z + sz * rr, sx, 0.2, sz, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.25 + t * 0.4, SOLID);
      const a1 = m.v(x - sx * rr, y, z - sz * rr, -sx, 0.2, -sz, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.25 + t * 0.4, SOLID);
      if (prev >= 0) { m.tri(prev, a0, prev + 1); m.tri(prev + 1, a0, a1); }
      prev = a0;
      if (s === 0 || s === steps) continue;
      // Paired pinnae, longest mid-frond, smaller toward tip and base.
      const bell = Math.sin(t * Math.PI);
      const pinLen = (0.05 + bell * (tall ? 0.14 : 0.11)) * (0.75 + rnd() * 0.5);
      const pinW = 0.008 + bell * 0.01;
      for (let side = -1; side <= 1; side += 2) {
        const stagger = (side < 0 ? 0.02 : 0) + (rnd() - 0.5) * 0.03;
        addLeaflet(m, x + dx * stagger, y, z + dz * stagger,
          dx * 0.15 + sx * side, 0.05 - t * 0.25, dz * 0.15 + sz * side,
          pinLen, pinW, col, 0.4 + t * 0.55, (rnd() - 0.5) * 0.4);
      }
    }
  }
  return m;
}

// Small understory tree / juvenile palm-like canopy: short trunk, irregular radial leaves.
function makeCanopy(seed, lod) {
  const rnd = seeded(seed || 5);
  const m = new Mesh();
  const H = 0.55 + rnd() * 0.45;
  const trunk = cylinder(7, 7, 0.085 + rnd() * 0.04, 0.035 + rnd() * 0.02, H, [0.28 + rnd() * 0.06, 0.18 + rnd() * 0.05, 0.11], 0.035);
  appendMesh(m, trunk, 0, 0, 0, rnd() * 3, 1, null, 1);
  const form = seed % 3;
  const leaves = form === 0 ? 7 + (seed % 3) : form === 1 ? 10 + (seed % 4) : 6 + (seed % 3);
  for (let i = 0; i < leaves; i++) {
    const ang = i * 2.399 + rnd() * 0.55;
    const reach = (form === 1 ? 0.22 : 0.3) + rnd() * (form === 2 ? 0.4 : 0.28);
    const wid = form === 2 ? 0.14 + rnd() * 0.06 : 0.08 + rnd() * 0.05;
    const col = [0.06 + rnd() * 0.06, 0.22 + rnd() * 0.14, 0.04 + rnd() * 0.04];
    const up = form === 0 ? 0.55 + rnd() * 0.35 : 0.12 + rnd() * 0.4;
    addLeaflet(m, Math.cos(ang) * 0.05, H - 0.02, Math.sin(ang) * 0.05,
      Math.cos(ang), up, Math.sin(ang), reach, wid, col, 0.22 + rnd() * 0.12, (rnd() - 0.5) * 0.5, lod ? 0 : 4);
  }
  return m;
}

// Broad-leaf understory: banana-like large blades or multi-fan tropical foliage.
function makeBroad(seed, lod) {
  const rnd = seeded(seed || 3);
  const m = new Mesh();
  const form = seed % 3;
  const H = form === 0 ? 0.28 + rnd() * 0.2 : 0.38 + rnd() * 0.28;
  const trunk = cylinder(7, 5, form === 0 ? 0.05 : 0.07, 0.03, H, [0.28, 0.2, 0.12], 0.025);
  appendMesh(m, trunk, 0, 0, 0, rnd() * 3, 1, null, 1);
  if (form === 0) {
    // Large single blades — banana / heliconia style.
    const n = 4 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2 + rnd() * 0.6;
      const col = [0.1 + rnd() * 0.05, 0.3 + rnd() * 0.1, 0.07];
      addLeaflet(m, Math.cos(ang) * 0.04, H * 0.7, Math.sin(ang) * 0.04,
        Math.cos(ang) * 0.4, 0.75 + rnd() * 0.4, Math.sin(ang) * 0.4,
        0.42 + rnd() * 0.22, 0.085 + rnd() * 0.04, col, 0.4, (rnd() - 0.5) * 0.35, lod ? 0 : 5);
    }
  } else {
    const fans = 5 + (seed % 4);
    for (let i = 0; i < fans; i++) {
      const ang = i / fans * Math.PI * 2 + rnd() * 0.5;
      const reach = 0.24 + rnd() * 0.26;
      const x = Math.cos(ang) * reach * 0.35, z = Math.sin(ang) * reach * 0.35;
      const nLeaf = form === 1 ? 5 : 3 + ((rnd() * 3) | 0);
      for (let k = 0; k < nLeaf; k++) {
        const a = ang + (k - (nLeaf - 1) * 0.5) * (0.22 + rnd() * 0.12);
        const col = [0.08 + rnd() * 0.07, 0.24 + rnd() * 0.14, 0.05 + rnd() * 0.04];
        addLeaflet(m, x, H * (0.55 + rnd() * 0.3), z, Math.cos(a), 0.25 + rnd() * 0.45, Math.sin(a),
          0.18 + rnd() * 0.16, 0.035 + rnd() * 0.03, col, 0.3 + rnd() * 0.2, (rnd() - 0.5) * 0.45, lod ? 0 : 3);
      }
    }
  }
  return m;
}

function makeShrub(seed) {
  const rnd = seeded(seed || 9);
  const m = new Mesh();
  const dense = seed % 2 === 0;
  const fans = dense ? 6 + (seed % 4) : 4 + (seed % 3);
  for (let i = 0; i < fans; i++) {
    const ang = i / fans * Math.PI * 2 + rnd() * 0.9;
    const y = 0.01 + rnd() * 0.08;
    const nLeaf = dense ? 5 : 3 + ((rnd() * 3) | 0);
    for (let k = 0; k < nLeaf; k++) {
      const a = ang + (k - (nLeaf - 1) * 0.5) * (0.28 + rnd() * 0.2);
      const young = rnd() < 0.25;
      const col = young
        ? [0.22 + rnd() * 0.1, 0.4 + rnd() * 0.1, 0.1]
        : [0.12 + rnd() * 0.1, 0.28 + rnd() * 0.12, 0.06 + rnd() * 0.03];
      addLeaflet(m, Math.cos(ang) * (0.03 + rnd() * 0.04), y, Math.sin(ang) * (0.03 + rnd() * 0.04),
        Math.cos(a), 0.4 + rnd() * 0.55, Math.sin(a),
        0.12 + rnd() * 0.14, 0.022 + rnd() * 0.025, col, 0.45 + rnd() * 0.2, (rnd() - 0.5) * 0.5);
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
  const count = 9 + (Math.abs(sd) % 5);
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.283, py = rnd() * 1.7 - 0.45;
    const l = Math.hypot(1, py);
    planes.push([Math.cos(a) / l, py / l, Math.sin(a) / l, 0.38 + rnd() * 0.48]);
  }
  // Stretch axes so rocks are not sphere-derived blobs.
  const ax = 0.75 + rnd() * 0.55, ay = 0.55 + rnd() * 0.5, az = 0.7 + rnd() * 0.6;
  const n = src.pos.length / 3;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = src.pos[i * 3] * ax, y = src.pos[i * 3 + 1] * ay, z = src.pos[i * 3 + 2] * az;
    const lump = 1 + (vnoise(x * 1.6 + sd, z * 1.6 + y * 1.3) - 0.5) * 0.7;
    x *= lump; y *= lump; z *= lump;
    for (let k = 0; k < planes.length; k++) {
      const pl = planes[k];
      const d = x * pl[0] + y * pl[1] + z * pl[2] - pl[3];
      if (d > 0) { x -= pl[0] * d; y -= pl[1] * d; z -= pl[2] * d; }
    }
    const fine = (vnoise(x * 6.5 + sd, z * 6.5 + y * 5.1) - 0.5) * 0.09;
    const chip = (vnoise(x * 14 + sd * 3, z * 14 + y * 11) - 0.55) * 0.05;
    x += src.nrm[i * 3] * (fine + chip); z += src.nrm[i * 3 + 2] * (fine + chip);
    y = (y + src.nrm[i * 3 + 1] * (fine + chip)) * (y < 0 ? 0.42 : 0.78);
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
    // Mute chroma — weathered volcanic rock, not painted grey plastic.
    const lichen = top * (0.5 + 0.5 * vnoise(mx * 7 + 2, mz * 7));
    m.v(mx, my, mz, N[i * 3] / nl, ny, N[i * 3 + 2] / nl,
      0.26 * k * (1 - top * 0.18) * (1 - lichen * 0.15),
      0.24 * k * (1 + top * 0.06 + lichen * 0.12),
      0.21 * k * (1 - top * 0.22) * (1 - lichen * 0.08), 0, ROCK);
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

// A limb: a tapering tube with wood for a surface. flare swells the foot into buttress roots.
function addLimb(m, pts, r0, r1, sides, col, sway0, sway1, flare) {
  tube(m, pts, sides, true, (t, ang, len) => [
    (r0 + (r1 - r0) * t) * (1 + (flare ? flare * Math.pow(1 - t, 5) * (0.5 + Math.max(0, Math.cos(ang * 3 + flare * 40))) : 0)),
    col[0], col[1], col[2], sway0 + (sway1 - sway0) * t, WOOD, ang / 6.2832, len]);
}

// Forest canopy trees with distinct silhouettes: spreading, emergent, rounded, multi-stem,
// sparse irregular, slender coastal. Leaf masses stay CROWN for the shader leaf cells.
function makeTree(seed, lod) {
  const sd = (seed | 0) || 1, rnd = seeded(sd * 13 + 5), m = new Mesh();
  const form = Math.abs(sd) % 6;
  // 0 spreading · 1 emergent · 2 dense round · 3 multi-stem · 4 sparse · 5 slender
  const th = form === 1 ? 0.55 + rnd() * 0.28 : form === 5 ? 0.42 + rnd() * 0.18 : form === 2 ? 0.32 + rnd() * 0.14 : 0.38 + rnd() * 0.22;
  const lean = form === 5 ? (rnd() - 0.5) * 0.28 : (rnd() - 0.5) * (form === 4 ? 0.2 : 0.12);
  const bow = (rnd() - 0.5) * (form === 4 ? 0.12 : 0.07);
  const r0 = form === 5 ? 0.016 + rnd() * 0.008 : form === 1 ? 0.028 + rnd() * 0.012 : 0.022 + rnd() * 0.012;
  const bark = [0.18 + rnd() * 0.08, 0.14 + rnd() * 0.06, 0.1 + rnd() * 0.04];
  const at = (t, L) => [(L || lean) * t * t + bow * Math.sin(t * 3.1416), th * t, bow * 0.6 * Math.sin(t * 2.2)];
  const rings = [7, 4, 2][lod];
  const buildTrunk = (L, fat, flareK) => {
    const pts = [];
    for (let i = 0; i <= rings; i++) pts.push(at(Math.pow(i / rings, 1.55), L));
    if (lod === 2) pts.push([L || lean, th + 0.2, 0]);
    addLimb(m, pts, fat, fat * 0.55, [9, 6, 4][lod], bark, 0, 0.012, lod < 2 ? flareK : 0);
    return pts;
  };
  const flare = (form === 1 ? 1.0 : 0.55) + rnd() * 0.85;
  buildTrunk(lean, r0, flare);
  if (form === 3 && lod < 2) {
    // Second / third stems for multi-stem tropical habit.
    const stems = 1 + ((rnd() * 2) | 0);
    for (let s = 0; s < stems; s++) {
      const a = rnd() * 6.28, off = 0.04 + rnd() * 0.05;
      const L2 = lean + Math.cos(a) * 0.08;
      const pts = [];
      for (let i = 0; i <= rings; i++) {
        const t = Math.pow(i / rings, 1.5);
        const p = at(t, L2);
        pts.push([p[0] + Math.cos(a) * off * (1 - t), p[1] * (0.85 + rnd() * 0.1), p[2] + Math.sin(a) * off * (1 - t)]);
      }
      addLimb(m, pts, r0 * 0.7, r0 * 0.4, [7, 5, 3][lod], bark, 0, 0.014, lod < 2 ? flare * 0.6 : 0);
    }
  }
  const lobes = form === 2 ? 7 + (Math.abs(sd) % 3)
    : form === 1 ? 4 + (Math.abs(sd) % 2)
    : form === 4 ? 4 + (Math.abs(sd) % 3)
    : form === 5 ? 4 + (Math.abs(sd) % 2)
    : 5 + (Math.abs(sd) % 4);
  const spread = form === 2 ? 0.14 + rnd() * 0.08
    : form === 1 ? 0.12 + rnd() * 0.1
    : form === 5 ? 0.1 + rnd() * 0.08
    : form === 4 ? 0.22 + rnd() * 0.16
    : 0.18 + rnd() * 0.14;
  const hue = rnd();
  const green = [
    0.04 + hue * 0.03 + (form === 4 ? 0.02 : 0),
    0.1 + hue * 0.04 + (form === 2 ? 0.02 : 0),
    0.025 + (1 - hue) * 0.015
  ];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  // One leaf: a blade folded along its midrib, four vertices. d is the way it points,
  // up the way its face looks, out the way the crown's surface looks there: the shading
  // normal leans toward that, so a crown is lit as one rounded mass and not as noise.
  const leafAt = (o, d, up, out, len, wid, col, sway) => {
    const sd = unit(cross(up, d)), nn = unit(cross(d, sd));
    const ns = unit([nn[0] + out[0] * 0.9, nn[1] + out[1] * 0.9 + 0.25, nn[2] + out[2] * 0.9]);
    const ix = [];
    // Stalk end, the two widest points, the tip: two triangles that meet along the midrib.
    for (const [t, side, c] of [[0, 0, 0.8], [0.46, 1, 1], [0.46, -1, 1], [1, 0, 1.12]]) {
      const h = side ? wid * 0.3 : -t * len * 0.3;
      ix.push(m.v(o[0] + d[0] * len * t + sd[0] * wid * side + nn[0] * h,
        o[1] + d[1] * len * t + sd[1] * wid * side + nn[1] * h,
        o[2] + d[2] * len * t + sd[2] * wid * side + nn[2] * h,
        ns[0] - sd[0] * side * 0.3, ns[1] - sd[1] * side * 0.3, ns[2] - sd[2] * side * 0.3,
        col[0] * c, col[1] * c, col[2] * c, sway * (1 + 0.5 * t), LEAF, side, t));
    }
    m.tri(ix[0], ix[3], ix[1]); m.tri(ix[0], ix[2], ix[3]);
  };
  for (let i = 0; i < lobes; i++) {
    const blob = icosphere(lod ? 1 : 2, 1, [0.1, 0.1, 0.1]), n = blob.pos.length / 3;
    const ang = form === 4 ? rnd() * 6.28 : i * 2.399 + rnd() * (form === 2 ? 0.35 : 0.9);
    const rr = i === 0 ? (form === 2 ? spread * 0.2 : 0) : spread * (form === 4 ? 0.4 + rnd() : 0.55 + rnd() * 0.7);
    const size = (i === 0 ? (form === 1 ? 0.2 : 0.26) : (form === 1 ? 0.14 : 0.16)) + rnd() * (form === 2 ? 0.07 : 0.1);
    const cy = th + (i === 0 ? (form === 1 ? 0.22 : 0.15) : rnd() * (form === 1 ? 0.22 : 0.14)) + size * 0.28;
    const cx = Math.cos(ang) * rr + lean, cz = Math.sin(ang) * rr;
    const flat = form === 2 ? 0.7 + rnd() * 0.15 : form === 1 ? 0.4 + rnd() * 0.15 : 0.48 + rnd() * 0.22;
    if (lod < 2 && (i === 0 || form !== 2 || rnd() > 0.3)) {
      const s0 = at(i === 0 ? 1 : 0.62 + rnd() * 0.35), e = [cx, cy - size * flat * 0.2, cz], q = [];
      const c = [s0[0] + (e[0] - s0[0]) * 0.25, s0[1] + (e[1] - s0[1]) * 0.8, s0[2] + (e[2] - s0[2]) * 0.25];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
        q.push([s0[0] * a + c[0] * b + e[0] * d, s0[1] * a + c[1] * b + e[1] * d, s0[2] * a + c[2] * b + e[2] * d]);
      }
      addLimb(m, q, r0 * (i === 0 ? 0.55 : 0.32), r0 * 0.12, [5, 4][lod], bark, 0.012, 0.032, 0);
    }
    // Where the lobe's surface is, in the direction (x, y, z) from its middle.
    const lumpAt = (x, y, z) => 0.7 + 0.42 * vnoise(x * 2.3 + sd + i * 3.1, z * 2.3 + y * 1.9) + 0.24 * vnoise(x * 5.3 + i * 7.7, z * 5.3 + y * 4.1 + sd);
    const swayAt = (y) => (form === 5 ? 0.04 : 0.028) + Math.max(0, Math.min(1, y * 0.5 + 0.5)) * 0.038;
    // The mass inside: what shows between the leaves, and all there is of a far tree. Near,
    // it sits back under the leaves and is their shade; far, it is the crown and is their colour.
    const core = [0.78, 0.92, 1.04][lod], dark = [0.8, 0.9, 0.95][lod];
    for (let v = 0; v < n; v++) {
      const x = blob.pos[v * 3], y = blob.pos[v * 3 + 1], z = blob.pos[v * 3 + 2];
      const lump = lumpAt(x, y, z) * core;
      const px = x * lump * size, py = y * lump * size * (y < 0 ? flat * 0.5 : flat), pz = z * lump * size;
      blob.pos[v * 3] = px + cx; blob.pos[v * 3 + 1] = py + cy; blob.pos[v * 3 + 2] = pz + cz;
      const up = Math.max(0, Math.min(1, y * 0.5 + 0.5));
      const lightK = (0.7 + 0.3 * up) * dark;
      // Sparse crowns leave darker interiors; rounded ones stay denser/brighter on top.
      const dens = form === 2 ? 1.08 : form === 4 ? 0.85 : 1;
      blob.col[v * 3] = green[0] * lightK * dens;
      blob.col[v * 3 + 1] = green[1] * lightK * dens;
      blob.col[v * 3 + 2] = green[2] * lightK * dens;
      blob.sway[v] = swayAt(y);
      blob.kind[v] = CROWN;
    }
    appendMesh(m, blob, 0, 0, 0, 0, 1, null, 1);
    if (lod === 2) continue;
    // The leaves: sprays set over the lobe, thick on top and thin underneath, each a twig's
    // end with its leaves turned out to the light. The coarser level keeps one spray in four
    // and makes its leaves bigger, so the crown covers the same sky from further off.
    const lr = seeded(sd * 53 + i * 131 + 7);
    const nSpray = Math.max(26, Math.min(76, Math.round(1100 * size * size)));
    const big = lod ? 2.3 : 1.12;
    for (let k = 0; k < nSpray; k++) {
      // Even over the sphere, from the top down to well under the equator.
      const yy = 1 - (k + 0.5) / nSpray * 1.72, rad = Math.sqrt(Math.max(0, 1 - yy * yy)), ga = k * 2.39996 + i;
      const j0 = lr(), j1 = lr(), j2 = lr(), j3 = lr();
      if (lod && (k & 3)) { for (let q = 0; q < 6 * 4; q++) lr(); continue; }
      const dir = unit([rad * Math.cos(ga) + (j0 - 0.5) * 0.3, yy + (j1 - 0.5) * 0.3, rad * Math.sin(ga) + (j2 - 0.5) * 0.3]);
      const lump = lumpAt(dir[0], dir[1], dir[2]) * (0.9 + j3 * 0.16);
      const o = [cx + dir[0] * lump * size, cy + dir[1] * lump * size * (dir[1] < 0 ? flat * 0.5 : flat), cz + dir[2] * lump * size];
      const out = unit([dir[0], dir[1] / flat, dir[2]]);
      const upK = Math.max(0, Math.min(1, dir[1] * 0.5 + 0.5)), lightK = 0.5 + 0.62 * upK * upK;
      // A side of the twig, and the other side.
      const sa = unit(cross(out, [0.31, 0.9, 0.29])), sb = cross(out, sa);
      const nLeaf = lod ? 4 : 5;
      for (let q = 0; q < 6; q++) {
        const r0l = lr(), r1l = lr(), r2l = lr(), r3l = lr();
        if (q >= nLeaf) continue;
        const a = q / nLeaf * 6.2832 + r0l * 0.9, ca = Math.cos(a), sn = Math.sin(a);
        // Leaves stand out round the twig and hang a little; their faces look up and out.
        const d = unit([sa[0] * ca + sb[0] * sn + out[0] * 0.3, sa[1] * ca + sb[1] * sn + out[1] * 0.3 - 0.3 - r1l * 0.35, sa[2] * ca + sb[2] * sn + out[2] * 0.3]);
        const face = unit([out[0] * 0.7 + (r2l - 0.5) * 0.5, out[1] * 0.7 + 0.75, out[2] * 0.7 + (r3l - 0.5) * 0.5]);
        const len = (0.026 + 0.014 * r2l) * big, tone = lightK * (0.82 + 0.5 * r3l), young = r1l > 0.86 ? 1 : 0;
        leafAt([o[0] + d[0] * 0.004, o[1] + d[1] * 0.004, o[2] + d[2] * 0.004], d, face, out, len, len * (0.3 + 0.08 * r0l),
          [green[0] * tone * (1 + 0.9 * young), green[1] * tone * (1 + 0.35 * young), green[2] * tone * 0.9], swayAt(dir[1]) + 0.012);
      }
    }
  }
  // How far each part gives to the wind was written as if the model were the tree. It is one
  // unit tall and stands 6 to 19 m, and what the wind moves is metres: a trunk barely, a
  // bough a hand's breadth in a breeze. As written, nothing moved that could be seen.
  for (let i = 0; i < m.sway.length; i++) m.sway[i] *= 14;
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

// One grass clump: irregular blades of mixed height, width, lean and tip taper — not a
// radial starburst of identical quads.
function grassGeom() {
  const pos = [], uv = [], idx = [];
  let base = 0;
  const blades = 7;
  for (let a = 0; a < blades; a++) {
    const ang = a * 2.399 + (a * 0.17) % 1.1;
    const c = Math.cos(ang), s = Math.sin(ang);
    const lean = 0.08 + (a % 5) * 0.06 + (a === 2 ? 0.12 : 0);
    const h = 0.55 + (a % 4) * 0.14 + ((a * 3) % 5) * 0.05;
    const w0 = 0.09 + (a % 3) * 0.035;
    const w1 = 0.012 + (a % 2) * 0.01;
    const bend = ((a % 3) - 1) * 0.04;
    const corn = [
      [-w0, 0, 0, 0], [w0, 0, 1, 0],
      [w1 + bend, h, 1, 1], [-w1 + bend, h, 0, 1]
    ];
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
// Every prototype mesh in one vertex buffer and one index buffer. A vertex is 32 bytes:
// the position as three floats, then eight half floats: normal and kind, colour and sway, uv.
// Indices are 16 bit and count from the start of their own mesh.
const VBYTES = 32;
const halfF = new Float32Array(1), halfU = new Uint32Array(halfF.buffer);
function half(x) {
  halfF[0] = x;
  const b = halfU[0], s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 255) - 112, m = b & 0x7fffff;
  if (e <= 0) return e < -10 ? s : s | ((((m | 0x800000) >> (13 - e)) + 1) >> 1);
  if (e > 30) return s | 0x7c00;
  return (s | (e << 10) | (m >> 13)) + ((m >> 12) & 1);
}
function packMeshes(list) {
  let nv = 0, ni = 0;
  for (const m of list) { nv += m.pos.length / 3; ni += m.idx.length; }
  const f = new Float32Array(nv * VBYTES / 4), h = new Uint16Array(f.buffer), idx = new Uint16Array(ni);
  const ranges = [];
  let v0 = 0, i0 = 0;
  for (const m of list) {
    const n = m.pos.length / 3;
    if (n > 65535) throw new Error('mesh too large for 16-bit indices');
    for (let i = 0; i < n; i++) {
      const a = (v0 + i) * 8, b = a * 2 + 6;
      f[a] = m.pos[i * 3]; f[a + 1] = m.pos[i * 3 + 1]; f[a + 2] = m.pos[i * 3 + 2];
      h[b] = half(m.nrm[i * 3]); h[b + 1] = half(m.nrm[i * 3 + 1]); h[b + 2] = half(m.nrm[i * 3 + 2]); h[b + 3] = half(m.kind[i]);
      h[b + 4] = half(m.col[i * 3]); h[b + 5] = half(m.col[i * 3 + 1]); h[b + 6] = half(m.col[i * 3 + 2]); h[b + 7] = half(m.sway[i]);
      h[b + 8] = half(m.uv[i * 2]); h[b + 9] = half(m.uv[i * 2 + 1]);
    }
    idx.set(m.idx, i0);
    ranges.push({ first: i0, count: m.idx.length, base: v0 });
    v0 += n; i0 += m.idx.length;
  }
  return { vert: f, idx: idx, ranges: ranges };
}

// Plants and rocks are a few prototype meshes drawn many times. An instance is
// 12 floats: position and yaw, scale and vertical stretch, tint.
const ISTRIDE = 12;
// Spatial cells for plant culling (Abyssal Garden cell-sort idea): skip whole regions
// outside reach instead of testing every instance every frame. Visibility leash unchanged.
const SC_OX = -560, SC_OZ = -560, SC_CW = 35, SC_N = 32, SC_CELLS = SC_N * SC_N;
function Scatter() { this.protos = []; this.data = []; this.kind = []; }
// lods: meshes from finest to coarsest. cuts: the distance where each one hands over.
// far: the same for the mirror and the shadow maps, which start a level down; they are
// given only where the view's cuts are further out than those passes have any use for.
// leafy: the plant's leaves are single blades that can come and go one at a time (fsMesh).
Scatter.prototype.proto = function (lods, radius, cuts, far, leafy) {
  this.protos.push({ lods: lods, r: radius, cuts: cuts || [], far: far || cuts || [], leafy: leafy ? 128 : 0 });
  return this.protos.length - 1;
};
// soft: wind stiffness (i1.w); bias: leaf age/hue bias packed in tint.w (i2.w).
Scatter.prototype.add = function (id, x, y, z, rot, sc, tint, sy, soft, bias) {
  const t = tint || [1, 1, 1];
  this.data.push(x, y, z, rot, sc, sy || 1, 0, soft == null ? 1 : soft, t[0], t[1], t[2], bias == null ? 0.5 : bias);
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
  this.fadeQ = new Uint8Array(this.n);
  this.counts = new Int32Array(meshes.length);
  this.starts = new Int32Array(meshes.length);
  this.cursor = new Int32Array(meshes.length);
  // Rotating draw lists for per-frame passes only. Long-lived lists (island shadow)
  // must pass their own array via `into` — never alias the pool.
  this.drawPool = [[], [], [], []];
  this.drawPoolI = 0;
  // Prefix-sum cell index: plant indices sorted by XZ cell (AG world packing).
  const hist = new Int32Array(SC_CELLS + 1);
  const d = this.data;
  for (let i = 0; i < this.n; i++) {
    const o = i * ISTRIDE;
    const cx = Math.min(SC_N - 1, Math.max(0, (d[o] - SC_OX) / SC_CW | 0));
    const cz = Math.min(SC_N - 1, Math.max(0, (d[o + 2] - SC_OZ) / SC_CW | 0));
    hist[cx + cz * SC_N + 1]++;
  }
  for (let c = 1; c <= SC_CELLS; c++) hist[c] += hist[c - 1];
  const order = new Int32Array(this.n);
  const put = hist.slice();
  for (let i = 0; i < this.n; i++) {
    const o = i * ISTRIDE;
    const cx = Math.min(SC_N - 1, Math.max(0, (d[o] - SC_OX) / SC_CW | 0));
    const cz = Math.min(SC_N - 1, Math.max(0, (d[o + 2] - SC_OZ) / SC_CW | 0));
    order[put[cx + cz * SC_N]++] = i;
  }
  this.cellStart = hist;
  this.cellOrder = order;
  this.seenGen = new Int32Array(this.n);
  this.epoch = 1;
};
// Cull, pick a level of detail, and group by mesh. Writes instances into out at
// offset at (in instances) and returns the draws. vp null means no frustum test.
// into: optional persistent draw list (required for lists kept across frames).
Scatter.prototype.collect = function (out, at, vp, ex, ey, ez, reach, coarser, into) {
  const d = this.data, counts = this.counts, starts = this.starts, slotOf = this.slotOf;
  const order = this.cellOrder, cellStart = this.cellStart, seenGen = this.seenGen;
  const cap = (out.length / ISTRIDE) | 0;
  const fadeQ = this.fadeQ;
  counts.fill(0);
  // Generation stamp avoids clearing the whole slot array each collect (AG-style).
  let epoch = this.epoch + 1;
  if (epoch > 0x7ffffffe) { seenGen.fill(0); epoch = 1; }
  this.epoch = epoch;
  // Only walk cells that can intersect the reach sphere (same leash as before).
  const pad = reach + 240;
  const x0 = Math.min(SC_N - 1, Math.max(0, ((ex - pad) - SC_OX) / SC_CW | 0));
  const x1 = Math.min(SC_N - 1, Math.max(0, ((ex + pad) - SC_OX) / SC_CW | 0));
  const z0 = Math.min(SC_N - 1, Math.max(0, ((ez - pad) - SC_OZ) / SC_CW | 0));
  const z1 = Math.min(SC_N - 1, Math.max(0, ((ez + pad) - SC_OZ) / SC_CW | 0));
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = cx + cz * SC_N;
      // Reject cells whose centre is well outside reach (still include large-plant leash margin).
      const mx = SC_OX + (cx + 0.5) * SC_CW - ex;
      const mz = SC_OZ + (cz + 0.5) * SC_CW - ez;
      if (mx * mx + mz * mz > (pad + SC_CW) * (pad + SC_CW)) continue;
      const a0 = cellStart[cell], a1 = cellStart[cell + 1];
      for (let k = a0; k < a1; k++) {
        const i = order[k];
        const o = i * ISTRIDE, p = this.protos[this.kind[i]];
        const x = d[o], y = d[o + 1], z = d[o + 2], sc = d[o + 4], r = p.r * sc;
        const dx = x - ex, dz = z - ez;
        const reachI = reach + Math.min(220, r * 12);
        const distXZ = Math.hypot(dx, dz);
        let slot = -1, q = 0;
        if (distXZ - r < reachI) {
          const dy = y - ey;
          const dist = Math.hypot(distXZ, dy);
          if (dist - r < reachI) {
            // The near shadow map (no view, coarser): a small plant's shadow is lost in the
            // map's filter past the middle of the box, so it is not drawn into it there.
            let ok = vp || !coarser || r > 1.2 || dist < reach * 0.42;
            if (vp) {
              const hr = Math.max(r, sc * 0.55);
              const cy = y + hr * 0.55;
              const cw = vp[3] * x + vp[7] * cy + vp[11] * z + vp[15];
              const cxi = vp[0] * x + vp[4] * cy + vp[8] * z + vp[12];
              const cv = vp[1] * x + vp[5] * cy + vp[9] * z + vp[13];
              // The mirrored view (coarser) is seen only in moving water: small plants far off are not in it.
              // In the view itself a plant under a pixel and a half across is left out, whatever the
              // size of the canvas: drawn, it is a dot that comes and goes as the eye turns.
              ok = cw > -hr && Math.abs(cxi) < cw + hr * 2.8 && Math.abs(cv) < cw + hr * 2.8 && hr > dist * (coarser ? 0.03 : Math.max(0.0016, (this.pxw || 0) * 1.5));
            }
            if (ok) {
              let lod = coarser;
              const bias = Math.min(28, r * 1.8), last = p.lods.length - 1, cuts = coarser ? p.far : p.cuts;
              // From altitude, keep finer crowns a little longer.
              const airBias = ey > 35 ? Math.min(55, (ey - 35) * 0.45) : 0;
              while (lod < cuts.length && lod < last) {
                const c = cuts[lod] + bias + airBias;
                if (dist <= c) break;
                // In a view, a level does not switch at its cut. Over the next 14 m (less for
                // a cut close by) the plant is drawn at both levels, and the finer one's share
                // of it falls from all to none. The share follows distance alone, so there is
                // no moment of change and nothing to flip back and forth at a boundary.
                const t = (dist - c) / Math.min(c * 0.3, 14);
                if (vp && t < 1) { q = Math.max(1, Math.min(63, Math.round((1 - t) * 64))) + p.leafy; break; }
                lod++;
              }
              slot = this.slot0[this.kind[i]] + Math.min(lod, last);
              counts[slot]++;
              if (q) counts[slot + 1]++;
            }
          }
        }
        fadeQ[i] = q;
        slotOf[i] = slot;
        seenGen[i] = epoch;
      }
    }
  }
  let run = at;
  const draws = into || this.drawPool[this.drawPoolI++ & 3];
  draws.length = 0;
  for (let s = 0; s < counts.length; s++) {
    starts[s] = run;
    const take = Math.min(counts[s], Math.max(0, cap - run));
    if (take) { const g = this.packed.ranges[s]; draws.push(g.first, g.count, g.base, run, take); }
    counts[s] = take;
    run += take;
  }
  const cursor = this.cursor;
  cursor.set(starts);
  // Manual copy — avoids per-instance TypedArray.subarray allocations (GC spikes).
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = cx + cz * SC_N;
      const a0 = cellStart[cell], a1 = cellStart[cell + 1];
      for (let k = a0; k < a1; k++) {
        const i = order[k];
        if (seenGen[i] !== epoch) continue;
        const s = slotOf[i];
        if (s < 0) continue;
        // A plant between two levels goes into both, with the finer one's share packed above
        // the wind exposure (which is under 2): 1..63 on the finer copy, 64 more on the
        // coarser, and 128 more on both for a leafy plant.
        const q = fadeQ[i], o = i * ISTRIDE;
        for (let b = q ? 1 : 0; b >= 0; b--) {
          const dst = cursor[s + b];
          if (dst >= starts[s + b] + counts[s + b]) continue;
          cursor[s + b] = dst + 1;
          const t = dst * ISTRIDE;
          out[t] = d[o]; out[t + 1] = d[o + 1]; out[t + 2] = d[o + 2]; out[t + 3] = d[o + 3];
          out[t + 4] = d[o + 4]; out[t + 5] = d[o + 5]; out[t + 6] = d[o + 6] + (q ? 2 * (q + b * 64) : 0); out[t + 7] = d[o + 7];
          out[t + 8] = d[o + 8]; out[t + 9] = d[o + 9]; out[t + 10] = d[o + 10]; out[t + 11] = d[o + 11];
        }
      }
    }
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

// A place to stand knee-deep in the lagoon and a way to look from it: clear water ahead with a
// shore beyond it, a wooded bank close on one side and the open sea on the other, and the sun
// behind the shoulder so that the bank is lit and the water is not glare. It is searched for,
// not drawn at random, so the planting that follows is the same whatever it finds.
function findShallows(world, at, sx, sz) {
  let best = null, bs = 0;
  for (let dz = -64; dz <= 64; dz += 4) {
    for (let dx = -64; dx <= 64; dx += 4) {
      const x = at.x + dx, z = at.z + dz, h = fieldSample(world, x, z);
      if (h > -0.2 || h < -0.45) continue;
      for (let k = 0; k < 16; k++) {
        const yaw = k * Math.PI / 8;
        // Along the middle of the frame and each side of it: how far the water runs, and how
        // much dry land stands behind where it ends, the nearer counting for more.
        const run = [0, 0, 0], bank = [0, 0, 0];
        for (let r = 0; r < 3; r++) {
          const fx = Math.sin(yaw + (r - 1) * 0.4), fz = -Math.cos(yaw + (r - 1) * 0.4);
          let shore = false;
          for (let d = 6; d <= 126; d += 6) {
            const g = fieldSample(world, x + fx * d, z + fz * d);
            if (!shore && g < -0.15) run[r] = d;
            else { shore = true; if (g > 0.5) bank[r] += 20 / d; }
          }
        }
        const n = run[0] < run[2] ? 0 : 2;
        if (run[1] < 30 || run[n] < 18 || run[n] > 36 || run[2 - n] < 120) continue;
        const sc = 2.5 - (Math.sin(yaw) * sx - Math.cos(yaw) * sz) * 1.5 - Math.abs(run[1] - 55) / 55 + Math.min(bank[1], 1.5) + Math.min(bank[n], 1.5);
        if (sc > bs) { bs = sc; best = { x: x, z: z, h: h, yaw: yaw }; }
      }
    }
  }
  return best;
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
// The six places are the six numbered views: card n, key n and view n are one camera, in
// this order. Each is somewhere worth going, and no two are the same kind of place.
const PLACES = [
  { title: 'Palm Beach', line: 'White sand, leaning palms and the wash running up the shore', swatch: 'linear-gradient(#bfe0ea, #37a9a0 48%, #efe3c4 52%)' },
  { title: 'Cliff Overlook', line: 'High on the bluff, with the cove and its shallows below', swatch: 'linear-gradient(#c9d8e2, #4f9f9c 46%, #2f5a3c 78%)' },
  { title: 'Island From Above', line: 'The whole island, ringed by reef and turquoise water', swatch: 'radial-gradient(circle at 50% 55%, #2f6b3a 0 22%, #e4d6ae 23% 30%, #46bfae 31% 56%, #1d6a94)' },
  { title: 'Lagoon Shallows', line: 'Knee-deep in clear water, with palms along the lagoon shore', swatch: 'linear-gradient(#d3ecee, #58c6b6 50%, #cfe3c4)' },
  { title: 'Offshore', line: 'Out on the swell, the island standing across the water', swatch: 'linear-gradient(#b7cbe4 40%, #2c7a50 41% 47%, #1d6f98 48%, #0f4a70)' },
  { title: 'Coral Garden', line: 'Under the surface, beside a coral head and its school', swatch: 'linear-gradient(#2a8fa2, #1f6f86 55%, #e8b7b0)' }
];
// The water the island opens with and keeps.
const WATER = { amp: 0.55, spd: 0.85, frq: 0.9, dir: 0.08, layers: 7, cx: 0.9, rough: 0.09, refl: 0.82, refr: 1.15, alpha: 1, depthK: 0.55, sun: 1.02, sky: 1.02, sunAng: -0.1, sim: 1, rip: 0.75, ripSpd: 0.95, disturb: 0.85, ripSize: 1.15, deep: [0.012, 0.08, 0.11], shal: [0.05, 0.26, 0.24], mood: [0.55, 0, 0.12, 0.65] };
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
function putPlace(p) {
  WP_KEYS.forEach((k) => { wp[k] = p[k]; });
  wp.deep[0] = p.deep[0]; wp.deep[1] = p.deep[1]; wp.deep[2] = p.deep[2];
  wp.shal[0] = p.shal[0]; wp.shal[1] = p.shal[1]; wp.shal[2] = p.shal[2];
  wp.mood[0] = p.mood[0]; wp.mood[1] = p.mood[1]; wp.mood[2] = p.mood[2]; wp.mood[3] = p.mood[3];
}
// The view the island opens on: a slow look round the lagoon from a little above it.
function openOrbit() {
  const s = spots[3] || spots[0];
  putPlace(WATER);
  trip = null;
  orbit = true;
  targetX = s.x + Math.sin(s.yaw) * 14;
  targetZ = s.z - Math.cos(s.yaw) * 14;
  orbitYaw = s.yaw + Math.PI; orbitPitch = 0.36; orbitDist = 22;
  applyOrbitPose();
  markPlace(-1);
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
function markPlace(i) {
  document.querySelectorAll('#places button').forEach((b, n) => b.classList.toggle('on', n === i));
}
// Go to place i, which is view i + 1. Flown there, the camera leaves from wherever it is,
// rises over what lies between, and comes down onto the view exactly.
function goPlace(i, animate) {
  const s = spots[i];
  if (!s || !PLACES[i]) return;
  markPlace(i);
  showCaption(PLACES[i]);
  if (!animate) { trip = null; goSpot(i); return; }
  orbit = false;
  mode = 2;
  setFlyMode(true);
  const apart = Math.hypot(s.x - camX, s.y - camY, s.z - camZ);
  // One smooth arc, as high as it has to be to pass over the ground and the trees between.
  const clear = Math.min(22, apart * 0.25);
  let lift = Math.min(72, apart * 0.28);
  for (let k = 1; k < 48 && apart > 2; k++) {
    const u = ease01(k / 48), arc = Math.sin(Math.PI * u);
    const g = fieldSample(world, camX + (s.x - camX) * u, camZ + (s.z - camZ) * u);
    // Close to either end only the ground matters: one end may be under water.
    const need = arc > 0.2 ? Math.max(g, 0) + clear * Math.min(1, arc * 1.2) : g + 0.4;
    lift = Math.max(lift, Math.min(150, (need - camY - (s.y - camY) * u) / arc));
  }
  trip = { t: 0, dur: Math.min(7, 2 + (apart + lift) / 80), i: i, x: camX, y: camY, z: camZ, yaw: yaw, pitch: pitch, lift: lift, far: apart > 2 };
}
function advanceTrip(dt) {
  const s = spots[trip.i];
  trip.t += dt;
  const u = ease01(trip.t / trip.dur);
  if (u >= 1) { const i = trip.i; trip = null; goSpot(i); return; }
  const arc = Math.sin(Math.PI * u);
  camX = trip.x + (s.x - trip.x) * u;
  camZ = trip.z + (s.z - trip.z) * u;
  camY = trip.y + (s.y - trip.y) * u + arc * trip.lift;
  // Never through the ground, whatever the arc missed. Both ends are exact: one is under water.
  const d = Math.min(2, fieldSample(world, camX, camZ) + 0.5 - camY);
  if (d > -2 && trip.far) camY += (d + 2) * (d + 2) / 8 * Math.min(1, arc * 8);
  yaw = lerpAng(trip.yaw, s.yaw, u);
  // Looking a little down at the island while high over it.
  pitch = trip.pitch + (s.pitch - trip.pitch) * u - arc * Math.min(0.3, trip.lift / 150);
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
  PLACES.forEach((p, id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    const sw = document.createElement('i');
    sw.style.background = p.swatch;
    sw.textContent = id + 1;
    const name = document.createElement('b');
    name.textContent = p.title;
    const line = document.createElement('span');
    line.textContent = p.line;
    b.append(sw, name, line);
    b.addEventListener('click', () => {
      document.body.classList.remove('places-open');
      goPlace(id, mode === 2);
    });
    nav.append(b);
  });
  $('placebtn').addEventListener('click', () => document.body.classList.toggle('places-open'));
  $('hourbtn').addEventListener('click', () => stepHour(false));
  $('skybtn').addEventListener('click', () => stepWeather(false));
  $('walkbtn').addEventListener('click', () => {
    trip = null;
    orbit = false;
    setFlyMode(false);
    mode = 2;
    document.body.classList.add('playing', 'studio');
    document.body.classList.remove('places-open', 'cinema');
    showModeHint(false);
    tryLockPointer();
  });
  const flyBtn = $('flybtn');
  if (flyBtn) flyBtn.addEventListener('click', () => {
    trip = null;
    orbit = false;
    mode = 2;
    document.body.classList.add('playing', 'studio');
    document.body.classList.remove('places-open', 'cinema');
    setFlyMode(true);
    showModeHint(true);
    tryLockPointer();
  });
  const musicBtn = $('musicbtn');
  if (musicBtn) musicBtn.addEventListener('click', () => { musicOn = !musicOn; paintMusic(); });
  const sfxBtn = $('sfxbtn');
  if (sfxBtn) sfxBtn.addEventListener('click', () => setSfx(!sfxOn));
  paintSfx();
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
// Everything the island makes by itself: surf, wind, rain, birds, insects, frogs, bubbles.
// The music is not one of them and has its own switch.
let sfxOn = true;
try { sfxOn = localStorage.getItem('ww-sfx') !== '0'; } catch (e) {}
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
  const sfx = ac.createGain();
  sfx.gain.value = sfxOn ? 1 : 0;
  master.connect(sfx); sfx.connect(under); under.connect(ac.destination);
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
  // Layered wind ambience — same shared gust as plants/ocean, filtered noise only.
  function windBed(type, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    const p = ac.createStereoPanner(); p.pan.value = 0;
    src.connect(f); f.connect(g); g.connect(p); p.connect(master);
    src.start(0, Math.random() * 20);
    return { gain: g, filter: f, pan: p };
  }
  const airFar = windBed('lowpass', 180, 0.4);
  const airCoast = windBed('bandpass', 520, 0.55);
  const airPalm = windBed('bandpass', 1400, 0.7);
  const airCanopy = windBed('bandpass', 900, 0.5);
  const airGrass = windBed('highpass', 3200, 0.45);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.047;
  const lfoG = ac.createGain(); lfoG.gain.value = 160;
  lfo.connect(lfoG); lfoG.connect(surf.filter.frequency); lfo.start();
  const lfo2 = ac.createOscillator();
  lfo2.frequency.value = 0.013;
  const lfo2G = ac.createGain(); lfo2G.gain.value = 90;
  lfo2.connect(lfo2G); lfo2G.connect(wind.filter.frequency); lfo2.start();
  const panLfo = ac.createOscillator(); panLfo.frequency.value = 0.021;
  const panAmt = ac.createGain(); panAmt.gain.value = 0.4;
  panLfo.connect(panAmt); panAmt.connect(airCoast.pan.pan); panLfo.start();
  const panLfo2 = ac.createOscillator(); panLfo2.frequency.value = 0.017;
  const panAmt2 = ac.createGain(); panAmt2.gain.value = 0.28;
  panLfo2.connect(panAmt2); panAmt2.connect(airPalm.pan.pan); panLfo2.start();
  // Underwater rush (Abyssal): same noise bed, bandpass that opens with swim speed.
  const rush = bed('bandpass', 280, 0.55);
  const api = {
    ac: ac, master: master, under: under, sfx: sfx,
    surf: surf.gain, hiss: hiss.gain, wind: wind.gain, insects: insects.gain,
    airFar: airFar.gain, airCoast: airCoast.gain, airPalm: airPalm.gain,
    airCanopy: airCanopy.gain, airGrass: airGrass.gain,
    airCoastF: airCoast.filter, airPalmF: airPalm.filter, airCanopyF: airCanopy.filter,
    rush: rush.gain, rushF: rush.filter,
    shoreAmt: 0.4, underAmt: 0, alive: true, hush: 1, birds: 1, _gustPeak: 0, _tBub: 0
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
  // s: heat, dark, low, dawn, rain, gust m/s, wood, shore, palm, alt, under, heard.
  api.air = (s) => {
    const m = muted ? 0 : 1, dry = 1 - Math.min(1, s.rain * 3), up = Math.exp(-Math.max(s.alt, 0) * 0.04) * (s.under ? 0 : 1);
    const near = (d, r) => (d == null ? 0 : Math.pow(Math.max(0, 1 - d / r), 2));
    const ease = (p, v) => { p.value += (v - p.value) * 0.12; };
    const g2 = Math.min(3, (s.gust * s.gust) / 25);
    const breeze = Math.min(1, s.gust / 6);
    const blow = Math.min(1, s.gust / 11);
    cicadas.gain.value = m * 0.05 * s.heat * dry * (0.25 + 0.75 * s.wood) * up * api.hush * (1 - 0.4 * blow);
    crickets.gain.value = m * 0.045 * s.dark * dry * (0.4 + 0.6 * s.wood) * up * (1 - 0.5 * blow);
    chorus.gain.value = m * 0.03 * Math.max(s.dark, s.low * 0.5) * dry * up;
    rain.gain.value = m * 0.1 * s.rain * (s.under ? 0.15 : 1);
    patter.gain.value = m * 0.09 * s.rain * s.rain * (s.under ? 0.3 : 1);
    rustle.gain.value = m * 0.028 * g2 * (0.25 + 0.75 * s.wood) * up;
    // Shared-wind ambience layers.
    ease(airFar.gain, m * 0.035 * (0.2 + 0.8 * breeze) * up);
    ease(airCoast.gain, m * 0.055 * blow * (0.35 + 0.65 * (s.shore || 0)) * up);
    ease(airPalm.gain, m * 0.04 * g2 * (0.2 + 0.8 * (s.palm || 0)) * up);
    ease(airCanopy.gain, m * 0.045 * g2 * (0.15 + 0.85 * s.wood) * up);
    ease(airGrass.gain, m * 0.022 * breeze * (1 - 0.6 * s.wood) * (1 - (s.shore || 0) * 0.3) * up);
    // Gust whoosh: open filters briefly when a strong cell arrives.
    if (s.gust > api._gustPeak + 1.8 && s.gust > 7) {
      api._gustPeak = s.gust;
      const t = ac.currentTime;
      airCoastF.frequency.cancelScheduledValues(t);
      airCoastF.frequency.setValueAtTime(airCoastF.frequency.value, t);
      airCoastF.frequency.exponentialRampToValueAtTime(900, t + 0.15);
      airCoastF.frequency.exponentialRampToValueAtTime(520, t + 1.4);
    }
    api._gustPeak += (s.gust - api._gustPeak) * 0.04;
    ease(bee.g, m * 0.05 * near(s.heard.bee, 1.2)); bee.f.value = 205 + 18 * Math.sin(ac.currentTime * 11);
    ease(mosq.g, m * 0.02 * near(s.heard.mosquito, 1));
    ease(dfly, m * 0.07 * near(s.heard.dragonfly, 1.2));
    // Cicadas go quiet when a bird calls close by, and take a while to start again.
    api.hush += (1 - api.hush) * 0.004;
    api.birds = (1 - s.dark) * dry * (0.5 + s.dawn) * (1 - 0.35 * blow);
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
  // Underwater bubble bursts (Abyssal): short rising blips while submerged.
  const bubble = () => {
    if (!api.alive) return;
    if (!muted && api.underAmt > 0.4 && Math.random() < 0.45) {
      const t = ac.currentTime;
      const n = 1 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
        const f0 = 480 + Math.random() * 900, len = 0.04 + Math.random() * 0.07;
        const a = t + i * (0.03 + Math.random() * 0.05);
        o.type = 'sine'; o.frequency.setValueAtTime(f0, a); o.frequency.exponentialRampToValueAtTime(f0 * 1.7, a + len);
        g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.02, a + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, a + len);
        p.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(g); g.connect(p); p.connect(sfx); o.start(a); o.stop(a + len + 0.02);
      }
    }
    setTimeout(bubble, 180 + Math.random() * 520 / Math.max(api.underAmt, 0.15));
  };
  bubble();
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

function setSfx(on) {
  sfxOn = on;
  try { localStorage.setItem('ww-sfx', on ? '1' : '0'); } catch (e) {}
  // A short ramp, so that the switch is not itself a click.
  if (audio) audio.sfx.gain.setTargetAtTime(on ? 1 : 0, audio.ac.currentTime, 0.03);
  paintSfx();
}
function paintSfx() {
  const b = $('sfxbtn');
  if (!b) return;
  b.textContent = sfxOn ? 'SFX On' : 'SFX Off';
  b.setAttribute('aria-pressed', sfxOn ? 'true' : 'false');
}
function paintMusic() {
  const b = $('musicbtn');
  if (!b) return;
  b.textContent = musicOn ? 'Music' : 'Quiet';
  b.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
}

const K = Object.create(null);
['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].forEach((c) => { K[c] = 0; });
let lookX = 0, lookY = 0, dragging = false, touchN = 0;
let velX = 0, velY = 0, velZ = 0;
// What a walker cannot pass through: trunks, boulders and the skiff as upright columns,
// coral and sea stacks as domes. Each is a circle on the plan at the eye's height.
let walkHits = []; // x, z, radius of each column, as it is planted
let reefBlocks = null;
let walkC = null, walkL = null, walkGrid = null; // x, z, radius, centre height, dome?; links; 4 m cells of both
// The pad keeps the near plane out of the bark and no more: a walker fits between any two
// trunks that stand apart.
const WALK_PAD = 0.22, WALK_CELL = 4;
const walkOut = [0, 0];
// The height the eye came to stand at on the last step, before any easing toward it.
let walkEye = 1e9;

// T moves the clock to the next part of the day. R changes the weather, which then stays
// until R is pressed again past the end of the list, where the island takes it back.
function stepHour(back) { envNextStop(back); if (!qstr.has('shot')) env.run = true; showCaption(envLabel()); }
function stepWeather(back) {
  const names = Object.keys(WEATHER), i = names.indexOf(env.wx) + (back ? -1 : 1);
  env.auto = i < 0 || i >= names.length;
  envSet(names[(i + names.length) % names.length], false);
  env.hold = env.auto ? 240 : 1e9;
  showCaption(envLabel());
}
function paintMoveMode() {
  const w = $('walkbtn'), f = $('flybtn');
  if (w) w.setAttribute('aria-pressed', fly ? 'false' : 'true');
  if (f) f.setAttribute('aria-pressed', fly ? 'true' : 'false');
}
function setFlyMode(on) {
  fly = !!on;
  if (fly) dive = 0;
  velX = velY = velZ = 0;
  paintMoveMode();
}
function showModeHint(flying) {
  hintEl.textContent = flying
    ? 'WASD · Space up · Ctrl down · Shift fast · Esc release look'
    : 'Click to look · WASD move · Shift run · Q dive · F fly · Esc release';
  showHint = 6;
  hintEl.classList.add('show');
}
function tryLockPointer() {
  const canvas = $('c');
  if (!canvas || document.pointerLockElement === canvas || qstr.has('shot')) return;
  const fail = () => {
    hintEl.textContent = 'Click the view to look around';
    showHint = 4;
    hintEl.classList.add('show');
  };
  try {
    const req = canvas.requestPointerLock({ unadjustedMovement: true });
    if (req && typeof req.then === 'function') req.catch(fail);
  } catch (err) {
    try { canvas.requestPointerLock(); } catch (e2) { fail(); }
  }
}
function walkBuild() {
  const B = reefBlocks || [], nc = walkHits.length / 3, n = nc + B.length / 4;
  walkC = new Float32Array(n * 5);
  for (let i = 0; i < nc; i++) walkC.set([walkHits[i * 3], walkHits[i * 3 + 1], walkHits[i * 3 + 2], 0, 0], i * 5);
  for (let i = 0; i < B.length / 4; i++) walkC.set([B[i * 4], B[i * 4 + 2], B[i * 4 + 3], B[i * 4 + 1], 1], (nc + i) * 5);
  // Two columns too close to walk between are one obstacle: the gap is closed by a link from
  // one to the other, so the pair is walked round like a wall and has no notch to stop in.
  // A link is the two circles and the straight sides that touch both; its last number is
  // the slant of those sides, which is how far along the link the nearest side leans.
  const L = [], linked = new Uint8Array(n);
  for (let i = 0; i < nc * 3; i += 3) {
    for (let j = i + 3; j < nc * 3; j += 3) {
      const dx = walkHits[j] - walkHits[i];
      if (Math.abs(dx) > 7) continue;
      const ri = walkHits[i + 2], rj = walkHits[j + 2], d = Math.hypot(dx, walkHits[j + 1] - walkHits[i + 1]);
      if (d >= ri + rj + WALK_PAD * 2 + 0.15) continue;
      // A column standing wholly within another adds nothing to it.
      if (d <= Math.abs(ri - rj)) { linked[(ri < rj ? i : j) / 3] = 1; continue; }
      const s = (ri - rj) / d;
      linked[i / 3] = linked[j / 3] = 1;
      L.push(walkHits[i], walkHits[i + 1], walkHits[j], walkHits[j + 1], ri, rj, s / Math.sqrt(1 - s * s));
    }
  }
  walkL = new Float32Array(L);
  // Everything is listed in every cell it reaches into, so a step reads one cell. Links are
  // listed as -1 - their offset. A link's ends are its columns, which are then not listed
  // themselves: the two would push a walker different ways where they meet.
  walkGrid = new Map();
  const list = (id, xa, xb, za, zb) => {
    const x1 = Math.floor(xb / WALK_CELL), z1 = Math.floor(zb / WALK_CELL);
    for (let cz = Math.floor(za / WALK_CELL); cz <= z1; cz++) {
      for (let cx = Math.floor(xa / WALK_CELL); cx <= x1; cx++) {
        const key = (cx + 512) * 1024 + cz + 512, cell = walkGrid.get(key);
        if (cell) cell.push(id); else walkGrid.set(key, [id]);
      }
    }
  };
  for (let i = 0; i < n * 5; i += 5) {
    const r = walkC[i + 2] + WALK_PAD;
    if (!linked[i / 5]) list(i, walkC[i] - r, walkC[i] + r, walkC[i + 1] - r, walkC[i + 1] + r);
  }
  for (let j = 0; j < L.length; j += 7) {
    const r = Math.max(L[j + 4], L[j + 5]) + WALK_PAD;
    list(-1 - j, Math.min(L[j], L[j + 2]) - r, Math.max(L[j], L[j + 2]) + r, Math.min(L[j + 1], L[j + 3]) - r, Math.max(L[j + 1], L[j + 3]) + r);
  }
}
// Moves a point out of whatever it stands in, to the nearest edge: walking into a trunk
// slides round it, and an eye set down inside one is put beside it, never held there.
// Returns 0 if the point stood free, 1 if it was moved and came to rest, 2 if it was still
// being moved after six rounds, as it is in a nook where two obstacles meet at a sharp angle.
function walkFree(x, z, y) {
  let pass = 0;
  for (; pass < 6 && walkGrid; pass++) {
    const cell = walkGrid.get((Math.floor(x / WALK_CELL) + 512) * 1024 + Math.floor(z / WALK_CELL) + 512);
    if (!cell) break;
    let hit = false;
    for (let k = 0; k < cell.length; k++) {
      const i = cell[k];
      let ox, oz, R;
      if (i < 0) {
        // The circle of a link that the point is nearest to: found along the slant of the
        // link's side, not straight across, or the wider end would stand out of its link.
        const j = -1 - i, bx = walkL[j + 2] - walkL[j], bz = walkL[j + 3] - walkL[j + 1], px = x - walkL[j], pz = z - walkL[j + 1];
        const t = Math.max(0, Math.min(1, (px * bx + pz * bz - Math.abs(px * bz - pz * bx) * walkL[j + 6]) / (bx * bx + bz * bz)));
        ox = walkL[j] + bx * t; oz = walkL[j + 1] + bz * t; R = walkL[j + 4] + (walkL[j + 5] - walkL[j + 4]) * t + WALK_PAD;
      } else {
        ox = walkC[i]; oz = walkC[i + 1]; R = walkC[i + 2] + WALK_PAD;
        // Coral and sea stacks are domes: straight-sided below their middle, so there is
        // no going in under one, and round above it, where an eye higher up passes closer.
        const dy = y - walkC[i + 3];
        if (walkC[i + 4] && dy > 0) {
          R = R * R - dy * dy;
          if (R <= 0) continue;
          R = Math.sqrt(R);
        }
      }
      // A point put on an edge is out of it, whichever side of the edge rounding leaves it.
      const dx = x - ox, dz = z - oz, d2 = dx * dx + dz * dz;
      if (d2 >= R * (R - 2e-6)) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-4) { x = ox + dx / d * R; z = oz + dz / d * R; } else x = ox + R;
      hit = true;
    }
    if (!hit) break;
  }
  walkOut[0] = x; walkOut[1] = z;
  return pass > 5 ? 2 : pass ? 1 : 0;
}
// The top of the coral or sea stack under a point. It is a floor to the eye: a diver comes
// to rest on a dome and does not sink into it from above.
function walkTop(x, z) {
  const cell = walkGrid && walkGrid.get((Math.floor(x / WALK_CELL) + 512) * 1024 + Math.floor(z / WALK_CELL) + 512);
  let top = -1e9;
  for (let k = 0; cell && k < cell.length; k++) {
    const i = cell[k];
    if (i < 0 || !walkC[i + 4]) continue;
    const R = walkC[i + 2] + WALK_PAD, dx = x - walkC[i], dz = z - walkC[i + 1], h2 = R * R - dx * dx - dz * dz;
    if (h2 > 0) top = Math.max(top, walkC[i + 3] + Math.sqrt(h2));
  }
  return top;
}
// One walking step of dt seconds at the velocity held in velX, velZ.
function walkStep(dt, time) {
  const speed = Math.hypot(velX, velZ);
  let held = false;
  if (speed * dt > 1e-5) {
    const x0 = camX, z0 = camZ;
    // Short steps: a run at a low frame rate neither passes through a trunk nor steps over a bank.
    const n = Math.ceil(speed * dt / 0.12), h = dt / n, e = 0.4;
    const wl = waveY(world, camX, camZ, time) - 0.25;
    for (let s = 0; s < n; s++) {
      let mx = velX * h, mz = velZ * h;
      // Ground too steep to climb takes the climb out of a step and leaves the rest, so a
      // cliff is walked along and never holds the walker. Water counts as level.
      const gx = (Math.max(fieldSample(world, camX + e, camZ), wl) - Math.max(fieldSample(world, camX - e, camZ), wl)) / (2 * e);
      const gz = (Math.max(fieldSample(world, camX, camZ + e), wl) - Math.max(fieldSample(world, camX, camZ - e), wl)) / (2 * e);
      const g2 = gx * gx + gz * gz;
      if (g2 > 1.21) {
        const up = mx * gx + mz * gz;
        if (up > 0) { const k = Math.min(1, (Math.sqrt(g2) - 1.1) / 0.9) * up / g2; mx -= gx * k; mz -= gz * k; }
      }
      // A step that does not come to rest, that ends further off than it set out to go
      // (thrown across an obstacle out of a nook) or that ends behind where it began is
      // not taken. The walker stays, and is moved only if that place is itself inside something.
      // Rocks are met at the lower of where the eye is and where it is settling to: they
      // are as wide or wider lower down, so neither is ever inside one.
      const y = Math.min(walkEye, camY), met = walkFree(camX + mx, camZ + mz, y), ax = walkOut[0] - camX, az = walkOut[1] - camZ;
      if (met > 1 || ax * mx + az * mz < 0 || Math.hypot(ax, az) > Math.hypot(mx, mz) * 1.5 + 0.01) walkFree(camX, camZ, y);
      camX = walkOut[0]; camZ = walkOut[1];
      if (met) held = true;
    }
    held = held && Math.hypot(camX - x0, camZ - z0) < speed * dt * 0.5;
    // What is left of the velocity is what the ground allowed. Being moved out of a trunk adds none.
    const vx = (camX - x0) / dt, vz = (camZ - z0) / dt, k = Math.min(1, speed / (Math.hypot(vx, vz) || 1));
    velX = vx * k; velZ = vz * k;
  }
  const gh = fieldSample(world, camX, camZ);
  const wh = waveY(world, camX, camZ, time);
  if (gh < wh - 0.25) {
    if (K.KeyQ) dive = Math.min(6, dive + dt * 1.6);
    else if (K.KeyE || K.Space) dive = Math.max(0, dive - dt * 2.2);
    else if (dive < 0.7) dive = Math.max(0, dive - dt * 0.35);
    // A diver pressing on against coral floats up until the way is clear over it. A hollow
    // among the coral heads, sunk into from above, is left the same way and holds nobody.
    if (held && !K.KeyQ) dive = Math.max(0, Math.min(dive, wh + 0.42 - camY) - dt * 1.5);
  } else {
    dive = Math.max(0, Math.min(dive, 0.7) - dt * 3.5);
  }
  // One height from dry land through wading to swimming and diving: the eye stands over the
  // ground or floats, whichever is higher, and a dive lowers both. Nothing switches at the
  // waterline, so a wave passing the walker's knees does not move the eye.
  // A rock is a floor too: a wave that falls away under a swimmer over one leaves the eye
  // resting on it, where a wall at the lower height would have pushed the swimmer off.
  const top = walkTop(camX, camZ);
  const eye = walkEye = Math.max(gh + 1.65 - 1.2 * Math.min(1, dive / 0.7), wh + 0.42 - dive, top);
  camY += (eye - camY) * (qstr.has('shot') ? 1 : 1 - Math.exp(-dt * 18));
  // The easing is for comfort; it is never allowed to leave the eye in the ground or the coral.
  camY = Math.max(camY, gh + 0.3, top);
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
    if (e.code === 'KeyX') setSfx(!sfxOn);
    if (e.code === 'KeyH') statsEl.hidden = !statsEl.hidden;
    if (e.code === 'KeyF' && mode === 2 && !orbit) {
      setFlyMode(!fly);
      showModeHint(fly);
    }
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
      // First Esc releases look without resetting the camera; second opens the menu.
      if (document.pointerLockElement) {
        document.exitPointerLock();
        return;
      }
      openMenu();
    }
    if (e.code === 'KeyC' && mode === 2) $('watchbtn').click();
    if (e.code === 'KeyT' && mode > 0) stepHour(e.shiftKey);
    if (e.code === 'KeyR' && mode > 0) stepWeather(e.shiftKey);
    if (e.code >= 'Digit1' && e.code <= 'Digit6' && mode === 2) goPlace(e.code.charCodeAt(5) - 49, true);
  });
  addEventListener('keyup', (e) => { if (K[e.code] != null) K[e.code] = 0; });
  const canvas = $('c');
  canvas.addEventListener('mousedown', (e) => {
    if (mode !== 2 || e.button !== 0) return;
    dragging = true;
    if (orbit) { downX = e.clientX; downY = e.clientY; moved = 0; return; }
    tryLockPointer();
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
    // FPS look only while pointer-locked. Mouse look never moves the player.
    if (document.pointerLockElement === canvas) { lookX += e.movementX; lookY += e.movementY; }
  });
  canvas.addEventListener('touchstart', (e) => {
    touchN = e.touches.length;
    if (mode === 2) e.preventDefault();
    if (e.touches[0]) { touchLX = e.touches[0].clientX; touchLY = e.touches[0].clientY; if (orbit) moved = 0; }
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
    const locked = document.pointerLockElement === $('c');
    document.body.classList.toggle('locked', locked);
    if (!locked && mode === 2 && !orbit && !qstr.has('shot')) {
      hintEl.textContent = 'Click to look · Esc menu';
      showHint = 4;
      hintEl.classList.add('show');
    }
  });
  document.addEventListener('pointerlockerror', () => {
    hintEl.textContent = 'Click the view to look around';
    showHint = 4;
    hintEl.classList.add('show');
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
  document.body.classList.remove('playing', 'places-open', 'cinema', 'cinema-peek', 'locked');
  velX = velY = velZ = 0;
  if (document.pointerLockElement) document.exitPointerLock();
}
function goSpot(i) {
  orbit = false;
  const s = spots[i];
  if (!s) return;
  camX = s.x; camY = s.y; camZ = s.z; yaw = s.yaw; pitch = s.pitch;
  setFlyMode(!!s.fly); dive = s.dive || 0;
  mode = 2;
  velX = velY = velZ = 0;
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
    // Timestamp queries when the adapter offers them (Abyssal Garden GPU timing path).
    const hasTS = adapter.features.has('timestamp-query');
    const device = await adapter.requestDevice(hasTS ? { requiredFeatures: ['timestamp-query'] } : undefined);
    device.addEventListener('uncapturederror', (ev) => {
      const msg = (ev.error && (ev.error.message || ev.error)) || 'gpu error';
      console.error('GPU ' + msg);
      window.__gpuerr = String(msg);
    });
    mark('device');
    // GPU frame timing ring (Abyssal Garden pattern): async MAP_READ of timestamp deltas.
    let gpuMs = 0;
    const tsSlots = [];
    let tsBegin, tsEnd, tsResolve;
    if (hasTS) {
      const qs = device.createQuerySet({ type: 'timestamp', count: 2 });
      tsResolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      for (let i = 0; i < 6; i++) {
        const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const slot = { b, busy: false };
        slot.done = () => {
          const a = new BigInt64Array(b.getMappedRange());
          const ms = Number(a[1] - a[0]) / 1e6;
          gpuMs = ms; b.unmap(); slot.busy = false;
          if (typeof WW_BENCH !== 'undefined' && WW_BENCH.isBench && WW_BENCH.isBench()) WW_BENCH.recordGpu(ms);
        };
        tsSlots.push(slot);
      }
      tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 };
      tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
    }
    const canvas = $('c');
    const context = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();

    const code = shaderCode(q.hres, q.span, q.water);
    const mod = device.createShaderModule({ code: code });
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    const oceanMod = device.createShaderModule({ code: OCEAN_WGSL });
    const VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    // One letter a binding; the letters are listed in gpu.js.
    const ubLayout = layoutOf(device, VS | FS, 'u');
    const geoLayout = layoutOf(device, VS | FS, 'uttdcuttasdf');
    const simLayout = layoutOf(device, FS, 'tu');
    const waterLayout = layoutOf(device, VS | FS, 'tdfstttf');
    // The air pass reads the scene's depth and nothing else from the second group.
    const airLayout = layoutOf(device, FS, 'd', 1);
    const geoPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout] });
    const skyPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout] });
    // The sky's passes each read what the one before made: noise, then weather, then cloud
    // shadow, then the panorama, then the panorama gathered small.
    const skyLayouts = ['vs', 'vsf', 'vsff', '-s--a'].map((w) => layoutOf(device, FS, w, 8));
    const skyPLs = skyLayouts.map((l) => device.createPipelineLayout({ bindGroupLayouts: [ubLayout, l] }));
    const waterPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, waterLayout] });

    // A vertex buffer layout from [location, byte offset, float count] triples.
    const vbuf = (stride, attrs, inst) => ({
      arrayStride: stride, stepMode: inst ? 'instance' : 'vertex',
      attributes: attrs.map(([shaderLocation, offset, n]) => ({ shaderLocation, offset, format: n > 1 ? 'float32x' + n : 'float32' }))
    });
    const posBuf = [vbuf(12, [[0, 0, 3]])], gridBuf = [vbuf(8, [[0, 0, 2]])], oneVec4 = vbuf(16, [[2, 0, 4]], true);
    const meshBuffers = [
      { arrayStride: VBYTES, attributes: [[0, 0, 'float32x3'], [1, 12, 'float16x4'], [2, 20, 'float16x4'], [5, 28, 'float16x2']].map(([shaderLocation, offset, format]) => ({ shaderLocation, offset, format })) },
      vbuf(ISTRIDE * 4, [[6, 0, 4], [7, 16, 4], [8, 32, 4]], true)
    ];
    const bugBuffers = [meshBuffers[0], vbuf(BUG_STRIDE * 4, [6, 7, 8, 9, 10, 11].map((l, i) => [l, i * 16, 4]), true)];
    const depthOn = (fmt, write, cmp) => ({ format: fmt, depthWriteEnabled: write, depthCompare: cmp });
    // Three depth states cover every draw: into the scene, into a shadow map, and over the finished frame.
    const sceneZ = depthOn('depth32float', true, 'less');
    // Sixteen bits is under a centimetre of the island map's 614 m of depth, and half the memory.
    const shadowFmt = 'depth16unorm';
    // Mild slope-scaled bias; receivers add a small constant in-shader (large bias detaches shadows).
    const shadowZ = { ...sceneZ, format: shadowFmt, depthBias: 1, depthBiasSlopeScale: 1.35, depthBiasClamp: 0.002 };
    // Over the finished frame the land hides a fragment in the fragment shader, by the scene's
    // own depth texture (hidden() in the shaders). The pass's depth buffer starts empty and
    // holds only the insects, which sort among themselves and stand in front of the drops.
    const noZ = depthOn('depth24plus', false, 'always');
    const overZ = depthOn('depth24plus', false, 'less');
    const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const lerp = { srcFactor: 'constant', dstFactor: 'one-minus-constant', operation: 'add' };
    const sceneFmt = 'rgba16float';
    const airPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, airLayout] });
    const simPL = device.createPipelineLayout({ bindGroupLayouts: [simLayout] });
    const pipes = {};
    // Every pipeline starts compiling now, in the driver, while this thread shapes the coast.
    // The first picture waits only for the ones listed before `late` is set: sky, land, plants,
    // their shadows, the sea. The wash on the sand, the air's own pass, grass, wildlife and rain
    // join when they are ready.
    // name, layout, vertex entry, fragment entry (none for a shadow), then what differs from
    // the common case: buffers, cull, depth, the target's format and blend, another module.
    const jobs = [], lateJobs = [];
    let late = false;
    const whenBuilt = (name, set, promise) => (late ? lateJobs : jobs).push(promise.then((p) => { set[name] = p; }));
    const pipe = (name, layout, vs, fs, o) => {
      const m = o.module || mod;
      whenBuilt(name, pipes, device.createRenderPipelineAsync({
        layout: layout,
        vertex: { module: m, entryPoint: vs, buffers: o.buffers },
        fragment: fs ? { module: m, entryPoint: fs, targets: [{ format: o.format || sceneFmt, blend: o.blend }] } : undefined,
        primitive: { topology: 'triangle-list', cullMode: o.cull || 'none' },
        depthStencil: o.depth
      }));
    };
    // The sea first: its shader is the longest to compile, so it is given the longest start.
    pipe('water', waterPL, 'vsWater', 'fsWater', { buffers: gridBuf, format: format, depth: noZ });
    pipe('sky', geoPL, 'vsSky', 'fsSky', { depth: depthOn('depth32float', true, 'always') });
    pipe('weather', skyPLs[0], 'vsSky', 'fsWeather', {});
    pipe('cloudShadow', skyPLs[1], 'vsSky', 'fsCloudShadow', {});
    pipe('skyBake', skyPLs[2], 'vsSky', 'fsSkyBake', {});
    pipe('skyDim', skyPLs[3], 'vsSky', 'fsSkyDim', { blend: { color: lerp, alpha: lerp } });
    pipe('skyIrr', skyPLs[3], 'vsSky', 'fsSkyIrr', {});
    pipe('terrain', geoPL, 'vsTerrain', 'fsTerrain', { buffers: posBuf, cull: 'back', depth: sceneZ });
    pipe('mesh', geoPL, 'vsMesh', 'fsMesh', { buffers: meshBuffers, depth: sceneZ });
    pipe('shadowTerrain', skyPL, 'vsShadowTerrain', null, { buffers: posBuf, cull: 'back', depth: shadowZ });
    pipe('shadowMesh', skyPL, 'vsShadowMesh', null, { buffers: meshBuffers, depth: shadowZ });
    // The finished scene goes to the screen through the water's own two groups.
    pipe('blit', waterPL, 'vsSky', 'fsBlit', { format: format, depth: noZ });
    const oceanLayout = layoutOf(device, GPUShaderStage.COMPUTE, 'rwuo');
    const oceanPL = device.createPipelineLayout({ bindGroupLayouts: [oceanLayout] });
    const oceanPipes = {};
    for (const [key, entry] of [['evolve', 'evolve'], ['rows', 'ifft_rows'], ['cols', 'ifft_cols'], ['slopes', 'slopes']]) {
      whenBuilt(key, oceanPipes, device.createComputePipelineAsync({ layout: oceanPL, compute: { module: oceanMod, entryPoint: entry } }));
    }
    late = true;
    // The wash on the beach starts from still water and takes its first frames to arrive, so
    // its pipeline can too.
    pipe('shore', waterPL, 'vsShore', 'fsWater', { buffers: gridBuf, format: format, blend: over, depth: noZ });
    pipe('air', airPL, 'vsSky', 'fsAir', {});
    pipe('grass', geoPL, 'vsGrass', 'fsGrass', { buffers: [vbuf(24, [[0, 0, 3], [1, 16, 2]]), oneVec4], depth: sceneZ });
    pipe('bird', geoPL, 'vsBird', 'fsBird', { buffers: [vbuf(16, [[0, 0, 3], [1, 12, 1]]), oneVec4], depth: sceneZ });
    pipe('fish', geoPL, 'vsFish', 'fsFish', { buffers: meshBuffers, depth: sceneZ });
    pipe('shadowFish', skyPL, 'vsShadowFish', null, { buffers: meshBuffers, depth: shadowZ });
    // Insects go straight onto the finished frame, after the water, so a clear wing over the
    // lagoon is a film over the lagoon and not a hole in it.
    pipe('bug', airPL, 'vsBug', 'fsBug', { buffers: bugBuffers, format: format, blend: over, depth: depthOn('depth24plus', true, 'less') });
    pipe('shadowBug', skyPL, 'vsShadowBug', null, { buffers: bugBuffers, depth: shadowZ });
    pipe('drops', airPL, 'vsDrops', 'fsDrops', { format: format, blend: over, depth: overZ });
    pipe('sim', simPL, 'vs', 'fs', { module: simMod });
    // A capture waits for everything, so it is always the whole picture.
    const READ = qstr.has('read'), READ_AT = parseInt(qstr.get('rf'), 10) || 16;
    const pipesReady = Promise.all(READ ? jobs.concat(lateJobs) : jobs);
    pipesReady.catch(() => {});
    Promise.all(lateJobs).catch((err) => console.error(err));
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
    const wade = findShallows(world, lagoon, sdx, sdz) || { x: lagoon.x, z: lagoon.z, h: lagoon.h, yaw: downhillYaw(world, lagoon.x, lagoon.z) };
    spots = [
      { x: standX, y: eye, z: standZ, yaw: byaw, pitch: pitchBeach, fly: false, dive: 0 },
      { x: cliff.x, y: cliff.h + 1.7, z: cliff.z, yaw: downhillYaw(world, cliff.x, cliff.z), pitch: -0.28, fly: false, dive: 0 },
      { x: 30, y: 168, z: 150, yaw: 0, pitch: -0.7, fly: true, dive: 0 },
      { x: wade.x, y: wade.h + 1.65, z: wade.z, yaw: wade.yaw, pitch: -0.1, fly: false, dive: 0 },
      { x: beach.x + sdx * 38, y: 2.6, z: beach.z + sdz * 38, yaw: face + Math.PI, pitch: -0.05, fly: true, dive: 0 },
      { x: (lagoon.x + 150) * 0.5, y: -1.1, z: lagoon.z, yaw: face, pitch: 0.45, fly: false, dive: 2.2 }
    ];
    // Aerial look-at
    const aerial = spots[2];
    const yp = lookYP(10 - aerial.x, 6 - aerial.y, 0 - aerial.z);
    aerial.yaw = yp[0]; aerial.pitch = yp[1];

    const scatter = new Scatter();
    walkHits = [];
    const pick = (ids, x, z) => ids[Math.abs(Math.floor(x * 7.3 + z * 3.1)) % ids.length];
    const protoSet = (seeds, make, radius) => seeds.map((sd) => scatter.proto([make(sd)], radius));
    const rockIds = [4, 11, 23, 37, 52, 68].map((sd) => scatter.proto([makeRock(sd, 0), makeRock(sd, 1)], 1.3, [70]));
    // Close palms keep every leaflet; coarser crowns carry the silhouette far past the beach.
    // Softer LOD handoffs — abrupt mid/far crown swaps read as tree-top flicker.
    const palmIds = [3, 8, 21, 34, 47, 55].map((sd) => scatter.proto([makePalm(sd, 0), makePalm(sd, 1), makePalm(sd, 2)], 10.5, [70, 200], [55, 185]));
    // A palm leans the way the ground falls, toward the open light over the water.
    const leanYaw = (x, z) => {
      const gx = fieldSample(world, x + 3, z) - fieldSample(world, x - 3, z), gz = fieldSample(world, x, z + 3) - fieldSample(world, x, z - 3);
      return Math.atan2(-gz, -gx) + (rnd() - 0.5) * 1.4;
    };
    const shrubIds = protoSet([5, 9, 14, 22, 27], makeShrub, 1.2);
    const canopyIds = [6, 13, 18, 25].map((sd) => scatter.proto([makeCanopy(sd, 0), makeCanopy(sd, 1)], 2.4, [35]));
    const fernIds = protoSet([7, 12, 19, 24, 30, 33], makeFern, 1.6);
    const broadIds = [2, 15, 28, 36, 41].map((sd) => scatter.proto([makeBroad(sd, 0), makeBroad(sd, 1)], 2.8, [35]));
    let palms = 0, broads = 0, shrubs = 0, rocks = 0, stacks = 0, ferns = 0, canopies = 0;
    const palmSites = [];
    const fernBudget = Math.max(14, (q.broad * 0.7) | 0);
    const canopyBudget = Math.max(5, (q.broad * 0.32) | 0);
    const clearR = 9;
    const sideX = -sdz, sideZ = sdx;
    const rowOx = shore ? shore.x : beach.x;
    const rowOz = shore ? shore.z : beach.z;
    const rowInX = shore ? -shore.fx : -sdx;
    const rowInZ = shore ? -shore.fz : -sdz;
    const rowSideX = shore ? -shore.fz : sideX;
    const rowSideZ = shore ? shore.fx : sideZ;
    const shrubBudget = Math.max(10, (q.broad * 0.55) | 0);
    // Habitat helpers: moist hollows, forest shade, coastal exposure.
    const moistAt = (x, z, h) => smooth01(0.2, 2.2, h) * (1 - smooth01(0.2, 0.7, fieldSlope(world, x, z))) * (0.45 + 0.55 * vnoise(x * 0.02 + 3, z * 0.02));
    const plantSoft = () => 0.65 + rnd() * 0.7;
    const plantBias = () => rnd();
    for (let i = 0; i < 9 && palms < q.palms; i++) {
      const along = shore
        ? (Math.sign(i - 4.5) * (3.8 + Math.abs(i - 4) * 4.0 + (i % 2) * 1.2))
        : (i - 4) * (7.5 + (i % 3)) + (rnd() - 0.5) * 2.5;
      const back = shore ? (1.2 + (i % 3) * 1.1 + rnd() * 0.8) : (7 + (i % 3) * 3.5 + rnd() * 1.5);
      const x = rowOx + rowInX * back + rowSideX * along;
      const z = rowOz + rowInZ * back + rowSideZ * along;
      const h = fieldSample(world, x, z);
      if (h < 0.4 || h > 4.5) continue;
      const tint = [0.88 + rnd() * 0.2, 0.9 + rnd() * 0.16, 0.8 + rnd() * 0.2];
      const psc = 0.75 + rnd() * 0.45;
      scatter.add(pick(palmIds, x, z), x, h, z, leanYaw(x, z), psc, tint, 0.88 + rnd() * 0.28, 1.1 + rnd() * 0.35, plantBias());
      walkHits.push(x, z, 0.22 * psc);
      palmSites.push(x, z, h);
      palms++;
    }
    for (let i = 0; i < (q.palms + q.broad) * 24 && (palms < q.palms || broads < q.broad || shrubs < shrubBudget || ferns < fernBudget || canopies < canopyBudget); i++) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      if (Math.hypot(x - beach.x, z - beach.z) < clearR) continue;
      const clump = vnoise(x * 0.012, z * 0.012);
      const clump2 = vnoise(x * 0.035 + 8, z * 0.035);
      const fm = forestMask(x, z, h, s);
      const moist = moistAt(x, z, h);
      const tint = [0.82 + rnd() * 0.28, 0.86 + rnd() * 0.22, 0.78 + rnd() * 0.26];
      // Coastal palms: wind-exposed, irregular gaps on sand.
      if (palms < q.palms && h > 0.55 && h < 5.8 && s < 0.34 && clump > 0.38 && (h < 2.2 || clump2 > 0.35)) {
        const psc = 0.7 + rnd() * 0.55;
        scatter.add(pick(palmIds, x, z), x, h, z, leanYaw(x, z), psc, tint, 0.85 + rnd() * 0.35, 1.05 + rnd() * 0.4, plantBias());
        walkHits.push(x, z, 0.22 * psc);
        palmSites.push(x, z, h);
        palms++;
      } else if (shrubs < shrubBudget && h > 0.3 && h < 2.8 && s < 0.4 && clump > 0.3 && (h < 1.6 || clump2 > 0.4)) {
        // Beach interior shrubs in irregular clusters.
        scatter.add(pick(shrubIds, x, z), x, h, z, rnd() * 6.28, 1.5 + rnd() * 1.9, tint, 0.65 + rnd() * 0.6, plantSoft(), plantBias());
        shrubs++;
      } else if (ferns < fernBudget && h > 1.1 && h < 14 && s < 0.4 && (moist > 0.45 || fm > 0.35) && clump > 0.4) {
        // Ferns favour humid lowlands and shaded forest floor.
        scatter.add(pick(fernIds, x, z), x, h, z, rnd() * 6.28, 1.15 + rnd() * 1.15, tint, 0.55 + rnd() * 0.5, 0.75 + rnd() * 0.4, plantBias());
        ferns++;
      } else if (canopies < canopyBudget && h > 6 && h < 26 && s < 0.32 && fm > 0.2 && clump > 0.45) {
        scatter.add(pick(canopyIds, x, z), x, h, z, rnd() * 6.28, 4.6 + rnd() * 3.2, tint, 0.85 + rnd() * 0.35, plantSoft(), plantBias());
        canopies++;
      } else if (broads < q.broad && h > 2.4 && h < 18 && s < 0.4 && (fm > 0.15 || moist > 0.4) && clump > 0.38) {
        scatter.add(pick(broadIds, x, z), x, h, z, rnd() * 6.28, 4.8 + rnd() * 3.4, tint, 0.8 + rnd() * 0.4, plantSoft(), plantBias());
        broads++;
      }
    }
    // Flowering shrubs, in the open where the sun reaches: behind the beach, by the lagoon,
    // and along the edge of the forest. Every blossom is somewhere a bee or a butterfly can go.
    const blooms = [], perch = [];
    const flowerIds = [0, 1, 2, 3, 4, 5].map((sd) => { const f = makeFlowerShrub(sd + 1, 0); return { id: scatter.proto([f.mesh, makeFlowerShrub(sd + 1, 1).mesh], 1.8, [55]), blooms: f.blooms }; });
    const plantFlower = (x, z) => {
      const h = fieldSample(world, x, z);
      if (h < 0.7 || h > 9 || fieldSlope(world, x, z) > 0.35) return false;
      const f = flowerIds[(rnd() * flowerIds.length) | 0], rot = rnd() * 6.28, sc = 0.9 + rnd() * 0.5, c = Math.cos(rot), s = Math.sin(rot), B = f.blooms;
      scatter.add(f.id, x, h - 0.02, z, rot, sc, [0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2], 1, 0.85 + rnd() * 0.4, rnd());
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
    // Interior forest: pick form by habitat — slender near coast, emergent inland, rounded in dense cover.
    // Bounding radius must match canopy size or distant trees fail the pixel/frustum tests and pop.
    const treeIds = [31, 48, 65, 82, 99, 116, 133, 150, 167, 184, 201, 218].map((sd) => scatter.proto([makeTree(sd, 0), makeTree(sd, 1), makeTree(sd, 2)], 7.5, [16, 82], [0, 50], true));
    let trees = 0;
    for (let i = 0; i < q.forest * 32 && trees < q.forest; i++) {
      const x = (rnd() - 0.5) * 470;
      const z = (rnd() - 0.5) * 410;
      const h = fieldSample(world, x, z);
      if (h < 1.9) continue;
      const s = fieldSlope(world, x, z);
      const fm = forestMask(x, z, h, s);
      if (fm < 0.28 + rnd() * 0.5) continue;
      // Competition-like spacing + clearings — real forests are not uniform game scatter.
      if (vnoise(x * 0.045 + 2, z * 0.045) < 0.28 && rnd() < 0.62) continue;
      if (vnoise(x * 0.012 + 5, z * 0.012) < 0.32 && rnd() < 0.45) continue;
      const inland = smooth01(3, 14, h);
      const tall = (h < 4 ? 6.2 : 7.2) + inland * (5.5 + rnd() * 3) + rnd() * 4;
      const sy = 0.78 + rnd() * 0.5;
      const tint = [0.72 + rnd() * 0.4, 0.74 + rnd() * 0.32, 0.68 + rnd() * 0.35];
      // Habitat bias: slender coastal (seed%6==5), emergent/round inland dense (1,2).
      const seeds = [31, 48, 65, 82, 99, 116, 133, 150, 167, 184, 201, 218];
      let pickIds = treeIds;
      if (h < 4.5 && inland < 0.35) {
        const coastal = treeIds.filter((_, k) => seeds[k] % 6 === 5 || seeds[k] % 6 === 4);
        if (coastal.length) pickIds = coastal;
      } else if (fm > 0.65 && inland > 0.45) {
        const deep = treeIds.filter((_, k) => seeds[k] % 6 === 1 || seeds[k] % 6 === 2 || seeds[k] % 6 === 3);
        if (deep.length) pickIds = deep;
      }
      // Each habit gives to the wind in its own way: the emergent stands stiff, the slender
      // and the sparse bend, and of one habit the taller tree moves further.
      const pid = pickIds[(rnd() * pickIds.length) | 0];
      const flex = [0.75, 0.5, 0.6, 0.8, 0.9, 1][seeds[treeIds.indexOf(pid)] % 6] * (0.5 + 0.5 * tall / 19);
      scatter.add(pid, x, h - 0.15, z, rnd() * 6.28, tall, tint, sy, flex * (0.85 + rnd() * 0.3), rnd());
      walkHits.push(x, z, 0.03 * tall);
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
      // A boulder lower than the knee is stepped over.
      if (sc > 0.75) walkHits.push(x, z, 0.6 * sc);
      rocks++;
    }
    // Sparse fallen fronds under palms — organic litter, not denser planting.
    const frondIds = [1, 2, 3, 5].map((sd) => scatter.proto([makeFallenFrond(sd)], 1.2));
    for (let i = 0; i < palmSites.length && i < 28; i += 3) {
      if (rnd() > 0.55) continue;
      const px = palmSites[i], pz = palmSites[i + 1];
      const a = rnd() * 6.28, r = 1.2 + rnd() * 3.4;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      const h = fieldSample(world, x, z);
      if (h < 0.15 || h > 4.5 || fieldSlope(world, x, z) > 0.45) continue;
      scatter.add(pick(frondIds, x, z), x, h + 0.01, z, rnd() * 6.28, 0.85 + rnd() * 0.45, [0.95, 0.9, 0.85], 1, 0.2, rnd());
    }
    const stackList = [];
    for (let i = 0; i < q.stacks * 30 && stacks < q.stacks; i++) {
      const x = -40 - rnd() * 160;
      const z = (rnd() - 0.5) * 220;
      const h = fieldSample(world, x, z);
      if (h < -6 || h > -0.4) continue;
      const sc = 1.5 + rnd() * 2.8;
      scatter.add(rockIds[stacks % 2], x, h - sc * 0.2, z, rnd() * 6, sc, [0.9, 0.86, 0.8], 1.05 + rnd() * 0.9);
      walkHits.push(x, z, 0.65 * sc);
      stackList.push(x, h + sc * 0.3, z, sc * 0.9);
      stacks++;
    }
    // A skiff, so the beach has a scale.
    scatter.add(scatter.proto([makeSkiff()], 2), beach.x + 3.5, beach.h, beach.z + 1.2, byaw - 0.5 + Math.PI * 0.5, 1.15, null, 1);
    walkHits.push(beach.x + 3.5, beach.z + 1.2, 1.1);
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
    reefBlocks = fishLife.blocks;
    walkBuild();
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
    for (let i = 0; i < (q.grass + q.weed) * 10 && (grassList.length / 4 < q.grass || weedList.length / 4 < q.weed); i++) {
      const x = (rnd() - 0.5) * 460;
      const z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z);
      const s = fieldSlope(world, x, z);
      const fromBeach = Math.hypot(x - beach.x, z - beach.z);
      const patch = vnoise(x * 0.028, z * 0.028);
      const fine = vnoise(x * 0.09 + 4, z * 0.09);
      // Short dune / coastal grass in irregular open patches — leave sandy gaps.
      if (grassList.length / 4 < Math.min(90, q.grass * 0.12) && h > 0.25 && h < 1.2 && s < 0.2 && fromBeach > 14 && fromBeach < 75 && patch > 0.42) {
        grassList.push(x, z, rnd() * 6.28, 0.16 + rnd() * 0.22 + fine * 0.08);
      } else if (grassList.length / 4 < q.grass && h > 1.3 && h < 28 && s < 0.5 && patch > 0.32) {
        // Inland meadow vs forest-edge wisps; under dense canopy, thinner short cover.
        const under = forestMask(x, z, h, s);
        if (under > 0.65 && fine < 0.45) continue;
        const sc = under > 0.4
          ? 0.28 + rnd() * 0.35
          : (h < 2.5 ? 0.35 + rnd() * 0.4 : 0.45 + rnd() * 0.65);
        grassList.push(x, z, rnd() * 6.28, sc * (0.85 + fine * 0.35));
      } else if (weedList.length / 4 < q.weed && h < -0.35 && h > -3.2 && s < 0.5 && x > 20 && patch > 0.3) {
        weedList.push(x, z, rnd() * 6.28, -(0.55 + rnd() * 0.95));
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

    const infos = await Promise.all([mod, simMod, oceanMod].map((m) => m.getCompilationInfo()));
    const errs = [].concat(...infos.map((n) => n.messages)).filter((m) => m.type === 'error');
    if (errs.length) {
      fail(errs.map((e) => e.lineNum + ':' + e.linePos + '  ' + e.message).join('\n'));
      return;
    }
    mark('wgsl');
    const uf = new Float32Array(244);
    const ur = new Float32Array(244);
    const un = new Float32Array(244);
    for (let i = 0; i < 8; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      uf[88 + i * 4] = w[0] / L; uf[89 + i * 4] = w[1] / L; uf[90 + i * 4] = w[2]; uf[91 + i * 4] = w[3];
      uf[120 + i] = w[4];
    }
    ur.set(uf);

    const ubuf = device.createBuffer({ size: 976, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const rbuf = device.createBuffer({ size: 976, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const nbuf = device.createBuffer({ size: 976, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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
    let landLo = 0, landHi = 0;
    for (let i = 1; i < terrain.pos.length; i += 3) { landLo = Math.min(landLo, terrain.pos[i]); landHi = Math.max(landHi, terrain.pos[i]); }
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
    // Main + mirror + near-shadow instance lists share one buffer. A plant between two levels
    // of detail is listed twice in the view and in the mirror, so five times at the very most.
    const instCap = Math.max(1, scatter.n) * 6;
    const instArr = new Float32Array(instCap * ISTRIDE);
    const instB = device.createBuffer({ size: instArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    // Island-wide shadow: coarsest LOD, culled to a practical reach so tiny understory is skipped.
    // Own draw list — must not share the per-frame pool (that reused slot wiped casters → shadow glitches).
    const farArr = new Float32Array(Math.max(1, scatter.n) * ISTRIDE);
    const farDraws = [];
    scatter.collect(farArr, 0, null, beach.x, 8, beach.z, 560, 9, farDraws);
    const instFarB = upload(farArr, GPUBufferUsage.VERTEX);
    let mainDraws = [], reflDraws = [], nearDraws = [], shadowFor = null;
    let nearShadowKey = null;
    let nearShadowUnder = null;
    const shadowSun = [0, 0, 0];
    // Lock light matrices to the last shadow bake — drifting VP against frozen depth causes crawl.
    const lockedSHVP = new Float32Array(16);
    const lockedNEARVP = new Float32Array(16);
    const lockedNearC = [0, 0, 0];
    let haveLockedSH = false, haveLockedNear = false;
    const nearShadowScratch = [0, 0, 0, 0, 0, 0];
    // Waterline latch: hysteresis on local wave height so under/above does not flicker.
    let underLatch = false;
    // AG idea: vegetation wind is GPU-side — only rebuild instance lists when the view cull changes.
    const cullKey = [1e9, 1e9, 1e9, 0, 0, 0, -1, -1, 0];
    let lastInstEnd = 0, cullReady = false;
    let frameDraws = 0, frameInst = 0, framePasses = 0;
    let cpuCullMs = 0, cpuFrameMs = 0;
    const submitList = [null];
    // Persistent encoder facade — avoid rebinding beginRenderPass every frame (GC).
    let encRaw = null;
    const encCounted = {
      beginRenderPass(desc) { framePasses++; return encRaw.beginRenderPass(desc); },
      beginComputePass(desc) { return encRaw.beginComputePass(desc); },
      copyTextureToBuffer(a, b, c) { return encRaw.copyTextureToBuffer(a, b, c); },
      copyBufferToBuffer(a, b, c, d, e) { return encRaw.copyBufferToBuffer(a, b, c, d, e); },
      copyTextureToTexture(a, b, c) { return encRaw.copyTextureToTexture(a, b, c); },
      resolveQuerySet(a, b, c, d, e) { return encRaw.resolveQuerySet(a, b, c, d, e); },
      finish() { return encRaw.finish(); }
    };
    function drawMeshes(pass, pipeline, bg, vb, ib, buf, draws) {
      if (!pipeline || !draws.length) return;
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, vb); pass.setVertexBuffer(1, buf); pass.setIndexBuffer(ib, 'uint16');
      for (let i = 0; i < draws.length; i += 5) {
        pass.drawIndexed(draws[i + 1], draws[i + 4], draws[i], draws[i + 2], draws[i + 3]);
        frameDraws++;
        frameInst += draws[i + 4];
      }
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
    const bugDrawsEmpty = [];
    const fishArr = new Float32Array(Math.max(1, fishLife.n) * ISTRIDE);
    const fishInstB = device.createBuffer({ size: fishArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    let fishDraws = [];

    mark('buffers');
    setStatus('Warming the light', 0.9);
    const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const shadowSamp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const shadowView = targetOf(device, 2048, 2048, shadowFmt).createView();
    // A second, tight shadow map around the eye. The island map has 33 cm texels,
    // which cannot hold the shadow of a leaflet. This one has 2.5 cm texels.
    // Near map only needs leaflet-scale shadows around the eye; beyond that the island map is enough.
    const NEAR_R = 20, NEAR_RES = 2048;
    const nearView = targetOf(device, NEAR_RES, NEAR_RES, shadowFmt).createView();
    const nearPass = passOf(undefined, null, nearView);
    const NEARVP = new Float32Array(16);
    const bgUBN = groupOf(device, ubLayout, [nbuf]);
    const nearRows = [0, 0];
    const sky = createSky(device, { dim: q.sky, format: sceneFmt, layouts: skyLayouts });
    const skySamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    let skyFor = null, skyPace = 1;
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
      const bg = groupOf(device, oceanLayout, [store(h0), store(new Float32Array(h0.length)), ub, view]);
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
    await pipesReady;
    mark('pipelines');
    const shadowPass = passOf(undefined, null, shadowView);
    let sceneTex = null, sceneDepth = null, swapDepth = null, reflTex = null, reflDepth = null, airTex = null, bgAir = null;
    let readTex = null, readDepth = null, readBuf = null, readBpr = 0;
    let bgGeoSet = [null, null], bgGeoR, bgUB, bgUBR, bgWater;
    let viewW = 2, viewH = 2;
    const hview = htex.createView();
    const ripViews = [0, 1].map(() => targetOf(device, 256, 256, 'rgba16float').createView());
    const simBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const simU = new Float32Array(12);
    const simBG = ripViews.map((v) => groupOf(device, simLayout, [v, simBuf]));
    let ripIndex = 0;
    const simPass = passOf(null, [0, 0, 0, 0]);
    {
      const enc0 = device.createCommandEncoder();
      for (let i = 0; i < 2; i++) {
        simPass.colorAttachments[0].view = ripViews[i];
        enc0.beginRenderPass(simPass).end();
      }
      device.queue.submit([enc0.finish()]);
    }

    const scenePass = passOf(null, [0.45, 0.55, 0.62, 1], null);
    const reflPass = passOf(null, [0, 0, 0, 0], null);
    const swapPass = passOf(null, [0.55, 0.65, 0.72, 1], null);
    let swapDepthView = null, readViews = null;
    const airPass = passOf(null, [0, 0, 0, 1]);
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
      sceneTex = targetOf(device, w, h, sceneFmt);
      sceneDepth = targetOf(device, w, h, 'depth32float');
      swapDepth = targetOf(device, w, h, 'depth24plus', 0);
      const rw = Math.max(2, w >> 1), rh = Math.max(2, h >> 1);
      reflTex = targetOf(device, rw, rh, sceneFmt);
      reflDepth = targetOf(device, rw, rh, 'depth32float', 0);
      airTex = targetOf(device, rw, rh, sceneFmt);
      viewW = w; viewH = h;
      if (READ) {
        if (readTex) readTex.destroy();
        if (readDepth) readDepth.destroy();
        if (readBuf) readBuf.destroy();
        readBpr = (Math.ceil((w * 4) / 256) * 256);
        readTex = targetOf(device, w, h, format, GPUTextureUsage.COPY_SRC);
        readDepth = targetOf(device, w, h, 'depth24plus', 0);
        readBuf = device.createBuffer({ size: readBpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        readViews = [readTex.createView(), readDepth.createView()];
      }
      const sv = sceneTex.createView(), sd = sceneDepth.createView(), rv = reflTex.createView(), av = airTex.createView();
      // Views are made here, once per size, not once per frame.
      airPass.colorAttachments[0].view = av;
      scenePass.colorAttachments[0].view = sv;
      scenePass.depthStencilAttachment.view = sd;
      reflPass.colorAttachments[0].view = rv;
      reflPass.depthStencilAttachment.view = reflDepth.createView();
      swapDepthView = swapDepth.createView();
      bgAir = groupOf(device, airLayout, [sd], 1);
      const geoGroup = (buf, rip) => groupOf(device, geoLayout,
        [buf, hview, rip, shadowView, shadowSamp, shoreSim.ubuf, shoreSim.stateView, shoreSim.wetView, sky.view, skySamp, nearView, sky.shade]);
      bgGeoSet = [geoGroup(ubuf, ripViews[0]), geoGroup(ubuf, ripViews[1])];
      bgGeoR = geoGroup(rbuf, ripViews[0]);
      bgUB = groupOf(device, ubLayout, [ubuf]);
      bgUBR = groupOf(device, ubLayout, [rbuf]);
      bgWater = groupOf(device, waterLayout, [sv, sd, rv, samp, cascades[0].view, cascades[1].view, cascades[2].view, av]);
    }
    resize();
    addEventListener('resize', resize);

    function drawWorld(pass, ub, geo, birds, draws) {
      // The mirrored view holds the land and what grows on it and nothing else. The sky the
      // water reflects is worked out where it is used, for the tilt of each wave; a mirrored
      // picture of it, pushed about and blurred, laid pale columns over the swell.
      if (birds) { pass.setPipeline(pipes.sky); pass.setBindGroup(0, geo); pass.draw(3); }
      pass.setPipeline(pipes.terrain); pass.setBindGroup(0, geo);
      pass.setVertexBuffer(0, terrainVB); pass.setIndexBuffer(terrainIB, 'uint32');
      pass.drawIndexed(terrain.idx.length);
      drawMeshes(pass, pipes.mesh, geo, meshVB, meshIB, instB, draws);
      // The gulls go to roost as the light goes.
      const flock = Math.round(q.birds * (1 - env.night));
      if (birds && flock && pipes.bird) {
        pass.setPipeline(pipes.bird); pass.setBindGroup(0, geo);
        pass.setVertexBuffer(0, birdVB); pass.setVertexBuffer(1, birdInstB);
        pass.setIndexBuffer(birdIB, 'uint16');
        pass.drawIndexed(bgeom.idx.length, flock);
      }
      if (birds) drawMeshes(pass, pipes.fish, geo, fishVB, fishIB, fishInstB, fishDraws);
      if (birds && grassCount && pipes.grass) {
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
    env.wx0 = Math.cos(env.ang); env.wz0 = Math.sin(env.ang);
    envSky(time, 0);
    // Captures hold the hour and the weather still unless asked to let them run.
    if (qstr.has('shot') || qstr.has('studio')) { env.run = env.auto = qstr.has('flow'); }
    if (qstr.has('tod')) env.hour = parseFloat(qstr.get('tod')) || ENV_H0;
    else if (!qstr.has('shot')) { env.hour = ENV_OPEN; env.run = false; }
    if (qstr.has('wx')) { envSet(qstr.get('wx'), true); env.auto = false; }
    let last = performance.now();
    const ft = new Float32Array(40);
    let ftI = 0, ftN = 0, frames = 0, ready = false;
    let showHint = 0;
    let shoreWarm = 110;
    let fishCam = null, birdNear = 0;

    const nearC = [0, 0, 0];
    const nearCand = [0, 0, 0];
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
      arr[84] = viewW; arr[85] = viewH; arr[86] = q.refl && !qstr.has('norefl') ? 1 : 0; arr[87] = 0;
      // Gerstner + capillary heading: place swell blended toward the shared trades.
      arr[128] = wp.amp * env.sea; arr[129] = wp.spd; arr[130] = wp.frq;
      arr[131] = lerpAng(wp.dir, env.ang, 0.35);
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
      // Island cascade: texel-snap the light origin so the map does not crawl as the sun drifts.
      const farHalf = 340, farTex = farHalf * 2 / 2048;
      let eyeLx = lx * 280, eyeLy = ly * 280, eyeLz = lz * 280;
      const fpa = eyeLx * srx + eyeLy * sry + eyeLz * srz;
      const fpb = eyeLx * sux + eyeLy * suy + eyeLz * suz;
      const fda = Math.round(fpa / farTex) * farTex - fpa;
      const fdb = Math.round(fpb / farTex) * farTex - fpb;
      eyeLx += srx * fda + sux * fdb;
      eyeLy += sry * fda + suy * fdb;
      eyeLz += srz * fda + suz * fdb;
      viewFrom([eyeLx, eyeLy, eyeLz], [srx, sry, srz], [sux, suy, suz], [sfx, sfy, sfz], V);
      ortho(P, -farHalf, farHalf, -260, 300, 6, 620);
      matmul(P, V, SHVP);
      // Sample with the locked bake VP (updated only when the island map is redrawn).
      if (haveLockedSH) arr.set(lockedSHVP, 156);
      else { lockedSHVP.set(SHVP); haveLockedSH = true; arr.set(lockedSHVP, 156); }
      // The near box sits ahead of the eye and moves in whole texels, so its edges do not crawl.
      const hx = fwd[0], hz = fwd[2], hl = Math.hypot(hx, hz) || 1;
      let ncx = eyeX + hx / hl * NEAR_R * 0.55, ncy = Math.max(eyeY - 1.5, 0), ncz = eyeZ + hz / hl * NEAR_R * 0.55;
      const tex = NEAR_R * 2 / NEAR_RES;
      const pa = ncx * srx + ncy * sry + ncz * srz, pb = ncx * sux + ncy * suy + ncz * suz;
      const da = Math.round(pa / tex) * tex - pa, db = Math.round(pb / tex) * tex - pb;
      ncx += srx * da + sux * db; ncy += sry * da + suy * db; ncz += srz * da + suz * db;
      nearCand[0] = ncx; nearCand[1] = ncy; nearCand[2] = ncz;
      // Only the rows of the land that can stand in the box are drawn into it: its footprint,
      // carried along the light from the deepest sea floor to the highest ground.
      const ly1 = Math.max(ly, 0.05), lift = NEAR_R * Math.abs(suy), wide = NEAR_R * (Math.abs(srz) + Math.abs(suz));
      const ta = Math.max(-120, (landLo - ncy - lift) / ly1) * lz, tb = Math.min(120, (landHi - ncy + lift) / ly1) * lz;
      const rowOf = (z) => Math.max(0, Math.min(q.terrain - 1, (z + q.textent) / (q.textent * 2) * (q.terrain - 1)));
      const row0 = Math.floor(rowOf(ncz + Math.min(ta, tb) - wide)), row1 = Math.ceil(rowOf(ncz + Math.max(ta, tb) + wide));
      nearRows[0] = row0 * (q.terrain - 1) * 6; nearRows[1] = Math.max(0, row1 - row0) * (q.terrain - 1) * 6;
      viewFrom([ncx + lx * 120, ncy + ly * 120, ncz + lz * 120], [srx, sry, srz], [sux, suy, suz], [sfx, sfy, sfz], V);
      ortho(P, -NEAR_R, NEAR_R, -NEAR_R, NEAR_R, 1, 240);
      matmul(P, V, NEARVP);
      // Sampling/cull use the locked bake; candidates are adopted only when the near map redraws.
      if (!haveLockedNear) {
        lockedNEARVP.set(NEARVP);
        lockedNearC[0] = ncx; lockedNearC[1] = ncy; lockedNearC[2] = ncz;
        haveLockedNear = true;
      }
      arr.set(lockedNEARVP, 172);
      nearC[0] = lockedNearC[0]; nearC[1] = lockedNearC[1]; nearC[2] = lockedNearC[2];
      const over = wp.mood[1];
      arr[60] = 0.73 * (1 - over * 0.4) + over * 0.52;
      arr[61] = 0.79 * (1 - over * 0.35) + over * 0.54;
      arr[62] = 0.84 * (1 - over * 0.22) + over * 0.58;
    }

    device.lost.then((info) => { window.__gpuerr = 'lost ' + (info && info.message); console.error('LOST', info && info.message); });
    function frame(now) {
      const c0 = performance.now();
      try { frameBody(now); if (frames > 4) { PERF.cpuN = (PERF.cpuN || 0) + 1; PERF.cpuMs = (PERF.cpuMs || 0) + performance.now() - c0; } } catch (err) { window.__gpuerr = String(err && err.stack || err); console.error('FRAME', err); }
    }
    // Bench path: forest → palms → coast → beach/ocean → aerial → clouds → underwater (AG fly idea).
    if (typeof WW_BENCH !== 'undefined') {
      const keys = [];
      const pushKey = (s) => keys.push([s.x, s.y, s.z, s.yaw, s.pitch]);
      // Dense canopy inland of the beach.
      keys.push([standX + Math.cos(byaw) * 55, Math.max(fieldSample(world, standX + Math.cos(byaw) * 55, standZ + Math.sin(byaw) * 55), 0) + 2.2, standZ + Math.sin(byaw) * 55, byaw + Math.PI, -0.12]);
      pushKey(spots[0]);
      pushKey(spots[1]);
      pushKey(spots[4]);
      pushKey(spots[2]);
      pushKey(spots[3]);
      pushKey(spots[5]);
      WW_BENCH.setPath(keys, 55);
      WW_BENCH.install({
        show: (t) => { statsEl.hidden = false; statsEl.textContent = t; },
        resolution: () => ({ w: viewW, h: viewH, name: q.name }),
        draws: () => frameDraws,
        instances: () => frameInst,
        lockQuality: () => {},
        keys: (fn) => {
          addEventListener('keydown', (e) => {
            if (e.repeat || mode !== 2) return;
            if (fn(e.code)) e.preventDefault();
          });
        }
      });
      window.__bench = WW_BENCH;
      if (qstr.has('bench')) {
        goEl.addEventListener('click', () => {
          setTimeout(() => {
            if (!WW_BENCH.active()) WW_BENCH.onKey ? WW_BENCH.onKey('KeyB') : null;
            // Trigger via the installed key path.
            dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
          }, 500);
        }, { once: true });
      }
    }

    function frameBody(now) {
      // A capture steps the clock by a fixed amount, so two captures of one build are the same picture.
      const dt = READ ? 1 / 30 : Math.min(0.05, (now - last) / 1000);
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
      frameDraws = 0; frameInst = 0; framePasses = 0;
      const tFrame0 = performance.now();
      // Scripted fly / benchmark overrides the free camera (quality stays at the chosen preset).
      if (typeof WW_BENCH !== 'undefined' && WW_BENCH.active()) {
        const pose = WW_BENCH.tick(now);
        if (pose) {
          orbit = false; trip = null;
          camX = pose[0]; camY = pose[1]; camZ = pose[2];
          yaw = pose[3]; pitch = pose[4];
          mode = 2;
          setFlyMode(camY > fieldSample(world, camX, camZ) + 4);
          dive = camY < 0 ? 1.2 : 0;
        }
      }

      {
        // How squarely the camera faces the sun, for the exposure meter.
        const s = env.sun || [0, 1, 0], ca = Math.cos(wp.sunAng), sa = Math.sin(wp.sunAng), cp = Math.cos(pitch);
        env.face = Math.sin(yaw) * cp * (s[0] * ca - s[2] * sa) + Math.sin(pitch) * s[1] - Math.cos(yaw) * cp * (s[0] * sa + s[2] * ca);
        // A capture has no time for the eye to adapt.
        if (READ && frames < 14) env.expoSmooth = null;
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
        if (introT >= 1) { mode = 2; setFlyMode(false); dive = 0; showModeHint(false); }
      } else if (mode === 2 && trip) {
        advanceTrip(dt);
      } else if (mode === 2 && orbit) {
        {
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
        // Mouse-look: yaw/pitch independent of WASD. Accumulate then clear each frame.
        yaw += lookX * 0.00215; pitch -= lookY * 0.00215;
        pitch = Math.max(-1.45, Math.min(1.45, pitch));
        const sprint = K.ShiftLeft || K.ShiftRight || touchN >= 2;
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = Math.sin(yaw);
        let wishX = 0, wishY = 0, wishZ = 0;
        const forward = (K.KeyW || (touchN >= 1 && !orbit)) ? 1 : 0;
        const back = K.KeyS ? 1 : 0;
        if (forward) { wishX += fx; wishZ += fz; }
        if (back) { wishX -= fx; wishZ -= fz; }
        if (K.KeyD) { wishX += rx; wishZ += rz; }
        if (K.KeyA) { wishX -= rx; wishZ -= rz; }
        const hLen = Math.hypot(wishX, wishZ);
        if (hLen > 1e-6) { wishX /= hLen; wishZ /= hLen; }
        if (fly) {
          // Horizontal WASD; Space / Ctrl for vertical. No terrain lock.
          if (K.Space || K.KeyE) wishY += 1;
          if (K.ControlLeft || K.ControlRight || K.KeyQ) wishY -= 1;
          const spm = sprint ? 48 : 14;
          const accel = 9.0, friction = 7.0;
          const tx = wishX * spm, ty = wishY * spm, tz = wishZ * spm;
          const kA = 1 - Math.exp(-accel * dt), kF = 1 - Math.exp(-friction * dt);
          velX += (tx - velX) * (wishX || wishZ || wishY ? kA : kF);
          velY += (ty - velY) * (wishY ? kA : kF);
          velZ += (tz - velZ) * (wishX || wishZ || wishY ? kA : kF);
          camX += velX * dt; camY += velY * dt; camZ += velZ * dt;
          // Flying stops at the ground instead of passing under it.
          const floor = fieldSample(world, camX, camZ) + 0.4;
          if (camY < floor) { camY = floor; if (velY < 0) velY = 0; }
        } else {
          const ground = fieldSample(world, camX, camZ);
          const wy = waveY(world, camX, camZ, time);
          const swimming = ground < wy - 0.25;
          const spm = swimming ? (dive > 0.7 ? (sprint ? 3.6 : 1.5) : (sprint ? 7.5 : 3.2)) : (sprint ? 8.4 : 4.2);
          const accel = swimming ? 6.0 : 11.0, friction = swimming ? 5.0 : 14.0;
          const tx = wishX * spm, tz = wishZ * spm;
          const kA = 1 - Math.exp(-accel * dt), kF = 1 - Math.exp(-friction * dt);
          const moving = hLen > 1e-6;
          velX += (tx - velX) * (moving ? kA : kF);
          velZ += (tz - velZ) * (moving ? kA : kF);
          velY = 0;
          walkStep(dt, time);
        }
        const rr = Math.hypot(camX, camZ);
        if (rr > 980) { camX *= 980 / rr; camZ *= 980 / rr; }
        if (camY > 320) camY = 320;
        if (camY < -8) camY = -8;
      }
      lookX = 0; lookY = 0;

      // Fish only matter near/under the surface — skip sim when flying high over land.
      let waveHere = waveY(world, camX, camZ, time);
      if (camY < waveHere + 55) fishLife.update(dt, time, camX, camY, camZ);
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
        waveHere = waveY(world, camX, camZ, time);
        camY = Math.min(waveHere - 0.3, Math.max(ty + fishCam.d * 0.12 + fishCam.up, fieldSample(world, camX, camZ) + 0.12));
        const lp = lookYP(tx - camX, ty - camY, tz - camZ);
        yaw = lp[0]; pitch = lp[1] + fishCam.tilt;
      }

      // Insects are above-water only; skip when submerged (draws already empty underwater).
      if (camY >= waveHere - 0.05) bugLife.update(dt, time, camX, camY, camZ);
      if (bugCam && bugCam.a) {
        // A capture framing: close to one insect, from the side the sun is on, looking at it.
        const a = bugCam.a, S = bugLife.sites.bloom, on = BUGS[a.sp].site === 'bloom' && a.site >= 0;
        // Something at a blossom is looked at from in front of the blossom.
        const q0 = (on ? Math.atan2(S[a.site + 4], S[a.site + 3]) : Math.atan2(env.key[2], env.key[0]) + wp.sunAng) + bugCam.turn;
        camX = a.x + Math.cos(q0) * bugCam.d; camZ = a.z + Math.sin(q0) * bugCam.d; camY = a.y + bugCam.up + bugCam.d * (on ? 0.6 : 0.25);
        const lp = lookYP(a.x - camX, a.y - camY, a.z - camZ);
        yaw = lp[0]; pitch = lp[1] + bugCam.tilt;
        waveHere = waveY(world, camX, camZ, time);
      }
      if (sunView) {
        // A capture framing: face the light, pitched up by this much of its height.
        const az = Math.atan2(env.key[2], env.key[0]) + wp.sunAng + sunTurn, hl = Math.hypot(env.key[0], env.key[2]);
        const lp = lookYP(Math.cos(az) * hl, env.key[1] * sunView, Math.sin(az) * hl);
        yaw = lp[0]; pitch = lp[1];
      }
      // Enter under ~10 cm below the local surface; leave ~8 cm above — kills waterline flicker.
      const waterGap = waveHere - camY;
      if (!underLatch && waterGap > 0.1) underLatch = true;
      else if (underLatch && waterGap < -0.08) underLatch = false;
      const under = underLatch ? 1 : 0;
      // Soft immersion for shaders, but keep each latch side clear of the 0.5 branch edge.
      let immersion = Math.min(1, Math.max(0, (waterGap + 0.14) / 0.5));
      if (under) immersion = Math.max(0.58, immersion);
      else immersion = Math.min(0.42, immersion);
      // The grid reaches the haze in every direction. A small snap keeps the dense vertices under the camera.
      const eyeH = Math.max(camY, 0.4);
      const cover = Math.min(6400, 2200 + eyeH * 28) * 2;
      const snap = 4;
      const ox = Math.floor(camX / snap) * snap - cover * 0.5;
      const oz = Math.floor(camZ / snap) * snap - cover * 0.5;

      fillCam(uf, camX, camY, camZ, yaw, pitch, 0, immersion);
      uf[80] = ox; uf[81] = oz; uf[82] = cover; uf[83] = fieldDamp(world, camX, camZ);
      // Skip unused planar-reflection *pass* while submerged (Snell path does not sample it).
      // Above-water reflection quality/settings are unchanged — not a fidelity cut.
      if (under) uf[86] = 0;

      {
        // The sky is rebaked a strip a frame, which follows the clock and the drift of the
        // clouds. When the light or the weather is moving faster than that, or the camera is
        // climbing, more strips a frame, eased up and down so the blend never jumps.
        const key = wp.sunAng * 7 + env.hour * 2 + env.cover * 3 + env.haze + camY * 0.004;
        const want = skyFor === null ? 1 : 1 + Math.abs(key - skyFor) * 900;
        skyFor = key;
        skyPace = Math.max(1, Math.min(skyPace + 1, Math.max(want, skyPace - 0.25)));
        sky.plan(uf, skyPace);
      }
      // Reflected camera, for the water mirror — skipped entirely when reflections are off.
      if (uf[86] > 0.5) {
        cameraVectors(yaw, -pitch, rfwd, rright, rup);
        const rex = camX, rey = -camY, rez = camZ;
        viewFrom([rex, rey, rez], rright, rup, rfwd, V);
        perspective(P, fov, viewW / viewH, near, far);
        matmul(P, V, RVP);
        uf.set(RVP, 32);
        ur.set(uf);
        invert(RVP, INV);
        ur.set(RVP, 0); ur.set(INV, 16);
        ur[48] = rex; ur[49] = rey; ur[50] = rez;
        ur[55] = 0; ur[71] = 1;
        ur[64] = rright[0]; ur[65] = rright[1]; ur[66] = rright[2];
        ur[68] = rup[0]; ur[69] = rup[1]; ur[70] = rup[2];
        ur[72] = rfwd[0]; ur[73] = rfwd[1]; ur[74] = rfwd[2];
        device.queue.writeBuffer(rbuf, 0, ur);
      }
      device.queue.writeBuffer(ubuf, 0, uf);

      // Keep the island skyline filled: base reach covers the coast-to-ridge distance on foot.
      // Large plants get an extra leash inside collect() so distant crowns do not pop.
      const plantReach = Math.min(560, 340 + eyeH * 6.5);
      const reflOn = uf[86] > 0.5 ? 1 : 0;
      // Rebuild shared main/refl/near instance buffer only when the view moved enough to change cull/LOD.
      const eyeMove = Math.hypot(camX - cullKey[0], camY - cullKey[1], camZ - cullKey[2]);
      let dyaw = yaw - cullKey[3];
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const angMove = Math.abs(dyaw) + Math.abs(pitch - cullKey[4]);
      const needCull = !cullReady || eyeMove > 0.45 || angMove > 0.012 || Math.abs(plantReach - cullKey[5]) > 0.5
        || reflOn !== cullKey[6] || Math.hypot(nearCand[0] - cullKey[7], nearCand[2] - cullKey[8]) > 0.55;
      let instEnd = lastInstEnd;
      const tCull0 = performance.now();
      if (needCull) {
        scatter.pxw = uf[63] * 2 / viewH;
        mainDraws = scatter.collect(instArr, 0, uf, camX, camY, camZ, plantReach, 0);
        instEnd = mainDraws.end;
        if (reflOn) {
          // Half-res mirror: one LOD coarser; still far enough that reflected trees do not blink.
          reflDraws = scatter.collect(instArr, instEnd, RVP, camX, -camY, camZ, Math.min(380, plantReach * 0.75), 1);
          instEnd = reflDraws.end;
        } else {
          reflDraws = bugDrawsEmpty;
        }
        // Near shadows: collect at the candidate bake center so casters match the next lock.
        nearDraws = scatter.collect(instArr, instEnd, null, nearCand[0], nearCand[1], nearCand[2], NEAR_R * 1.45, 1);
        instEnd = nearDraws.end;
        if (instEnd) device.queue.writeBuffer(instB, 0, instArr.subarray(0, Math.min(instEnd, instCap) * ISTRIDE));
        cullKey[0] = camX; cullKey[1] = camY; cullKey[2] = camZ;
        cullKey[3] = yaw; cullKey[4] = pitch; cullKey[5] = plantReach;
        cullKey[6] = reflOn; cullKey[7] = nearCand[0]; cullKey[8] = nearCand[2];
        lastInstEnd = instEnd;
        cullReady = true;
      }
      cpuCullMs = performance.now() - tCull0;
      // Fish are seen under water from 44 m at most, and from the air only close by.
      if (camY < waveHere + 55) {
        fishDraws = fishLife.collect(fishArr, uf, camX, camY, camZ, under ? 44 : 30, fishPack.ranges);
        if (fishDraws.end) device.queue.writeBuffer(fishInstB, 0, fishArr, 0, fishDraws.end * ISTRIDE);
      } else {
        fishDraws = bugDrawsEmpty;
      }

      if (under) bugDraws = bugDrawsEmpty;
      else {
        bugDraws = bugLife.collect(bugArr, uf, camX, camY, camZ, uf[63] * 2 / viewH, bugPack.ranges);
        if (bugDraws.end) device.queue.writeBuffer(bugInstB, 0, bugArr, 0, bugDraws.end * BUG_STRIDE);
      }
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
          // A bird flies through moving air: it is carried a third as fast as the wind blows.
          const drift = envWindAt(x, z) * 0.35;
          x += (Math.cos(hd) * sp + env.wx0 * drift) * dt;
          z += (Math.sin(hd) * sp + env.wz0 * drift) * dt;
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

      encRaw = device.createCommandEncoder();
      const enc = encCounted;
      {
        // Upload cascade clocks before the compute pass (no mid-pass writeBuffer churn).
        for (const c of cascades) {
          oceanU[0] = time; oceanU[1] = c.size;
          device.queue.writeBuffer(c.ub, 0, oceanU);
        }
        // Every cascade's spectrum is advanced and transformed in one compute pass.
        const cp = enc.beginComputePass();
        for (const c of cascades) {
          cp.setBindGroup(0, c.bg);
          for (const step of ['evolve', 'rows', 'cols', 'slopes']) {
            cp.setPipeline(oceanPipes[step]);
            if (step === 'rows' || step === 'cols') cp.dispatchWorkgroups(OCEAN_N);
            else cp.dispatchWorkgroups(OCEAN_N / 16, OCEAN_N / 16);
          }
        }
        cp.end();
      }
      // The surf starts from still water and is run forward over the first frames,
      // so the first picture does not wait for it.
      for (let k = 0; k < 11 && shoreWarm > 0; k++, shoreWarm--) {
        const e = device.createCommandEncoder();
        shoreSim.encode(e, time - shoreWarm * 0.04, 0.04);
        device.queue.submit([e.finish()]);
      }
      if (!wp.paused) shoreSim.encode(enc, time, dt);
      if (mode === 2 && !wp.paused && pipes.sim) {
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
      sky.encode(enc, pipes, bgUB);
      // Island shadow: redraw when the light has moved about half a degree; lock VP to that bake.
      if (!shadowFor || uf[52] * shadowFor[0] + uf[53] * shadowFor[1] + uf[54] * shadowFor[2] < 0.99996) {
        if (!shadowFor) shadowFor = shadowSun;
        shadowFor[0] = uf[52]; shadowFor[1] = uf[53]; shadowFor[2] = uf[54];
        lockedSHVP.set(SHVP);
        haveLockedSH = true;
        uf.set(lockedSHVP, 156);
        device.queue.writeBuffer(ubuf, 0, uf);
        const spass = enc.beginRenderPass(shadowPass);
        spass.setPipeline(pipes.shadowTerrain); spass.setBindGroup(0, bgUB);
        spass.setVertexBuffer(0, terrainVB); spass.setIndexBuffer(terrainIB, 'uint32');
        spass.drawIndexed(terrain.idx.length);
        drawMeshes(spass, pipes.shadowMesh, bgUB, meshVB, meshIB, instFarB, farDraws);
        spass.end();
      }
      // Near cascade: redraw when the eye or sun moved enough; adopt candidate VP then bake.
      {
        const nsk = nearShadowKey || (nearShadowKey = [0, 0, 0, 0, 0, 0]);
        const eyeMove = Math.hypot(camX - nsk[0], camY - nsk[1], camZ - nsk[2]);
        const sunDot = uf[52] * nsk[3] + uf[53] * nsk[4] + uf[54] * nsk[5];
        const underFlip = nearShadowUnder !== under;
        // Drawn every frame. What casts into it sways, and a map kept until the eye had moved
        // held those shadows still and then let them jump. The box moves in whole texels, so
        // what stands still casts a shadow that stands still.
        {
          nsk[0] = camX; nsk[1] = camY; nsk[2] = camZ;
          nsk[3] = uf[52]; nsk[4] = uf[53]; nsk[5] = uf[54];
          nearShadowUnder = under;
          lockedNEARVP.set(NEARVP);
          lockedNearC[0] = nearCand[0]; lockedNearC[1] = nearCand[1]; lockedNearC[2] = nearCand[2];
          haveLockedNear = true;
          nearC[0] = lockedNearC[0]; nearC[1] = lockedNearC[1]; nearC[2] = lockedNearC[2];
          uf.set(lockedNEARVP, 172);
          // Uniforms only needed when this pass actually runs — near pipe reads shadowVP slot as its light VP.
          un.set(uf); un.set(lockedNEARVP, 156);
          device.queue.writeBuffer(nbuf, 0, un);
          device.queue.writeBuffer(ubuf, 0, uf);
          const np = enc.beginRenderPass(nearPass);
          np.setPipeline(pipes.shadowTerrain); np.setBindGroup(0, bgUBN);
          np.setVertexBuffer(0, terrainVB); np.setIndexBuffer(terrainIB, 'uint32');
          np.drawIndexed(nearRows[1], 1, nearRows[0]);
          drawMeshes(np, pipes.shadowMesh, bgUBN, meshVB, meshIB, instB, nearDraws);
          if (under) drawMeshes(np, pipes.shadowFish, bgUBN, fishVB, fishIB, fishInstB, fishDraws);
          else drawMeshes(np, pipes.shadowBug, bgUBN, bugVB, bugIB, bugInstB, bugDraws);
          np.end();
        }
      }
      if (uf[86] > 0.5) {
        const rp = enc.beginRenderPass(reflPass);
        drawWorld(rp, bgUBR, bgGeoR, false, reflDraws);
        rp.end();
      }
      // GPU timestamps span scene → final swap (AG: first pass begin, last pass end).
      let tsSlot = null;
      if (hasTS) {
        for (let i = 0; i < tsSlots.length; i++) if (!tsSlots[i].busy) { tsSlot = tsSlots[i]; break; }
      }
      scenePass.timestampWrites = tsSlot ? tsBegin : undefined;
      const sp = enc.beginRenderPass(scenePass);
      drawWorld(sp, bgUB, geoNow, true, mainDraws);
      sp.end();
      {
        const ap = enc.beginRenderPass(airPass);
        // Until its pipeline is built the pass only clears, which reads as clear air.
        if (pipes.air && !NO.air) {
          ap.setPipeline(pipes.air); ap.setBindGroup(0, geoNow); ap.setBindGroup(1, bgAir);
          ap.draw(3);
        }
        ap.end();
      }

      const drawSwap = (colorView, depthView, stampEnd) => {
        swapPass.colorAttachments[0].view = colorView;
        swapPass.depthStencilAttachment.view = depthView;
        swapPass.timestampWrites = stampEnd && tsSlot ? tsEnd : undefined;
        const pass = enc.beginRenderPass(swapPass);
        pass.setBindGroup(0, geoNow); pass.setBindGroup(1, bgWater);
        pass.setPipeline(pipes.blit); pass.draw(3);
        if (!NO.water) {
          pass.setPipeline(pipes.water);
          pass.setVertexBuffer(0, waterVB); pass.setIndexBuffer(waterIB, 'uint32');
          pass.drawIndexed(water.idx.length);
        }
        if (pipes.shore && !NO.shore) {
          pass.setPipeline(pipes.shore);
          pass.setVertexBuffer(0, shoreVB); pass.setIndexBuffer(shoreIB, 'uint32');
          pass.drawIndexed(shoreMesh.idx.length);
        }
        pass.setBindGroup(1, bgAir);
        drawMeshes(pass, pipes.bug, geoNow, bugVB, bugIB, bugInstB, bugDraws);
        if (!under && pipes.drops && !NO.drops) {
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
      const toScreen = !(READ && frames === READ_AT);
      if (READ && readTex) drawSwap(readViews[0], readViews[1], !toScreen);
      if (toScreen) drawSwap(context.getCurrentTexture().createView(), swapDepthView, true);
      let doRead = false;
      if (READ && readTex && frames === READ_AT) {
        enc.copyTextureToBuffer(
          { texture: readTex },
          { buffer: readBuf, bytesPerRow: readBpr, rowsPerImage: viewH },
          { width: viewW, height: viewH }
        );
        doRead = true;
        window.__stage = 'copy';
      }
      if (tsSlot) {
        enc.resolveQuerySet(tsBegin.querySet, 0, 2, tsResolve, 0);
        enc.copyBufferToBuffer(tsResolve, 0, tsSlot.b, 0, 16);
        tsSlot.busy = true;
      }
      submitList[0] = enc.finish();
      device.queue.submit(submitList);
      if (tsSlot) {
        const slot = tsSlot;
        slot.b.mapAsync(GPUMapMode.READ).then(slot.done).catch(() => { slot.busy = false; });
      }
      cpuFrameMs = performance.now() - tFrame0;
      if (typeof WW_BENCH !== 'undefined' && WW_BENCH.isBench && WW_BENCH.isBench()) {
        WW_BENCH.recordCpu(cpuFrameMs, cpuCullMs);
        WW_BENCH.recordPass(framePasses, frameDraws, frameInst);
      }
      if (doRead) {
        const wCap = viewW, hCap = viewH, bprCap = readBpr, fmtCap = format, buf = readBuf;
        const readWatch = setTimeout(() => {
          if (!window.__png && !window.__gpuerr) {
            window.__gpuerr = 'read timeout';
            console.error('READ timeout');
            requestAnimationFrame(frame);
          }
        }, 45000);
        device.queue.onSubmittedWorkDone().then(() => buf.mapAsync(GPUMapMode.READ)).then(() => {
          clearTimeout(readWatch);
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
          if (qstr.has('perf')) {
            const tri = (d) => { let n = 0; for (let i = 0; i < d.length; i += 5) n += d[i + 1] * d[i + 4]; return Math.round(n / 3000) + 'k'; };
            const top = (d) => { const r = []; for (let i = 0; i < d.length; i += 5) r.push([d[i + 1] / 3 * d[i + 4], d[i + 1] / 3, d[i + 4]]); return r.sort((x, y) => y[0] - x[0]).slice(0, 14).map((x) => x[1] + 'x' + x[2]).join(' '); };
            console.log('PERF top view ' + top(mainDraws) + ' | shadow ' + top(nearDraws));
            console.log('PERF cpu ' + (PERF.cpuMs / PERF.cpuN).toFixed(2) + ' ms/frame over ' + PERF.cpuN + ', plant triangles: view ' + tri(mainDraws) + ', mirror ' + tri(reflDraws) + ', near shadow ' + tri(nearDraws));
          }
          requestAnimationFrame(frame);
        }).catch((err) => { clearTimeout(readWatch); window.__gpuerr = String(err); console.error('READ', err); });
        return;
      }

      if (!statsEl.hidden && ftN && !(typeof WW_BENCH !== 'undefined' && WW_BENCH.active())) {
        let sum = 0; for (let i = 0; i < ftN; i++) sum += ft[i];
        const fps = (ftN / sum).toFixed(0);
        const gpu = gpuMs > 0 ? '  ·  GPU ' + gpuMs.toFixed(1) + ' ms' : '';
        const cpu = '  ·  CPU ' + cpuFrameMs.toFixed(1) + ' ms';
        // Report the bound without silently cutting quality (AG quality manager idea, fidelity-first).
        let bound = '';
        if (gpuMs > 0) {
          if (gpuMs > 14 && gpuMs > cpuFrameMs * 1.3) bound = '  ·  GPU-bound';
          else if (cpuFrameMs > 10 && cpuFrameMs > gpuMs * 1.3) bound = '  ·  CPU-bound';
        } else if (cpuFrameMs > 12 || sum / ftN > 0.02) {
          bound = cpuCullMs > 4 ? '  ·  CPU cull heavy' : '  ·  check GPU timing';
        }
        statsEl.textContent = fps + ' fps  ·  ' + q.name + '  ·  ' + viewW + '×' + viewH + gpu + cpu + bound;
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
        // Same travelling gust cells that bend plants and chop the bay.
        const gust = envWindAt(camX, camZ);
        const sy = env.sun[1], dark = smooth01(0.1, -0.08, sy);
        const wood = land > 1.2 ? Math.max(0, Math.min(1, forestMask(camX, camZ, land, fieldSlope(world, camX, camZ)) * 1.5)) : 0;
        const palmZone = Math.max(0, Math.min(1, (1.2 - Math.abs(land - 1.4)) / 1.2)) * (1 - wood * 0.5);
        audio.wind.gain.value = (muted ? 0 : 0.04) * (0.3 + Math.min(alt, 80) / 80) * (under ? 0.05 : 1) * (land > 8 ? 1.2 : 0.85) * (0.3 + 0.7 * gust * gust / 22);
        audio.insects.gain.value = (muted ? 0 : 0.02) * Math.max(0, Math.min(1, (land - 0.8) / 5)) * (under ? 0 : 1) * (1 - 0.7 * dark) * (1 - Math.min(1, env.v[1] * 2)) * (1 - 0.35 * Math.min(1, gust / 10));
        audio.air({
          heat: smooth01(0.15, 0.6, sy) * (1 - 0.7 * env.cover), dark: dark, low: smooth01(0.4, 0.1, sy) * (1 - dark),
          dawn: smooth01(5, 6, env.hour) * (1 - smooth01(7.5, 9, env.hour)), rain: env.v[1], gust: gust,
          wood: wood, shore: nearBreak, palm: palmZone,
          alt: camY - Math.max(land, 0) - 1.7, under: under, heard: bugLife.heard
        });
        audio.under.frequency.value = under ? 380 : 16000;
        audio.underAmt = under ? 1 : 0;
        // Swim-speed water rush while submerged (Abyssal audio cue).
        const spd = Math.hypot(velX, velY, velZ);
        const m = muted ? 0 : 1;
        audio.rush.value = m * (under ? 0.045 * Math.pow(Math.min(spd / 14, 1), 1.2) : 0);
        if (under) audio.rushF.frequency.value = 200 + spd * 12;
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
      mode = 2;
      openOrbit();
      showHint = 7;
      $('hint').textContent = 'Drag to look round · Places or keys 1 – 6 to travel';
      paintMoveMode();
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
        // at=x,z,yaw,pitch,height: stand anywhere, angles in degrees, height above the ground or the sea.
        if (qstr.has('at')) {
          const a = qstr.get('at').split(',').map(Number);
          camX = a[0] || 0; camZ = a[1] || 0; yaw = (a[2] || 0) * Math.PI / 180; pitch = (a[3] || 0) * Math.PI / 180;
          camY = Math.max(fieldSample(world, camX, camZ), 0) + (a[4] || 1.7); fly = true;
        }
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
        const warmN = Math.min(Math.max(0, num('warm')), 8) * 20;
        for (let k = 0; k < warmN; k++) fishLife.update(0.05, time + k * 0.05, camX, camY, camZ);
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
          const bwarmN = Math.min(Math.max(0, num('bwarm') || 8), 12) * 30;
          for (let k = 0; k < bwarmN; k++) bugLife.update(1 / 30, time + k / 30, camX, camY, camZ);
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
      openOrbit();
      mode = 2;
      barEl.parentElement.hidden = true;
      statusEl.textContent = '';
      if (qstr.has('read')) pendingSplat = { x: targetX, z: targetZ, s: 0.5, r: 1.8 };
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
