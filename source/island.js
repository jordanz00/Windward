// Fixed-seed coast. +x is east, +z is north, y is up, meters.
// The shape is an SDF so the beach, the windward cliffs and the lagoon
// stay in the same places; noise only roughens them.

function ihash(ix, iz) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = ihash(x0, z0), b = ihash(x0 + 1, z0);
  const c = ihash(x0, z0 + 1), d = ihash(x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x, z, oct) {
  let v = 0, a = 0.5, f = 1, s = 0;
  const n = oct || 4;
  for (let i = 0; i < n; i++) {
    v += a * vnoise(x * f, z * f);
    s += a;
    f *= 2.03;
    a *= 0.5;
  }
  return v / s;
}

function ridged(x, z) {
  let v = 0, a = 0.55, f = 1, s = 0;
  for (let i = 0; i < 3; i++) {
    let n = vnoise(x * f, z * f);
    n = 1 - Math.abs(n * 2 - 1);
    v += a * n * n;
    s += a;
    f *= 2.09;
    a *= 0.5;
  }
  return v / s;
}

function sat(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function ler(a, b, t) { return a + (b - a) * t; }
function ss(e0, e1, x) {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// Normalized island SDF. Negative is land. Units are "ellipse radii", not meters.
function islandSdf(x, z) {
  const w = (fbm(x * 0.0036 + 2.2, z * 0.0036, 3) - 0.5) * 36;
  const wx = x + w;
  const wz = z + (fbm(x * 0.0031, z * 0.0034 + 8.0, 3) - 0.5) * 26;

  // Main mass, a west-facing beach shoulder, a northern headland.
  // Two horns on the east leave a bay between them instead of a closed lake.
  let d = Math.hypot(wx / 176, wz / 124) - 1;
  d = smin(d, Math.hypot((wx + 55) / 140, (wz + 6) / 86) - 1, 0.6);
  d = smin(d, Math.hypot((wx + 6) / 58, (wz - 102) / 78) - 1, 0.4);
  d = smin(d, Math.hypot((wx - 118) / 70, (wz - 58) / 32) - 1, 0.34);
  d = smin(d, Math.hypot((wx - 124) / 64, (wz + 62) / 30) - 1, 0.34);

  // Open bay. Where the bay SDF is negative, land is removed, and because the
  // bay crosses the eastern shoreline it stays connected to the sea.
  const lag = Math.hypot((wx - 128) / 78, (wz + 2) / 48) - 1;
  d = smax(d, -lag, 0.85);

  return { d: d, lag: lag, wx: wx, wz: wz };
}

function isletSdf(x, z) {
  return Math.hypot((x + 214) / 34, (z - 36) / 24) - 1;
}

// Meters. Called once per texel while the field is built.
function coastHeight(x, z) {
  const s = islandSdf(x, z);
  const d = s.d;
  const islet = isletSdf(x, z);
  const mask = ss(0.045, -0.22, d);
  const isletM = ss(0.04, -0.18, islet);

  const peak = Math.exp(-((s.wx + 22) * (s.wx + 22) + (s.wz - 4) * (s.wz - 4)) / (2 * 58 * 58));
  const n = fbm(x * 0.0055, z * 0.0055, 4);
  const ridge = ridged(x * 0.0075, z * 0.007);

  // Broad hills. High frequency roughness is left to the shader, so slopes
  // here stay gentle enough to walk and to read as grass rather than rubble.
  let h = (5 + n * 9 + ridge * 5 + peak * 38) * mask;
  const windward = ss(20, -110, s.wx) * ss(-30, 90, s.wz);
  const coast = ss(-0.38, 0.02, d);
  const flatten = coast * (1 - windward * 0.95);
  h = h * (1 - flatten * 0.92);

  // A walkable beach wherever the coast was flattened: a few meters of sand
  // that crosses sea level.
  const beach = ss(0.02, -0.2, d) * ss(-0.46, -0.16, d) * (1 - windward);
  const beachH = (1 - ss(-0.2, 0.02, d)) * 2.4;
  h = h * (1 - beach) + Math.min(Math.max(h, 0.15), beachH) * beach;

  // Drainage off the summit, south-east, so the slope isn't a uniform dome.
  const along = (s.wz + 10) / 160;
  const vx = -10 + along * 55;
  const valley = Math.exp(-((s.wx - vx) * (s.wx - vx)) / (2 * 22 * 22)) * ss(50, -90, s.wz);
  h *= 1 - valley * mask * 0.42;

  // The bay is a cove, not a hole cut into the hillside.
  const nearBay = ss(0.85, -0.1, s.lag);
  h *= 1.0 - nearBay * 0.8;

  // Headland cliffs: extra height on the northern nose, falling straight into the sea.
  const nose = ss(78, 140, s.wz) * ss(0.02, -0.22, d);
  h += nose * (6 + ridge * 6);

  // Islet.
  const ih = isletM * (2.5 + fbm(x * 0.02, z * 0.02, 3) * 5 + ridged(x * 0.015, z * 0.015) * 4);
  h = Math.max(h, ih);

  // Living Deep Ocean bathymetry: reef garden → wall → mid shelf → slope → abyss,
  // with trenches, seamounts, sand channels, shelf notches, and wreck hollows.
  // Height-field only (no true caves/overhangs). Surface FFT / nearshore untouched.
  const dist = Math.hypot(x, z);
  let bed = -4.2 - Math.max(0, dist - 140) * 0.072;
  bed += (fbm(x * 0.012 + 3, z * 0.012, 3) - 0.5) * 2.2;

  // Continental slope belt east of the reef wall — smooth reef→abyss handoff.
  const slope = ss(230, 310, x) * ss(420, 340, x) * (1 - ss(80, -40, Math.abs(z + 30)));
  bed -= slope * (5.5 + fbm(x * 0.006, z * 0.006, 2) * 2.0);

  // Broad abyssal basin south-east — dark blue, sparse life, biolum territory.
  const basin = Math.exp(-((x - 310) * (x - 310)) / 28000 - ((z + 190) * (z + 190)) / 24000);
  bed -= basin * (12.0 + fbm(x * 0.007, z * 0.007, 2) * 3.5);

  // Narrow trench cutting offshore east — elongated deep channel into the abyss.
  const trench = Math.exp(-((z + 48) * (z + 48)) / 1100) * ss(220, 380, x) * ss(450, 300, x);
  bed -= trench * (11.5 + ridged(x * 0.01, z * 0.04) * 4.0);

  // Secondary trench spur south — feeds the abyssal plain.
  const trenchS = Math.exp(-((x - 300) * (x - 300)) / 1600) * ss(-40, -180, z) * ss(-220, -100, z);
  bed -= trenchS * (7.5 + fbm(x * 0.015, z * 0.02, 2) * 2.2);

  // Rocky ridges / seamounts west and north — kelp-capable shelf when shallow enough.
  // Gate every Math.max raise on its weight; a zero-weight max to a constant floor
  // was clamping the open sea and wiping basins/trenches (same class of bug as the bar).
  const ridgeW = Math.exp(-((x + 120) * (x + 120)) / 4800 - ((z - 80) * (z - 80)) / 3600);
  const ridgeN = Math.exp(-((x - 40) * (x - 40)) / 5200 - ((z - 170) * (z - 170)) / 2800);
  if (ridgeW > 0.02) bed = Math.max(bed, -7.5 + ridgeW * (5.2 + ridged(x * 0.02, z * 0.02) * 1.8));
  if (ridgeN > 0.02) bed = Math.max(bed, -8.0 + ridgeN * (4.8 + fbm(x * 0.018, z * 0.018, 3) * 1.6));

  // Deep seamounts in the abyssal basin — soft-coral footholds, not dry land.
  const mountA = Math.exp(-((x - 340) * (x - 340)) / 2200 - ((z + 210) * (z + 210)) / 1800);
  const mountB = Math.exp(-((x - 290) * (x - 290)) / 1600 - ((z + 250) * (z + 250)) / 1400);
  if (mountA > 0.02) bed = Math.max(bed, -18.0 + mountA * (9.5 + ridged(x * 0.03, z * 0.03) * 2.0));
  if (mountB > 0.02) bed = Math.max(bed, -16.5 + mountB * (7.8 + fbm(x * 0.025, z * 0.025, 2) * 1.8));

  // Sand channels: elongated shallow grooves through the lagoon floor.
  const channel = Math.exp(-((z - 18) * (z - 18)) / 420) * ss(40, 170, x) * ss(190, 90, x);
  bed -= channel * (0.85 + fbm(x * 0.04, z * 0.015, 2) * 0.35);

  const inLag = ss(0.35, -0.6, s.lag);
  const lagFloor = -2.15 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 0.35;
  bed = ler(bed, Math.max(bed, lagFloor), inLag);

  // Reef crest across the bay mouth + steep seaward reef-wall drop-off.
  const reef = Math.exp(-((x - 196) * (x - 196)) / 520 - ((z + 2) * (z + 2)) / 3200);
  if (reef > 0.02) bed = Math.max(bed, -2.6 + reef * 2.15);
  const wall = Math.exp(-((x - 218) * (x - 218)) / 380 - ((z + 2) * (z + 2)) / 4200);
  bed -= wall * (4.8 + ridged(x * 0.025, z * 0.012) * 1.8) * (1 - reef * 0.85);

  // A shoal toward the islet. It stays under the swell so it reads as pale water, not a wall.
  const bar = Math.exp(-((x + 150) * (x + 150)) / 4200 - ((z - 16) * (z - 16)) / 900);
  if (bar > 0.02) bed = Math.max(bed, -1.7 + bar * 0.85);

  // Shelf notches / overhang hints: local raised lips with a hollow just landward —
  // reads as cave mouths in silhouette even though the field is single-valued.
  const notch = Math.exp(-((x - 205) * (x - 205)) / 180 - ((z - 55) * (z - 55)) / 140);
  const lip = Math.exp(-((x - 209) * (x - 209)) / 70 - ((z - 55) * (z - 55)) / 90);
  if (lip > 0.02) bed = Math.max(bed, -3.4 + lip * 1.9);
  bed -= notch * 1.4 * (1 - lip);

  // 1800s wreck hollows — soft depressions on the mid shelf / upper slope (reachable swim band).
  const wreckHollow = Math.exp(-((x - 232) * (x - 232)) / 700 - ((z + 45) * (z + 45)) / 550);
  bed -= wreckHollow * 1.6;
  const wreckHollow2 = Math.exp(-((x - 240) * (x - 240)) / 800 - ((z - 10) * (z - 10)) / 650);
  bed -= wreckHollow2 * 1.9;

  const land = sat(mask + isletM);
  let H = ler(bed, h, land);

  // Dune ripple on the dry beach only (does not move the waterline much).
  if (H > 0.25 && H < 2.2 && windward < 0.4) {
    H += Math.sin(x * 0.22 + fbm(z * 0.05, x * 0.02) * 4) * 0.06;
  }
  return H;
}

// rg field: r = meters, g = wave amplitude 0..1.
// Rows are filled in slices so the page can paint a progress bar.
function fillHeights(data, res, span, j0, j1) {
  const org = -span;
  const step = (span * 2) / (res - 1);
  for (let j = j0; j < j1; j++) {
    const z = org + j * step;
    for (let i = 0; i < res; i++) data[(j * res + i) * 2] = coastHeight(org + i * step, z);
  }
}

function fillDamp(data, res, span, j0, j1) {
  const org = -span;
  const step = (span * 2) / (res - 1);
  const look = [8, 16, 28, 44];
  for (let j = j0; j < j1; j++) {
    const z = org + j * step;
    for (let i = 0; i < res; i++) {
      const o = (j * res + i) * 2;
      const h = data[o];
      let damp = 1;
      if (h > 0.35) damp = 0;
      else {
        let shelter = 0;
        for (let k = 0; k < look.length; k++) {
          const ii = i - ((look[k] / step) | 0);
          if (ii < 0) break;
          if (data[(j * res + ii) * 2] > 1.4) { shelter = 0.55 * (1 - k / look.length); break; }
        }
        const x = org + i * step;
        // Soft lagoon lee only — prior 0.72 shelter left the default beach at ~0.28 scale
        // and read as a dead flat pond. Keep a mild lee, not a mute.
        if (h > -2.2 && x > 40 && x < 210 && z > -80 && z < 70) shelter = Math.max(shelter, 0.28);
        damp = 1 - Math.min(shelter, 0.55);
        // Keep full Gerstner amp through the breaker belt (bed ≳ −2.6 m). Prior
        // ss(0.08,-0.3) starved ankle depths so the beach sheet looked flat.
        // Die out only on dry/almost-dry sand — seaAt / hinge / breaker ribbon own steepening.
        // Bounds check: stay at 1.0 for h ≤ −0.05 (full surf); taper only above that.
        damp *= ss(0.2, -0.05, h);
      }
      data[o + 1] = damp;
    }
  }
}

function makeWorld(res, span, data) {
  return { res: res, span: span, step: (span * 2) / (res - 1), org: -span, data: data };
}

function buildWorldAsync(res, span, progress) {
  const data = new Float32Array(res * res * 2);
  // Yield by the clock, not by the row. A timer per slice costs more than the slice.
  const tick = () => new Promise(function (r) { setTimeout(r, 0); });
  return (async function () {
    let last = performance.now();
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < res; j += 8) {
        const j1 = Math.min(res, j + 8);
        if (pass === 0) fillHeights(data, res, span, j, j1); else fillDamp(data, res, span, j, j1);
        if (performance.now() - last > 48) {
          if (progress) progress(pass ? 0.75 + j1 / res * 0.25 : j1 / res * 0.75);
          await tick();
          last = performance.now();
        }
      }
    }
    return makeWorld(res, span, data);
  })();
}

function fieldSample(world, x, z) {
  const u = (x - world.org) / (world.span * 2) * (world.res - 1);
  const v = (z - world.org) / (world.span * 2) * (world.res - 1);
  const i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= world.res - 1 || j >= world.res - 1) return -26;
  const fx = u - i, fz = v - j;
  const r = world.res;
  const d = world.data;
  const a = d[(j * r + i) * 2], b = d[(j * r + i + 1) * 2];
  const c = d[((j + 1) * r + i) * 2], e = d[((j + 1) * r + i + 1) * 2];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + e) * fx * fz;
}

function fieldDamp(world, x, z) {
  const u = (x - world.org) / (world.span * 2) * (world.res - 1);
  const v = (z - world.org) / (world.span * 2) * (world.res - 1);
  const i = Math.floor(u), j = Math.floor(v);
  if (i < 0 || j < 0 || i >= world.res - 1 || j >= world.res - 1) return 1;
  const fx = u - i, fz = v - j;
  const r = world.res;
  const d = world.data;
  const a = d[(j * r + i) * 2 + 1], b = d[(j * r + i + 1) * 2 + 1];
  const c = d[((j + 1) * r + i) * 2 + 1], e = d[((j + 1) * r + i + 1) * 2 + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + e) * fx * fz;
}

function fieldSlope(world, x, z) {
  const e = world.step;
  const hx = fieldSample(world, x + e, z) - fieldSample(world, x - e, z);
  const hz = fieldSample(world, x, z + e) - fieldSample(world, x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}
