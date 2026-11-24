// Tropical birds: species profiles, meshes (LOD), flocks, beach walkers, insect hunters,
// and perch on vegetation. Behaviour is CPU-side for the local set; the vertex shader flaps,
// banks and glides from per-instance phase/amplitude. Drawn with the plant MeshIn layout.

const BIRD_BODY = 0, BIRD_WING = 1, BIRD_BEAK = 2, BIRD_LEG = 3;

// role: 0 soar flock, 1 coastal flap-glide, 2 beach walker, 3 wader, 4 forest perch/hop,
//       5 insect hunter, 6 aerial insectivore flock
const BIRD_SPECIES = [
  { id: 'frigate', role: 0, n: 18, len: 0.95, reach: 220, cruise: 9, burst: 14, flap: 2.8, glide: 0.72,
    sep: 4.5, coh: 0.55, ali: 0.85, alt: [38, 95], habitat: 'sea',
    body: [0.08, 0.08, 0.09], belly: [0.55, 0.52, 0.5], tip: [0.04, 0.04, 0.045], beak: [0.55, 0.22, 0.08],
    span: 1.35, fork: 0.55, neck: 0.12 },
  { id: 'pelican', role: 1, n: 6, len: 1.15, reach: 160, cruise: 7.5, burst: 11, flap: 3.4, glide: 0.55,
    sep: 6, coh: 0.4, ali: 0.5, alt: [8, 28], habitat: 'coast',
    body: [0.72, 0.7, 0.62], belly: [0.88, 0.86, 0.8], tip: [0.12, 0.12, 0.14], beak: [0.55, 0.42, 0.12],
    span: 1.45, fork: 0.08, neck: 0.35, pouch: 1 },
  { id: 'tern', role: 1, n: 22, len: 0.38, reach: 140, cruise: 10, burst: 16, flap: 7.5, glide: 0.35,
    sep: 2.2, coh: 0.9, ali: 0.95, alt: [6, 32], habitat: 'coast',
    body: [0.86, 0.87, 0.88], belly: [0.94, 0.94, 0.93], tip: [0.12, 0.12, 0.14], beak: [0.75, 0.35, 0.08],
    span: 0.85, fork: 0.4, neck: 0.08, cap: 1 },
  { id: 'sandpiper', role: 2, n: 16, len: 0.2, reach: 55, cruise: 7, burst: 12, flap: 9, glide: 0.15,
    sep: 0.7, coh: 0.7, ali: 0.4, alt: [0.05, 0.2], habitat: 'beach',
    body: [0.42, 0.38, 0.32], belly: [0.78, 0.74, 0.66], tip: [0.28, 0.26, 0.22], beak: [0.35, 0.28, 0.18],
    span: 0.55, fork: 0.05, neck: 0.06, legs: 1 },
  { id: 'egret', role: 3, n: 4, len: 0.72, reach: 70, cruise: 6, burst: 10, flap: 4.2, glide: 0.4,
    sep: 5, coh: 0.15, ali: 0.1, alt: [0.08, 0.35], habitat: 'shallow',
    body: [0.92, 0.93, 0.94], belly: [0.96, 0.96, 0.95], tip: [0.55, 0.55, 0.52], beak: [0.72, 0.55, 0.12],
    span: 1.05, fork: 0.05, neck: 0.55, legs: 1 },
  { id: 'parrot', role: 4, n: 10, len: 0.32, reach: 45, cruise: 6.5, burst: 11, flap: 8, glide: 0.12,
    sep: 1.4, coh: 0.35, ali: 0.2, alt: [4, 18], habitat: 'forest',
    body: [0.12, 0.55, 0.22], belly: [0.85, 0.55, 0.08], tip: [0.08, 0.35, 0.55], beak: [0.75, 0.35, 0.05],
    span: 0.55, fork: 0.15, neck: 0.05 },
  { id: 'flycatcher', role: 5, n: 12, len: 0.16, reach: 40, cruise: 7, burst: 13, flap: 11, glide: 0.2,
    sep: 1.8, coh: 0.2, ali: 0.15, alt: [3, 16], habitat: 'forest',
    body: [0.28, 0.42, 0.22], belly: [0.72, 0.7, 0.55], tip: [0.18, 0.28, 0.14], beak: [0.2, 0.18, 0.12],
    span: 0.42, fork: 0.12, neck: 0.04, hunt: 1 },
  { id: 'swallow', role: 6, n: 28, len: 0.15, reach: 90, cruise: 11, burst: 18, flap: 10, glide: 0.45,
    sep: 1.6, coh: 1.05, ali: 1.0, alt: [10, 55], habitat: 'air',
    body: [0.18, 0.28, 0.42], belly: [0.72, 0.55, 0.35], tip: [0.08, 0.1, 0.14], beak: [0.12, 0.1, 0.08],
    span: 0.5, fork: 0.5, neck: 0.03, hunt: 1 }
];

function birdWing(m, side, span, chord, sweep, col, lod) {
  const n = lod ? 2 : 5, base = m.pos.length / 3;
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = chord * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.02)), 0.65) * (1 - u * 0.15);
    const x = side * (0.04 + span * u), z0 = 0.06 - sweep * u - w * 0.35, z1 = 0.06 - sweep * u + w * 0.65;
    const tip = u > 0.72 ? 0.35 : 0;
    const c0 = [col[0] * (1 - tip), col[1] * (1 - tip), col[2] * (1 - tip)];
    m.v(x, 0.02, z0, 0, 1, 0, c0[0], c0[1], c0[2], side, BIRD_WING, u, 0);
    m.v(x, 0.02, z1, 0, 1, 0, c0[0], c0[1], c0[2], side, BIRD_WING, u, 1);
    if (i) {
      const a = base + (i - 1) * 2;
      m.tri(a, a + 2, a + 1); m.tri(a + 1, a + 2, a + 3);
    }
  }
}

function birdLeg(m, side, long, col) {
  const hip = [0.02, -0.02, side * 0.02], knee = [0.04, -long * 0.45, side * 0.03], foot = [0.07, -long, side * 0.02];
  const pts = [hip, knee, foot], r = 0.006;
  tube(m, pts, 3, false, () => [r, col[0], col[1], col[2], 0, BIRD_LEG, 0, 0]);
}

function makeBird(sp, lod) {
  const m = new Mesh();
  const tail = -0.28 - sp.fork * 0.12;
  const add = (x, y, z, nx, ny, nz, c, sway, kind) => m.v(x, y, z, nx, ny, nz, c[0], c[1], c[2], sway || 0, kind || BIRD_BODY, 0, 0);
  const ring = (z, ry, rz, yc, c, nn) => {
    const base = m.pos.length / 3, sides = nn + 2;
    for (let k = 0; k < sides; k++) {
      const b = k / sides * 6.2832, cy = Math.cos(b), cz = Math.sin(b);
      const col = Math.cos(b) < -0.2 ? sp.belly : c;
      add(cz * rz, yc + cy * ry, z, cz, cy, 0, col, 0, BIRD_BODY);
    }
    return { base, sides };
  };
  const stitch = (a, b) => {
    for (let k = 0; k < a.sides; k++) {
      const i0 = a.base + k, i1 = a.base + (k + 1) % a.sides, j0 = b.base + k, j1 = b.base + (k + 1) % a.sides;
      m.tri(i0, j0, i1); m.tri(i1, j0, j1);
    }
  };
  const nn = lod ? 4 : 8;
  const r0 = ring(0.32 + sp.neck * 0.2, 0.018, 0.016, 0.02, sp.body, nn);
  const r1 = ring(0.22 + sp.neck * 0.1, 0.04, 0.038, 0.025, sp.cap ? [0.08, 0.08, 0.09] : sp.body, nn);
  const r2 = ring(0.06, 0.07, 0.065, 0.02, sp.body, nn);
  const r3 = ring(-0.08, 0.06, 0.055, 0.015, sp.body, nn);
  const r4 = ring(-0.22, 0.035, 0.03, 0.02, sp.body, nn);
  const r5 = ring(tail, 0.012 + sp.fork * 0.02, 0.01 + sp.fork * 0.04, 0.015, sp.body, nn);
  stitch(r0, r1); stitch(r1, r2); stitch(r2, r3); stitch(r3, r4); stitch(r4, r5);
  const tip = add(0, 0.015, 0.38 + sp.neck * 0.15 + (sp.pouch ? 0.06 : 0), 0, 0, 1, sp.beak, 0, BIRD_BEAK);
  for (let k = 0; k < r0.sides; k++) m.tri(tip, r0.base + k, r0.base + (k + 1) % r0.sides);
  if (sp.pouch) {
    const pb = m.pos.length / 3;
    for (const q of [[-0.03, -0.02, 0.28], [0.03, -0.02, 0.28], [0, -0.08, 0.34]]) {
      add(q[0], q[1], q[2], 0, -1, 0, [0.55, 0.42, 0.28], 0, BIRD_BODY);
    }
    m.tri(pb, pb + 1, pb + 2);
  }
  if (sp.fork > 0.2) {
    for (const s of [-1, 1]) {
      const a = add(s * 0.04 * sp.fork, 0.01, tail - 0.02, 0, 1, 0, sp.body, 0, BIRD_BODY);
      const b = add(s * (0.08 + 0.12 * sp.fork), 0.0, tail - 0.18 * sp.fork, 0, 1, 0, sp.tip, 0, BIRD_BODY);
      const c = add(s * 0.02, 0.02, tail + 0.02, 0, 1, 0, sp.body, 0, BIRD_BODY);
      m.tri(a, b, c);
    }
  }
  for (const s of [-1, 1]) birdWing(m, s, sp.span * 0.5, 0.14 + sp.span * 0.04, 0.35 + sp.fork * 0.15, sp.body, lod);
  if (sp.legs && !lod) {
    birdLeg(m, -1, 0.14 + sp.len * 0.08, [0.55, 0.45, 0.2]);
    birdLeg(m, 1, 0.14 + sp.len * 0.08, [0.55, 0.45, 0.2]);
  }
  const sc = sp.len / 0.55;
  for (let i = 0; i < m.pos.length; i++) m.pos[i] *= sc;
  return m;
}

function birdMeshes() {
  const list = [];
  for (const sp of BIRD_SPECIES) for (let lod = 0; lod < 2; lod++) list.push(makeBird(sp, lod));
  return list;
}

function BirdLife(world, q, beach, trees, blooms) {
  this.world = world; this.beach = beach; this.trees = trees || []; this.blooms = blooms || [];
  this.rnd = mulberry32(0xB1ED5); this.time = 0; this.calm = false; this.bugLife = null;
  this.heard = {}; this.singers = [];
  const f = Math.max(0.35, (q.birds || 8) / 8);
  const A = this.agents = [];
  this.first = [];
  BIRD_SPECIES.forEach((B, sp) => {
    this.first.push(A.length);
    const n = Math.max(1, Math.round(B.n * f));
    for (let i = 0; i < n; i++) {
      A.push({
        sp, on: false, seed: this.rnd(), sc: 0.88 + this.rnd() * 0.28,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: this.rnd() * 6.28, pitch: 0, roll: 0,
        st: 0, t: this.rnd() * 4, ph: this.rnd() * 6.28, amp: 0.4, mode: 0,
        hx: 0, hy: 0, hz: 0, flock: (i / Math.max(3, (n / 3) | 0)) | 0,
        wait: this.rnd() * 2, perch: -1, prey: -1, gait: 0
      });
    }
  });
  this.first.push(A.length);
  this.n = A.length;
  this.lvl = new Float32Array(BIRD_SPECIES.length);
  this.slots = BIRD_SPECIES.length * 2;
  this.counts = new Int32Array(this.slots);
  this.starts = new Int32Array(this.slots);
  // Flock centroids for soar/swallow groups.
  this.flocks = [];
  for (let sp = 0; sp < BIRD_SPECIES.length; sp++) {
    const B = BIRD_SPECIES[sp];
    if (B.role !== 0 && B.role !== 1 && B.role !== 6) continue;
    const lo = this.first[sp], hi = this.first[sp + 1];
    const groups = {};
    for (let i = lo; i < hi; i++) {
      const g = A[i].flock, key = sp * 100 + g;
      if (!groups[key]) {
        const ang = this.rnd() * 6.28, rad = B.habitat === 'sea' ? 60 + this.rnd() * 100 : 30 + this.rnd() * 70;
        const cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad * 0.85;
        const alt = B.alt[0] + this.rnd() * (B.alt[1] - B.alt[0]);
        groups[key] = { sp, cx, cy: alt, cz, vx: 0, vz: 0, face: ang + 1.4, r: 6 + this.rnd() * 10 };
        this.flocks.push(groups[key]);
      }
      A[i].fk = groups[key];
    }
  }
}

BirdLife.prototype.ground = function (x, z) { return fieldSample(this.world, x, z); };

BirdLife.prototype.wash = function (x, z) {
  // Synthetic swash line: wet sand near sea level retreats as a travelling wash.
  const h = this.ground(x, z);
  if (h > 1.2 || h < -0.4) return 0;
  const phase = Math.sin(this.time * 0.85 + x * 0.08 + z * 0.05);
  return Math.max(0, 0.35 + phase * 0.55 - h * 0.8);
};

BirdLife.prototype.levels = function () {
  const sy = env.sun[1], day = smooth01(0.0, 0.22, sy), dark = smooth01(0.08, -0.05, sy);
  const dawn = smooth01(5.5, 7.5, env.hour) * (1 - smooth01(9, 11, env.hour));
  const dusk = smooth01(16.5, 18, env.hour) * (1 - smooth01(19.5, 21, env.hour));
  const dry = 1 - Math.min(1, env.v[1] * 2.8), calm = 1 - smooth01(9, 14, env.speed);
  const L = this.lvl;
  L[0] = Math.max(day, dusk * 0.7) * dry; // frigate
  L[1] = day * dry * (0.6 + 0.4 * calm); // pelican
  L[2] = day * dry; // tern
  L[3] = day * dry * (0.5 + 0.5 * calm); // sandpiper
  L[4] = day * dry * calm; // egret
  L[5] = day * dry * calm * (0.45 + 0.55 * dawn + 0.35 * dusk); // parrot
  L[6] = day * dry * calm * (0.5 + 0.8 * dawn); // flycatcher
  L[7] = Math.max(day, dusk) * dry * (0.4 + 0.6 * dawn + 0.5 * dusk); // swallow
  // Night: almost all roost; swallows/frigates thin out.
  if (dark > 0.7) for (let i = 0; i < L.length; i++) L[i] *= 1 - dark * 0.92;
};

BirdLife.prototype.newHome = function (a) {
  const B = BIRD_SPECIES[a.sp], rnd = this.rnd, beach = this.beach;
  a.vx = a.vy = a.vz = 0; a.st = 0; a.t = 1 + rnd() * 3; a.prey = -1; a.perch = -1;
  if (a.fk) {
    const f = a.fk;
    a.x = f.cx + (rnd() - 0.5) * f.r; a.z = f.cz + (rnd() - 0.5) * f.r;
    a.y = f.cy + (rnd() - 0.5) * 3; a.yaw = f.face; a.mode = 0; a.hx = f.cx; a.hz = f.cz; a.hy = f.cy;
    return true;
  }
  if (B.habitat === 'beach' || B.habitat === 'shallow') {
    const ang = rnd() * 6.28, rad = 4 + rnd() * 28;
    a.x = beach.x + Math.cos(ang) * rad; a.z = beach.z + Math.sin(ang) * rad;
    for (let k = 0; k < 12; k++) {
      const h = this.ground(a.x, a.z);
      if (B.habitat === 'shallow' ? (h > -0.35 && h < 0.55) : (h > 0.05 && h < 1.1)) break;
      a.x = beach.x + (rnd() - 0.5) * 50; a.z = beach.z + (rnd() - 0.5) * 40;
    }
    a.y = Math.max(this.ground(a.x, a.z), 0) + 0.06; a.mode = 2; a.hx = a.x; a.hz = a.z; a.hy = a.y;
    a.st = 2; // standing / feeding
    return true;
  }
  // Forest: perch on a tree or near blooms.
  const T = this.trees;
  if (T.length >= 4) {
    const i = ((rnd() * (T.length / 4)) | 0) * 4;
    a.hx = T[i]; a.hz = T[i + 1]; a.hy = T[i + 2] + 2.5 + rnd() * Math.min(8, T[i + 3] * 0.4);
    a.x = a.hx + (rnd() - 0.5) * 2; a.z = a.hz + (rnd() - 0.5) * 2; a.y = a.hy;
    a.perch = i; a.mode = 3; a.st = 3;
    return true;
  }
  const ang = rnd() * 6.28, rad = 20 + rnd() * 80;
  a.x = Math.cos(ang) * rad; a.z = Math.sin(ang) * rad * 0.85;
  a.y = B.alt[0] + rnd() * (B.alt[1] - B.alt[0]); a.mode = 0;
  a.hx = a.x; a.hz = a.z; a.hy = a.y;
  return true;
};

BirdLife.prototype.steer = function (a, tx, ty, tz, vmax, acc, dt) {
  const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, d = Math.hypot(dx, dy, dz) || 1e-6;
  const sp = Math.min(vmax, d * 4);
  let ax = dx / d * sp - a.vx, ay = dy / d * sp - a.vy, az = dz / d * sp - a.vz;
  const al = Math.hypot(ax, ay, az) || 1e-6, k = Math.min(1, acc * dt / al);
  a.vx += ax * k; a.vy += ay * k; a.vz += az * k;
  const drag = Math.exp(-dt * (d < 1 ? 2.5 : 0.6));
  a.vx *= drag; a.vy *= drag; a.vz *= drag;
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  const h = Math.hypot(a.vx, a.vz);
  if (h > 0.4) {
    const want = Math.atan2(a.vz, a.vx);
    let turn = want - a.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    a.yaw += turn * Math.min(1, dt * 5);
    a.roll = Math.max(-0.7, Math.min(0.7, a.roll * 0.88 + turn * 1.4));
    a.pitch = Math.atan2(a.vy, h + 0.5) * 0.65;
  }
  return d;
};

BirdLife.prototype.flockForces = function (a, B, dt) {
  if (!a.fk) return;
  const f = a.fk, A = this.agents;
  let sx = 0, sy = 0, sz = 0, ax = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
  const lo = this.first[a.sp], hi = this.first[a.sp + 1];
  for (let i = lo; i < hi; i++) {
    const o = A[i];
    if (!o.on || o.fk !== f || o === a) continue;
    const dx = a.x - o.x, dy = a.y - o.y, dz = a.z - o.z, d2 = dx * dx + dy * dy + dz * dz;
    const sep = B.sep;
    if (d2 < sep * sep && d2 > 1e-6) {
      const d = Math.sqrt(d2), k = (1 - d / sep) / d;
      sx += dx * k; sy += dy * k; sz += dz * k;
    }
    ax += o.vx; az += o.vz; cx += o.x; cy += o.y; cz += o.z; n++;
  }
  if (n) {
    ax /= n; az /= n; cx /= n; cy /= n; cz /= n;
    a.vx += (ax - a.vx) * B.ali * dt * 2;
    a.vz += (az - a.vz) * B.ali * dt * 2;
    a.vx += (cx - a.x) * B.coh * dt * 0.35;
    a.vy += (cy - a.y) * B.coh * dt * 0.25;
    a.vz += (cz - a.z) * B.coh * dt * 0.35;
  }
  a.vx += sx * 8 * dt; a.vy += sy * 5 * dt; a.vz += sz * 8 * dt;
  // Soft pull to flock centre wander.
  a.vx += (f.cx - a.x) * 0.15 * dt; a.vz += (f.cz - a.z) * 0.15 * dt;
  a.vy += (f.cy - a.y) * 0.2 * dt;
};

BirdLife.prototype.updateFlocks = function (dt) {
  for (const f of this.flocks) {
    const B = BIRD_SPECIES[f.sp];
    f.face += Math.sin(this.time * 0.11 + f.cx * 0.01) * 0.35 * dt;
    // Wide orbit / cruise; wind drift.
    const sp = B.cruise * 0.55;
    f.vx = Math.cos(f.face) * sp; f.vz = Math.sin(f.face) * sp;
    const drift = envWindAt(f.cx, f.cz) * 0.25;
    f.cx += (f.vx + env.wx0 * drift) * dt;
    f.cz += (f.vz + env.wz0 * drift) * dt;
    f.cy = B.alt[0] + (B.alt[1] - B.alt[0]) * (0.45 + 0.35 * Math.sin(this.time * 0.07 + f.cx * 0.02));
    const dist = Math.hypot(f.cx, f.cz);
    if (dist > 180) {
      const home = Math.atan2(-f.cz, -f.cx);
      let turn = home - f.face;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      f.face += turn * 0.4 * dt;
    }
  }
};

BirdLife.prototype.soar = function (a, dt, B) {
  this.flockForces(a, B, dt);
  const f = a.fk;
  const w = this.time * (0.15 + a.seed * 0.1) + a.seed * 40;
  const tx = f.cx + Math.sin(w) * f.r * 0.7;
  const tz = f.cz + Math.cos(w * 0.83) * f.r * 0.7;
  const ty = f.cy + Math.sin(w * 1.3) * 2.5;
  this.steer(a, tx, ty, tz, B.cruise, 4, dt);
  const ground = this.ground(a.x, a.z);
  if (a.y < ground + 6) { a.y = ground + 6; if (a.vy < 0) a.vy = 0; }
  // Flap–glide duty cycle from species glide ratio.
  const beat = Math.sin(this.time * B.flap * 0.35 + a.seed * 20);
  a.mode = beat > B.glide * 2 - 1 ? 0 : 1;
  a.amp = a.mode === 0 ? 0.55 + 0.25 * Math.max(0, beat) : 0.08;
  a.ph += dt * (a.mode === 0 ? B.flap : B.flap * 0.15);
  const drift = envWindAt(a.x, a.z) * 0.3;
  a.x += env.wx0 * drift * dt; a.z += env.wz0 * drift * dt;
};

BirdLife.prototype.beachWalk = function (a, dt, B) {
  const rnd = this.rnd;
  a.t -= dt;
  const wash = this.wash(a.x, a.z);
  if (wash > 0.55 && a.st === 2) {
    // Retreat from the wash, then return to feed.
    a.st = 1; a.t = 1.2 + rnd();
    const away = Math.atan2(a.z - this.beach.z, a.x - this.beach.x) || a.yaw;
    a.tx = a.x + Math.cos(away) * (2 + rnd() * 3);
    a.tz = a.z + Math.sin(away) * (2 + rnd() * 3);
    a.ty = Math.max(this.ground(a.tx, a.tz), 0) + 0.5;
    a.mode = 0; a.amp = 0.7;
  }
  if (a.st === 1) {
    if (this.steer(a, a.tx, a.ty, a.tz, B.burst * 0.7, 14, dt) < 0.3 || a.t < 0) {
      a.st = 2; a.t = 2 + rnd() * 5; a.vx = a.vy = a.vz = 0; a.mode = 2; a.amp = 0;
    }
    a.ph += dt * B.flap; a.amp = 0.65;
  } else if (a.st === 2) {
    // Probe wet sand: short runs along the strand.
    if (a.t < 0) {
      const along = Math.atan2(this.beach.z - a.z, this.beach.x - a.x) + Math.PI * 0.5;
      a.tx = a.x + Math.cos(along + (rnd() - 0.5)) * (0.6 + rnd() * 1.8);
      a.tz = a.z + Math.sin(along + (rnd() - 0.5)) * (0.6 + rnd() * 1.8);
      a.ty = Math.max(this.ground(a.tx, a.tz), 0) + 0.05;
      a.t = 0.6 + rnd() * 1.4;
      if (rnd() < 0.12) { a.st = 0; a.t = 3 + rnd() * 4; a.mode = 0; a.ty = a.y + 4 + rnd() * 6; }
    }
    const sp = 0.55 + a.seed * 0.4;
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      a.yaw += (Math.atan2(dz, dx) - a.yaw) * Math.min(1, dt * 6);
      a.x += Math.cos(a.yaw) * sp * dt; a.z += Math.sin(a.yaw) * sp * dt;
      a.gait += dt * sp / 0.04;
    }
    a.y = Math.max(this.ground(a.x, a.z), 0) + 0.05;
    a.pitch = 0.05; a.roll = 0; a.mode = 2; a.amp = 0; a.ph = a.gait;
  } else {
    // Short flight relocate along beach.
    a.tx = this.beach.x + (rnd() - 0.5) * 36;
    a.tz = this.beach.z + (rnd() - 0.5) * 28;
    a.ty = Math.max(this.ground(a.tx, a.tz), 0) + 3 + rnd() * 4;
    if (this.steer(a, a.tx, a.ty, a.tz, B.cruise, 10, dt) < 0.5 || a.t < 0) {
      a.st = 2; a.t = 2 + rnd() * 4; a.mode = 2; a.y = Math.max(this.ground(a.x, a.z), 0) + 0.05;
      a.vx = a.vy = a.vz = 0;
    }
    a.ph += dt * B.flap; a.amp = 0.7; a.mode = 0;
  }
};

BirdLife.prototype.wader = function (a, dt, B) {
  // Egret: stand in shallows, occasional spear, relocate by flight.
  const rnd = this.rnd;
  a.t -= dt;
  if (a.st === 3 || a.st === 2) {
    a.y = Math.max(this.ground(a.x, a.z), -0.15) + 0.12;
    a.mode = 2; a.amp = 0; a.pitch = 0.15 + 0.1 * Math.sin(this.time * 0.7 + a.seed);
    a.roll = 0;
    if (a.t < 0) {
      if (rnd() < 0.55) {
        a.st = 0; a.t = 4 + rnd() * 5;
        a.tx = this.beach.x + (rnd() - 0.5) * 40; a.tz = this.beach.z + (rnd() - 0.5) * 30;
        a.ty = 5 + rnd() * 8;
      } else a.t = 3 + rnd() * 8;
    }
  } else {
    a.mode = 0; a.amp = 0.55; a.ph += dt * B.flap;
    if (this.steer(a, a.tx, a.ty, a.tz, B.cruise, 7, dt) < 0.6 || a.t < 0) {
      a.st = 2; a.t = 5 + rnd() * 10; a.vx = a.vy = a.vz = 0;
      a.y = Math.max(this.ground(a.x, a.z), -0.15) + 0.12; a.mode = 2;
    }
  }
};

BirdLife.prototype.forest = function (a, dt, B) {
  const rnd = this.rnd;
  a.t -= dt;
  if (a.st === 3) {
    // Perched: ride tree height; occasional hop / song pose.
    const T = this.trees, i = a.perch;
    if (i >= 0 && T.length > i + 3) {
      const lean = Math.sin(this.time * 0.9 + a.seed) * 0.15;
      a.x = T[i] + lean * 0.4; a.z = T[i + 1];
      a.y = T[i + 2] + 2.2 + a.seed * 5; a.hx = T[i]; a.hz = T[i + 1];
    }
    a.mode = 3; a.amp = 0; a.pitch = 0.1; a.roll = 0;
    a.vx = a.vy = a.vz = 0;
    if (a.t < 0 || a.scare) {
      if (B.hunt && rnd() < 0.55) { a.st = 4; a.t = 2 + rnd() * 3; a.mode = 0; this.pickPrey(a); }
      else {
        a.st = 0; a.t = 2 + rnd() * 4; a.mode = 0;
        const T2 = this.trees;
        if (T2.length >= 4) {
          const j = ((rnd() * (T2.length / 4)) | 0) * 4;
          a.tx = T2[j]; a.tz = T2[j + 1]; a.ty = T2[j + 2] + 3 + rnd() * 4; a.perch = j;
        } else { a.tx = a.x + (rnd() - 0.5) * 20; a.tz = a.z + (rnd() - 0.5) * 20; a.ty = a.y + 2; }
      }
    }
  } else if (a.st === 4) {
    this.chasePrey(a, dt, B);
  } else if (a.st === 5) {
    a.mode = 0; a.amp = 0.35; a.ph += dt * B.flap * 0.5;
    a.vx *= Math.exp(-dt * 4); a.vy *= Math.exp(-dt * 4); a.vz *= Math.exp(-dt * 4);
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    if (a.t < 0) { a.st = 3; a.t = 2 + rnd() * 6; a.mode = 3; }
  } else {
    a.mode = 0; a.amp = 0.65; a.ph += dt * B.flap;
    if (this.steer(a, a.tx, a.ty, a.tz, B.cruise, 9, dt) < 0.45 || a.t < 0) {
      a.st = 3; a.t = 3 + rnd() * 12; a.mode = 3; a.vx = a.vy = a.vz = 0;
      a.y = a.ty; a.x = a.tx; a.z = a.tz;
    }
  }
};

BirdLife.prototype.pickPrey = function (a) {
  const bugs = this.bugLife && this.bugLife.agents;
  if (!bugs) { a.prey = -1; return; }
  let best = -1, bd = 25;
  for (let i = 0; i < bugs.length; i++) {
    const b = bugs[i];
    if (!b.on || b.amp < 0.2) continue;
    const id = BUGS[b.sp].id;
    if (id !== 'gnat' && id !== 'mosquito' && id !== 'bee' && id !== 'dragonfly' && id !== 'damselfly') continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d < bd) { bd = d; best = i; }
  }
  a.prey = best;
};

BirdLife.prototype.chasePrey = function (a, dt, B) {
  const bugs = this.bugLife && this.bugLife.agents;
  const p = a.prey >= 0 && bugs ? bugs[a.prey] : null;
  if (!p || !p.on) {
    this.pickPrey(a);
    if (a.prey < 0) { a.st = 3; a.t = 2; a.mode = 3; return; }
  }
  const prey = bugs[a.prey];
  a.mode = 0; a.amp = 0.85; a.ph += dt * B.flap * 1.2;
  const d = this.steer(a, prey.x, prey.y + 0.05, prey.z, B.burst, 16, dt);
  if (d < 0.25) {
    // Feed: brief hover, prey scatters.
    prey.scare = true; prey.wait = 0.01;
    a.st = 5; a.t = 0.4 + this.rnd() * 0.5; a.amp = 0.4; a.prey = -1;
  }
  if (a.t < 0) { a.st = 3; a.t = 2 + this.rnd() * 5; a.mode = 3; }
};

BirdLife.prototype.aerialHunt = function (a, dt, B) {
  this.soar(a, dt, B);
  a.t -= dt;
  if (a.t < 0 && B.hunt) {
    a.t = 1.5 + this.rnd() * 3;
    if (this.rnd() < 0.35) {
      this.pickPrey(a);
      if (a.prey >= 0) a.st = 4;
    }
  }
  if (a.st === 4) this.chasePrey(a, dt, B);
};

BirdLife.prototype.update = function (dt, time, cx, cy, cz) {
  if (dt <= 0) return;
  dt = Math.min(dt, 0.05);
  this.time = time; this.cx = cx; this.cy = cy; this.cz = cz;
  this.levels();
  this.updateFlocks(dt);
  const rnd = this.rnd, heard = this.heard = {};
  this.singers.length = 0;
  for (const a of this.agents) {
    const B = BIRD_SPECIES[a.sp], out = a.seed < this.lvl[a.sp] * 1.05;
    const far = Math.hypot(a.hx - cx, a.hz - cz) > B.reach * 1.35 && Math.hypot(a.x - cx, a.z - cz) > B.reach * 1.2;
    if (!out || far) {
      a.on = false;
      if (!out) continue;
      a.wait -= dt;
      if (a.wait > 0) continue;
      a.wait = 0.4 + rnd();
      if (!this.newHome(a)) continue;
      a.on = true;
    } else if (!a.on) a.on = true;

    const d = Math.hypot(a.x - cx, a.y - cy, a.z - cz);
    a.scare = !this.calm && d < 2.2 && a.mode >= 2;
    if (d < 35 && (heard[B.id] == null || d < heard[B.id])) heard[B.id] = d;
    if (a.mode >= 2 && d < 40 && B.role >= 4) this.singers.push(a);

    if (B.role === 0 || B.role === 1) this.soar(a, dt, B);
    else if (B.role === 2) this.beachWalk(a, dt, B);
    else if (B.role === 3) this.wader(a, dt, B);
    else if (B.role === 6) this.aerialHunt(a, dt, B);
    else this.forest(a, dt, B);

    if (a.scare && a.mode >= 2) {
      a.st = 0; a.mode = 0; a.t = 2; a.ty = a.y + 5; a.tx = a.x + (a.x - cx); a.tz = a.z + (a.z - cz);
    }
  }
};

BirdLife.prototype.collect = function (out, vp, ex, ey, ez, reach, ranges) {
  const counts = this.counts, starts = this.starts;
  counts.fill(0);
  for (const a of this.agents) {
    a.slot = -1;
    if (!a.on) continue;
    const B = BIRD_SPECIES[a.sp], L = B.len * a.sc, x = a.x, y = a.y, z = a.z;
    const dist = Math.hypot(x - ex, y - ey, z - ez);
    if (dist > Math.min(reach, B.reach)) continue;
    if (L < dist * 0.0015) continue;
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cv = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    if (cw < -L || Math.abs(cx) > cw + L * 3 || Math.abs(cv) > cw + L * 3) continue;
    a.slot = a.sp * 2 + (L > dist * 0.03 ? 0 : 1);
    counts[a.slot]++;
  }
  let run = 0;
  const draws = this._draws || (this._draws = []);
  draws.length = 0;
  for (let k = 0; k < this.slots; k++) {
    starts[k] = run;
    if (counts[k]) { const g = ranges[k]; draws.push(g.first, g.count, g.base, run, counts[k]); }
    run += counts[k];
  }
  for (const a of this.agents) {
    if (a.slot < 0) continue;
    const t = starts[a.slot]++ * 12;
    out[t] = a.x; out[t + 1] = a.y; out[t + 2] = a.z; out[t + 3] = a.yaw;
    out[t + 4] = a.sc;
    out[t + 5] = a.pitch; out[t + 6] = a.ph; out[t + 7] = a.amp;
    out[t + 8] = a.roll; out[t + 9] = a.sp; out[t + 10] = a.seed; out[t + 11] = a.mode;
  }
  draws.end = run;
  return draws;
};

BirdLife.prototype.find = function (id, nth) {
  let seen = 0;
  for (const a of this.agents) {
    if (!a.on || BIRD_SPECIES[a.sp].id !== id) continue;
    if (seen++ === (nth || 0)) return a;
  }
  return null;
};

BirdLife.prototype.nearest = function (ex, ey, ez) {
  let best = null, bd = 1e9;
  for (const a of this.agents) {
    if (!a.on) continue;
    const d = Math.hypot(a.x - ex, a.y - ey, a.z - ez);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
};

// Instance: pos+yaw; scale, pitch, flap phase, flap amp; roll, species, seed, mode.
const BIRD_WGSL = `
struct BirdV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
  @location(3) kind: f32,
  @location(4) @interpolate(flat) who: vec3<f32>,
}
struct BirdAt { p: vec3<f32>, n: vec3<f32> }
fn birdPlace(in: MeshIn) -> BirdAt {
  var p = in.p;
  var n = in.n.xyz;
  let mode = in.i2.w;
  let amp = in.i1.w;
  let ph = in.i1.z;
  // Wings: sway holds side (±1). Flap folds about the body axis; glide holds a dihedral.
  if (abs(in.c.w) > 0.5) {
    let side = sign(in.c.w);
    var flap = 0.0;
    if (mode < 0.5) { flap = sin(ph) * amp; }
    else if (mode < 1.5) { flap = 0.12 + amp * 0.2; }
    else { flap = -0.35; }
    let hand = flap * (0.55 + 0.45 * in.uv.x);
    let ct = cos(hand); let st = sin(hand);
    let y1 = p.y * ct - p.x * side * st;
    let x1 = p.x * side * ct + p.y * st;
    p = vec3<f32>(x1 * side, y1, p.z - abs(p.x) * 0.08 * max(flap, 0.0));
    n = normalize(vec3<f32>(n.x * ct - n.y * side * st, n.x * side * st + n.y * ct, n.z));
  }
  p *= in.i1.x;
  let sp = sin(in.i1.y); let cp = cos(in.i1.y);
  p = vec3<f32>(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  n = vec3<f32>(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  let sr = sin(in.i2.x); let cr = cos(in.i2.x);
  p = vec3<f32>(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
  n = vec3<f32>(n.x * cr - n.y * sr, n.x * sr + n.y * cr, n.z);
  let sy = sin(in.i0.w); let cy = cos(in.i0.w);
  var o: BirdAt;
  o.p = vec3<f32>(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy) + in.i0.xyz;
  o.n = vec3<f32>(n.x * cy - n.z * sy, n.y, n.x * sy + n.z * cy);
  return o;
}
fn birdSkin(sp: i32, kind: f32, localY: f32, tip: f32) -> vec3<f32> {
  var body = vec3<f32>(0.55);
  var belly = vec3<f32>(0.85);
  var wingtip = vec3<f32>(0.1);
  var beak = vec3<f32>(0.5, 0.3, 0.1);
  if (sp == 0) { body = vec3<f32>(0.08, 0.08, 0.09); belly = vec3<f32>(0.5, 0.48, 0.46); wingtip = vec3<f32>(0.04); beak = vec3<f32>(0.55, 0.22, 0.08); }
  else if (sp == 1) { body = vec3<f32>(0.72, 0.7, 0.62); belly = vec3<f32>(0.88, 0.86, 0.8); wingtip = vec3<f32>(0.12); beak = vec3<f32>(0.55, 0.42, 0.12); }
  else if (sp == 2) { body = vec3<f32>(0.86, 0.87, 0.88); belly = vec3<f32>(0.94); wingtip = vec3<f32>(0.12); beak = vec3<f32>(0.75, 0.35, 0.08); }
  else if (sp == 3) { body = vec3<f32>(0.42, 0.38, 0.32); belly = vec3<f32>(0.78, 0.74, 0.66); wingtip = vec3<f32>(0.28, 0.26, 0.22); beak = vec3<f32>(0.35, 0.28, 0.18); }
  else if (sp == 4) { body = vec3<f32>(0.92, 0.93, 0.94); belly = vec3<f32>(0.96); wingtip = vec3<f32>(0.55); beak = vec3<f32>(0.72, 0.55, 0.12); }
  else if (sp == 5) { body = vec3<f32>(0.12, 0.55, 0.22); belly = vec3<f32>(0.85, 0.55, 0.08); wingtip = vec3<f32>(0.08, 0.35, 0.55); beak = vec3<f32>(0.75, 0.35, 0.05); }
  else if (sp == 6) { body = vec3<f32>(0.28, 0.42, 0.22); belly = vec3<f32>(0.72, 0.7, 0.55); wingtip = vec3<f32>(0.18, 0.28, 0.14); beak = vec3<f32>(0.2, 0.18, 0.12); }
  else { body = vec3<f32>(0.18, 0.28, 0.42); belly = vec3<f32>(0.72, 0.55, 0.35); wingtip = vec3<f32>(0.08, 0.1, 0.14); beak = vec3<f32>(0.12, 0.1, 0.08); }
  if (kind > 1.5) { return beak; }
  var c = mix(body, belly, sat(-localY * 4.0 + 0.35));
  if (kind > 0.5) { c = mix(c, wingtip, smoothstep(0.55, 0.9, tip)); }
  return c;
}
@vertex fn vsBird(in: MeshIn) -> BirdV {
  let at = birdPlace(in);
  var o: BirdV;
  o.world = at.p;
  o.nrm = at.n;
  o.col = birdSkin(i32(in.i2.y + 0.5), in.n.w, in.p.y, in.uv.x);
  o.kind = in.n.w;
  o.who = vec3<f32>(in.i2.y, in.i2.z, in.i1.x);
  o.clip = F.viewProj * vec4<f32>(at.p, 1.0);
  return o;
}
@fragment fn fsBird(in: BirdV) -> @location(0) vec4<f32> {
  let below = step(F.camPos.y, in.world.y);
  let col = mix(in.col, in.col * vec3<f32>(0.92, 0.93, 0.95), below * 0.55);
  return vec4<f32>(shade(in.world, normalize(in.nrm + vec3<f32>(0.0, 0.2, 0.0)), col, 0.15, 0.0) * (1.0 - 0.22 * below), 1.0);
}
`;
