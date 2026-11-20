function shaderCode(res, span) {
  const texel = (span * 2) / (res - 1);
  return `struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  reflVP: mat4x4<f32>,
  camPos: vec3<f32>,
  time: f32,
  sunDir: vec3<f32>,
  under: f32,
  sunCol: vec3<f32>,
  exposure: f32,
  horiz: vec3<f32>,
  tanHalf: f32,
  right: vec3<f32>,
  aspect: f32,
  upv: vec3<f32>,
  clipBelow: f32,
  fwd: vec3<f32>,
  steps: f32,
  reflPos: vec3<f32>,
  cloudOct: f32,
  gridO: vec2<f32>,
  cover: f32,
  camDamp: f32,
  res: vec2<f32>,
  reflOn: f32,
  pad0: f32,
  waves: array<vec4<f32>, 8>,
  steep: array<vec4<f32>, 2>,
  ctrl: vec4<f32>,
  mat: vec4<f32>,
  lit: vec4<f32>,
  deepC: vec4<f32>,
  shalC: vec4<f32>,
  ripO: vec4<f32>,
  mood: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var htex: texture_2d<f32>;
@group(0) @binding(2) var ripTex: texture_2d<f32>;

@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_depth_2d;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var reflSamp: sampler;

const SPAN: f32 = ${span.toFixed(1)};
const ORIGIN: f32 = ${(-span).toFixed(1)};
const HRES: i32 = ${res | 0};
const TEXEL: f32 = ${texel.toFixed(5)};
const PI: f32 = 3.14159265;
const G: f32 = 9.81;

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn n2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x),
             mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn texel(i: vec2<i32>) -> vec2<f32> { return textureLoad(htex, i, 0).rg; }

fn sampleField(xz: vec2<f32>) -> vec2<f32> {
  let u = (xz.x - ORIGIN) / (SPAN * 2.0) * f32(HRES - 1);
  let v = (xz.y - ORIGIN) / (SPAN * 2.0) * f32(HRES - 1);
  if (u < 0.0 || v < 0.0 || u >= f32(HRES - 1) || v >= f32(HRES - 1)) { return vec2<f32>(-26.0, 1.0); }
  let ip = vec2<i32>(floor(vec2<f32>(u, v)));
  let f = fract(vec2<f32>(u, v));
  let ab = mix(texel(ip), texel(ip + vec2<i32>(1, 0)), f.x);
  let cd = mix(texel(ip + vec2<i32>(0, 1)), texel(ip + vec2<i32>(1, 1)), f.x);
  return mix(ab, cd, f.y);
}

fn tonemap(c: vec3<f32>) -> vec3<f32> {
  let x = max(c, vec3<f32>(0.0)) * F.exposure;
  let y = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  return pow(y, vec3<f32>(0.4545));
}

fn cloudDens(p: vec2<f32>) -> f32 {
  var v = 0.0;
  var a = 0.56;
  var q = p;
  let oct = i32(F.cloudOct);
  for (var i = 0; i < 4; i++) {
    if (i >= oct) { break; }
    v += a * n2(q);
    q = q * 2.07 + vec2<f32>(1.7, 8.3);
    a *= 0.5;
  }
  return v;
}

fn skyColor(rd: vec3<f32>) -> vec3<f32> {
  let up = sat(rd.y);
  let mu = dot(rd, F.sunDir);
  // Deep overhead, pale and slightly warm at the horizon, the way a humid afternoon looks.
  let zenith = vec3<f32>(0.07, 0.22, 0.58);
  let mid = vec3<f32>(0.30, 0.50, 0.82);
  let haze = vec3<f32>(0.73, 0.79, 0.84);
  var col = mix(zenith, mid, smoothstep(0.02, 0.55, up));
  col = mix(haze, col, smoothstep(0.0, 0.16, up));
  let air = pow(1.0 - up, 1.5);
  let warm = vec3<f32>(1.05, 0.68, 0.34);
  col += warm * (pow(sat(mu), 5.0) * 0.16 + pow(sat(mu), 32.0) * 0.38) * (0.25 + air);
  let over = sat(F.mood.y);
  col += vec3<f32>(1.2, 1.02, 0.88) * pow(sat(mu), 2200.0) * 18.0 * (1.0 - over);
  if (rd.y > 0.012) {
    let t = (480.0 - F.camPos.y) / rd.y;
    if (t > 0.0 && t < 12000.0) {
      let hit = F.camPos.xz + rd.xz * t;
      let uv = hit * 0.00022 + vec2<f32>(F.time * 0.0022, F.time * 0.0009);
      let d = cloudDens(uv);
      let dens = smoothstep(mix(0.40, 0.22, over), mix(0.72, 0.5, over), d);
      let dl = cloudDens(uv + F.sunDir.xz * 0.012);
      let lit = sat(0.22 + (dl - d) * 3.6);
      var cc = mix(vec3<f32>(0.46, 0.50, 0.56), vec3<f32>(1.05, 1.02, 0.98), lit);
      cc += vec3<f32>(1.0, 0.78, 0.48) * pow(sat(mu), 3.0) * dens * 0.22;
      let fade = smoothstep(0.012, 0.18, rd.y) * sat(1.0 - t / 11000.0);
      col = mix(col, cc, dens * fade * mix(0.92, 1.0, over));
    }
  }
  let warmK = sat(F.mood.x);
  col = mix(col, col * vec3<f32>(1.08, 0.97, 0.9) + vec3<f32>(0.04, 0.02, 0.0), warmK * 0.55);
  col = mix(col, vec3<f32>(0.50, 0.53, 0.56) * (0.45 + 0.7 * up), over * 0.82);
  col = mix(F.horiz, col, 1.0 - sat(F.mood.z) * 0.28 * (1.0 - up));
  return col * max(F.lit.y, 0.0);
}

fn cloudShade(xz: vec2<f32>, y: f32) -> f32 {
  let shift = F.sunDir.xz * (480.0 - y) / max(F.sunDir.y, 0.25);
  let uv = (xz - shift) * 0.00022 + vec2<f32>(F.time * 0.0022, F.time * 0.0009);
  let dens = smoothstep(0.5, 0.75, cloudDens(uv));
  return mix(1.0, 0.55, dens);
}

fn applyFog(col: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let dist = length(world - F.camPos);
  var dens = mix(0.0015, 0.00022, sat(F.camPos.y / 160.0));
  var fc = F.horiz;
  if (F.under > 0.5) {
    dens = mix(0.028, 0.07, sat(F.camDamp));
    fc = vec3<f32>(0.025, 0.16, 0.20);
  }
  return mix(fc, col, sat(exp(-dist * dens)));
}

fn caustic(xz: vec2<f32>) -> f32 {
  // The swell focuses sunlight. Sample the surface where the sun ray enters the water.
  let depth = max(-sampleField(xz).x, 0.12);
  let surf = xz - F.sunDir.xz * (depth / max(F.sunDir.y, 0.3));
  var jxx = 0.0;
  var jzz = 0.0;
  var jxz = 0.0;
  let kP = 6.2831853 / F.waves[0].w;
  let wP = sqrt(G * kP);
  let Qs = F.steep[0];
  for (var i = 0; i < 4; i++) {
    let w = F.waves[i];
    let k = 6.2831853 / w.w;
    var Q = Qs.w;
    if (i == 0) { Q = Qs.x; } else if (i == 1) { Q = Qs.y; } else if (i == 2) { Q = Qs.z; }
    var omega = sqrt(G * k);
    if (i == 1) { omega = wP * (k / kP); }
    let s = sin(k * dot(w.xy, surf) - omega * F.time);
    let wa = k * w.z * Q * 0.4;
    jxx += w.x * w.x * wa * s;
    jzz += w.y * w.y * wa * s;
    jxz += w.x * w.y * wa * s;
  }
  // Short waves from two directions. Their crossings are the bright network on the sand.
  let jig = vec2<f32>(n2(surf * 0.47) - 0.5, n2(surf * 0.47 + vec2<f32>(2.3, 0.7)) - 0.5);
  let p = surf + jig * 1.8;
  let net = array<vec4<f32>, 3>(vec4<f32>(0.98, 0.20, 8.4, 0.006), vec4<f32>(-0.16, 0.99, 13.6, 0.0045), vec4<f32>(0.64, 0.77, 19.5, 0.0035));
  for (var e = 0; e < 3; e++) {
    let dir = net[e].xy;
    let k = net[e].z;
    let phase = k * dot(dir, p) - sqrt(G * k) * F.time * 1.35;
    let s = sin(phase);
    let wa = k * net[e].w * 0.28;
    jxx += dir.x * dir.x * wa * s;
    jzz += dir.y * dir.y * wa * s;
    jxz += dir.x * dir.y * wa * s;
  }
  let jac = (1.0 - jxx) * (1.0 - jzz) - jxz * jxz;
  // The swell is long, so its area change is small. Scale it until the bright lines read on the sand.
  // Soft focus, not a bright lattice. The extra waves only break the pattern up.
  let pinch = sat((0.42 - jac) * 2.4);
  return pow(pinch, 1.7) * exp(-depth * 0.4) * 0.45;
}

fn shadowAt(p: vec3<f32>) -> f32 {
  let steps = i32(F.steps);
  if (steps < 1) { return 1.0; }
  var pos = p + F.sunDir * 1.2;
  for (var i = 0; i < 12; i++) {
    if (i >= steps) { break; }
    pos += F.sunDir * 3.2;
    if (pos.y < sampleField(pos.xz).x) { return 0.38; }
  }
  return 1.0;
}

fn shade(world: vec3<f32>, nrm: vec3<f32>, albedo: vec3<f32>) -> vec3<f32> {
  let n = normalize(nrm);
  // Green materials are leaves. They wrap the light and pass it when backlit.
  let leaf = sat((albedo.g - max(albedo.r, albedo.b)) * 4.0);
  let ndl = max(dot(n, F.sunDir), 0.0);
  let lit = mix(ndl, sat(ndl * 0.45 + 0.55), leaf);
  let sh = shadowAt(world) * cloudShade(world.xz, world.y);
  let hemi = n.y * 0.5 + 0.5;
  let sky = vec3<f32>(0.34, 0.48, 0.70) * hemi;
  let ground = vec3<f32>(0.26, 0.19, 0.11) * (1.0 - hemi);
  var light = F.sunCol * lit * sh * 1.2 + sky * 0.7 + ground * 0.4;
  if (world.y < 0.05) {
    let depth = max(-world.y, 0.0);
    let absorb = exp(-depth * vec3<f32>(0.38, 0.08, 0.05));
    light *= absorb;
    if (world.y < -0.04) { light += F.sunCol * caustic(world.xz) * absorb * 0.55; }
  }
  if (F.under > 0.5) { light *= vec3<f32>(0.55, 0.82, 0.86); }
  var col = albedo * light;
  let back = sat(dot(-n, F.sunDir));
  col += albedo * vec3<f32>(0.55, 0.95, 0.28) * back * sh * leaf * 1.15;
  if (world.y > -0.15 && world.y < 1.1) {
    let V = normalize(F.camPos - world);
    let H = normalize(V + F.sunDir);
    let spec = pow(max(dot(n, H), 0.0), mix(56.0, 22.0, leaf));
    let wet = (1.0 - sat(world.y / 0.7)) * (1.0 - leaf);
    col += F.sunCol * spec * sh * (leaf * 0.04 + wet * 0.09);
  }
  return applyFog(col, world);
}

fn terrainAlbedo(xz: vec2<f32>, y: f32, n: vec3<f32>) -> vec3<f32> {
  let slope = sat(1.0 - n.y);
  let rock = smoothstep(0.5, 0.82, slope) * smoothstep(1.2, 5.0, y);
  var sandW = smoothstep(2.5, 0.25, y) * (1.0 - rock);
  // below the waterline the bottom is sand unless it is steep
  if (y < 0.3) { sandW = max(sandW, 1.0 - rock); }
  let grassW = sat(1.0 - rock - sandW);
  let m = n2(xz * 0.11);
  let fine = n2(xz * 0.85);
  let grain = n2(xz * 3.6);
  var sandC = mix(vec3<f32>(0.62, 0.54, 0.39), vec3<f32>(0.46, 0.39, 0.27), fine);
  let wash = sin(dot(xz, vec2<f32>(0.42, 0.07)) + n2(xz * 0.15) * 3.0);
  sandC *= 0.9 + 0.1 * wash;
  sandC *= 0.92 + 0.12 * grain;
  // Only the sand the tide never leaves is always dark. The wash above it moves.
  let wet = smoothstep(0.28, 0.0, y);
  sandC = mix(sandC, sandC * vec3<f32>(0.42, 0.46, 0.44), wet * 0.78);
  if (y < 0.05) { sandC = mix(vec3<f32>(0.70, 0.64, 0.50), sandC, sat(-y * 0.4 + 0.3)); }
  var grassC = mix(vec3<f32>(0.13, 0.24, 0.06), vec3<f32>(0.30, 0.38, 0.10), m);
  grassC *= 0.78 + 0.36 * n2(xz * 0.22);
  grassC = mix(grassC, vec3<f32>(0.38, 0.36, 0.15), smoothstep(3.5, 0.9, y) * 0.32);
  grassC = mix(grassC, grassC * 0.72, smoothstep(0.55, 0.85, n2(xz * 1.4)) * 0.45);
  var rockC = mix(vec3<f32>(0.40, 0.38, 0.34), vec3<f32>(0.22, 0.21, 0.19), m);
  rockC *= 0.86 + 0.18 * sin(y * 1.4 + m * 5.0);
  rockC = mix(rockC, vec3<f32>(0.34, 0.36, 0.22), smoothstep(0.62, 0.86, n2(xz * 0.35)) * (1.0 - slope));
  return sandC * sandW + grassC * grassW + rockC * rock;
}

struct Wash { runup: f32, foam: f32, wet: f32, beach: f32 }
fn washAt(xz: vec2<f32>) -> Wash {
  var o: Wash;
  o.runup = 0.0;
  o.foam = 0.0;
  o.wet = 0.0;
  o.beach = 0.0;
  let h = sampleField(xz).x;
  if (h < -0.55 || h > 2.3) { return o; }
  let e = 2.2;
  let hx = sampleField(xz + vec2<f32>(e, 0.0)).x - sampleField(xz - vec2<f32>(e, 0.0)).x;
  let hz = sampleField(xz + vec2<f32>(0.0, e)).x - sampleField(xz - vec2<f32>(0.0, e)).x;
  let g = vec2<f32>(hx, hz);
  let slope = length(g) / (e * 2.0);
  // Gentle beach only. A cliff face does not take a wash.
  let gentle = smoothstep(0.01, 0.045, slope) * smoothstep(0.72, 0.28, slope);
  let band = smoothstep(2.1, 0.15, h) * smoothstep(-0.45, 0.0, h);
  let beach = gentle * band;
  if (beach < 0.02) { return o; }
  let up = g / max(length(g), 1e-3);
  let along = dot(xz, vec2<f32>(-up.y, up.x));
  // Energy a few meters downhill, because the beach itself stores no wave scale.
  let energy = sat(sampleField(xz - up * 7.0).y);
  let ph = F.time * 0.62 - along * 0.045;
  let p1 = pow(sat(sin(ph)), 1.55);
  let p2 = pow(sat(sin(F.time * 0.27 - along * 0.07 + 1.9)), 1.8);
  let reach = mix(0.55, 1.25, energy);
  // Signed meters, so the waterline wanders along the beach instead of tracing one contour.
  let wander = (n2(vec2<f32>(along * 0.045, floor(F.time * 0.33))) - 0.42) * 0.95
             + (n2(vec2<f32>(along * 0.16, 2.4)) - 0.4) * 0.42
             + (n2(vec2<f32>(along * 0.5, F.time * 0.2)) - 0.5) * 0.16;
  let runup = max((0.08 + 0.46 * p1 + 0.18 * p2) * reach + wander, 0.05);
  let high = max((0.28 + 0.2 * (0.5 + 0.5 * sin(F.time * 0.1 - along * 0.018))) * reach + wander * 0.65, runup);
  let below = runup - h;
  let rising = sat(cos(ph));
  let flow = select(-0.7, 1.0, rising > 0.4);
  let streak = n2(vec2<f32>(along * 0.72, h * 4.8 - F.time * 0.95 * flow));
  let fine = n2(vec2<f32>(along * 2.4 + F.time * 0.2, h * 9.0));
  let lip = exp(-abs(h - runup) * 10.0) * smoothstep(-0.02, 0.035, below);
  let body = smoothstep(0.02, 0.12, below) * smoothstep(0.9, 0.2, below / max(runup, 0.08));
  o.runup = runup;
  // Holes in the lip, and thin streaks behind it. A solid band reads as paint.
  let holes = smoothstep(0.45, 0.78, streak * 0.55 + fine * 0.45);
  o.foam = sat(lip * holes + body * pow(max(streak, 0.0), 2.1) * 0.65) * beach;
  o.wet = beach * smoothstep(high + 0.2, high - 0.35, h);
  o.beach = beach;
  return o;
}

struct SkyV {
  @builtin(position) clip: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}
@vertex fn vsSky(@builtin(vertex_index) id: u32) -> SkyV {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: SkyV;
  o.ndc = p[id];
  o.clip = vec4<f32>(p[id], 1.0, 1.0);
  return o;
}

struct GeoV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
}
@vertex fn vsTerrain(@location(0) p: vec3<f32>) -> GeoV {
  var o: GeoV;
  o.world = p;
  o.nrm = vec3<f32>(0.0, 1.0, 0.0);
  o.clip = F.viewProj * vec4<f32>(p, 1.0);
  return o;
}
@fragment fn fsTerrain(in: GeoV) -> @location(0) vec4<f32> {
  if (F.clipBelow > 0.5 && in.world.y < -0.25) { discard; }
  var n = normalize(vec3<f32>(
    sampleField(in.world.xz - vec2<f32>(TEXEL, 0.0)).x - sampleField(in.world.xz + vec2<f32>(TEXEL, 0.0)).x,
    TEXEL * 2.0,
    sampleField(in.world.xz - vec2<f32>(0.0, TEXEL)).x - sampleField(in.world.xz + vec2<f32>(0.0, TEXEL)).x
  ));
  let slope = sat(1.0 - n.y);
  let b = n2(in.world.xz * 1.7) - n2(in.world.xz * 1.7 + vec2<f32>(0.4, 0.1));
  n = normalize(n + vec3<f32>(b, 0.0, n2(in.world.xz * 1.7 + vec2<f32>(2.0, 0.0)) - 0.5) * (0.18 + slope * 0.55));
  let g0 = n2(in.world.xz * 5.5);
  let gx = n2(in.world.xz * 5.5 + vec2<f32>(0.18, 0.0)) - g0;
  let gz = n2(in.world.xz * 5.5 + vec2<f32>(0.0, 0.18)) - g0;
  n = normalize(n + vec3<f32>(gx, 0.0, gz) * (1.0 - slope) * 0.55);
  var alb = terrainAlbedo(in.world.xz, in.world.y, n);
  var washFoam = 0.0;
  var washWet = 0.0;
  if (in.world.y > -0.02 && in.world.y < 2.2 && slope < 0.62) {
    let W = washAt(in.world.xz);
    washWet = W.wet;
    washFoam = W.foam;
    alb = mix(alb, alb * vec3<f32>(0.34, 0.36, 0.34), W.wet * smoothstep(0.02, 0.18, in.world.y));
  }
  var col = shade(in.world, n, alb);
  if (washWet > 0.05 || washFoam > 0.02) {
    // Darken after the tonemap-bound lighting, or the wet sand stays as bright as the dry.
    col *= mix(1.0, 0.38, washWet * (1.0 - washFoam * 0.85));
    let sun = 0.62 + 0.5 * max(dot(n, F.sunDir), 0.0);
    col = mix(col, vec3<f32>(0.7, 0.74, 0.7) * sun, washFoam);
  }
  return vec4<f32>(col, 1.0);
}

struct MeshV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
}
@vertex fn vsMesh(@location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) c: vec3<f32>, @location(3) sway: f32) -> MeshV {
  var w = p;
  let phase = F.time * (0.85 + 0.35 * fract(p.x * 0.17)) + p.x * 0.11 + p.z * 0.07;
  let gust = sin(phase) * 0.7 + sin(phase * 2.17 + 1.3) * 0.3;
  w.x += gust * sway * 0.9;
  w.z += gust * sway * 0.35;
  w.y -= abs(gust) * sway * sway * 0.22;
  var o: MeshV;
  o.world = w;
  o.nrm = n;
  o.col = c;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}
@fragment fn fsMesh(in: MeshV) -> @location(0) vec4<f32> {
  if (F.clipBelow > 0.5 && in.world.y < -0.2) { discard; }
  var n = in.nrm;
  if (dot(n, F.camPos - in.world) < 0.0) { n = -n; }
  var col = shade(in.world, n, in.col);
  let ground = sampleField(in.world.xz).x;
  let above = in.world.y - ground;
  if (above > 0.02 && above < 1.8) {
    col *= mix(0.48, 1.0, smoothstep(0.02, 0.9, above));
  }
  return vec4<f32>(col, 1.0);
}

struct GrassV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) kind: f32,
}
@vertex fn vsGrass(@location(0) p: vec3<f32>, @location(1) uv: vec2<f32>, @location(2) inst: vec4<f32>) -> GrassV {
  let sc = abs(inst.w);
  let weed = select(0.0, 1.0, inst.w < 0.0);
  let s = sin(inst.z); let c = cos(inst.z);
  var lp = vec3<f32>(p.x * sc, p.y * sc, p.z * sc);
  let x = lp.x * c - lp.z * s;
  let z = lp.x * s + lp.z * c;
  let ground = sampleField(vec2<f32>(inst.x, inst.y)).x;
  var w = vec3<f32>(inst.x + x, ground + lp.y, inst.y + z);
  let sway = uv.y * (0.25 + weed * 0.45);
  let ph = sin(F.time * (1.5 + weed) + inst.x * 0.2 + inst.y * 0.17);
  w.x += ph * sway;
  w.z += ph * sway * 0.35;
  var o: GrassV;
  o.world = w;
  o.nrm = normalize(vec3<f32>(ph * 0.3, 1.0, 0.1));
  o.uv = uv;
  o.kind = weed;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}
@fragment fn fsGrass(in: GrassV) -> @location(0) vec4<f32> {
  let ground = sampleField(in.world.xz).x;
  var col = mix(vec3<f32>(0.10, 0.22, 0.05), vec3<f32>(0.40, 0.46, 0.16), in.uv.y);
  if (ground < 1.6 && ground > 0.15) {
    col = mix(vec3<f32>(0.28, 0.32, 0.10), vec3<f32>(0.55, 0.52, 0.22), in.uv.y);
  }
  if (in.kind > 0.5) { col = mix(vec3<f32>(0.04, 0.16, 0.09), vec3<f32>(0.18, 0.34, 0.16), in.uv.y); }
  let rib = smoothstep(0.08, 0.0, abs(in.uv.x - 0.5));
  col *= 0.82 + 0.22 * n2(in.world.xz * 1.6) - rib * 0.12;
  return vec4<f32>(shade(in.world, in.nrm, col), 1.0);
}

struct BirdV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
}
@vertex fn vsBird(@location(0) p: vec3<f32>, @location(1) wing: f32, @location(2) inst: vec4<f32>) -> BirdV {
  var lp = p;
  let flap = sin(F.time * 6.2 + inst.x * 0.7) * wing;
  lp.y += abs(lp.x) * flap;
  let s = sin(inst.w); let c = cos(inst.w);
  let x = lp.x * c - lp.z * s;
  let z = lp.x * s + lp.z * c;
  var w = vec3<f32>(inst.x + x, inst.y + lp.y, inst.z + z);
  var o: BirdV;
  o.world = w;
  o.nrm = vec3<f32>(0.0, 1.0, 0.0);
  o.col = mix(vec3<f32>(0.92, 0.93, 0.9), vec3<f32>(0.75, 0.78, 0.82), abs(wing));
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}
@fragment fn fsBird(in: BirdV) -> @location(0) vec4<f32> {
  return vec4<f32>(shade(in.world, in.nrm, in.col), 1.0);
}

fn steepQ(i: i32) -> f32 {
  let v = F.steep[i >> 2];
  let k = i & 3;
  if (k == 0) { return v.x; }
  if (k == 1) { return v.y; }
  if (k == 2) { return v.z; }
  return v.w;
}

fn waveGain(len: f32, dist: f32) -> f32 {
  let minLen = max(dist * 0.012, 2.5);
  return smoothstep(minLen * 0.45, minLen * 1.5, len);
}

fn seaFade(dist: f32) -> f32 {
  let reach = mix(5200.0, 1200.0, sat(F.camPos.y / 70.0));
  return smoothstep(reach, reach * 0.32, dist);
}

fn ggxSun(N: vec3<f32>, V: vec3<f32>, rough: f32, fres: f32) -> vec3<f32> {
  let a = max(rough, 0.004);
  let a2 = a * a;
  let H = normalize(V + F.sunDir);
  let ndh = max(dot(N, H), 0.0);
  let ndv = max(dot(N, V), 0.001);
  let ndl = max(dot(N, F.sunDir), 0.0);
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  let D = a2 / max(PI * d * d, 1e-6);
  let k = a2 * 0.5;
  let G = (ndv / (ndv * (1.0 - k) + k)) * (ndl / (ndl * (1.0 - k) + k));
  // The peak is narrow. Scale it so a whole crest cannot clip to white.
  return F.sunCol * (D * G * fres * ndl) / (4.0 * ndv) * 0.16;
}

fn capillary(xz: vec2<f32>, dist: f32) -> vec2<f32> {
  // Wind waves at several lengths. Each band drops out once it is smaller than a pixel.
  let pix = max(dist * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.012);
  let chop = mix(0.22, 1.0, sat(F.ctrl.x));
  let wind = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  var slope = vec2<f32>(0.0);
  let bands = array<vec3<f32>, 4>(
    vec3<f32>(3.1, 0.045, 0.85),
    vec3<f32>(1.15, 0.055, 1.15),
    vec3<f32>(0.42, 0.05, 1.55),
    vec3<f32>(0.16, 0.035, 2.1)
  );
  for (var b = 0; b < 4; b++) {
    let len = bands[b].x;
    let keep = smoothstep(pix * 1.4, pix * 3.6, len);
    if (keep <= 0.001) { continue; }
    for (var k = 0; k < 3; k++) {
      let ang = (f32(k) - 1.0) * 0.62 + f32(b) * 0.31;
      let ca = cos(ang);
      let sa = sin(ang);
      let dir = vec2<f32>(wind.x * ca - wind.y * sa, wind.x * sa + wind.y * ca);
      let kk = 6.2831853 / len;
      let ph = kk * dot(dir, xz) - sqrt(G * kk) * F.time * bands[b].z * max(F.ctrl.y, 0.0);
      let w = bands[b].y * keep * chop * select(0.4, 0.75, k < 2);
      slope += dir * cos(ph) * w;
    }
  }
  return slope;
}

struct Sea {
  disp: vec3<f32>,
  nrm: vec3<f32>,
  jac: f32,
  brk: f32,
}

fn seaAt(xz: vec2<f32>, scale: f32, depth: f32) -> Sea {
  var d = vec3<f32>(0.0);
  var n = vec3<f32>(0.0, 1.0, 0.0);
  var jxx = 0.0;
  var jzz = 0.0;
  var jxz = 0.0;
  var brk = 0.0;
  let D = max(depth, 0.25);
  let dist = length(F.camPos.xz - xz);
  let ampK = max(F.ctrl.x, 0.0);
  let spdK = F.ctrl.y;
  let frqK = max(F.ctrl.z, 0.2);
  let cs = cos(F.ctrl.w);
  let sn = sin(F.ctrl.w);
  let detailK = max(F.ripO.w, 0.0);
  let kP = 6.2831853 / F.waves[0].w * frqK;
  let wP = sqrt(G * kP);
  for (var i = 0; i < 8; i++) {
    if (f32(i) >= F.lit.z) { break; }
    let w = F.waves[i];
    let dir = vec2<f32>(w.x * cs - w.y * sn, w.x * sn + w.y * cs);
    let len = w.w / frqK;
    let k = 6.2831853 / len;
    let fade = waveGain(len, dist) * select(1.0, detailK, i >= 4);
    let feel = 1.0 - smoothstep(len * 0.08, len * 0.45, D);
    var As = w.z * ampK * scale * fade * (1.0 + feel * 0.85);
    let Q = min(steepQ(i) + feel * 0.45, 1.05);
    let steep = k * As * Q;
    if (steep > 0.72) { As *= 0.72 / steep; }
    let collapse = 1.0 - smoothstep(0.4, 2.4, D);
    As *= 1.0 - collapse * 0.38;
    var omega = sqrt(G * k) * spdK;
    if (i == 1) { omega = wP * (k / kP) * spdK; }
    let phase = k * dot(dir, xz) - omega * F.time;
    let s = sin(phase);
    let c = cos(phase);
    let wa = k * As;
    d.x += Q * As * dir.x * c;
    d.z += Q * As * dir.y * c;
    d.y += As * s;
    n.x -= dir.x * wa * c;
    n.z -= dir.y * wa * c;
    n.y -= Q * wa * s;
    // The crest leans down-wave as the bottom shoals, instead of just shrinking.
    if (i == 0 && collapse > 0.08) {
      let pitch = collapse * sat(s * 1.35 - 0.1) * fade;
      d.x += dir.x * As * pitch * 1.5;
      d.z += dir.y * As * pitch * 1.5;
      d.y -= As * pitch * 0.28;
      n.x -= dir.x * pitch * 1.6;
      n.z -= dir.y * pitch * 1.6;
      n.y -= pitch * 0.45;
      brk += collapse * sat(s * 1.5 - 0.25) * (0.45 + 0.55 * n2(xz * 0.07 + vec2<f32>(F.time * 0.05, 0.0)));
    }
    jxx += Q * dir.x * dir.x * wa * s;
    jzz += Q * dir.y * dir.y * wa * s;
    jxz += Q * dir.x * dir.y * wa * s;
  }
  let flatten = seaFade(dist);
  n.x *= flatten;
  n.z *= flatten;
  n.y = mix(1.0, n.y, flatten);
  var o: Sea;
  o.disp = d;
  o.nrm = normalize(n);
  o.jac = (1.0 - jxx) * (1.0 - jzz) - jxz * jxz;
  o.brk = sat(brk);
  return o;
}

fn farOcean(xz: vec2<f32>) -> vec3<f32> {
  // Past the mesh the bottom is deep, so this pass does not read the heightfield.
  let S = seaAt(xz, 1.0, 30.0);
  let world = vec3<f32>(xz.x, 0.0, xz.y);
  let distS = length(world - F.camPos);
  let cap = capillary(xz, distS);
  let N = normalize(S.nrm + vec3<f32>(cap.x, 0.0, cap.y));
  let V = normalize(F.camPos - world);
  let ndv = max(dot(N, V), 0.02);
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  var reflCol = skyColor(reflect(-V, N));
  let Rd = reflect(-V, N);
  if (Rd.y < 0.02) {
    reflCol = mix(F.deepC.rgb, reflCol, sat(Rd.y * 12.0 + 0.15));
  }
  let rough = clamp(0.01 + sat(F.mat.x) * 0.06, 0.008, 0.07);
  let crest = smoothstep(0.5, 0.18, S.jac);
  let grain = n2(xz * 0.11 + vec2<f32>(F.time * 0.04, 0.0));
  let foam = sat(crest - 0.55) * smoothstep(0.42, 0.78, grain) * seaFade(distS) * max(F.mood.w, 0.0);
  var base = F.deepC.rgb;
  base = mix(base, vec3<f32>(0.86, 0.88, 0.86), foam * 0.45);
  var col = mix(base, reflCol, fres * (1.0 - foam * 0.5));
  col += ggxSun(N, V, rough, fres) * (1.0 - foam);
  let dens = mix(0.0016, 0.00022, sat(F.camPos.y / 160.0));
  return mix(F.horiz, col, sat(exp(-distS * dens)));
}

@fragment fn fsSky(in: SkyV) -> @location(0) vec4<f32> {
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  // Any ray that meets the sea plane is open ocean, so the water does not end at the mesh.
  if (rd.y < -0.0003 && F.camPos.y > 0.2 && F.under < 0.5) {
    let t = -F.camPos.y / rd.y;
    if (t > 1.0 && t < 250000.0) {
      let xz = F.camPos.xz + rd.xz * t;
      // The mesh covers the near water. This fills anything it does not, including the horizon.
      return vec4<f32>(farOcean(xz), 1.0);
    }
  }
  return vec4<f32>(skyColor(rd), 1.0);
}

struct WaterV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) xz0: vec2<f32>,
}
fn ripAt(xz: vec2<f32>) -> vec3<f32> {
  let dom = max(F.ripO.z, 1.0);
  let uv = (xz - F.ripO.xy) / dom;
  let fade = smoothstep(0.0, 0.07, uv.x) * smoothstep(1.0, 0.93, uv.x)
           * smoothstep(0.0, 0.07, uv.y) * smoothstep(1.0, 0.93, uv.y);
  if (fade <= 0.0) { return vec3<f32>(0.0); }
  let p = clamp(vec2<i32>(uv * 255.0), vec2<i32>(0), vec2<i32>(254));
  let h = textureLoad(ripTex, p, 0).r;
  let hx = textureLoad(ripTex, p + vec2<i32>(1, 0), 0).r;
  let hz = textureLoad(ripTex, p + vec2<i32>(0, 1), 0).r;
  let e = dom / 255.0;
  let k = F.shalC.w * fade;
  return vec3<f32>(h * k, (h - hx) / e * k * 0.85, (h - hz) / e * k * 0.85);
}
fn warp(t: f32) -> f32 {
  // Dense under the camera. The outer ring is allowed to be coarse because those
  // triangles are not asked to hold a wave.
  let x = t * 2.0 - 1.0;
  let k = 4.2;
  let u = (exp(k * abs(x)) - 1.0) / (exp(k) - 1.0);
  return sign(x) * u * 0.5 + 0.5;
}
@vertex fn vsWater(@location(0) uv: vec2<f32>) -> WaterV {
  let xz = F.gridO + vec2<f32>(warp(uv.x), warp(uv.y)) * F.cover;
  let field = sampleField(xz);
  let s = seaAt(xz, field.y, max(-field.x, 0.2));
  let dist = length(xz - F.camPos.xz);
  // Height fades with distance, not along a grid row, so the swell does not end in a straight ridge.
  let geom = smoothstep(1100.0, 140.0, dist);
  var w = vec3<f32>(xz.x + s.disp.x * geom, s.disp.y * mix(0.05, 1.0, geom), xz.y + s.disp.z * geom);
  w.y += ripAt(xz).x * geom;
  var o: WaterV;
  o.world = w;
  o.xz0 = xz;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}

fn worldAt(frag: vec2<f32>, depth: f32) -> vec3<f32> {
  let uv = frag / F.res;
  let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let w = F.invViewProj * ndc;
  return w.xyz / max(w.w, 1e-4);
}

@fragment fn fsWater(in: WaterV) -> @location(0) vec4<f32> {
  let field = sampleField(in.xz0);
  let scale = field.y;
  let bed = field.x;
  let S = seaAt(in.xz0, scale, max(-bed, 0.2));
  let distS = length(in.world - F.camPos);
  let rip = ripAt(in.xz0);
  let cap = capillary(in.xz0, distS);
  let N = normalize(S.nrm + vec3<f32>(rip.y + cap.x, 0.0, rip.z + cap.y));
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.02);
  // Schlick, F0 for water against air (IOR 1.333).
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let reflK = sat(F.mat.y);
  let rough = clamp(0.008 + sat(F.mat.x) * 0.055, 0.006, 0.065);
  let Wsh = washAt(in.xz0);
  let dir0 = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  let alongW = dot(in.xz0, dir0);
  let acrossW = dot(in.xz0, vec2<f32>(-dir0.y, dir0.x));
  let lace = n2(vec2<f32>(alongW * 0.42 - F.time * 0.55, acrossW * 0.16));
  let lace2 = n2(vec2<f32>(acrossW * 0.85 + 4.0, alongW * 0.2 + F.time * 0.12));
  let crest = smoothstep(0.58, 0.2, S.jac) * smoothstep(0.2, 0.65, scale);
  let crestFoam = sat(max(crest, S.brk * 0.65) - 0.5) * smoothstep(0.3, 0.72, lace * 0.62 + lace2 * 0.38);
  let breaker = S.brk * smoothstep(2.6, 0.3, max(-bed, 0.0)) * smoothstep(0.34, 0.72, lace);
  let foam = sat(max(crestFoam * 0.45, max(breaker * (0.55 + 0.45 * lace2), Wsh.foam))) * max(F.mood.w, 0.0);
  let onSheet = smoothstep(-0.04, 0.05, bed) * Wsh.beach;

  if (F.under > 0.5) {
    let I = normalize(in.world - F.camPos);
    let R = refract(I, -N, 1.333);
    var col: vec3<f32>;
    if (dot(R, R) < 1e-4) {
      col = vec3<f32>(0.01, 0.04, 0.055);
      col += vec3<f32>(0.04, 0.07, 0.08) * pow(1.0 - max(dot(-I, N), 0.0), 3.0);
    } else {
      col = skyColor(normalize(R));
    }
    col = mix(vec3<f32>(0.02, 0.09, 0.1), col, exp(-distS * 0.06));
    col = mix(col, vec3<f32>(0.75, 0.78, 0.76), foam * 0.35);
    return vec4<f32>(tonemap(col), 1.0);
  }

  let frag = in.clip;
  let px = vec2<i32>(frag.xy);
  let dep = textureLoad(sceneDepth, px, 0);
  // Land, trees and boats in front of this fragment stay as the blit left them.
  if (dep < 0.999 && dep < frag.z - 0.00015) { discard; }

  // The reflection image is the mirrored camera. On flat water it lines up with this pixel.
  // The normal slides that sample, which is what makes the shore move with the surface.
  var reflCol = skyColor(reflect(-V, N));
  let Rd = reflect(-V, N);
  if (Rd.y < 0.02) {
    reflCol = mix(F.deepC.rgb, reflCol, sat(Rd.y * 14.0 + 0.2));
  }
  if (F.reflOn > 0.5) {
    var uv = frag.xy / F.res;
    uv += N.xz * vec2<f32>(0.055, -0.055) * reflK;
    let edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x)
             * smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.96, uv.y);
    if (edge > 0.001) {
      let blur = rough * 0.012;
      let c0 = textureSampleLevel(reflTex, reflSamp, uv, 0.0).rgb;
      let c1 = textureSampleLevel(reflTex, reflSamp, uv + vec2<f32>(blur, blur * 0.4), 0.0).rgb;
      let c2 = textureSampleLevel(reflTex, reflSamp, uv - vec2<f32>(blur * 0.5, blur), 0.0).rgb;
      let rs = (c0 + c1 + c2) * 0.333;
      reflCol = mix(reflCol, rs, edge * (1.0 - foam * 0.65) * reflK);
    }
  }

  var base = F.deepC.rgb;
  if (dep < 0.9995) {
    var look = in.clip.xy;
    var sp = worldAt(look, dep);
    var d = in.world.y - sp.y;
    if (d > -0.05) {
      let bend = N.xz * clamp(d, 0.0, 3.0) * 7.0 * F.mat.z;
      let shifted = clamp(look + bend, vec2<f32>(1.0), F.res - vec2<f32>(1.0));
      let rd = textureLoad(sceneDepth, vec2<i32>(shifted), 0);
      if (rd < 0.999) {
        let rw = worldAt(shifted, rd);
        if (rw.y < in.world.y - 0.03) { look = shifted; sp = rw; d = in.world.y - rw.y; }
      }
      let depth = max(d, 0.02);
      let sigma = vec3<f32>(0.48, 0.075, 0.04) * max(F.deepC.w, 0.08);
      let trans = exp(-depth * sigma);
      let sceneCol = textureLoad(sceneTex, vec2<i32>(look), 0).rgb;
      let scatter = mix(F.shalC.rgb, F.deepC.rgb, sat(depth / 7.0));
      base = sceneCol * trans + scatter * (1.0 - trans);
    }
  }
  base = mix(F.deepC.rgb, base, sat(F.mat.w));
  let foamCol = mix(vec3<f32>(0.58, 0.66, 0.64), vec3<f32>(0.84, 0.87, 0.85), sat(foam));
  base = mix(base, foamCol, foam * mix(0.5, 0.72, onSheet));

  // Fresnel is the only thing that chooses reflection versus the water beneath it.
  var col = mix(base, reflCol, fres * reflK * (1.0 - foam * 0.55));
  col += ggxSun(N, V, rough, fres * reflK) * (1.0 - foam * 0.8);
  let crestLight = pow(sat(1.0 - N.y), 1.6) * sat(S.disp.y * 0.8) * max(dot(F.sunDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0);
  col += F.sunCol * vec3<f32>(0.45, 0.62, 0.55) * crestLight * 0.12;

  let dens = mix(0.0016, 0.00022, sat(F.camPos.y / 160.0));
  col = mix(F.horiz, col, sat(exp(-distS * dens)));
  return vec4<f32>(tonemap(col), 1.0);
}

`;
}

function blitShaderCode() {
  // Separate module so its bindings don't have to match the water pass.
  // The Frame prefix is identical, so the same uniform buffer can be bound.
  return `struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  reflVP: mat4x4<f32>,
  camPos: vec3<f32>,
  time: f32,
  sunDir: vec3<f32>,
  under: f32,
  sunCol: vec3<f32>,
  exposure: f32,
  horiz: vec3<f32>,
  tanHalf: f32,
  right: vec3<f32>,
  aspect: f32,
  upv: vec3<f32>,
  clipBelow: f32,
  fwd: vec3<f32>,
  steps: f32,
  reflPos: vec3<f32>,
  cloudOct: f32,
  gridO: vec2<f32>,
  cover: f32,
  camDamp: f32,
  res: vec2<f32>,
  reflOn: f32,
  pad0: f32,
  waves: array<vec4<f32>, 8>,
  steep: array<vec4<f32>, 2>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var sceneDepth: texture_depth_2d;

fn tonemap(c: vec3<f32>) -> vec3<f32> {
  let x = max(c, vec3<f32>(0.0)) * F.exposure;
  let y = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  return pow(y, vec3<f32>(0.4545));
}
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

struct SkyV {
  @builtin(position) clip: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}
@vertex fn vsBlit(@builtin(vertex_index) id: u32) -> SkyV {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: SkyV;
  o.ndc = p[id];
  o.clip = vec4<f32>(p[id], 0.0, 1.0);
  return o;
}
struct BlitOut {
  @builtin(frag_depth) d: f32,
  @location(0) c: vec4<f32>,
}
@fragment fn fsBlit(in: SkyV) -> BlitOut {
  let px = vec2<i32>(in.clip.xy);
  var col = tonemap(textureLoad(sceneTex, px, 0).rgb);
  if (F.under > 0.5) {
    let uv = in.clip.xy / max(F.res, vec2<f32>(1.0));
    col *= mix(1.0, 0.5, sat(length(uv - 0.5) * 1.35));
  }
  var o: BlitOut;
  o.d = textureLoad(sceneDepth, px, 0);
  o.c = vec4<f32>(col, 1.0);
  return o;
}
`;
}
