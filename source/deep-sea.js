// Deferred deep-sea sharks — off critical gzip. Appended before FishLife when ensureDeepSea() runs.
(function (g) {
  'use strict';
  if (typeof g.__wwAppendFishSpecies === 'function') {
    g.__wwAppendFishSpecies([
      { name: 'bluntnose sixgill', len: [1.85, 2.45], sb: 0.82, top: [0.125, 0.36, 0.55], bot: [0.11, 0.4, 0.6], wid: [0.085, 0.34, 0.55], ped: 0.028,
        tail: [0.48, 0.4, 0.2], dorsal: [0.48, 0.78, 0.07, 0], anal: [0.58, 0.8, 0.045, 0], pect: [0.2, -0.04, 0.26, 0.42], eye: [0.075, 0.015, 0.016, -0.2],
        fin: [[0.16, 0.14, 0.12], [0.06, 0.05, 0.05]],
        role: 4, cruise: 0.42, burst: 1.35, turn: 0.95, sep: 2.8, clear: 0.75, top_: 4.8, shy: 5.5, wander: 0.07, idle: 0.88, coh: 0.25, ali: 0.15, wag: 1.05, scull: 0.1, prey: 0, coarse: 1 },
      { name: 'bigeye sixgill', len: [1.35, 1.85], sb: 0.82, top: [0.12, 0.36, 0.55], bot: [0.105, 0.4, 0.6], wid: [0.08, 0.34, 0.55], ped: 0.026,
        tail: [0.48, 0.38, 0.2], dorsal: [0.48, 0.78, 0.065, 0], anal: [0.58, 0.8, 0.04, 0], pect: [0.2, -0.04, 0.24, 0.4], eye: [0.08, 0.03, 0.024, 0.05],
        fin: [[0.14, 0.13, 0.12], [0.05, 0.05, 0.05]],
        role: 4, cruise: 0.48, burst: 1.5, turn: 1.1, sep: 2.4, clear: 0.65, top_: 3.8, shy: 4.8, wander: 0.09, idle: 0.85, coh: 0.3, ali: 0.2, wag: 1.0, scull: 0.12, prey: 0, coarse: 1, shapeOf: 12 },
      { name: 'greenland shark', len: [2.2, 2.9], sb: 0.84, top: [0.14, 0.4, 0.5], bot: [0.12, 0.42, 0.55], wid: [0.1, 0.38, 0.5], ped: 0.032,
        tail: [0.35, 0.36, 0.35], dorsal: [0.4, 0.7, 0.055, 3], anal: [0.55, 0.74, 0.035, 3], pect: [0.22, -0.03, 0.22, 0.5], eye: [0.07, 0.025, 0.014, -0.1],
        fin: [[0.22, 0.2, 0.16], [0.1, 0.09, 0.07]],
        role: 4, cruise: 0.28, burst: 0.85, turn: 0.7, sep: 3.5, clear: 0.85, top_: 6.2, shy: 6.5, wander: 0.04, idle: 0.92, coh: 0.15, ali: 0.1, wag: 0.75, scull: 0.08, prey: 0, coarse: 1, shapeOf: 12 },
      { name: 'cookiecutter shark', len: [0.28, 0.42], sb: 0.78, top: [0.1, 0.4, 0.7], bot: [0.095, 0.42, 0.75], wid: [0.07, 0.38, 0.7], ped: 0.028,
        tail: [0.55, 0.28, 0.15], dorsal: [0.35, 0.65, 0.04, 3], anal: [0.5, 0.7, 0.03, 3], pect: [0.24, -0.02, 0.14, 0.35], eye: [0.09, 0.02, 0.02, 0.0],
        fin: [[0.28, 0.22, 0.18], [0.12, 0.08, 0.06]],
        role: 5, cruise: 0.35, burst: 1.6, turn: 2.8, sep: 0.55, clear: 0.45, top_: 2.8, shy: 2.4, wander: 0.22, idle: 0.7, coh: 0.85, ali: 0.75, wag: 1.2, scull: 0.25, prey: 0, coarse: 1 },
      { name: 'portuguese dogfish', len: [0.7, 0.95], sb: 0.8, top: [0.11, 0.38, 0.6], bot: [0.1, 0.4, 0.65], wid: [0.075, 0.36, 0.6], ped: 0.025,
        tail: [0.7, 0.32, 0.1], dorsal: [0.3, 0.55, 0.09, 2], anal: [0.52, 0.72, 0.04, 2], pect: [0.23, -0.03, 0.2, 0.38], eye: [0.075, 0.035, 0.018, 0.05],
        fin: [[0.2, 0.18, 0.16], [0.08, 0.07, 0.06]],
        role: 4, cruise: 0.38, burst: 1.45, turn: 1.5, sep: 1.6, clear: 0.4, top_: 3.2, shy: 3.6, wander: 0.1, idle: 0.8, coh: 0.45, ali: 0.35, wag: 0.9, scull: 0.18, prey: 0, coarse: 1, shapeOf: 10 }
    ]);
  }

  g.__wwSeedDeepSharks = function (ctx) {
    const S = ctx.S, school = ctx.school, bedAt = ctx.bedAt, open = ctx.open, rnd = ctx.rnd, f = ctx.f, reef = ctx.reef;
    const deepLane = function (anchors, need) {
      const pts = [];
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i], b = bedAt(a[0], a[2]);
        if (b > -need) continue;
        pts.push([a[0], Math.max(a[1], b + 1.35), a[2]]);
      }
      return pts;
    };
    // Signature bluntnose sixgill — SE basin, always present.
    {
      let pts = deepLane([[300, -8.2, -155], [275, -8.8, -175], [255, -7.6, -140], [285, -9.0, -190], [320, -8.0, -165], [290, -7.8, -130]], 6);
      if (pts.length < 2) {
        const b = bedAt(290, -160), y = Math.min(-6.8, b + 1.6);
        pts = [[290, y, -160], [312, y, -178], [276, y, -144]];
      }
      school(12, 1, pts[0], 2.8, pts, 0);
    }
    if (rnd() < 0.85 * Math.min(1, f + 0.3)) {
      const pts = deepLane([[260, -6.5, -145], [240, -7.0, -170], [285, -6.2, -185], [310, -6.8, -150], [270, -5.9, -125]], 5.5);
      if (pts.length > 2) school(13, 1, pts[0], 2.4, pts, 0);
    }
    {
      let pts = deepLane([[330, -9.5, -180], [300, -10.2, -210], [270, -9.0, -195], [350, -9.8, -160]], 7);
      if (pts.length < 2) {
        const b = bedAt(320, -190), y = Math.min(-8.5, b + 1.6);
        pts = [[320, y, -190], [295, y, -210], [338, y, -178]];
      }
      school(14, 1, pts[0], 3.2, pts, 0);
      S[S.length - 1].big = true;
    }
    for (let i = 0; i < Math.round(1 + 0.8 * f); i++) {
      const pts = [];
      for (let j = 0; j < 6; j++) {
        const p = [240 + rnd() * 120, -4.5 - rnd() * 3.5, -200 + rnd() * 140], b = bedAt(p[0], p[2]);
        if (b > -5.5) continue;
        p[1] = Math.min(p[1], b + 2.2);
        if (!pts.length || open(pts[pts.length - 1], p, 2.5)) pts.push(p);
      }
      if (pts.length > 2) school(15, 3 + ((rnd() * 4) | 0), pts[0], 1.6, pts, 0);
    }
    for (let i = 0; i < Math.round(1 + 0.7 * f); i++) {
      const pts = [];
      for (let j = 0; j < 6; j++) {
        const p = [200 + rnd() * 100, -5.5 - rnd() * 3.0, -40 + rnd() * 160], b = bedAt(p[0], p[2]);
        if (b > -4.5 || b < -14) continue;
        p[1] = b + 0.55 + rnd() * 0.7;
        if (!pts.length || open(pts[pts.length - 1], p, 2.0)) pts.push(p);
      }
      if (pts.length > 2) school(16, 1 + ((rnd() * 2) | 0), pts[0], 1.8, pts, 0);
    }
    // Rare wreck emerge — always sixgill.
    if (reef.wrecks && reef.wrecks.length) {
      const w = reef.wrecks[0];
      const route = [
        [w.x + 42, -8.4, w.z - 18], [w.x + 24, -6.8, w.z - 10], [w.x + 10, -4.6, w.z + 2],
        [w.x + 6, -4.1, w.z + 6], [w.x + 16, -5.4, w.z + 14], [w.x + 38, -7.8, w.z + 8]
      ].map(function (p) { const b = bedAt(p[0], p[2]); return [p[0], Math.max(p[1], b + 1.2), p[2]]; })
        .filter(function (p) { return bedAt(p[0], p[2]) < -2.8; });
      if (route.length > 2) {
        school(12, 1, route[0], 2.6, route, 5);
        // Mid-water hang under the wreck (not bed-hugging).
        S[S.length - 1].top_ = 2.4;
        S[S.length - 1].wreck = true;
      }
    }
  };

  function DeepSeaLife(world, reef, q) {
    this.world = world;
    this.reef = reef;
    this.q = q;
    this.ready = true;
    this.schools = [];
  }
  DeepSeaLife.prototype.update = function () {};
  DeepSeaLife.prototype.collect = function (out) { return out || []; };
  DeepSeaLife.prototype.find = function () { return null; };
  g.DeepSeaLife = DeepSeaLife;
  g.__wwDeepSeaReady = true;
})(typeof globalThis !== 'undefined' ? globalThis : this);
