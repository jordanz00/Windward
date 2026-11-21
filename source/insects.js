// ---- Insects, and the flowers some of them live on. Every kind is assembled from the same
// three parts: ellipsoid lobes for the body, thin tubes for legs and antennae, flat sheets
// for wings. Sizes are real, in metres, so a bee is a centimetre and a half and is only a
// bee when the eye is close. Wingbeats and walking legs are moved in the vertex shader;
// what each animal decides to do is a few lines of state on the CPU, for the few dozen
// that are near enough to matter.

// Kinds inside the insect shader: 0 hard glossy cuticle, 1 fur, then these. Plain is
// something carried, which does not take the animal's colour.
const BUG_WING = 2, BUG_SCALE = 3, BUG_LAMP = 4, BUG_HALO = 5, BUG_PLAIN = 6;
const BUG_STRIDE = 24;
const fract = (x) => x - Math.floor(x);

// One lobe of a body: an ellipsoid along x from x0 to x1, centred at height yc and offset zc.
// tone(t, b) is its colour at t along the lobe and angle b around it, 0 on top.
function bugLobe(m, x0, x1, ry, rz, yc, zc, tone, n, kind, segs) {
  const sides = n + 2, base = m.pos.length / 3, ax = (x1 - x0) * 0.5;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * Math.PI, r = Math.sin(a);
    for (let k = 0; k < sides; k++) {
      const b = k / sides * 6.2832, cy = Math.cos(b), cz = Math.sin(b), c = tone(t, b);
      const nx = -Math.cos(a) / ax, ny = cy * r / ry, nz = cz * r / rz, nl = Math.hypot(nx, ny, nz) || 1;
      m.v(x0 + ax * (1 - Math.cos(a)), yc + cy * ry * r, zc + cz * rz * r, nx / nl, ny / nl, nz / nl, c[0], c[1], c[2], 0, kind || 0, t * (segs || 0), b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides;
    m.tri(a, a + sides, b); m.tri(b, a + sides, b + sides);
  }
}
// A leg, an antenna or a stem: a three-sided tube through pts, thinning to its end. For a
// leg that walks, g is its stride in metres, signed by which tripod it belongs to; the
// shader swings the foot by it and leaves the hip where it is.
function bugLimb(m, pts, r, col, g, kind, sides) {
  tube(m, pts, sides || 3, false, (t) => [r * (1 - 0.55 * t), col[0], col[1], col[2], (g || 0) * t, kind || 0, 0, 0]);
}
// A wing lying flat, hinged on the body's long axis with its root at x0. len is the span,
// wid the widest chord, e moves the widest point (under 1 toward the root, over 1 toward
// the tip), back sweeps it behind straight out. pair 2 marks a hind wing that beats out of
// step with the fore wing.
function bugWing(m, x0, side, pair, len, wid, e, back, col, kind, n) {
  const base = m.pos.length / 3, cs = Math.cos(back), sn = Math.sin(back);
  for (let i = 0; i <= n; i++) {
    const u = i / n, c = wid * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(u * 0.94 + 0.03, e))), 0.55);
    for (let j = 0; j < 3; j++) {
      const ch = c * (0.28 - j * 0.5);
      m.v(x0 - sn * len * u + cs * ch, 0, side * (cs * len * u + sn * ch), 0, 1, 0, col[0], col[1], col[2], side * pair, kind, u, j * 0.5);
    }
    if (i) for (let j = 0; j < 2; j++) {
      const a = base + (i - 1) * 3 + j;
      m.tri(a, a + 3, a + 1); m.tri(a + 1, a + 3, a + 4);
    }
  }
}
// Three legs a side from hips spaced along the body: hip, knee, foot.
function bugLegs(m, x, dx, hipY, hipZ, knee, foot, r, col, stride) {
  for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
    const hx = x - i * dx, f = 1 - i;
    bugLimb(m, [[hx, hipY, s * hipZ], [hx + f * knee[0], knee[1], s * knee[2]], [hx + f * foot[0], foot[1], s * foot[2]]], r, col,
      stride * ((i + (s > 0 ? 0 : 1)) % 2 ? 1 : -1));
  }
}
const BUG_CLEAR = [0.62, 0.56, 0.44];
const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// A dragonfly, or with slim a damselfly: big eyes, a deep thorax carrying four clear wings,
// and a long abdomen of ten segments. Its colour comes from the instance.
function makeDragonfly(lod, slim) {
  const m = new Mesh(), n = lod ? 3 : 6, k = slim ? 0.72 : 1, w = slim ? 0.0008 : 0.0017;
  // The abdomen is widest just behind the thorax and again near its tip.
  const seg = (t, b) => tint([1, 1, 1], (Math.cos(b) > 0.1 ? 0.9 : 0.4) * (slim && t < 0.3 ? 0.25 : 1));
  bugLobe(m, -0.034 * k, 0.001, w, w, -0.0022, 0, seg, n * 2, 0, 9.5);
  bugLobe(m, -0.0045, 0.0085, 0.0042 * k, 0.0036 * k, -0.003, 0, (t, b) => tint([1, 1, 1], Math.abs(Math.sin(b * 2 + t * 3)) > 0.8 ? 0.25 : 0.75), n + 1);
  bugLobe(m, 0.0078, 0.0112, 0.0022 * k, 0.003 * k, -0.0024, 0, () => [0.12, 0.1, 0.06], n);
  for (let s = -1; s <= 1; s += 2) {
    // Compound eyes: they meet on top of a dragonfly's head and stand apart on a damselfly's.
    bugLobe(m, 0.0078, 0.0128, 0.0026 * k, 0.0024 * k, -0.0016, s * (slim ? 0.0034 : 0.0017) * k, (t, b) => Math.cos(b) > 0 ? [0.34, 0.2, 0.08] : [0.2, 0.3, 0.16], n);
    bugWing(m, 0.003, s, 1, slim ? 0.024 : 0.044, slim ? 0.0048 : 0.0095, slim ? 1.5 : 1.2, slim ? 0 : -0.06, BUG_CLEAR, BUG_WING, n + 3);
    bugWing(m, -0.0025, s, 2, slim ? 0.023 : 0.042, slim ? 0.0048 : 0.0122, slim ? 1.5 : 0.8, 0.1, BUG_CLEAR, BUG_WING, n + 3);
  }
  bugLegs(m, 0.006, 0.003, -0.006 * k, 0.0014, [0.003, -0.0082, 0.0048], [0.0062, -0.0105, 0.003], 0.00028, [0.06, 0.05, 0.04], 0);
  return m;
}
// A bee, a small fly or a mosquito share a plan: head with eyes, thorax, striped abdomen, one
// pair of working wings, legs that hang in flight.
function makeBee(lod) {
  const m = new Mesh(), n = lod ? 3 : 6;
  bugLobe(m, -0.0022, 0.0022, 0.0024, 0.0024, -0.0022, 0, (t, b) => tint([0.3, 0.2, 0.06], 0.8 + 0.3 * Math.cos(b)), n, 1);
  bugLobe(m, 0.0018, 0.0042, 0.0017, 0.002, -0.0024, 0, () => [0.07, 0.06, 0.05], n);
  bugLobe(m, -0.0098, -0.0016, 0.0026, 0.0027, -0.003, 0, (t) => fract(t * 4.3 + 0.1) < 0.42 ? [0.03, 0.025, 0.02] : [0.42, 0.25, 0.04], n + 2);
  for (let s = -1; s <= 1; s += 2) {
    bugLobe(m, 0.0022, 0.004, 0.0013, 0.0008, -0.0021, s * 0.0017, () => [0.03, 0.03, 0.03], n);
    bugWing(m, 0.0008, s, 1, 0.0092, 0.0032, 1.3, 0.35, BUG_CLEAR, BUG_WING, n + 1);
    bugWing(m, -0.0006, s, 1, 0.0062, 0.0022, 1.2, 0.75, BUG_CLEAR, BUG_WING, n);
    if (!lod) {
      bugLimb(m, [[0.0038, -0.0016, s * 0.0006], [0.0052, -0.0008, s * 0.0012], [0.0066, -0.0022, s * 0.0016]], 0.00012, [0.05, 0.04, 0.03], 0);
      // The pollen she has packed onto her hind legs.
      bugLobe(m, -0.0034, -0.0018, 0.0006, 0.0005, -0.0072, s * 0.0021, () => [0.5, 0.36, 0.06], 3, 1);
    }
  }
  bugLegs(m, 0.0012, 0.0014, -0.0042, 0.001, [-0.0005, -0.0062, 0.0026], [-0.0015, -0.0085, 0.0018], 0.00022, [0.06, 0.05, 0.03], 0);
  return m;
}
function makeFly(lod, mosq) {
  const m = new Mesh(), n = lod ? 3 : 5, legZ = mosq ? 0.0045 : 0.0026;
  bugLobe(m, -0.0008, 0.0008, 0.0008, 0.0007, -0.0008, 0, () => [0.2, 0.19, 0.17], n);
  bugLobe(m, 0.0007, 0.0015, 0.0006, 0.0007, -0.0008, 0, () => [0.3, 0.08, 0.05], n);
  bugLobe(m, mosq ? -0.0048 : -0.0034, -0.0006, mosq ? 0.00045 : 0.0006, mosq ? 0.00045 : 0.0006, -0.001, 0, (t) => tint([0.22, 0.2, 0.17], fract(t * 5) < 0.3 ? 0.4 : 1), n + 1);
  for (let s = -1; s <= 1; s += 2) bugWing(m, 0.0002, s, 1, mosq ? 0.0046 : 0.0036, mosq ? 0.0011 : 0.0014, 1.2, 0.5, BUG_CLEAR, BUG_WING, n);
  bugLegs(m, 0.0006, 0.0006, -0.0013, 0.0004, [0.0009, -0.001, legZ * 0.75], [0.0003, mosq ? -0.0065 : -0.004, legZ], mosq ? 0.00007 : 0.00009, [0.08, 0.07, 0.06], 0);
  if (mosq) bugLimb(m, [[0.0014, -0.001, 0], [0.0034, -0.0022, 0]], 0.00007, [0.08, 0.07, 0.06], 0);
  return m;
}
// A butterfly, or with moth a stout furred moth: scaled wings, patterned in the shader.
function makeButterfly(lod, moth) {
  const m = new Mesh(), n = lod ? 3 : 6, r = moth ? 0.003 : 0.0016, dark = () => [0.1, 0.075, 0.05];
  bugLobe(m, moth ? -0.014 : -0.012, 0.004, r, r, -r, 0, moth ? () => [0.4, 0.33, 0.25] : dark, n + 1, 1);
  bugLobe(m, 0.0035, 0.0062, 0.0014, 0.0015, -0.0014, 0, dark, n, 1);
  for (let s = -1; s <= 1; s += 2) {
    bugWing(m, 0.002, s, 1, moth ? 0.023 : 0.04, moth ? 0.015 : 0.03, 1.55, moth ? 0.3 : -0.3, [1, 1, 1], BUG_SCALE, n + 3);
    bugWing(m, -0.0025, s, 1, moth ? 0.014 : 0.028, moth ? 0.013 : 0.03, 0.95, 0.95, [0.92, 0.92, 0.92], BUG_SCALE, n + 3);
    if (!lod) {
      bugLimb(m, [[0.0058, -0.0006, s * 0.0006], [0.011, 0.003, s * 0.003], [0.0155, 0.0048, s * 0.0045]], moth ? 0.00035 : 0.00012, [0.08, 0.06, 0.04], 0);
      if (!moth) bugLobe(m, 0.015, 0.0172, 0.0003, 0.0003, 0.0052, s * 0.0048, dark, 3);
    }
  }
  bugLegs(m, 0.002, 0.0018, -0.0026, 0.0006, [0.0006, -0.0048, 0.0024], [0.0014, -0.0075, 0.002], 0.00013, [0.08, 0.06, 0.04], 0);
  return m;
}
// A ground beetle stands on the origin. With fly it is a firefly instead: narrow, soft, a pale
// shield over the head, flight wings, and the two lit segments under the tail.
function makeBeetle(lod, fly) {
  const m = new Mesh(), n = lod ? 3 : 6, z = fly ? 0.45 : 1, y = fly ? -0.0015 : 0.0052;
  const shell = fly
    ? (t, b) => Math.abs(Math.sin(b)) > 0.82 ? [0.5, 0.42, 0.25] : [0.07, 0.055, 0.045]
    : (t, b) => tint([1, 1, 1], (Math.cos(b) > 0.99 ? 0.3 : 0.8 + 0.2 * Math.sin(b * 14)) * (0.75 + 0.25 * t));
  bugLobe(m, -0.0105, 0.002, 0.0042 * (fly ? 0.5 : 1), 0.0056 * z, y, 0, shell, n + 2);
  bugLobe(m, 0.0012, 0.0062, 0.0032 * (fly ? 0.55 : 1), 0.0046 * z * (fly ? 1.15 : 1), y - 0.0004, 0,
    fly ? (t, b) => Math.cos(b) > 0.8 ? [0.1, 0.05, 0.04] : [0.4, 0.26, 0.18] : () => [0.7, 0.7, 0.7], n);
  bugLobe(m, 0.0055, 0.0085, 0.0018 * (fly ? 0.6 : 1), 0.0026 * z, y - 0.0012, 0, () => [0.05, 0.045, 0.04], n);
  for (let s = -1; s <= 1; s += 2) {
    if (!lod) bugLimb(m, [[0.008, y - 0.001, s * 0.001 * z], [0.011, y, s * 0.0035 * z], [0.0135, y - 0.001, s * 0.005 * z]], 0.00014, [0.06, 0.05, 0.04], 0);
    if (fly) bugWing(m, 0, s, 1, 0.0095, 0.0032, 1.2, 0.5, BUG_CLEAR, BUG_WING, n);
  }
  if (fly) {
    bugLobe(m, -0.0102, -0.0056, 0.0014, 0.0021, y - 0.0012, 0, () => [0.8, 0.85, 0.5], n, BUG_LAMP);
    // The glow the lantern throws into the damp air around it, drawn facing the eye.
    const b = m.pos.length / 3;
    for (let k = 0; k < 4; k++) m.v(-0.008, y - 0.002, 0, 0, 1, 0, 1, 1, 1, 0, BUG_HALO, k & 1 ? 1 : -1, k & 2 ? 1 : -1);
    m.tri(b, b + 1, b + 2); m.tri(b + 2, b + 1, b + 3);
    bugLegs(m, 0.003, 0.003, y - 0.002, 0.001, [0.0005, y - 0.0035, 0.0022], [-0.0008, y - 0.0052, 0.0018], 0.00018, [0.06, 0.05, 0.04], 0);
  } else {
    bugLegs(m, 0.004, 0.0042, 0.003, 0.0035, [0.002, 0.0052, 0.0085], [0.004, 0, 0.0105], 0.00042, [0.05, 0.04, 0.035], 0.0032);
  }
  return m;
}
// An ant: head, a narrow middle, the knot of the waist, the gaster. Some carry a piece of leaf home.
function makeAnt(lod, leaf) {
  const m = new Mesh(), n = lod ? 3 : 5, c = () => [1, 1, 1];
  bugLobe(m, -0.0036, -0.0009, 0.001, 0.001, 0.0017, 0, (t) => tint([1, 1, 1], 0.7 + 0.3 * fract(t * 4)), n);
  bugLobe(m, -0.0011, -0.0004, 0.00035, 0.00035, 0.0016, 0, c, 3);
  bugLobe(m, -0.0005, 0.0017, 0.0006, 0.00055, 0.0018, 0, c, n);
  bugLobe(m, 0.0015, 0.0031, 0.0008, 0.0009, 0.0019, 0, c, n);
  for (let s = -1; s <= 1; s += 2) bugLimb(m, [[0.0029, 0.0021, s * 0.0004], [0.0038, 0.0029, s * 0.0012], [0.0052, 0.0022, s * 0.0016]], 0.00007, [0.8, 0.8, 0.8], 0);
  bugLegs(m, 0.0012, 0.0007, 0.0014, 0.0003, [0.0012, 0.0024, 0.0019], [0.002, 0, 0.003], 0.00009, [0.8, 0.8, 0.8], 0.0009);
  if (leaf) {
    const b = m.pos.length / 3, g = [0.12, 0.4, 0.06];
    for (const q of [[0.0026, 0.0026, 0], [0.0065, 0.0082, 0.0012], [-0.0025, 0.0088, -0.001]]) m.v(q[0], q[1], q[2], 0, 0, 1, g[0], g[1], g[2], 0, BUG_PLAIN);
    m.tri(b, b + 1, b + 2);
  }
  return m;
}
// name, habitat, how many, body length, how far off it is still drawn, colours it comes in.
const BUGS = [
  { id: 'dragonfly', site: 'water', n: 9, len: 0.05, reach: 40, tints: [[0.5, 0.07, 0.025], [0.07, 0.2, 0.5], [0.5, 0.3, 0.05], [0.12, 0.3, 0.08]] },
  { id: 'damselfly', site: 'water', n: 7, len: 0.036, reach: 20, tints: [[0.05, 0.22, 0.55], [0.5, 0.06, 0.04], [0.1, 0.4, 0.34]] },
  { id: 'butterfly', site: 'bloom', n: 10, len: 0.04, reach: 36, tints: [[0.62, 0.2, 0.015, 0], [0.03, 0.12, 0.5, 1], [0.6, 0.45, 0.06, 2], [0.6, 0.6, 0.54, 2]] },
  { id: 'bee', site: 'bloom', n: 14, len: 0.014, reach: 16, tints: [[1, 1, 1]] },
  { id: 'moth', site: 'bloom', n: 5, len: 0.022, reach: 20, tints: [[0.26, 0.2, 0.14, 3], [0.36, 0.33, 0.28, 3]] },
  { id: 'gnat', site: 'edge', n: 150, len: 0.004, reach: 14, tints: [[1, 1, 1]] },
  { id: 'mosquito', site: 'shade', n: 8, len: 0.006, reach: 7, tints: [[1, 1, 1]] },
  { id: 'beetle', site: 'litter', n: 8, len: 0.018, reach: 9, tints: [[0.05, 0.16, 0.09], [0.16, 0.09, 0.04], [0.03, 0.03, 0.035], [0.2, 0.14, 0.03]] },
  { id: 'ant', site: 'litter', n: 96, len: 0.007, reach: 6, tints: [[0.22, 0.07, 0.03], [0.05, 0.04, 0.035]] },
  { id: 'firefly', site: 'shade', n: 80, len: 0.012, reach: 24, tints: [[1, 1, 1]] }
];
// Two levels of detail each, in the order of BUGS; then the ant with its leaf.
function bugMeshes() {
  const out = [];
  for (let lod = 0; lod < 2; lod++) {
    out[lod] = makeDragonfly(lod); out[2 + lod] = makeDragonfly(lod, 1); out[4 + lod] = makeButterfly(lod); out[6 + lod] = makeBee(lod);
    out[8 + lod] = makeButterfly(lod, 1); out[10 + lod] = makeFly(lod); out[12 + lod] = makeFly(lod, 1); out[14 + lod] = makeBeetle(lod);
    out[16 + lod] = makeAnt(lod); out[18 + lod] = makeBeetle(lod, 1); out[20 + lod] = makeAnt(lod, 1);
  }
  return out;
}

// A blade of leaf or petal growing from o along d, its upper face toward up: rows along its
// length and cols across. shape(t) is the half-width, fold lifts the edges about the midrib,
// bend curls it away from up along its length, frill ruffles the far edge.
function bugBlade(m, o, d, up, len, wid, shape, colAt, sway, fold, bend, rows, cols, frill) {
  let sx = d[1] * up[2] - d[2] * up[1], sy = d[2] * up[0] - d[0] * up[2], sz = d[0] * up[1] - d[1] * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
  const ux = sy * d[2] - sz * d[1], uy = sz * d[0] - sx * d[2], uz = sx * d[1] - sy * d[0];
  const base = m.pos.length / 3;
  let px = o[0], py = o[1], pz = o[2];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, a = bend * t, ca = Math.cos(a), sa = Math.sin(a), w = wid * shape(t);
    const nx = ux * ca + d[0] * sa, ny = uy * ca + d[1] * sa, nz = uz * ca + d[2] * sa;
    for (let j = 0; j < cols; j++) {
      const sd = j / (cols - 1) * 2 - 1, lift = (fold * Math.abs(sd) + (frill || 0) * t * Math.sin(sd * 5 + i * 1.7)) * w, c = colAt(t, sd);
      let ax = nx - sx * sd * fold * 1.2, ay = ny - sy * sd * fold * 1.2, az = nz - sz * sd * fold * 1.2;
      const al = Math.hypot(ax, ay, az) || 1;
      m.v(px + sx * sd * w + nx * lift, py + sy * sd * w + ny * lift, pz + sz * sd * w + nz * lift, ax / al, ay / al, az / al, c[0], c[1], c[2], sway * (frill ? 1 : 0.6 + 0.4 * t), LEAF, sd, frill ? -1 : t);
    }
    px += (d[0] * ca - ux * sa) * len / rows; py += (d[1] * ca - uy * sa) * len / rows; pz += (d[2] * ca - uz * sa) * len / rows;
    if (i) for (let j = 0; j < cols - 1; j++) {
      const q = base + (i - 1) * cols + j;
      m.tri(q, q + cols, q + 1); m.tri(q + 1, q + cols, q + cols + 1);
    }
  }
}
// A flowering shrub of the hibiscus kind: woody stems that arch and fork, glossy pointed
// leaves all the way up them, and at the ends wide five-petalled blossoms with a long
// column of stamens, a few still in bud. Returns the mesh and where each open blossom is,
// six numbers apiece: a place on its column, the level part of the way the column points,
// and how far that part of the plant gives to the wind.
function makeFlowerShrub(seed, lod) {
  const rnd = seeded(seed * 7919 + 3), m = new Mesh(), blooms = [];
  const hue = [[0.5, 0.025, 0.04], [0.7, 0.2, 0.32], [0.72, 0.5, 0.05], [0.74, 0.72, 0.64], [0.75, 0.24, 0.04]][seed % 5];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const ovate = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t * 0.97 + 0.015, 0.62)), 0.8);
  const petal = (t) => 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 1.25) * 0.86)), 0.7);
  const flower = (c, f, R, sw) => {
    const side = norm([-f[2], 0, f[0] + 1e-4]), w = [f[1] * side[2] - f[2] * side[1], f[2] * side[0] - f[0] * side[2], f[0] * side[1] - f[1] * side[0]];
    const spin = rnd() * 6.28, open = 0.95 + rnd() * 0.25;
    for (let k = 0; k < 5; k++) {
      const a = spin + k * 1.2566, ca = Math.cos(a), sa = Math.sin(a), r = [side[0] * ca + w[0] * sa, side[1] * ca + w[1] * sa, side[2] * ca + w[2] * sa];
      const co = Math.cos(open), so = Math.sin(open), tw = 0.35;
      // Each petal overlaps the next: it is turned a little about its own length.
      const t2 = [-side[0] * sa + w[0] * ca, -side[1] * sa + w[1] * ca, -side[2] * sa + w[2] * ca];
      const d = [f[0] * co + r[0] * so, f[1] * co + r[1] * so, f[2] * co + r[2] * so];
      const up = norm([f[0] * so - r[0] * co + t2[0] * tw, f[1] * so - r[1] * co + t2[1] * tw, f[2] * so - r[2] * co + t2[2] * tw]);
      const tone = 0.9 + rnd() * 0.2;
      bugBlade(m, c, d, up, R * (0.95 + rnd() * 0.1), R * 0.46, petal, (t, sd) => {
        const th = Math.max(0, 1 - t * 3.2), e = 0.85 + 0.3 * t - 0.12 * Math.abs(sd);
        return [(hue[0] * (1 - th) + 0.22 * th) * e * tone, (hue[1] * (1 - th) + 0.01 * th) * e * tone, (hue[2] * (1 - th) + 0.03 * th) * e * tone];
      }, sw, 0.22, 0.75 + rnd() * 0.35, lod ? 2 : 6, lod ? 3 : 5, 0.09);
    }
    // The column: the fused stamens, with the anthers round its outer part and the dark stigma past them.
    const col = (u) => [c[0] + f[0] * R * u, c[1] + f[1] * R * u + R * 0.12 * u * u, c[2] + f[2] * R * u];
    const lim = (pts, r, cl) => { const b = m.pos.length / 3; bugLimb(m, pts, r, cl, 0, 0, lod ? 3 : 6); for (let q = b; q < m.pos.length / 3; q++) m.sway[q] = sw; };
    lim([col(-0.3), col(-0.12), col(-0.02)], R * 0.16, [0.1, 0.22, 0.05]);
    lim([col(0), col(0.3), col(0.6), col(0.95)], R * 0.045, [hue[0] * 0.9 + 0.1, hue[1] * 0.8 + 0.1, hue[2] * 0.8 + 0.08]);
    if (!lod) {
      // Anthers stand off the column on short threads, each a grain of pollen-yellow.
      for (let k = 0; k < 22; k++) {
        const u = 0.55 + 0.37 * k / 22, q = col(u), a = k * 2.4, ca = Math.cos(a) * R * 0.1, sa = Math.sin(a) * R * 0.1;
        const e = [q[0] + side[0] * ca + w[0] * sa, q[1] + side[1] * ca + w[1] * sa, q[2] + side[2] * ca + w[2] * sa];
        lim([q, e], R * 0.008, [0.7, 0.5, 0.3]);
        lim([[e[0] - f[0] * R * 0.02, e[1] - f[1] * R * 0.02, e[2] - f[2] * R * 0.02], e, [e[0] + f[0] * R * 0.02, e[1] + f[1] * R * 0.02, e[2] + f[2] * R * 0.02]], R * 0.028, [0.6, 0.4, 0.04]);
      }
      for (let k = 0; k < 5; k++) { const a = k * 1.2566, q = col(0.95), ca = Math.cos(a) * R * 0.07, sa = Math.sin(a) * R * 0.07; lim([q, [q[0] + side[0] * ca + w[0] * sa + f[0] * R * 0.1, q[1] + side[1] * ca + w[1] * sa + f[1] * R * 0.1, q[2] + side[2] * ca + w[2] * sa + f[2] * R * 0.1]], R * 0.03, [0.3, 0.02, 0.03]); }
    }
    blooms.push(col(0.35)[0], col(0.35)[1], col(0.35)[2], f[0], f[2], sw);
  };
  const bud = (c, f, R, sw) => {
    for (let k = 0; k < 3; k++) {
      const a = k * 2.094, r = norm([Math.cos(a) * f[1] + 1e-3, -Math.cos(a) * f[0] - Math.sin(a) * f[2], Math.sin(a) * f[1]]);
      bugBlade(m, c, norm([f[0] + r[0] * 0.25, f[1] + r[1] * 0.25, f[2] + r[2] * 0.25]), r, R, R * 0.3, (t) => Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), (t) => t < 0.45 ? [0.08, 0.2, 0.05] : [hue[0] * 0.8, hue[1] * 0.8, hue[2] * 0.8], sw, -0.5, -0.5, 3, 3, 0);
    }
  };
  const branch = (o, d0, len, r, depth, sw0) => {
    const n = 7, pts = [o], dirs = [d0];
    let d = d0, p = o;
    const lean = [(rnd() - 0.5) * 0.5, -0.12 - rnd() * 0.2, (rnd() - 0.5) * 0.5];
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      d = norm([d[0] + lean[0] * 0.16 + d0[0] * 0.05 * t, d[1] + lean[1] * 0.16 * (0.4 + t), d[2] + lean[2] * 0.16 + d0[2] * 0.05 * t]);
      p = [p[0] + d[0] * len / n, p[1] + d[1] * len / n, p[2] + d[2] * len / n];
      pts.push(p); dirs.push(d);
    }
    const sw = (t) => sw0 + (0.16 + 0.1 * depth) * t * t;
    const b = m.pos.length / 3, wood = depth ? [0.14, 0.17, 0.07] : [0.17, 0.13, 0.09];
    const ss = lod ? 3 : 5;
    bugLimb(m, pts, r, wood, 0, 0, ss);
    for (let q = b; q < m.pos.length / 3; q++) m.sway[q] = sw(Math.floor((q - b) / ss) / n);
    const at = (t) => { const i = Math.min(n - 1, (t * n) | 0), f = t * n - i, a = pts[i], c = pts[i + 1]; return [[a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f], dirs[i + 1]]; };
    // Leaves stand off the stem in a spiral, held out toward the light, the young ones paler.
    const leaves = Math.round(len * (lod ? 9 : 17));
    for (let k = 0; k < leaves; k++) {
      const t = 0.22 + 0.78 * (k + rnd() * 0.6) / leaves, [q, dd] = at(Math.min(t, 0.999)), a = k * 2.4 + rnd() * 0.5;
      const e1 = norm([-dd[2], 0, dd[0] + 1e-4]), e2 = [dd[1] * e1[2] - dd[2] * e1[1], dd[2] * e1[0] - dd[0] * e1[2], dd[0] * e1[1] - dd[1] * e1[0]];
      const r0 = [e1[0] * Math.cos(a) + e2[0] * Math.sin(a), e1[1] * Math.cos(a) + e2[1] * Math.sin(a), e1[2] * Math.cos(a) + e2[2] * Math.sin(a)];
      const ld = norm([r0[0] + dd[0] * 0.55, r0[1] * 0.6 + dd[1] * 0.55 + 0.12, r0[2] + dd[2] * 0.55]);
      const g = 0.75 + rnd() * 0.5, young = Math.max(0, t - 0.75) * 2.2, L = (0.1 + rnd() * 0.06) * (lod ? 1.35 : 1) * (1 - young * 0.35);
      const lc = [(0.035 + 0.05 * young) * g, (0.13 + 0.12 * young) * g, 0.03 * g];
      bugBlade(m, q, ld, norm([-ld[0] * ld[1], 1.02 - ld[1] * ld[1], -ld[2] * ld[1]]), L, L * 0.33, ovate, (tt, sd) => [lc[0] * (1 + 0.18 * Math.abs(sd)), lc[1] * (1 + 0.18 * Math.abs(sd)), lc[2]], sw(t) + 0.05, 0.16, 0.5 + rnd() * 0.5, lod ? 2 : 6, 3, 0);
    }
    const tip = pts[n], f = norm([dirs[n][0], Math.max(dirs[n][1], 0.1) + 0.35, dirs[n][2]]);
    if (rnd() < (depth ? 0.75 : 0.9)) flower(tip, f, 0.055 + rnd() * 0.02, sw(1));
    else bud(tip, f, 0.035, sw(1));
    if (!depth) for (let k = 0, c = 2 + ((rnd() * 2) | 0); k < c; k++) {
      const [q, dd] = at(0.4 + 0.45 * (k + rnd()) / c), a = rnd() * 6.28;
      branch(q, norm([dd[0] + Math.cos(a) * 0.9, dd[1] * 0.8 + 0.25, dd[2] + Math.sin(a) * 0.9]), len * (0.35 + rnd() * 0.2), r * 0.6, 1, sw(0.5));
    }
  };
  const stems = 5 + (seed % 3);
  for (let i = 0; i < stems; i++) {
    const a = i / stems * 6.2832 + rnd() * 0.8, sp = 0.3 + rnd() * 0.45;
    branch([Math.cos(a) * 0.05, -0.03, Math.sin(a) * 0.05], norm([Math.cos(a) * sp, 1, Math.sin(a) * sp]), 0.9 + rnd() * 0.7, 0.012, 0, 0);
  }
  return { mesh: m, blooms: blooms };
}

function angTo(a, b) { let d = b - a; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; }

// The living part. sites are the places each kind can be: still shallows, blossoms, forest
// floor, shaded edges. Only the animals whose home is near the eye are run or drawn; when
// the eye moves on, they are given homes near where it has gone.
function BugLife(world, blooms, perch) {
  // perch: for each blossom, the plant it is on (x, z, scale, exposure) and its sway there.
  this.world = world; this.perch = perch; this.rnd = mulberry32(0xB06C0DE); this.time = 0; this.calm = false; this.heard = {};
  const S = this.sites = { water: [], bloom: blooms, edge: [], shade: [], litter: [] }, rnd = this.rnd;
  for (let z = -230; z < 230; z += 4) for (let x = -250; x < 250; x += 4) {
    const px = x + rnd() * 4, pz = z + rnd() * 4, h = fieldSample(world, px, pz);
    if (h > -0.6 && h < -0.04 && fieldDamp(world, px, pz) < 0.9) S.water.push(px, 0, pz, 0, 0);
    else if (h > 1.2) {
      const f = forestMask(px, pz, h, fieldSlope(world, px, pz));
      if (f > 0.55) { S.litter.push(px, h, pz, 0, 0); if (rnd() < 0.5) S.shade.push(px, h, pz, 0, 0); }
      else if (f > 0.12) S.edge.push(px, h, pz, 0, 0);
    }
  }
  if (!S.edge.length) S.edge = S.bloom;
  if (!S.shade.length) S.shade = S.edge;
  const A = this.agents = [];
  this.first = [];
  BUGS.forEach((B, sp) => {
    this.first.push(A.length);
    for (let i = 0; i < B.n; i++) {
      const t = B.tints[(rnd() * B.tints.length) | 0];
      A.push({ sp: sp, on: false, seed: rnd(), sc: 0.85 + rnd() * 0.3, tint: t, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: rnd() * 6.28, pitch: 0, roll: 0,
        st: 0, t: rnd() * 3, k: 0, ph: rnd() * 6, gait: 0, wing: 0, amp: 0, sweep: 0, glow: t[3] || 0, hx: 1e9, hy: 0, hz: 0, group: (i / 30) | 0, wait: rnd() * 2 });
    }
  });
  this.first.push(A.length);
  this.lvl = new Float32Array(BUGS.length);
  this.counts = new Int32Array(22); this.starts = new Int32Array(22);
}
BugLife.prototype.ground = function (x, z) { return Math.max(fieldSample(this.world, x, z), 0); };
// A site of this kind within r of (cx, cz), or -1. A few random tries: sites are dense.
BugLife.prototype.pick = function (list, cx, cz, r, far) {
  const n = list.length / 5;
  for (let k = 0; k < 40 && n; k++) {
    const i = ((this.rnd() * n) | 0) * 5, d = Math.hypot(list[i] - cx, list[i + 2] - cz);
    if (d < r && d >= (far || 0)) return i;
  }
  return -1;
};
// Steer toward a point: accelerate to a speed that falls as it nears, and go.
BugLife.prototype.fly = function (a, tx, ty, tz, vmax, acc, dt) {
  // Smooth approach: accelerate toward the goal, ease off near it, bank into turns.
  const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
  const sp = Math.min(vmax, d * (d < 0.8 ? 3.2 : 5.5));
  let ax = dx / d * sp - a.vx, ay = dy / d * sp - a.vy, az = dz / d * sp - a.vz;
  const al = Math.hypot(ax, ay, az) || 1e-6, k = Math.min(1, acc * dt / al);
  a.vx += ax * k; a.vy += ay * k; a.vz += az * k;
  // Soft drag so dashes settle instead of oscillating.
  const drag = Math.exp(-dt * (d < 0.35 ? 3.5 : 0.8));
  a.vx *= drag; a.vy *= drag; a.vz *= drag;
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  const h = Math.hypot(a.vx, a.vz);
  if (h > 0.12) {
    const t = angTo(a.yaw, Math.atan2(a.vz, a.vx));
    a.yaw += t * Math.min(1, dt * 8);
    a.roll = Math.max(-0.65, Math.min(0.65, a.roll * 0.85 + t * 1.2));
    a.pitch = Math.atan2(a.vy, h + 0.45) * 0.55;
  }
  return d;
};
// The gust at a place, the same cells the plants bend to.
BugLife.prototype.blow = function (a, k, dt) {
  const g = envWindAt(a.x, a.z) * k * dt;
  a.x += env.wx0 * g; a.z += env.wz0 * g;
  a.y += Math.sin(this.time * 2.1 + a.seed * 17) * g * 0.08;
};
BugLife.prototype.newHome = function (a, cx, cz) {
  const B = BUGS[a.sp], S = this.sites[B.site], rnd = this.rnd;
  // Swarming gnats and ants on a trail share a place with the rest of their group.
  let i = -1;
  if (B.id === 'gnat' || B.id === 'ant') {
    const g = this.groups || (this.groups = {}), key = a.sp * 100 + a.group, o = g[key];
    if (o && Math.hypot(o.x - cx, o.z - cz) < B.reach * 1.3) { a.sw = o; }
    else {
      i = this.pick(S, cx, cz, B.reach * 0.8, 1.5);
      if (i < 0) return false;
      const sw = g[key] = { x: S[i], y: S[i + 1], z: S[i + 2], seed: rnd(), pts: [] };
      // A trail wanders from the nest to whatever is being carried back.
      let x = sw.x, z = sw.z, dir = rnd() * 6.28;
      for (let k = 0; k < 30; k++) { sw.pts.push(x, z); dir += (rnd() - 0.5) * 0.7; x += Math.cos(dir) * 0.22; z += Math.sin(dir) * 0.22; }
      a.sw = sw;
    }
    a.hx = a.sw.x; a.hy = a.sw.y; a.hz = a.sw.z;
    a.x = a.hx + (rnd() - 0.5) * 0.6; a.y = a.hy + 1.5 + rnd() * 0.5; a.z = a.hz + (rnd() - 0.5) * 0.6;
    a.s = rnd() * 6.3; a.dir = rnd() < 0.5 ? 1 : -1; a.v = 0.035 + rnd() * 0.03; a.lane = (rnd() - 0.5) * 0.02;
    return true;
  }
  i = this.pick(S, cx, cz, B.reach * 0.8, B.len * 30);
  if (i < 0) return false;
  a.hx = S[i]; a.hy = S[i + 1]; a.hz = S[i + 2]; a.site = i;
  a.x = a.hx; a.z = a.hz; a.y = a.hy + (B.site === 'bloom' ? 0.3 : B.site === 'litter' ? 0 : 0.5 + rnd() * 0.8);
  a.vx = a.vy = a.vz = 0; a.st = 0; a.t = rnd() * 2; a.tx = a.hx; a.ty = a.hy; a.tz = a.hz; a.by = a.y; a.k = 0;
  if (B.site === 'bloom') { a.x += (rnd() - 0.5) * 2.5; a.z += (rnd() - 0.5) * 2.5; }
  if (B.site === 'water') {
    // Somewhere to settle: the nearest dry ground to its stretch of water.
    a.px = a.hx; a.pz = a.hz;
    for (let k = 0; k < 16; k++) { const r = 1 + k * 0.5, q = rnd() * 6.28, x = a.hx + Math.cos(q) * r, z = a.hz + Math.sin(q) * r, h = fieldSample(this.world, x, z); if (h > 0.05 && h < 1) { a.px = x; a.pz = z; break; } }
  }
  if (B.id === 'firefly') { a.st = a.seed < 0.3 ? 1 : 0; a.per = 2.5 + rnd() * 3; a.t = a.st ? 1e9 : rnd() * a.per; a.fl = 0; if (a.st) a.y = a.hy + 0.05 + rnd() * 0.4; }
  if (B.id === 'beetle') { a.y = a.hy; a.t = 1 + rnd() * 3; }
  return true;
};
// How much of each kind is out, from the hour, the rain, the wind and the cloud.
BugLife.prototype.levels = function () {
  const sy = env.sun[1], day = smooth01(0.0, 0.25, sy), low = smooth01(0.5, 0.18, sy) * smooth01(-0.1, 0.0, sy);
  const dark = smooth01(0.08, -0.06, sy), dry = 1 - Math.min(1, env.v[1] * 3), calm = 1 - smooth01(7, 12, env.speed), bright = 1 - 0.6 * env.cover;
  // Morning ramp: insects wake gradually after first light.
  const morn = smooth01(5.8, 8.5, env.hour) * (1 - smooth01(10, 12, env.hour));
  const L = this.lvl;
  L[0] = dry * Math.max(day * (0.35 + 0.65 * bright), 0.55 * low) * (0.55 + 0.45 * morn + 0.45 * day);
  L[1] = day * dry * calm * bright * (0.5 + 0.5 * morn + 0.5 * day);
  L[2] = day * dry * calm * bright * (0.45 + 0.55 * day);
  L[3] = day * dry * calm * (0.45 + 0.55 * bright) * (0.4 + 0.6 * day);
  // Moths at dusk/night; gnats in humid low light; fireflies only in real dark.
  L[4] = Math.max(low * 0.75, dark) * dry * calm;
  L[5] = Math.max(low, 0.2 * day) * dry * calm * (0.6 + 0.4 * env.humid);
  L[6] = Math.max(low, dark * 0.7, env.humid * 0.35) * calm * dry;
  L[7] = 0.5 + 0.5 * dry; L[8] = 1 - env.v[1] * 0.85;
  L[9] = dark * dry * calm * (0.7 + 0.3 * (1 - env.cover));
};
BugLife.prototype.update = function (dt, time, cx, cy, cz) {
  this.time = time; this.cx = cx; this.cy = cy; this.cz = cz;
  this.levels();
  const rnd = this.rnd, heard = this.heard = {};
  for (const a of this.agents) {
    const B = BUGS[a.sp], out = a.seed < this.lvl[a.sp] * 1.02;
    const far = Math.hypot(a.hx - cx, a.hz - cz) > B.reach * 1.3;
    if (!out || far) {
      a.on = false;
      if (!out) continue;
      a.wait -= dt;
      if (a.wait > 0) continue;
      a.wait = 0.5 + rnd();
      if (!this.newHome(a, cx, cz)) continue;
      a.on = true;
    } else if (!a.on) { a.on = true; }
    const d = Math.hypot(a.x - cx, a.y - cy, a.z - cz);
    a.scare = !this.calm && d < 0.7;
    if (d < 1.5 && (heard[B.id] == null || d < heard[B.id])) heard[B.id] = d;
    this[B.id](a, dt, B);
    // Nothing flies into the eye: within arm's reach it veers off.
    if (a.scare && a.amp > 0) { const k = (0.7 - d) * 6 * dt / Math.max(d, 0.05); a.x += (a.x - cx) * k; a.z += (a.z - cz) * k; }
  }
};
// Dragonfly: hover over shallows, snap round, dart along a patrol; damselflies stay closer and slower.
BugLife.prototype.dragonfly = function (a, dt, B) {
  const rnd = this.rnd, slim = B.id === 'damselfly';
  a.t -= dt;
  if (a.st === 0) {
    const e = Math.exp(-dt * (slim ? 10 : 12));
    a.vx *= e; a.vy *= e; a.vz *= e;
    // Hover bob: irregular altitude, not a metronome.
    const bob = Math.sin(this.time * (6.5 + a.seed * 4) + a.seed * 40) * (slim ? 0.012 : 0.028)
      + Math.sin(this.time * 2.1 + a.seed * 11) * 0.01;
    a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt + bob * dt * 8;
    a.pitch *= e; a.roll *= e;
    if (a.k > 0) { const s = Math.min(a.k, dt * 8); a.yaw += s * a.dir; a.k -= s; }
    else if (rnd() < dt * (slim ? 0.55 : 0.85)) { a.k = 0.4 + rnd() * (slim ? 0.9 : 1.6); a.dir = rnd() < 0.5 ? -1 : 1; }
    this.blow(a, slim ? 0.02 : 0.04, dt);
    if (a.t < 0) {
      if (rnd() < (slim ? 0.55 : 0.18) || env.cover > 0.75) { a.st = 2; a.t = 5 + rnd() * 4; }
      else {
        a.st = 1; a.t = slim ? 3 + rnd() * 3 : 4 + rnd() * 4;
        for (let k = 0; k < 6; k++) {
          const r = slim ? 0.4 + rnd() * 1.4 : 1.2 + rnd() * 7, q = rnd() * 6.28;
          a.tx = a.hx + Math.cos(q) * r; a.tz = a.hz + Math.sin(q) * r;
          if (fieldSample(this.world, a.tx, a.tz) < -0.02) break;
          a.tx = a.hx; a.tz = a.hz;
        }
        a.ty = (slim ? 0.1 : 0.25) + rnd() * (slim ? 0.35 : 1.15);
      }
    }
  } else if (a.st === 1) {
    // Occasional mid-dash jink so patrols are not straight lines.
    if (rnd() < dt * 1.2) { a.tx += (rnd() - 0.5) * (slim ? 0.25 : 0.8); a.tz += (rnd() - 0.5) * (slim ? 0.25 : 0.8); }
    if (this.fly(a, a.tx, a.ty, a.tz, slim ? 1.1 : 5.5, slim ? 5 : 22, dt) < 0.14 || a.t < 0) {
      a.st = 0; a.t = 0.5 + rnd() * (slim ? 1.4 : 2.8);
    }
  } else if (a.st === 2) {
    const py = fieldSample(this.world, a.px, a.pz) + 0.0105 * a.sc;
    if (this.fly(a, a.px, py, a.pz, slim ? 0.7 : 2.2, 10, dt) < 0.014 || a.t < 0) {
      a.st = 3; a.t = 3 + rnd() * 12; a.x = a.px; a.y = py; a.z = a.pz; a.vx = a.vy = a.vz = 0; a.pitch = 0; a.roll = 0;
    }
  } else if (a.t < 0 || a.scare) { a.st = 1; a.t = 4; a.tx = a.hx; a.tz = a.hz; a.ty = slim ? 0.35 : 0.7; }
  const up = a.st < 3;
  a.amp = up ? (slim ? 0.42 : 0.55) : 0; a.wing = up ? 0.05 : slim ? 0.3 : -0.16; a.sweep = up ? 0 : slim ? 1.3 : -0.22;
  if (up) a.ph += dt * (slim ? 128 : 175);
};
BugLife.prototype.damselfly = BugLife.prototype.dragonfly;
// Somewhere to feed: mostly another blossom on the same shrub, sometimes one across the clearing.
BugLife.prototype.bloom = function (a, r) {
  const i = this.pick(this.sites.bloom, a.x, a.z, r, 0.03), S = this.sites.bloom;
  if (i < 0) return;
  a.site = i; a.tx = S[i]; a.ty = S[i + 1]; a.tz = S[i + 2];
};
// Butterfly: an unsteady line toward a flower, lifted by each wingbeat, then a rest on it
// with the wings shut, opening them slowly to the sun.
BugLife.prototype.butterfly = function (a, dt) {
  const rnd = this.rnd;
  a.t -= dt;
  if (a.st === 0) {
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    const sp = (0.85 + a.seed * 0.9) * Math.min(1, Math.max(0.035, d * 1.05));
    // Erratic steering: short side-gusts, not a constant turn bias.
    a.k = (a.k + (rnd() - 0.5) * 42 * dt) * Math.exp(-dt * 1.2);
    if (rnd() < dt * 2.5) a.k += (rnd() - 0.5) * 8;
    a.yaw += (angTo(a.yaw, Math.atan2(dz, dx)) * (d > 3 ? 0.55 : 2.1 + 2.5 / (d + 0.12)) + a.k * Math.min(1, d)) * dt;
    a.ph += dt * (48 + a.seed * 18);
    const loft = d > 0.45 ? 0.25 + 0.35 * Math.sin(this.time * 0.55 + a.seed * 28) + Math.min(d, 6) * 0.1 : 0.006;
    const goal = a.ty + loft;
    a.by += (goal - a.by) * Math.min(1, dt * (d > 0.45 ? 1.8 : 4.5));
    a.x += Math.cos(a.yaw) * sp * dt; a.z += Math.sin(a.yaw) * sp * dt;
    a.y = Math.max(this.ground(a.x, a.z) + 0.05, a.by + 0.022 * Math.sin(a.ph + 1.1) * Math.min(1, d * 2.5));
    this.blow(a, 0.14, dt);
    a.pitch = 0.25 + 0.28 * Math.sin(a.ph); a.roll = Math.max(-0.55, Math.min(0.55, -a.k * 0.18));
    a.wing = 0.32; a.amp = 0.92; a.sweep = 0;
    if (d < 0.035 && Math.abs(a.by - a.ty) < 0.035) { a.st = 1; a.t = 2.5 + rnd() * 9; a.x = a.tx; a.z = a.tz; a.y = a.ty + 0.0075 * a.sc; }
    else if (a.t < -18) { this.bloom(a, 14); a.t = 0; }
  } else {
    a.amp = 0; a.pitch = 0.45; a.roll = 0; a.sweep = 0;
    a.wing = 1.42 - 1.0 * Math.pow(Math.max(0, Math.sin(this.time * 0.75 + a.seed * 20)), 3);
    if (a.t < 0 || a.scare) { this.bloom(a, rnd() < 0.55 ? 1.8 : 18); a.st = 0; a.t = 0; a.by = a.y + 0.06; }
  }
};
// Bee: straight to a shrub, a moment hanging in front of a blossom, down onto it, then the
// next one along. A hawk moth works the same flowers at dusk without ever landing.
BugLife.prototype.bee = function (a, dt, B) {
  const rnd = this.rnd, moth = B.id === 'moth', S = this.sites.bloom, i = a.site, ox = S[i + 3] * 0.04, oz = S[i + 4] * 0.04;
  a.t -= dt;
  a.ph = moth ? a.ph + dt * 210 : a.ph + dt * (90 + a.seed * 40);
  a.amp = moth ? 0.68 : 0.72; a.wing = 0.1; a.sweep = moth ? 0.12 : 0.22;
  if (a.st === 0) {
    // Local foraging: approach with a small lateral weave, not a laser line.
    const weave = Math.sin(this.time * 3.4 + a.seed * 14) * (moth ? 0.04 : 0.025);
    const d = this.fly(a, S[i] + ox + weave * S[i + 4], S[i + 1] + 0.04 + Math.abs(weave) * 0.3, S[i + 2] + oz - weave * S[i + 3],
      a.k > 0 ? 0.85 : (moth ? 3.2 : 4.0), moth ? 11 : 14, dt);
    this.blow(a, moth ? 0.06 : 0.035, dt);
    if (d < 0.055 || a.t < -9) { a.st = 1; a.t = 0.35 + rnd() * (moth ? 2.8 : 1.0); }
  } else if (a.st === 1) {
    const w = Math.sin(this.time * 2.1 + a.seed * 9) * 0.016;
    this.fly(a, S[i] + ox - S[i + 4] * w, S[i + 1] + 0.028 + 0.005 * Math.sin(this.time * 2.8 + a.seed), S[i + 2] + oz + S[i + 3] * w, 0.45, 8, dt);
    a.yaw += angTo(a.yaw, Math.atan2(-S[i + 4], -S[i + 3])) * Math.min(1, dt * 10); a.pitch = 0.22; a.roll = 0;
    if (a.t < 0) { if (moth) { this.bloom(a, rnd() < 0.7 ? 1.8 : 16); a.st = 0; a.k = 1; a.t = 0; } else { a.st = 2; a.t = 0.9 + rnd() * 3.2; } }
  } else {
    // She clings along the column, head down toward the nectar, and shuffles as she feeds.
    const fx = S[i + 3], fz = S[i + 4], hh = Math.hypot(fx, fz), fy = Math.sqrt(Math.max(0, 1 - hh * hh)), up = (0.006 * a.sc + 0.0015) / Math.max(hh, 0.2), e = Math.min(1, dt * 8);
    a.x += (S[i] - fx * fy * up - a.x) * e; a.y += (S[i + 1] + hh * hh * up - a.y) * e; a.z += (S[i + 2] - fz * fy * up - a.z) * e;
    a.yaw += angTo(a.yaw, Math.atan2(-fz, -fx) + 0.3 * Math.sin(this.time * 1.7 + a.seed * 30)) * e; a.pitch = -Math.asin(Math.min(1, fy)); a.roll = 0; a.amp = 0; a.sweep = 1.15; a.wing = 0.12;
    if (a.t < 0 || a.scare) { const hop = rnd() < 0.75; this.bloom(a, hop ? 1.6 : 14); a.st = 0; a.k = hop ? 1 : 0; a.t = 0; }
  }
};
BugLife.prototype.moth = BugLife.prototype.bee;
// Gnats dance in a loose ball over one spot, each rising and dropping on its own beat. A
// mosquito does the same alone and lower, legs hanging.
BugLife.prototype.gnat = function (a, dt, B) {
  const rnd = this.rnd, lone = B.id === 'mosquito', t = this.time;
  let cx = a.hx, cy = a.hy + 0.9, cz = a.hz, r = 0.5;
  if (!lone) {
    const s = a.sw;
    // Irregular swarm centroid — slow drift, not a perfect circle.
    cx = s.x + Math.sin(t * 0.19 + s.seed * 9) * 0.55 + Math.sin(t * 0.07 + s.seed) * 0.2;
    cz = s.z + Math.cos(t * 0.15 + s.seed * 5) * 0.55 + Math.cos(t * 0.11 + s.seed * 2) * 0.18;
    cy = this.ground(cx, cz) + 1.35 + 0.35 * Math.sin(t * 0.12 + s.seed * 7) + 0.15 * env.humid;
    r = 0.24 + 0.16 * Math.sin(t * 0.27 + s.seed * 3);
  } else if (a.t < 0) {
    a.t = 2 + rnd() * 4;
    a.tx = a.hx + (rnd() - 0.5) * 3; a.tz = a.hz + (rnd() - 0.5) * 3;
    a.ty = this.ground(a.tx, a.tz) + 0.35 + rnd() * 1.2;
  }
  if (lone) { a.t -= dt; cx = a.tx; cy = a.ty; cz = a.tz; }
  const k = lone ? 1.4 : 6.2 / r * 0.35, push = lone ? 2.8 : 8;
  a.vx += ((cx - a.x) * k + (rnd() - 0.5) * push) * dt;
  a.vz += ((cz - a.z) * k + (rnd() - 0.5) * push) * dt;
  a.vy += ((cy - a.y) * k * 1.35 + Math.sin(t * (3.6 + a.seed * 5) + a.seed * 60) * (lone ? 1.4 : 6.5)) * dt;
  const e = Math.exp(-dt * 2.3);
  a.vx *= e; a.vy *= e; a.vz *= e;
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  this.blow(a, lone ? 0.11 : 0.055, dt);
  a.yaw += angTo(a.yaw, Math.atan2(a.vz, a.vx)) * Math.min(1, dt * 7);
  a.pitch = 0.18; a.ph += dt * (lone ? 160 : 200); a.amp = 0.75; a.wing = 0.1; a.sweep = 0.28;
};
BugLife.prototype.mosquito = BugLife.prototype.gnat;
// Beetle: walk, stop, turn, walk. It keeps off steep ground and out of the water.
BugLife.prototype.beetle = function (a, dt) {
  const rnd = this.rnd, w = this.world;
  a.t -= dt;
  if (a.st === 0) {
    const sp = 0.04 * a.sc, nx = a.x + Math.cos(a.yaw) * sp * dt, nz = a.z + Math.sin(a.yaw) * sp * dt, g = fieldSample(w, nx, nz);
    if (g < 0.3 || fieldSlope(w, nx, nz) > 0.6) a.yaw += 2.5 * dt * 8;
    else { a.x = nx; a.z = nz; a.gait += dt * sp / 0.0032 * 1.6; }
    a.yaw += a.k * dt;
    if (a.t < 0) { a.st = 1; a.t = 0.4 + rnd() * 2.5; }
  } else if (a.t < 0) { a.st = 0; a.t = 0.8 + rnd() * 4; a.k = (rnd() - 0.5) * 1.6; if (rnd() < 0.4) a.yaw += (rnd() - 0.5) * 2.5; }
  const c = Math.cos(a.yaw), s = Math.sin(a.yaw), e = 0.02;
  a.y = fieldSample(w, a.x, a.z);
  a.pitch = Math.atan2(fieldSample(w, a.x + c * e, a.z + s * e) - a.y, e); a.roll = Math.atan2(fieldSample(w, a.x - s * e, a.z + c * e) - a.y, e);
};
// Ant: out along the trail and back, stopping to touch antennae, never quite on the line.
BugLife.prototype.ant = function (a, dt) {
  const P = a.sw.pts, n = P.length / 2 - 1, len = n * 0.22, rnd = this.rnd;
  if (a.t > 0) a.t -= dt;
  else { a.s += a.dir * a.v * dt; a.gait += dt * a.v / 0.0009 * 1.6; if (rnd() < dt * 0.3) a.t = 0.15 + rnd() * 0.6; }
  if (a.s < 0 || a.s > len) { a.dir = -a.dir; a.s = Math.max(0, Math.min(len, a.s)); a.t = 0.4 + rnd(); a.leaf = a.dir < 0 && rnd() < 0.55; }
  const u = a.s / 0.22, i = Math.min(n - 1, u | 0), f = u - i, tx = P[i * 2 + 2] - P[i * 2], tz = P[i * 2 + 3] - P[i * 2 + 1], tl = Math.hypot(tx, tz) || 1;
  const off = a.lane + Math.sin(a.s * 9 + a.seed * 40) * 0.01;
  a.x = P[i * 2] + tx * f - tz / tl * off; a.z = P[i * 2 + 1] + tz * f + tx / tl * off;
  a.y = fieldSample(this.world, a.x, a.z);
  a.yaw += angTo(a.yaw, Math.atan2(tz, tx) + (a.dir < 0 ? Math.PI : 0)) * Math.min(1, dt * 6);
};
// Firefly: the ones on the wing drift through the dark and flash on their own count, rising
// as they do. The ones sitting in the leaves answer a flash near them two seconds later.
BugLife.prototype.firefly = function (a, dt) {
  const rnd = this.rnd;
  a.t -= dt; a.fl -= dt;
  if (a.st === 0) {
    a.k -= dt;
    if (a.k < 0) {
      a.k = 1.8 + rnd() * 5;
      a.tx = a.hx + (rnd() - 0.5) * 8; a.tz = a.hz + (rnd() - 0.5) * 8;
      a.ty = this.ground(a.tx, a.tz) + 0.35 + rnd() * 2.0;
    }
    this.fly(a, a.tx, a.ty, a.tz, 0.45 + a.seed * 0.2, 1.0, dt);
    this.blow(a, 0.07, dt);
    a.amp = 0.65; a.ph += dt * 40; a.wing = 0.18; a.sweep = 0.28; a.pitch = 0.45;
    if (a.t < 0) {
      // Irregular blink interval — not a metronome.
      a.t = a.per * (0.7 + 0.7 * rnd()); a.fl = 0.35 + rnd() * 0.25; a.vy += 0.35 + rnd() * 0.35;
      for (let i = this.first[9]; i < this.first[10]; i++) {
        const o = this.agents[i];
        if (o.on && o.st === 1 && o.t > 5 && rnd() < 0.45 && Math.hypot(o.x - a.x, o.z - a.z) < 7) o.t = 1.5 + rnd() * 0.8;
      }
    }
  } else {
    a.amp = 0; a.sweep = 1.2; a.wing = 0.1; a.pitch = 0;
    if (a.t < 0) { a.t = 1e9; a.fl = 0.4 + rnd() * 0.2; }
  }
  if (a.pin) a.fl = 0.22;
  // Soft envelope: slow rise, soft fall — not a hard LED pulse.
  if (a.fl > 0) {
    const rise = Math.min(1, (0.4 - a.fl) / 0.1);
    const fall = Math.min(1, a.fl / 0.28);
    a.glow = Math.max(0, rise * fall);
  } else a.glow = 0;
};
// Pick levels of detail, cull, and write the instances grouped by mesh.
BugLife.prototype.collect = function (out, vp, ex, ey, ez, pxw, ranges) {
  const counts = this.counts, starts = this.starts;
  counts.fill(0);
  for (const a of this.agents) {
    a.slot = -1;
    if (!a.on) continue;
    const B = BUGS[a.sp], L = B.len * a.sc, x = a.x, y = a.y, z = a.z, dist = Math.hypot(x - ex, y - ey, z - ez);
    if (dist > B.reach) continue;
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15], cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cv = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    if (cw < -L || Math.abs(cx) > cw + L * 3 || Math.abs(cv) > cw + L * 3) continue;
    a.slot = (a.sp === 8 && a.leaf ? 20 : a.sp * 2) + (L > dist * 0.02 ? 0 : 1);
    // Too small to cover a pixel, it is drawn a few pixels long and that much fainter.
    a.big = Math.max(1, dist * pxw * 4 / L);
    counts[a.slot]++;
  }
  let run = 0;
  const draws = [];
  for (let k = 0; k < 22; k++) {
    starts[k] = run;
    if (counts[k]) { const g = ranges[k]; draws.push(g.first, g.count, g.base, run, counts[k]); }
    run += counts[k];
  }
  for (const a of this.agents) {
    if (a.slot < 0) continue;
    const t = starts[a.slot]++ * BUG_STRIDE;
    out[t] = a.x; out[t + 1] = a.y; out[t + 2] = a.z; out[t + 3] = a.yaw;
    out[t + 4] = a.sc * a.big; out[t + 5] = a.pitch; out[t + 6] = a.roll; out[t + 7] = a.sweep;
    out[t + 8] = a.tint[0]; out[t + 9] = a.tint[1]; out[t + 10] = a.tint[2]; out[t + 11] = a.glow;
    out[t + 12] = a.wing; out[t + 13] = a.amp; out[t + 14] = a.ph; out[t + 15] = a.gait;
    out[t + 16] = Math.pow(a.big, -1.5);
    // Whatever is at a blossom rides the plant as it leans in the wind.
    const P = this.perch, q = a.st > 0 && BUGS[a.sp].site === 'bloom' ? a.site : -1;
    out[t + 17] = q < 0 ? 0 : P[q + 4];
    for (let k = 0; k < 4; k++) out[t + 20 + k] = q < 0 ? 0 : P[q + k];
  }
  draws.end = run;
  return draws;
};
// For captures: the nearest animal of a kind, in a given state if one is asked for.
BugLife.prototype.find = function (id, st) {
  let best = null, bd = 1e9;
  for (const a of this.agents) {
    if (!a.on || BUGS[a.sp].id !== id || (st != null && a.st !== st)) continue;
    const d = Math.hypot(a.x - this.cx, a.z - this.cz);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
};

const BUG_WGSL = `
struct BugIn {
  @location(0) p: vec3<f32>,
  // As a plant's vertex: normal and kind, colour and sway.
  @location(1) n: vec4<f32>,
  @location(2) c: vec4<f32>,
  @location(5) uv: vec2<f32>,
  // Instance: place and heading; size, pitch, roll, wing sweep; tint and glow or wing
  // pattern; wing angle, beat depth, beat phase, walking phase; fade.
  @location(6) i0: vec4<f32>,
  @location(7) i1: vec4<f32>,
  @location(8) i2: vec4<f32>,
  @location(9) i3: vec4<f32>,
  @location(10) i4: vec4<f32>,
  @location(11) i5: vec4<f32>,
}
struct BugV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
  @location(3) kind: f32,
  @location(4) uv: vec2<f32>,
  @location(5) glow: vec2<f32>,
}
// A wing is swept back about the body's upright and lifted about its long axis; a walking leg
// swings from the hip; then the whole animal is rolled, pitched, turned and put in its place.
fn bugTurn(in: BugIn, v0: vec3<f32>, place: f32) -> vec3<f32> {
  var v = v0;
  let k = i32(in.n.w + 0.5);
  if (k == 2 || k == 3) {
    let side = sign(in.c.w);
    let th = in.i3.x + in.i3.y * sin(in.i3.z - (abs(in.c.w) - 1.0) * 1.3);
    let cs = cos(in.i1.w); let sn = sin(in.i1.w);
    let ct = cos(th); let st = sin(th);
    let zz = v.z * side;
    let x1 = v.x * cs - zz * sn;
    let z1 = v.x * sn + zz * cs;
    v = vec3<f32>(x1, v.y * ct + z1 * st, (z1 * ct - v.y * st) * side);
  } else if (in.c.w != 0.0 && place > 0.5) {
    let ph = in.i3.w + select(0.0, 3.14159, in.c.w < 0.0);
    v.x += sin(ph) * abs(in.c.w);
    v.y += max(cos(ph), 0.0) * abs(in.c.w) * 0.4;
  }
  let cr = cos(in.i1.z); let sr = sin(in.i1.z);
  v = vec3<f32>(v.x, v.y * cr - v.z * sr, v.y * sr + v.z * cr);
  let cp = cos(in.i1.y); let sp = sin(in.i1.y);
  v = vec3<f32>(v.x * cp - v.y * sp, v.x * sp + v.y * cp, v.z);
  var w = spinY(v, in.i0.w) * mix(1.0, in.i1.x, place) + in.i0.xyz * place;
  if (in.i4.y > 0.0 && place > 0.5) { w += plantShift(plantLean(in.i5.xy, in.i5.z, in.i5.w, 1.0).xy, in.i4.y); }
  return w;
}
@vertex fn vsBug(in: BugIn) -> BugV {
  var o: BugV;
  o.world = bugTurn(in, in.p, 1.0);
  if (in.n.w > 4.5) { o.world += (F.right * in.uv.x + F.upv * in.uv.y) * 0.06 + normalize(F.camPos - o.world) * 0.03; }
  o.nrm = bugTurn(in, in.n.xyz, 0.0);
  o.col = in.c.rgb * in.i2.rgb;
  if ((in.n.w > 1.5 && in.n.w < 2.5) || in.n.w > 5.5) { o.col = in.c.rgb; }
  o.kind = in.n.w;
  o.uv = in.uv;
  o.glow = vec2<f32>(in.i2.w, in.i4.x);
  o.clip = F.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}
@vertex fn vsShadowBug(in: BugIn) -> ShadowV {
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(bugTurn(in, in.p, 1.0), 1.0);
  if (in.n.w > 4.5) { o.clip = vec4<f32>(0.0, 0.0, 2.0, 1.0); }
  return o;
}
@fragment fn fsBug(in: BugV) -> @location(0) vec4<f32> {
  let sh = sunShadow(in.world) * cloudShade(in.world.xz, in.world.y);
  let fw = fwidth(in.uv);
  let k = i32(in.kind + 0.5);
  let V = normalize(F.camPos - in.world);
  var n = normalize(in.nrm);
  let under = dot(n, V) < 0.0;
  if (under) { n = -n; }
  let dist = length(F.camPos - in.world);
  let fine = sat(1.3 - dist * 0.7);
  let nl = dot(n, F.sunDir);
  let hemi = n.y * 0.5 + 0.5;
  let light = F.sunCol * max(nl, 0.0) * sh * 1.2 + F.amb.rgb * (0.3 + 0.5 * hemi) + vec3<f32>(0.26, 0.19, 0.11) * F.amb.w * (1.0 - hemi) * 0.4;
  let H = normalize(V + F.sunDir);
  let nh = max(dot(n, H), 0.0);
  let fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  var col = in.col * light;
  var a = in.glow.y;
  if (k == 5) {
    // Soft warm pulse — a living lantern, not an LED. Fades with distance via alpha.
    let r = length(in.uv);
    let ha = exp(-r * r * 3.2) * in.glow.x * 0.45 * sat(1.0 - r);
    if (ha < 0.008) { discard; }
    let warm = vec3<f32>(0.72, 0.95, 0.22) * (0.18 + 0.85 * exp(-r * r * 9.0));
    return vec4<f32>(tonemap(warm / max(F.exposure, 1.0)), ha);
  } else if (k == 4) {
    col += vec3<f32>(0.7, 0.95, 0.28) * in.glow.x * 5.5 / max(F.exposure, 1.0);
  } else if (k == 2) {
    // A clear wing: a film stretched on dark veins, with a thickened cell near the tip. The
    // film itself is nearly invisible until it catches the sun or the sky.
    let u = in.uv.x;
    let v = in.uv.y;
    let row = v * 5.0 + u * 0.9;
    // Veins are hair-thin: each is as dark as the share of the pixel it covers.
    let fr1 = fw.y * 5.0 + fw.x * 0.9;
    let fr2 = fw.x * 17.0;
    let vl = (1.0 - smoothstep(0.03, 0.03 + fr1, abs(fract(row) - 0.5))) * sat(0.3 / fr1);
    let vc = (1.0 - smoothstep(0.03, 0.03 + fr2, abs(fract(u * 17.0 + floor(row) * 0.37) - 0.5))) * sat(0.22 / fr2);
    let vein = max(max(vl, vc * 0.7) * 0.75, 1.0 - smoothstep(0.03, 0.07 + fw.y, v));
    let stig = smoothstep(0.74, 0.77, u) * smoothstep(0.89, 0.86, u) * (1.0 - smoothstep(0.12, 0.2, v));
    let dark = max(vein, stig);
    let shine = F.sunCol * (pow(nh, 90.0) * 3.0 + pow(nh, 9.0) * 0.2) * sh + F.amb.rgb * fr * 0.5;
    let thru = F.sunCol * max(-dot(normalize(in.nrm), F.sunDir) * select(1.0, -1.0, under), 0.0) * sh * 0.25;
    col = in.col * mix(light * 0.6 + thru, light * 0.07, dark) + shine;
    a *= sat(mix(0.2 + 0.2 * (1.0 - fine), 0.85, dark) + dot(shine, vec3<f32>(0.4)) + fr * 0.25);
  } else if (k == 3) {
    // A scaled wing. Dark veins and a dark border with pale spots; what is inside the border
    // depends on the kind: plain colour, a blue that shifts with the angle, bands, or bark.
    let u = in.uv.x;
    let v = in.uv.y;
    let kind = i32(in.glow.x + 0.5);
    let border = max(smoothstep(0.7, 0.86, u), smoothstep(0.72, 0.92, v) * smoothstep(0.15, 0.5, u));
    let veins = (1.0 - smoothstep(0.03, 0.09, abs(fract(v * 4.0 + u * 1.3) - 0.5))) * smoothstep(0.08, 0.3, u) * fine;
    let spot = smoothstep(0.34, 0.22, length(fract(vec2<f32>(u * 9.0, v * 5.0 + 0.25)) - 0.5)) * border;
    var base = in.col;
    var ink = max(border, veins * 0.85);
    if (kind == 1) {
      base = mix(in.col, in.col.gbr * 1.2 + vec3<f32>(0.0, 0.25, 0.3), fr) * (1.0 + 2.0 * pow(nh, 12.0));
      ink = border;
    } else if (kind == 2) {
      ink = max(smoothstep(0.8, 0.9, u), veins * 0.5) * 0.9 + smoothstep(0.06, 0.02, abs(u - 0.45 - v * 0.15)) * 0.8;
    } else if (kind == 3) {
      let g = n2(vec2<f32>(u * 13.0, v * 6.0));
      base = in.col * (0.55 + 0.75 * g);
      ink = smoothstep(0.75, 1.0, sin(u * 26.0 + g * 5.0)) * 0.7 + smoothstep(0.07, 0.03, length(vec2<f32>(u - 0.55, (v - 0.45) * 0.6))) * 0.9;
    }
    var alb = mix(base, vec3<f32>(0.02, 0.016, 0.012), sat(ink));
    alb = mix(alb, vec3<f32>(0.9, 0.88, 0.8), spot * select(0.9, 0.0, kind == 3));
    // The underside is the dull one.
    if (under) { alb = mix(alb, vec3<f32>(dot(alb, vec3<f32>(0.4, 0.5, 0.1))) * vec3<f32>(1.0, 0.86, 0.66), 0.55); }
    col = alb * (light + F.sunCol * max(-nl, 0.0) * sh * 0.45);
  } else if (k == 1 || k == 6) {
    // Fur holds light at its edge instead of throwing a highlight.
    col *= 1.0 + 0.9 * fr;
  } else {
    // The joints between segments are dull and dark; the plates between them shine.
    let ring = smoothstep(0.34, 0.5, abs(fract(in.uv.x) - 0.5)) * step(0.001, in.uv.x) * sat(0.5 / max(fw.x, 0.001) * 0.2);
    col *= 1.0 - 0.8 * ring;
    col += (1.0 - ring) * (F.sunCol * pow(nh, 70.0) * sh * 1.4 + F.amb.rgb * fr * 0.35) * (0.3 + 0.7 * sat(dot(in.col, vec3<f32>(1.5))));
  }
  // Too far off to have a shape, an insect is a mote: dark with the light behind the eye,
  // a bright point when the sun is beyond it and in its wings.
  let tiny = 1.0 - in.glow.y;
  if (tiny > 0.01) { col = mix(col, F.sunCol * sh * (0.1 + 1.8 * pow(0.5 - 0.5 * dot(V, F.sunDir), 5.0)) + F.amb.rgb * 0.25, tiny * 0.8); }
  if (a < 0.02) { discard; }
  return vec4<f32>(tonemap(applyFog(col, in.world)), a);
}
`;
