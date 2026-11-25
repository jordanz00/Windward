const PRESETS = {
  // Denser shore sheets so the curling lip spans enough verts to read (from #44 amplify).
  low:  { name: 'low',  hres: 384, span: 560, terrain: 240, textent: 460, water: 200, shore: 320, grass: 1600, weed: 220, palms: 48,  broad: 36,  forest: 380,  rocks: 40, vines: 90,  moss: 140, stacks: 6,  birds: 5,  fish: 0.6, reef: 26, seagrass: 620,  shadow: 4, clouds: 1, sky: [1536, 384, 16, 256], drops: 5000, refl: 1, scale: 0.72, dpr: 1,    maxPx: 900000 },
  med:  { name: 'med',  hres: 512, span: 560, terrain: 210, textent: 500, water: 248, shore: 384, grass: 4800, weed: 780, palms: 100, broad: 80,  forest: 950,  rocks: 70, vines: 260, moss: 420, stacks: 9,  birds: 8,  fish: 1,   reef: 40, seagrass: 1450, shadow: 6, clouds: 2, sky: [2048, 512, 16, 384], drops: 9000, refl: 1, scale: 0.9,  dpr: 1.25, maxPx: 1900000 },
  high: { name: 'high', hres: 640, span: 560, terrain: 300, textent: 530, water: 288, shore: 448, grass: 9200, weed: 1400, palms: 160, broad: 130, forest: 1700, rocks: 100, vines: 480, moss: 700, stacks: 12, birds: 12, fish: 1.5, reef: 56, seagrass: 2400, shadow: 10, clouds: 3, sky: [2560, 640, 32, 512], drops: 14000, refl: 1, scale: 1,   dpr: 1.5,  maxPx: 3400000 }
};

const WAVES = [
  [1.00, 0.02, 2.15, 48, 0.78],
  [1.00, 0.02, 0.55, 24, 0.92],
  [0.996, 0.09, 0.12, 68, 0.28],
  [0.996, -0.09, 0.07, 33, 0.18],
  [0.86, 0.42, 0.022, 17, 0.1],
  [0.72, -0.62, 0.014, 11, 0.07],
  [0.22, 0.97, 0.2, 52, 0.28],
  [-0.38, 0.92, 0.12, 29, 0.2]
];

// Metres. Above the cirrus sheet (10.5 km) and the tallest convective top, so fly
// can enter the deck and come out above it. The old cap was 320 m, under the base.
const FLY_TOP = 16500;
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
let autoQ = false;
function detectQuality() {
  const q = (qstr.get('q') || '').toLowerCase();
  if (PRESETS[q]) return q;
  let saved = null;
  try { saved = localStorage.getItem('ww-q'); } catch (e) {}
  if (PRESETS[saved]) return saved;
  // From here on the level is a guess, and the frame rate may step it down (main).
  autoQ = true;
  try { const a = sessionStorage.getItem('ww-auto'); if (PRESETS[a]) return a; } catch (e) {}
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
  this.kind.push(kind === LEAF ? LEAF + (this.part || 0) : kind || 0); this.uv.push(u || 0, v || 0);
  return i;
};
// Starts a leaf. Every vertex of one leaf carries the same number of its own, under 0.4, on
// top of its kind, where everything that reads the kind rounds it away. Between two levels
// of detail a leaf comes and goes whole by that number (fsMesh).
Mesh.prototype.leaf = function () { this.leaves = (this.leaves || 0) + 1; this.part = (this.leaves * 0.6180339887 % 1) * 0.4; };
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
// An upright stem in bark.
function cylinder(sides, rings, r0, r1, h, col, swayTop) {
  const m = new Mesh(), pts = [];
  for (let i = 0; i <= rings; i++) pts.push([0, h * (i / rings), 0]);
  tube(m, pts, sides + 3, true, (t, ang, len) => [r0 + (r1 - r0) * t, col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, swayTop * t, WOOD, ang / 6.2832, len]);
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
  m.leaf();
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
  const sides = [18, 8, 4][lod], rings = [48, 14, 5][lod];
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
    // Oldest live fronds drop into a skirt so the palm's outline is a crown, not a fan.
    const skirt = !dead && age > 0.8 ? (age - 0.8) * 1.55 : 0;
    const el0 = dead ? -1.2 - rnd() * 0.25
      : (family === 0 ? 1.1 : 0.98) - Math.pow(age, family === 3 ? 0.98 : 1.08) * (family === 3 ? 2.0 : 1.82)
        - skirt + (rnd() - 0.5) * 0.28 + crownBias * 0.12;
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
        m.leaf();
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

// Climbing vine: woody stem spiraling up a host, with dense irregular leaflets.
function makeClimbingVine(seed) {
  const rnd = seeded((seed | 0) * 19 + 3);
  const m = new Mesh();
  const H = 1.35 + rnd() * 1.6;
  const turns = 1.4 + rnd() * 1.8;
  const rad = 0.06 + rnd() * 0.1;
  const pts = [];
  const rings = 12;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const a = t * turns * 6.2832 + rnd() * 0.08;
    pts.push([Math.cos(a) * rad * (0.55 + 0.55 * t), H * t, Math.sin(a) * rad * (0.55 + 0.55 * t)]);
  }
  const bark = [0.2 + rnd() * 0.08, 0.14 + rnd() * 0.05, 0.08 + rnd() * 0.04];
  tube(m, pts, 5, false, (t, ang, len) => [
    0.016 * (1 - t * 0.4), bark[0], bark[1], bark[2], 0.15 + t * 0.55, WOOD, ang / 6.2832, len
  ]);
  const nLeaf = 14 + ((rnd() * 10) | 0);
  for (let i = 0; i < nLeaf; i++) {
    const t = 0.08 + rnd() * 0.88;
    const a = t * turns * 6.2832;
    const px = Math.cos(a) * rad * (0.55 + 0.55 * t);
    const pz = Math.sin(a) * rad * (0.55 + 0.55 * t);
    const py = H * t;
    const dead = rnd() < 0.16;
    const col = dead
      ? [0.28 + rnd() * 0.1, 0.2 + rnd() * 0.08, 0.08 + rnd() * 0.04]
      : [0.05 + rnd() * 0.05, 0.24 + rnd() * 0.14, 0.04 + rnd() * 0.03];
    const side = rnd() < 0.5 ? -1 : 1;
    addLeaflet(m, px, py, pz,
      Math.cos(a + side) * 0.7, 0.2 - rnd() * 0.4, Math.sin(a + side) * 0.7,
      0.11 + rnd() * 0.16, 0.02 + rnd() * 0.018, col, 0.55 + rnd() * 0.35, (rnd() - 0.5) * 0.7);
  }
  return m;
}

// Hanging vine / liana cascade from an anchor height.
function makeHangingVine(seed) {
  const rnd = seeded((seed | 0) * 23 + 7);
  const m = new Mesh();
  const strands = 3 + ((rnd() * 3) | 0);
  for (let s = 0; s < strands; s++) {
    const ox = (rnd() - 0.5) * 0.28, oz = (rnd() - 0.5) * 0.28;
    const drop = 1.1 + rnd() * 1.6;
    const sway = (rnd() - 0.5) * 0.45;
    const pts = [];
    const rings = 10;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const curl = Math.sin(t * 4.2 + s) * 0.06 * t;
      pts.push([ox + sway * t * t + curl, -drop * t, oz + Math.cos(t * 3.1 + s) * 0.045 * t]);
    }
    const bark = [0.18 + rnd() * 0.07, 0.13 + rnd() * 0.05, 0.07];
    tube(m, pts, 4, false, (t, ang, len) => [
      0.012 * (1 - t * 0.45), bark[0], bark[1], bark[2], 0.4 + t * 0.7, WOOD, ang / 6.2832, len
    ]);
    const nLeaf = 8 + ((rnd() * 7) | 0);
    for (let i = 0; i < nLeaf; i++) {
      const t = 0.1 + rnd() * 0.85;
      const px = ox + sway * t * t, py = -drop * t, pz = oz;
      const dead = rnd() < 0.2;
      const col = dead
        ? [0.32 + rnd() * 0.1, 0.22 + rnd() * 0.08, 0.09]
        : [0.06 + rnd() * 0.05, 0.26 + rnd() * 0.12, 0.05];
      addLeaflet(m, px, py, pz,
        (rnd() - 0.5) * 1.2, -0.15 - rnd() * 0.55, (rnd() - 0.5) * 1.2,
        0.1 + rnd() * 0.14, 0.018 + rnd() * 0.016, col, 0.65 + rnd() * 0.3, (rnd() - 0.5) * 0.8);
    }
  }
  return m;
}

// Moss pillow / low ground cover — soft irregular mound of fronds.
function makeMossClump(seed) {
  const rnd = seeded((seed | 0) * 11 + 5);
  const m = new Mesh();
  const tufts = 12 + ((rnd() * 12) | 0);
  for (let i = 0; i < tufts; i++) {
    const ang = rnd() * 6.2832;
    const r = rnd() * 0.22;
    const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
    const dead = rnd() < 0.12;
    const col = dead
      ? [0.24 + rnd() * 0.08, 0.22 + rnd() * 0.06, 0.09]
      : [0.08 + rnd() * 0.06, 0.28 + rnd() * 0.16, 0.06 + rnd() * 0.04];
    const nLeaf = 3 + ((rnd() * 3) | 0);
    for (let k = 0; k < nLeaf; k++) {
      const a = ang + (k - 1) * 0.4 + rnd() * 0.3;
      addLeaflet(m, ox, 0.002 + rnd() * 0.015, oz,
        Math.cos(a) * 0.35, 0.9 + rnd() * 0.45, Math.sin(a) * 0.35,
        0.07 + rnd() * 0.09, 0.016 + rnd() * 0.016, col, 0.15 + rnd() * 0.2, (rnd() - 0.5) * 0.5);
    }
  }
  return m;
}

// Surface root snarl — nature reclaiming bare soil / rock feet.
function makeRootSnarl(seed) {
  const rnd = seeded((seed | 0) * 31 + 2);
  const m = new Mesh();
  const arms = 3 + ((rnd() * 3) | 0);
  for (let a = 0; a < arms; a++) {
    const yaw = a / arms * 6.2832 + rnd() * 0.8;
    const len = 0.25 + rnd() * 0.45;
    const pts = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bend = Math.sin(t * 2.8 + a) * 0.08;
      pts.push([
        Math.cos(yaw) * len * t + Math.cos(yaw + 1.57) * bend,
        0.01 + Math.sin(t * 3.1) * 0.025 * (1 - t),
        Math.sin(yaw) * len * t + Math.sin(yaw + 1.57) * bend
      ]);
    }
    const bark = [0.16 + rnd() * 0.06, 0.11 + rnd() * 0.04, 0.07];
    tube(m, pts, 4, false, (t, ang, len) => [
      0.014 * (1 - t * 0.65), bark[0], bark[1], bark[2], 0.02, WOOD, ang / 6.2832, len
    ]);
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

// Domain-warped multi-scale density — organic clusters, never a sow grid or noise rings.
function warpXZ(x, z, amp, freq) {
  const wx = (vnoise(x * freq + 17.1, z * freq + 3.7) - 0.5) * amp;
  const wz = (vnoise(x * freq + 9.2, z * freq + 21.4) - 0.5) * amp;
  return [x + wx, z + wz];
}
function clusterField(x, z) {
  const a = warpXZ(x, z, 14, 0.018);
  const b = warpXZ(a[0], a[1], 4.5, 0.055);
  const broad = vnoise(b[0] * 0.011 + 1.1, b[1] * 0.011);
  const mid = vnoise(b[0] * 0.038 + 4.7, b[1] * 0.038);
  const fine = vnoise(b[0] * 0.11 + 8.3, b[1] * 0.11);
  // Soft lobes, not concentric rings: product of warped scales with a low floor.
  return Math.min(1, broad * 0.48 + mid * 0.34 + fine * 0.22);
}
// Ecological preferences: moisture, shade, slope, near-water, canopy cover.
function ecoPrefs(x, z, h, sl) {
  const moist = smooth01(0.15, 2.4, h) * (1 - smooth01(0.18, 0.75, sl)) * (0.4 + 0.6 * vnoise(x * 0.021 + 3, z * 0.021));
  const shade = forestMask(x, z, h, sl);
  const nearWater = smooth01(2.8, 0.35, h) * smooth01(-0.4, 0.55, h);
  const beachEdge = smooth01(0.2, 1.1, h) * (1 - smooth01(1.6, 3.2, h));
  const jungle = clusterField(x, z) * smooth01(0.9, 3.5, h) * (1 - smooth01(0.45, 0.9, sl));
  return { moist, shade, nearWater, beachEdge, jungle, cluster: clusterField(x, z) };
}

// A limb: a tapering tube with wood for a surface. flare swells the foot into buttress roots.
function addLimb(m, pts, r0, r1, sides, col, sway0, sway1, flare) {
  tube(m, pts, sides, true, (t, ang, len) => [
    (r0 + (r1 - r0) * t) * (1 + (flare ? flare * Math.pow(1 - t, 5) * (0.5 + Math.max(0, Math.cos(ang * 3 + flare * 40))) : 0)),
    col[0], col[1], col[2], sway0 + (sway1 - sway0) * t, WOOD, ang / 6.2832, len]);
}

// One lobed pad of a crown. Closed mesh, no cutouts: the outline is the radius, so a
// far tree is the same family as the near one and nothing on it can flicker. The belly
// tucks in and one side hangs, which is what stops the pad reading as a ball.
function addCrownShell(m, cx, cy, cz, size, flat, yaw, petals, contrast, col, sway0, lod, salt) {
  const rings = [6, 4, 3][lod];
  const sides = [14, 10, 8][lod];
  let prev = null;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const u = 0.1 + t * 0.88;
    const yk = -0.46 + u * 1.5;
    const shoulder = Math.sin(Math.pow(u, 0.58) * Math.PI);
    const tuck = u < 0.34 ? 0.42 + (u - 0.1) * 1.7 : 1;
    const row = [];
    for (let k = 0; k <= sides; k++) {
      const a = k / sides * 6.2831853;
      const petal = 1 - contrast + contrast * Math.pow(0.5 + 0.5 * Math.cos(a * petals + yaw), 1.4);
      const asym = 0.84 + 0.18 * Math.cos(a + yaw * 1.37 + salt);
      const grit = 0.9 + 0.12 * Math.sin(a * (3 + (salt % 3)) + t * 3.1 + salt);
      const rad = Math.max(0.01, size * shoulder * tuck * petal * asym * grit);
      const hang = Math.sin(a + yaw) * size * flat * 0.16 * (1 - t);
      const px = cx + Math.cos(a) * rad;
      const py = cy + yk * size * flat + hang;
      const pz = cz + Math.sin(a) * rad;
      const ny = -0.35 + u * 1.55;
      const nx = Math.cos(a), nz = Math.sin(a);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const up = Math.max(0, Math.min(1, u));
      const lightK = (0.58 + 0.5 * up * up);
      row.push(m.v(px, py, pz, nx / nl, ny / nl, nz / nl,
        col[0] * lightK, col[1] * lightK, col[2] * lightK,
        sway0 + up * 0.026, CROWN, a / 6.2831853, t));
    }
    if (prev) for (let k = 0; k < sides; k++) {
      m.tri(prev[k], row[k], prev[k + 1]);
      m.tri(prev[k + 1], row[k], row[k + 1]);
    }
    prev = row;
  }
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
    addLimb(m, pts, fat, fat * 0.55, [16, 8, 4][lod], bark, 0, 0.012, lod < 2 ? flareK : 0);
    return pts;
  };
  const flare = (form === 1 ? 1.0 : 0.55) + rnd() * 0.85;
  buildTrunk(lean, r0, flare);
  if (form === 3) {
    // Extra stems. The random draws run at every level of detail so the crown above them
    // does not jump when the far mesh (which skips the stems) takes over.
    const stems = 1 + ((rnd() * 2) | 0);
    for (let s = 0; s < stems; s++) {
      const a = rnd() * 6.28, off = 0.04 + rnd() * 0.05;
      const rise = [];
      for (let i = 0; i < 8; i++) rise.push(0.85 + rnd() * 0.1);
      if (lod < 2) {
        const L2 = lean + Math.cos(a) * 0.08;
        const pts = [];
        for (let i = 0; i <= rings; i++) {
          const t = Math.pow(i / rings, 1.5);
          const p = at(t, L2);
          const lift = rise[Math.min(7, Math.round(t * 7))];
          pts.push([p[0] + Math.cos(a) * off * (1 - t), p[1] * lift, p[2] + Math.sin(a) * off * (1 - t)]);
        }
        addLimb(m, pts, r0 * 0.7, r0 * 0.4, [10, 6, 3][lod], bark, 0, 0.014, flare * 0.6);
      }
    }
  }
  // flat: pad squash. contrast: depth of the bites in the outline. spread: plan radius.
  const fam = [
    { flat: 0.42, petals: 5, contrast: 0.48, spread: 0.36, size: 1.05, lobes: 6, stack: 0.02 },
    { flat: 0.82, petals: 3, contrast: 0.28, spread: 0.15, size: 0.84, lobes: 5, stack: 0.18 },
    { flat: 0.58, petals: 4, contrast: 0.22, spread: 0.22, size: 1.0, lobes: 7, stack: 0.04 },
    { flat: 0.5, petals: 4, contrast: 0.36, spread: 0.3, size: 0.92, lobes: 6, stack: 0.05 },
    { flat: 0.36, petals: 3, contrast: 0.6, spread: 0.42, size: 0.88, lobes: 5, stack: 0.0 },
    { flat: 0.7, petals: 3, contrast: 0.34, spread: 0.13, size: 0.7, lobes: 4, stack: 0.12 }
  ][form];
  const lobes = fam.lobes + (Math.abs(sd) % 2);
  const spread = fam.spread * (0.86 + rnd() * 0.28);
  const hue = rnd();
  const green = [
    0.04 + hue * 0.03 + (form === 4 ? 0.02 : 0),
    0.1 + hue * 0.04 + (form === 2 ? 0.02 : 0),
    0.025 + (1 - hue) * 0.015
  ];
  const dens = form === 2 ? 1.06 : form === 4 ? 0.86 : 1;
  const tone = [green[0] * dens, green[1] * dens, green[2] * dens];
  const sway0 = form === 5 ? 0.03 : 0.022;
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  // A blade folded on its midrib. rich adds a drip tip (the leaves that cut the sky).
  // d points along the blade, up is the face, out is the crown's surface there.
  const leafAt = (o, d, up, out, len, wid, col, sway, rich, asym) => {
    const sd = unit(cross(up, d)), nn = unit(cross(d, sd));
    const ns = unit([nn[0] + out[0] * 0.85, nn[1] + out[1] * 0.85 + 0.28, nn[2] + out[2] * 0.85]);
    const ix = [];
    const skew = asym || 0;
    m.leaf();
    const layout = rich
      ? [[0, 0, 0.78], [0.36, 1, 1], [0.36, -1, 1], [0.68, 0.52, 1.05], [0.68, -0.46, 0.94], [1.06, 0.06, 1.08]]
      : [[0, 0, 0.8], [0.42, 1, 1], [0.42, -1, 1], [1, 0, 1.1]];
    for (const [t, side, c] of layout) {
      const sgn = side < 0 ? -1 : side > 0 ? 1 : 0;
      const mag = Math.abs(side) * (1 + skew * sgn);
      const across = mag * sgn;
      const fold = sgn ? mag * wid * 0.28 : -t * len * 0.22;
      const droop = t * t * len * (rich ? 0.34 : 0.2);
      ix.push(m.v(
        o[0] + d[0] * len * t + sd[0] * wid * across + nn[0] * fold,
        o[1] + d[1] * len * t + sd[1] * wid * across + nn[1] * fold - droop,
        o[2] + d[2] * len * t + sd[2] * wid * across + nn[2] * fold,
        ns[0] - sd[0] * sgn * 0.28, ns[1], ns[2] - sd[2] * sgn * 0.28,
        col[0] * c, col[1] * c, col[2] * c, sway * (0.82 + 0.22 * t), LEAF, Math.abs(side) > 0.75 ? sgn : side * 0.2, Math.min(1, t)));
    }
    if (rich) {
      m.tri(ix[0], ix[1], ix[2]); m.tri(ix[1], ix[3], ix[2]);
      m.tri(ix[2], ix[3], ix[4]); m.tri(ix[3], ix[5], ix[4]);
    } else {
      m.tri(ix[0], ix[3], ix[1]); m.tri(ix[0], ix[2], ix[3]);
    }
  };
  // Far pads are a little larger so they fill the leaves that level no longer draws.
  const shellK = [0.8, 0.94, 1.04][lod];
  const dark = [0.82, 0.9, 0.98][lod];
  const shellCol = [tone[0] * dark, tone[1] * dark, tone[2] * dark];
  for (let i = 0; i < lobes; i++) {
    const jA = rnd(), jR = rnd(), jS = rnd(), jY = rnd(), jLimb = rnd(), jTake = rnd();
    const tier = i === 0 ? 2 : i % 3;
    const ang = form === 4 ? jA * 6.2832 : i * 2.399 + (jA - 0.5) * (form === 2 ? 0.4 : 0.85);
    const rr = i === 0 ? spread * (form === 2 ? 0.15 : 0.05) : spread * (0.5 + jR * 0.55);
    const size = ((i === 0 ? 0.22 : 0.15) * fam.size + jS * 0.05);
    const cy = th + fam.stack + (i === 0 ? 0.14 : tier * 0.045) + jY * 0.05 + size * 0.15;
    const cx = Math.cos(ang) * rr + lean, cz = Math.sin(ang) * rr;
    const flat = fam.flat * (0.92 + jTake * 0.16);
    // Same draw on every level, so the bough exists in the same place when the mesh changes.
    const s0 = at(i === 0 ? 1 : 0.58 + jLimb * 0.34);
    const e = [cx, cy - size * flat * 0.15, cz];
    // The bough is on every level. Without it the far pads sit off the trunk.
    if (i === 0 || form !== 2 || jTake > 0.28) {
      const q = [];
      const c = [s0[0] + (e[0] - s0[0]) * 0.28, s0[1] + (e[1] - s0[1]) * 0.72, s0[2] + (e[2] - s0[2]) * 0.28];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
        q.push([s0[0] * a + c[0] * b + e[0] * d, s0[1] * a + c[1] * b + e[1] * d, s0[2] * a + c[2] * b + e[2] * d]);
      }
      addLimb(m, q, r0 * (i === 0 ? 0.55 : 0.32), r0 * 0.11, [5, 4, 3][lod], bark, 0.012, 0.03, 0);
      if (lod === 0) {
        for (let f = 0; f < 2; f++) {
          const a2 = ang + (f ? 0.85 : -0.7);
          const tip = [cx + Math.cos(a2) * size * 0.85, cy + size * flat * 0.05, cz + Math.sin(a2) * size * 0.85];
          const mid = [(e[0] + tip[0]) * 0.5, Math.max(e[1], tip[1]) + size * 0.08, (e[2] + tip[2]) * 0.5];
          addLimb(m, [e, mid, tip], r0 * 0.09, r0 * 0.03, 4, bark, 0.02, 0.034, 0);
        }
      }
    }
    addCrownShell(m, cx, cy, cz, size * shellK, flat, ang + i, fam.petals, fam.contrast, shellCol, sway0, lod, sd + i * 3);
    // Sprays sit on the pad. The count and the random stream do not depend on level of
    // detail: the coarser mesh keeps the skyline and every fourth spray, leaves bigger.
    const lr = seeded(sd * 53 + i * 131 + 7);
    const nSpray = Math.max(18, Math.min(44, Math.round(980 * size * size)));
    const big = lod ? 2.05 : 1;
    for (let k = 0; k < nSpray; k++) {
      const r0l = lr(), r1l = lr(), r2l = lr(), r3l = lr();
      const t = 0.32 + ((k + 0.37) / nSpray) * 0.64;
      const ga = k * 2.39996 + i + (r0l - 0.5) * 0.35;
      const petal = 1 - fam.contrast + fam.contrast * Math.pow(0.5 + 0.5 * Math.cos(ga * fam.petals + ang), 1.4);
      const skyline = Math.abs(t - 0.55) < 0.12 || petal > 0.8;
      const keep = lod === 0 || skyline || (k % 4 === 0);
      if (lod === 2 || !keep) continue;
      const u = 0.12 + t * 0.84;
      const shoulder = Math.sin(Math.pow(u, 0.58) * Math.PI);
      const rad = size * shellK * shoulder * petal * (0.92 + r1l * 0.12);
      const yk = -0.46 + u * 1.5;
      const o = [cx + Math.cos(ga) * rad, cy + yk * size * flat * shellK, cz + Math.sin(ga) * rad];
      const out = unit([Math.cos(ga), 0.15 + (u - 0.4), Math.sin(ga)]);
      const upK = Math.max(0, Math.min(1, out[1] * 0.5 + 0.45));
      const lightK = 0.55 + 0.55 * upK * upK;
      const sa = unit(cross(out, [0.31, 0.9, 0.29])), sb = cross(out, sa);
      const nLeaf = 4;
      for (let q = 0; q < nLeaf; q++) {
        const a = q / nLeaf * 6.2832 + r0l * 0.8, ca = Math.cos(a), sn = Math.sin(a);
        const d = unit([
          sa[0] * ca + sb[0] * sn + out[0] * 0.35,
          sa[1] * ca + sb[1] * sn + out[1] * 0.2 - 0.28 - r1l * 0.2,
          sa[2] * ca + sb[2] * sn + out[2] * 0.35
        ]);
        const face = unit([out[0] * 0.65, out[1] * 0.5 + 0.8, out[2] * 0.65]);
        const len = (0.028 + 0.012 * r2l) * big;
        const young = r3l > 0.88 ? 1 : 0;
        const col = [
          tone[0] * lightK * (0.86 + 0.4 * r2l) * (1 + 0.85 * young),
          tone[1] * lightK * (0.86 + 0.4 * r2l) * (1 + 0.3 * young),
          tone[2] * lightK * 0.9
        ];
        leafAt(
          [o[0] + d[0] * 0.004, o[1] + d[1] * 0.004, o[2] + d[2] * 0.004],
          d, face, out, len, len * (0.32 + 0.08 * r0l), col, sway0 + upK * 0.026, false, (r3l - 0.5) * 0.35);
      }
    }
    // Leaves that actually cut the sky: longer, dripping, on the shoulder of each pad.
    // Level 1 keeps every other one so the outline does not round off as you step back.
    const rim = seeded(sd * 91 + i * 17 + 3);
    const nRim = form === 4 ? 6 : 9;
    for (let u = 0; u < nRim; u++) {
      const a0 = rim(), a1 = rim(), a2 = rim();
      if (lod === 2 || (lod === 1 && (u % 2))) continue;
      const a = ang + u / nRim * 6.2832 + (a0 - 0.5) * 0.4;
      const petal = 1 - fam.contrast + fam.contrast * Math.pow(0.5 + 0.5 * Math.cos(a * fam.petals + ang), 1.4);
      const rad = size * shellK * petal * (0.85 + a1 * 0.2);
      const o = [cx + Math.cos(a) * rad, cy + size * flat * shellK * (0.02 - a2 * 0.08), cz + Math.sin(a) * rad];
      // Round and emergent crowns stay up. Spreading, sparse and slender let the rim hang.
      const hang = (form === 1 || form === 2) ? 0.04 : 0.22;
      const d = unit([Math.cos(a) * 0.7, -hang - a2 * hang, Math.sin(a) * 0.7]);
      const face = unit([Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3]);
      const len = (0.05 + 0.03 * a1) * (lod ? 1.7 : 1);
      leafAt(o, d, face, face, len, len * 0.28, [
        tone[0] * (0.7 + 0.35 * a0), tone[1] * (0.75 + 0.3 * a0), tone[2] * 0.85
      ], sway0 + 0.02, true, (a2 - 0.5) * 0.5);
    }
    // Hung under the pad: what you see looking up into the crown. Near only.
    if (lod === 0 && i > 0) {
      const hangN = 4;
      for (let u = 0; u < hangN; u++) {
        const a = ang + u * 1.57 + 0.4;
        const o = [cx + Math.cos(a) * size * 0.28, cy - size * flat * 0.22, cz + Math.sin(a) * size * 0.28];
        const d = unit([Math.cos(a) * 0.25, -0.92, Math.sin(a) * 0.25]);
        leafAt(o, d, [0, -1, 0], d, 0.045 + (u % 2) * 0.012, 0.014, [
          tone[0] * 0.55, tone[1] * 0.62, tone[2] * 0.5
        ], sway0 * 0.8, true, 0.15);
      }
    }
  }
  // The model is one unit tall and the tree stands 6 to 19 m. Sway is in metres after this.
  // Leaves share the pad's weight so a gust moves the crown as one mass; the shader's
  // own flutter is only the tip.
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
  // A tuft: nine narrow blades of unequal height standing round a small foot, each of two
  // lengths so that it curves over as it rises and bends, not tilts, in the wind.
  for (let a = 0; a < 9; a++) {
    const ang = a * 2.399 + (a * 0.17) % 1.1;
    const c = Math.cos(ang), s = Math.sin(ang);
    const lean = 0.1 + (a % 5) * 0.07 + (a === 2 ? 0.14 : 0);
    const h = 0.42 + (a % 4) * 0.16 + ((a * 3) % 5) * 0.06;
    const w0 = 0.028 + (a % 3) * 0.012;
    const foot = 0.03 + (a % 4) * 0.035;
    const base = pos.length / 3;
    for (const [t, wk] of [[0, 1], [0.5, 0.72], [1, 0.12]]) {
      const off = foot + lean * h * t * t;
      for (const side of [-1, 1]) {
        const px = side * w0 * wk;
        pos.push(px * c + off * s, h * t, px * s - off * c);
        uv.push(side > 0 ? 1 : 0, t);
      }
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 5, base + 2, base + 5, base + 4);
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
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
Scatter.prototype.proto = function (lods, radius, cuts, far) {
  this.protos.push({ lods: lods, r: radius, cuts: cuts || [], far: far || cuts || [] });
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
      // Far stream rings start one LOD coarser. Distance cuts still run, so a plant
      // that is close does not lose its fine mesh just because the cell is wide.
      const cellBias = (this.stream && this.stream.enabled) ? this.stream.vegBias(SC_OX + (cx + 0.5) * SC_CW, SC_OZ + (cz + 0.5) * SC_CW) : 0;
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
            // Shadow maps (no view, coarser): keep flowers and low shrubs — their r is often
            // under a metre after scale, and skipping them left blossom clumps unshadowed.
            let ok = vp || !coarser || r > 0.55 || dist < reach * 0.55;
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
              let lod = coarser + (cellBias > 0 ? cellBias : 0);
              const bias = Math.min(28, r * 1.8), last = p.lods.length - 1, cuts = coarser ? p.far : p.cuts;
              // The view's cuts are set for a canvas some 1400 pixels high. On a smaller one a
              // blade is under a pixel sooner, and the level with wider blades takes over sooner.
              const near = coarser ? 1 : Math.max(0.4, Math.min(1, 0.0008 / (this.pxw || 0.0008)));
              // From altitude, keep finer crowns a little longer.
              const airBias = ey > 35 ? Math.min(55, (ey - 35) * 0.45) : 0;
              while (lod < cuts.length && lod < last) {
                const c = cuts[lod] * near + bias + airBias;
                if (dist <= c) break;
                // Long cross-fade: both LODs draw while the finer share falls with distance.
                // Band scales with the cut so high-quality crowns ease out, never snap.
                const band = Math.min(Math.max(c * 0.55, 22), 72);
                const t = (dist - c) / band;
                if (vp && t < 1 && this.fade !== false) {
                  // Smoothstep so the midpoint is soft, not a linear half-ghost.
                  const u = t * t * (3 - 2 * t);
                  q = Math.max(1, Math.min(63, Math.round((1 - u) * 64)));
                  break;
                }
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
        // the wind exposure (which is under 2): 1..63 on the finer copy, 64 more on the coarser.
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
  // Alternate quad diagonals so steep nearshore faces do not stack into one jagged saw.
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      if (((i + j) & 1) === 0) {
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      } else {
        idx[t++] = a; idx[t++] = c; idx[t++] = d;
        idx[t++] = a; idx[t++] = d; idx[t++] = b;
      }
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
// The six places are viewpoints. The Places button and Shift+1–6 jump straight to one.
// Bare 1–7 are the cinematic spaces below: each eases its light and flies to its spot.
const PLACES = [
  { title: 'Palm Beach', line: 'White sand, leaning palms and the wash running up the shore', swatch: 'linear-gradient(#bfe0ea, #37a9a0 48%, #efe3c4 52%)' },
  { title: 'Cliff Overlook', line: 'High on the bluff, with the cove and its shallows below', swatch: 'linear-gradient(#c9d8e2, #4f9f9c 46%, #2f5a3c 78%)' },
  { title: 'Island From Above', line: 'The whole island, ringed by reef and turquoise water', swatch: 'radial-gradient(circle at 50% 55%, #2f6b3a 0 22%, #e4d6ae 23% 30%, #46bfae 31% 56%, #1d6a94)' },
  { title: 'Lagoon Shallows', line: 'Knee-deep in clear water, with palms along the lagoon shore', swatch: 'linear-gradient(#d3ecee, #58c6b6 50%, #cfe3c4)' },
  { title: 'Offshore', line: 'Out on the swell, the island standing across the water', swatch: 'linear-gradient(#b7cbe4 40%, #2c7a50 41% 47%, #1d6f98 48%, #0f4a70)' },
  { title: 'Coral Garden', line: 'Under the surface, beside a coral head and its school', swatch: 'linear-gradient(#2a8fa2, #1f6f86 55%, #e8b7b0)' }
];
// Seven looks for the same island. Each is an hour and a weather row, eased in over a few
// seconds and then held. spot is an optional Places index: Shift-click or a double-click
// flies there while the light changes. The sea model and fly/walk are not touched.
const wxRow = (id) => WEATHER[id].slice(1);
const SPACES = [
  { title: 'Golden Paradise', line: 'Late sun on the sand, the water gone to gold. Shift-click flies to the beach.', swatch: 'linear-gradient(#f6d7a2, #e08a3c 48%, #efe3c4)', hour: ENV_OPEN, wx: 'clear', v: wxRow('clear'), wet: 0, dur: 3.2, spot: 0 },
  { title: 'Tropical Morning', line: 'Soft mist in the hollows and a young sun on the lagoon. Shift-click flies to the shallows.', swatch: 'linear-gradient(#f7e7c1, #7ec8c3 52%, #d7ead0)', hour: 8, wx: 'clouds', v: [0.14, 0, 0.38, 0.74, 2.8, 0.18, 0.24, 0.06, 0.3, 0.18], wet: 0.22, dur: 3.0, spot: 3 },
  { title: 'Blue Paradise', line: 'High sun, a clear sky and turquoise shallows. Shift-click flies to the lagoon.', swatch: 'linear-gradient(#9fd4f2, #1f7eb8 46%, #3ec6b0)', hour: 12, wx: 'clear', v: wxRow('clear'), wet: 0, dur: 2.6, spot: 3 },
  { title: 'Cloud Kingdom', line: 'Towers over the island and a soft light underneath. Shift-click flies above it.', swatch: 'linear-gradient(#f4f7fb, #8aa4c4 42%, #4d6d58)', hour: ENV_H0, wx: 'clouds', v: [0.55, 0, 0, 0.5, 6.5, 0.55, 0.7, 0.4, 1.05, 0.35], wet: 0, dur: 3.6, spot: 2 },
  { title: 'Sunset Dream', line: 'The sun in the sea, colour still held in the air. Shift-click flies offshore.', swatch: 'linear-gradient(#f3a07a, #c45b78 44%, #2a3d6b)', hour: 18.02, wx: 'after', v: wxRow('after'), wet: 0.85, dur: 3.4, spot: 4 },
  { title: 'Tropical Storm', line: 'A dark deck, heavy rain and a sea that stands up. Shift-click flies to the cliff.', swatch: 'linear-gradient(#6d7888, #2c3a48 50%, #1a2830)', hour: ENV_H0, wx: 'storm', v: wxRow('storm'), wet: 1, dur: 3.8, spot: 1 },
  { title: 'Moonlit Island', line: 'The moon on the lagoon, the palms gone to silhouette. Shift-click flies to the beach.', swatch: 'linear-gradient(#1b2740, #3d5a7a 48%, #c5d2e4)', hour: 22.5, wx: 'clear', v: [0.05, 0, 0.16, 0.4, 2.0, 0.12, 0.1, 0, 0.1, 0.45], wet: 0.05, dur: 3.6, spot: 0 }
];
// The water the island opens with and keeps.
const WATER = { amp: 1.05, spd: 0.95, frq: 0.86, dir: 0.08, layers: 7, cx: 0.9, rough: 0.09, refl: 0.82, refr: 1.15, alpha: 1, depthK: 0.55, sun: 1.02, sky: 1.02, sunAng: -0.1, sim: 1, rip: 0.75, ripSpd: 0.95, disturb: 0.85, ripSize: 1.15, deep: [0.012, 0.08, 0.11], shal: [0.05, 0.26, 0.24], mood: [0.55, 0.15, 0.12, 0.95] };
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
function markSpace(i) {
  document.querySelectorAll('#spaces button').forEach((b, n) => b.classList.toggle('on', n === i));
}
function releaseSpace() {
  envCineRelease();
  markSpace(-1);
}
function spaceSpec(i) {
  const s = SPACES[i];
  const spec = { hour: s.hour, wx: s.wx, v: s.v, wet: s.wet, dur: s.dur, id: i, astroDay: 0, spaceId: 0 };
  // Moonlit Island keeps its weather row and its ease, and lands on the hour tonight's
  // real moon stands highest, once the island sun is below the twilight.
  if (i === SPACES.length - 1 && typeof astroMoonlitHour === 'function') {
    const pick = astroMoonlitHour();
    spec.hour = pick.hour;
    spec.astroDay = pick.day;
    spec.spaceId = 7;
  }
  return spec;
}
// Ease into space i. cam flies to its optional start (smooth, unless snap). Number keys
// pass cam true so each space also takes its cinematic viewpoint.
function applySpace(i, opt) {
  const s = SPACES[i];
  if (!s) return;
  const o = opt || {};
  const same = env.spacePick === i && (env._cine || env.pin);
  if (o.snap) envCineSnap(spaceSpec(i));
  else if (!same) envCineBegin(spaceSpec(i));
  markSpace(i);
  if (o.cam && s.spot != null && spots[s.spot]) {
    if (o.snap) goSpot(s.spot);
    else goPlace(s.spot, true);
  }
  if (!o.quiet) showCaption(s);
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
      // Keep the Places strip open so another place can be picked without reopening.
      document.body.classList.remove('hour-open', 'weather-open', 'spaces-open');
      goPlace(id, false);
    });
    nav.append(b);
  });
  $('placebtn').addEventListener('click', () => {
    document.body.classList.remove('hour-open', 'weather-open', 'spaces-open');
    document.body.classList.toggle('places-open');
  });
  bindSpaces();
  bindPickMenus();
  $('walkbtn').addEventListener('click', () => {
    trip = null;
    orbit = false;
    setFlyMode(false);
    mode = 2;
    document.body.classList.add('playing', 'studio');
    document.body.classList.remove('places-open', 'spaces-open', 'cinema');
    showModeHint(false);
    tryLockPointer();
  });
  const flyBtn = $('flybtn');
  if (flyBtn) flyBtn.addEventListener('click', () => {
    trip = null;
    orbit = false;
    mode = 2;
    document.body.classList.add('playing', 'studio');
    document.body.classList.remove('places-open', 'spaces-open', 'cinema');
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
    document.body.classList.remove('places-open', 'spaces-open', 'cinema-peek');
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
let musicVol = 0.88;
// score.js ships as type=text/plain (AEI critical-gzip deferral). Eval it before createScore.
// MUST stay at module scope — nested inside boot/frame leaves makeAudio unable to see it (silent music).
function ensureScore() {
  if (typeof createScore === 'function') return true;
  const el = document.getElementById('ww-deferred-score');
  if (!el) return false;
  try { (0, eval)(el.textContent); } catch (err) { console.error(err); return false; }
  return typeof createScore === 'function';
}
function startIslandScore(ac, dest) {
  if (!ensureScore()) return null;
  try {
    const sc = createScore(ac, dest);
    sc.start();
    sc.setAudible(musicOn && !muted, musicVol);
    return sc;
  } catch (err) {
    console.error(err);
    return null;
  }
}
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
  // Underwater muffler only — open above water. Category EQ lives on ocean/insect/bird buses.
  const under = ac.createBiquadFilter();
  under.type = 'lowpass'; under.frequency.value = 16000; under.Q.value = 0.2;
  const sfx = ac.createGain();
  sfx.gain.value = sfxOn ? 1 : 0;
  master.connect(sfx); sfx.connect(under); under.connect(ac.destination);
  // Category buses: gentle LPF + upper-mid peaking cuts (not one global muffler).
  function catEq(lpHz, cutHz, cutDb, cutQ) {
    const bus = ac.createGain(); bus.gain.value = 1;
    const cut = ac.createBiquadFilter();
    cut.type = 'peaking'; cut.frequency.value = cutHz; cut.Q.value = cutQ; cut.gain.value = cutDb;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = lpHz; lp.Q.value = 0.35;
    bus.connect(cut); cut.connect(lp); lp.connect(master);
    return { bus: bus, cut: cut, lp: lp };
  }
  const oceanEq = catEq(9800, 2600, -3.5, 0.85);
  // Insects: cut piercing upper-mids + gentle LPF (texture remains; not muted).
  const insectEq = catEq(4800, 3100, -9.5, 1.25);
  const insectBite = ac.createBiquadFilter();
  insectBite.type = 'peaking'; insectBite.frequency.value = 4500; insectBite.Q.value = 1.05; insectBite.gain.value = -8.5;
  insectEq.cut.disconnect(); insectEq.cut.connect(insectBite); insectBite.connect(insectEq.lp);
  const birdEq = catEq(6000, 3800, -5.5, 1.05);
  const airEq = catEq(7200, 2200, -2.5, 0.7);
  function bed(type, freq, q, dest) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(dest || master);
    src.start(0, Math.random() * 20);
    return { gain: g, filter: f };
  }
  // Ocean-first foundation: deep swell + mid body + soft foam (synth noise only).
  const oceanPan = ac.createStereoPanner(); oceanPan.pan.value = 0;
  oceanPan.connect(oceanEq.bus);
  const swell = bed('lowpass', 120, 0.4, oceanEq.bus);
  const surf = bed('lowpass', 340, 0.48, oceanEq.bus);
  const body = bed('bandpass', 680, 0.6, oceanPan);
  const hiss = bed('bandpass', 1400, 0.55, oceanPan);
  const wind = bed('bandpass', 240, 0.35, airEq.bus);
  const insects = bed('bandpass', 2600, 0.5, insectEq.bus);
  // Subtle air — same shared gust as plants/ocean; sits under ocean in the mix.
  function windBed(type, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    const p = ac.createStereoPanner(); p.pan.value = 0;
    src.connect(f); f.connect(g); g.connect(p); p.connect(airEq.bus);
    src.start(0, Math.random() * 20);
    return { gain: g, filter: f, pan: p };
  }
  const airFar = windBed('lowpass', 180, 0.4);
  const airCoast = windBed('bandpass', 520, 0.55);
  const airPalm = windBed('bandpass', 1200, 0.6);
  const airCanopy = windBed('bandpass', 820, 0.45);
  const airGrass = windBed('bandpass', 2100, 0.4);
  // Ocean stereo wash + filter breathe.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.034;
  const lfoG = ac.createGain(); lfoG.gain.value = 100;
  lfo.connect(lfoG); lfoG.connect(surf.filter.frequency); lfo.start();
  const lfoSwell = ac.createOscillator();
  lfoSwell.frequency.value = 0.019;
  const lfoSwellG = ac.createGain(); lfoSwellG.gain.value = 40;
  lfoSwell.connect(lfoSwellG); lfoSwellG.connect(swell.filter.frequency); lfoSwell.start();
  const lfoBody = ac.createOscillator();
  lfoBody.frequency.value = 0.048;
  const lfoBodyG = ac.createGain(); lfoBodyG.gain.value = 160;
  lfoBody.connect(lfoBodyG); lfoBodyG.connect(body.filter.frequency); lfoBody.start();
  const lfo2 = ac.createOscillator();
  lfo2.frequency.value = 0.013;
  const lfo2G = ac.createGain(); lfo2G.gain.value = 70;
  lfo2.connect(lfo2G); lfo2G.connect(wind.filter.frequency); lfo2.start();
  const panLfo = ac.createOscillator(); panLfo.frequency.value = 0.021;
  const panAmt = ac.createGain(); panAmt.gain.value = 0.35;
  panLfo.connect(panAmt); panAmt.connect(airCoast.pan.pan); panLfo.start();
  const panLfo2 = ac.createOscillator(); panLfo2.frequency.value = 0.017;
  const panAmt2 = ac.createGain(); panAmt2.gain.value = 0.25;
  panLfo2.connect(panAmt2); panAmt2.connect(airPalm.pan.pan); panLfo2.start();
  const seaPanLfo = ac.createOscillator(); seaPanLfo.frequency.value = 0.027;
  const seaPanAmt = ac.createGain(); seaPanAmt.gain.value = 0.32;
  seaPanLfo.connect(seaPanAmt); seaPanAmt.connect(oceanPan.pan); seaPanLfo.start();
  // Underwater rush (Abyssal): same noise bed, bandpass that opens with swim speed.
  const rush = bed('bandpass', 280, 0.55, master);
  const api = {
    ac: ac, master: master, under: under, sfx: sfx,
    oceanEq: oceanEq, insectEq: insectEq, birdEq: birdEq, airCat: airEq,
    swell: swell.gain, surf: surf.gain, body: body.gain, hiss: hiss.gain,
    wind: wind.gain, insects: insects.gain,
    airFar: airFar.gain, airCoast: airCoast.gain, airPalm: airPalm.gain,
    airCanopy: airCanopy.gain, airGrass: airGrass.gain,
    airCoastF: airCoast.filter, airPalmF: airPalm.filter, airCanopyF: airCanopy.filter,
    rush: rush.gain, rushF: rush.filter,
    shoreAmt: 0.4, underAmt: 0, deepAmt: 0, wreckNear: 0, alive: true, hush: 1, birds: 1, _gustPeak: 0, _tBub: 0, _underGoal: 16000
  };
  // Deep pressure rumble — low filtered noise that rises with immersion depth.
  const pressure = bed('lowpass', 90, 0.7, master);
  api.pressure = pressure.gain;
  api.pressureF = pressure.filter;
  // ---- What lives in the air, by ear. Nothing here is a loop: each singer keeps its own
  // time, and how many are singing follows the hour, the rain, the wind and the trees.
  // A rasp: a band of noise beaten at a steady rate, which is how a cicada's tymbal and a
  // dragonfly's wings both make their sound.
  // Soft amplitude breath — sine LFO only. Square AM edges read as metallic ticks.
  const rasp = (band, q, beatHz, depth, to) => {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = band; f.Q.value = q;
    const beat = ac.createGain(); beat.gain.value = 1 - depth;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = beatHz;
    const od = ac.createGain(); od.gain.value = depth; o.connect(od); od.connect(beat.gain);
    const g = ac.createGain(); g.gain.value = 0;
    const p = ac.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f); f.connect(beat); beat.connect(g); g.connect(p); p.connect(to);
    src.start(0, Math.random() * 20); o.start();
    return g.gain;
  };
  // Insects = subtle texture through insectEq (upper-mid cut + LPF), not muted.
  const bus = () => { const g = ac.createGain(); g.gain.value = 0; g.connect(insectEq.bus); return g; };
  const cicadas = bus(), crickets = bus(), chorus = bus();
  for (let i = 0; i < 2; i++) {
    // Soft tymbal air — mid band + low Q; slow bouts only (no HF ring / tick).
    const g = rasp(1800 + Math.random() * 700, 1.35, 18 + Math.random() * 14, 0.14, cicadas);
    const bout = () => {
      if (!api.alive) return;
      const t = ac.currentTime, len = 10 + Math.random() * 16, peak = 0.05 + Math.random() * 0.08;
      g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + 3.5 + Math.random() * 3);
      g.setValueAtTime(peak, t + len); g.exponentialRampToValueAtTime(0.0001, t + len + 4.5);
      setTimeout(bout, (len + 14 + Math.random() * 18) * 1000);
    };
    setTimeout(bout, 8000 + Math.random() * 20000);
  }
  // Crickets: continuous soft mid air only — no pulsed oscillator ticks (those read as metallic clanks every few seconds).
  for (let i = 0; i < 2; i++) {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1600 + Math.random() * 500; f.Q.value = 1.1;
    const g = ac.createGain(); g.gain.value = 0.025 + Math.random() * 0.03;
    const p = ac.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f); f.connect(g); g.connect(p); p.connect(crickets);
    src.start(0, Math.random() * 20);
  }
  // Far night chorus: soft shimmer, not a high resonant scream.
  rasp(3200, 1.6, 12, 0.22, chorus).value = 0.45;
  const rain = bed('bandpass', 1600, 0.35, airEq.bus), patter = bed('bandpass', 420, 0.5, airEq.bus), rustle = bed('bandpass', 2400, 0.35, airEq.bus);
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
    // Hierarchy: ocean carries the bed; insects stay a quiet texture (no metal ring).
    cicadas.gain.value = m * 0.032 * s.heat * dry * (0.25 + 0.75 * s.wood) * up * api.hush * (1 - 0.4 * blow);
    crickets.gain.value = m * 0.024 * s.dark * dry * (0.4 + 0.6 * s.wood) * up * (1 - 0.5 * blow);
    chorus.gain.value = m * 0.016 * Math.max(s.dark, s.low * 0.5) * dry * up;
    rain.gain.value = m * 0.085 * s.rain * (s.under ? 0.15 : 1);
    patter.gain.value = m * 0.075 * s.rain * s.rain * (s.under ? 0.3 : 1);
    rustle.gain.value = m * 0.02 * g2 * (0.25 + 0.75 * s.wood) * up;
    // Subtle air under the ocean bed.
    ease(airFar.gain, m * 0.022 * (0.2 + 0.8 * breeze) * up);
    ease(airCoast.gain, m * 0.032 * blow * (0.35 + 0.65 * (s.shore || 0)) * up);
    ease(airPalm.gain, m * 0.026 * g2 * (0.2 + 0.8 * (s.palm || 0)) * up);
    ease(airCanopy.gain, m * 0.028 * g2 * (0.15 + 0.85 * s.wood) * up);
    ease(airGrass.gain, m * 0.014 * breeze * (1 - 0.6 * s.wood) * (1 - (s.shore || 0) * 0.3) * up);
    // Gust whoosh: open filters briefly when a strong cell arrives.
    if (s.gust > api._gustPeak + 1.8 && s.gust > 7) {
      api._gustPeak = s.gust;
      const t = ac.currentTime;
      airCoast.filter.frequency.cancelScheduledValues(t);
      airCoast.filter.frequency.setValueAtTime(airCoast.filter.frequency.value, t);
      airCoast.filter.frequency.exponentialRampToValueAtTime(900, t + 0.15);
      airCoast.filter.frequency.exponentialRampToValueAtTime(520, t + 1.4);
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
  // Soft leaf drip under trees in rain — rare, low, no metallic ping.
  const drip = () => {
    if (!api.alive) return;
    if (!muted && wetness > 0.08 && Math.random() < 0.12 + woods * 0.25) {
      const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
      src.buffer = burst; f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 500; f.Q.value = 0.5; p.pan.value = Math.random() * 2 - 1;
      g.gain.setValueAtTime(0.003 + Math.random() * 0.006, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08 + Math.random() * 0.06);
      src.connect(f); f.connect(g); g.connect(p); p.connect(master);
      src.start(t, Math.random()); src.stop(t + 0.12);
    }
    setTimeout(drip, 180 + Math.random() * 520 / Math.max(wetness, 0.12));
  };
  drip();
  // Underwater bubble bursts (Abyssal): short rising blips while submerged.
  // Deeper water uses softer, lower blips; wreck proximity adds a wood groan cue.
  const bubble = () => {
    if (!api.alive) return;
    if (!muted && api.underAmt > 0.4 && Math.random() < 0.45) {
      const t = ac.currentTime;
      const deep = Math.min(1, api.deepAmt || 0);
      const n = 1 + ((Math.random() * (5 - deep * 2)) | 0);
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
        const f0 = (320 + Math.random() * 700) * (1 - 0.45 * deep), len = 0.04 + Math.random() * 0.08;
        const a = t + i * (0.03 + Math.random() * 0.05);
        o.type = 'sine'; o.frequency.setValueAtTime(f0, a); o.frequency.exponentialRampToValueAtTime(f0 * (1.4 + 0.4 * (1 - deep)), a + len);
        g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime((0.01 + Math.random() * 0.018) * (1 - 0.35 * deep), a + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, a + len);
        p.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(g); g.connect(p); p.connect(sfx); o.start(a); o.stop(a + len + 0.02);
      }
    }
    // Occasional hull creak when near a colonised wreck underwater.
    if (!muted && api.underAmt > 0.5 && api.wreckNear > 0.35 && Math.random() < 0.12 * api.wreckNear) {
      const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'triangle';
      const f0 = 55 + Math.random() * 40;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.35);
      f.type = 'bandpass'; f.frequency.value = f0 * 1.4; f.Q.value = 3.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018 * api.wreckNear, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(f); f.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.45);
    }
    setTimeout(bubble, 180 + Math.random() * 520 / Math.max(api.underAmt, 0.15));
  };
  bubble();
  // Birds: category EQ from ambient mix; phrases spatial (pan + distance) from living agents.
  const note = (t, f0, f1, len, peak, pan, type, trill) => {
    const o = ac.createOscillator(), g = ac.createGain(), p = ac.createStereoPanner();
    o.type = type; p.pan.value = pan;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    if (trill) {
      const v = ac.createOscillator(), vg = ac.createGain();
      v.frequency.value = trill; vg.gain.value = f0 * 0.055; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + len + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.04, len * 0.35));
    g.gain.setValueAtTime(peak, t + len * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(p); p.connect(birdEq.bus); o.start(t); o.stop(t + len + 0.05);
  };
  const R = (a, b) => a + Math.random() * (b - a);
  // Sparse tropical song, synthesised only: warblers, trills, chirp cascades; varied distance.
  const singers = [0, 0, 1, 1, 2].map((kind) => {
    const ph = [];
    const dist = R(0.2, 1);
    if (kind === 0) {
      for (let k = 0, t = 0, n = 3 + ((Math.random() * 3) | 0); k < n; k++) { const f = R(2400, 4000), len = R(0.06, 0.13); ph.push([t, f, f * R(0.82, 1.22), len, 0]); t += len + R(0.05, 0.12); }
    } else if (kind === 1) {
      const f = R(2700, 3800);
      ph.push([0, f * 0.88, f * 0.96, 0.07, 0], [0.12, f * 0.96, f, 0.07, 0], [0.26, f, f * R(0.98, 1.02), R(0.35, 0.75), R(11, 18)]);
    } else {
      for (let k = 0, t = 0, f = R(3000, 4500), n = 4 + ((Math.random() * 3) | 0); k < n; k++) {
        const len = R(0.04, 0.075);
        ph.push([t, f, f * R(0.84, 0.95), len, 0]);
        f *= R(0.9, 0.97); t += len + R(0.03, 0.07);
      }
    }
    const pan = (dist > 0.55 ? R(-0.9, 0.9) : R(-0.35, 0.35));
    return { kind: kind, ph: ph, pan: pan, far: dist, x: 0, z: 0 };
  });
  api._birdEar = { x: 0, z: 0, yaw: 0 };
  api.birdListen = (x, z, yaw) => { api._birdEar.x = x; api._birdEar.z = z; api._birdEar.yaw = yaw; };
  function birdSpatialize(bx, bz) {
    const e = api._birdEar;
    const dx = bx - e.x, dz = bz - e.z, dist = Math.hypot(dx, dz);
    const localX = dx * Math.cos(-e.yaw) - dz * Math.sin(-e.yaw);
    const pan = Math.max(-1, Math.min(1, localX / Math.max(8, dist * 0.35)));
    const far = Math.pow(Math.max(0.12, 1 - dist / 55), 1.4);
    return { pan, far, dist };
  }
  function sing(b, again) {
    if (!api.alive || muted) return;
    const t = ac.currentTime + 0.03, pace = R(0.94, 1.08), tune = R(0.988, 1.012);
    const spat = (b.x || b.z) ? birdSpatialize(b.x, b.z) : { pan: b.pan, far: b.far, dist: 20 };
    if (spat.dist > 52) return;
    const peak = [0.013, 0.01, 0.011][b.kind] * (0.35 + 0.65 * spat.far);
    for (const n of b.ph) note(t + n[0] * pace, n[1] * tune, n[2] * tune, n[3] * pace, peak, spat.pan, 'sine', n[4]);
    if (spat.far > 0.55 && spat.dist < 18) api.hush = 0.45;
    const end = (b.ph[b.ph.length - 1][0] + 0.6) * pace;
    if (again > 0 && Math.random() < 0.55) setTimeout(() => sing(b, again - 1), (end + R(1.4, 3.5)) * 1000);
    else if (Math.random() < 0.22) { const o = singers.filter((x) => x.kind === b.kind && x !== b)[0]; if (o) setTimeout(() => sing(o, 0), (end + R(1.2, 3.2)) * 1000); }
  }
  // Prefer a perched/forest agent as the singer when the ecosystem exposes one.
  api.singFrom = (agents) => {
    if (!agents || !agents.length) return false;
    const a = agents[(Math.random() * agents.length) | 0];
    const b = singers[(Math.random() * singers.length) | 0];
    b.x = a.x; b.z = a.z; b.far = 1;
    sing(b, (Math.random() * 2) | 0);
    return true;
  };
  // Thunder: a crack when the stroke was close, then the low roll of the rest of the channel
  // arriving from further and further off. Distance takes the top off it and stretches it out.
  api.thunder = (d) => {
    if (!api.alive || muted) return;
    const t = ac.currentTime, near = Math.exp(-d / 2600), len = 3.5 + 3.5 * Math.random() + d / 2200;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
    f.type = 'lowpass'; f2.type = 'lowpass'; f2.frequency.value = 900; p.pan.value = Math.random() - 0.5;
    f.frequency.setValueAtTime(180 + 1500 * near, t); f.frequency.exponentialRampToValueAtTime(60, t + len);
    const peak = 0.5 + 2.6 * near;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.04 + 0.5 * (1 - near));
    let at = t + 0.3 + 0.5 * (1 - near), lvl = peak;
    while (at < t + len - 0.8) {
      lvl *= 0.5 + 0.35 * Math.random();
      g.gain.exponentialRampToValueAtTime(lvl * (0.35 + 0.3 * Math.random()), at);
      at += 0.2 + 0.5 * Math.random();
      g.gain.exponentialRampToValueAtTime(lvl, at);
      at += 0.25 + 0.6 * Math.random();
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(f2); f2.connect(g); g.connect(p); p.connect(master);
    src.start(t, Math.random() * 20); src.stop(t + len + 0.1);
    if (near > 0.45) {
      const c = ac.createBufferSource(), cf = ac.createBiquadFilter(), cg = ac.createGain();
      c.buffer = burst; cf.type = 'highpass'; cf.frequency.value = 700;
      cg.gain.setValueAtTime(0.5 * near * near, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      c.connect(cf); cf.connect(cg); cg.connect(master);
      c.start(t, Math.random()); c.stop(t + 0.3);
    }
  };
  // No scheduled breaker crash pulses — looping noise beds carry the ocean.
  // (Old crash() every 3–8 s / 14–28 s read as a repeating metallic bang.)
  function later(fn, lo, hi) {
    const wait = (lo + Math.random() * (hi - lo)) * 1000;
    setTimeout(() => {
      if (!api.alive) return;
      fn();
      later(fn, lo, hi);
    }, wait);
  }
  later(() => {
    // Sparse tropical calls with long natural pauses; strongest at dawn.
    if (Math.random() > api.birds * 0.65) return;
    if (api._singLiving && api._singLiving()) return;
    const b = singers[(Math.random() * singers.length) | 0];
    b.x = api._birdEar.x + R(-25, 25); b.z = api._birdEar.z + R(-25, 25);
    sing(b, Math.random() < 0.35 ? 1 : 0);
  }, 7, 18);
  // Eval deferred score.js then start Beneath the Blue (module-scope ensureScore).
  score = startIslandScore(ac, under);
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
const ARROWS = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].forEach((c) => { K[c] = 0; });
let lookX = 0, lookY = 0, dragging = false, touchN = 0;
let velX = 0, velY = 0, velZ = 0, hop = 0, hopV = 0;
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

// Spaces strip: keys 1–7 and the Spaces button. Built with the other pickers.
function bindSpaces() {
  const nav = $('spaces');
  if (!nav || nav.dataset.ready) return;
  nav.dataset.ready = '1';
  let lastId = -1, lastAt = 0;
  SPACES.forEach((p, id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    const sw = document.createElement('i');
    sw.style.background = p.swatch;
    sw.textContent = String(id + 1);
    const name = document.createElement('b');
    name.textContent = p.title;
    const line = document.createElement('span');
    line.textContent = p.line;
    b.append(sw, name, line);
    b.addEventListener('click', (e) => {
      document.body.classList.remove('hour-open', 'weather-open', 'places-open');
      document.body.classList.add('spaces-open');
      const now = performance.now();
      const again = lastId === id && now - lastAt < 420;
      lastId = id;
      lastAt = now;
      // A second click, or Shift, also takes the optional camera start. The first click
      // only changes the light, so browsing the strip does not pick you up.
      applySpace(id, { cam: e.shiftKey || again });
    });
    nav.append(b);
  });
  markSpace(env.spacePick);
  const btn = $('spacebtn');
  if (btn) btn.addEventListener('click', () => {
    document.body.classList.remove('hour-open', 'weather-open', 'places-open');
    document.body.classList.toggle('spaces-open');
  });
}
// T / Hour and R / Weather open pickers. Shift+T / Shift+R still step for capture workflows.
function stepHour(back) { releaseSpace(); envNextStop(back); if (!qstr.has('shot')) env.run = true; showCaption(envLabel()); paintPickMenus(); }
function stepWeather(back) {
  releaseSpace();
  const names = Object.keys(WEATHER), i = names.indexOf(env.wx) + (back ? -1 : 1);
  env.auto = i < 0 || i >= names.length;
  envSet(names[(i + names.length) % names.length], false);
  env.hold = env.auto ? 240 : 1e9;
  showCaption(envLabel());
  paintPickMenus();
}
function pickHour(stopH) {
  releaseSpace();
  env.goal = stopH;
  env.astroDay = 0;
  if (!qstr.has('shot')) env.run = true;
  // Leave the Hour menu open next to the chrome so another stop can be chosen.
  document.body.classList.remove('weather-open', 'places-open', 'spaces-open');
  document.body.classList.add('hour-open');
  showCaption(envLabel());
  paintPickMenus();
}
function pickWeather(wx) {
  releaseSpace();
  if (wx === 'auto') {
    env.auto = true;
    env.hold = 240;
  } else {
    env.auto = false;
    envSet(wx, true);
    env.hold = 1e9;
  }
  // Leave the Weather menu open next to the chrome so another kind can be chosen.
  document.body.classList.remove('hour-open', 'places-open', 'spaces-open');
  document.body.classList.add('weather-open');
  showCaption(envLabel());
  paintPickMenus();
}
function paintPickMenus() {
  const hourMenu = $('hourmenu');
  if (hourMenu) {
    const from = env.goal != null ? env.goal : env.hour;
    hourMenu.querySelectorAll('button[data-h]').forEach((b) => {
      const h = +b.dataset.h;
      b.classList.toggle('on', Math.abs(h - from) < 0.2);
    });
  }
  const wxMenu = $('weathermenu');
  if (wxMenu) {
    wxMenu.querySelectorAll('button[data-wx]').forEach((b) => {
      const id = b.dataset.wx;
      const held = !!(env.pin || env._cine);
      b.classList.toggle('on', !held && (id === 'auto' ? env.auto : (!env.auto && id === env.wx)));
    });
  }
}
function bindPickMenus() {
  const hourMenu = $('hourmenu'), wxMenu = $('weathermenu');
  if (hourMenu && !hourMenu.dataset.ready) {
    hourMenu.dataset.ready = '1';
    DAY_STOPS.forEach(([h, name]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.h = String(h);
      b.textContent = name;
      b.addEventListener('click', () => pickHour(h));
      hourMenu.append(b);
    });
  }
  if (wxMenu && !wxMenu.dataset.ready) {
    wxMenu.dataset.ready = '1';
    const auto = document.createElement('button');
    auto.type = 'button';
    auto.dataset.wx = 'auto';
    auto.textContent = 'Auto weather';
    auto.addEventListener('click', () => pickWeather('auto'));
    wxMenu.append(auto);
    Object.keys(WEATHER).forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.wx = id;
      b.textContent = WEATHER[id][0];
      b.addEventListener('click', () => pickWeather(id));
      wxMenu.append(b);
    });
  }
  const hourBtn = $('hourbtn'), skyBtn = $('skybtn');
  if (hourBtn) {
    hourBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.body.classList.remove('places-open', 'spaces-open', 'weather-open');
      document.body.classList.toggle('hour-open');
      paintPickMenus();
    });
  }
  if (skyBtn) {
    skyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.body.classList.remove('places-open', 'spaces-open', 'hour-open');
      document.body.classList.toggle('weather-open');
      paintPickMenus();
    });
  }
  paintPickMenus();
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
    ? 'Mouse look · W flies where you look · Space up · Q down · Shift fast · F walk'
    : 'Mouse look · WASD or arrows move · Shift run · Space jump · Q dive · F fly';
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
  // Space on dry ground is a hop. It lifts the eye and nothing else: what the walker meets
  // is still met at standing height, so a hop carries nobody over a rock or into one.
  if (hop > 0 || hopV > 0) { hopV -= 13 * dt; hop = Math.max(0, hop + hopV * dt); if (hop === 0) hopV = 0; }
  else if (K.Space && gh >= wh - 0.25) hopV = 4.3;
  camY += (eye + hop - camY) * (qstr.has('shot') ? 1 : 1 - Math.exp(-dt * 18));
  // The easing is for comfort; it is never allowed to leave the eye in the ground or the coral.
  camY = Math.max(camY, gh + 0.3, top);
}
function bootKeys() {
  addEventListener('keydown', (e) => {
    const kc = ARROWS[e.code] || e.code;
    if (K[kc] != null) {
      K[kc] = 1; e.preventDefault();
      // A move key in the orbit view takes it over in first person (the frame does the rest).
      if (orbit && mode === 2 && kc.length === 4 && 'WASD'.includes(kc[3])) tryLockPointer();
    }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      musicVol = Math.min(1, Math.max(0.15, musicVol + (e.code === 'BracketRight' ? 0.08 : -0.08)));
    }
    if (e.repeat) return;
    if (e.code === 'KeyM') { muted = !muted; if (audio) audio.master.gain.value = muted ? 0 : 0.9; }
    if (e.code === 'KeyN') {
      musicOn = !musicOn;
      paintMusic();
      if (score) score.setAudible(musicOn && !muted, musicVol);
      else if (audio) score = startIslandScore(audio.ac, audio.under);
    }
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
      if (document.body.classList.contains('places-open')
        || document.body.classList.contains('spaces-open')
        || document.body.classList.contains('hour-open')
        || document.body.classList.contains('weather-open')) {
        document.body.classList.remove('places-open', 'spaces-open', 'hour-open', 'weather-open');
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
    if (e.code === 'KeyT' && mode > 0) {
      if (e.shiftKey) stepHour(true);
      else {
        document.body.classList.remove('places-open', 'spaces-open', 'weather-open');
        document.body.classList.toggle('hour-open');
        paintPickMenus();
      }
    }
    if (e.code === 'KeyR' && mode > 0) {
      if (e.shiftKey) stepWeather(true);
      else {
        document.body.classList.remove('places-open', 'spaces-open', 'hour-open');
        document.body.classList.toggle('weather-open');
        paintPickMenus();
      }
    }
    // 1–7 ease a cinematic space and fly to its viewpoint. Shift+1–6 still jumps to a place.
    // 7 is Moonlit Island: the ease lands on tonight's real moon and holds, then flies to the beach.
    if (e.code >= 'Digit1' && e.code <= 'Digit7' && mode === 2) {
      const n = e.code.charCodeAt(5) - 49;
      if (e.shiftKey && n < PLACES.length) {
        document.body.classList.remove('spaces-open', 'hour-open', 'weather-open');
        goPlace(n, false);
      } else {
        document.body.classList.remove('places-open', 'hour-open', 'weather-open');
        applySpace(n, { cam: true });
      }
    }
  });
  addEventListener('keyup', (e) => { const kc = ARROWS[e.code] || e.code; if (K[kc] != null) K[kc] = 0; });
  // A key held when the window loses focus never sends its keyup, and the walker would run on.
  addEventListener('blur', () => { for (const c in K) K[c] = 0; });
  const canvas = $('c');
  canvas.addEventListener('mousedown', (e) => {
    if (mode !== 2 || e.button !== 0) return;
    dragging = true;
    if (orbit) { downX = e.clientX; downY = e.clientY; moved = 0; return; }
    // With the mouse already looking, a click touches the water where the eye is aimed.
    if (document.pointerLockElement === canvas) { dropRipple(innerWidth / 2, innerHeight / 2); return; }
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
    // Dragging looks too, for a browser that will not lock the mouse.
    if (document.pointerLockElement === canvas || dragging) { lookX += e.movementX; lookY += e.movementY; }
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
  document.body.classList.remove('playing', 'places-open', 'spaces-open', 'cinema', 'cinema-peek', 'locked');
  velX = velY = velZ = 0;
  if (document.pointerLockElement) document.exitPointerLock();
}
// Point the camera at tonight's moon. The moon in the uniform is turned by sunAng; the
// camera is not, so the aim uses that same turn. moonview=land keeps the coast in frame.
function aimMoon() {
  envLight(env.cover || 0);
  const m = env.moon, a = (typeof wp !== 'undefined' && wp.sunAng) || 0;
  const ca = Math.cos(a), sa = Math.sin(a);
  const x = m[0] * ca - m[2] * sa, y = m[1], z = m[0] * sa + m[2] * ca;
  const land = qstr.get('moonview') === 'land';
  const yp = lookYP(x, land ? Math.min(y, 0.2) : y, z);
  yaw = yp[0];
  pitch = land ? Math.max(0.02, Math.min(0.22, 0.06 + yp[1] * 0.2)) : Math.max(-1.2, Math.min(1.2, yp[1]));
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

    // The scene and its mirror are drawn with four samples to the pixel. A palm's leaflets
    // and a tree's leaves are a pixel wide or less from a few metres off, and with one sample
    // each was there or not as it swayed, so every crown flashed in the wind.
    // It is asked for, not the default: on a Mac it drew trees and coral in stray colours, a
    // fault the software renderer it was written against does not show.
    const MS = qstr.get('msaa') === '4' ? 4 : 1;
    const code = shaderCode(q.hres, q.span, q.water, MS);
    const mod = device.createShaderModule({ code: code });
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    const oceanMod = device.createShaderModule({ code: OCEAN_WGSL });
    const VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    // One letter a binding; the letters are listed in gpu.js.
    const ubLayout = layoutOf(device, VS | FS, 'u');
    const geoLayout = layoutOf(device, VS | FS, 'uttdcuttasdffs');
    const simLayout = layoutOf(device, FS, 'tu');
    const zLetter = MS > 1 ? 'm' : 'd';
    const waterLayout = layoutOf(device, VS | FS, 't' + zLetter + 'fstttf-----');
    // The air pass reads the scene's depth and nothing else from the second group.
    // Binding 13 is the cloud buffer. The air pass folds it in so water stays at 16 sampled textures.
    const airLayout = layoutOf(device, FS, zLetter + '-----------f', 1);
    // Volume clouds: scene depth, then the noise volume, its sampler, and the weather map.
    const cloudLayout = layoutOf(device, FS, zLetter + '------vsf', 1);
    const geoPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout] });
    const skyPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout] });
    // Grass stands on the ground it casts its shadow from, so that one shadow pipeline reads
    // the height map as well. The rest of the first group holds the shadow maps themselves.
    const groundLayout = layoutOf(device, VS, 'ut');
    const groundPL = device.createPipelineLayout({ bindGroupLayouts: [groundLayout] });
    // The sky's passes each read what the one before made: noise, then weather, then cloud
    // shadow, then the panorama, then the panorama gathered small.
    const skyLayouts = ['vs', 'vsf', 'vsff', '-s--a'].map((w) => layoutOf(device, FS, w, 8));
    const skyPLs = skyLayouts.map((l) => device.createPipelineLayout({ bindGroupLayouts: [ubLayout, l] }));
    // Depth plus the noise and weather the cloud march reads. Binding numbers match the shader.
    const boltLayout = layoutOf(device, FS, '-' + zLetter + '------vsf');
    const boltPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout, boltLayout] });
    const waterPL = device.createPipelineLayout({ bindGroupLayouts: [geoLayout, waterLayout] });
    const cloudPL = device.createPipelineLayout({ bindGroupLayouts: [ubLayout, cloudLayout] });

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
    const add = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
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
    // What is drawn into the scene or its mirror, which is whatever keeps their depth
    // format, is drawn with their samples.
    const jobs = [], lateJobs = [];
    let late = false;
    const whenBuilt = (name, set, promise) => (late ? lateJobs : jobs).push(promise.then((p) => { set[name] = p; }));
    const pipe = (name, layout, vs, fs, o) => {
      const m = o.module || mod;
      whenBuilt(name, pipes, device.createRenderPipelineAsync({
        layout: layout,
        vertex: { module: m, entryPoint: vs, buffers: o.buffers },
        // depthOnly: a shadow map with a fragment stage (crown gaps) and no colour target.
        fragment: fs ? { module: m, entryPoint: fs, targets: o.depthOnly ? [] : [{ format: o.format || sceneFmt, blend: o.blend }] } : undefined,
        primitive: { topology: 'triangle-list', cullMode: o.cull || 'none' },
        depthStencil: o.depth,
        multisample: { count: fs && o.depth && o.depth.format === 'depth32float' ? MS : 1 }
      }));
    };
    // The sea first: its shader is the longest to compile, so it is given the longest start.
    pipe('water', waterPL, 'vsWater', 'fsWater', { buffers: gridBuf, format: format, blend: over, depth: noZ });
    pipe('sky', geoPL, 'vsSky', 'fsSky', { depth: depthOn('depth32float', true, 'always') });
    pipe('weather', skyPLs[0], 'vsSky', 'fsWeather', {});
    pipe('cloudShadow', skyPLs[1], 'vsSky', 'fsCloudShadow', {});
    pipe('skyBake', skyPLs[2], 'vsSky', 'fsSkyBake', {});
    pipe('skyDim', skyPLs[3], 'vsSky', 'fsSkyDim', { blend: { color: lerp, alpha: lerp } });
    pipe('skyIrr', skyPLs[3], 'vsSky', 'fsSkyIrr', {});
    pipe('bolt', boltPL, 'vsSky', 'fsBoltVol', { blend: add });
    pipe('cloud', cloudPL, 'vsSky', 'fsCloudVol', {});
    pipe('terrain', geoPL, 'vsTerrain', 'fsTerrain', { buffers: posBuf, cull: 'back', depth: sceneZ });
    pipe('mesh', geoPL, 'vsMesh', 'fsMesh', { buffers: meshBuffers, depth: sceneZ });
    pipe('shadowTerrain', skyPL, 'vsShadowTerrain', null, { buffers: posBuf, cull: 'back', depth: shadowZ });
    pipe('shadowMesh', skyPL, 'vsShadowMesh', 'fsShadowMesh', { buffers: meshBuffers, depth: shadowZ, depthOnly: true });
    // Grass/flower casters must be ready with the first shadow bake — late compile left meadows
    // unshadowed until a sun-move rebuild, and island maps never drew grass at all.
    // groundPL (uniforms + htex), not skyPL or geoPL: vsShadowGrass needs sampleField, and geoPL
    // samples the shadow maps these passes are writing into.
    const shadowZGrass = { ...shadowZ, depthBias: 0, depthBiasSlopeScale: 0.55, depthBiasClamp: 0.001 };
    pipe('shadowGrass', groundPL, 'vsShadowGrass', null, { buffers: [vbuf(24, [[0, 0, 3], [1, 16, 2]]), oneVec4], depth: shadowZGrass });
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
    pipe('bird', geoPL, 'vsBird', 'fsBird', { buffers: meshBuffers, depth: sceneZ });
    pipe('fish', geoPL, 'vsFish', 'fsFish', { buffers: meshBuffers, depth: sceneZ });
    pipe('shadowFish', skyPL, 'vsShadowFish', null, { buffers: meshBuffers, depth: shadowZ });
    // Insects go straight onto the finished frame, after the water, so a clear wing over the
    // lagoon is a film over the lagoon and not a hole in it.
    pipe('bug', airPL, 'vsBug', 'fsBug', { buffers: bugBuffers, format: format, blend: over, depth: depthOn('depth24plus', true, 'less') });
    pipe('shadowBug', skyPL, 'vsShadowBug', null, { buffers: bugBuffers, depth: shadowZ });
    pipe('drops', airPL, 'vsDrops', 'fsDrops', { format: format, blend: over, depth: overZ });
    pipe('sim', simPL, 'vs', 'fs', { module: simMod });
    // A capture waits for everything, so it is always the whole picture.
    // ?read&rf=N grabs one frame. ?read&seq=K&rf=N grabs K frames every stride (default 4)
    // into window.__pngs for beach showcase video without reloading.
    const READ = qstr.has('read'), READ_AT = parseInt(qstr.get('rf'), 10) || 16;
    const READ_SEQ = Math.max(0, parseInt(qstr.get('seq'), 10) || 0);
    const READ_STRIDE = Math.max(1, parseInt(qstr.get('stride'), 10) || 4);
    if (READ_SEQ) window.__pngs = [];
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
    let shoreObstacles = []; // filled while planting coastal rocks; SWE bed stamps
    const pick = (ids, x, z) => ids[Math.abs(Math.floor(x * 7.3 + z * 3.1)) % ids.length];
    const protoSet = (seeds, make, radius) => seeds.map((sd) => scatter.proto([make(sd)], radius));
    const rockIds = [4, 11, 17, 23, 29, 37, 41, 52, 59, 68, 77, 88].map((sd) => scatter.proto([makeRock(sd, 0), makeRock(sd, 1)], 1.3, [70]));
    // Close palms keep every leaflet; coarser crowns carry the silhouette far past the beach.
    // Softer LOD handoffs — abrupt mid/far crown swaps read as tree-top flicker.
    const palmIds = [3, 8, 21, 34, 47, 55].map((sd) => scatter.proto([makePalm(sd, 0), makePalm(sd, 1), makePalm(sd, 2)], 10.5, [95, 240], [70, 210]));
    // A palm leans the way the ground falls, toward the open light over the water.
    const leanYaw = (x, z) => {
      const gx = fieldSample(world, x + 3, z) - fieldSample(world, x - 3, z), gz = fieldSample(world, x, z + 3) - fieldSample(world, x, z - 3);
      return Math.atan2(-gz, -gx) + (rnd() - 0.5) * 1.4;
    };
    const shrubIds = protoSet([5, 9, 14, 22, 27], makeShrub, 1.2);
    const canopyIds = [6, 13, 18, 25].map((sd) => scatter.proto([makeCanopy(sd, 0), makeCanopy(sd, 1)], 2.4, [55]));
    const fernIds = protoSet([7, 12, 19, 24, 30, 33], makeFern, 1.6);
    const broadIds = [2, 15, 28, 36, 41].map((sd) => scatter.proto([makeBroad(sd, 0), makeBroad(sd, 1)], 2.8, [58]));
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
    // Instance Y so a woody foot of radius footR stays under the ground on a slope.
    // footBelow: how far the mesh already dips below its origin after scale (palms ~0.2·sc·sy).
    const stemY = (x, z, h, footR, footBelow) => {
      const s = fieldSlope(world, x, z);
      const r = Math.max(0.05, footR);
      const need = Math.max(0.1, r * 0.5 + s * r * 1.35);
      return h - need + (footBelow || 0);
    };
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
      const psy = 0.88 + rnd() * 0.28;
      scatter.add(pick(palmIds, x, z), x, stemY(x, z, h, 0.28 * psc, 0.2 * psc * psy), z, leanYaw(x, z), psc, tint, psy, 1.1 + rnd() * 0.35, plantBias());
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
        const psy = 0.85 + rnd() * 0.35;
        scatter.add(pick(palmIds, x, z), x, stemY(x, z, h, 0.28 * psc, 0.2 * psc * psy), z, leanYaw(x, z), psc, tint, psy, 1.05 + rnd() * 0.4, plantBias());
        walkHits.push(x, z, 0.22 * psc);
        palmSites.push(x, z, h);
        palms++;
      } else if (shrubs < shrubBudget && h > 0.3 && h < 2.8 && s < 0.4 && clump > 0.3 && (h < 1.6 || clump2 > 0.4)) {
        // Beach interior shrubs in irregular clusters.
        const ssc = 1.5 + rnd() * 1.9, ssy = 0.65 + rnd() * 0.6;
        scatter.add(pick(shrubIds, x, z), x, stemY(x, z, h, 0.1 * ssc * ssy), z, rnd() * 6.28, ssc, tint, ssy, plantSoft(), plantBias());
        shrubs++;
      } else if (ferns < fernBudget && h > 1.1 && h < 14 && s < 0.4 && (moist > 0.45 || fm > 0.35) && clump > 0.4) {
        // Ferns favour humid lowlands and shaded forest floor.
        const fsc = 1.15 + rnd() * 1.15, fsy = 0.55 + rnd() * 0.5;
        scatter.add(pick(fernIds, x, z), x, stemY(x, z, h, 0.06 * fsc * fsy), z, rnd() * 6.28, fsc, tint, fsy, 0.75 + rnd() * 0.4, plantBias());
        ferns++;
      } else if (canopies < canopyBudget && h > 6 && h < 26 && s < 0.32 && fm > 0.2 && clump > 0.45) {
        const csc = 4.6 + rnd() * 3.2, csy = 0.85 + rnd() * 0.35;
        scatter.add(pick(canopyIds, x, z), x, stemY(x, z, h, 0.1 * csc * csy), z, rnd() * 6.28, csc, tint, csy, plantSoft(), plantBias());
        canopies++;
      } else if (broads < q.broad && h > 2.4 && h < 18 && s < 0.4 && (fm > 0.15 || moist > 0.4) && clump > 0.38) {
        const bsc = 4.8 + rnd() * 3.4, bsy = 0.8 + rnd() * 0.4;
        scatter.add(pick(broadIds, x, z), x, stemY(x, z, h, 0.09 * bsc * bsy), z, rnd() * 6.28, bsc, tint, bsy, plantSoft(), plantBias());
        broads++;
      }
    }
    // Flowering shrubs, in the open where the sun reaches: behind the beach, by the lagoon,
    // and along the edge of the forest. Every blossom is somewhere a bee or a butterfly can go.
    const blooms = [], perch = [];
    // Bounding radius ≥2 so flower shrubs always pass shadow collect (r = radius × scale).
    const flowerIds = [0, 1, 2, 3, 4, 5].map((sd) => { const f = makeFlowerShrub(sd + 1, 0); return { id: scatter.proto([f.mesh, makeFlowerShrub(sd + 1, 1).mesh], 2.4, [55]), blooms: f.blooms }; });
    const plantFlower = (x, z) => {
      const h = fieldSample(world, x, z);
      if (h < 0.7 || h > 9 || fieldSlope(world, x, z) > 0.35) return false;
      const f = flowerIds[(rnd() * flowerIds.length) | 0], rot = rnd() * 6.28, sc = 0.9 + rnd() * 0.5, c = Math.cos(rot), s = Math.sin(rot), B = f.blooms;
      const fy = stemY(x, z, h, 0.08 * sc, 0);
      scatter.add(f.id, x, fy, z, rot, sc, [0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2], 1, 0.85 + rnd() * 0.4, rnd());
      for (let i = 0; i < B.length; i += 6) {
        blooms.push(x + (B[i] * c - B[i + 2] * s) * sc, fy + B[i + 1] * sc, z + (B[i] * s + B[i + 2] * c) * sc, B[i + 3] * c - B[i + 4] * s, B[i + 3] * s + B[i + 4] * c);
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
    const treeIds = [31, 48, 65, 82, 99, 116, 133, 150, 167, 184, 201, 218].map((sd) => scatter.proto([makeTree(sd, 0), makeTree(sd, 1), makeTree(sd, 2)], 7.5, [48, 130], [28, 95]));
    let trees = 0;
    const treeSites = [];
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
      // Habitat picks the architecture, not the density. Coastal trees are slender or
      // sparse, ridges take the open crowns, wet flats the round and multi-stem, deep
      // cover the emergents. Ground cover is a separate pass.
      const seeds = [31, 48, 65, 82, 99, 116, 133, 150, 167, 184, 201, 218];
      const coast = h < 4.5 && inland < 0.35;
      const ridge = !coast && s > 0.22 && h > 3.2;
      const wet = !coast && !ridge && moistAt(x, z, h) > 0.62 && s < 0.16;
      const forms = coast ? [5, 4] : ridge ? [4, 1, 5] : wet ? [2, 3] : (fm > 0.65 && inland > 0.45) ? [1, 2, 3] : null;
      let pickIds = treeIds;
      if (forms) {
        const sub = treeIds.filter((_, k) => forms.indexOf(seeds[k] % 6) >= 0);
        if (sub.length) pickIds = sub;
      }
      // Each habit gives to the wind in its own way: the emergent stands stiff, the slender
      // and the sparse bend, and of one habit the taller tree moves further.
      const pid = pickIds[(rnd() * pickIds.length) | 0];
      const flex = [0.75, 0.5, 0.6, 0.8, 0.9, 1][seeds[treeIds.indexOf(pid)] % 6] * (0.5 + 0.5 * tall / 19);
      // Buttress flare ≈ 0.05·tall; old 0.15 m bury left the downhill rim floating on slopes.
      scatter.add(pid, x, stemY(x, z, h, 0.055 * tall * sy), z, rnd() * 6.28, tall, tint, sy, flex * (0.85 + rnd() * 0.3), rnd());
      walkHits.push(x, z, 0.03 * tall);
      treeSites.push(x, z, h, tall);
      trees++;
    }
    const rockSites = [];
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
      // A boulder lower than the knee is stepped over; damp foreshore stones stay passable.
      if (sc > 0.75 && h > 0.45) walkHits.push(x, z, 0.6 * sc);
      rockSites.push(x, z, h, sc);
      rocks++;
    }
    // Coastal rocks: denser headland pockets, size/tint variety; stamped into SWE bed for wrap.
    const shoreBudget = Math.min(110, 36 + ((q.rocks * 0.85) | 0));
    let shoreRocks = 0;
    // shoreObstacles hoisted above; refill for this plant.
    shoreObstacles.length = 0;
    const seaYaw = shore
      ? Math.atan2(shore.fx, -shore.fz)
      : downhillYaw(world, beach.x, beach.z);
    const seaX = Math.sin(seaYaw), seaZ = -Math.cos(seaYaw);
    // Dominant swell propagates onshore (toward the island), opposite the seaward beach normal.
    // Phase is k·dir·x − ωt, so dir must point inland for crests to run onto the sand.
    const onshoreAng = Math.atan2(-seaZ, -seaX);
    wp.dir = onshoreAng;
    WATER.dir = onshoreAng;
    const alongX = -seaZ, alongZ = seaX;
    const originX = shore ? shore.x : beach.x, originZ = shore ? shore.z : beach.z;
    for (let i = 0; i < shoreBudget * 90 && shoreRocks < shoreBudget; i++) {
      const along = (rnd() - 0.5) * 260;
      if (Math.abs(along) < 6) continue;
      const rocky = vnoise(along * 0.028, 2.7) * 0.55 + vnoise(along * 0.09, 5.1) * 0.45;
      if (rocky < 0.38) continue;
      const out = -4 + rnd() * 26;
      const x = originX + alongX * along + seaX * out, z = originZ + alongZ * along + seaZ * out;
      const h = fieldSample(world, x, z);
      const sl = fieldSlope(world, x, z);
      if (h < -1.1 || h > 1.55 || sl > 0.62) continue;
      const dense = rocky > 0.62;
      const n = dense ? 2 + ((rnd() * 5.5) | 0) : 1 + ((rnd() * 3.2) | 0);
      const yaw0 = rnd() * 6.28;
      for (let k = 0; k < n && shoreRocks < shoreBudget; k++) {
        const ox = k ? Math.cos(yaw0 + k * 1.55) * (0.3 + rnd() * (dense ? 2.6 : 1.7)) : 0;
        const oz = k ? Math.sin(yaw0 + k * 1.55) * (0.3 + rnd() * (dense ? 2.6 : 1.7)) : 0;
        const xx = x + ox, zz = z + oz;
        const hh = fieldSample(world, xx, zz);
        if (hh < -1.2 || hh > 1.65) continue;
        let sc;
        const roll = rnd();
        if (k === 0 && roll > 0.82) sc = 1.2 + rnd() * 1.8;
        else if (roll < 0.35) sc = 0.18 + rnd() * 0.45;
        else sc = 0.4 + rnd() * 1.15;
        const bury = sc * (0.28 + rnd() * 0.38);
        const sy = 0.35 + rnd() * 0.7;
        const tint = [0.62 + rnd() * 0.28, 0.58 + rnd() * 0.24, 0.5 + rnd() * 0.22];
        if (rnd() < 0.22) { tint[0] *= 0.85; tint[2] *= 1.1; }
        else if (rnd() < 0.2) { tint[0] *= 1.12; tint[1] *= 1.05; }
        scatter.add(pick(rockIds, xx, zz), xx, hh - bury, zz, rnd() * 6, sc, tint, sy);
        // Visuals + SWE bed stamps stay for every shore stone. Walk collision only for
        // clearly dry-beach boulders — wet / intertidal rocks must not wall off the water.
        if (sc > 0.55 && hh > 0.55) walkHits.push(xx, zz, 0.5 * sc);
        const peak = hh - bury + sc * sy * 0.55;
        const rad = sc * (0.55 + 0.25 * sy);
        if (hh < 1.2 && rad > 0.25) shoreObstacles.push(xx, zz, peak, rad);
        shoreRocks++;
      }
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
    // Tropical overgrowth — own seeded streams so earlier island layout stays fixed.
    // Layered reclaim: moss pillows, root snarls, climbing + hanging vines on rocks/trees/skiff.
    {
      const og = seeded(772351);
      const climbIds = [3, 8, 14, 21, 29].map((sd) => scatter.proto([makeClimbingVine(sd)], 2.2, [55]));
      const hangIds = [4, 11, 18, 26].map((sd) => scatter.proto([makeHangingVine(sd)], 2.4, [60]));
      const mossIds = protoSet([2, 6, 10, 15, 20, 25], makeMossClump, 0.85);
      const rootIds = protoSet([5, 9, 16, 22], makeRootSnarl, 1.1);
      let vines = 0, mossN = 0, roots = 0;
      const vineBudget = q.vines | 0;
      const mossBudget = q.moss | 0;
      const rootBudget = Math.max(14, (q.moss * 0.28) | 0);
      // Climbing vines reclaim inland rock faces (structure overgrowth).
      // Never on dry shoreline sand — keep climbers inland of beachEdge / foreshore.
      for (let i = 0; i < rockSites.length && vines < vineBudget * 0.35; i += 4) {
        if (og() > 0.38) continue;
        const rx = rockSites[i], rz = rockSites[i + 1], rh = rockSites[i + 2], rsc = rockSites[i + 3];
        if (rh < 1.25) continue;
        const eco = ecoPrefs(rx, rz, rh, fieldSlope(world, rx, rz));
        if (eco.beachEdge > 0.45) continue;
        if (eco.cluster < 0.2 && eco.moist < 0.25) continue;
        if (Math.hypot(rx - beach.x, rz - beach.z) < 16) continue;
        const a = og() * 6.28, off = rsc * (0.2 + og() * 0.4);
        const x = rx + Math.cos(a) * off, z = rz + Math.sin(a) * off;
        const h = fieldSample(world, x, z);
        if (h < 1.2) continue;
        const tint = og() < 0.2
          ? [0.75 + og() * 0.2, 0.55 + og() * 0.15, 0.35 + og() * 0.1]
          : [0.82 + og() * 0.25, 0.9 + og() * 0.18, 0.78 + og() * 0.2];
        scatter.add(pick(climbIds, x, z), x, h, z, a, (1.1 + og() * 1.1) * (0.65 + rsc * 0.55), tint, 0.9 + og() * 0.35, 0.85 + og() * 0.4, og());
        vines++;
        if (vines < vineBudget && og() < 0.55) {
          const a2 = a + 1.2 + og();
          scatter.add(pick(climbIds, x, z), rx + Math.cos(a2) * off * 0.7, h, rz + Math.sin(a2) * off * 0.7,
            a2, 0.85 + og() * 0.7, tint, 0.85, 0.8, og());
          vines++;
        }
      }
      // Climbing vines wrapping tree trunks + hanging cascades readable from the floor.
      for (let i = 0; i < treeSites.length && vines < vineBudget; i += 4) {
        const tx = treeSites[i], tz = treeSites[i + 1], th = treeSites[i + 2], tall = treeSites[i + 3];
        const eco = ecoPrefs(tx, tz, th, fieldSlope(world, tx, tz));
        if (eco.shade < 0.22 && eco.jungle < 0.28) continue;
        const tint = og() < 0.16
          ? [0.7 + og() * 0.2, 0.5 + og() * 0.15, 0.3]
          : [0.85 + og() * 0.2, 0.92 + og() * 0.15, 0.8 + og() * 0.18];
        // Trunk climbers — nature reclaiming the bole.
        if (vines < vineBudget && og() < 0.72 + eco.jungle * 0.25) {
          const a = og() * 6.28, r = 0.08 + og() * 0.22;
          scatter.add(pick(climbIds, tx, tz), tx + Math.cos(a) * r, th, tz + Math.sin(a) * r,
            a, 1.4 + og() * 1.6 + tall * 0.04, tint, 1.05 + og() * 0.4, 0.95 + og() * 0.4, og());
          vines++;
        }
        // Low hanging strands — readable at walking eye height under the canopy.
        if (vines < vineBudget && eco.jungle > 0.28 && og() < 0.75) {
          const a = og() * 6.28, r = 0.25 + og() * 1.3;
          const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
          const anchor = th + 1.35 + og() * 1.8;
          scatter.add(pick(hangIds, x, z), x, anchor, z, a, 1.35 + og() * 1.15, tint, 1, 1.2 + og() * 0.45, og());
          vines++;
        }
        if (vines < vineBudget && eco.jungle > 0.45 && og() < 0.55) {
          const a2 = og() * 6.28, r2 = 0.2 + og() * 1.0;
          scatter.add(pick(hangIds, tx, tz), tx + Math.cos(a2) * r2, th + 1.1 + og() * 1.5, tz + Math.sin(a2) * r2,
            a2, 1.15 + og() * 1.0, tint, 1, 1.1 + og() * 0.4, og());
          vines++;
        }
      }
      // Jungle bank vine fringe: climbing vines on moist inland banks only.
      // Dry shoreline sand stays clear — upward-growing vines live underwater (plantReef).
      for (let i = 0; i < vineBudget * 22 && vines < vineBudget; i++) {
        const x = (og() - 0.5) * 420, z = (og() - 0.5) * 360;
        const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
        if (h < 1.55 || h > 7 || sl > 0.5) continue;
        const eco = ecoPrefs(x, z, h, sl);
        if (eco.beachEdge > 0.35) continue;
        const dens = eco.jungle * 0.55 + eco.moist * 0.4 + eco.shade * 0.3;
        if (dens < 0.32 || og() > dens * 1.05) continue;
        if (Math.hypot(x - beach.x, z - beach.z) < 22) continue;
        const tint = [0.8 + og() * 0.28, 0.88 + og() * 0.2, 0.75 + og() * 0.22];
        scatter.add(pick(climbIds, x, z), x, h, z, og() * 6.28, 1.15 + og() * 1.2, tint, 0.9 + og() * 0.4, 0.95 + og() * 0.35, og());
        vines++;
      }
      // Moss / low cover: shade + moisture pockets; bare clearings stay clear.
      for (let i = 0; i < mossBudget * 26 && mossN < mossBudget; i++) {
        const x = (og() - 0.5) * 440, z = (og() - 0.5) * 380;
        const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
        if (h < 0.35 || h > 18 || sl > 0.55) continue;
        const eco = ecoPrefs(x, z, h, sl);
        if (eco.shade > 0.55 && eco.cluster < 0.2) continue;
        const dens = eco.moist * 0.55 + eco.shade * 0.45 + eco.jungle * 0.4 + eco.nearWater * 0.15;
        if (dens < 0.22 || og() > dens * dens * 0.7 + dens * 0.3) continue;
        const dead = og() < 0.14;
        const tint = dead
          ? [0.75 + og() * 0.2, 0.6 + og() * 0.15, 0.38 + og() * 0.1]
          : [0.95 + og() * 0.25, 1.15 + og() * 0.2, 0.85 + og() * 0.2];
        const sc = 1.6 + og() * 2.2 + eco.moist * 0.7;
        scatter.add(pick(mossIds, x, z), x, h + 0.005, z, og() * 6.28, sc, tint, 0.5 + og() * 0.4, 0.35 + og() * 0.3, og());
        mossN++;
        if (mossN < mossBudget && og() < 0.55 + dens * 0.35) {
          const a = og() * 6.28, d = 0.18 + og() * (0.55 + dens);
          const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
          const h2 = fieldSample(world, x2, z2);
          if (h2 > 0.3 && h2 < 18 && fieldSlope(world, x2, z2) < 0.55) {
            scatter.add(pick(mossIds, x2, z2), x2, h2 + 0.005, z2, og() * 6.28, sc * (0.45 + og() * 0.55), tint, 0.5, 0.3, og());
            mossN++;
          }
        }
      }
      // Moss on rock crowns — structure reclaim.
      for (let i = 0; i < rockSites.length && mossN < mossBudget; i += 4) {
        if (og() > 0.35) continue;
        const rx = rockSites[i], rz = rockSites[i + 1], rh = rockSites[i + 2], rsc = rockSites[i + 3];
        const eco = ecoPrefs(rx, rz, rh, fieldSlope(world, rx, rz));
        if (eco.moist < 0.15 && eco.cluster < 0.28) continue;
        scatter.add(pick(mossIds, rx, rz), rx, rh + rsc * 0.18, rz, og() * 6.28, 0.85 + rsc * 0.75,
          [0.7 + og() * 0.25, 0.9 + og() * 0.18, 0.65 + og() * 0.2], 0.45, 0.25, og());
        mossN++;
      }
      // Surface roots under dense canopy.
      for (let i = 0; i < rootBudget * 24 && roots < rootBudget; i++) {
        const x = (og() - 0.5) * 400, z = (og() - 0.5) * 360;
        const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
        if (h < 1.4 || h > 16 || sl > 0.45) continue;
        const eco = ecoPrefs(x, z, h, sl);
        if (eco.shade < 0.32 || eco.jungle < 0.32 || og() > eco.jungle * 1.1) continue;
        scatter.add(pick(rootIds, x, z), x, h + 0.01, z, og() * 6.28, 1.15 + og() * 1.3,
          [0.85 + og() * 0.2, 0.75 + og() * 0.15, 0.6 + og() * 0.15], 1, 0.15, og());
        roots++;
      }
      // Extra moist ferns in jungle hollows (dead tint mix).
      const fernExtra = Math.max(18, (q.broad * 0.65) | 0);
      let fe = 0;
      for (let i = 0; i < fernExtra * 32 && fe < fernExtra; i++) {
        const x = (og() - 0.5) * 430, z = (og() - 0.5) * 370;
        const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
        if (h < 1.0 || h > 14 || sl > 0.42) continue;
        const eco = ecoPrefs(x, z, h, sl);
        const dens = eco.moist * 0.55 + eco.shade * 0.5 + eco.jungle * 0.45;
        if (dens < 0.38 || og() > dens) continue;
        const dead = og() < 0.16;
        const tint = dead
          ? [0.55 + og() * 0.2, 0.4 + og() * 0.15, 0.22 + og() * 0.1]
          : [0.8 + og() * 0.28, 0.88 + og() * 0.2, 0.75 + og() * 0.22];
        const fsc = 1.15 + og() * 1.35, fsy = 0.55 + og() * 0.5;
        scatter.add(pick(fernIds, x, z), x, stemY(x, z, h, 0.06 * fsc * fsy), z, og() * 6.28, fsc, tint, fsy, 0.75 + og() * 0.4, og());
        fe++;
      }
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
    let deepSea = null;
    function ensureDeepSea() {
      if (deepSea) return deepSea;
      if (!globalThis.__wwDeepSeaReady) {
        const el = document.getElementById('ww-deferred-deep-sea');
        if (el) (0, eval)(el.textContent);
      }
      if (typeof DeepSeaLife === 'function') deepSea = new DeepSeaLife(world, reef, q);
      return deepSea;
    }
    ensureDeepSea();
    const fishLife = new FishLife(world, reef, q, stackList);
    window.__fishLife = fishLife;
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

    // Grass density is a continuous field: patch noise eases from bare sand into meadow,
    // and blade scale follows that same weight so the edge is short and sparse, not a wall.
    const grassList = [];
    const weedList = [];
    const grassDens = (x, z, h, sl) => {
      // Domain-warped patches — no circular noise rings or even sow density.
      const w = warpXZ(x, z, 9, 0.02);
      const patch = vnoise(w[0] * 0.022, w[1] * 0.022) * 0.5 + vnoise(w[0] * 0.055 + 3, w[1] * 0.055) * 0.35 + vnoise(w[0] * 0.13 + 7, w[1] * 0.13) * 0.15;
      const fine = vnoise(w[0] * 0.09 + 4, w[1] * 0.09);
      const fromBeach = Math.hypot(x - beach.x, z - beach.z);
      const under = forestMask(x, z, h, sl);
      const eco = ecoPrefs(x, z, h, sl);
      let d = 0;
      if (h > 0.2 && h < 1.35 && sl < 0.28 && fromBeach > 10 && fromBeach < 90) {
        // Dune fringe: soft rise from open sand into beach→jungle transition.
        d = Math.max(d, smooth01(0.22, 0.55, patch) * smooth01(0.28, 0.18, sl) * (0.55 + 0.45 * fine) * (0.7 + 0.3 * eco.beachEdge));
      }
      if (h > 1.05 && h < 28 && sl < 0.55) {
        let meadow = smooth01(0.18, 0.52, patch) * smooth01(0.55, 0.32, sl);
        meadow *= 1 - under * 0.72;
        // Jungle floor: grass thins under canopy; moss/ferns own the shade.
        meadow *= 1 - eco.jungle * 0.35 * under;
        if (under > 0.55) meadow *= smooth01(0.25, 0.7, fine);
        // Real clearings: low cluster under trees stays sparse (not a ring).
        if (under > 0.5 && eco.cluster < 0.28) meadow *= 0.15 + eco.cluster;
        d = Math.max(d, meadow);
      }
      return Math.min(1, d);
    };
    for (let i = 0; i < q.grass * 14 && grassList.length / 4 < q.grass; i++) {
      const x = (rnd() - 0.5) * 460, z = (rnd() - 0.5) * 400;
      const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
      const dens = grassDens(x, z, h, sl);
      if (dens < 0.04) continue;
      // Rejection sampling by density — edges stay thin without a hard threshold.
      if (rnd() > dens * dens * 0.92 + dens * 0.08) continue;
      const fine = vnoise(x * 0.09 + 4, z * 0.09);
      const under = forestMask(x, z, h, sl);
      let sc = h < 1.4
        ? 0.12 + dens * (0.22 + fine * 0.12)
        : under > 0.4
          ? 0.18 + dens * (0.28 + rnd() * 0.2)
          : 0.28 + dens * (0.55 + rnd() * 0.5 + fine * 0.2);
      sc *= 0.75 + rnd() * 0.5;
      grassList.push(x, z, rnd() * 6.28, sc);
    }
    for (let i = 0; i < q.weed * 18 && weedList.length / 4 < q.weed; i++) {
      // Shelf kelp strips + denser lagoon/reef weed beds — always submerged, never dry beach.
      const roll = rnd();
      const shelf = roll < 0.42;
      const lagoon = !shelf && roll < 0.82;
      const x = shelf ? -180 + rnd() * 200 : lagoon ? 30 + rnd() * 190 : 140 + rnd() * 140;
      const z = shelf ? -20 + rnd() * 220 : lagoon ? (rnd() - 0.5) * 200 : (rnd() - 0.5) * 180;
      const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
      const patch = vnoise(x * 0.028, z * 0.028) * 0.55 + vnoise(x * 0.07 + 2.1, z * 0.07) * 0.45;
      // Stay underwater: skip dry foreshore / intertidal sand.
      if (h >= -0.55 || h <= -8.5 || sl > 0.55) continue;
      if (shelf && h > -1.2) continue;
      if (lagoon && (h < -3.2 || h > -0.65)) continue;
      const dens = smooth01(0.12, 0.48, patch) * (shelf ? 1.2 : lagoon ? 1.35 : 1.05);
      if (rnd() > dens) continue;
      const tall = shelf && h < -1.8
        ? 1.25 + rnd() * 0.85
        : lagoon
          ? 0.55 + dens * (0.85 + rnd() * 0.55)
          : 0.45 + dens * (0.75 + rnd() * 0.5);
      weedList.push(x, z, rnd() * 6.28, -tall);
      // Clump fill: denser reef/lagoon beds read as meadows, not singles.
      if (lagoon && rnd() < 0.55 && weedList.length / 4 < q.weed) {
        const a = rnd() * 6.28, d = 0.25 + rnd() * 0.85;
        const x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
        const h2 = fieldSample(world, x2, z2);
        if (h2 < -0.6 && h2 > -3.0 && fieldSlope(world, x2, z2) < 0.45) {
          weedList.push(x2, z2, rnd() * 6.28, -(tall * (0.55 + rnd() * 0.45)));
        }
      }
    }
    // Fill: each tuft gets two smaller neighbours sized from the same density field.
    {
      const gr = seeded(40507), sown = grassList.length;
      for (let i = 0; i < sown; i += 4) {
        const dens = grassDens(grassList[i], grassList[i + 1], fieldSample(world, grassList[i], grassList[i + 1]), fieldSlope(world, grassList[i], grassList[i + 1]));
        grassList[i + 3] *= 0.55 + dens * 0.35 + gr() * 0.25;
        for (let k = 0; k < 2; k++) {
          const a = gr() * 6.28, d = 0.15 + gr() * (0.6 + dens * 1.1), u = gr();
          const x = grassList[i] + Math.cos(a) * d, z = grassList[i + 1] + Math.sin(a) * d;
          const h = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
          const d2 = grassDens(x, z, h, sl);
          if (d2 < 0.05 || h < 0.2 || h > 28 || sl > 0.55) continue;
          if (gr() > d2) continue;
          grassList.push(x, z, gr() * 6.28, grassList[i + 3] * (0.25 + 0.7 * u * u) * (0.5 + 0.5 * d2));
        }
      }
    }
    const grassInst = new Float32Array(grassList.length + weedList.length);
    grassInst.set(grassList, 0);
    grassInst.set(weedList, grassList.length);
    let grassCount = grassInst.length / 4;

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
    const uf = new Float32Array(268);
    const ur = new Float32Array(268);
    const un = new Float32Array(268);
    for (let i = 0; i < 8; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      uf[88 + i * 4] = w[0] / L; uf[89 + i * 4] = w[1] / L; uf[90 + i * 4] = w[2]; uf[91 + i * 4] = w[3];
      uf[120 + i] = w[4];
    }
    ur.set(uf);

    const ubuf = device.createBuffer({ size: 1072, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const rbuf = device.createBuffer({ size: 1072, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const nbuf = device.createBuffer({ size: 1072, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

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
    // Shore sheet covers surf + wash; denser than the ocean disk so hinge curl resolves.
    const shoreMesh = gridMesh(q.shore || 320, null);
    const packed = scatter.packed;
    const g = grassGeom();
    const grassVert = packInterleaved(g.pos, g.uv);
    const terrainVB = upload(terrain.pos, GPUBufferUsage.VERTEX);
    const terrainIB = upload(terrain.idx, GPUBufferUsage.INDEX);
    // ?stream=0 or ?no=stream keeps the single mesh and the full grass list.
    const streamOn = qstr.get('stream') !== '0' && !NO.stream;
    const stream = new WorldStream({ enabled: streamOn });
    window.__stream = stream;
    stream.sharedVB = terrainVB;
    stream.bindTerrain(q.terrain, q.textent, terrain.pos);
    stream.bindGrass(grassInst);
    scatter.stream = stream;
    const grassDraw = new Float32Array(grassInst.length);
    let grassKey = '';
    if (stream.enabled) {
      try {
        const bootPrep = stream.prepMs, bootUp = stream.uploads;
        stream.prepMs = 48;
        stream.uploads = 100;
        stream.tick(camX, camZ, camY, 0.016, Math.sin(yaw), -Math.cos(yaw), null, device);
        stream.prepMs = bootPrep;
        stream.uploads = bootUp;
      } catch (err) {
        stream.enabled = false;
        stream.fail = (err && err.message) || String(err);
        console.warn('stream boot', err);
      }
    }
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
    const grassInstB = upload(grassInst, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    const fishVB = upload(fishPack.vert, GPUBufferUsage.VERTEX);
    const fishIB = upload(fishPack.idx, GPUBufferUsage.INDEX);
    const bugLife = new BugLife(world, blooms, perch);
    const birdLife = new BirdLife(world, q, beach, treeSites, blooms);
    birdLife.bugLife = bugLife;
    const birdPack = packMeshes(birdMeshes());
    const birdVB = upload(birdPack.vert, GPUBufferUsage.VERTEX);
    const birdIB = upload(birdPack.idx, GPUBufferUsage.INDEX);
    const birdArr = new Float32Array(Math.max(1, birdLife.n) * ISTRIDE);
    const birdInstB = device.createBuffer({ size: birdArr.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    let birdDraws = [];
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
    const starTex = astroStarTexture(device);
    const starView = starTex.createView();
    const starSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    const noiseView = sky.noise.createView();
    let skyFor = null, skyPace = 1, cloudOwn = false, cloudOwnBake = false;
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
      cascades[0].view,
      shoreObstacles
    );
    mark('shore');
    await pipesReady;
    mark('pipelines');
    const shadowPass = passOf(undefined, null, shadowView);
    let sceneTex = null, sceneDepth = null, swapDepth = null, reflTex = null, reflDepth = null, airTex = null, cloudTex = null, bgAir = null, bgBolt = null, bgCloud = null;
    let sceneMS = null, reflMS = null;
    let readTex = null, readDepth = null, readBuf = null, readBpr = 0;
    let bgGeoSet = [null, null], bgGeoR, bgUB, bgUBR, bgWater;
    let viewW = 2, viewH = 2;
    const hview = htex.createView();
    const bgGround = groupOf(device, groundLayout, [ubuf, hview]), bgGroundN = groupOf(device, groundLayout, [nbuf, hview]);
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
    const boltPass = passOf(null);
    const cloudPass = passOf(null, [0, 0, 0, 1]);
    function destroyTex(t) { if (t) t.destroy(); }
    // The share of the preset's resolution being drawn. It follows the frame rate (frameBody).
    let dynScale = 1;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      let w = Math.max(2, Math.floor(innerWidth * dpr * q.scale));
      let h = Math.max(2, Math.floor(innerHeight * dpr * q.scale));
      if (w * h > q.maxPx) {
        const k = Math.sqrt(q.maxPx / (w * h));
        w = Math.max(2, (w * k) | 0); h = Math.max(2, (h * k) | 0);
      }
      w = Math.max(2, (w * dynScale) | 0); h = Math.max(2, (h * dynScale) | 0);
      canvas.width = w; canvas.height = h;
      context.configure({ device: device, format: format, alphaMode: 'opaque' });
      destroyTex(sceneTex); destroyTex(sceneDepth); destroyTex(swapDepth); destroyTex(reflTex); destroyTex(reflDepth); destroyTex(airTex); destroyTex(cloudTex);
      destroyTex(sceneMS); destroyTex(reflMS);
      sceneTex = targetOf(device, w, h, sceneFmt);
      // The depth keeps every sample, since the passes after the scene read it. The colour's
      // samples are averaged into sceneTex as the pass ends and are not kept.
      sceneDepth = targetOf(device, w, h, 'depth32float', null, MS);
      swapDepth = targetOf(device, w, h, 'depth24plus', 0);
      const rw = Math.max(2, w >> 1), rh = Math.max(2, h >> 1);
      reflTex = targetOf(device, rw, rh, sceneFmt);
      reflDepth = targetOf(device, rw, rh, 'depth32float', 0, MS);
      sceneMS = MS > 1 ? targetOf(device, w, h, sceneFmt, 0, MS) : null;
      reflMS = MS > 1 ? targetOf(device, rw, rh, sceneFmt, 0, MS) : null;
      airTex = targetOf(device, rw, rh, sceneFmt);
      cloudTex = targetOf(device, rw, rh, sceneFmt);
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
      const sv = sceneTex.createView(), sd = sceneDepth.createView(), rv = reflTex.createView(), av = airTex.createView(), cv = cloudTex.createView();
      // Views are made here, once per size, not once per frame.
      airPass.colorAttachments[0].view = av;
      boltPass.colorAttachments[0].view = sv;
      bgBolt = groupOf(device, boltLayout, [null, sd, null, null, null, null, null, null, sky.noise.createView(), sky.samp, sky.wx]);
      cloudPass.colorAttachments[0].view = cv;
      bgCloud = groupOf(device, cloudLayout, [sd, null, null, null, null, null, null, noiseView, sky.nSamp, sky.wx], 1);
      for (const [pass, view, ms] of [[scenePass, sv, sceneMS], [reflPass, rv, reflMS]]) {
        const c = pass.colorAttachments[0];
        c.view = ms ? ms.createView() : view;
        c.resolveTarget = ms ? view : undefined;
        c.storeOp = ms ? 'discard' : 'store';
      }
      scenePass.depthStencilAttachment.view = sd;
      reflPass.depthStencilAttachment.view = reflDepth.createView();
      swapDepthView = swapDepth.createView();
      bgAir = groupOf(device, airLayout, [sd, null, null, null, null, null, null, null, null, null, null, null, cv], 1);
      const geoGroup = (buf, rip) => groupOf(device, geoLayout,
        [buf, hview, rip, shadowView, shadowSamp, shoreSim.ubuf, shoreSim.stateView, shoreSim.wetView, sky.view, skySamp, nearView, sky.shade, starView, starSamp]);
      bgGeoSet = [geoGroup(ubuf, ripViews[0]), geoGroup(ubuf, ripViews[1])];
      bgGeoR = geoGroup(rbuf, ripViews[0]);
      bgUB = groupOf(device, ubLayout, [ubuf]);
      bgUBR = groupOf(device, ubLayout, [rbuf]);
      bgWater = groupOf(device, waterLayout, [sv, sd, rv, samp, cascades[0].view, cascades[1].view, cascades[2].view, av]);
    }
    resize();
    addEventListener('resize', resize);

    let terrainList = null;
    function drawTerrain(pass) {
      if (NO.terrain) return;
      // Null list is the full island mesh: a cell that is not on the GPU yet cannot hole the ground.
      if (!terrainList) {
        pass.setVertexBuffer(0, terrainVB);
        pass.setIndexBuffer(terrainIB, 'uint32');
        pass.drawIndexed(terrain.idx.length);
        frameDraws++;
        return;
      }
      let vb = null, ib = null;
      for (let i = 0; i < stream.patchN; i++) {
        const p = terrainList[i];
        if (p.vb !== vb) { pass.setVertexBuffer(0, p.vb); vb = p.vb; }
        if (p.ib !== ib) { pass.setIndexBuffer(p.ib, 'uint32'); ib = p.ib; }
        pass.drawIndexed(p.count);
        frameDraws++;
      }
    }
    function drawWorld(pass, ub, geo, birds, draws) {
      // The mirrored view holds the land and what grows on it and nothing else. The sky the
      // water reflects is worked out where it is used, for the tilt of each wave; a mirrored
      // picture of it, pushed about and blurred, laid pale columns over the swell.
      if (birds && !NO.sky) { pass.setPipeline(pipes.sky); pass.setBindGroup(0, geo); pass.draw(3); }
      pass.setPipeline(pipes.terrain); pass.setBindGroup(0, geo);
      drawTerrain(pass);
      if (!NO.mesh) drawMeshes(pass, pipes.mesh, geo, meshVB, meshIB, instB, draws);
      if (birds && birdDraws.length && pipes.bird) {
        drawMeshes(pass, pipes.bird, geo, birdVB, birdIB, birdInstB, birdDraws);
      }
      if (birds) drawMeshes(pass, pipes.fish, geo, fishVB, fishIB, fishInstB, fishDraws);
      if (birds && grassCount && pipes.grass && !NO.grass) {
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
    if (qstr.has('tod')) {
      let h = parseFloat(qstr.get('tod')) || ENV_H0;
      env.astroDay = h >= 24 ? 1 : 0;
      if (h >= 24) h -= 24;
      env.hour = h;
    } else if (!qstr.has('shot')) { env.hour = ENV_OPEN; env.run = false; }
    if (qstr.has('wx')) { envSet(qstr.get('wx'), true); env.auto = false; }
    if (qstr.get('moon') === 'art') env.realMoon = false;
    if (qstr.has('space')) {
      const raw = parseInt(qstr.get('space'), 10);
      const si = raw - 1;
      if (SPACES[si]) applySpace(si, { snap: qstr.has('shot') || qstr.has('read'), quiet: true });
    }
    let last = performance.now();
    // Resolution follows the frame rate, so a machine the preset is too much for gets a
    // softer picture and not a slide show. Captures and the benchmark are left alone, and
    // ?dyn=0 turns it off.
    const DYN = !READ && !qstr.has('shot') && qstr.get('dyn') !== '0';
    let dynHold = 6, dynT = 0, dynN = 0, dynPrev = 0, dynUndo = 1, dynLock = false, dynCeil = 1, dynUpAt = -1e9, dynGood = 0, dynLow = 0, dynTold = false;
    document.addEventListener('visibilitychange', () => { dynHold = 1; dynT = 0; dynN = 0; });
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
      // Keep dominant swell shoreward; soft trade veer only (never reverse crash direction).
      arr[128] = wp.amp * env.sea; arr[129] = wp.spd; arr[130] = wp.frq;
      arr[131] = lerpAng(wp.dir, env.ang, 0.1);
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
    // Bench is deferred (critical gzip). Eval before install; B/G/?bench still work.
    function ensureBench() {
      if (typeof WW_BENCH !== 'undefined') return true;
      const el = document.getElementById('ww-deferred-bench');
      if (!el) return false;
      (0, eval)(el.textContent);
      return typeof WW_BENCH !== 'undefined';
    }
    // Bench path: forest → palms → coast → beach/ocean → aerial → clouds → underwater (AG fly idea).
    if (ensureBench()) {
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
      const rawDt = (now - last) / 1000;
      last = now;
      if (DYN && rawDt < 4 && !(typeof WW_BENCH !== 'undefined' && WW_BENCH.active())) {
        if (dynHold > 0) dynHold -= rawDt;
        else if ((dynT += rawDt, ++dynN, dynT >= 1)) {
          const fps = dynN / dynT;
          dynT = 0; dynN = 0;
          if (dynPrev && fps < dynPrev * 1.05) {
            // Fewer pixels bought nothing: the frame is waiting on the processor, the
            // geometry or the display, not on the fill. They are put back and not taken again.
            dynScale = dynUndo; dynLock = true; dynPrev = 0; dynGood = 0; resize(); dynHold = 1;
          } else {
            dynPrev = 0;
            if (fps < 40 && dynScale > 0.5 && !dynLock) {
              dynPrev = fps; dynUndo = dynScale;
              dynScale = Math.max(0.5, dynScale * (fps < 24 ? 0.7 : 0.85));
              // A step up that had to be taken straight back is not tried again.
              if (now - dynUpAt < 6000) dynCeil = dynScale;
              dynGood = 0; resize(); dynHold = 1;
            } else if (fps > 55 && dynScale < dynCeil) {
              if (++dynGood >= 8) { dynScale = Math.min(dynCeil, dynScale / 0.85); dynUpAt = now; dynGood = 0; resize(); dynHold = 1; }
            } else dynGood = 0;
          }
          // Slow even so: the level of detail is too much for the machine. On the menu, a
          // level nobody chose steps down by itself; in play the walker is told how.
          if (fps < 22 && (dynScale <= 0.5 || dynLock) && q.name !== 'low') {
            if (++dynLow >= 4) {
              if (mode === 0 && autoQ) {
                let kept = false;
                try { sessionStorage.setItem('ww-auto', q.name === 'high' ? 'med' : 'low'); kept = true; } catch (e) {}
                if (kept) { location.reload(); return; }
              }
              if (mode === 2 && !dynTold) {
                dynTold = true;
                hintEl.textContent = 'Slow frame rate · Esc, then choose ' + (q.name === 'high' ? 'Medium or Low' : 'Low');
                showHint = 10; hintEl.classList.add('show');
              }
            }
          } else dynLow = 0;
        }
      } else { dynT = 0; dynN = 0; }
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
      if (qstr.has('bolt')) {
        // A held flash for a capture: 1 is a stroke to the sea ahead, 2 one inside the cloud.
        const far = +qstr.get('far') || 2400, g = qstr.get('bolt') !== '2';
        bolt.pos = [camX + Math.sin(yaw) * far, g ? 900 : 2600, camZ - Math.cos(yaw) * far]; bolt.show = g ? 1 : 0; bolt.seed = 31.7; bolt.now = 0.85;
      } else if (!READ && !qstr.has('shot')) {
        const heard = boltStep(dt, camX, camZ, Math.sin(yaw), -Math.cos(yaw));
        if (heard && audio && audio.thunder && mode > 0) audio.thunder(heard);
      }

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
        if (K.KeyW || K.KeyS || K.KeyA || K.KeyD) {
          // A move key takes the view over in first person where the camera is: on foot if
          // it is near the ground or the water, flying if it is up in the air.
          orbit = false;
          setFlyMode(camY > Math.max(fieldSample(world, camX, camZ), waveY(world, camX, camZ, time)) + 4);
          showModeHint(fly);
        }
        if (K.KeyE || K.Space) orbitDist = Math.max(4, orbitDist - 16 * dt);
        if (K.KeyQ) orbitDist = Math.min(160, orbitDist + 16 * dt);
        applyOrbitPose();
        const orr = Math.hypot(camX, camZ);
        if (orr > 980) { camX *= 980 / orr; camZ *= 980 / orr; }
        if (camY > FLY_TOP) camY = FLY_TOP;
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
          // W and S go along the line of sight, as in any first-person fly-through; A and D
          // stay level. Space and Q still rise and sink.
          const along = forward - back, cp = Math.cos(pitch);
          wishX = fx * cp * along + rx * ((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0));
          wishZ = fz * cp * along + rz * ((K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0));
          wishY = Math.sin(pitch) * along;
          const wl3 = Math.hypot(wishX, wishY, wishZ);
          if (wl3 > 1) { wishX /= wl3; wishY /= wl3; wishZ /= wl3; }
          if (K.Space || K.KeyE) wishY += 1;
          if (K.ControlLeft || K.ControlRight || K.KeyQ) wishY -= 1;
          // Near the ground the old speeds stand. Higher up the air thins the trip:
          // the cloud base is about a kilometre up, and the ceiling is above the cirrus.
          const altLift = 1 + Math.min(6.5, Math.max(0, camY - 80) / 180);
          const spm = (sprint ? 48 : 14) * altLift;
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
        if (camY > FLY_TOP) camY = FLY_TOP;
        if (camY < -8) camY = -8;
      }
      // Nothing puts the eye under the land or the seabed: not an orbit swung over a hill, not
      // a flight between places. The highest ground within a stride counts, so the view does
      // not cut a cliff face open either. Walking keeps to the ground by its own rule.
      if (mode !== 2 || fly) {
        let g = fieldSample(world, camX, camZ);
        for (let k = 0; k < 4; k++) g = Math.max(g, fieldSample(world, camX + (k === 0 ? 0.9 : k === 1 ? -0.9 : 0), camZ + (k === 2 ? 0.9 : k === 3 ? -0.9 : 0)));
        if (camY < g + 0.45) { camY = g + 0.45; if (velY < 0) velY = 0; }
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
      if (camY >= waveHere - 0.05) {
        bugLife.update(dt, time, camX, camY, camZ);
        birdLife.update(dt, time, camX, camY, camZ);
      }
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
      // Enter under ~12 cm below the local surface; leave ~10 cm above — hysteresis kills flicker.
      const waterGap = waveHere - camY;
      if (!underLatch && waterGap > 0.12) underLatch = true;
      else if (underLatch && waterGap < -0.1) underLatch = false;
      const under = underLatch ? 1 : 0;
      // Lazy-load deep-sea once the eye is in a deep basin (bed under −6 m).
      if (under && !deepSea && fieldSample(world, camX, camZ) < -6) ensureDeepSea();
      if (deepSea) deepSea.update(dt, time, camX, camY, camZ);
      // Continuous immersion for shaders (fog/fill/caustics) — no forced jump across 0.5.
      // Latch still gates discrete app paths (reflections, bugs, audio).
      let immersion = Math.min(1, Math.max(0, (waterGap + 0.22) / 0.7));
      // Ease ends so the first/last centimetres do not pop tone.
      immersion = immersion * immersion * (3 - 2 * immersion);
      // Disk centred on the eye. The old square stopped at 6.4 km, so from altitude its
      // edge crossed the frame. Stay inside the 36 km far plane: a vertex past it, pulled
      // back by hand, clipped into a sheet that painted over the island.
      const eyeH = Math.max(camY, 0.4);
      const angPx = Math.tan(fov * 0.5) / Math.max(viewH, 64);
      const reach = Math.min(30000, Math.max(8000, eyeH / Math.max(angPx, 1e-5)));
      const snap = 4;
      const ox = Math.floor(camX / snap) * snap;
      const oz = Math.floor(camZ / snap) * snap;
      // Match seaRadius: first ring ~1 m on the inner 8 km, whatever the horizon reach.
      const split = 0.72, inner = 8000, cell0 = 1;
      const sRing = cell0 * split * (q.water - 1) / inner;
      let kSea = 5;
      for (let i = 0; i < 6; i++) {
        const ek = Math.exp(kSea), den = ek - 1;
        kSea -= (kSea / den - sRing) / ((den - kSea * ek) / (den * den));
        if (kSea < 2) kSea = 2;
        if (kSea > 12) kSea = 12;
      }

      fillCam(uf, camX, camY, camZ, yaw, pitch, 0, immersion);
      uf[80] = ox; uf[81] = oz; uf[82] = reach; uf[83] = fieldDamp(world, camX, camZ);
      uf[87] = kSea;
      // Geometric grass fades before a cell stops submitting it. 0 keeps every tuft (?stream=0).
      // Float 87 is the sea-disk exponent, so the fade lives in the trailing grassFade field.
      const grassEnd = stream.enabled ? (340 + Math.max(0, camY - 4) * 3.4) : 0;
      uf[264] = grassEnd;
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
        // Half-res volume pass owns low cloud from any eye height (beach included), so the
        // sky is a true 3D density march instead of the coarse strip bake alone. Hysteresis
        // only for underwater: the volume pass already early-outs when F.under is set, and
        // a rebake keeps the panorama from double-drawing the deck on the way back up.
        const wantOwn = !under;
        if (wantOwn !== cloudOwn) { cloudOwn = wantOwn; }
        if (cloudOwn !== cloudOwnBake) { cloudOwnBake = cloudOwn; sky.reset(); }
        // Float 265 is the tail after grassFade. Float 87 stays the sea-disk exponent.
        uf[265] = cloudOwn ? 1 : 0;
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

      // Rings, predictive cells, then GPU uploads. Ocean cascades and the sky bake
      // above are untouched — one sea, one atmosphere. A failure falls back to the full mesh.
      terrainList = null;
      try {
        stream.tick(camX, camZ, camY, dt, fwd[0], fwd[2], VP, device);
        terrainList = stream.patches();
        if (stream.enabled) {
          const gkey = stream.grassKey(camX, camZ, grassEnd);
          if (gkey !== grassKey) {
            const n = stream.gatherGrass(grassDraw, camX, camZ, grassEnd);
            if (n >= 0) {
              grassCount = n;
              if (n) device.queue.writeBuffer(grassInstB, 0, grassDraw.subarray(0, n * 4));
              grassKey = gkey;
            }
          }
        }
      } catch (err) {
        stream.enabled = false;
        terrainList = null;
        stream.fail = (err && err.message) || String(err);
        console.warn('stream', err);
      }

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
        // LOD cross-fade always — sample-mask when MSAA is on, stable leaf dissolve when not.
        scatter.fade = true;
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
        fishDraws = fishLife.collect(fishArr, uf, camX, camY, camZ, under ? 58 : 30, fishPack.ranges);
        if (fishDraws.end) device.queue.writeBuffer(fishInstB, 0, fishArr, 0, fishDraws.end * ISTRIDE);
      } else {
        fishDraws = bugDrawsEmpty;
      }

      if (under) bugDraws = bugDrawsEmpty;
      else {
        bugDraws = bugLife.collect(bugArr, uf, camX, camY, camZ, uf[63] * 2 / viewH, bugPack.ranges);
        if (bugDraws.end) device.queue.writeBuffer(bugInstB, 0, bugArr, 0, bugDraws.end * BUG_STRIDE);
      }
      if (under) birdDraws = bugDrawsEmpty;
      else {
        if (birdNear) {
          for (let i = 0; i < Math.min(3, birdLife.agents.length); i++) {
            const a = birdLife.agents[i];
            a.on = true; a.mode = 0; a.amp = 0.7; a.ph = time * 8 + i;
            a.x = camX + Math.sin(yaw) * birdNear + Math.cos(yaw) * (i - 1) * 1.3;
            a.y = camY + 0.3 * i; a.z = camZ - Math.cos(yaw) * birdNear + Math.sin(yaw) * (i - 1) * 1.3;
            a.yaw = yaw + [0, 0.9, -2.2][i]; a.sc = 1.1;
          }
        }
        birdDraws = birdLife.collect(birdArr, uf, camX, camY, camZ, 160, birdPack.ranges);
        if (birdDraws.end) device.queue.writeBuffer(birdInstB, 0, birdArr, 0, birdDraws.end * ISTRIDE);
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
        for (const c of NO.ocean ? [] : cascades) {
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
      if (!wp.paused && !NO.shoresim) shoreSim.encode(enc, time, dt);
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
      if (!NO.skybake) sky.encode(enc, pipes, bgUB);
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
        // Meadows + flower shrubs: island map is coarse, but dense grass still darkens sand.
        if (pipes.shadowGrass && grassCount && !NO.grass) {
          spass.setPipeline(pipes.shadowGrass); spass.setBindGroup(0, bgGround);
          spass.setVertexBuffer(0, grassVB); spass.setVertexBuffer(1, grassInstB);
          spass.setIndexBuffer(grassIB, 'uint16');
          spass.drawIndexed(g.idx.length, grassCount);
        }
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
          if (!NO.near) drawMeshes(np, pipes.shadowMesh, bgUBN, meshVB, meshIB, instB, nearDraws);
          // Nearby grass and flower-shrub meshes (in nearDraws) both darken the ground.
          if (pipes.shadowGrass && grassCount && !NO.grass) {
            np.setPipeline(pipes.shadowGrass); np.setBindGroup(0, bgGroundN);
            np.setVertexBuffer(0, grassVB); np.setVertexBuffer(1, grassInstB);
            np.setIndexBuffer(grassIB, 'uint16');
            np.drawIndexed(g.idx.length, grassCount);
          }
          if (under) drawMeshes(np, pipes.shadowFish, bgUBN, fishVB, fishIB, fishInstB, fishDraws);
          else drawMeshes(np, pipes.shadowBug, bgUBN, bugVB, bugIB, bugInstB, bugDraws);
          np.end();
        }
      }
      if (uf[86] > 0.5 && !NO.refl) {
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
      // The flash is a few frames long. March it into the sky only while it is on.
      if (bolt.now > 0.004 && pipes.bolt && bgBolt && !under && !NO.sky) {
        const bp = enc.beginRenderPass(boltPass);
        bp.setPipeline(pipes.bolt); bp.setBindGroup(0, bgUB); bp.setBindGroup(1, bgBolt);
        bp.draw(3); bp.end();
      }
      {
        const cp = enc.beginRenderPass(cloudPass);
        if (pipes.cloud && !NO.cloud && uf[265] > 0.5) {
          cp.setPipeline(pipes.cloud); cp.setBindGroup(0, bgUB); cp.setBindGroup(1, bgCloud);
          cp.draw(3);
        }
        cp.end();
      }
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
      // A capture never presents. Headless WebGPU has no swapchain image, and asking for
      // one destroys the device before the frame can be read back.
      const seqHit = READ_SEQ > 0 && frames >= READ_AT
        && ((frames - READ_AT) % READ_STRIDE) === 0
        && (window.__pngs?.length || 0) < READ_SEQ
        && !window.__reading;
      if (READ) {
        if (readTex && (frames === READ_AT || seqHit)) drawSwap(readViews[0], readViews[1], true);
      } else {
        drawSwap(context.getCurrentTexture().createView(), swapDepthView, true);
      }
      let doRead = false;
      if (READ && readTex && (frames === READ_AT || seqHit) && !window.__reading) {
        enc.copyTextureToBuffer(
          { texture: readTex },
          { buffer: readBuf, bytesPerRow: readBpr, rowsPerImage: viewH },
          { width: viewW, height: viewH }
        );
        doRead = true;
        window.__reading = true;
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
            window.__reading = false;
            requestAnimationFrame(frame);
          }
        }, 240000);
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
          const url = c2.toDataURL('image/png');
          window.__png = url;
          if (READ_SEQ > 0 && window.__pngs) {
            window.__pngs.push(url);
            window.__stage = 'seq:' + window.__pngs.length + '/' + READ_SEQ;
          }
          window.__reading = false;
          if (qstr.has('perf')) {
            const tri = (d) => { let n = 0; for (let i = 0; i < d.length; i += 5) n += d[i + 1] * d[i + 4]; return Math.round(n / 3000) + 'k'; };
            const top = (d) => { const r = []; for (let i = 0; i < d.length; i += 5) r.push([d[i + 1] / 3 * d[i + 4], d[i + 1] / 3, d[i + 4]]); return r.sort((x, y) => y[0] - x[0]).slice(0, 14).map((x) => x[1] + 'x' + x[2]).join(' '); };
            console.log('PERF top view ' + top(mainDraws) + ' | shadow ' + top(nearDraws));
            console.log('PERF cpu ' + (PERF.cpuMs / PERF.cpuN).toFixed(2) + ' ms/frame over ' + PERF.cpuN + ', plant triangles: view ' + tri(mainDraws) + ', mirror ' + tri(reflDraws) + ', near shadow ' + tri(nearDraws));
          }
          requestAnimationFrame(frame);
        }).catch((err) => { clearTimeout(readWatch); window.__gpuerr = String(err); window.__reading = false; console.error('READ', err); });
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
        statsEl.textContent = fps + ' fps  ·  ' + q.name + '  ·  ' + viewW + '×' + viewH + (dynScale < 1 ? ' (' + Math.round(dynScale * 100) + '%)' : '') + gpu + cpu + bound
          + '  ·  ' + stream.line();
      }
      if (score) score.setAudible(mode > 0 && musicOn && !muted, musicVol);
      if (audio && mode > 0) {
        const alt = Math.max(camY, 0);
        const shore = Math.exp(-Math.abs(camY) * 0.08) * (0.35 + 0.65 * fieldDamp(world, camX, camZ));
        const land = fieldSample(world, camX, camZ);
        const nearBreak = Math.exp(-Math.max(land, 0) * 0.35) * (land < 3 ? 1 : 0.35);
        audio.shoreAmt = nearBreak;
        // Ocean-first continuous foundation (synth noise); beds carry, crashes are accents.
        const sea = muted ? 0 : 1;
        const uw = audio.underAmt;
        const wet = 1 - 0.78 * uw;
        const oceanBed = 0.42 + 0.58 * shore;
        audio.swell.gain.value = sea * 0.2 * oceanBed * (0.55 + 0.7 * nearBreak) * wet;
        audio.surf.gain.value = sea * 0.17 * oceanBed * (0.65 + 0.7 * nearBreak) * wet;
        audio.body.gain.value = sea * 0.11 * oceanBed * (0.4 + 0.9 * nearBreak) * (1 - 0.88 * uw);
        audio.hiss.gain.value = sea * 0.028 * nearBreak * (0.7 + 0.5 * shore) * (1 - 0.92 * uw);
        // Same travelling gust cells that bend plants and chop the bay.
        const gust = envWindAt(camX, camZ);
        const sy = env.sun[1], dark = smooth01(0.1, -0.08, sy);
        const wood = land > 1.2 ? Math.max(0, Math.min(1, forestMask(camX, camZ, land, fieldSlope(world, camX, camZ)) * 1.5)) : 0;
        const palmZone = Math.max(0, Math.min(1, (1.2 - Math.abs(land - 1.4)) / 1.2)) * (1 - wood * 0.5);
        audio.wind.gain.value = (muted ? 0 : 0.028) * (0.3 + Math.min(alt, 80) / 80) * (1 - 0.95 * uw) * (land > 8 ? 1.2 : 0.85) * (0.3 + 0.7 * gust * gust / 22);
        audio.insects.gain.value = (muted ? 0 : 0.012) * Math.max(0, Math.min(1, (land - 0.8) / 5)) * (1 - uw) * (1 - 0.7 * dark) * (1 - Math.min(1, env.v[1] * 2)) * (1 - 0.35 * Math.min(1, gust / 10));
        audio.air({
          heat: smooth01(0.15, 0.6, sy) * (1 - 0.7 * env.cover), dark: dark, low: smooth01(0.4, 0.1, sy) * (1 - dark),
          dawn: smooth01(5, 6, env.hour) * (1 - smooth01(7.5, 9, env.hour)), rain: env.v[1], gust: gust,
          wood: wood, shore: nearBreak, palm: palmZone,
          alt: camY - Math.max(land, 0) - 1.7, under: under, heard: Object.assign({}, bugLife.heard, birdLife.heard)
        });
        if (audio.birdListen) audio.birdListen(camX, camZ, yaw);
        audio._singLiving = () => !!(audio.singFrom && birdLife.singers.length && audio.singFrom(birdLife.singers));
        // Depth-aware muffling on the shared under LPF: reef stays readable; abyss cuts highs harder.
        const camDeep = under ? Math.max(-camY, 0) : 0;
        const deepAmt = under ? Math.min(1, Math.max(0, (camDeep - 4) / 14)) : 0;
        audio.deepAmt = deepAmt;
        const underGoal = under ? (360 - deepAmt * 180) : 16000;
        if (underGoal !== audio._underGoal) {
          audio._underGoal = underGoal;
          audio.under.frequency.setTargetAtTime(underGoal, audio.ac.currentTime, 0.28);
        }
        audio.underAmt += ((under ? 1 : 0) - audio.underAmt) * 0.07;
        // Proximity to either 1800s wreck habitat (for creaks / bubble bias).
        const w1 = Math.hypot(camX - 232, camZ + 45);
        const w2 = Math.hypot(camX - 240, camZ - 10);
        audio.wreckNear = under ? Math.max(0, 1 - Math.min(w1, w2) / 18) : 0;
        // Swim-speed water rush while submerged (Abyssal audio cue).
        const spd = Math.hypot(velX, velY, velZ);
        const m = muted ? 0 : 1;
        audio.rush.value = m * (0.045 * Math.pow(Math.min(spd / 14, 1), 1.2) * uw);
        if (uw > 0.05) audio.rushF.frequency.value = 160 + spd * 12 + deepAmt * 40;
        // Pressure rumble grows with depth; silent above water.
        if (audio.pressure) {
          audio.pressure.gain.value = m * (0.035 * deepAmt * deepAmt * uw);
          if (audio.pressureF) audio.pressureF.frequency.value = 55 + deepAmt * 50;
        }
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
      if (!audio) {
        audio = makeAudio();
        if (audio) {
          // User gesture: resume context, then force score audible (deferred chunk may race).
          audio.ac.resume().then(() => {
            if (!score) score = startIslandScore(audio.ac, audio.under);
            else score.setAudible(musicOn && !muted, musicVol);
          }).catch(() => {});
        }
      } else if (audio.ac.state !== 'running') {
        audio.ac.resume().then(() => {
          if (!score) score = startIslandScore(audio.ac, audio.under);
          else score.setAudible(musicOn && !muted, musicVol);
        }).catch(() => {});
      } else if (!score) {
        score = startIslandScore(audio.ac, audio.under);
      } else {
        score.setAudible(musicOn && !muted, musicVol);
      }
      document.body.classList.add('playing', 'studio');
      // In on foot, on the beach, with the mouse already looking: what anyone who has played
      // a first-person game expects of WASD. The click is the gesture the lock needs.
      mode = 2;
      if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) {
        // A phone has no keys and no mouse to give up: it keeps the view it is turned by a finger.
        openOrbit();
        const spPhone = env.spacePick >= 0 ? SPACES[env.spacePick] : null;
        if (spPhone && qstr.has('spacecam') && spPhone.spot != null) {
          goPlace(spPhone.spot, true);
          showCaption(spPhone);
        }
        showHint = 7;
        $('hint').textContent = 'Drag to look round · Spaces for the light · Places to travel · Walk to go on foot';
      } else {
        putPlace(WATER);
        const sp = env.spacePick >= 0 ? SPACES[env.spacePick] : null;
        if (sp && qstr.has('spacecam') && sp.spot != null) {
          goPlace(sp.spot, true);
          showCaption(sp);
        } else goPlace(0, false);
        showModeHint(false);
        tryLockPointer();
      }
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
        if (env.spaceId === 7 && !qstr.has('at') && !qstr.has('sunview')) {
          const turn = num('dyaw'), tilt = num('dpitch');
          aimMoon();
          yaw += turn; pitch += tilt;
        }
        birdNear = num('bird');
        // fish=<species> frames one fish (fd under 1.6 m) or its school; calm stops them minding the camera;
        // warm runs the animals for that many seconds first.
        fishLife.calm = qstr.has('calm');
        // shark=wreck frames the rare sixgill wreck-emerge school; shark=basin the signature patrol.
        if (qstr.has('shark') && !qstr.has('fish')) {
          const wantWreck = qstr.get('shark') === 'wreck';
          let nth = 0;
          for (const s of fishLife.schools) {
            if (s.sp !== 12) continue;
            if (!!s.wreck === wantWreck) { qstr.set('fish', '12'); qstr.set('nth', String(nth)); break; }
            nth++;
          }
        }
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
        if (qstr.has('birdsp') || qstr.has('bwarm')) {
          envStep(0, time, wp.mood[1], wp.mood[2], wp.dir, wp.amp);
          birdLife.calm = true;
          // Seed near the beach so shore/forest species wake around the shot.
          const warmX = beach.x, warmZ = beach.z, warmY = beach.h + 2;
          const warmN = Math.min(Math.max(0, num('bwarm') || 6), 12) * 30;
          for (let k = 0; k < warmN; k++) {
            bugLife.update(1 / 30, time + k / 30, warmX, warmY, warmZ);
            birdLife.update(1 / 30, time + k / 30, warmX, warmY, warmZ);
          }
          const id = qstr.get('birdsp') || 'tern';
          let a = birdLife.find(id, num('nth') || 0);
          if (!a) {
            // Force one agent of that species onto a home near the beach, then find it.
            const sp = BIRD_SPECIES.findIndex((b) => b.id === id);
            if (sp >= 0) {
              const cand = birdLife.agents.find((x) => x.sp === sp);
              if (cand) { birdLife.newHome(cand); cand.on = true; a = cand; }
            }
          }
          a = a || birdLife.nearest(warmX, warmY, warmZ);
          if (a) {
            fly = true;
            const back = num('bd') || 4;
            camX = a.x - Math.sin(a.yaw) * back;
            camZ = a.z + Math.cos(a.yaw) * back;
            camY = a.y + (num('fup') || 0.8);
            yaw = Math.atan2(a.x - camX, -(a.z - camZ));
            pitch = Math.atan2((a.y - camY), Math.hypot(a.x - camX, a.z - camZ)) + (num('tilt') || 0);
          }
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
