// Node checks for the stream manager. No GPU. Run: node source/stream-check.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const ctx = {
  performance: { now: () => Date.now() },
  console,
  Map,
  GPUBufferUsage: { INDEX: 16, VERTEX: 32, COPY_DST: 8 }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('./stream.js', import.meta.url), 'utf8'), ctx);
const WorldStream = ctx.WorldStream;

let failed = 0;
function check(name, cond) {
  if (!cond) { failed++; console.error('FAIL ' + name); }
  else console.log('ok ' + name);
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy * 0.5);
  const ri = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f; out[10] = far * ri; out[11] = -1; out[14] = near * far * ri;
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

const n = 33;
const extent = 560;
const pos = new Float32Array(n * n * 3);
for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
    const x = -extent + i / (n - 1) * 2 * extent;
    const z = -extent + j / (n - 1) * 2 * extent;
    const o = (j * n + i) * 3;
    pos[o] = x; pos[o + 2] = z;
    // Deep ocean everywhere, a raised block around the origin so that cell stays fine.
    pos[o + 1] = (Math.abs(x) < 80 && Math.abs(z) < 80) ? 4 : -12;
  }
}

const s = new WorldStream({ enabled: true, maxLive: 96 });
check('systems stay global', s.systems.ocean === 'global' && s.systems.clouds === 'global' && s.systems.shore === 'local');
check('grass is a cell subsystem', s.systems.grass === 'cell' && s.systems.terrain === 'cell');
s.bindTerrain(n, extent, pos);
s.prepMs = 1e9;
s.uploads = 1000;
for (const rec of s.recs) { rec.ring = 2; s.enqueue(rec); }
for (let i = 0; i < 30 && s.queue.length; i++) s.pumpPrep();
const audit = s.auditQuads();
check('quads partition the mesh', audit.missing === 0 && audit.dup === 0 && audit.total === audit.quads);
const land = s.recAt(0, 0);
const deep = s.recAt(400, 400);
check('land cell is not coarse', land.deep === false && land.idx0.length > 0);
check('deep cell builds a skirted patch', deep.deep === true && deep.coarsePos && deep.coarseIdx.length > deep.idx0.length / 4);
{
  const verts = deep.coarsePos.length / 3;
  let bad = 0;
  for (let t = 0; t < deep.coarseIdx.length; t++) if (deep.coarseIdx[t] >= verts) bad++;
  check('coarse indices stay inside the patch', bad === 0 && verts > 4);
}

// Skirt faces point outward: a dropped vertex sits 12 m under its top.
{
  let outward = 0, inward = 0;
  const p = deep.coarsePos, idx = deep.coarseIdx;
  const cx = (deep.x0 + deep.x1) * 0.5, cz = (deep.z0 + deep.z1) * 0.5;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const drop = (p[a + 1] + 12 < p[b + 1] + 0.01 && Math.abs(p[a + 1] - p[b + 1]) > 6)
      || (p[a + 1] + 12 < p[c + 1] + 0.01 && Math.abs(p[a + 1] - p[c + 1]) > 6)
      || Math.abs(p[a + 1] - p[b + 1]) > 6;
    if (!drop && Math.abs(p[a + 1] - p[b + 1]) < 6 && Math.abs(p[a + 1] - p[c + 1]) < 6) continue;
    const ax = p[b] - p[a], ay = p[b + 1] - p[a + 1], az = p[b + 2] - p[a + 2];
    const bx = p[c] - p[a], by = p[c + 1] - p[a + 1], bz = p[c + 2] - p[a + 2];
    const nx = ay * bz - az * by, nz = ax * by - ay * bx;
    const mx = (p[a] + p[b] + p[c]) / 3 - cx;
    const mz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3 - cz;
    if (nx * mx + nz * mz >= -1) outward++; else inward++;
  }
  check('coarse skirts face outward', outward > 0 && inward === 0);
}

const grass = new Float32Array([0, 0, 0, 1, 300, 0, 1, 1, -400, -400, 2, 1]);
s.bindGrass(grass);
const gout = new Float32Array(16);
const near = s.gatherGrass(gout, 0, 0, 80);
check('grass gather keeps the near tuft', near === 1 && gout[0] === 0);
const far = s.gatherGrass(gout, 0, 0, 700);
check('grass gather grows with the fade', far === 3);

// Rings and prediction. Camera walks east; the lead should mark a cell ahead.
s.camX = 0; s.camZ = 0;
s.update(0, 0, 2, 0.016, 1, 0, null);
const home = s.recAt(0, 0);
check('camera cell is hot', home.ring === 0);
s.update(40, 0, 2, 0.016, 1, 0, null);
const ahead = s.recAt(40 + 112 * 2, 0);
check('motion leads the predict ring', ahead.ring <= 2);

// Frustum: looking toward -Z, a box far behind the camera is out; one ahead is in.
const V = new Float32Array(16), P = new Float32Array(16), VP = new Float32Array(16);
const eye = [0, 40, 200];
const fwd = [0, -0.05, -1];
const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
const right = [1, 0, 0];
const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
viewFrom(eye, right, up, fwd, V);
perspective(P, 60 * Math.PI / 180, 1.6, 0.08, 8000);
matmul(P, V, VP);
const front = s.boxOut(VP, -20, -5, -200, 20, 10, -160);
const back = s.boxOut(VP, -20, -5, 360, 20, 20, 420);
check('frustum keeps the view ahead', front === false);
check('frustum drops the view behind', back === true);

const mock = {
  createBuffer(desc) { return { size: desc.size, destroy() { this.dead = true; } }; },
  queue: { writeBuffer() {} }
};
s.sharedVB = { fake: true };
s.pumpGPU(mock);
s.recount();
check('gpu upload marks cells live', s.stats.live > 10 && s.gpuBytes > 0);
const patches = s.patches();
check('ready cells draw as patches', patches && s.patchN > 0 && s.stats.fallback === 0);
check('deep draw uses its own buffer', s.stats.drawCoarse > 0);

const off = new WorldStream({ enabled: false });
off.update(0, 0, 2, 0.016, 1, 0, null);
check('fallback disable does not page', off.patches() === null && off.vegBias(0, 0) === 0 && off.line().indexOf('stream off') === 0);
check('disabled manager still names the global sea', off.systems.ocean === 'global' && off.systems.clouds === 'global');

// Memory cap drops distant live cells and their coarse buffers, not the hot cell.
const beforeLive = s.stats.live;
s.maxLive = 3;
const homeNow = s.recAt(s.camX, s.camZ);
for (const rec of s.recs) {
  if (rec !== homeNow) { rec.ring = 2; rec.inView = false; }
}
s.enforceCap();
s.recount();
check('cap keeps the hot cell', homeNow.st === 4 && homeNow.ring === 0);
check('cap sheds live cells', s.stats.live < beforeLive && s.stats.live <= 4);

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('stream-check passed');
