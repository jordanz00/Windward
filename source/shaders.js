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
    let wa = k * net[e].w * 0.9;
    jxx += dir.x * dir.x * wa * s;
    jzz += dir.y * dir.y * wa * s;
    jxz += dir.x * dir.y * wa * s;
  }
  let jac = (1.0 - jxx) * (1.0 - jzz) - jxz * jxz;
  // The swell is long, so its area change is small. Scale it until the bright lines read on the sand.
  let pinch = sat((1.0 - jac) * 6.5);
  return pow(pinch, 3.0) * exp(-depth * 0.45);
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
    if (world.y < -0.04) { light += F.sunCol * caustic(world.xz) * absorb * 1.15; }
  }
  if (F.under > 0.5) { light *= vec3<f32>(0.55, 0.82, 0.86); }
  var col = albedo * light;
  let back = sat(dot(-n, F.sunDir));
  col += albedo * vec3<f32>(0.9, 1.2, 0.28) * back * sh * leaf * 0.8;
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
  var sandC = mix(vec3<f32>(0.66, 0.58, 0.42), vec3<f32>(0.52, 0.45, 0.32), fine);
  sandC *= 0.9 + 0.16 * grain;
  let wet = smoothstep(1.1, 0.02, y);
  sandC = mix(sandC, sandC * vec3<f32>(0.58, 0.60, 0.56), wet * 0.5);
  if (y < 0.05) { sandC = mix(vec3<f32>(0.72, 0.64, 0.46), sandC, sat(-y * 0.35 + 0.25)); }
  var grassC = mix(vec3<f32>(0.13, 0.24, 0.06), vec3<f32>(0.30, 0.38, 0.10), m);
  grassC *= 0.78 + 0.36 * n2(xz * 0.22);
  grassC = mix(grassC, vec3<f32>(0.38, 0.36, 0.15), smoothstep(3.5, 0.9, y) * 0.32);
  grassC = mix(grassC, grassC * 0.72, smoothstep(0.55, 0.85, n2(xz * 1.4)) * 0.45);
  var rockC = mix(vec3<f32>(0.40, 0.38, 0.34), vec3<f32>(0.22, 0.21, 0.19), m);
  rockC *= 0.86 + 0.18 * sin(y * 1.4 + m * 5.0);
  rockC = mix(rockC, vec3<f32>(0.34, 0.36, 0.22), smoothstep(0.62, 0.86, n2(xz * 0.35)) * (1.0 - slope));
  return sandC * sandW + grassC * grassW + rockC * rock;
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
  let alb = terrainAlbedo(in.world.xz, in.world.y, n);
  return vec4<f32>(shade(in.world, n, alb), 1.0);
}

struct MeshV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
}
@vertex fn vsMesh(@location(0) p: vec3<f32>, @location(1) n: vec3<f32>, @location(2) c: vec3<f32>, @location(3) sway: f32) -> MeshV {
  var w = p;
  let bend = sin(F.time * 1.25 + p.x * 0.15 + p.z * 0.11) * sway;
  w.x += bend * 0.32;
  w.z += bend * 0.1;
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
  return vec4<f32>(shade(in.world, n, in.col), 1.0);
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
  let halfW = mix(0.5, 0.04, in.uv.y);
  if (abs(in.uv.x - 0.5) > halfW) { discard; }
  var col = mix(vec3<f32>(0.12, 0.24, 0.06), vec3<f32>(0.42, 0.48, 0.14), in.uv.y);
  if (in.kind > 0.5) { col = mix(vec3<f32>(0.05, 0.16, 0.10), vec3<f32>(0.20, 0.32, 0.14), in.uv.y); }
  col *= 0.85 + 0.3 * n2(in.world.xz * 2.0);
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
  let reach = mix(2200.0, 380.0, sat(F.camPos.y / 32.0));
  return smoothstep(reach, reach * 0.28, dist);
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
    let collapse = 1.0 - smoothstep(0.35, 1.6, D);
    As *= 1.0 - collapse * 0.65;
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
    jxx += Q * dir.x * dir.x * wa * s;
    jzz += Q * dir.y * dir.y * wa * s;
    jxz += Q * dir.x * dir.y * wa * s;
    if (i == 0) { brk += collapse * sat(s * 1.6 - 0.35); }
  }
  let flatten = seaFade(dist);
  n.x *= flatten;
  n.z *= flatten;
  n.y = mix(1.0, n.y, flatten);
  let detail = sat(1.0 - dist / 80.0) * scale;
  let fine = sat(1.0 - dist / 22.0) * scale;
  let wind = vec2<f32>(0.998, 0.05);
  let cross = vec2<f32>(-wind.y, wind.x);
  let along = dot(xz, wind);
  let rip = cos(along * 2.3 + F.time * 2.5) * 0.5
          + cos(along * 6.2 - F.time * 4.0) * 0.3
          + cos(along * 15.0 + F.time * 6.4) * 0.16 * fine
          + cos(dot(xz, cross) * 9.0 + F.time * 4.6) * 0.1 * fine;
  let amp = 0.06 * detail * F.shalC.w * max(F.ripO.w, 0.0);
  n.x += (wind.x * rip + cross.x * rip * 0.25) * amp;
  n.z += (wind.y * rip + cross.y * rip * 0.25) * amp;
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
  let N = S.nrm;
  let world = vec3<f32>(xz.x, 0.0, xz.y);
  let V = normalize(F.camPos - world);
  let ndv = max(dot(N, V), 0.02);
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  var reflCol = skyColor(reflect(-V, N));
  let Rd = reflect(-V, N);
  if (Rd.y < 0.04) {
    reflCol = mix(vec3<f32>(0.015, 0.06, 0.09), reflCol, sat(Rd.y * 10.0 + 0.25));
  }
  let ndl = max(dot(N, F.sunDir), 0.0);
  let distS = length(world - F.camPos);
  let nearW = seaFade(distS);
  let crest = smoothstep(0.78, 0.42, S.jac);
  let foam = sat(max(crest, S.brk * 0.85)) * nearW;
  var base = vec3<f32>(0.012, 0.055, 0.12) * (0.86 + 0.2 * ndl * nearW);
  base = mix(base, vec3<f32>(0.92, 0.94, 0.92), foam * 0.8);
  var col = mix(base, reflCol, fres * (1.0 - foam * 0.65));
  let H = normalize(V + F.sunDir);
  let power = mix(360.0, 80.0, sat(distS / 200.0));
  col += F.sunCol * pow(max(dot(N, H), 0.0), power) * fres * 8.0 * nearW;
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
      let inside = xz.x > F.gridO.x && xz.y > F.gridO.y && xz.x < F.gridO.x + F.cover && xz.y < F.gridO.y + F.cover;
      if (!inside) { return vec4<f32>(farOcean(xz), 1.0); }
    }
  }
  return vec4<f32>(skyColor(rd), 1.0);
}

struct WaterV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) xz0: vec2<f32>,
}
fn warp(t: f32) -> f32 {
  // Exponential pack: a few meters between vertices at the camera, the outer ring at the horizon.
  let x = t * 2.0 - 1.0;
  let k = 5.5;
  let u = (exp(k * abs(x)) - 1.0) / (exp(k) - 1.0);
  return sign(x) * u * 0.5 + 0.5;
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
@vertex fn vsWater(@location(0) uv: vec2<f32>) -> WaterV {
  let xz = F.gridO + vec2<f32>(warp(uv.x), warp(uv.y)) * F.cover;
  let field = sampleField(xz);
  let s = seaAt(xz, field.y, max(-field.x, 0.2));
  // Distant swell is smaller than a pixel, so the horizon stays a line. The normals still carry it.
  let dist = length(xz - F.camPos.xz);
  let reach = mix(900.0, 260.0, sat(F.camPos.y / 32.0));
  let geom = smoothstep(reach, reach * 0.2, dist);
  var w = vec3<f32>(xz.x + s.disp.x * geom, s.disp.y * mix(0.04, 1.0, geom), xz.y + s.disp.z * geom);
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
  let rip = ripAt(in.xz0);
  let N = normalize(S.nrm + vec3<f32>(rip.y, 0.0, rip.z));
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.02);
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let reflK = sat(F.mat.y);
  let distS = length(in.world - F.camPos);
  let crest = smoothstep(0.78, 0.42, S.jac) * smoothstep(0.25, 0.7, scale);
  let foam = sat(max(crest, S.brk * 0.85));

  if (F.under > 0.5) {
    let I = normalize(in.world - F.camPos);
    let R = refract(I, -N, 1.333);
    var col: vec3<f32>;
    if (dot(R, R) < 1e-4) {
      col = vec3<f32>(0.012, 0.055, 0.075);
      col += vec3<f32>(0.03, 0.08, 0.09) * pow(1.0 - max(dot(-I, N), 0.0), 3.0);
    } else {
      col = skyColor(normalize(R));
    }
    col = mix(col, vec3<f32>(0.75, 0.78, 0.76), foam * 0.45);
    return vec4<f32>(tonemap(col), 1.0);
  }

  let frag = in.clip;
  let px = vec2<i32>(frag.xy);
  let dep = textureLoad(sceneDepth, px, 0);
  // Land, trees and boats in front of this fragment stay as the blit left them.
  if (dep < 0.999 && dep < frag.z - 0.00015) { discard; }

  var reflCol = skyColor(reflect(-V, N));
  if (reflect(-V, N).y < 0.04) {
    reflCol = mix(vec3<f32>(0.015, 0.06, 0.09), reflCol, sat(reflect(-V, N).y * 10.0 + 0.25));
  }
  if (F.reflOn > 0.5) {
    let q = vec3<f32>(in.world.x + N.x * 1.6, in.world.y, in.world.z + N.z * 1.6);
    let c = F.reflVP * vec4<f32>(q, 1.0);
    if (c.w > 0.05) {
      let ndc = c.xy / c.w;
      let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        let edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x)
                 * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
        let rs = textureSampleLevel(reflTex, reflSamp, uv, 0.0);
        reflCol = mix(reflCol, rs.rgb, rs.a * edge * (1.0 - foam) * reflK);
      }
    }
  }

  let ndl = max(dot(N, F.sunDir), 0.0);
  var base = F.deepC.rgb;
  var seeBottom = 0.0;
  if (dep < 0.9995) {
    var look = in.clip.xy;
    var sp = worldAt(look, dep);
    var d = in.world.y - sp.y;
    if (d > -0.05) {
      // The surface bends the view of the bottom. Reject a sample that lands on something above the water.
      let bend = N.xz * clamp(d, 0.0, 2.4) * 16.0 * F.mat.z;
      let shifted = clamp(look + bend, vec2<f32>(1.0), F.res - vec2<f32>(1.0));
      let rd = textureLoad(sceneDepth, vec2<i32>(shifted), 0);
      if (rd < 0.999) {
        let rw = worldAt(shifted, rd);
        if (rw.y < in.world.y - 0.03) { look = shifted; sp = rw; d = in.world.y - rw.y; }
      }
      let trans = exp(-max(d, 0.04) * vec3<f32>(0.45, 0.13, 0.08) * max(F.deepC.w, 0.05));
      let sceneCol = textureLoad(sceneTex, vec2<i32>(look), 0).rgb;
      base = sceneCol * trans + F.shalC.rgb * (1.0 - trans);
      seeBottom = exp(-max(d, 0.0) * 0.85);
    }
  }
  let nearW = seaFade(distS);
  base *= 0.9 + 0.16 * ndl * nearW;
  base = mix(base, vec3<f32>(0.93, 0.95, 0.93), foam * nearW * 0.75 * max(F.mood.w, 0.0));
  base = mix(F.deepC.rgb, base, sat(F.mat.w));

  let fresB = fres * reflK * (1.0 - seeBottom * 0.72);
  var col = mix(base, reflCol, fresB * (1.0 - foam * nearW * 0.65));
  let H = normalize(V + F.sunDir);
  let ndh = max(dot(N, H), 0.0);
  let power = mix(360.0, 72.0, sat(distS / 200.0)) * mix(1.0, 0.22, sat(F.mat.x));
  col += F.sunCol * pow(ndh, power) * fres * reflK * 8.0 * nearW;
  let sss = pow(sat(dot(-V, F.sunDir)), 4.0) * sat(S.disp.y) * sat(1.0 - N.y);
  col += vec3<f32>(0.2, 0.55, 0.38) * sss * 0.7;

  let dist = length(in.world - F.camPos);
  let dens = mix(0.0016, 0.00022, sat(F.camPos.y / 160.0));
  col = mix(F.horiz, col, sat(exp(-dist * dens)));
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
