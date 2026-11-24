// Marine life: the reef the fish live on, the fish themselves, and how they behave.
// Everything is built from numbers in this file. Meshes are prototypes drawn as
// instances; a fish instance is 12 floats and its swimming is done in the vertex shader.

const FISH = 5, FIN = 6, EYE = 7, CORAL = 8;

// Shapes are in body lengths, snout at s = 0 and tail tip at s = 1.
//   sb    where the body ends and the tail fin starts
//   top, bot, wid   [size, where along the body it is greatest, nose: under 1 blunt, over 1 drawn out]
//   ped   half-height of the tail stalk
//   tail  [fork depth, span, roundness]
//   dorsal, anal    [start, end, height, shape]  shape 0 arch, 1 rising streamer, 2 front lobe, 3 even
//   pect  [where, height on the flank, length, spread]
//   eye   [where, height, radius, how far it looks upward]
//   fin   colour at the base and at the edge
// Behaviour is in metres and seconds.
//   role  0 hovers over one coral head in a school, 1 lives in an anemone, 2 forages from
//         coral to coral, 3 sits on the sand, 4 patrols and is feared, 5 travels in a school
const FISH_SPECIES = [
  { name: 'reef chromis', len: [0.07, 0.1], sb: 0.72, top: [0.15, 0.42, 0.8], bot: [0.15, 0.45, 0.85], wid: [0.06, 0.38, 0.7], ped: 0.036,
    tail: [0.6, 0.4, 0], dorsal: [0.24, 0.7, 0.085, 3], anal: [0.47, 0.7, 0.075, 0], pect: [0.27, -0.03, 0.17, 0.5], eye: [0.085, 0.035, 0.026, 0.1],
    fin: [[0.16, 0.36, 0.36], [0.08, 0.17, 0.19]],
    role: 0, cruise: 0.2, burst: 1.0, turn: 6, sep: 0.085, clear: 0.1, top_: 0.3, shy: 1.5, wander: 0.5, idle: 0.3, coh: 1.2, ali: 0.5, wag: 1, scull: 1, prey: 1 },
  { name: 'ember anemonefish', len: [0.07, 0.1], sb: 0.78, top: [0.16, 0.42, 0.65], bot: [0.16, 0.45, 0.7], wid: [0.075, 0.36, 0.6], ped: 0.05,
    tail: [0.0, 0.27, 0.5], dorsal: [0.22, 0.76, 0.08, 3], anal: [0.5, 0.76, 0.085, 0], pect: [0.28, -0.04, 0.2, 0.75], eye: [0.09, 0.04, 0.025, 0.1],
    fin: [[0.62, 0.20, 0.04], [0.10, 0.03, 0.02]],
    role: 1, cruise: 0.12, burst: 0.7, turn: 7, sep: 0.07, clear: 0.03, top_: 0.3, shy: 0.9, wander: 0.5, idle: 0.6, coh: 2.2, ali: 0.1, wag: 1.25, scull: 1.4, prey: 1 },
  { name: 'saddled butterflyfish', len: [0.12, 0.16], sb: 0.8, top: [0.27, 0.52, 1.15], bot: [0.25, 0.55, 1.2], wid: [0.05, 0.4, 0.8], ped: 0.045,
    tail: [0.05, 0.2, 0.25], dorsal: [0.3, 0.8, 0.07, 3], anal: [0.52, 0.8, 0.075, 3], pect: [0.3, -0.04, 0.16, 0.5], eye: [0.115, 0.04, 0.028, 0.05],
    fin: [[0.80, 0.60, 0.08], [0.85, 0.72, 0.20]],
    role: 2, cruise: 0.22, burst: 0.9, turn: 4, sep: 0.2, clear: 0.12, top_: 0.35, shy: 1.4, wander: 0.25, idle: 0.3, coh: 1, ali: 0.3, wag: 0.8, scull: 1, prey: 1, graze: 0.5 },
  { name: 'ringed angelfish', len: [0.2, 0.27], sb: 0.78, top: [0.26, 0.5, 0.7], bot: [0.26, 0.52, 0.72], wid: [0.06, 0.4, 0.7], ped: 0.055,
    tail: [0.0, 0.26, 0.45], dorsal: [0.22, 0.78, 0.13, 1], anal: [0.44, 0.78, 0.13, 1], pect: [0.27, -0.05, 0.17, 0.55], eye: [0.085, 0.07, 0.026, 0.05],
    fin: [[0.05, 0.09, 0.28], [0.25, 0.42, 0.62]],
    role: 2, cruise: 0.2, burst: 0.9, turn: 2.6, sep: 0.4, clear: 0.2, top_: 0.5, shy: 1.6, wander: 0.2, idle: 0.35, coh: 0.8, ali: 0.2, wag: 0.7, scull: 1.2, prey: 0, graze: 0.3 },
  { name: 'dawn parrotfish', len: [0.3, 0.42], sb: 0.8, top: [0.15, 0.34, 0.55], bot: [0.14, 0.4, 0.6], wid: [0.085, 0.36, 0.55], ped: 0.05,
    tail: [0.28, 0.3, 0.1], dorsal: [0.24, 0.76, 0.034, 3], anal: [0.54, 0.76, 0.03, 3], pect: [0.26, -0.01, 0.2, 0.6], eye: [0.1, 0.065, 0.02, 0.05],
    fin: [[0.10, 0.36, 0.38], [0.50, 0.36, 0.34]],
    role: 2, cruise: 0.32, burst: 1.5, turn: 2.4, sep: 0.5, clear: 0.16, top_: 0.5, shy: 1.9, wander: 0.2, idle: 0.3, coh: 0.9, ali: 0.3, wag: 0.45, scull: 1.8, prey: 0, graze: 0.75 },
  { name: 'sand goby', len: [0.045, 0.07], sb: 0.82, top: [0.07, 0.25, 0.5], bot: [0.05, 0.3, 0.55], wid: [0.07, 0.22, 0.5], ped: 0.03,
    tail: [0.0, 0.17, 0.6], dorsal: [0.3, 0.78, 0.07, 3], anal: [0.52, 0.78, 0.045, 3], pect: [0.26, -0.02, 0.2, 0.9], eye: [0.07, 0.062, 0.028, 0.75],
    fin: [[0.55, 0.50, 0.40], [0.72, 0.68, 0.58]],
    role: 3, cruise: 0.1, burst: 0.75, turn: 9, sep: 0.1, clear: 0, top_: 0.15, shy: 0.8, wander: 0, idle: 0, coh: 1, ali: 0, wag: 1.3, scull: 0.3, prey: 1 },
  { name: 'steel trevally', len: [0.48, 0.66], sb: 0.76, top: [0.165, 0.42, 0.7], bot: [0.14, 0.45, 0.8], wid: [0.06, 0.36, 0.7], ped: 0.017,
    tail: [0.86, 0.44, 0], dorsal: [0.34, 0.75, 0.11, 2], anal: [0.5, 0.75, 0.09, 2], pect: [0.25, -0.03, 0.27, 0.22], eye: [0.075, 0.05, 0.022, 0.05],
    fin: [[0.30, 0.34, 0.30], [0.42, 0.40, 0.18]],
    role: 4, cruise: 0.75, burst: 2.6, turn: 1.6, sep: 0.7, clear: 0.35, top_: 0.5, shy: 2.6, wander: 0.12, idle: 0.8, coh: 0.7, ali: 0.5, wag: 0.8, scull: 0.2, prey: 0 },
  { name: 'gold-line fusilier', len: [0.17, 0.24], sb: 0.76, top: [0.1, 0.42, 0.9], bot: [0.095, 0.45, 0.95], wid: [0.055, 0.38, 0.8], ped: 0.022,
    tail: [0.74, 0.3, 0], dorsal: [0.3, 0.74, 0.036, 0], anal: [0.54, 0.74, 0.03, 0], pect: [0.25, -0.02, 0.15, 0.35], eye: [0.07, 0.03, 0.023, 0.05],
    fin: [[0.30, 0.42, 0.50], [0.12, 0.17, 0.22]],
    role: 5, cruise: 0.45, burst: 1.8, turn: 3.2, sep: 0.16, clear: 0.4, top_: 0.5, shy: 2.2, wander: 0.2, idle: 0.9, coh: 1, ali: 0.9, wag: 0.9, scull: 0.2, prey: 1 },
  // Large animals (approx body-of-revolution meshes) — affordable landmarks in the reef.
  { name: 'green turtle', len: [0.75, 0.95], sb: 0.88, top: [0.14, 0.38, 0.55], bot: [0.1, 0.4, 0.6], wid: [0.22, 0.4, 0.7], ped: 0.04,
    tail: [0.0, 0.12, 0.8], dorsal: [0.35, 0.7, 0.02, 3], anal: [0.55, 0.75, 0.015, 3], pect: [0.22, -0.02, 0.28, 0.9], eye: [0.08, 0.05, 0.028, 0.15],
    fin: [[0.28, 0.42, 0.22], [0.45, 0.52, 0.28]],
    role: 2, cruise: 0.28, burst: 0.85, turn: 1.4, sep: 1.2, clear: 0.35, top_: 0.55, shy: 2.8, wander: 0.15, idle: 0.7, coh: 0.4, ali: 0.1, wag: 0.25, scull: 1.6, prey: 0, graze: 0.4 },
  { name: 'spotted eagle ray', len: [0.9, 1.2], sb: 0.82, top: [0.06, 0.35, 0.7], bot: [0.05, 0.38, 0.75], wid: [0.42, 0.32, 0.55], ped: 0.02,
    tail: [0.2, 0.08, 0.9], dorsal: [0.4, 0.7, 0.02, 3], anal: [0.5, 0.72, 0.015, 3], pect: [0.2, 0.0, 0.35, 1.1], eye: [0.1, 0.04, 0.022, 0.2],
    fin: [[0.32, 0.28, 0.22], [0.55, 0.48, 0.35]],
    role: 5, cruise: 0.55, burst: 1.6, turn: 1.8, sep: 1.6, clear: 0.45, top_: 0.7, shy: 3.2, wander: 0.18, idle: 0.85, coh: 0.9, ali: 0.7, wag: 0.35, scull: 0.4, prey: 0 },
  { name: 'reef blacktip', len: [1.1, 1.45], sb: 0.78, top: [0.12, 0.4, 0.65], bot: [0.1, 0.42, 0.7], wid: [0.07, 0.35, 0.65], ped: 0.025,
    tail: [0.9, 0.38, 0], dorsal: [0.28, 0.55, 0.16, 2], anal: [0.52, 0.72, 0.06, 2], pect: [0.24, -0.04, 0.32, 0.35], eye: [0.07, 0.04, 0.02, 0.05],
    fin: [[0.18, 0.2, 0.22], [0.08, 0.08, 0.1]],
    role: 4, cruise: 0.85, burst: 3.2, turn: 1.3, sep: 1.8, clear: 0.5, top_: 0.65, shy: 4.0, wander: 0.1, idle: 0.75, coh: 0.5, ali: 0.4, wag: 0.7, scull: 0.15, prey: 0 },
  // Deep lanternfish — small midwater school; skin shader adds a soft belly photophore glow.
  { name: 'lanternfish', len: [0.055, 0.08], sb: 0.8, top: [0.09, 0.38, 0.7], bot: [0.08, 0.4, 0.75], wid: [0.05, 0.34, 0.65], ped: 0.022,
    tail: [0.55, 0.28, 0.1], dorsal: [0.32, 0.72, 0.04, 3], anal: [0.5, 0.74, 0.035, 3], pect: [0.26, -0.02, 0.14, 0.4], eye: [0.08, 0.04, 0.024, 0.2],
    fin: [[0.08, 0.14, 0.22], [0.12, 0.28, 0.38]],
    role: 5, cruise: 0.18, burst: 0.9, turn: 4.5, sep: 0.07, clear: 0.25, top_: 0.4, shy: 1.8, wander: 0.35, idle: 0.5, coh: 1.3, ali: 0.85, wag: 1.1, scull: 0.35, prey: 1 }
];

let FISH_SHAPE_SLOT = null;
function fishShapeSrc(i) {
  const s = FISH_SPECIES[i];
  return s.shapeOf != null ? s.shapeOf : i;
}
globalThis.__wwAppendFishSpecies = function (extra) {
  for (let i = 0; i < extra.length; i++) FISH_SPECIES.push(extra[i]);
};

function fishProfile(sp, s) {
  const u = Math.min(Math.max(s / sp.sb, 0), 1);
  // The head swells from the snout to the deepest point; behind it the body draws in to the tail stalk.
  const f = (c, ped) => u < c[1] ? c[0] * Math.pow(Math.sin(1.5708 * u / c[1]), c[2])
    : ped + (c[0] - ped) * (0.5 + 0.5 * Math.cos(Math.PI * Math.pow((u - c[1]) / (1 - c[1]), 1.15)));
  return { top: f(sp.top, sp.ped), bot: f(sp.bot, sp.ped), wid: f(sp.wid, sp.ped * 0.4) };
}
// Half-width of the body at a given height: the section is a lens, narrow at the back and the belly.
function fishHalfWidth(pr, y) {
  const sn = Math.max(-1, Math.min(1, y / (y > 0 ? pr.top : pr.bot)));
  const cs = Math.sqrt(1 - sn * sn);
  return pr.wid * cs * (0.7 + 0.3 * cs * cs);
}

// A fin is a sheet: rows of [x, y, z, u, v, sway], with one normal for the whole sheet.
function finSheet(m, rows, nrm, c0, c1) {
  const ids = [];
  for (const row of rows) {
    const r = [];
    for (const p of row) {
      const k = p[4];
      r.push(m.v(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2],
        c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, p[5] || 0, FIN, p[3], p[4]));
    }
    ids.push(r);
  }
  for (let i = 0; i + 1 < ids.length; i++) {
    for (let k = 0; k + 1 < ids[i].length; k++) {
      m.tri(ids[i][k], ids[i + 1][k], ids[i][k + 1]);
      m.tri(ids[i][k + 1], ids[i + 1][k], ids[i + 1][k + 1]);
    }
  }
}

// Normals from the faces around each vertex, for a shape that was pushed about after it was made.
function faceNormals(m) {
  const P = m.pos, nv = P.length / 3, acc = new Float32Array(nv * 3);
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, c = m.idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const o of [a, b, c]) { acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; }
  }
  let outward = 0;
  for (let i = 0; i < nv * 3; i++) outward += acc[i] * P[i];
  const flip = outward < 0 ? -1 : 1;
  for (let i = 0; i < nv; i++) {
    const L = (Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1) * flip;
    m.nrm[i * 3] = acc[i * 3] / L; m.nrm[i * 3 + 1] = acc[i * 3 + 1] / L; m.nrm[i * 3 + 2] = acc[i * 3 + 2] / L;
  }
}

function makeFish(sp, lod) {
  const m = new Mesh();
  const rings = (sp.coarse ? [14, 8, 4] : [24, 11, 5])[lod];
  const sides = (sp.coarse ? [10, 6, 4] : [14, 8, 4])[lod];
  const X = (s) => 0.5 - s;

  // Body: rings of a lens-shaped section, closer together toward the head.
  const grid = [];
  const nose = m.v(0.5, 0, 0, 1, 0, 0, 1, 1, 1, 0, FISH, 0, 0);
  for (let i = 0; i <= rings; i++) {
    const s = sp.sb * (0.006 + 0.994 * Math.pow(i / rings, 1.35));
    const pr = fishProfile(sp, s);
    const row = [];
    for (let k = 0; k < sides; k++) {
      const a = k / sides * Math.PI * 2;
      const sn = Math.sin(a), cs = Math.cos(a);
      const y = sn * (sn > 0 ? pr.top : pr.bot);
      const z = pr.wid * cs * (0.7 + 0.3 * cs * cs);
      row.push(m.v(X(s), y, z, 0, sn, cs, 1, 1, 1, 0, FISH, s / sp.sb, sn));
    }
    grid.push(row);
  }
  const end = m.v(X(sp.sb) - 0.004, 0, 0, -1, 0, 0, 1, 1, 1, 0, FISH, 1, 0);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    m.tri(nose, grid[0][k1], grid[0][k]);
    m.tri(end, grid[rings][k], grid[rings][k1]);
    for (let i = 0; i < rings; i++) {
      m.tri(grid[i][k], grid[i][k1], grid[i + 1][k]);
      m.tri(grid[i][k1], grid[i + 1][k1], grid[i + 1][k]);
    }
  }
  // Normals from the faces, so the head and the tail stalk shade as the solid they are.
  faceNormals(m);

  const c0 = sp.fin[0], c1 = sp.fin[1];
  const side = [0, 0, 1];

  // Tail fin: a fan from the tail stalk. A deep fork leaves the middle rays short.
  {
    const na = [12, 6, 2][lod], nr = [4, 2, 1][lod];
    const xb = X(sp.sb) + 0.012, Lf = 1 - sp.sb + 0.012;
    const rows = [];
    for (let ir = 0; ir <= nr; ir++) {
      const r = ir / nr, row = [];
      for (let ia = 0; ia <= na; ia++) {
        const v = -1 + 2 * ia / na, av = Math.abs(v);
        const len = Lf * (1 - sp.tail[0] * (1 - Math.pow(av, 1.6))) * (1 - sp.tail[2] * av * av * av);
        const y0 = v * sp.ped * 0.95, y1 = v * sp.tail[1] * 0.5;
        row.push([xb - len * r, y0 + (y1 - y0) * Math.pow(r, 0.72), 0, v * 0.5 + 0.5, r]);
      }
      rows.push(row);
    }
    finSheet(m, rows, side, c0, c1);
  }

  // Dorsal and anal fins: a strip standing on the back and one hanging from the belly.
  const strip = (spec, sign) => {
    const n = [12, 5, 1][lod], nr = lod ? 1 : 2;
    const rows = [];
    for (let ir = 0; ir <= nr; ir++) {
      const r = ir / nr, row = [];
      for (let it = 0; it <= n; it++) {
        const t = it / n, s = spec[0] + (spec[1] - spec[0]) * t;
        const pr = fishProfile(sp, s);
        let h, lean = 0.35;
        if (spec[3] === 1) { h = 0.3 + 0.7 * Math.pow(t, 1.6); lean = 0.25 + 1.3 * t; }
        else if (spec[3] === 2) { h = 0.22 + 0.78 * Math.exp(-Math.pow((t - 0.1) / 0.13, 2)); lean = 0.7; }
        else if (spec[3] === 3) h = (0.72 + 0.28 * Math.sin(t * Math.PI)) * smooth01(0, 0.08, t) * (1 - 0.55 * smooth01(0.88, 1, t));
        else h = Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * t)), 0.6);
        h *= spec[2];
        const base = (sign > 0 ? pr.top : pr.bot) * 0.94;
        row.push([X(s) - h * lean * r, sign * (base + h * r), 0, t, r]);
      }
      rows.push(row);
    }
    finSheet(m, rows, side, c0, c1);
  };
  strip(sp.dorsal, 1);
  strip(sp.anal, -1);

  if (lod < 2) {
    // Pectoral fins: a fan on each flank behind the gill, held out and back. Pelvic fins below.
    const fan = (ax, ay, az, dx, dy, dz, len, spread, sway, nj) => {
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl; dy /= dl; dz /= dl;
      // The fan opens in the plane of its direction and "up".
      let ex = -dy * dx, ey = 1 - dy * dy, ez = -dy * dz;
      const el = Math.hypot(ex, ey, ez) || 1;
      ex /= el; ey /= el; ez /= el;
      const nrm = [dy * ez - dz * ey, dz * ex - dx * ez, dx * ey - dy * ex];
      const rows = [];
      for (let ir = 0; ir <= 2; ir++) {
        const r = ir / 2, row = [];
        for (let j = 0; j <= nj; j++) {
          const u = j / nj, a = (u - 0.5) * 2 * spread;
          const L = len * (0.68 + 0.32 * Math.sin(Math.PI * (0.15 + 0.7 * u))) * r;
          const ca = Math.cos(a), sa = Math.sin(a);
          row.push([ax + (dx * ca + ex * sa) * L, ay + (dy * ca + ey * sa) * L, az + (dz * ca + ez * sa) * L, u + (sway === 1 ? 2 : 0), r, sway * r * r]);
        }
        rows.push(row);
      }
      finSheet(m, rows, nrm, c0, c1);
    };
    const pe = sp.pect, pr = fishProfile(sp, pe[0]);
    const pz = fishHalfWidth(pr, pe[1]) * 0.96;
    for (const sg of [-1, 1]) {
      fan(X(pe[0]), pe[1], sg * pz, -0.8, -0.3, sg * 0.55, pe[2], pe[3], 1, lod ? 3 : 6);
      if (!lod) {
        const pv = fishProfile(sp, pe[0] + 0.07);
        fan(X(pe[0] + 0.07), -pv.bot * 0.9, sg * pv.wid * 0.3, -0.75, -0.62, sg * 0.22, pe[2] * 0.62, 0.3, 0.35, 3);
      }
    }
    // Eyes: a shallow dome on each side of the head.
    const e = sp.eye, er = fishProfile(sp, e[0]);
    const ez = fishHalfWidth(er, e[1]);
    const seg = lod ? 6 : 12;
    for (const sg of [-1, 1]) {
      let nx = 0.22, ny = e[3], nz = sg * (1 - e[3] * 0.6);
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      // Two directions across the eye.
      let tx = nz, ty = 0, tz = -nx;
      const tl = Math.hypot(tx, tz);
      tx /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const cx = X(e[0]), cy = e[1], cz = sg * (ez - e[2] * 0.2);
      const mid = m.v(cx + nx * e[2] * 0.26, cy + ny * e[2] * 0.26, cz + nz * e[2] * 0.26, nx, ny, nz, 1, 1, 1, 0, EYE, 0, 0);
      const ring = [];
      for (let k = 0; k < seg; k++) {
        const a = k / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const rx = tx * ca + bx * sa, ry = ty * ca + by * sa, rz = tz * ca + bz * sa;
        const qx = nx * 0.5 + rx * 0.85, qy = ny * 0.5 + ry * 0.85, qz = nz * 0.5 + rz * 0.85, ql = Math.hypot(qx, qy, qz);
        ring.push(m.v(cx + rx * e[2], cy + ry * e[2], cz + rz * e[2], qx / ql, qy / ql, qz / ql, 1, 1, 1, 0, EYE, 1, 0));
      }
      for (let k = 0; k < seg; k++) m.tri(mid, ring[k], ring[(k + 1) % seg]);
    }
  }
  return m;
}

// ---- The reef. Sizes in metres; the instance scale varies each piece.

function coralTube(m, pts, r0, r1, sides, col, t0, t1, sw, cap) {
  // A tapering branch with a rounded end. sw: how far it sways per metre of height.
  const sway = (p) => (sw || 0) * Math.max(p[1], 0);
  const d = tube(m, pts, sides, false, (u, ang, len, p) => {
    const t = t0 + (t1 - t0) * u, sh = 0.5 + 0.5 * t;
    return [r0 + (r1 - r0) * u, col[0] * sh, col[1] * sh, col[2] * sh, sway(p), CORAL, 0, t];
  });
  const e = pts[pts.length - 1], c = r1 * (cap == null ? 1 : cap), ring = m.pos.length / 3 - sides;
  const tip = m.v(e[0] + d[0] * c, e[1] + d[1] * c, e[2] + d[2] * c, d[0], d[1], d[2], col[0], col[1], col[2], sway(e), CORAL, 0, t1);
  for (let k = 0; k < sides; k++) m.tri(ring + k, tip, ring + (k + 1) % sides);
}

const CORAL_TONES = [
  // Muted underwater reef: ochre, rose, coral, olive, mauve, dusty peach — never neon.
  [0.62, 0.38, 0.22], [0.58, 0.30, 0.28], [0.66, 0.46, 0.24], [0.52, 0.28, 0.18],
  [0.44, 0.40, 0.22], [0.46, 0.34, 0.48], [0.55, 0.36, 0.34], [0.48, 0.42, 0.36],
  [0.60, 0.44, 0.30], [0.40, 0.34, 0.40], [0.52, 0.32, 0.26], [0.58, 0.48, 0.28]
];

// kind 0: forking branches. form 0 thin antlers, 1 blunt fingers, 2 soft sea fan (surge sway),
// 3 tall pillar, 4 soft whip/plume.
// kind 1: boulder with grooves. 2: table on a stalk. 3: mound a head grows on.
function makeCoral(kind, seed, lod, form) {
  const rnd = seeded(seed * 53 + 7);
  const m = new Mesh();
  // Boulders and tables keep to the browns and ochres; the branching kinds have the whole range.
  let col = CORAL_TONES[(rnd() * (kind ? 7 : CORAL_TONES.length)) | 0];
  if (kind === 0) {
    const fan = form === 2, finger = form === 1, pillar = form === 3, whip = form === 4;
    if (fan) {
      const fans = [[0.50, 0.24, 0.34], [0.58, 0.32, 0.20], [0.44, 0.30, 0.40], [0.54, 0.36, 0.26]];
      col = fans[(rnd() * fans.length) | 0];
    }
    const sides = [4, 3, 3][lod];
    const segs = finger ? 2 : whip ? [5, 3, 2][lod] : pillar ? [4, 3, 2][lod] : [3, 2, 1][lod];
    const depth = finger ? [1, 1, 0][lod] : fan ? [4, 3, 2][lod] : whip ? [2, 1, 0][lod] : pillar ? [1, 1, 0][lod] : [3, 2, 1][lod];
    const swayAmt = fan ? 0.16 : whip ? 0.22 : pillar ? 0.04 : 0;
    const grow = (p, d, len, rad, left, t) => {
      const pts = [p];
      let q = p, dir = d;
      for (let i = 1; i <= segs; i++) {
        dir = [dir[0] + (rnd() - 0.5) * (whip ? 0.45 : 0.3), dir[1] + 0.12 + (rnd() - 0.5) * 0.2, fan ? dir[2] * 0.5 : dir[2] + (rnd() - 0.5) * (whip ? 0.45 : 0.3)];
        const l = Math.hypot(dir[0], dir[1], dir[2]);
        dir = [dir[0] / l, dir[1] / l, dir[2] / l];
        q = [q[0] + dir[0] * len / segs, q[1] + dir[1] * len / segs, q[2] + dir[2] * len / segs];
        pts.push(q);
      }
      const t1 = t + (1 - t) / (left + 1);
      coralTube(m, pts, rad, rad * (left ? 0.72 : finger ? 0.8 : whip ? 0.35 : pillar ? 0.7 : 0.45), sides, col, t, t1, swayAmt);
      if (!left || pillar) return;
      const forks = whip ? 1 + (rnd() < 0.35 ? 1 : 0) : 2 + (!fan && rnd() < 0.45 ? 1 : 0);
      const turn = rnd() * 6.28;
      for (let f = 0; f < forks; f++) {
        const a = fan ? f * 3.1416 : turn + f / forks * 6.28, sp = 0.55 + rnd() * 0.35;
        // A direction tilted away from the parent, around it.
        let sx = dir[1], sy = -dir[0], sz = 0;
        if (Math.hypot(sx, sy) < 0.2) { sx = 1; sy = 0; }
        const sl = Math.hypot(sx, sy, sz);
        sx /= sl; sy /= sl;
        const ux = dir[1] * sz - dir[2] * sy, uy = dir[2] * sx - dir[0] * sz, uz = dir[0] * sy - dir[1] * sx;
        const nd = [dir[0] + (sx * Math.cos(a) + ux * Math.sin(a)) * sp, dir[1] + (sy * Math.cos(a) + uy * Math.sin(a)) * sp, dir[2] + (sz * Math.cos(a) + uz * Math.sin(a)) * sp];
        grow(q, nd, len * (0.66 + rnd() * 0.16), rad * (fan ? 0.8 : whip ? 0.65 : 0.72), left - 1, t1);
      }
    };
    if (pillar) {
      const stems = 3 + ((rnd() * 3) | 0);
      for (let i = 0; i < stems; i++) {
        const a = i / stems * 6.28 + rnd() * 0.4, off = 0.02 + rnd() * 0.06;
        grow([Math.cos(a) * off, -0.04, Math.sin(a) * off], [Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15], 0.28 + rnd() * 0.14, 0.04 + rnd() * 0.02, 0, 0);
      }
    } else if (whip) {
      col = [[0.55, 0.22, 0.38], [0.48, 0.28, 0.44], [0.62, 0.30, 0.28]][(rnd() * 3) | 0];
      const stems = 5 + ((rnd() * 4) | 0);
      for (let i = 0; i < stems; i++) {
        const a = rnd() * 6.28, off = rnd() * 0.08;
        grow([Math.cos(a) * off, -0.03, Math.sin(a) * off], [Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4], 0.22 + rnd() * 0.16, 0.01 + rnd() * 0.006, depth, 0);
      }
    } else {
      const stems = fan ? 3 : finger ? 13 + ((rnd() * 6) | 0) : 9 + ((rnd() * 5) | 0);
      for (let i = 0; i < stems; i++) {
        const a = fan ? (i - 1) * 0.5 + 1.5708 : i / stems * 6.28 + rnd() * 0.6, lean = fan ? 1 : 0.35 + rnd() * 0.5;
        const off = fan ? 0.01 : finger ? rnd() * 0.16 : 0.03 + rnd() * 0.1;
        const from = [Math.cos(a) * off, -0.03, fan ? 0 : Math.sin(a) * off];
        if (fan) grow(from, [Math.cos(a), 1.6, 0], 0.2 + rnd() * 0.06, 0.013, depth, 0);
        else if (finger) grow(from, [Math.cos(a) * lean * (0.3 + off * 5), 1, Math.sin(a) * lean * (0.3 + off * 5)], 0.09 + rnd() * 0.07, 0.03 + rnd() * 0.012, depth, 0);
        else grow(from, [Math.cos(a) * lean, 1, Math.sin(a) * lean], 0.13 + rnd() * 0.07, 0.016 + rnd() * 0.006, depth, 0);
      }
    }
  } else if (kind === 1) {
    const s = icosphere([3, 2, 1][lod], 0.5, [1, 1, 1]);
    const p1 = rnd() * 6, p2 = rnd() * 6, p3 = rnd() * 6;
    for (let i = 0; i < s.pos.length / 3; i++) {
      let x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
      const lump = 1 + 0.14 * Math.sin(x * 7 + p1) * Math.sin(z * 6 + p2) + 0.1 * Math.sin(y * 9 + x * 4 + p3);
      // Below its widest it draws in, so it sits on whatever is under it without a lip.
      const tuck = y > 0 ? lump : 1 + y * 1.2;
      x *= tuck; z *= tuck;
      y = y > 0 ? y * 0.72 * lump : y * 0.3;
      const sh = 0.55 + 0.45 * smooth01(-0.1, 0.3, y);
      const ny = s.nrm[i * 3 + 1] * 1.4, nl = Math.hypot(s.nrm[i * 3], ny, s.nrm[i * 3 + 2]);
      m.v(x, y, z, s.nrm[i * 3] / nl, ny / nl, s.nrm[i * 3 + 2] / nl, col[0] * sh, col[1] * sh, col[2] * sh, 0, CORAL, 1, 0);
    }
    for (let i = 0; i < s.idx.length; i++) m.idx.push(s.idx[i]);
  } else if (kind === 3) {
    // The mound a coral head grows on. One unit across the base, half a unit high.
    // It is old coral, grown and broken and overgrown, so it is knobs and hollows at every size.
    const s = icosphere([4, 3, 2][lod], 1, [1, 1, 1]);
    const o = rnd() * 40;
    const rock = [0.56, 0.42, 0.28];
    for (let i = 0; i < s.pos.length / 3; i++) {
      let x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
      const lump = 0.74 + 0.34 * vnoise(x * 1.7 + o, z * 1.7 + y * 1.3) + 0.22 * vnoise(x * 4.3 + y * 2.1 + o, z * 4.3 - y * 1.7) + 0.1 * vnoise(x * 11 + y * 5, z * 11 - y * 4 + o);
      x *= lump; z *= lump;
      y = y > 0 ? y * 0.5 * lump : y * 0.12;
      const sh = 0.5 + 0.5 * smooth01(-0.05, 0.3, y);
      m.v(x, y, z, 0, 1, 0, rock[0] * sh, rock[1] * sh, rock[2] * sh, 0, CORAL, 4, 0);
    }
    for (let i = 0; i < s.idx.length; i++) m.idx.push(s.idx[i]);
    faceNormals(m);
  } else {
    // A plate, thick at the middle where it joins a short stalk and thin at the rim.
    const na = [36, 16, 8][lod], nr = [6, 3, 2][lod];
    const R = 0.5, h = 0.2 + rnd() * 0.1, ph = rnd() * 6, ph2 = rnd() * 6, ph3 = rnd() * 6;
    coralTube(m, [[0, -0.05, 0], [0.01, h * 0.5, 0], [0, h - 0.04, 0]], 0.1, 0.17, [6, 5, 4][lod], col, 0, 0.3, 0, 0);
    for (const sg of [1, -1]) {
      const rows = [];
      for (let ir = 0; ir <= nr; ir++) {
        const row = [];
        for (let ia = 0; ia <= na; ia++) {
          const a = ia / na * 6.2832, rr = ir / nr;
          const rim = R * (0.8 + 0.13 * Math.sin(3 * a + ph) + 0.07 * Math.sin(7 * a + ph2) + 0.035 * Math.sin(13 * a + ph3));
          const wave = 0.02 * Math.sin(5 * a + ph2) * rr;
          const y = h + 0.05 * rr * rr + wave + (sg > 0 ? 0.01 : -0.012 - 0.17 * Math.pow(1 - rr, 1.3));
          const sh = sg > 0 ? 0.78 + 0.22 * rr : 0.34 + 0.2 * rr;
          const ca = Math.cos(a), sa = Math.sin(a);
          const nx = sg > 0 ? -ca * 0.1 : ca * 0.5, nz = sg > 0 ? -sa * 0.1 : sa * 0.5, ny = sg > 0 ? 1 : -0.85, nl = Math.hypot(nx, ny, nz);
          row.push(m.v(ca * rim * rr, y, sa * rim * rr, nx / nl, ny / nl, nz / nl, col[0] * sh, col[1] * sh, col[2] * sh, 0, CORAL, 2, rr));
        }
        rows.push(row);
      }
      for (let ir = 0; ir < nr; ir++) {
        for (let ia = 0; ia < na; ia++) {
          m.tri(rows[ir][ia], rows[ir + 1][ia], rows[ir][ia + 1]);
          m.tri(rows[ir][ia + 1], rows[ir + 1][ia], rows[ir + 1][ia + 1]);
        }
      }
    }
  }
  return m;
}

// A sea anemone: a squat column all but hidden under a crown of tentacles that lean with the surge.
function makeAnemone(seed, lod) {
  const rnd = seeded(seed * 71 + 3);
  const m = new Mesh();
  const base = [0.40, 0.17, 0.32], tent = [0.50, 0.38, 0.20], tip = [0.80, 0.72, 0.56];
  coralTube(m, [[0, -0.04, 0], [0, 0.005, 0], [0, 0.03, 0]], 0.12, 0.16, lod ? 6 : 12, base, 0.6, 1, 0, 0.1);
  for (let i = 0; i < m.uv.length; i += 2) m.uv[i] = 3;
  const n = lod ? 80 : 230;
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.2832, rr = Math.pow(rnd(), 0.4) * 0.17;
    const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
    const len = 0.07 + rnd() * 0.07, out = 0.25 + rr * 8, bow = (rnd() - 0.5) * 0.02;
    const first = m.pos.length / 3;
    const pts = [];
    for (let j = 0; j <= (lod ? 2 : 4); j++) {
      const t = j / (lod ? 2 : 4), d = len * 0.55 * out * t * t + bow * Math.sin(t * 3.1416);
      pts.push([ox + Math.cos(a) * d - Math.sin(a) * bow * t, 0.025 + len * t * (1 - 0.35 * t * rr * 5), oz + Math.sin(a) * d + Math.cos(a) * bow * t]);
    }
    coralTube(m, pts, 0.007, 0.005, lod ? 3 : 5, [1, 1, 1], 0, 1);
    for (let k = first; k < m.pos.length / 3; k++) {
      const t = Math.min(1, Math.max(0, (m.pos[k * 3 + 1] - 0.025) / len));
      m.col[k * 3] = tent[0] + (tip[0] - tent[0]) * t * t;
      m.col[k * 3 + 1] = tent[1] + (tip[1] - tent[1]) * t * t;
      m.col[k * 3 + 2] = tent[2] + (tip[2] - tent[2]) * t * t;
      m.sway[k] = t * t * 0.035;
      m.uv[k * 2] = 3;
    }
  }
  return m;
}

// A tuft of seagrass: ribbons from one root, each with its own lean.
function makeSeagrass(seed, lod) {
  const rnd = seeded(seed * 37 + 11);
  const m = new Mesh();
  const blades = lod ? 6 : 15, segs = lod ? 2 : 5;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * 6.2832, r0 = rnd() * 0.07;
    const h = 0.2 + rnd() * 0.3, w = (lod ? 0.014 : 0.008) + rnd() * 0.004, lean = 0.1 + rnd() * 0.35, la = rnd() * 6.2832;
    const fx = Math.cos(a), fz = Math.sin(a);
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const cx = Math.cos(a) * r0 + Math.cos(la) * lean * h * t * t, cz = Math.sin(a) * r0 + Math.sin(la) * lean * h * t * t;
      const ww = w * (1 - 0.5 * t * t * t);
      const g = 0.75 + rnd() * 0.3;
      const c = [(0.035 + 0.11 * t) * g, (0.15 + 0.2 * t) * g, (0.05 + 0.04 * t) * g];
      const l = m.v(cx - fz * ww, h * t - 0.02, cz + fx * ww, fx, 0.15, fz, c[0], c[1], c[2], t * t * 0.1, LEAF, -1, t);
      const r = m.v(cx + fz * ww, h * t - 0.02, cz - fx * ww, fx, 0.15, fz, c[0], c[1], c[2], t * t * 0.1, LEAF, 1, t);
      if (prev) { m.tri(prev[0], l, prev[1]); m.tri(prev[1], l, r); }
      prev = [l, r];
    }
  }
  return m;
}

// Tall kelp / vine: stipe + ribbon blades. Vertex sway grows with height (along-length bend
// is finished in the meshPlace underwater current path).
function makeKelp(seed, lod) {
  const rnd = seeded(seed * 91 + 19);
  const m = new Mesh();
  const blades = lod ? 2 : 4, segs = lod ? 4 : 8;
  const h = 1.4 + rnd() * 1.8;
  // Central stipe.
  const stipe = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    stipe.push([(rnd() - 0.5) * 0.02 * t, h * t - 0.04, (rnd() - 0.5) * 0.02 * t]);
  }
  coralTube(m, stipe, 0.025, 0.012, lod ? 4 : 6, [0.12, 0.28, 0.1], 0, 1, 0.18, 0.4);
  for (let k = 0; k < m.pos.length / 3; k++) {
    m.uv[k * 2] = 3;
    m.sway[k] = Math.max(m.sway[k], Math.max(0, m.pos[k * 3 + 1]) / h * 0.22);
  }
  for (let b = 0; b < blades; b++) {
    const a = b / blades * 6.2832 + rnd() * 0.4, lean = 0.15 + rnd() * 0.35;
    let prev = null;
    const bh = h * (0.55 + rnd() * 0.4), w0 = 0.04 + rnd() * 0.03;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const cx = Math.cos(a) * lean * t * t * bh * 0.15, cz = Math.sin(a) * lean * t * t * bh * 0.15;
      const ww = w0 * (1 - 0.55 * t);
      const g = 0.7 + rnd() * 0.35;
      const c = [0.04 * g, (0.22 + 0.28 * t) * g, 0.08 * g];
      const sw = t * t * 0.28;
      const fx = Math.cos(a), fz = Math.sin(a);
      const l = m.v(cx - fz * ww, bh * t - 0.02, cz + fx * ww, fx, 0.2, fz, c[0], c[1], c[2], sw, LEAF, -1, t);
      const r = m.v(cx + fz * ww, bh * t - 0.02, cz - fx * ww, fx, 0.2, fz, c[0], c[1], c[2], sw, LEAF, 1, t);
      if (prev) { m.tri(prev[0], l, prev[1]); m.tri(prev[1], l, r); }
      prev = [l, r];
    }
  }
  return m;
}

// Aged 1800s shipwreck: broken hull, ribs, deck stubs, bowsprit — partially buried via plant y offset.
// Soft coral / kelp colonise it at plant time; kind 9 reads as dark timber in the mesh shader.
function makeWreck(seed, lod) {
  const rnd = seeded(seed * 113 + 5);
  const m = new Mesh();
  const wood = [0.28, 0.2, 0.12], dark = [0.16, 0.12, 0.08], algae = [0.22, 0.32, 0.2];
  const rust = [0.34, 0.22, 0.12], encrust = [0.3, 0.36, 0.28];
  const sides = lod ? 6 : 10, rings = lod ? 5 : 9;
  // Hull shell: elongated half-tube, crushed on one side — brig / schooner silhouette.
  const grid = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, x = (u - 0.5) * 3.6;
    const row = [];
    for (let k = 0; k <= sides; k++) {
      const a = -0.15 + k / sides * (Math.PI + 0.3);
      let r = 0.55 + 0.12 * Math.sin(u * 6.28) + 0.08 * Math.sin(a * 3 + seed);
      if (u > 0.72) r *= 1 - (u - 0.72) * 2.2; // broken stern
      if (u < 0.12) r *= 0.55 + u * 4;
      const y = Math.sin(a) * r, z = -Math.cos(a) * r * (0.7 + 0.3 * (1 - Math.abs(u - 0.5)));
      const crush = u > 0.35 && u < 0.55 && a > 1.2 ? 0.55 : 1;
      const pick = rnd();
      const col = pick < 0.14 ? algae : pick < 0.22 ? encrust : pick < 0.32 ? rust : pick < 0.55 ? dark : wood;
      const sh = 0.65 + 0.35 * sat(y + 0.2);
      row.push(m.v(x, y * crush + 0.15, z, Math.sin(a), Math.cos(a) * 0.4, -Math.cos(a), col[0] * sh, col[1] * sh, col[2] * sh, 0, 9, u, a / Math.PI));
    }
    grid.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      m.tri(grid[i][k], grid[i + 1][k], grid[i][k + 1]);
      m.tri(grid[i][k + 1], grid[i + 1][k], grid[i + 1][k + 1]);
    }
  }
  // Ribs across the hold.
  const ribN = lod ? 3 : 6;
  for (let i = 0; i < ribN; i++) {
    const u = 0.18 + i / ribN * 0.55, x = (u - 0.5) * 3.2;
    coralTube(m, [[x, 0.05, -0.35], [x, 0.55, 0], [x, 0.08, 0.35]], 0.04, 0.03, lod ? 4 : 6, dark, 0, 1, 0, 0.2);
  }
  // Mast stump + broken bowsprit (near LOD only).
  if (!lod) {
    coralTube(m, [[0.1, 0.2, 0], [0.12, 1.1, 0.02], [0.08, 1.6, -0.01]], 0.07, 0.035, 6, wood, 0, 1, 0, 0.5);
    coralTube(m, [[-1.55, 0.25, 0], [-1.9, 0.55, 0.05], [-2.25, 0.35, 0.02]], 0.045, 0.02, 5, dark, 0, 1, 0, 0.35);
    // Deck beam stubs along the gunwales.
    for (let i = 0; i < 4; i++) {
      const u = 0.2 + i * 0.18, x = (u - 0.5) * 3.0;
      coralTube(m, [[x, 0.45, -0.4], [x, 0.55, 0], [x, 0.42, 0.38]], 0.03, 0.025, 4, wood, 0, 1, 0, 0.15);
    }
  }
  faceNormals(m);
  return m;
}

// Biome weight helpers for underwater planting (0..1). Zones run reef garden → wall →
// kelp shelf → mid deep → abyss. Depth gates keep life out of the wrong band.
function reefBiome(x, z, bed) {
  const crest = Math.exp(-((x - 196) * (x - 196)) / 1100 - ((z + 2) * (z + 2)) / 5200);
  const wall = Math.exp(-((x - 218) * (x - 218)) / 900 - ((z + 2) * (z + 2)) / 4800);
  const shelf = Math.exp(-((x + 120) * (x + 120)) / 7000 - ((z - 80) * (z - 80)) / 5200)
    + Math.exp(-((x - 40) * (x - 40)) / 8000 - ((z - 170) * (z - 170)) / 4200);
  const basin = Math.exp(-((x - 310) * (x - 310)) / 30000 - ((z + 190) * (z + 190)) / 26000);
  const mount = Math.exp(-((x - 340) * (x - 340)) / 2800 - ((z + 210) * (z + 210)) / 2400)
    + Math.exp(-((x - 290) * (x - 290)) / 2200 - ((z + 250) * (z + 250)) / 2000);
  const shallow = sat((-bed - 0.6) / 2.2) * sat((3.2 + bed) / 2.4);
  const garden = crest * shallow;
  const drop = wall * sat((-bed - 2.5) / 4.0);
  const kelp = sat(shelf) * sat((-bed - 1.8) / 3.5) * sat((8.5 + bed) / 4.0);
  const deep = sat((-bed - 7.0) / 6.0) * (0.35 + 0.65 * basin) * sat((16 + bed) / 8.0);
  const abyss = sat((-bed - 12.0) / 8.0) * (0.4 + 0.6 * basin + 0.5 * mount);
  return { garden: garden, wall: drop, kelp: kelp, deep: deep, abyss: abyss, crest: crest };
}

// Where the reef grows. Biome zones: shallow coral garden, reef-wall drop-off,
// kelp rocky shelf, deep basin, abyss soft coral, and 1800s wreck habitats.
// Returns fish homes + blocks + bubbles + wrecks.
function plantReef(world, scatter, q) {
  const rnd = seeded(4401);
  const forms = (f, list) => list.map((s) => scatter.proto([makeCoral(0, s, 0, f), makeCoral(0, s, 1, f), makeCoral(0, s, 2, f)], 0.5, [9, 26]));
  const branch = forms(0, [1, 2, 3]), finger = forms(1, [11, 12]), fans = forms(2, [13, 14]);
  const pillar = forms(3, [21, 22]), whip = forms(4, [23, 24, 25]);
  const dome = [4, 5, 6].map((s) => scatter.proto([makeCoral(1, s, 0), makeCoral(1, s, 1), makeCoral(1, s, 2)], 0.6, [10, 30]));
  const table = [7, 8].map((s) => scatter.proto([makeCoral(2, s, 0), makeCoral(2, s, 1), makeCoral(2, s, 2)], 0.6, [10, 30]));
  const mound = [9, 10].map((s) => scatter.proto([makeCoral(3, s, 0), makeCoral(3, s, 1), makeCoral(3, s, 2)], 1.2, [14, 40]));
  const anem = scatter.proto([makeAnemone(1, 0), makeAnemone(1, 1)], 0.25, [5]);
  const grass = [1, 2, 3].map((s) => scatter.proto([makeSeagrass(s, 0), makeSeagrass(s, 1)], 0.45, [7]));
  const kelpN = Math.max(4, Math.round((q.reef || 40) * 0.55));
  const kelp = [1, 2, 3, 4].map((s) => scatter.proto([makeKelp(s, 0), makeKelp(s, 1)], 1.1, [16, 36]));
  const wreckA = scatter.proto([makeWreck(1, 0), makeWreck(1, 1)], 3.2, [40, 90]);
  const wreckB = scatter.proto([makeWreck(7, 0), makeWreck(7, 1)], 3.4, [42, 95]);
  const heads = [], blocks = [], sand = [], bubbles = [], wrecks = [];
  const reefBudget = Math.round(q.reef * 1.15);
  for (let i = 0; i < 11000 && heads.length < reefBudget; i++) {
    const x = 20 + rnd() * 260, z = (rnd() - 0.5) * 260;
    const bed = fieldSample(world, x, z);
    if (bed > -0.85 || bed < -9.5 || fieldSlope(world, x, z) > 0.55) continue;
    const bio = reefBiome(x, z, bed);
    const chance = 0.08 + 0.75 * bio.garden + 0.55 * bio.wall + 0.25 * bio.kelp + 0.12 * bio.deep;
    if (rnd() > chance) continue;
    let ok = true;
    for (const h of heads) if (Math.hypot(h.x - x, h.z - z) < (bio.wall > 0.4 ? 4.2 : 5.5)) { ok = false; break; }
    if (!ok) continue;
    const r = 1.0 + rnd() * (bio.wall > 0.35 ? 1.2 : 1.5);
    const head = { x: x, z: z, bed: bed, r: r, top: bed + 0.4, anemone: null, branchy: false, biome: bio };
    // The mound first, no taller than the water allows; the living coral grows over it and around its foot.
    const mr = r * 0.8, mh = Math.min(0.5 * mr, -bed - 0.55), msy = mh / Math.max(0.5 * mr, 0.05), br = mr * 1.12;
    const mg = 0.75 + rnd() * 0.3;
    scatter.add(mound[(rnd() * 2) | 0], x, bed - 0.03, z, rnd() * 6.28, mr, [mg, mg, mg], msy);
    const ms = (br * br + mh * mh) / (2 * Math.max(mh, 0.05));
    blocks.push(x, bed + mh * 1.06 - ms, z, ms);
    head.top = bed + mh;
    const pieces = 12 + ((rnd() * (bio.garden > 0.4 ? 16 : 10)) | 0);
    for (let k = 0; k < pieces; k++) {
      const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * r, dn = d / Math.max(mr, 0.1);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      let pb = fieldSample(world, px, pz);
      if (dn < 0.97) pb = Math.max(pb, bed + mh * Math.sqrt(Math.max(0, 1 - dn * dn)) * 0.82 - 0.03);
      if (pb > -0.45) continue;
      const pick = rnd();
      // Nothing grows up through the surface: the shallower the bed, the smaller the piece.
      const room = Math.min(1, (-pb - 0.25) / 0.9);
      // Per-piece tint: warm/cool shift within a muted band so heads read as mixed colonies.
      const warm = rnd();
      const tint = [
        0.72 + rnd() * 0.28 + warm * 0.08,
        0.68 + rnd() * 0.26 - warm * 0.04,
        0.62 + rnd() * 0.28 - warm * 0.1
      ];
      if (bio.wall > 0.45 && pick < 0.35) {
        const sc = (0.7 + rnd() * 0.8) * room;
        scatter.add(pillar[(rnd() * 2) | 0], px, pb, pz, rnd() * 6.28, sc, tint, 1.1 + rnd() * 0.5);
        blocks.push(px, pb + 0.35 * sc, pz, 0.22 * sc);
        head.top = Math.max(head.top, pb + 0.7 * sc);
        head.branchy = true;
      } else if (pick < 0.48) {
        const sc = (0.6 + rnd() * 0.7) * room;
        let which;
        if (pick < 0.14) which = branch[(rnd() * 3) | 0];
        else if (pick < 0.26) which = finger[(rnd() * 2) | 0];
        else if (pick < 0.38) which = fans[(rnd() * 2) | 0];
        else which = whip[(rnd() * 3) | 0];
        scatter.add(which, px, pb, pz, rnd() * 6.28, sc, tint, 0.8 + rnd() * 0.4);
        blocks.push(px, pb + 0.2 * sc, pz, 0.26 * sc);
        head.top = Math.max(head.top, pb + 0.45 * sc);
        if (pick < 0.14 || pick >= 0.38) head.branchy = true;
      } else if (pick < 0.82) {
        const sc = (0.35 + rnd() * 0.75) * room;
        scatter.add(dome[(rnd() * 3) | 0], px, pb - 0.03 * sc, pz, rnd() * 6.28, sc, tint, 0.8 + rnd() * 0.5);
        blocks.push(px, pb + 0.1 * sc, pz, 0.46 * sc);
        head.top = Math.max(head.top, pb + 0.4 * sc);
      } else {
        const sc = (0.7 + rnd() * 0.9) * room;
        scatter.add(table[(rnd() * 2) | 0], px, pb, pz, rnd() * 6.28, sc, tint, 1);
        blocks.push(px, pb + 0.2 * sc, pz, 0.36 * sc);
        head.top = Math.max(head.top, pb + 0.3 * sc);
      }
    }
    if (rnd() < 0.45) {
      // On the sand at the foot of the mound, clear of it.
      const a = rnd() * 6.2832, px = x + Math.cos(a) * r * 1.08, pz = z + Math.sin(a) * r * 1.08, pb = fieldSample(world, px, pz);
      if (pb < -0.9) {
        const sc = 1 + rnd() * 0.8;
        scatter.add(anem, px, pb, pz, rnd() * 6.28, sc, [0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2], 1);
        head.anemone = [px, pb + 0.15 * sc, pz];
      }
    }
    if (rnd() < 0.2 + 0.35 * bio.garden) bubbles.push(x, Math.min(head.top + 0.15, -0.35), z);
    heads.push(head);
  }
  // Kelp forest on rocky shelves (current-driven sway via mesh sway weights).
  let kelps = 0;
  for (let i = 0; i < kelpN * 18 && kelps < kelpN; i++) {
    const x = -180 + rnd() * 220, z = -40 + rnd() * 240;
    const bed = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
    const bio = reefBiome(x, z, bed);
    if (bio.kelp < 0.18 || bed > -1.6 || bed < -7.5 || sl > 0.55) continue;
    let near = false;
    for (const h of heads) if (Math.hypot(h.x - x, h.z - z) < h.r + 1.2) { near = true; break; }
    if (near) continue;
    const sc = 0.85 + rnd() * 0.7;
    scatter.add(kelp[(rnd() * 4) | 0], x, bed, z, rnd() * 6.28, sc, [0.85 + rnd() * 0.25, 1, 0.8 + rnd() * 0.2], 1);
    blocks.push(x, bed + 0.7 * sc, z, 0.18 * sc);
    if (rnd() < 0.35) bubbles.push(x, bed + 1.1 * sc, z);
    kelps++;
  }
  // 1800s wreck habitats — partially buried hulls colonised by soft coral, whip, kelp, fish.
  const placeWreck = (proto, wx, wz, yaw, scale) => {
    const bed = fieldSample(world, wx, wz);
    if (bed > -1.0) return;
    const wy = Math.min(bed + 0.35, -1.2);
    scatter.add(proto, wx, wy - 0.55, wz, yaw, scale, [0.95, 0.9, 0.85], 1);
    blocks.push(wx, wy + 0.4, wz, 1.8 * scale);
    wrecks.push({ x: wx, y: wy, z: wz, r: 2.4 * scale });
    bubbles.push(wx - 0.6, wy + 0.2, wz, wx + 0.8, wy + 0.5, wz + 0.4, wx, wy + 1.0, wz - 0.3);
    for (let k = 0; k < 9; k++) {
      const a = rnd() * 6.28, d = 0.5 + rnd() * 1.9;
      const px = wx + Math.cos(a) * d, pz = wz + Math.sin(a) * d;
      const pb = fieldSample(world, px, pz);
      if (pb > -0.8) continue;
      const sc = 0.4 + rnd() * 0.6;
      const which = rnd() < 0.55 ? fans[(rnd() * 2) | 0] : whip[(rnd() * 3) | 0];
      scatter.add(which, px, pb, pz, rnd() * 6.28, sc, [0.75 + rnd() * 0.3, 0.7 + rnd() * 0.25, 0.65 + rnd() * 0.25], 0.85 + rnd() * 0.25);
      blocks.push(px, pb + 0.15 * sc, pz, 0.2 * sc);
    }
    for (let k = 0; k < 2; k++) {
      const a = rnd() * 6.28, d = 1.2 + rnd() * 1.4;
      const px = wx + Math.cos(a) * d, pz = wz + Math.sin(a) * d;
      const pb = fieldSample(world, px, pz);
      if (pb < -1.4 && pb > -8) scatter.add(kelp[(rnd() * 4) | 0], px, pb, pz, rnd() * 6.28, 0.8 + rnd() * 0.35, [0.85, 1, 0.85], 1);
    }
  };
  placeWreck(wreckA, 232, -45, 0.35, 1.15);
  placeWreck(wreckB, 240, 10, 1.1, 1.05);
  // Abyss soft coral on deep seamounts / basin floor — sparse whip and fans, no garden coral.
  let abyssN = 0;
  const abyssBudget = Math.max(6, Math.round((q.reef || 40) * 0.35));
  for (let i = 0; i < abyssBudget * 40 && abyssN < abyssBudget; i++) {
    const x = 240 + rnd() * 140, z = -280 + rnd() * 200;
    const bed = fieldSample(world, x, z), sl = fieldSlope(world, x, z);
    const bio = reefBiome(x, z, bed);
    if (bio.abyss < 0.2 || bed > -11 || bed < -22 || sl > 0.65) continue;
    let near = false;
    for (const h of heads) if (Math.hypot(h.x - x, h.z - z) < 6) { near = true; break; }
    for (const w of wrecks) if (Math.hypot(w.x - x, w.z - z) < 5) { near = true; break; }
    if (near) continue;
    const sc = 0.55 + rnd() * 0.7;
    const tint = [0.45 + rnd() * 0.25, 0.55 + rnd() * 0.3, 0.7 + rnd() * 0.25];
    const which = rnd() < 0.55 ? whip[(rnd() * 3) | 0] : fans[(rnd() * 2) | 0];
    scatter.add(which, x, bed, z, rnd() * 6.28, sc, tint, 0.9 + rnd() * 0.35);
    blocks.push(x, bed + 0.25 * sc, z, 0.18 * sc);
    if (rnd() < 0.4) bubbles.push(x, bed + 0.6 * sc, z);
    abyssN++;
  }
  // Seagrass in meadows on the lagoon sand, away from the coral and out of the surf.
  let tufts = 0;
  for (let i = 0; i < q.seagrass * 14 && tufts < q.seagrass; i++) {
    const x = 20 + rnd() * 180, z = (rnd() - 0.5) * 200;
    const bed = fieldSample(world, x, z);
    if (bed > -0.55 || bed < -2.6 || fieldSlope(world, x, z) > 0.3) continue;
    if (fieldDamp(world, x, z) > 0.55) continue;
    if (vnoise(x * 0.06 + 9, z * 0.06) < 0.5) { if (sand.length < 400 && bed > -1.9 && rnd() < 0.2) sand.push(x, bed, z); continue; }
    let near = false;
    for (const h of heads) if (Math.hypot(h.x - x, h.z - z) < h.r + 0.6) { near = true; break; }
    if (near) continue;
    const g = 0.8 + rnd() * 0.4;
    scatter.add(grass[(rnd() * 3) | 0], x, bed, z, rnd() * 6.28, 0.8 + rnd() * 0.7, [g, g, g * 0.9], 0.8 + rnd() * 0.5);
    tufts++;
  }
  return { heads: heads, blocks: blocks, sand: sand, bubbles: bubbles, wrecks: wrecks };
}

// ---- Behaviour.
//
// A school is the unit that knows where it is going: it holds a home, a route, an alarm.
// A fish knows its place in the school, its neighbours, the bottom, the surface, whatever
// stands in the way, and who frightens it. Near the viewer every fish is stepped every
// frame against all of its schoolmates. Further out it is stepped one frame in three and
// ignores its neighbours. Beyond sight only the school moves, and its fish are carried
// along with it when they come back into range.

function FishLife(world, reef, q, stacks) {
  this.world = world;
  const rnd = seeded(9127);
  const S = this.schools = [];
  const heads = reef.heads;
  const bedAt = (x, z) => fieldSample(world, x, z);
  // A straight swim between two places has to stay in water deep enough to swim in.
  const open = (a, b, need) => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      if (bedAt(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t) > -need) return false;
    }
    return true;
  };
  const school = (sp, n, home, r, route, linger) => {
    n = Math.max(1, Math.round(n));
    S.push({ sp: sp, n: n, first: 0, hx: home[0], hy: home[1], hz: home[2], cx: home[0], cy: home[1], cz: home[2], r: r,
      route: route, ri: 0, linger: linger || 0, wait: 0, feed: false, alarm: 0, level: 2, lx: 0, ly: 0, lz: 0,
      face: rnd() * 6.2832, ax: 0, az: 0, id: S.length, moving: false });
  };
  // A route through nearby coral heads, each leg checked for depth.
  const tour = (from, reach, stops, need, lift) => {
    const pts = [[from.x, Math.min(from.top + lift, -0.45), from.z]];
    for (let tries = 0; tries < 40 && pts.length < stops; tries++) {
      const h = heads[(rnd() * heads.length) | 0];
      const p = [h.x + (rnd() - 0.5) * h.r, Math.min(h.top + lift, -0.45), h.z + (rnd() - 0.5) * h.r];
      const last = pts[pts.length - 1];
      const d = Math.hypot(p[0] - last[0], p[2] - last[2]);
      if (d < 3 || d > reach || !open(last, p, need)) continue;
      pts.push(p);
    }
    return pts;
  };
  const f = q.fish;
  // Over the coral: chromis hover above the branching heads, anemonefish keep to their anemone,
  // butterflyfish work the heads in pairs, angelfish and parrotfish range wider.
  let k = 0;
  for (const h of heads) {
    k++;
    if (h.branchy && rnd() < 0.8 * Math.min(1, f + 0.25)) school(0, (18 + rnd() * 24) * Math.min(f + 0.2, 1.3), [h.x, Math.min(h.top + 0.45, -0.5), h.z], 0.7 + h.r * 0.45, null, 0);
    if (h.anemone) school(1, 2 + rnd() * 2.4, h.anemone, 0.3, null, 0);
    if (k % 2 === 0 && rnd() < f + 0.2) school(2, 2, [h.x, Math.min(h.top + 0.3, -0.5), h.z], 0.45, tour(h, 26, 5, 0.9, 0.3), 9);
    if (k % 4 === 1 && rnd() < f + 0.2) school(3, rnd() < 0.4 ? 2 : 1, [h.x, Math.min(h.top + 0.4, -0.6), h.z], 0.7, tour(h, 34, 5, 1.1, 0.45), 7);
    if (k % 5 === 2 && rnd() < f + 0.2) school(4, 2 + rnd() * 2, [h.x, Math.min(h.top + 0.35, -0.6), h.z], 0.9, tour(h, 30, 6, 1.2, 0.3), 11);
  }
  // On the sand: gobies, each with a patch of its own.
  for (let i = 0; i + 2 < reef.sand.length && i < 3 * 46 * f; i += 3) {
    school(5, 1, [reef.sand[i], reef.sand[i + 1] + 0.01, reef.sand[i + 2]], 1.2, null, 0);
  }
  // Through the lagoon: trevally in twos and threes. Every other stop on their round is a pass
  // close by a coral head, which is where the small fish notice them.
  for (let i = 0; i < Math.round(2 * f + 1); i++) {
    const route = [];
    for (let j = 0; j < 80 && route.length < 7; j++) {
      let p = [55 + rnd() * 130, 0, (rnd() - 0.5) * 170];
      const h = heads[(rnd() * heads.length) | 0], a = rnd() * 6.2832;
      if (h && route.length % 2) p = [h.x + Math.cos(a) * (h.r + 0.7), 0, h.z + Math.sin(a) * (h.r + 0.7)];
      const b = bedAt(p[0], p[2]);
      if (b > -1.6) continue;
      p[1] = Math.min(b + 0.9 + rnd() * 0.5, -0.8);
      if (route.length && !open(route[route.length - 1], p, 1.3)) continue;
      route.push(p);
    }
    if (route.length > 2) school(6, 2 + rnd() * 1.6, route[0], 1.1, route, 0);
  }
  // Outside the reef: fusiliers travelling along its seaward face, and trevally further out.
  const ring = (rad, n, depth, y) => {
    // Round the island, each stop a short way on from the last, so no leg cuts across land.
    const pts = [], a0 = rnd() * 6.2832;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + rnd() * 0.5) / n * 6.2832, r = rad * (0.85 + rnd() * 0.3);
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      const b = bedAt(p[0], p[2]);
      if (b > -depth) continue;
      p[1] = Math.max(y, b + 1.2);
      pts.push(p);
    }
    return pts;
  };
  for (let i = 0; i < Math.round(2 * f + 0.3); i++) {
    const pts = [];
    for (let j = 0; j < 7; j++) {
      const z = -80 + j * 27 + rnd() * 10;
      let x = 222 + rnd() * 16;
      while (bedAt(x, z) > -3.2 && x < 300) x += 4;
      pts.push([x, -1.3 - rnd() * 1.3, z]);
    }
    if (i % 2) pts.reverse();
    school(7, (60 + rnd() * 40) * Math.min(f + 0.2, 1.4), pts[0], 2.4, pts, 0);
  }
  for (let i = 0; i < Math.round(2 * f); i++) {
    const pts = ring(300, 8, 5, -2.6);
    if (pts.length > 2) school(6, 3 + rnd() * 2.5, pts[0], 2, pts, 0);
  }
  // Deep water: a single large fish, far apart.
  for (let i = 0; i < Math.round(2 * f); i++) {
    const pts = ring(420, 9, 9, -5.5);
    if (pts.length > 2) { school(6, 1, pts[0], 1, pts, 0); S[S.length - 1].big = true; }
  }
  // Green turtles graze lagoon seagrass / shallow gardens.
  for (let i = 0; i < Math.round(1 + f); i++) {
    const h = heads[(rnd() * heads.length) | 0];
    if (!h) break;
    const home = [h.x + (rnd() - 0.5) * 8, Math.min(h.top + 0.2, -0.7), h.z + (rnd() - 0.5) * 8];
    if (bedAt(home[0], home[2]) > -1.0) continue;
    school(8, 1, home, 2.2, tour(h, 40, 4, 1.0, 0.2), 14);
  }
  // Eagle rays cruise the mid shelf / wall face.
  for (let i = 0; i < Math.round(1 + 0.8 * f); i++) {
    const pts = [];
    for (let j = 0; j < 6; j++) {
      const p = [180 + rnd() * 90, -2.2 - rnd() * 2.5, -90 + rnd() * 160];
      if (bedAt(p[0], p[2]) > -2.0) continue;
      p[1] = Math.max(p[1], bedAt(p[0], p[2]) + 1.0);
      if (pts.length && !open(pts[pts.length - 1], p, 1.6)) continue;
      pts.push(p);
    }
    if (pts.length > 2) school(9, 2 + ((rnd() * 2) | 0), pts[0], 2.8, pts, 0);
  }
  // Reef blacktip patrols wreck / outer wall — feared by small fish.
  if (reef.wrecks && reef.wrecks.length) {
    const w = reef.wrecks[0];
    const route = [
      [w.x, Math.min(w.y + 1.2, -1.0), w.z],
      [w.x + 18, -2.4, w.z + 12],
      [w.x + 28, -3.2, w.z - 8],
      [w.x - 10, -2.0, w.z - 16]
    ].filter((p) => bedAt(p[0], p[2]) < -1.8);
    if (route.length > 2) school(10, 1, route[0], 2.5, route, 0);
  } else {
    const pts = ring(260, 7, 4, -2.8);
    if (pts.length > 2) school(10, 1, pts[0], 2.2, pts, 0);
  }
  if (globalThis.__wwSeedDeepSharks) globalThis.__wwSeedDeepSharks({ S: S, school: school, bedAt: bedAt, open: open, rnd: rnd, f: f, reef: reef });
  // Chromis / grazers colonising each wreck habitat.
  if (reef.wrecks) {
    for (const w of reef.wrecks) {
      school(0, (14 + rnd() * 16) * Math.min(f + 0.2, 1.3), [w.x, Math.min(w.y + 0.9, -0.6), w.z], 1.4, null, 0);
      school(2, 2, [w.x + 1.2, Math.min(w.y + 0.6, -0.55), w.z], 0.6, null, 0);
      // Extra soft-school around the deeper wreck.
      if (w.y < -3.5) school(7, (10 + rnd() * 12) * Math.min(f, 1.2), [w.x, Math.min(w.y + 1.4, -2.5), w.z], 1.8, null, 0);
    }
  }
  // Lanternfish schools in the abyss / deep midwater — biolum belly glow in fishSkin.
  for (let i = 0; i < Math.round(2 + 1.5 * f); i++) {
    const pts = [];
    for (let j = 0; j < 5; j++) {
      const p = [260 + rnd() * 100, -8 - rnd() * 6, -220 + rnd() * 160];
      const b = bedAt(p[0], p[2]);
      if (b > -10) continue;
      p[1] = Math.max(p[1], b + 1.5);
      p[1] = Math.min(p[1], -6.5);
      if (pts.length && !open(pts[pts.length - 1], p, 3.5)) continue;
      pts.push(p);
    }
    if (pts.length > 2) school(11, (28 + rnd() * 36) * Math.min(f + 0.15, 1.35), pts[0], 2.6, pts, 0);
  }
  // The rocky side: chromis and a few grazers around the submerged stacks.
  for (let i = 0; i + 3 < stacks.length; i += 4) {
    const x = stacks[i], y = stacks[i + 1], z = stacks[i + 2], r = stacks[i + 3];
    const b = bedAt(x + r * 1.6, z);
    if (b > -1.4) continue;
    const home = [x + r * 1.5, Math.min(Math.max(y, b + 0.8), -0.7), z];
    if (rnd() < 0.7) school(0, (9 + rnd() * 10) * Math.min(f, 1.2), home, 1.1, null, 0);
    else if (rnd() < 0.5) school(3, 1, home, 0.8, [home, [x - r * 1.5, home[1], z], [x, home[1], z + r * 1.6]].filter((p) => bedAt(p[0], p[2]) < -1.4), 8);
    else school(4, 2, home, 0.9, [home, [x, home[1], z - r * 1.6], [x - r * 1.5, home[1], z]].filter((p) => bedAt(p[0], p[2]) < -1.4), 10);
  }

  let N = 0;
  for (const s of S) { s.first = N; N += s.n; }
  this.n = N;
  const A = () => new Float32Array(N);
  this.px = A(); this.py = A(); this.pz = A(); this.vx = A(); this.vy = A(); this.vz = A();
  this.yaw = A(); this.pitch = A(); this.phase = A(); this.amp = A(); this.bend = A(); this.fin = A();
  this.len = A(); this.seed = A(); this.timer = A();
  for (const s of S) {
    const sp = FISH_SPECIES[s.sp];
    for (let i = s.first; i < s.first + s.n; i++) {
      const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * s.r;
      this.px[i] = s.cx + Math.cos(a) * d; this.pz[i] = s.cz + Math.sin(a) * d;
      this.py[i] = s.cy + (rnd() - 0.5) * s.r * 0.6;
      this.yaw[i] = s.face + (rnd() - 0.5);
      this.vx[i] = Math.cos(this.yaw[i]) * sp.cruise * 0.4; this.vz[i] = Math.sin(this.yaw[i]) * sp.cruise * 0.4;
      this.len[i] = (sp.len[0] + rnd() * (sp.len[1] - sp.len[0])) * (s.big ? 1.5 : 1);
      this.seed[i] = rnd();
      this.phase[i] = rnd() * 6.2832;
      this.amp[i] = 0.05;
      this.timer[i] = rnd() * 4;
    }
  }
  // Things to swim around, in a grid of two-metre cells.
  const cells = this.cells = new Map();
  const B = this.blocks = reef.blocks.concat(stacks);
  for (let i = 0; i < B.length; i += 4) {
    const r = B[i + 3] + 0.5;
    for (let gx = Math.floor((B[i] - r) / 2); gx <= Math.floor((B[i] + r) / 2); gx++) {
      for (let gz = Math.floor((B[i + 2] - r) / 2); gz <= Math.floor((B[i + 2] + r) / 2); gz++) {
        const key = gx * 4096 + gz;
        let list = cells.get(key);
        if (!list) cells.set(key, list = []);
        list.push(i);
      }
    }
  }
  this.feared = [];
  this.frame = 0;
  // Slots follow unique shape LODs (see fishMeshes / FISH_SHAPE_SLOT).
  if (!FISH_SHAPE_SLOT) fishMeshes();
  this.slots = FISH_SHAPE_SLOT._n * 3;
  this.counts = new Int32Array(this.slots);
  this.starts = new Int32Array(this.slots);
  this.slotOf = new Int8Array(N);
  this.calm = false;
}

FishLife.prototype.update = function (dt, time, ex, ey, ez) {
  if (dt <= 0) return;
  dt = Math.min(dt, 0.05);
  this.frame++;
  const S = this.schools, feared = this.feared;
  feared.length = 0;
  for (const s of S) {
    if (FISH_SPECIES[s.sp].role === 4 && s.level < 2) {
      for (let i = s.first; i < s.first + s.n; i++) feared.push(this.px[i], this.py[i], this.pz[i]);
    }
  }
  for (const s of S) {
    const sp = FISH_SPECIES[s.sp];
    // The school itself: hold station, or travel the route and linger at each stop.
    let mx = 0, my = 0, mz = 0;
    s.moving = false;
    s.feed = false;
    if (s.route && s.route.length > 1) {
      const t = s.route[s.ri];
      const dx = t[0] - s.cx, dy = t[1] - s.cy, dz = t[2] - s.cz, d = Math.hypot(dx, dy, dz);
      if (d < 0.5) {
        if (s.wait > 0) { s.wait -= dt; s.feed = true; }
        else { s.ri = (s.ri + 1) % s.route.length; s.wait = s.linger * (0.6 + 0.8 * Math.abs(Math.sin(s.id * 12.9 + s.ri * 4.1))); }
      } else {
        const v = sp.cruise * (s.alarm > 0 ? 1.5 : 0.8) * Math.min(1, d / 1.5 + 0.25) * dt / d;
        mx = dx * v; my = dy * v; mz = dz * v;
        s.moving = true;
      }
    } else {
      // A slow drift about home, so a hovering school is never parked.
      const w = time * 0.07 + s.id * 2.3;
      mx = s.hx + Math.sin(w) * s.r * 0.5 - s.cx;
      mz = s.hz + Math.cos(w * 1.31) * s.r * 0.5 - s.cz;
      my = s.hy + Math.sin(w * 0.77) * 0.12 - s.cy;
      s.face += Math.sin(time * 0.05 + s.id) * 0.02 * dt;
    }
    s.cx += mx; s.cy += my; s.cz += mz;
    const dc = Math.hypot(s.cx - ex, s.cz - ez);
    const level = dc < 24 + s.r ? 0 : dc < 52 + s.r ? 1 : 2;
    if (level === 2) {
      s.lx += mx; s.ly += my; s.lz += mz;
      s.level = 2;
      continue;
    }
    if (s.level === 2 && (s.lx || s.ly || s.lz)) {
      for (let i = s.first; i < s.first + s.n; i++) { this.px[i] += s.lx; this.py[i] += s.ly; this.pz[i] += s.lz; }
      s.lx = s.ly = s.lz = 0;
    }
    s.level = level;
    let step = dt;
    if (level === 1) {
      if ((this.frame + s.id) % 3) continue;
      step = dt * 3;
    }
    // The heading the school shares, for its fish to line up with.
    let ax = 0, az = 0;
    for (let i = s.first; i < s.first + s.n; i++) { ax += this.vx[i]; az += this.vz[i]; }
    s.ax = ax / s.n; s.az = az / s.n;
    if (sp.role === 3) for (let i = s.first; i < s.first + s.n; i++) this.stepBottom(i, s, sp, step, time, ex, ey, ez);
    else for (let i = s.first; i < s.first + s.n; i++) this.stepFish(i, s, sp, step, time, level, ex, ey, ez);
    s.alarm = Math.max(0, s.alarm - step);
  }
};

FishLife.prototype.stepFish = function (i, s, sp, dt, time, level, ex, ey, ez) {
  const world = this.world, px = this.px, py = this.py, pz = this.pz;
  const L = this.len[i], sd = this.seed[i];
  let x = px[i], y = py[i], z = pz[i], ux = this.vx[i], uy = this.vy[i], uz = this.vz[i];
  const spd = Math.hypot(ux, uy, uz) + 1e-5;
  const hs = Math.hypot(ux, uz) + 1e-5, hx = ux / hs, hz = uz / hs;
  const a0 = sp.cruise * 3 + 0.3;
  const alarmed = s.alarm > 0;
  let ax = 0, ay = 0, az = 0;

  // Its place in the school wanders, so the group never holds a formation.
  const R = s.r * (alarmed ? 0.5 : 1) * (s.feed ? 0.6 : 1);
  const w = time * (0.09 + 0.16 * sd) + sd * 50;
  const rr = 0.3 + 0.7 * ((sd * 7.77) % 1);
  let tx = s.cx + Math.sin(w + sd * 40) * R * rr;
  let ty = s.cy + Math.sin(w * 1.37 + sd * 17) * R * 0.4 * rr;
  let tz = s.cz + Math.cos(w * 0.71 + sd * 29) * R * rr;
  if (sp.role === 1 && alarmed) ty -= 0.08;
  if (s.feed && sp.graze) ty -= 0.3 * sp.graze;
  const dx = tx - x, dy = ty - y, dz = tz - z, dd = Math.hypot(dx, dy, dz) + 1e-5;
  const pull = sp.coh * Math.min(dd / Math.max(R, 0.25), 3) * a0 / dd;
  ax += dx * pull; ay += dy * pull; az += dz * pull;

  if (level === 0 && s.n > 1) {
    // Keep a body length or so from every schoolmate, and turn with the school.
    const sep = sp.sep * (alarmed ? 0.7 : 1), sep2 = sep * sep;
    for (let j = s.first; j < s.first + s.n; j++) {
      if (j === i) continue;
      const qx = x - px[j], qy = y - py[j], qz = z - pz[j], d2 = qx * qx + qy * qy + qz * qz;
      if (d2 < sep2 && d2 > 1e-8) {
        const d = Math.sqrt(d2), k = (1 - d / sep) * a0 * 5 / d;
        ax += qx * k; ay += qy * k; az += qz * k;
      }
    }
    const al = sp.ali * (alarmed ? 2.5 : 1) * 2;
    ax += (s.ax - ux) * al; az += (s.az - uz) * al;
  }

  // Its own mind: a restless sideways urge that differs for every fish.
  const wn = Math.sin(time * (0.7 + sd * 1.3) + sd * 90) + 0.6 * Math.sin(time * (1.9 + sd) + sd * 33);
  ax += -hz * wn * sp.wander * a0; az += hx * wn * sp.wander * a0;
  ay += Math.sin(time * (0.5 + sd) + sd * 12) * sp.wander * a0 * 0.25;

  // The bottom ahead and the surface above. Schools may loosen the ceiling for a wreck emerge.
  const look = 0.25 + spd * 0.9;
  const bedH = fieldSample(world, x, z), bedA = fieldSample(world, x + hx * look, z + hz * look);
  const clear = sp.clear + L * 0.45;
  const topClear = s.top_ != null ? s.top_ : sp.top_;
  const floor = Math.max(bedH, bedA) + clear, ceil = -(topClear + L * 0.35);
  if (ceil - floor < L * 0.6) {
    // Too shallow to swim in. Home is where the water was deep enough.
    const bx = s.hx - x, bz = s.hz - z, bl = Math.hypot(bx, bz) + 1e-5;
    ax += bx / bl * a0 * 6; az += bz / bl * a0 * 6;
  }
  if (y < floor) ay += (floor - y) * 16;
  if (y > ceil) ay -= (y - ceil) * 16;

  if (level === 0) {
    const list = this.cells.get(Math.floor(x / 2) * 4096 + Math.floor(z / 2));
    if (list) {
      const B = this.blocks, margin = 0.1 + L * 0.7;
      for (let k = 0; k < list.length; k++) {
        const o = list[k];
        const qx = x - B[o], qy = y - B[o + 1], qz = z - B[o + 2], d = Math.hypot(qx, qy, qz) + 1e-5, gap = d - B[o + 3];
        if (gap < margin) {
          const push = (1 - Math.max(gap, 0) / margin) * a0 * 7 / d;
          ax += qx * push; ay += qy * push; az += qz * push;
          if (gap < 0) { x -= qx / d * gap; y -= qy / d * gap; z -= qz / d * gap; }
        }
      }
    }
    // The viewer, when in the water with them, and the larger fish.
    if (!this.calm && ey < 0.5) {
      const qx = x - ex, qy = y - ey, qz = z - ez, d = Math.hypot(qx, qy, qz) + 1e-5;
      if (d < sp.shy) {
        const k = 1 - d / sp.shy;
        if (sp.role === 1) { s.alarm = Math.max(s.alarm, 1); }
        else { ax += qx / d * k * a0 * 6; ay += qy / d * k * a0 * 2; az += qz / d * k * a0 * 6; }
        if (k > 0.4) s.alarm = Math.max(s.alarm, 0.9);
      }
    }
    if (sp.prey) {
      const F = this.feared;
      for (let k = 0; k < F.length; k += 3) {
        const qx = x - F[k], qy = y - F[k + 1], qz = z - F[k + 2], d2 = qx * qx + qy * qy + qz * qz;
        if (d2 < 6.5) {
          const d = Math.sqrt(d2) + 1e-5, f = 1 - d / 2.55;
          ax += qx / d * f * a0 * 7; ay += (qy / d * f - 0.2 * f) * a0 * 3; az += qz / d * f * a0 * 7;
          s.alarm = Math.max(s.alarm, 1.6);
        }
      }
    }
  }

  // How fast it wants to go: a burst and a glide for the small ones, steady for the large.
  let want = sp.cruise * (s.moving ? 1 : sp.idle);
  if (L < 0.2) want *= 0.5 + 1.1 * Math.pow(Math.max(0, Math.sin(time * (1.3 + sd * 2.1) + sd * 77)), 2);
  if (dd > R * 1.3) want = Math.max(want, Math.min(sp.burst * 0.6, sp.cruise * (0.6 + dd / Math.max(R, 0.3))));
  if (alarmed) want = Math.max(want, sp.burst * 0.55);
  if (s.feed && sp.graze) want *= 0.5;
  ax += ux / spd * (want - spd) * 3; az += uz / spd * (want - spd) * 3;

  ux += ax * dt; uy += ay * dt; uz += az * dt;
  uy *= Math.exp(-dt * 2);
  const ns = Math.hypot(ux, uy, uz);
  if (ns > sp.burst) { ux *= sp.burst / ns; uy *= sp.burst / ns; uz *= sp.burst / ns; }
  x += ux * dt; y += uy * dt; z += uz * dt;
  const bedN = fieldSample(world, x, z);
  if (y < bedN + clear * 0.6) { y = bedN + clear * 0.6; if (uy < 0) uy = 0; }
  if (y > ceil + 0.06) { y = ceil + 0.06; if (uy > 0) uy = 0; }
  px[i] = x; py[i] = y; pz[i] = z; this.vx[i] = ux; this.vy[i] = uy; this.vz[i] = uz;

  // The body follows the path: it turns no faster than it can, bends into the turn,
  // beats faster the faster it goes, and stops beating to glide.
  const nh = Math.hypot(ux, uz);
  let yawT = this.yaw[i];
  if (nh > sp.cruise * 0.3) yawT = Math.atan2(uz, ux);
  else if (sp.role === 0) yawT = s.face + (sd - 0.5) * 1.1;
  let turn = yawT - this.yaw[i];
  turn -= Math.round(turn / 6.2832) * 6.2832;
  const lim = sp.turn * dt;
  const stepA = Math.max(-lim, Math.min(lim, turn * Math.min(1, dt * 7)));
  this.yaw[i] += stepA;
  const k5 = Math.min(1, dt * 5);
  this.bend[i] += (Math.max(-0.55, Math.min(0.55, stepA / dt * 0.14)) - this.bend[i]) * k5;
  let pitchT = Math.max(-0.45, Math.min(0.45, Math.atan2(uy, nh + 0.12)));
  if (s.feed && sp.graze && dd < R * 1.5) pitchT = -sp.graze + Math.sin(time * 5 + sd * 30) * 0.1;
  this.pitch[i] += (pitchT - this.pitch[i]) * Math.min(1, dt * 4);
  const beat = Math.max(1.1, Math.min(11, ns / (0.62 * L)));
  this.phase[i] = (this.phase[i] + 6.2832 * beat * dt) % 6283.2;
  const gliding = want < ns - 0.03;
  const ampT = (gliding ? 0.02 : 0.04 + 0.08 * Math.min(1, ns / (sp.cruise * 1.4))) * sp.wag;
  this.amp[i] += (ampT - this.amp[i]) * Math.min(1, dt * 6);
  this.fin[i] += ((1 - Math.min(1, ns / sp.cruise) * 0.75) * sp.scull - this.fin[i]) * k5;
};

// A goby rests on the sand, propped on its fins, and moves in short darts.
FishLife.prototype.stepBottom = function (i, s, sp, dt, time, ex, ey, ez) {
  const world = this.world, L = this.len[i], sd = this.seed[i];
  let x = this.px[i], z = this.pz[i], ux = this.vx[i], uz = this.vz[i];
  this.timer[i] -= dt;
  const qx = x - ex, qz = z - ez, dcam = Math.hypot(qx, this.py[i] - ey, qz);
  const startled = !this.calm && ey < 0.5 && dcam < sp.shy;
  const spd = Math.hypot(ux, uz);
  if ((this.timer[i] < 0 || startled) && spd < 0.02) {
    let a = Math.sin(time * 1.7 + sd * 99) * 3.2 + sd * 6.2832;
    const bx = s.hx - x, bz = s.hz - z;
    if (startled) a = Math.atan2(qz, qx) + (sd - 0.5);
    else if (Math.hypot(bx, bz) > s.r) a = Math.atan2(bz, bx);
    const v = sp.burst * (startled ? 1 : 0.45 + 0.4 * sd);
    ux = Math.cos(a) * v; uz = Math.sin(a) * v;
    this.timer[i] = 2 + 7 * ((sd * 13.7 + time * 0.13) % 1);
  }
  const drag = Math.exp(-dt * 5);
  ux *= drag; uz *= drag;
  const nx = x + ux * dt, nz = z + uz * dt, nb = fieldSample(world, nx, nz);
  if (nb < -0.3 && nb > -4) { x = nx; z = nz; } else { ux = 0; uz = 0; }
  const bed = fieldSample(world, x, z);
  this.px[i] = x; this.pz[i] = z; this.py[i] = bed + L * 0.075;
  this.vx[i] = ux; this.vz[i] = uz;
  const ns = Math.hypot(ux, uz);
  if (ns > 0.04) {
    let turn = Math.atan2(uz, ux) - this.yaw[i];
    turn -= Math.round(turn / 6.2832) * 6.2832;
    this.yaw[i] += turn * Math.min(1, dt * 14);
  }
  this.pitch[i] += ((ns > 0.05 ? 0 : 0.14) - this.pitch[i]) * Math.min(1, dt * 5);
  this.phase[i] += 6.2832 * Math.max(1.5, ns / (0.5 * L)) * dt * (ns > 0.03 ? 1 : 0.15);
  this.amp[i] += ((ns > 0.05 ? 0.1 : 0.012) - this.amp[i]) * Math.min(1, dt * 8);
  this.bend[i] *= Math.exp(-dt * 4);
  this.fin[i] = 0.25;
};

// Cull, pick a level of detail and group by mesh, like the plants. Returns the draws.
FishLife.prototype.collect = function (out, vp, ex, ey, ez, reach, ranges) {
  const counts = this.counts, starts = this.starts, slotOf = this.slotOf;
  counts.fill(0);
  slotOf.fill(-1);
  for (const s of this.schools) {
    if (s.level === 2) continue;
    for (let i = s.first; i < s.first + s.n; i++) {
      const x = this.px[i], y = this.py[i], z = this.pz[i], L = this.len[i];
      const dist = Math.hypot(x - ex, y - ey, z - ez);
      if (dist > reach || L < dist * 0.0012) continue;
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cv = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      if (cw < -L || Math.abs(cx) > cw + L * 2 || Math.abs(cv) > cw + L * 2) continue;
      const shape = FISH_SHAPE_SLOT[s.sp];
      const slot = shape * 3 + (L > dist * 0.045 ? 0 : L > dist * 0.011 ? 1 : 2);
      slotOf[i] = slot;
      counts[slot]++;
    }
  }
  let run = 0;
  const draws = this._draws || (this._draws = []);
  draws.length = 0;
  for (let k = 0; k < counts.length; k++) {
    starts[k] = run;
    if (counts[k]) { const g = ranges[k]; draws.push(g.first, g.count, g.base, run, counts[k]); }
    run += counts[k];
  }
  for (const s of this.schools) {
    if (s.level === 2) continue;
    for (let i = s.first; i < s.first + s.n; i++) {
      const k = slotOf[i];
      if (k < 0) continue;
      const t = starts[k]++ * 12;
      out[t] = this.px[i]; out[t + 1] = this.py[i]; out[t + 2] = this.pz[i]; out[t + 3] = this.yaw[i];
      out[t + 4] = this.len[i]; out[t + 5] = this.pitch[i]; out[t + 6] = this.phase[i]; out[t + 7] = this.amp[i];
      out[t + 8] = this.bend[i]; out[t + 9] = s.sp; out[t + 10] = this.seed[i]; out[t + 11] = this.fin[i];
    }
  }
  draws.end = run;
  return draws;
};

// The first fish of a species, for a camera that wants to look at one.
FishLife.prototype.find = function (sp, nth) {
  let seen = 0;
  for (const s of this.schools) if (s.sp === sp && seen++ === (nth || 0)) return s;
  return null;
};

function fishMeshes() {
  // Pack one LOD trio per unique shape; shapeOf twins share the same slot.
  const list = [];
  const slotOf = new Int32Array(FISH_SPECIES.length);
  const seen = new Map();
  for (let i = 0; i < FISH_SPECIES.length; i++) {
    const src = fishShapeSrc(i);
    if (!seen.has(src)) {
      seen.set(src, list.length / 3);
      for (let lod = 0; lod < 3; lod++) list.push(makeFish(FISH_SPECIES[src], lod));
    }
    slotOf[i] = seen.get(src);
  }
  FISH_SHAPE_SLOT = slotOf;
  FISH_SHAPE_SLOT._n = seen.size;
  return list;
}

// ---- Shading and swimming. An instance is: position and heading; length, pitch, tail-beat
// phase and amplitude; bend into the turn, species, a number of its own, fin sculling.
const FISH_WGSL = `
struct FishV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
  @location(3) kind: f32,
  @location(4) uv: vec2<f32>,
  @location(5) @interpolate(flat) who: vec3<f32>,
}
struct FishAt { p: vec3<f32>, n: vec3<f32> }
fn fishPlace(in: MeshIn) -> FishAt {
  var p = in.p;
  var n = in.n.xyz;
  let s = 0.5 - p.x;
  let seed = in.i2.z;
  // Paired fins scull, each fish to its own time.
  if (in.c.w > 0.0) {
    let ft = F.time * (4.0 + 5.0 * fract(seed * 7.3)) + seed * 40.0;
    let open = in.c.w * (0.035 + 0.05 * in.i2.w * (0.6 + 0.4 * sin(ft)));
    p.z += sign(p.z) * open;
    p.y += in.c.w * 0.03 * in.i2.w * cos(ft);
    p.x += in.c.w * 0.02 * in.i2.w * sin(ft);
  }
  // A wave runs from the head to the tail, growing as it goes. A turn bends the whole body.
  let amp = in.i1.w;
  let k = select(5.6, 4.2, i32(in.i2.y + 0.5) >= 12);
  let ang = k * s - in.i1.z;
  let env = amp * (0.1 + 0.9 * s * s);
  let lat = env * sin(ang) + in.i2.x * s * s * 0.4;
  let slope = amp * 1.8 * s * sin(ang) + env * k * cos(ang) + in.i2.x * 0.8 * s;
  p.z += lat;
  n = normalize(vec3<f32>(n.x + slope * n.z, n.y, n.z));
  p *= in.i1.x;
  let sp = sin(in.i1.y); let cp = cos(in.i1.y);
  p = vec3<f32>(p.x * cp - p.y * sp, p.x * sp + p.y * cp, p.z);
  n = vec3<f32>(n.x * cp - n.y * sp, n.x * sp + n.y * cp, n.z);
  let sy = sin(in.i0.w); let cy = cos(in.i0.w);
  var o: FishAt;
  o.p = vec3<f32>(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy) + in.i0.xyz;
  o.n = vec3<f32>(n.x * cy - n.z * sy, n.y, n.x * sy + n.z * cy);
  return o;
}
@vertex fn vsFish(in: MeshIn) -> FishV {
  let at = fishPlace(in);
  var o: FishV;
  o.world = at.p;
  o.nrm = at.n;
  o.col = in.c.rgb;
  o.kind = in.n.w;
  o.uv = in.uv;
  o.who = vec3<f32>(in.i2.y, in.i2.z, in.i1.x);
  o.clip = F.viewProj * vec4<f32>(at.p, 1.0);
  return o;
}
@vertex fn vsShadowFish(in: MeshIn) -> ShadowV {
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(fishPlace(in).p, 1.0);
  return o;
}

// Colour of the flank at u along the body (0 snout, 1 tail stalk) and v up it (-1 belly, 1 back).
// rgb, and in a how much of a mirror the scales are.
fn fishSkin(sp: i32, u: f32, v: f32, seed: f32) -> vec4<f32> {
  let back = smoothstep(0.1, 0.95, v);
  let belly = smoothstep(-0.1, -0.9, v);
  var c = vec3<f32>(0.5);
  var silver = 0.0;
  if (sp == 0) {
    c = mix(vec3<f32>(0.14, 0.46, 0.50), vec3<f32>(0.05, 0.22, 0.32), back);
    c = mix(c, vec3<f32>(0.60, 0.72, 0.60), belly);
    c = mix(c, vec3<f32>(0.03, 0.08, 0.10), smoothstep(0.9, 1.0, u) * 0.6);
    silver = 0.3;
  } else if (sp == 1) {
    c = mix(vec3<f32>(0.66, 0.19, 0.03), vec3<f32>(0.24, 0.045, 0.02), smoothstep(-0.3, 0.9, v) * smoothstep(0.3, 0.85, u));
    c = mix(c, vec3<f32>(0.78, 0.36, 0.07), belly * 0.55);
    let bar = abs(u - 0.275 - v * v * 0.035);
    c = mix(c, vec3<f32>(0.03, 0.012, 0.01), smoothstep(0.062, 0.045, bar) * 0.8);
    c = mix(c, vec3<f32>(0.84, 0.86, 0.82), smoothstep(0.04, 0.028, bar));
    c = mix(c, vec3<f32>(0.80, 0.66, 0.36), smoothstep(0.9, 0.99, u) * 0.7);
  } else if (sp == 2) {
    c = mix(vec3<f32>(0.84, 0.82, 0.68), vec3<f32>(0.86, 0.62, 0.07), smoothstep(0.5, 0.9, u + back * 0.3));
    let ln = abs(fract((u - v * 0.3) * 13.0) - 0.5);
    c = mix(c, c * 0.5, smoothstep(0.13, 0.05, ln) * smoothstep(0.2, 0.32, u) * smoothstep(0.95, 0.8, u) * 0.55);
    c = mix(c, vec3<f32>(0.025, 0.025, 0.03), smoothstep(0.042, 0.028, abs(u - 0.125 + v * 0.015)));
    let d = length(vec2<f32>(u - 0.76, (v - 0.6) * 0.3));
    c = mix(c, vec3<f32>(0.9, 0.9, 0.84), smoothstep(0.1, 0.085, d));
    c = mix(c, vec3<f32>(0.025), smoothstep(0.075, 0.062, d));
  } else if (sp == 3) {
    c = mix(vec3<f32>(0.40, 0.31, 0.05), vec3<f32>(0.025, 0.06, 0.22), smoothstep(0.18, 0.55, u));
    let ln = abs(fract((u + v * v * 0.09) * 8.0) - 0.5);
    c = mix(c, vec3<f32>(0.42, 0.58, 0.74), smoothstep(0.1, 0.045, ln) * smoothstep(0.3, 0.42, u) * 0.85);
    c = mix(c, vec3<f32>(0.08, 0.13, 0.36), smoothstep(0.2, 0.08, u));
    c = mix(c, vec3<f32>(0.6, 0.66, 0.7), smoothstep(0.05, 0.0, u) * 0.6);
  } else if (sp == 4) {
    c = mix(vec3<f32>(0.05, 0.40, 0.38), vec3<f32>(0.035, 0.25, 0.33), back);
    c = mix(c, vec3<f32>(0.70, 0.40, 0.33), belly * 0.5);
    c = mix(c, vec3<f32>(0.74, 0.36, 0.28), smoothstep(0.07, 0.03, abs(v + 0.02 - u * 0.55)) * smoothstep(0.34, 0.12, u) * 0.85);
    silver = 0.08;
  } else if (sp == 5) {
    let fleck = n2(vec2<f32>(u * 30.0 + seed * 9.0, v * 8.0));
    c = mix(vec3<f32>(0.60, 0.53, 0.40), vec3<f32>(0.32, 0.25, 0.16), smoothstep(0.5, 0.75, fleck));
    c = mix(c, vec3<f32>(0.28, 0.21, 0.13), smoothstep(0.3, 0.9, sin(u * 24.0 + seed * 6.0)) * back * 0.55);
    c = mix(c, vec3<f32>(0.74, 0.69, 0.58), belly * 0.7);
  } else if (sp == 6) {
    c = mix(vec3<f32>(0.60, 0.64, 0.66), vec3<f32>(0.13, 0.21, 0.26), smoothstep(0.3, 0.95, v));
    c = mix(c, vec3<f32>(0.80, 0.81, 0.78), belly);
    c = mix(c, vec3<f32>(0.04), smoothstep(0.03, 0.018, length(vec2<f32>(u - 0.24, (v - 0.3) * 0.16))) * 0.8);
    silver = 0.8;
  } else if (sp == 7) {
    c = mix(vec3<f32>(0.62, 0.72, 0.78), vec3<f32>(0.14, 0.34, 0.56), smoothstep(-0.05, 0.3, v));
    c = mix(c, vec3<f32>(0.82, 0.66, 0.09), smoothstep(0.14, 0.07, abs(v - 0.44 + u * 0.08)) * smoothstep(0.12, 0.2, u));
    c = mix(c, vec3<f32>(0.07, 0.19, 0.40), smoothstep(0.66, 0.92, v));
    c = mix(c, vec3<f32>(0.84, 0.85, 0.83), belly);
    silver = 0.55;
  } else if (sp == 8) {
    // Green turtle — olive carapace, pale plastron.
    c = mix(vec3<f32>(0.42, 0.48, 0.22), vec3<f32>(0.18, 0.28, 0.14), back);
    c = mix(c, vec3<f32>(0.72, 0.68, 0.48), belly);
    let scute = abs(fract((u + v * 0.2) * 6.0) - 0.5);
    c = mix(c, c * 0.72, smoothstep(0.12, 0.04, scute) * back * 0.55);
  } else if (sp == 9) {
    // Spotted eagle ray — dark dorsum with pale spots.
    c = mix(vec3<f32>(0.22, 0.18, 0.16), vec3<f32>(0.08, 0.07, 0.08), back);
    c = mix(c, vec3<f32>(0.78, 0.74, 0.68), belly);
    let spot = n2(vec2<f32>(u * 18.0 + seed * 4.0, v * 10.0));
    c = mix(c, vec3<f32>(0.72, 0.68, 0.58), smoothstep(0.62, 0.78, spot) * back * 0.85);
  } else if (sp == 10) {
    // Reef blacktip — grey countershade, dark fin tips.
    c = mix(vec3<f32>(0.55, 0.58, 0.60), vec3<f32>(0.22, 0.24, 0.28), back);
    c = mix(c, vec3<f32>(0.82, 0.82, 0.80), belly);
    c = mix(c, vec3<f32>(0.05), smoothstep(0.82, 0.95, u) * 0.7);
    silver = 0.35;
  } else if (sp == 11) {
    // Lanternfish — dark midwater body; silver rides high so photophore glow reads in fsFish.
    c = mix(vec3<f32>(0.08, 0.12, 0.18), vec3<f32>(0.03, 0.05, 0.09), back);
    c = mix(c, vec3<f32>(0.18, 0.28, 0.32), belly * 0.55);
    let row = smoothstep(0.05, 0.02, abs(v + 0.55 - u * 0.08));
    c = mix(c, vec3<f32>(0.25, 0.85, 0.95), row * belly * 0.85);
    silver = 0.15 + 0.55 * row;
  } else {
    c = mix(vec3<f32>(0.32, 0.25, 0.19), vec3<f32>(0.13, 0.1, 0.08), back);
    c = mix(c, vec3<f32>(0.5, 0.44, 0.38), belly);
    silver = 0.06;
  }
  return vec4<f32>(c, silver);
}

@fragment fn fsFish(in: FishV) -> @location(0) vec4<f32> {
  let lit = sunShadow(in.world) * cloudShade(in.world.xz, in.world.y);
  if (F.clipBelow > 0.5) { discard; }
  let kind = i32(in.kind + 0.5);
  let sp = i32(in.who.x + 0.5);
  let seed = in.who.y;
  let V = normalize(F.camPos - in.world);
  let dist = length(F.camPos - in.world);
  let pix = dist * F.tanHalf * 2.0 / max(F.res.y, 1.0);
  var n = normalize(in.nrm);
  var alb = vec3<f32>(0.5);
  var silver = 0.0;
  var shine = 0.25;
  var through = 0.0;
  if (kind == 5) {
    let u = in.uv.x;
    let v = in.uv.y;
    let skin = fishSkin(sp, u, v, seed);
    alb = skin.rgb * (0.88 + 0.24 * fract(seed * 5.3));
    silver = skin.a;
    // Scales: rows of overlapping plates, each catching the light at its own tilt. Parrotfish
    // scales are large enough to count; the others only show close up.
    let counts = array<f32, 12>(46., 40., 58., 62., 17., 70., 90., 60., 22., 28., 70., 52.);
    let nu = counts[min(sp, 11)];
    let cell = vec2<f32>(u * nu, v * nu * 0.34);
    let row = floor(cell.y);
    let q = vec2<f32>(fract(cell.x + 0.5 * (row - 2.0 * floor(row * 0.5))), fract(cell.y));
    let body = smoothstep(0.2, 0.3, u) * smoothstep(1.0, 0.94, u);
    let show = body * sat(in.who.z / nu / max(pix, 1e-5) * 0.35 - 0.7);
    let edge = smoothstep(0.34, 0.56, length(q - vec2<f32>(0.28, 0.5)));
    alb *= 1.0 - 0.17 * edge * show;
    if (sp == 4) { alb = mix(alb, vec3<f32>(0.62, 0.40, 0.36), edge * show * 0.3); }
    let along = normalize(cross(n, vec3<f32>(0.0, 1.0, 0.0)) + vec3<f32>(1e-4, 0.0, 0.0));
    n = normalize(n + along * (q.x - 0.4) * 0.32 * show + vec3<f32>(0.0, (q.y - 0.5) * 0.2 * show, 0.0));
    // The head is smooth skin and bone: a gill cover with a dark edge, a mouth, a line along the flank.
    let gill = abs(u - 0.2 - (1.0 - v * v) * 0.045);
    alb *= 1.0 - 0.4 * smoothstep(0.014, 0.004, gill) * smoothstep(0.95, 0.6, abs(v));
    alb *= 1.0 - 0.4 * smoothstep(0.02, 0.006, abs(v + 0.12 + u * 1.5)) * smoothstep(0.055, 0.025, u);
    alb *= 1.0 - 0.12 * smoothstep(0.03, 0.01, abs(v - 0.22 + (u - 0.5) * 0.1)) * body;
    shine = 0.3 + 0.9 * silver;
    let hue = 0.5 + 0.5 * cos(6.2831853 * (dot(n, V) * 1.3 + q.x * 0.1 * show) + vec3<f32>(0.0, 2.1, 4.2));
    let irid = array<f32, 12>(0.3, 0.04, 0.05, 0.1, 0.22, 0., 0.12, 0.22, 0.02, 0.05, 0.18, 0.08);
    alb = mix(alb, alb * (0.6 + 0.8 * hue), irid[min(sp, 11)]);
  } else if (kind == 6) {
    if (dot(n, V) < 0.0) { n = -n; }
    alb = in.col * (0.9 + 0.2 * fract(seed * 5.3));
    // Rays with thin membrane between them. The membrane lets light and the water behind through.
    let clear = in.uv.x > 1.5;
    let fu = in.uv.x - select(0.0, 2.0, clear);
    let ray = smoothstep(0.2, 0.08, abs(fract(fu * 21.0) - 0.5));
    alb *= 0.86 + 0.2 * ray;
    through = (1.0 - ray * 0.5) * (0.35 + 0.45 * in.uv.y);
    if (clear) {
      // The fins a fish rows with are clear film on fine rays: mostly you see through them.
      let keep = mix(0.08, 0.42, ray) * (1.0 - 0.3 * in.uv.y);
      if (hash22(floor(in.clip.xy)).x > keep) { discard; }
      alb *= 0.8;
      through = 0.6;
    }
    shine = 0.1;
  } else {
    // An eye: dark pupil, a bright iris ring, a wet highlight.
    let r = in.uv.x;
    let iris = array<vec3<f32>, 12>(vec3<f32>(0.55, 0.60, 0.50), vec3<f32>(0.50, 0.24, 0.08), vec3<f32>(0.06, 0.05, 0.04), vec3<f32>(0.55, 0.42, 0.12),
      vec3<f32>(0.62, 0.42, 0.20), vec3<f32>(0.45, 0.38, 0.22), vec3<f32>(0.62, 0.62, 0.56), vec3<f32>(0.60, 0.58, 0.45),
      vec3<f32>(0.35, 0.42, 0.22), vec3<f32>(0.55, 0.48, 0.30), vec3<f32>(0.50, 0.52, 0.48), vec3<f32>(0.35, 0.55, 0.62));
    // A wide pupil, a thin bright ring round it, and an iris the colour of the head it is set in.
    alb = mix(vec3<f32>(0.012), iris[min(sp, 11)] * 0.4, smoothstep(0.6, 0.7, r));
    alb += iris[min(sp, 11)] * 0.35 * smoothstep(0.1, 0.0, abs(r - 0.72));
    alb *= 1.0 - 0.5 * smoothstep(0.86, 1.0, r);
    shine = 2.2;
  }
  // Light under water: the sun loses its red on the way down, the ripples gather it into
  // moving lines, and the rest comes from the bright water above and the pale sand below.
  let depth = max(-in.world.y, 0.0);
  let absorb = exp(-depth * vec3<f32>(0.19, 0.06, 0.05));
  var tint = vec3<f32>(1.0);
  if (F.under > 0.5) { tint = vec3<f32>(0.8, 0.92, 0.94); }
  let sun = F.sunCol * lit * absorb * tint;
  let nl = dot(n, F.sunDir);
  let ripple = caustic(in.world, length(F.camPos - in.world) * 0.0012).y * 2.2 * smoothstep(-0.3, 0.5, n.y);
  let hemi = n.y * 0.5 + 0.5;
  let above = in.world.y - sampleField(in.world.xz).x;
  let amb = (F.amb.rgb * 0.7 * mix(0.3, 1.0, hemi)
    + vec3<f32>(0.42, 0.40, 0.30) * (1.0 - hemi) * 0.5 * exp(-max(above, 0.0) * 0.6)) * absorb * tint
    + waterFill(depth) * (0.7 + 0.3 * hemi);
  var col = alb * (sun * (max(nl, 0.0) * 1.2 + ripple) + amb);
  col += alb * sun * max(-nl, 0.0) * through * 1.4;
  let H = normalize(V + F.sunDir);
  let ndv = max(dot(n, V), 0.0);
  let fr = pow(sat(1.0 - ndv), 3.0);
  // Silver flanks mirror the water around them, which is what hides the fish in open water.
  let R = reflect(-V, n);
  let env = mix(vec3<f32>(0.012, 0.085, 0.11), vec3<f32>(0.20, 0.50, 0.55), sat(R.y * 0.65 + 0.45)) * absorb * (0.5 + 0.5 * lit);
  col = mix(col, env * (0.75 + 0.5 * alb), silver * (0.3 + 0.7 * fr));
  col += sun * pow(max(dot(n, H), 0.0), mix(28.0, 150.0, silver)) * step(0.0, nl) * shine * 0.5;
  col = mix(col, waterHaze(-V.y) * 0.8 + col * 0.4, through * 0.55);
  // Lanternfish photophores — self-lit belly row, only meaningful deeper than the reef.
  if (sp == 11 && kind == 5) {
    let photo = smoothstep(0.05, 0.015, abs(in.uv.y + 0.55 - in.uv.x * 0.08)) * sat((-in.world.y - 6.0) / 5.0);
    let pulse = 0.65 + 0.35 * sin(F.time * 2.4 + seed * 17.0 + in.world.x * 0.3);
    col += vec3<f32>(0.12, 0.55, 0.72) * photo * pulse * (0.45 + 0.55 * underK());
  }
  // Seen through water, red goes first and everything drifts toward the colour of the water.
  if (F.under > 0.5) { col *= exp(-dist * vec3<f32>(0.11, 0.02, 0.012)); }
  return vec4<f32>(applyFog(col, in.world), 1.0);
}
`;
