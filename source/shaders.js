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
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var htex: texture_2d<f32>;

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
  var col = mix(vec3<f32>(0.70, 0.78, 0.84), vec3<f32>(0.16, 0.40, 0.78), pow(up, 0.32));
  col = mix(col, vec3<f32>(0.05, 0.18, 0.48), pow(up, 1.5) * 0.65);
  let mu = dot(rd, F.sunDir);
  // Warmth stays next to the sun. The rest of the sky stays blue.
  col = mix(col, vec3<f32>(0.96, 0.72, 0.48), pow(sat(mu), 14.0) * sat(1.05 - up * 1.2) * 0.55);
  col += vec3<f32>(1.0, 0.97, 0.9) * pow(sat(mu), 900.0) * 5.0;
  col += vec3<f32>(1.0, 0.86, 0.62) * pow(sat(mu), 48.0) * 0.28;
  if (rd.y > 0.012) {
    let t = (480.0 - F.camPos.y) / rd.y;
    if (t > 0.0 && t < 12000.0) {
      let hit = F.camPos.xz + rd.xz * t;
      let uv = hit * 0.00022 + vec2<f32>(F.time * 0.0022, F.time * 0.0009);
      let d = cloudDens(uv);
      let dens = smoothstep(0.42, 0.68, d);
      let dl = cloudDens(uv + F.sunDir.xz * 0.01);
      let lit = sat(0.32 + (dl - d) * 3.2);
      var cc = mix(vec3<f32>(0.40, 0.44, 0.50), vec3<f32>(0.98, 0.97, 0.95), lit);
      cc += vec3<f32>(1.0, 0.82, 0.55) * pow(sat(mu), 2.0) * dens * 0.18;
      let fade = smoothstep(0.012, 0.14, rd.y) * sat(1.0 - t / 11000.0);
      col = mix(col, cc, dens * fade * 0.94);
    }
  }
  return col;
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
  let p = xz * 0.42 + vec2<f32>(F.time * 0.16, F.time * 0.05);
  let q = xz * 0.55 + vec2<f32>(-F.time * 0.07, F.time * 0.12);
  let a = n2(p) + n2(p * 2.1) * 0.5;
  let b = n2(q) + n2(q * 2.1) * 0.5;
  return pow(1.0 - min(abs(a - b) * 4.5, 1.0), 2.2);
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
  let ndl = max(dot(n, F.sunDir), 0.0);
  let sh = shadowAt(world) * cloudShade(world.xz, world.y);
  let amb = mix(vec3<f32>(0.20, 0.19, 0.16), vec3<f32>(0.48, 0.56, 0.68), n.y * 0.5 + 0.5);
  var light = F.sunCol * ndl * sh + amb * 0.62;
  if (world.y < 0.2) {
    let depth = max(-world.y, 0.0);
    light *= exp(-depth * vec3<f32>(0.40, 0.09, 0.06));
    light *= 0.5 + caustic(world.xz) * 1.35;
  }
  if (F.under > 0.5) { light *= vec3<f32>(0.55, 0.82, 0.86); }
  var col = albedo * light;
  if (world.y > -0.05 && world.y < 0.85) {
    let V = normalize(F.camPos - world);
    let H = normalize(V + F.sunDir);
    let wet = 1.0 - sat(world.y / 0.85);
    col += F.sunCol * pow(max(dot(n, H), 0.0), 48.0) * sh * wet * 0.1;
  }
  // crevice darkening
  col *= mix(0.72, 1.0, sat(n.y * 0.65 + 0.35));
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
  var sandC = mix(vec3<f32>(0.48, 0.40, 0.27), vec3<f32>(0.34, 0.29, 0.19), fine);
  sandC *= 0.78 + 0.32 * n2(xz * 2.2);
  let wet = smoothstep(1.3, 0.05, y);
  sandC = mix(sandC, sandC * vec3<f32>(0.55, 0.58, 0.52), wet * 0.65);
  if (y < 0.15) { sandC = mix(vec3<f32>(0.62, 0.55, 0.38), sandC, sat(-y * 0.4)); }
  sandC *= 0.9 + 0.18 * smoothstep(0.78, 0.95, n2(xz * 4.0));
  var grassC = mix(vec3<f32>(0.12, 0.26, 0.09), vec3<f32>(0.28, 0.36, 0.12), m);
  grassC *= 0.68 + 0.5 * n2(xz * 0.16);
  grassC = mix(grassC, vec3<f32>(0.40, 0.38, 0.18), smoothstep(4.0, 1.3, y) * 0.4);
  var rockC = mix(vec3<f32>(0.42, 0.39, 0.35), vec3<f32>(0.24, 0.23, 0.21), m);
  rockC *= 0.84 + 0.2 * sin(y * 1.15 + m * 5.0);
  rockC = mix(rockC, vec3<f32>(0.36, 0.39, 0.24), smoothstep(0.62, 0.86, n2(xz * 0.35)) * (1.0 - slope));
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
@fragment fn fsSky(in: SkyV) -> @location(0) vec4<f32> {
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  return vec4<f32>(skyColor(rd), 1.0);
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
  return vec4<f32>(shade(in.world, in.nrm, in.col), 1.0);
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
  var col = mix(vec3<f32>(0.16, 0.28, 0.10), vec3<f32>(0.42, 0.46, 0.18), in.uv.y);
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
  // Drop wavelengths the pixel can no longer show, so glitter doesn't turn into a grid.
  let minLen = dist * 0.032;
  return smoothstep(minLen * 0.4, minLen * 1.7, len);
}

fn gerstner(xz: vec2<f32>, scale: f32) -> vec4<f32> {
  // xyz displacement, w = a rough jacobian accumulator
  var d = vec3<f32>(0.0);
  var jxx = 0.0; var jzz = 0.0; var jxz = 0.0;
  let dist = length(F.camPos.xz - xz);
  for (var i = 0; i < 8; i++) {
    let w = F.waves[i];
    let len = max(length(w.xy), 0.001);
    let dir = w.xy / len;
    let A = w.z * scale * waveGain(w.w, dist);
    let k = 6.2831853 / w.w;
    let omega = sqrt(G * k);
    let phase = k * dot(dir, xz) - omega * F.time;
    let s = sin(phase);
    let c = cos(phase);
    let Q = steepQ(i);
    d.x += Q * A * dir.x * c;
    d.z += Q * A * dir.y * c;
    d.y += A * s;
    let wa = k * A;
    jxx += Q * dir.x * dir.x * wa * s;
    jzz += Q * dir.y * dir.y * wa * s;
    jxz += Q * dir.x * dir.y * wa * s;
  }
  let J = (1.0 - jxx) * (1.0 - jzz) - jxz * jxz;
  return vec4<f32>(d, J);
}

fn gerstnerN(xz: vec2<f32>, scale: f32) -> vec3<f32> {
  var n = vec3<f32>(0.0, 1.0, 0.0);
  let dist = length(F.camPos.xz - xz);
  for (var i = 0; i < 8; i++) {
    let w = F.waves[i];
    let len = max(length(w.xy), 0.001);
    let dir = w.xy / len;
    let A = w.z * scale * waveGain(w.w, dist);
    let k = 6.2831853 / w.w;
    let omega = sqrt(G * k);
    let phase = k * dot(dir, xz) - omega * F.time;
    let c = cos(phase);
    let wa = k * A;
    n.x -= dir.x * wa * c;
    n.z -= dir.y * wa * c;
    n.y -= steepQ(i) * wa * sin(phase);
  }
  // A little shimmer up close. It fades before it can alias into a checkerboard.
  let detail = sat(1.0 - dist / 40.0) * 0.35;
  let rip = xz * 1.4 + vec2<f32>(F.time * 0.6, -F.time * 0.25);
  let e = 0.28;
  let h0 = n2(rip);
  let hx = n2(rip + vec2<f32>(e, 0.0));
  let hz = n2(rip + vec2<f32>(0.0, e));
  n.x += (h0 - hx) * 0.18 * scale * detail;
  n.z += (h0 - hz) * 0.18 * scale * detail;
  return normalize(n);
}

struct WaterV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) xz0: vec2<f32>,
}
@vertex fn vsWater(@location(0) uv: vec2<f32>) -> WaterV {
  let xz = F.gridO + uv * F.cover;
  let field = sampleField(xz);
  let disp = gerstner(xz, field.y);
  var w = vec3<f32>(xz.x + disp.x, disp.y, xz.y + disp.z);
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
  let N = gerstnerN(in.xz0, max(scale, 0.15));
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.0);
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let distS = length(in.world - F.camPos);
  // Nearby water keeps its color. The horizon is what mirrors the sky.
  let fresUse = fres * mix(0.38, 0.88, sat(distS / 48.0));
  let g = gerstner(in.xz0, scale);
  let crest = smoothstep(0.9, 0.7, g.w) * smoothstep(0.4, 0.75, scale);
  let depthB = max(-bed, 0.0);
  let band = smoothstep(0.65, 0.18, depthB) * smoothstep(0.03, 0.14, depthB);
  let lace = n2(in.xz0 * 0.18 + vec2<f32>(0.0, -F.time * 0.35));
  let lace2 = n2(in.xz0 * 0.07 + vec2<f32>(F.time * 0.05, 0.2));
  let shore = band * smoothstep(0.64, 0.9, lace * 0.55 + lace2 * 0.45);
  let foam = sat(max(crest, shore));

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
        reflCol = mix(reflCol, rs.rgb, rs.a * edge * (1.0 - foam));
      }
    }
  }

  let inscatter = vec3<f32>(0.012, 0.09, 0.16);
  var base = inscatter;
  if (dep < 0.9995) {
    let sp = worldAt(in.clip.xy, dep);
    let d = in.world.y - sp.y;
    if (d > -0.08) {
      let trans = exp(-max(d, 0.0) * vec3<f32>(0.25, 0.055, 0.035));
      let sceneCol = textureLoad(sceneTex, px, 0).rgb;
      base = sceneCol * trans + vec3<f32>(0.03, 0.18, 0.22) * (1.0 - trans);
    }
  } else {
    // No seabed in the depth buffer: deep water, red dies first.
    let deep = exp(-vec3<f32>(9.0, 1.7, 0.55));
    base = vec3<f32>(0.004, 0.025, 0.06) + inscatter * (1.0 - deep);
  }
  base *= 0.78 + 0.32 * sat(g.y * 0.7 + 0.4);
  base = mix(base, vec3<f32>(0.75, 0.80, 0.78), foam * 0.5);

  var col = mix(base, reflCol, fresUse * (1.0 - foam * 0.75));
  // Sun path. Tight up close, and gone before it can alias.
  let H = normalize(V + F.sunDir);
  let ndh = max(dot(N, H), 0.0);
  let power = mix(140.0, 6.0, sat(distS / 60.0));
  let ndl = max(dot(N, F.sunDir), 0.0);
  let glint = min(pow(ndh, power) * ndl * fres, 0.7);
  col += F.sunCol * glint * mix(0.55, 0.12, sat(distS / 90.0));
  // A little light through the crest, the way a real wave lip goes green.
  let sss = pow(sat(dot(V, -F.sunDir)), 4.0) * sat(g.y) * scale;
  col += vec3<f32>(0.04, 0.12, 0.11) * sss * 0.25;

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
