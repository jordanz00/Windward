// Camera-centered streaming for the authored island.
//
// Cells are squares of ground. Rings follow the camera: hot (full detail),
// warm (still drawn), predict (loaded ahead of motion and along the view).
// CPU catalogs are built a few cells at a time. GPU buffers are created only
// on the main thread, from pumpGPU / tick.
//
// The ocean FFT and the cloud field are NOT paged. One sea and one sky cover
// the world, so waves and weather stay continuous. A cell only owns local
// detail: a terrain patch, the grass on it, and a LOD bias for plants.
// The shore solver stays a single window on that same sea.

const ST_ABSENT = 0, ST_QUEUED = 1, ST_PREP = 2, ST_READY = 3, ST_LIVE = 4;

function WorldStream(opt) {
  opt = opt || {};
  this.enabled = opt.enabled !== false;
  this.cell = 112;
  this.org = -560;
  this.nx = 10;
  this.nz = 10;
  this.recs = new Array(this.nx * this.nz);
  for (let iz = 0; iz < this.nz; iz++) {
    for (let ix = 0; ix < this.nx; ix++) {
      const x0 = this.org + ix * this.cell;
      const z0 = this.org + iz * this.cell;
      this.recs[ix + iz * this.nx] = {
        ix: ix, iz: iz, x0: x0, x1: x0 + this.cell, z0: z0, z1: z0 + this.cell,
        st: ST_ABSENT, ring: 99, hold: 0, inView: false,
        deep: false, empty: true, minY: 0, maxY: 0,
        quadIJ: null, idx0: null, ib: null, ibBytes: 0,
        coarsePos: null, coarseIdx: null,
        lodVB: null, lodIB: null, lodCount: 0, lodBytes: 0,
        gpuPending: false, iMin: 0, iMax: 0, jMin: 0, jMax: 0
      };
    }
  }
  this.queue = [];
  this._gpu = [];
  this._slot = [];
  this.patchN = 0;
  this.prepMs = 2.2;
  this.uploads = 6;
  this.gpuBytes = 0;
  this.budgetBytes = 14 * 1024 * 1024;
  this.maxLive = opt.maxLive || 100;
  this.camX = 0;
  this.camZ = 0;
  this.eyeY = 0;
  this.velX = 0;
  this.velZ = 0;
  this.cx = 0;
  this.cz = 0;
  this.terrainBound = false;
  this.terrainN = 0;
  this.terrainPos = null;
  this.sharedVB = null;
  this.grassPacked = null;
  this.grassStart = null;
  this.grassCountC = null;
  this.fail = '';
  this.stats = {
    live: 0, hot: 0, warm: 0, predict: 0, queued: 0, coarse: 0,
    draw: 0, drawCoarse: 0, fallback: 1, evict: 0, gpuUploads: 0
  };
  // What is paged and what stays one field. Reef and shore plants live in the
  // scatter, so they follow the plant cells. Fish, insects and birds move.
  this.systems = {
    terrain: 'cell', grass: 'cell', plants: 'cell', reef: 'cell',
    fish: 'global', insects: 'global', birds: 'global',
    ocean: 'global', clouds: 'global', shore: 'local'
  };
}

WorldStream.prototype.cellAt = function (x, z) {
  let ix = Math.floor((x - this.org) / this.cell);
  let iz = Math.floor((z - this.org) / this.cell);
  if (ix < 0) ix = 0;
  else if (ix >= this.nx) ix = this.nx - 1;
  if (iz < 0) iz = 0;
  else if (iz >= this.nz) iz = this.nz - 1;
  return ix + iz * this.nx;
};

WorldStream.prototype.recAt = function (x, z) {
  return this.recs[this.cellAt(x, z)];
};

WorldStream.prototype.radii = function (eyeY) {
  const y = eyeY > 0 ? eyeY : 0;
  const hot = 1 + (y > 80 ? 1 : 0) + (y > 220 ? 1 : 0);
  const warm = hot + 1 + (y > 40 ? 1 : 0);
  const predict = warm + 1 + (y > 30 ? 1 : 0);
  return [hot, warm, predict];
};

// True when the box is completely outside one clip plane (WebGPU z is 0..1).
WorldStream.prototype.boxOut = function (vp, x0, y0, z0, x1, y1, z1) {
  let mask = 63;
  const xs = [x0, x1], ys = [y0, y1], zs = [z0, z1];
  for (let k = 0; k < 8; k++) {
    const x = xs[k & 1], y = ys[(k >> 1) & 1], z = zs[k >> 2];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
    let bits = 0;
    if (cx > cw) bits |= 1;
    if (cx < -cw) bits |= 2;
    if (cy > cw) bits |= 4;
    if (cy < -cw) bits |= 8;
    if (cz > cw) bits |= 16;
    if (cz < 0) bits |= 32;
    mask &= bits;
    if (mask === 0) return false;
  }
  return true;
};

WorldStream.prototype.seen = function (rec, vp) {
  if (!vp) return false;
  return !this.boxOut(vp, rec.x0 - 36, rec.minY - 12, rec.z0 - 36, rec.x1 + 36, rec.maxY + 28, rec.z1 + 36);
};

WorldStream.prototype.bindTerrain = function (n, extent, pos) {
  this.terrainN = n;
  this.terrainPos = pos;
  const qn = n - 1;
  const buckets = [];
  for (let c = 0; c < this.recs.length; c++) buckets.push([]);
  for (let j = 0; j < qn; j++) {
    const z = -extent + (j + 0.5) / qn * 2 * extent;
    for (let i = 0; i < qn; i++) {
      const x = -extent + (i + 0.5) / qn * 2 * extent;
      buckets[this.cellAt(x, z)].push(i, j);
    }
  }
  for (let c = 0; c < this.recs.length; c++) {
    const rec = this.recs[c];
    const list = buckets[c];
    rec.quadIJ = list.length ? new Uint16Array(list) : null;
    rec.empty = !list.length;
    rec.idx0 = null;
  }
  this.terrainBound = true;
};

WorldStream.prototype.bindGrass = function (src) {
  const n = src.length >> 2;
  const counts = new Int32Array(this.recs.length);
  const which = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const id = this.cellAt(src[i * 4], src[i * 4 + 1]);
    which[i] = id;
    counts[id]++;
  }
  const start = new Int32Array(this.recs.length);
  let run = 0;
  for (let c = 0; c < counts.length; c++) { start[c] = run; run += counts[c]; }
  const cursor = start.slice();
  const packed = new Float32Array(src.length);
  for (let i = 0; i < n; i++) {
    const dst = cursor[which[i]]++;
    const s = i * 4, d = dst * 4;
    packed[d] = src[s]; packed[d + 1] = src[s + 1]; packed[d + 2] = src[s + 2]; packed[d + 3] = src[s + 3];
  }
  this.grassPacked = packed;
  this.grassStart = start;
  this.grassCountC = counts;
};

WorldStream.prototype.grassKey = function (x, z, end) {
  return ((x / 8) | 0) + ',' + ((z / 8) | 0) + ',' + (end | 0);
};

// Tufts inside the fade distance. The shader shrinks the last band, so a cell
// leaving the ring has already taken its blades to nothing.
WorldStream.prototype.gatherGrass = function (out, x, z, end) {
  if (!this.enabled || !this.grassPacked) return -1;
  const end2 = end * end;
  const reach = end + this.cell;
  const reach2 = reach * reach;
  let w = 0;
  const cap = out.length >> 2;
  const packed = this.grassPacked;
  const start = this.grassStart;
  const counts = this.grassCountC;
  for (let i = 0; i < this.recs.length; i++) {
    const n = counts[i];
    if (!n) continue;
    const rec = this.recs[i];
    let dx = 0, dz = 0;
    if (x < rec.x0) dx = rec.x0 - x;
    else if (x > rec.x1) dx = x - rec.x1;
    if (z < rec.z0) dz = rec.z0 - z;
    else if (z > rec.z1) dz = z - rec.z1;
    if (dx * dx + dz * dz > reach2) continue;
    const a = start[i];
    for (let k = 0; k < n && w < cap; k++) {
      const s = (a + k) * 4;
      const ex = packed[s] - x, ez = packed[s + 1] - z;
      if (ex * ex + ez * ez > end2) continue;
      const d = w * 4;
      out[d] = packed[s]; out[d + 1] = packed[s + 1]; out[d + 2] = packed[s + 2]; out[d + 3] = packed[s + 3];
      w++;
    }
  }
  return w;
};

WorldStream.prototype.vegBias = function (x, z) {
  if (!this.enabled) return 0;
  const rec = this.recAt(x, z);
  if (!rec || rec.ring < 2) return 0;
  return 1;
};

WorldStream.prototype.prepareCell = function (rec) {
  if (rec.idx0) return;
  const ij = rec.quadIJ;
  if (!ij || ij.length < 2 || !this.terrainPos) {
    rec.empty = true;
    rec.idx0 = new Uint32Array(0);
    rec.quadIJ = null;
    return;
  }
  const n = this.terrainN;
  const pos = this.terrainPos;
  const quads = ij.length >> 1;
  const idx = new Uint32Array(quads * 6);
  let t = 0;
  let iMin = n, iMax = 0, jMin = n, jMax = 0;
  let minY = 1e9, maxY = -1e9;
  for (let k = 0; k < ij.length; k += 2) {
    const i = ij[k], j = ij[k + 1];
    const a = j * n + i;
    idx[t++] = a; idx[t++] = a + n; idx[t++] = a + 1;
    idx[t++] = a + 1; idx[t++] = a + n; idx[t++] = a + n + 1;
    if (i < iMin) iMin = i;
    if (i + 1 > iMax) iMax = i + 1;
    if (j < jMin) jMin = j;
    if (j + 1 > jMax) jMax = j + 1;
    const corners = [a, a + 1, a + n, a + n + 1];
    for (let c = 0; c < 4; c++) {
      const y = pos[corners[c] * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  rec.idx0 = idx;
  rec.iMin = iMin; rec.iMax = iMax; rec.jMin = jMin; rec.jMax = jMax;
  rec.minY = minY;
  rec.maxY = maxY;
  // Coarse only for a flat submerged floor. A slope, a reef, or dry land stays
  // on the original triangles so a ridge cannot crack. Shallow open floor sits
  // near -1.7 m; the abyssal plain is deeper and still eligible when flat.
  rec.deep = (maxY < -1.2 && (maxY - minY) < 0.45)
    || (maxY < -8.0 && (maxY - minY) < 1.1);
  rec.empty = false;
  rec.quadIJ = null;
  if (rec.deep) {
    const coarse = buildCoarsePatch(pos, n, iMin, iMax, jMin, jMax);
    if (coarse) { rec.coarsePos = coarse.pos; rec.coarseIdx = coarse.idx; }
  }
};

function buildCoarsePatch(pos, n, iMin, iMax, jMin, jMax) {
  if (iMax <= iMin || jMax <= jMin) return null;
  const cols = [];
  for (let i = iMin; i < iMax; i += 2) cols.push(i);
  if (cols[cols.length - 1] !== iMax) cols.push(iMax);
  const rows = [];
  for (let j = jMin; j < jMax; j += 2) rows.push(j);
  if (rows[rows.length - 1] !== jMax) rows.push(jMax);
  if (cols.length < 2 || rows.length < 2) return null;
  const verts = [];
  const map = new Map();
  const add = (i, j, drop) => {
    const key = i + j * n + (drop ? n * n : 0);
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    const o = (j * n + i) * 3;
    const id = verts.length / 3;
    verts.push(pos[o], pos[o + 1] - (drop ? 12 : 0), pos[o + 2]);
    map.set(key, id);
    return id;
  };
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const a = add(cols[c], rows[r], 0);
      const b = add(cols[c], rows[r + 1], 0);
      const e = add(cols[c + 1], rows[r], 0);
      const d = add(cols[c + 1], rows[r + 1], 0);
      idx.push(a, b, e, e, b, d);
    }
  }
  // Skirts hang under the coarse edge so a step-2 seam against the full grid
  // does not open onto the void. Order is chosen so the face points outward.
  const skirt = (i0, j0, i1, j1, westOrSouth) => {
    const t0 = add(i0, j0, 0), t1 = add(i1, j1, 0);
    const b0 = add(i0, j0, 1), b1 = add(i1, j1, 1);
    if (westOrSouth) idx.push(t0, b0, t1, t1, b0, b1);
    else idx.push(t0, t1, b0, t1, b1, b0);
  };
  const jS = rows[0], jN = rows[rows.length - 1];
  const iW = cols[0], iE = cols[cols.length - 1];
  for (let c = 0; c < cols.length - 1; c++) {
    // South edge wants -Z, north wants +Z. West/east are the other winding.
    skirt(cols[c], jS, cols[c + 1], jS, false);
    skirt(cols[c], jN, cols[c + 1], jN, true);
  }
  for (let r = 0; r < rows.length - 1; r++) {
    skirt(iW, rows[r], iW, rows[r + 1], true);
    skirt(iE, rows[r], iE, rows[r + 1], false);
  }
  return { pos: new Float32Array(verts), idx: new Uint32Array(idx) };
}

WorldStream.prototype.enqueue = function (rec) {
  if (rec.st !== ST_ABSENT) return;
  rec.st = ST_QUEUED;
  this.queue.push(rec);
};

WorldStream.prototype.takeJob = function () {
  let best = -1, bestS = 1e9;
  for (let i = 0; i < this.queue.length; i++) {
    const rec = this.queue[i];
    if (rec.st !== ST_QUEUED) continue;
    const s = rec.ring * 1000 + Math.abs(rec.ix - this.cx) + Math.abs(rec.iz - this.cz);
    if (s < bestS) { bestS = s; best = i; }
  }
  if (best < 0) return null;
  const rec = this.queue[best];
  this.queue.splice(best, 1);
  return rec;
};

WorldStream.prototype.pumpPrep = function () {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let guard = 16;
  while (guard-- > 0) {
    if (typeof performance !== 'undefined' && performance.now() - t0 > this.prepMs) break;
    const rec = this.takeJob();
    if (!rec) break;
    if (rec.ring > 2) { rec.st = ST_ABSENT; continue; }
    rec.st = ST_PREP;
    this.prepareCell(rec);
    if (rec.empty) { rec.st = ST_LIVE; continue; }
    rec.st = ST_READY;
    this.wantGPU(rec);
  }
};

WorldStream.prototype.wantGPU = function (rec) {
  if (rec.gpuPending) return;
  rec.gpuPending = true;
  this._gpu.push(rec);
};

WorldStream.prototype.uploadRec = function (device, rec) {
  const INDEX = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;
  const VERT = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
  if (!rec.ib && rec.idx0 && rec.idx0.length) {
    rec.ib = makeStreamBuf(device, rec.idx0, INDEX);
    rec.ibBytes = rec.idx0.byteLength;
    this.gpuBytes += rec.ibBytes;
  }
  if (rec.deep && rec.coarsePos && rec.coarseIdx && !rec.lodVB) {
    rec.lodVB = makeStreamBuf(device, rec.coarsePos, VERT);
    rec.lodIB = makeStreamBuf(device, rec.coarseIdx, INDEX);
    rec.lodCount = rec.coarseIdx.length;
    rec.lodBytes = rec.coarsePos.byteLength + rec.coarseIdx.byteLength;
    this.gpuBytes += rec.lodBytes;
  }
};

WorldStream.prototype.pumpGPU = function (device) {
  if (!this.enabled || !device) return 0;
  let n = 0;
  try {
    while (this._gpu.length && n < this.uploads) {
      const rec = this._gpu.shift();
      rec.gpuPending = false;
      if (rec.ring > 2 && rec.st !== ST_LIVE) { rec.st = ST_ABSENT; continue; }
      this.uploadRec(device, rec);
      rec.st = ST_LIVE;
      n++;
      this.stats.gpuUploads++;
    }
  } catch (err) {
    this.enabled = false;
    this.fail = (err && err.message) ? err.message : String(err);
    this.stats.fallback = 1;
  }
  return n;
};

WorldStream.prototype.dropCoarse = function (rec) {
  if (!rec.lodVB) return;
  rec.lodVB.destroy();
  if (rec.lodIB) rec.lodIB.destroy();
  this.gpuBytes -= rec.lodBytes;
  rec.lodVB = null;
  rec.lodIB = null;
  rec.lodBytes = 0;
  rec.lodCount = 0;
};

WorldStream.prototype.dropFine = function (rec) {
  if (!rec.ib) return;
  rec.ib.destroy();
  this.gpuBytes -= rec.ibBytes;
  rec.ib = null;
  rec.ibBytes = 0;
};

// Far cells leave the GPU. The camera cell never does. Fine index buffers stay
// cached until the byte budget says otherwise, so turning around does not rebuild.
WorldStream.prototype.enforceCap = function () {
  const live = [];
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.st === ST_LIVE) live.push(rec);
  }
  if (live.length > this.maxLive) {
    const cx = this.cx, cz = this.cz;
    live.sort(function (a, b) {
      const as = (a.inView ? 0 : 100) + a.ring * 10 + Math.abs(a.ix - cx) + Math.abs(a.iz - cz);
      const bs = (b.inView ? 0 : 100) + b.ring * 10 + Math.abs(b.ix - cx) + Math.abs(b.iz - cz);
      return bs - as;
    });
    let over = live.length - this.maxLive;
    for (let i = 0; i < live.length && over > 0; i++) {
      const rec = live[i];
      if (rec.ring === 0) continue;
      rec.st = ST_ABSENT;
      rec.ring = 99;
      this.dropCoarse(rec);
      this.stats.evict++;
      over--;
    }
  }
  if (this.gpuBytes > this.budgetBytes) {
    for (let i = 0; i < this.recs.length; i++) {
      const rec = this.recs[i];
      if (rec.st !== ST_ABSENT) continue;
      this.dropCoarse(rec);
      if (this.gpuBytes > this.budgetBytes) this.dropFine(rec);
      if (this.gpuBytes <= this.budgetBytes) break;
    }
  }
};

WorldStream.prototype.recount = function () {
  let live = 0, hot = 0, warm = 0, predict = 0, coarse = 0, q = 0;
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.st === ST_LIVE) live++;
    if (rec.ring === 0) hot++;
    else if (rec.ring === 1) warm++;
    else if (rec.ring === 2) predict++;
    if (rec.lodVB) coarse++;
  }
  for (let i = 0; i < this.queue.length; i++) if (this.queue[i].st === ST_QUEUED) q++;
  this.stats.live = live;
  this.stats.hot = hot;
  this.stats.warm = warm;
  this.stats.predict = predict;
  this.stats.coarse = coarse;
  this.stats.queued = q;
};

WorldStream.prototype.update = function (x, z, y, dt, fx, fz, vp) {
  if (!this.enabled) return;
  const dtc = dt > 0.001 ? (dt < 0.1 ? dt : 0.1) : 0.001;
  this.velX = (x - this.camX) / dtc;
  this.velZ = (z - this.camZ) / dtc;
  this.camX = x;
  this.camZ = z;
  this.eyeY = y;
  const here = this.cellAt(x, z);
  this.cx = here % this.nx;
  this.cz = (here / this.nx) | 0;
  const rad = this.radii(y);
  const hotR = rad[0], warmR = rad[1], predR = rad[2];
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    const d = Math.max(Math.abs(rec.ix - this.cx), Math.abs(rec.iz - this.cz));
    let ring = 99;
    if (d <= hotR) ring = 0;
    else if (d <= warmR) ring = 1;
    else if (d <= predR) ring = 2;
    rec.ring = ring;
    rec.inView = false;
  }
  // Predictive lead: the cells the camera will enter, or the ones it is facing
  // when it is almost still. Clamped so a teleport cannot request the whole map.
  const spd = Math.hypot(this.velX, this.velZ);
  let lx, lz, lead;
  if (spd > 2.5) {
    lead = Math.min(this.cell * 4, spd * 1.25);
    lx = x + this.velX / spd * lead;
    lz = z + this.velZ / spd * lead;
  } else {
    const fl = Math.hypot(fx || 0, fz || 0) || 1;
    lead = this.cell * 1.15;
    lx = x + (fx || 0) / fl * lead;
    lz = z + (fz || 0) / fl * lead;
  }
  const steps = Math.max(1, Math.ceil(lead / (this.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const rec = this.recAt(x + (lx - x) * t, z + (lz - z) * t);
    if (rec.ring > 2) rec.ring = 2;
  }
  if (vp) {
    for (let i = 0; i < this.recs.length; i++) {
      const rec = this.recs[i];
      if (this.seen(rec, vp)) {
        rec.inView = true;
        if (rec.ring > 2) rec.ring = 2;
      }
    }
  }
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.ring > 2 && rec.st === ST_LIVE && rec.hold > 0) {
      rec.hold--;
      rec.ring = 2;
    } else if (rec.ring <= 2) rec.hold = 10;
  }
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.ring <= 2) {
      if (rec.st === ST_ABSENT) {
        if (rec.empty && rec.idx0) rec.st = ST_LIVE;
        else if (rec.ib) {
          rec.st = ST_LIVE;
          if (rec.deep && rec.ring > 0 && !rec.lodVB && rec.coarsePos) this.wantGPU(rec);
        } else this.enqueue(rec);
      }
    }
  }
  this.pumpPrep();
  let qi = 0;
  for (let i = 0; i < this.queue.length; i++) {
    const rec = this.queue[i];
    if (rec.st === ST_QUEUED && rec.ring <= 2) this.queue[qi++] = rec;
    else if (rec.st === ST_QUEUED) rec.st = ST_ABSENT;
  }
  this.queue.length = qi;
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.ring <= 2) continue;
    if (rec.st === ST_LIVE || rec.st === ST_READY) {
      rec.st = ST_ABSENT;
      this.dropCoarse(rec);
      this.stats.evict++;
    } else if (rec.st === ST_QUEUED || rec.st === ST_PREP) rec.st = ST_ABSENT;
  }
  this.enforceCap();
  this.recount();
};

WorldStream.prototype.tick = function (x, z, y, dt, fx, fz, vp, device) {
  if (!this.enabled) return;
  this.update(x, z, y, dt, fx, fz, vp);
  this.pumpGPU(device);
  this.recount();
};

// Draw list for the main view and the mirror. Null means "use the full mesh"
// so a cell that is not on the GPU yet cannot open a hole.
WorldStream.prototype.patches = function () {
    if (!this.enabled || !this.terrainBound || !this.sharedVB) {
    this.stats.fallback = 1;
    this.stats.draw = 0;
    this.stats.drawCoarse = 0;
    this.patchN = 0;
    return null;
  }
  const slot = this._slot;
  let n = 0;
  let coarseN = 0;
  for (let i = 0; i < this.recs.length; i++) {
    const rec = this.recs[i];
    if (rec.empty || !rec.idx0 || !rec.idx0.length) continue;
    const draw = rec.ring <= 1 || (rec.ring === 2 && rec.inView);
    if (!draw) continue;
    if (rec.st !== ST_LIVE || !rec.ib) {
      this.stats.fallback = 1;
      this.stats.draw = 0;
      this.stats.drawCoarse = 0;
      this.patchN = 0;
      return null;
    }
    let vb = this.sharedVB, ib = rec.ib, count = rec.idx0.length;
    if (rec.deep && rec.ring > 0 && rec.lodVB && rec.lodIB) {
      vb = rec.lodVB;
      ib = rec.lodIB;
      count = rec.lodCount;
      coarseN++;
    }
    let s = slot[n];
    if (!s) { s = { vb: null, ib: null, count: 0 }; slot[n] = s; }
    s.vb = vb; s.ib = ib; s.count = count;
    n++;
  }
  if (!n) {
    this.stats.fallback = 1;
    this.stats.draw = 0;
    this.stats.drawCoarse = 0;
    this.patchN = 0;
    return null;
  }
  this.patchN = n;
  this.stats.draw = n;
  this.stats.drawCoarse = coarseN;
  this.stats.fallback = 0;
  return slot;
};

WorldStream.prototype.auditQuads = function () {
  const n = this.terrainN;
  const qn = n - 1;
  const seen = new Uint8Array(qn * qn);
  let total = 0;
  for (let c = 0; c < this.recs.length; c++) {
    const idx = this.recs[c].idx0;
    if (!idx) continue;
    for (let t = 0; t < idx.length; t += 6) {
      const a = idx[t];
      const i = a % n;
      const j = (a / n) | 0;
      const q = j * qn + i;
      if (q >= 0 && q < seen.length) seen[q]++;
      total++;
    }
  }
  let missing = 0, dup = 0;
  for (let q = 0; q < seen.length; q++) {
    if (seen[q] === 0) missing++;
    else if (seen[q] !== 1) dup++;
  }
  return { total: total, missing: missing, dup: dup, quads: seen.length };
};

WorldStream.prototype.line = function () {
  if (!this.enabled) return 'stream off  ocean+clouds global';
  const s = this.stats;
  const mb = (this.gpuBytes / (1024 * 1024)).toFixed(2);
  return 'stream live ' + s.live
    + '  rings ' + s.hot + '/' + s.warm + '/' + s.predict
    + '  q' + s.queued
    + '  draw ' + s.draw + (s.fallback ? ' full' : ' cells')
    + (s.drawCoarse ? '  coarse ' + s.drawCoarse : '')
    + '  gpu ' + mb + 'MB'
    + '  ocean+clouds global';
};

function makeStreamBuf(device, data, usage) {
  const b = device.createBuffer({ size: data.byteLength, usage: usage });
  device.queue.writeBuffer(b, 0, data);
  return b;
}
