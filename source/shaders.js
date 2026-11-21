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
  shadowVP: mat4x4<f32>,
  nearVP: mat4x4<f32>,
  // The air. amb: light from the sky, w scales what the ground bounces back. sunTrue: where
  // the sun is even when it is down, w is night. moon: w is how much of it shows.
  // wind: direction, m/s, gustiness. windOff: how far it has carried the clouds (km) and
  // the gusts (m). wx: rain, wetness, mist, humidity. disc: the sun's own colour.
  // day: all the light now falling on open ground, as a share of the framed afternoon's.
  amb: vec4<f32>,
  sunTrue: vec4<f32>,
  moon: vec4<f32>,
  wind: vec4<f32>,
  windOff: vec4<f32>,
  wx: vec4<f32>,
  disc: vec4<f32>,
  day: vec4<f32>,
}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var htex: texture_2d<f32>;
@group(0) @binding(2) var ripTex: texture_2d<f32>;
@group(0) @binding(3) var shadowMap: texture_depth_2d;
@group(0) @binding(4) var shadowSamp: sampler_comparison;
struct ShoreU {
  origin: vec2<f32>,
  dx: f32,
  nx: f32,
  along: vec2<f32>,
  sea: vec2<f32>,
  time: f32,
  dt: f32,
  amp: f32,
  spd: f32,
  dir: f32,
  nz: f32,
  frq: f32,
  pad: f32,
  waves: array<vec4<f32>, 4>,
  steep: vec4<f32>,
}
@group(0) @binding(5) var<uniform> SH: ShoreU;
@group(0) @binding(6) var shoreTex: texture_2d<f32>;
@group(0) @binding(7) var shoreWet: texture_2d<f32>;
@group(0) @binding(8) var skyMap: texture_2d<f32>;
@group(0) @binding(9) var skySamp: sampler;
@group(0) @binding(10) var shadowNear: texture_depth_2d;

@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_depth_2d;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var reflSamp: sampler;
@group(1) @binding(4) var shapeTex: texture_2d<f32>;
@group(1) @binding(5) var glintTex: texture_2d<f32>;
@group(1) @binding(6) var chopTex: texture_2d<f32>;
@group(1) @binding(7) var airTex: texture_2d<f32>;

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
fn hash22(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(hash21(p), hash21(p + vec2<f32>(41.3, 17.9)));
}
fn n2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x),
             mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn n3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let e = vec2<f32>(0.0, 1.0);
  return mix(
    mix(mix(hash31(i), hash31(i + e.yxx), u.x), mix(hash31(i + e.xyx), hash31(i + e.yyx), u.x), u.y),
    mix(mix(hash31(i + e.xxy), hash31(i + e.yxy), u.x), mix(hash31(i + e.xyy), hash31(i + e.yyy), u.x), u.y), u.z);
}

struct ShoreS {
  h: f32,
  vel: vec2<f32>,
  foam: f32,
  wet: f32,
  bed: f32,
  inside: f32,
  eta: f32,
}
// Foam is a network: ribbons of small bubbles around holes of clear water.
// The simulated density decides how wide the ribbons are. It never paints a solid
// band unless the water really is all foam.
fn laceCell(p: vec2<f32>, t: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var d1 = 9.0;
  var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2<f32>(f32(x), f32(y));
      let h = vec2<f32>(hash21(i + g), hash21(i + g + vec2<f32>(17.3, 5.1)));
      let o = 0.5 + 0.36 * sin(vec2<f32>(t) + 6.2831853 * h);
      let r = g + o - f;
      let d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
fn foamCover(xz: vec2<f32>, dens: f32, foot: f32) -> f32 {
  if (dens <= 0.012) { return 0.0; }
  let d = sat(dens);
  // Advected domain: foam moves with a slow current so patches stretch and tear.
  let flow = vec2<f32>(n2(xz * 0.08 + vec2<f32>(F.time * 0.02, 1.0)), n2(xz * 0.08 + vec2<f32>(4.0, F.time * 0.015))) - 0.5;
  let bend = vec2<f32>(n2(xz * 1.3 + flow * 2.0 + vec2<f32>(0.0, F.time * 0.04)), n2(xz * 1.3 + vec2<f32>(9.1, 4.3))) - 0.5;
  let bend2 = vec2<f32>(n2(xz * 4.4 + vec2<f32>(2.0, 7.0)), n2(xz * 4.4 + vec2<f32>(5.5, 1.5))) - 0.5;
  let q = xz + flow * 0.55 + bend * 0.9 + bend2 * 0.22;
  // Large patches, medium filaments, fine holes.
  let e3 = laceCell(q * 0.85 + vec2<f32>(1.1, 0.4), F.time * 0.22);
  let e2 = laceCell(q * 1.7 + vec2<f32>(3.7, 1.1), F.time * 0.45);
  let e1 = laceCell(q * 7.3 + bend * 2.0, F.time * 0.9);
  let t2 = pow(d, 1.2) * 1.02;
  let w2 = clamp(foot * 1.7, 0.05, 0.28);
  let sharp = 1.0 - smoothstep(t2 - w2, t2 + w2, e2 + (e1 - 0.28) * 0.28 + (e3 - 0.2) * 0.18);
  let ribbon = mix(sharp, sat(pow(d, 1.55) * 1.1), smoothstep(0.25, 0.9, foot * 1.7));
  let fineW = sat(foot * 7.3 + 0.25);
  let bubbles = mix(0.78 + 0.22 * smoothstep(0.0, 0.3, e1), 0.92, fineW);
  // Sparse density stays as isolated fragments, not a continuous band.
  let frag = smoothstep(0.03, 0.22, d) * (0.55 + 0.45 * smoothstep(0.15, 0.55, e3 + 0.5));
  return sat(ribbon * bubbles) * frag;
}

fn shoreFetch(xz: vec2<f32>) -> ShoreS {
  var o: ShoreS;
  o.h = 0.0; o.vel = vec2<f32>(0.0); o.foam = 0.0; o.wet = 0.0; o.bed = 0.0; o.inside = 0.0; o.eta = 0.0;
  let d = xz - SH.origin;
  let fi = dot(d, SH.along) / SH.dx - 0.5;
  let fj = dot(d, SH.sea) / SH.dx - 0.5;
  if (fi < 1.0 || fj < 1.0 || fi > SH.nx - 2.0 || fj > SH.nz - 2.0) { return o; }
  let x0 = i32(floor(fi));
  let z0 = i32(floor(fj));
  let x1 = x0 + 1;
  let z1 = z0 + 1;
  let f = fract(vec2<f32>(fi, fj));
  let a = textureLoad(shoreTex, vec2<i32>(x0, z0), 0);
  let b = textureLoad(shoreTex, vec2<i32>(x1, z0), 0);
  let c = textureLoad(shoreTex, vec2<i32>(x0, z1), 0);
  let d4 = textureLoad(shoreTex, vec2<i32>(x1, z1), 0);
  let s = mix(mix(a, b, f.x), mix(c, d4, f.x), f.y);
  let wa = textureLoad(shoreWet, vec2<i32>(x0, z0), 0);
  let wb = textureLoad(shoreWet, vec2<i32>(x1, z0), 0);
  let wc = textureLoad(shoreWet, vec2<i32>(x0, z1), 0);
  let wd = textureLoad(shoreWet, vec2<i32>(x1, z1), 0);
  let w = mix(mix(wa, wb, f.x), mix(wc, wd, f.x), f.y);
  o.h = max(s.x, 0.0);
  o.vel = s.yz;
  // Live sheet foam only — deposited ground foam darkens wet sand, it does not bleach white.
  o.foam = s.w;
  o.wet = max(w.x, w.z * 0.55);
  o.bed = w.y;
  o.inside = 1.0;
  o.eta = o.bed + o.h;
  return o;
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
  // Linear HDR in, filmic curve out. Soft shoulder keeps glitter and cloud rims from clipping hard.
  let x = max(c, vec3<f32>(0.0)) * F.exposure;
  let y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  let soft = y / (1.0 + max(y - 0.92, vec3<f32>(0.0)) * 0.35);
  return pow(clamp(soft, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(0.4545));
}

// ---- Sky. One panorama holds the air and the clouds. It is baked a strip at a time
// and read by everything that looks at the sky: the sky itself, reflections, haze.
// u is azimuth; v is elevation, with most of its rows near the horizon.
const SKYW: f32 = 1536.0;
const SKYH: f32 = 384.0;
const SKY_E0: f32 = 0.05;
const CLOUD_BASE: f32 = 0.85;
fn skyUV(rd: vec3<f32>) -> vec2<f32> {
  let el = asin(clamp(rd.y, -1.0, 1.0));
  let v = sqrt(sat((el + SKY_E0) / (1.5708 + SKY_E0)));
  return vec2<f32>(atan2(rd.z, rd.x) / 6.2831853 + 0.5, clamp(v, 0.5 / SKYH, 1.0 - 0.5 / SKYH));
}

// Rayleigh and Mie single scattering through the shell of air. Kilometres.
fn airHit(p: vec3<f32>, d: vec3<f32>) -> f32 {
  let b = dot(p, d);
  return -b + sqrt(max(b * b - dot(p, p) + 6420.0 * 6420.0, 0.0));
}
fn atmosphere(rd: vec3<f32>) -> vec3<f32> {
  let bR = vec3<f32>(5.8e-3, 13.5e-3, 33.1e-3);
  // Ozone takes green out of the long horizontal paths, which keeps the horizon from going teal.
  let bO = vec3<f32>(1.3e-3, 3.8e-3, 0.2e-3);
  let bM = 21e-3 * mix(0.7, 2.4, sat(F.mood.z));
  let d = normalize(vec3<f32>(rd.x, max(rd.y, 0.0), rd.z));
  let o = vec3<f32>(0.0, 6360.002, 0.0);
  let tmax = airHit(o, d);
  var odR = 0.0;
  var odM = 0.0;
  var sR = vec3<f32>(0.0);
  var sM = vec3<f32>(0.0);
  for (var i = 0; i < 14; i++) {
    // Steps grow with distance, so the dense air near the ground is resolved.
    let f0 = pow(f32(i) / 14.0, 2.0);
    let f1 = pow(f32(i + 1) / 14.0, 2.0);
    let p = o + d * tmax * (f0 + f1) * 0.5;
    let dt = tmax * (f1 - f0);
    let h = length(p) - 6360.0;
    let dR = exp(-h / 8.0) * dt;
    let dM = exp(-h / 1.2) * dt;
    odR += dR;
    odM += dM;
    let dl = airHit(p, F.sunTrue.xyz) / 5.0;
    var lR = 0.0;
    var lM = 0.0;
    for (var j = 0; j < 5; j++) {
      let hh = length(p + F.sunTrue.xyz * dl * (f32(j) + 0.5)) - 6360.0;
      lR += exp(-hh / 8.0) * dl;
      lM += exp(-hh / 1.2) * dl;
    }
    let att = exp(-((bR + bO) * (odR + lR) + bM * 1.1 * (odM + lM)));
    sR += att * dR;
    sM += att * dM;
  }
  let mu = dot(d, F.sunTrue.xyz);
  let pR = 0.0597 * (1.0 + mu * mu);
  let g = 0.8;
  let pM = 0.1194 * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return 20.0 * (sR * bR * pR + sM * bM * pM);
}

// Stable world-space cloud drift. Wraps so long sessions stay precise.
fn cloudDrift() -> vec2<f32> {
  return fract(F.windOff.xy / 48.0) * 48.0;
}
// Weather mix of cloud families: cumulus, towering, cirrus, stratocumulus.
fn cloudMix() -> vec4<f32> {
  let cover = sat(F.mood.y);
  let rain = sat(F.wx.x);
  let humid = sat(F.wx.w);
  var cumu = mix(0.9, 0.22, cover) * (1.0 - 0.55 * rain);
  var tower = mix(0.06, 0.55, smoothstep(0.12, 0.72, cover)) * (0.45 + 0.55 * humid) + rain * 0.5;
  var cirrus = mix(0.4, 0.06, cover) * (1.0 - rain);
  var strato = smoothstep(0.4, 0.92, cover) * (0.5 + 0.5 * humid);
  let s = max(cumu + tower + cirrus + strato, 1e-3);
  return vec4<f32>(cumu, tower, cirrus, strato) / s;
}
fn cloudCover(p: vec2<f32>) -> f32 {
  let pd = p + cloudDrift();
  let m = cloudMix();
  // Low-frequency domain warp — coherent masses, not boiling noise.
  let warp = (vec2<f32>(n2(pd * 0.22 + vec2<f32>(3.1, 0.0)), n2(pd * 0.22 + vec2<f32>(7.7, 1.3))) - 0.5) * 2.8;
  let q = pd + warp;
  // Scattered cumulus: distinct cells with clear blue between them (not a noise carpet).
  let cell = n2(q * 0.95) * 0.62 + n2(q * 2.1 + vec2<f32>(4.0, 9.0)) * 0.38;
  let billow = n2(q * 3.8 + vec2<f32>(1.2, 5.5)) * 0.58 + n2(q * 6.6 + vec2<f32>(8.0, 2.0)) * 0.42;
  let gap = smoothstep(0.28, 0.62, cell);
  let cumu = cell * gap * (0.5 + 0.5 * billow) * (0.7 + 0.42 * n2(pd * 0.055 + vec2<f32>(5.0, 2.0)));
  // Towering cumulus: larger footprints, irregular cauliflower tops.
  let tw = n2(q * 0.42 + vec2<f32>(11.0, 3.0)) * 0.68 + n2(q * 1.55 + vec2<f32>(2.0, 8.0)) * 0.32;
  let tower = tw * smoothstep(0.22, 0.58, tw) * (0.48 + 0.52 * n2(q * 2.9 + vec2<f32>(6.0, 1.0)));
  // Cirrus: thin elongated streaks at a rotated scale.
  let r = vec2<f32>(q.x * 0.42 + q.y * 0.11, -q.x * 0.08 + q.y * 0.95);
  let cirrus = n2(r * 1.9) * 0.55 + n2(r * 4.8 + vec2<f32>(3.0, 7.0)) * 0.3 + n2(r * 11.0) * 0.15;
  // Stratocumulus: soft layered field with broken openings.
  let strato = n2(q * 0.62) * 0.5 + n2(q * 1.55 + vec2<f32>(4.0, 2.0)) * 0.35 + n2(q * 3.8) * 0.15;
  let c = cumu * m.x + tower * m.y + cirrus * m.z + strato * m.w;
  let thr = 0.7 - 0.4 * sat(F.mood.y) - 0.3 * smoothstep(0.45, 0.95, F.mood.y);
  return (c - thr) / max(1.0 - thr, 0.08);
}
fn cloudAt(p: vec3<f32>, fine: f32) -> f32 {
  let amt = cloudCover(p.xz);
  if (amt <= 0.0) { return 0.0; }
  let m = cloudMix();
  // Height profiles: flat strato bases, tall towers, thin high cirrus sheets.
  let thick = 0.1 + (0.55 * m.x + 1.35 * m.y + 0.22 * m.z + 0.4 * m.w) * pow(sat(amt), 0.5);
  let baseY = CLOUD_BASE + 0.55 * m.z - 0.06 * m.w;
  let h = (p.y - baseY) / max(thick, 0.08);
  if (h < -0.05 || h > 1.15) { return 0.0; }
  let hh = clamp(h, 0.0, 1.0);
  let base = smoothstep(0.0, mix(0.06, 0.14, m.w), hh);
  // Dome for cumulus/tower; flatter for strato; wispy for cirrus.
  let dome = mix(1.0 - pow(hh, mix(1.35, 2.1, m.y)), 1.0 - abs(hh - 0.35) * 1.6, m.w);
  let wispy = mix(dome, exp(-pow((hh - 0.55) * 3.2, 2.0)), m.z);
  var d = base * wispy * sat(amt * mix(3.8, 5.2, m.y));
  if (fine > 0.5) {
    let w = p + vec3<f32>(cloudDrift().x, 0.0, cloudDrift().y);
    // Prefer mid scales over boiling fine noise — keeps silhouettes stable frame to frame.
    let large = n3(w * 2.0);
    let mid = n3(w * 5.4 + vec3<f32>(4.0, 1.0, 7.0));
    let fineN = n3(w * 11.0 + vec3<f32>(2.0, 9.0, 5.0));
    let b = large * 0.5 + mid * 0.38 + fineN * 0.12;
    // Cellular breakup of edges; towers erode more on top.
    let erode = sat(0.5 + (b - 0.5) * 3.1) * (0.14 + 0.9 * hh * hh * (0.6 + 0.8 * m.y));
    d -= erode * (1.0 - 0.35 * m.z);
  } else {
    d -= 0.18 + 0.26 * hh;
  }
  return sat(d * 1.9);
}
struct SkyBake { @location(0) c: vec4<f32> }
@fragment fn fsSkyBake(in: SkyV) -> SkyBake {
  // Each bake looks through a different point of its texel, and the bakes are blended, so
  // an edge finer than a row of the panorama comes out soft instead of as alternate rows.
  let uv = (in.clip.xy + vec2<f32>(fract(F.time * 61.7), fract(F.time * 37.3)) - 0.5) / vec2<f32>(SKYW, SKYH);
  let az = (uv.x - 0.5) * 6.2831853;
  let el = uv.y * uv.y * (1.5708 + SKY_E0) - SKY_E0;
  let rd = vec3<f32>(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  // After dark what is left is airglow and whatever the moon puts into the air.
  // Single scattering goes dark the moment the sun sets. The real sky does not: light that has
  // been scattered more than once keeps the whole dome a deep blue through twilight.
  let dusk = smoothstep(0.12, -0.05, F.sunTrue.y);
  let air = atmosphere(rd) + F.amb.rgb * vec3<f32>(0.5, 0.72, 1.1) * dusk * (0.5 + 0.5 * sat(rd.y))
    + vec3<f32>(0.0035, 0.0055, 0.011) * F.sunTrue.w * (0.35 + 0.65 * F.moon.w) * (1.0 + 0.8 * pow(1.0 - sat(rd.y), 4.0));
  var col = air;
  var T = 1.0;
  // The slab is lifted a little toward the horizon, standing in for the curve of the earth.
  let sinE = max(rd.y, 0.0) + 0.012;
  let hz = normalize(rd.xz + vec2<f32>(1e-5, 0.0)) * sqrt(1.0 - sinE * sinE);
  let t0 = CLOUD_BASE / sinE;
  let big = min(1.9 / sinE, 14.0) / 20.0;
  let ds = big / 7.0;
  // Direct sunlight fades out below the horizon; night clouds keep shape via amb/moon only.
  let dayK = smoothstep(-0.04, 0.1, F.sunTrue.y);
  let sunAim = mix(F.moon.xyz, F.sunTrue.xyz, dayK);
  let mu = dot(rd, normalize(sunAim + vec3<f32>(1e-5, 1e-5, 0.0)));
  let gold = sat(F.day.w);
  // Warm sun-facing cloud light; cooler ambient for undersides — not a global orange filter.
  let sunWarm = mix(vec3<f32>(1.0), vec3<f32>(1.35, 0.95, 0.62), gold);
  let sunL = F.sunCol * sunWarm * 1.55 * dayK * (1.0 + 2.2 * pow(sat(mu), 5.0) + 1.1 * gold);
  let moonL = F.amb.rgb * vec3<f32>(0.55, 0.62, 0.78) * (1.0 - dayK) * (0.35 + 0.65 * F.moon.w);
  let skyL = F.amb.rgb * mix(vec3<f32>(0.88, 0.83, 0.8), vec3<f32>(0.55, 0.62, 0.95), gold * 0.55);
  var C = vec3<f32>(0.0);
  var tm = 0.0;
  var wsum = 0.0;
  // Camera-relative only for precision; cloud field itself is world-anchored via cloudDrift.
  let org = vec3<f32>(F.camPos.x * 0.001, 0.0, F.camPos.z * 0.001);
  let dir = vec3<f32>(hz.x, sinE, hz.y);
  if (rd.y > -0.004) {
    // Long strides through clear air. Where the ray enters a cloud the surface is found
    // by bisection and the short steps are counted from there, so the samples sit at
    // the same depths under the surface for every texel and leave no banding or grain.
    var t = t0;
    var tp = t0;
    var inside = false;
    for (var i = 0; i < 150; i++) {
      if (t > t0 + big * 20.0 || T < 0.02) { break; }
      let p = org + dir * t;
      if (!inside) {
        if (cloudCover(p.xz) < -0.12) { tp = t; t += ds * 3.0; continue; }
        if (cloudAt(p, 1.0) <= 0.004) { tp = t; t += ds; continue; }
        var a = tp;
        var b = t;
        for (var k = 0; k < 5; k++) {
          let m = (a + b) * 0.5;
          if (cloudAt(org + dir * m, 1.0) > 0.004) { b = m; } else { a = m; }
        }
        t = b + ds * 0.3;
        inside = true;
        continue;
      }
      let d = cloudAt(p, 1.0);
      if (d <= 0.004) { inside = false; tp = t; t += ds; continue; }
      let lightDir = normalize(sunAim + vec3<f32>(0.0, 0.02, 0.0));
      var ls = cloudAt(p + lightDir * 0.06, 1.0) * 0.1;
      ls += cloudAt(p + lightDir * 0.22, 0.0) * 0.2;
      ls += cloudAt(p + lightDir * 0.6, 0.0) * 0.5;
      let hK = sat((p.y - CLOUD_BASE) / 1.3);
      let sunT = exp(-ls * 12.0);
      // Sun-facing rims warm; thin edges silver-lined when backlit; interiors cooler.
      let phase = 0.7 + 0.65 * pow(sat(mu), 3.5);
      let silver = pow(sat(mu), 7.0) * sunT * (1.0 - d * 0.55) * (0.6 + 1.0 * gold);
      let L = sunL * (sunT * 0.95 * phase + 0.12 * exp(-ls * 1.3) + silver * 1.65)
        + skyL * (0.22 + 0.55 * hK + 0.28 * (1.0 - hK))
        + moonL * (0.45 + 0.55 * hK);
      let al = 1.0 - exp(-d * ds * 34.0);
      C += T * al * L;
      tm += T * al * t;
      wsum += T * al;
      T *= 1.0 - al;
      t += ds;
    }
  }
  if (wsum > 0.0) {
    // Distant cloud is seen through the same air as the horizon.
    let keep = exp(-(tm / wsum) * 0.028);
    col = air * T + C * keep + air * (1.0 - T) * (1.0 - keep);
  }
  var o: SkyBake;
  o.c = vec4<f32>(col, T);
  return o;
}

// disc is 1 where the sun itself may show, 0 for the glow of the air alone.
fn skyLook(rd: vec3<f32>, disc: f32) -> vec3<f32> {
  let up = sat(rd.y);
  let mu = dot(rd, F.sunTrue.xyz);
  let s = textureSampleLevel(skyMap, skySamp, skyUV(rd), 0.0);
  var col = s.rgb;
  let over = sat(F.mood.y);
  col += F.disc.rgb * pow(sat(mu), 2200.0) * 18.0 * (1.0 - over) * s.a * disc;
  let warmK = sat(F.mood.x) * (1.0 - F.sunTrue.w);
  let goldK = sat(F.day.w) * (1.0 - F.sunTrue.w);
  col = mix(col, col * vec3<f32>(1.08, 0.97, 0.9) + vec3<f32>(0.04, 0.02, 0.0) * F.amb.w, warmK * 0.4);
  // Horizon haze warms at golden hour without painting the zenith orange.
  col = mix(col, col * vec3<f32>(1.12, 0.96, 0.82) + vec3<f32>(0.06, 0.02, 0.0), goldK * (1.0 - up) * 0.65);
  // A cloud deck is grey whatever colour the light under it has been given.
  col = mix(col, vec3<f32>(0.98, 1.0, 1.04) * dot(F.amb.rgb, vec3<f32>(0.37, 0.55, 0.23)) * (0.45 + 0.7 * up), over * 0.82);
  return col * max(F.lit.y, 0.0);
}
fn skyColor(rd: vec3<f32>) -> vec3<f32> { return skyLook(rd, 1.0); }
// The air a distant thing is seen through: the glow of the horizon that way. The rows of
// the panorama just under the horizon hold the air alone, with no cloud drawn across it.
fn hazeColor(dir: vec3<f32>) -> vec3<f32> {
  return skyLook(normalize(vec3<f32>(dir.x, -0.03, dir.z) + vec3<f32>(1e-5, 0.0, 0.0)), 0.0);
}

// What a tilted piece of water or wet sand mirrors. A ray that dips under the
// horizon is looking at more sea.
fn skyReflect(rd: vec3<f32>) -> vec3<f32> {
  var col = skyColor(normalize(vec3<f32>(rd.x, max(rd.y, 0.004), rd.z)));
  if (rd.y < 0.0) {
    // That water is itself a mirror at this angle, so half of what comes back is still sky.
    col = mix(mix(F.deepC.rgb, col, 0.5), col, exp(rd.y * 9.0));
  }
  return col;
}

fn cloudShade(xz: vec2<f32>, y: f32) -> f32 {
  let dayK = smoothstep(-0.02, 0.08, F.sunTrue.y);
  // Project along the true sun while it is up; at night there is no solar occlusion.
  let sy = max(F.sunTrue.y, 0.08);
  let up = (CLOUD_BASE * 1000.0 + 250.0 - y) / sy;
  let amt = cloudCover((xz + F.sunTrue.xz * up) * 0.001);
  let shade = mix(1.0, mix(0.48, 0.08, sat(F.mood.y * 1.25)), smoothstep(-0.05, 0.35, amt));
  return mix(1.0, shade, dayK);
}

// Water optical constants (Abyssal-style Beer's law): scatter SIG, absorb KD — turquoise tropical mix.
const W_SIG = vec3<f32>(0.042, 0.022, 0.018);
const W_KD = vec3<f32>(0.055, 0.022, 0.016);
const W_COL = vec3<f32>(0.14, 0.48, 0.72);
// In-scattered water light along a ray (Beer's law integral + soft forward phase).
fn waterFogIn(ro: vec3<f32>, rd: vec3<f32>, dist: f32) -> vec3<f32> {
  let a = W_SIG - W_KD * rd.y;
  let I = (1.0 - exp(-a * dist)) / max(a, vec3<f32>(1e-4));
  let mu = max(dot(rd, F.sunDir), 0.0);
  let phase = 1.15 + 0.35 * mu * mu * mu * mu;
  let lit = mix(0.5, 1.0, cloudShade(ro.xz, ro.y)) * max(F.lit.y, 0.0);
  return W_COL * W_SIG * exp(W_KD * min(ro.y, 0.0)) * I * phase * lit * F.day.rgb;
}
fn waterHaze(dy: f32) -> vec3<f32> {
  // Far-field water colour when looking into open sea (uses fog integral over a long path).
  let rd = normalize(vec3<f32>(0.02, dy, 1.0));
  return waterFogIn(F.camPos, rd, 80.0);
}
// Light scattered by the water itself reaches every side of a thing that is in it.
fn waterFill(depth: f32) -> vec3<f32> {
  let sunDeep = exp(W_KD * (-depth) / max(F.sunDir.y, 0.12));
  return W_COL * 0.55 * F.under * sat(depth * 3.0) * sunDeep * max(F.lit.y, 0.0) * F.day.rgb
    * mix(0.55, 1.0, cloudShade(F.camPos.xz, 0.0));
}
// Aerial perspective. Air scatters blue out of the line of sight first, and the damp air
// near the sea adds a pale veil that thins with height and thickens with humidity and rain.
// What replaces the lost light is the sky in that direction, so the haze is bright toward
// the sun and takes the colour of the hour. dy is how far the ray climbs.
fn airKeep(dist: f32, dy: f32) -> vec3<f32> {
  // Near stays crisp; distant contrast fades into humid blue air.
  let s = dy / 160.0;
  var lay = exp(-max(F.camPos.y, 0.0) / 160.0);
  if (abs(s) > 1e-3) { lay *= (1.0 - exp(-s)) / s; }
  let gold = sat(F.day.w);
  let night = sat(F.sunTrue.w);
  let humid = sat(F.wx.w);
  let mist = sat(F.wx.z);
  // Humidity + mist thicken the veil; rain greys it; night softens scattering.
  let veil = (0.00038 + 0.0016 * humid * humid + 0.0011 * mist + 0.0028 * F.wx.x
    + 0.00035 * gold) * min(lay, 4.0) * mix(1.0, 0.45, night);
  // Rayleigh-ish: blue drops first. Warm a little toward the horizon at golden hour.
  let ray = vec3<f32>(0.42, 1.05, 2.75) * 1e-4 * mix(1.0, 0.82, gold);
  // Protect the first ~25 m so palms and shoreline stay sharp.
  let near = smoothstep(18.0, 55.0, dist);
  return exp(-dist * (ray + veil) * near);
}
fn airMix(col: vec3<f32>, dir: vec3<f32>, dist: f32) -> vec3<f32> {
  let keep = airKeep(dist, dir.y * dist);
  var haze = hazeColor(dir);
  let gold = sat(F.day.w);
  // Horizon haze warms at golden hour without orange-washing the whole frame.
  haze = mix(haze, haze * vec3<f32>(1.18, 0.95, 0.78) + vec3<f32>(0.04, 0.015, 0.0), gold * sat(1.0 - dir.y * 2.5) * 0.55);
  return col * keep + haze * (1.0 - keep);
}
fn applyFog(col: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let d = world - F.camPos;
  let dist = length(d);
  if (F.under > 0.5) {
    let rd = d / max(dist, 1e-3);
    let keep = exp(-W_SIG * dist * mix(0.85, 1.35, sat(F.camDamp)));
    return col * keep + waterFogIn(F.camPos, rd, dist) * (0.55 + 0.45 * sat(exp(-dist * 0.02)));
  }
  return airMix(col, d / max(dist, 1e-3), dist);
}

// Interference caustic (Abyssal-style): folded sin/cos lattice, not a tiled noise wallpaper.
fn causWave(uv: vec2<f32>, t: f32) -> f32 {
  let p = uv * 6.2831853;
  var i = p;
  var c = 0.0;
  for (var n = 1; n <= 5; n++) {
    let tt = t * (1.0 - 3.5 / f32(n));
    i = p + vec2<f32>(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    let s = sin(i.x + tt);
    let k = cos(i.y + tt);
    c += abs(s * k) / (1.25 * sqrt(s * s + k * k) + 1e-4);
  }
  c = 1.17 - pow(c / 5.0, 1.4);
  return pow(abs(c), 8.0);
}
fn caustic(xz: vec2<f32>) -> f32 {
  let depth = max(-sampleField(xz).x, 0.12);
  if (depth < 0.02 || F.sunDir.y < 0.04) { return 0.0; }
  let sy = max(F.sunDir.y, 0.18);
  // Project seabed point up the sun ray to the surface, then sample the interference field.
  let surf = xz - F.sunDir.xz * (depth / sy);
  let t = F.time * (0.35 + 0.25 * max(F.mood.w, 0.35));
  let dir = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  let uv = vec2<f32>(dot(surf, dir), dot(surf, vec2<f32>(-dir.y, dir.x))) * mix(0.055, 0.028, sat(depth / 8.0));
  let a = causWave(uv, t + 23.0);
  let b = causWave(uv.yx * 0.72 + vec2<f32>(0.37, 0.11), t * 0.85 + 5.0);
  let net = pow(a, 2.2) * (0.45 + 1.2 * b);
  let lit = cloudShade(xz, 0.0);
  let day = smoothstep(0.02, 0.12, F.sunTrue.y);
  let shallow = smoothstep(0.02, 0.4, depth) * exp(-depth * 0.22);
  return sat(net * 4.5) * shallow * lit * day * 0.72;
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

// The ray march only sees the ground. This map is the trees, rocks and hills
// rendered from the sun, so a trunk can actually fall across the sand.
fn sunShadow(p: vec3<f32>) -> f32 {
  let c = F.shadowVP * vec4<f32>(p + F.sunDir * 0.45, 1.0);
  let w = max(c.w, 1e-4);
  let uv = clamp(vec2<f32>(c.x / w * 0.5 + 0.5, 0.5 - c.y / w * 0.5), vec2<f32>(0.001), vec2<f32>(0.999));
  let z = clamp(c.z / w, 0.0, 1.0);
  let t = 1.0 / 2048.0;
  var s = 0.0;
  s += textureSampleCompare(shadowMap, shadowSamp, uv + vec2<f32>(-t, -t), z);
  s += textureSampleCompare(shadowMap, shadowSamp, uv + vec2<f32>(t, -t), z);
  s += textureSampleCompare(shadowMap, shadowSamp, uv + vec2<f32>(-t, t), z);
  s += textureSampleCompare(shadowMap, shadowSamp, uv + vec2<f32>(t, t), z);
  s += textureSampleCompare(shadowMap, shadowSamp, uv, z);
  let raw = vec2<f32>(c.x / w * 0.5 + 0.5, 0.5 - c.y / w * 0.5);
  let inside = smoothstep(0.0, 0.03, raw.x) * smoothstep(1.0, 0.97, raw.x)
             * smoothstep(0.0, 0.03, raw.y) * smoothstep(1.0, 0.97, raw.y);
  let far = mix(shadowAt(p), s * 0.2, inside);
  // Close to the eye, the tight map. Nine taps over about ten centimetres, which is
  // roughly how soft the sun leaves the edge of a frond's shadow.
  let cn = F.nearVP * vec4<f32>(p + F.sunDir * 0.06, 1.0);
  let un = vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5);
  let zn = clamp(cn.z, 0.0, 1.0);
  let tn = 2.6 / 2048.0;
  var sn = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      sn += textureSampleCompare(shadowNear, shadowSamp, un + vec2<f32>(f32(x), f32(y)) * tn, zn);
    }
  }
  let wn = 1.0 - smoothstep(0.8, 0.97, max(abs(cn.x), abs(cn.y)));
  return mix(far, sn / 9.0, wn);
}

// Diffuse light from the sky panorama. Three taps stand in for the hemisphere: along
// the normal, toward the zenith, and a little toward the sun. Without this, sand and
// leaves are a flat fill with a hard sun.
fn skyIrradiance(n: vec3<f32>) -> vec3<f32> {
  let n0 = normalize(n + vec3<f32>(0.0, 0.4, 0.0));
  let n1 = normalize(mix(n, vec3<f32>(0.0, 1.0, 0.0), 0.7));
  let n2 = normalize(n + F.sunDir * 0.35 + vec3<f32>(0.0, 0.15, 0.0));
  return (skyLook(n0, 0.0) + skyLook(n1, 0.0) * 1.15 + skyLook(n2, 0.0) * 0.85) * 0.333;
}

// leaf is 1 for a thin blade, which is lit from whichever side the sun is on: by
// reflection on the near face, by transmission through it from the far face.
// gloss is the waxy sheen on a leaf's upper face.
fn shade(world: vec3<f32>, nrm: vec3<f32>, albedo: vec3<f32>, leaf: f32, gloss: f32) -> vec3<f32> {
  let n = normalize(nrm);
  let nl = dot(n, F.sunDir);
  let sh = sunShadow(world) * cloudShade(world.xz, world.y);
  let hemi = n.y * 0.5 + 0.5;
  // Under the forest the crowns hide half the sky from the ground, the trunks and the low leaves.
  let fld = sampleField(world.xz);
  let roof = smoothstep(1.9, 4.4, fld.x) * smoothstep(-0.62, -0.12, forestNoise(world.xz)) * (1.0 - smoothstep(3.5, 9.0, world.y - fld.x));
  let open = 1.0 - 0.55 * roof;
  // The same panorama that paints the sky and the water lights the ground. Leaves take more
  // of the upper sky; a face turned down takes more of the sand bounce.
  let sky = skyIrradiance(n) * mix(mix(0.45, 1.0, hemi), 0.9, leaf) * open;
  let ground = vec3<f32>(0.42, 0.34, 0.22) * F.amb.w * (1.0 - hemi) * open;
  // Soften the lit / unlit edge a little so a hard sun does not cut every trunk in half.
  let gold = sat(F.day.w);
  let sunTerm = mix(max(nl, 0.0), sat(nl * 0.5 + 0.5) * max(nl, 0.0), 0.35);
  // Warm key on lit faces; sky fill stays cooler so golden hour is directional, not a filter.
  let keyTint = mix(vec3<f32>(1.0), vec3<f32>(1.18, 0.95, 0.72), gold * sunTerm);
  var light = F.sunCol * keyTint * sunTerm * sh * 1.12 + sky * mix(0.85, 0.95, gold) + ground * 0.5;
  if (world.y < 0.05) {
    let depth = max(-world.y, 0.0);
    // Sun energy attenuated along the beam path through water (Abyssal sunE).
    let absorb = exp(W_KD * (-depth) / max(F.sunDir.y, 0.12));
    light *= absorb * (0.55 + 0.45 * sat(depth / 8.0 + 0.2));
    if (world.y < -0.04) {
      let k = smoothstep(0.04, 0.3, depth) * exp(-depth * 0.3);
      let cau = caustic(world.xz);
      light += F.sunCol * max(nl, 0.0) * sh * (cau * 3.4 - 0.12 * k) * absorb;
    }
  }
  if (F.under > 0.5) { light = light * vec3<f32>(0.8, 0.92, 0.94) + waterFill(max(-world.y, 0.0)) * (0.7 + 0.3 * hemi); }
  // Rain and dew: bark and soil soak dark, a leaf only deepens, and both take a film that shines.
  let wet = F.wx.y * step(0.05, world.y) * (1.0 - F.under);
  var col = albedo * mix(1.0, mix(0.6, 0.86, leaf), wet) * light;
  // Light through the blade is yellower and more saturated than light off it.
  col += albedo * vec3<f32>(1.25, 1.45, 0.3) * F.sunCol * max(-nl, 0.0) * sh * leaf;
  let V = normalize(F.camPos - world);
  let H = normalize(V + F.sunDir);
  // A wet leaf glints in the sun; wet bark and soil are mostly just dark. The sky shows in
  // a wet face only if the face is turned up to it, not round the edge of every shape.
  let sheen = max(gloss, wet * mix(0.1, 0.55, leaf));
  if (sheen > 0.0) {
    let ndv = max(dot(n, V), 0.0);
    let fr = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
    // Tighter specular on leaves; wet bark still glints modestly.
    let hard = mix(mix(48.0, 90.0, leaf), 70.0, wet);
    col += F.sunCol * pow(max(dot(n, H), 0.0), hard) * step(0.0, nl) * sh * sheen * mix(0.35, 0.55, leaf);
    col += skyLook(reflect(-V, n), 0.0) * fr * max(gloss * 0.7, wet * mix(0.06, 0.18, leaf) * sat(n.y * 1.5)) * 0.35;
  }
  if (world.y > -0.15 && world.y < 1.1 && leaf < 0.5) {
    let spec = pow(max(dot(n, H), 0.0), 56.0);
    let wet = 1.0 - sat(world.y / 0.7);
    col += F.sunCol * spec * sh * wet * 0.09;
  }
  return applyFog(col, world);
}

fn forestNoise(p: vec2<f32>) -> f32 {
  return sin(p.x * 0.031 + 1.3) * sin(p.y * 0.027 + 0.5)
    + 0.6 * sin((p.x + p.y) * 0.053 + 2.1) * sin((p.x - p.y) * 0.047 + 0.4)
    + 0.35 * sin(p.x * 0.11 + 3.0) * sin(p.y * 0.13 + 1.0);
}
// Height the damp sand reaches. It wanders, in long scallops and short tongues.
fn dampLine(xz: vec2<f32>) -> f32 {
  return 0.66 + (n2(xz * 0.07) - 0.5) * 0.3 + (n2(xz * 0.31) - 0.5) * 0.16 + (n2(xz * 1.3) - 0.5) * 0.05;
}
// Relief of dry sand in metres: pits and scuffs with raised rims, low wind ripples
// in patches, and grain. foot is the width of a pixel on the ground; anything finer is left out.
fn sandRelief(p: vec2<f32>, foot: f32) -> f32 {
  var h = 0.0;
  let q = p * 2.9;
  let c = floor(q);
  let f = q - c;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2<f32>(f32(i), f32(j));
      let r = hash22(c + g);
      let k = hash21(c + g + vec2<f32>(17.0, 3.0));
      if (k < 0.3) { continue; }
      let d = length(g + r - f) / (0.2 + 0.42 * k);
      h += (-smoothstep(1.0, 0.0, d) + 0.38 * exp(-(d - 1.05) * (d - 1.05) * 9.0)) * (0.012 + 0.03 * k);
    }
  }
  h *= sat(1.6 - foot * 9.0);
  h += (n2(p * 7.0) - 0.5) * 0.02 * sat(1.5 - foot * 20.0);
  let warp = n2(p * 0.4) * 3.0 + n2(p * 1.7 + vec2<f32>(7.0, 2.0)) * 0.8;
  let rip = sin(dot(p, vec2<f32>(0.83, 0.56)) * 46.0 + warp * 5.0);
  h += rip * 0.0035 * smoothstep(0.45, 0.7, n2(p * 0.19 + vec2<f32>(3.0, 8.0))) * sat(1.4 - foot * 28.0);
  h += (n2(p * 31.0) - 0.5) * 0.006 * sat(1.4 - foot * 70.0);
  return h;
}
fn terrainAlbedo(xz: vec2<f32>, y: f32, n: vec3<f32>) -> vec3<f32> {
  let slope = sat(1.0 - n.y);
  let rock = smoothstep(0.5, 0.82, slope) * smoothstep(1.2, 5.0, y);
  var sandW = smoothstep(2.5, 0.25, y) * (1.0 - rock);
  // below the waterline the bottom is sand unless it is steep
  if (y < 0.3) { sandW = max(sandW, 1.0 - rock); }
  let grassW = sat(1.0 - rock - sandW);
  let m = n2(xz * 0.11);
  // Coral sand: pale, with broad slow changes in tone. The sharp detail is relief, not paint.
  var sandC = mix(vec3<f32>(0.71, 0.64, 0.51), vec3<f32>(0.60, 0.52, 0.39), n2(xz * 0.23) * 0.6 + n2(xz * 0.9) * 0.25);
  let wash = sin(dot(xz, vec2<f32>(0.42, 0.07)) + n2(xz * 0.15) * 3.0);
  sandC *= 0.95 + 0.05 * wash;
  // Sand the last high wash reached is still damp: darker, and it ends at a ragged line.
  let damp = 1.0 - smoothstep(-0.035, 0.035, y - dampLine(xz));
  sandC = mix(sandC, sandC * vec3<f32>(0.56, 0.55, 0.52), damp * 0.85);
  let wet = smoothstep(0.2, 0.0, y);
  sandC = mix(sandC, sandC * vec3<f32>(0.62, 0.66, 0.66), wet * 0.7);
  if (y < 0.05) { sandC = mix(vec3<f32>(0.70, 0.64, 0.50), sandC, sat(-y * 0.4 + 0.3)); }
  var grassC = mix(vec3<f32>(0.075, 0.13, 0.04), vec3<f32>(0.19, 0.22, 0.085), m);
  grassC *= 0.78 + 0.36 * n2(xz * 0.22);
  grassC = mix(grassC, vec3<f32>(0.38, 0.36, 0.15), smoothstep(3.5, 0.9, y) * 0.32);
  grassC = mix(grassC, grassC * 0.72, smoothstep(0.55, 0.85, n2(xz * 1.4)) * 0.45);
  // Under the trees the ground is leaf litter in shade, not lawn.
  let forest = smoothstep(1.9, 4.4, y) * (1.0 - smoothstep(0.12, 0.29, slope)) * smoothstep(-0.62, -0.12, forestNoise(xz));
  let litter = mix(vec3<f32>(0.035, 0.045, 0.022), vec3<f32>(0.075, 0.062, 0.035), n2(xz * 0.9));
  grassC = mix(grassC, litter, forest * 0.92);
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
  // Dry sand near the eye has relief: its normal comes from a height, and so does the shade in its pits.
  let distG = length(in.world - F.camPos);
  let foot = distG * F.tanHalf * 2.0 / max(F.res.y, 1.0);
  let line = dampLine(in.world.xz);
  let sandy = smoothstep(3.4, 2.2, in.world.y) * (1.0 - smoothstep(0.1, 0.3, slope)) * step(-0.05, in.world.y);
  let dry = smoothstep(line - 0.02, line + 0.22, in.world.y) * sandy;
  let nearA = dry * smoothstep(70.0, 20.0, distG);
  var pit = 0.0;
  if (nearA > 0.01) {
    let e = max(0.012, foot * 1.2);
    let h0 = sandRelief(in.world.xz, foot);
    let hx = sandRelief(in.world.xz + vec2<f32>(e, 0.0), foot);
    let hz = sandRelief(in.world.xz + vec2<f32>(0.0, e), foot);
    n = normalize(n + vec3<f32>(h0 - hx, 0.0, h0 - hz) / e * nearA);
    pit = sat(-h0 * 26.0) * nearA;
  }
  // Under water the sand is combed into ripples by the waves passing over it:
  // sharp crests a hand apart, bending and forking, with darker troughs.
  var trough = 0.0;
  // A pixel at a glancing angle is far longer than it is wide, and the ripples have to fit inside it.
  let footLong = foot / max(abs(F.camPos.y - in.world.y) / max(distG, 0.1), 0.08);
  let bedK = smoothstep(-0.15, -0.6, in.world.y) * (1.0 - smoothstep(0.08, 0.3, slope)) * sat(1.5 - footLong * 9.0);
  if (bedK > 0.01) {
    let q = in.world.xz;
    // One direction, set by the waves; the crests wander and fork because the sand under them is uneven.
    let rd = vec2<f32>(0.95, 0.31);
    let ph = dot(q, rd) * 33.0 + n2(q * 0.4) * 9.0 + n2(q * 1.9 + vec2<f32>(4.0, 1.0)) * 2.4;
    let lull = smoothstep(0.25, 0.6, n2(q * 0.13 + vec2<f32>(2.0, 7.0)));
    n = normalize(n + vec3<f32>(rd.x, 0.0, rd.y) * cos(ph) * 0.2 * bedK * lull);
    trough = (0.5 - 0.5 * sin(ph)) * bedK * lull;
  }
  var alb = terrainAlbedo(in.world.xz, in.world.y, n);
  alb *= 1.0 - 0.1 * trough;
  // Close to, the ground among the trees is not a coat of paint. Fallen leaves lie on it,
  // thick under the canopy and scattered on the open turf, and the turf itself is tufted.
  let turfK = (1.0 - sandy) * smoothstep(1.4, 2.8, in.world.y) * (1.0 - smoothstep(0.3, 0.55, slope));
  if (turfK > 0.01) {
    let q = in.world.xz;
    let woodK = smoothstep(1.9, 4.4, in.world.y) * smoothstep(-0.62, -0.12, forestNoise(q));
    let fine = sat(1.6 - foot * 30.0);
    let L = leafCells(q * 7.0);
    let fallen = smoothstep(0.62, 0.48, L.x) * step(mix(0.86, 0.45, woodK), L.w);
    let tuft = n2(q * 9.0) * 0.55 + n2(q * 33.0) * 0.45;
    alb *= 1.0 + (tuft - 0.5) * 0.8 * turfK * fine * (1.0 - fallen);
    let lit = mix(1.0, 0.55, woodK);
    let dead = mix(vec3<f32>(0.1, 0.075, 0.045), vec3<f32>(0.21, 0.165, 0.095), L.z) * lit * (0.8 + 0.2 * smoothstep(0.0, 0.25, abs(L.y)));
    // Too far to see one leaf, the litter is still there as a share of the colour.
    alb = mix(alb, vec3<f32>(0.155, 0.12, 0.07) * lit, turfK * (1.0 - fine) * mix(0.07, 0.27, woodK));
    alb = mix(alb, dead, fallen * turfK * fine * 0.9);
  }
  if (bedK > 0.01) {
    // The bed is not one colour: a film of algae greys it in patches, and close to it is
    // grains, with bits of shell and broken coral among them.
    let q = in.world.xz;
    alb *= 1.0 - 0.2 * bedK * smoothstep(0.35, 0.75, n2(q * 0.55 + vec2<f32>(7.0, 1.0)) * 0.65 + n2(q * 2.3) * 0.35);
    let gr = n2(q * 260.0) * 0.6 + n2(q * 610.0 + vec2<f32>(3.0, 8.0)) * 0.4;
    alb *= 1.0 + ((gr - 0.5) * 0.5 - smoothstep(0.74, 0.82, gr) * 0.3 + smoothstep(0.27, 0.2, gr) * 0.25) * sat(1.2 - foot * 300.0) * bedK
      + (n2(q * 37.0) - 0.5) * 0.2 * sat(1.3 - foot * 30.0) * bedK;
  }
  if (sandy > 0.01) {
    let cell = floor(in.world.xz * 90.0);
    let grainK = sat(1.3 - foot * 60.0) * sandy;
    // Grains: most are pale shell and coral, a few are dark.
    let gr = hash21(cell);
    alb *= 1.0 + ((gr - 0.5) * 0.22 - step(0.965, gr) * 0.4 + step(gr, 0.02) * 0.35) * grainK;
    alb *= 1.0 - pit * 0.3;
    // The wrack line: what the last high wash left where it stopped. Weed, husk, bits of shell.
    let off = in.world.y - line - 0.05;
    let band = exp(-off * off * 420.0) + 0.25 * exp(-(off - 0.3) * (off - 0.3) * 150.0);
    let clump = smoothstep(0.42, 0.75, n2(in.world.xz * 0.9) * 0.6 + n2(in.world.xz * 4.5) * 0.4);
    // Pieces of several sizes, not a sprinkle of equal dots.
    let bit = n2(in.world.xz * 19.0) * 0.55 + n2(in.world.xz * 47.0 + vec2<f32>(5.0, 9.0)) * 0.45;
    let near = sat(1.3 - foot * 26.0);
    let wrack = sat(band * clump * 1.6) * mix(0.3, smoothstep(0.5, 0.58, bit), near);
    alb = mix(alb, mix(vec3<f32>(0.05, 0.038, 0.025), vec3<f32>(0.16, 0.12, 0.07), bit), wrack * sandy * 0.85);
  }
  let sh = shoreFetch(in.world.xz);
  var washFoam = 0.0;
  var washWet = 0.0;
  if (sh.inside > 0.5 && slope < 0.72) {
    // Wetness is where the sheet has been, not a contour of the coarse mesh.
    washWet = sh.wet * smoothstep(0.12, 0.0, sh.h);
    let distT = length(in.world - F.camPos);
    let footT = distT * F.tanHalf * 2.0 / max(F.res.y, 1.0) / max(abs(F.camPos.y - in.world.y) / max(distT, 0.1), 0.08);
    washFoam = foamCover(in.world.xz, sh.foam * smoothstep(0.06, 0.0, sh.h) * 0.8, footT);
  }
  // Rain wets the ground everywhere, and it stays dark after the shower until it dries.
  let rainWet = F.wx.y * step(0.0, in.world.y) * (0.75 + 0.25 * n2(in.world.xz * 0.6));
  // Dew darkens sand without making a mirror of it; that takes a soaking.
  washWet = max(washWet, rainWet * 0.8 * smoothstep(0.2, 0.7, rainWet));
  var col = shade(in.world, n, alb, 0.0, 0.0);
  // Wet sand is a mirror at a low angle. Dry sand never is.
  let Vt = normalize(F.camPos - in.world);
  // Sand a trough has left bare is as wet as sand gets, though it lies below the waterline.
  let gloss = max(smoothstep(0.26, 0.02, in.world.y) * smoothstep(-0.9, -0.35, in.world.y), washWet * sandy) * (1.0 - slope * 3.0);
  if (gloss > 0.01 && F.under < 0.5) {
    let nw = normalize(mix(n, vec3<f32>(0.0, 1.0, 0.0), 0.8));
    let fr = 0.02 + 0.98 * pow(1.0 - max(dot(nw, Vt), 0.0), 5.0);
    col = mix(col, applyFog(skyReflect(reflect(-Vt, nw)), in.world), sat(fr * gloss * 0.9));
  }
  if (washWet > 0.04 || washFoam > 0.02) {
    // Wet sand goes darker and slightly specular; foam is a sparse lace, not a white band.
    col *= mix(1.0, 0.58, washWet * (1.0 - washFoam * 0.35));
    let Vw = normalize(F.camPos - in.world);
    let spec = pow(sat(dot(n, normalize(F.sunDir + Vw))), 24.0) * washWet;
    col += vec3<f32>(0.18, 0.18, 0.17) * F.sunCol * spec;
    let sun = 0.62 + 0.5 * max(dot(n, F.sunDir), 0.0);
    col = mix(col, vec3<f32>(0.82, 0.85, 0.82) * F.day.rgb * sun, washFoam * 0.34);
  }
  return vec4<f32>(col, 1.0);
}

struct MeshV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
  @location(3) kind: f32,
  @location(4) uv: vec2<f32>,
}
struct MeshIn {
  @location(0) p: vec3<f32>,
  // The normal, and in w what the vertex is made of. The colour, and in w how far it gives to the wind.
  @location(1) n: vec4<f32>,
  @location(2) c: vec4<f32>,
  @location(5) uv: vec2<f32>,
  // Instance: position and yaw, scale and vertical stretch, tint.
  @location(6) i0: vec4<f32>,
  @location(7) i1: vec4<f32>,
  @location(8) i2: vec4<f32>,
}
fn spinY(v: vec3<f32>, a: f32) -> vec3<f32> {
  let s = sin(a); let c = cos(a);
  return vec3<f32>(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}
// The wind at a place, in m/s: the prevailing speed, and gusts that cross the island as
// cells tens of metres wide, carried along by the wind itself.
fn windAt(xz: vec2<f32>) -> f32 {
  let p = xz - F.windOff.zw;
  let g = n2(p * 0.018) * 0.6 + n2(p * 0.07 + vec2<f32>(7.0, 3.0)) * 0.4;
  return F.wind.z * (1.0 + (g * g * 2.6 - 0.7) * F.wind.w);
}
// How a whole plant standing at a place gives to the wind, per unit of a vertex's sway:
// downwind, across the wind, then the wind speed it feels and a number of its own. It has
// mass: it leans with the pressure and rocks slowly at its own rate. Anything sitting on the
// plant asks the same question and so moves with it.
fn plantLean(at: vec2<f32>, scale: f32, expo: f32, soft: f32) -> vec4<f32> {
  let id = fract(at.x * 0.137 + at.y * 0.291);
  let v = windAt(at) * expo;
  let stiff = mix(0.55, 1.35, sat(soft));
  let push = v * v * 0.011 * stiff;
  // Big plants are slow. soft (i1.w) is species stiffness; scale is mass.
  let rate = (1.35 + 0.9 * id) / (sqrt(max(scale, 0.3)) * mix(0.75, 1.25, sat(soft)));
  let rock = sin(F.time * rate + id * 40.0) * 0.45 + sin(F.time * rate * 0.37 + id * 11.0) * 0.25;
  return vec4<f32>(push * (0.75 + rock), push * 0.3 * sin(F.time * rate * 0.61 + id * 23.0), v, id);
}
fn plantShift(L: vec2<f32>, sway: f32) -> vec3<f32> {
  let d = F.wind.xy * L.x + vec2<f32>(-F.wind.y, F.wind.x) * L.y;
  return vec3<f32>(d.x * sway * 1.15, -length(d) * sway * sway * 0.28, d.y * sway * 1.15);
}
// How one vertex of a plant gives to the wind. i1.z is how exposed the plant stands. A leaf
// has no mass: on top of the plant's lean it streams downwind and flutters, faster in a
// harder blow, out of step along the plant.
fn meshPlace(in: MeshIn) -> vec3<f32> {
  var w = spinY(in.p * vec3<f32>(in.i1.x, in.i1.x * in.i1.y, in.i1.x), in.i0.w) + in.i0.xyz;
  if (in.c.w <= 0.0) { return w; }
  // Under water there is no wind. Things lean one way and then the other with the surge.
  if (in.i0.y < -0.3) {
    // Height-powered surge sway (Abyssal kelp): slow lean + faster tip flutter.
    let h = max(w.y - in.i0.y, 0.0);
    let ph = w.x * 0.031 + w.z * 0.017;
    let a = 0.028 * pow(h + in.c.w, 1.2);
    let gust = a * (sin(F.time * 0.55 + ph + h * 0.09) + 0.35 * sin(F.time * 1.35 + ph * 3.0 + h * 0.3));
    let gustZ = a * (cos(F.time * 0.42 + ph * 1.3 + h * 0.07) + 0.35 * cos(F.time * 1.15 + ph * 2.0 + h * 0.23));
    w.x += gust * 1.1;
    w.z += gustZ * 1.1;
    w.y -= (abs(gust) + abs(gustZ)) * in.c.w * 0.2;
    return w;
  }
  let L = plantLean(in.i0.xz, in.i1.x, in.i1.z, in.i1.w);
  let v = L.z;
  let id = L.w;
  let k = i32(in.n.w + 0.5);
  var along = L.x;
  var across = L.y;
  if (k == 2) {
    let ph = F.time * (2.4 + 0.65 * v) + in.p.x * 4.1 + in.p.y * 2.3 + in.p.z * 3.7 + id * 17.0 + in.i2.w * 9.0;
    // A petal is stiffer than a leaf and only trembles.
    let fl = (sin(ph) + 0.5 * sin(ph * 2.17 + 1.3)) * (0.011 + 0.014 * v) * select(1.0, 0.15, in.uv.y < -0.5);
    along += fl;
    across += fl * 0.8 * cos(ph * 0.7);
  } else if (k == 3) {
    // Crown masses: delayed, soft wiggle — not locked to leaf flutter.
    along += sin(F.time * (1.5 + 0.4 * id) + w.x * 0.7 + w.z * 0.55 + w.y) * 0.0055 * v;
    across += sin(F.time * (0.9 + 0.3 * id) + w.z * 0.4) * 0.003 * v;
  } else if (k == 1) {
    // Palm trunks barely move; frond bark (low sway verts) still ride plant lean.
    along *= 0.35; across *= 0.35;
  }
  return w + plantShift(vec2<f32>(along, across), in.c.w);
}
@vertex fn vsMesh(in: MeshIn) -> MeshV {
  var o: MeshV;
  o.world = meshPlace(in);
  o.nrm = spinY(normalize(in.n.xyz / vec3<f32>(1.0, in.i1.y, 1.0)), in.i0.w);
  // A tree's own tint is in its leaves. Its bark stays close to bark.
  // i2.w biases leaf age: young yellow-green ↔ mature deep green ↔ older brown edge.
  var tint = in.i2.rgb;
  let age = in.i2.w;
  if (in.n.w > 1.5 && in.n.w < 3.5) {
    let young = sat(1.0 - age * 1.6);
    let old = sat(age * 1.4 - 0.55);
    tint = mix(tint, tint * vec3<f32>(1.15, 1.08, 0.7), young * 0.35);
    tint = mix(tint, tint * vec3<f32>(0.95, 0.82, 0.55) + vec3<f32>(0.04, 0.02, 0.0), old * 0.4);
  }
  o.col = in.c.rgb * mix(tint, vec3<f32>(dot(tint, vec3<f32>(0.333))), select(0.0, 0.8, in.n.w > 8.5));
  o.kind = in.n.w;
  o.uv = in.uv;
  o.clip = F.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}
struct ShadowV { @builtin(position) clip: vec4<f32> }
@vertex fn vsShadowTerrain(@location(0) p: vec3<f32>) -> ShadowV {
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(p, 1.0);
  return o;
}
@vertex fn vsShadowMesh(in: MeshIn) -> ShadowV {
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(meshPlace(in), 1.0);
  return o;
}
// Leaves lying over a surface: the nearest of a scatter of leaves, each longer than it is
// wide and turned its own way. Returns its distance (a leaf's edge is near 0.45), the
// distance across it from its midrib, and two numbers that are its own.
fn leafCells(q: vec2<f32>) -> vec4<f32> {
  let c = floor(q);
  var best = 9.0;
  var id = vec2<f32>(0.0);
  var across = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = c + vec2<f32>(f32(i), f32(j));
      let h = hash22(g);
      let d = g + 0.15 + 0.7 * h - q;
      let a = h.x * 6.2832;
      let e = vec2<f32>(d.x * cos(a) + d.y * sin(a), (d.y * cos(a) - d.x * sin(a)) * 1.9);
      let l = dot(e, e);
      if (l < best) { best = l; id = h; across = e.y; }
    }
  }
  return vec4<f32>(sqrt(best), across, id);
}
@fragment fn fsMesh(in: MeshV) -> @location(0) vec4<f32> {
  if (F.clipBelow > 0.5 && in.world.y < -0.2) { discard; }
  var n = normalize(in.nrm);
  var alb = in.col;
  let Vv = normalize(F.camPos - in.world);
  let kind = i32(in.kind + 0.5);
  var leaf = 0.0;
  var gloss = 0.0;
  if (kind == 3) {
    // A leaf mass. Its surface is leaves, each lying its own way with shade between them,
    // and its outline is leaves and gaps. Through a gap the far side of the crown shows, dark.
    let back = dot(n, Vv) < 0.0;
    let rim = 1.0 - abs(dot(n, Vv));
    let dist = length(F.camPos - in.world);
    let an = abs(n);
    var pq = in.world.xz;
    if (an.x > an.y && an.x > an.z) { pq = in.world.zy; } else if (an.z > an.y) { pq = in.world.xy; }
    let near = 1.0 - smoothstep(30.0, 85.0, dist);
    // Clumps a metre across at any distance; single leaves once they are big enough to see.
    let B = leafCells(pq * 0.85 + 17.0);
    let mB = smoothstep(0.56, 0.38, B.x);
    var cover = mB;
    var tone = mix(0.42, 0.62 + 0.75 * B.w, mB);
    var tilt = (vec3<f32>(B.z, B.y + 0.5, B.w) - 0.5) * 0.8;
    if (near > 0.01) {
      let A = leafCells(pq * 3.3);
      let mA = smoothstep(0.64, 0.5, A.x);
      cover = mix(cover, max(mA, mB * 0.35), near);
      tone = mix(tone, mix(0.3, 0.72 + 0.55 * A.w, mA) * (0.72 + 0.5 * B.w), near);
      tilt = mix(tilt, (vec3<f32>(A.z, A.y + 0.5, A.w) - 0.5) * 1.5, near * mA);
      // A leaf is paler along its midrib, and each is its own green, some toward yellow.
      alb = mix(alb, alb * vec3<f32>(1.4, 1.2, 0.6), near * mA * A.z * A.z * 0.5);
      alb *= 1.0 + 0.35 * near * mA * smoothstep(0.1, 0.0, abs(A.y));
      // Only a leaf turned up to the sky shines with it; from underneath a crown is matt.
      gloss = 0.3 * near * mA * sat(n.y * 2.0);
    }
    if (cover < rim * rim * 1.25 - 0.12 + 0.35 * smoothstep(0.6, 0.85, n2(pq * 0.37 + 5.0))) { discard; }
    alb *= tone;
    if (back) { n = -n; alb *= 0.4; gloss = 0.0; }
    n = normalize(n + tilt);
  } else if (kind == 2) {
    // Leaflet: dull upper wax, pale underside, thin-film transmission — not green plastic.
    let upper = dot(n, Vv) > 0.0;
    if (!upper) {
      n = -n;
      alb = mix(alb, vec3<f32>(dot(alb, vec3<f32>(0.28, 0.58, 0.12))), 0.35) * 1.28;
    }
    let rib = smoothstep(0.26, 0.0, abs(in.uv.x));
    alb = mix(alb, alb * 1.22 + vec3<f32>(0.012, 0.018, 0.0), rib * 0.45);
    // Desaturate mature faces slightly; keep young tips warmer.
    alb = mix(alb, vec3<f32>(dot(alb, vec3<f32>(0.3, 0.55, 0.15))), 0.12 * (1.0 - in.uv.y));
    let grit = 0.88 + 0.1 * sin(in.uv.x * 11.0 + in.uv.y * 4.0) + 0.05 * sin(in.uv.y * 29.0);
    alb *= grit;
    // More transmission, less wax — leaflets read as thin film, not painted plastic.
    leaf = select(1.45, 0.78, upper);
    gloss = select(0.02, 0.11 + 0.08 * rib, upper);
    if (in.world.y < -0.1) { gloss *= 0.15; leaf *= 0.45; }
  } else {
    if (dot(n, Vv) < 0.0) { n = -n; }
    if (kind == 1) {
      // Bark by height: the scar of each fallen frond is a ring, with fibre running up between them.
      let wob = n2(vec2<f32>(in.uv.x * 7.0, in.uv.y * 0.8));
      let ring = fract(in.uv.y * 8.5 + wob * 0.6);
      let groove = smoothstep(0.0, 0.14, ring) * smoothstep(1.0, 0.86, ring);
      let fibre = n2(vec2<f32>(in.uv.x * 110.0, in.uv.y * 5.0));
      let blotch = n2(vec2<f32>(in.uv.x * 5.0 + 3.0, in.uv.y * 0.9));
      alb *= (0.5 + 0.5 * groove) * (0.78 + 0.34 * fibre) * (0.75 + 0.5 * blotch);
      alb = mix(alb, vec3<f32>(0.40, 0.42, 0.33), smoothstep(0.58, 0.85, blotch) * 0.35);
      alb *= mix(0.62, 1.0, smoothstep(0.0, 1.4, in.uv.y));
      n = normalize(n + vec3<f32>(0.0, (ring - 0.5) * 0.7 * groove, 0.0) + (fibre - 0.5) * 0.25 * cross(n, vec3<f32>(0.0, 1.0, 0.0)));
    }
    if (kind == 9) {
      // Bark of a forest tree: furrows running up the trunk, plates between them, lichen in patches.
      let wy = in.world.y * 1.3;
      let fur = n2(vec2<f32>(in.uv.x * 44.0 + n2(vec2<f32>(in.uv.x * 9.0, wy * 0.5)) * 2.0, wy));
      let plate = n2(vec2<f32>(in.uv.x * 13.0, wy * 3.1));
      let blotch = n2(vec2<f32>(in.uv.x * 5.0 + 3.0, wy * 1.1)) * 0.7 + n2(vec2<f32>(in.uv.x * 17.0, wy * 3.7)) * 0.3;
      alb *= (0.42 + 0.58 * smoothstep(0.28, 0.5, fur)) * (0.7 + 0.6 * plate);
      alb = mix(alb, vec3<f32>(0.27, 0.28, 0.24), smoothstep(0.6, 0.8, blotch) * 0.4);
      n = normalize(n + (fur - 0.5) * 0.9 * cross(n, vec3<f32>(0.0, 1.0, 0.0)));
    }
    if (kind == 8) {
      // Coral. uv.x says which: 0 branches, 1 a boulder with a maze of grooves, 2 a table, 3 soft tissue.
      let p = in.world;
      let sub = i32(in.uv.x + 0.5);
      let fine = sat(1.6 - length(F.camPos - p) * 0.22);
      let mott = n3(p * 8.0);
      let polyp = n3(p * 150.0);
      alb *= 0.84 + 0.32 * mott;
      if (sub == 0) {
        // Growing tips are pale, and each branch is studded with polyps.
        alb = mix(alb, alb * 1.3 + vec3<f32>(0.10, 0.11, 0.12), smoothstep(0.8, 1.0, in.uv.y));
        alb *= 1.0 - 0.3 * smoothstep(0.45, 0.6, polyp) * fine;
      } else if (sub == 1) {
        // A brain coral: ridges a centimetre apart winding over the whole surface.
        let q = p * 85.0;
        let g0 = n3(q);
        let maze = smoothstep(0.0, 0.16, abs(g0 - 0.5));
        alb *= mix(1.0, 0.7 + 0.34 * maze, fine);
        let gr = vec3<f32>(n3(q + vec3<f32>(0.3, 0.0, 0.0)), n3(q + vec3<f32>(0.0, 0.3, 0.0)), n3(q + vec3<f32>(0.0, 0.0, 0.3))) - g0;
        n = normalize(n - gr * sign(g0 - 0.5) * (1.0 - maze) * 2.6 * fine);
        let lump = n3(p * 5.0) - 0.5;
        alb *= 1.0 + 0.3 * lump;
      } else if (sub == 2) {
        // A table: a lawn of finger-length branchlets seen end on, paler toward the growing rim.
        let bud = n3(p * vec3<f32>(60.0, 20.0, 60.0));
        let gb = vec3<f32>(n3(p * vec3<f32>(60.0, 20.0, 60.0) + vec3<f32>(0.4, 0.0, 0.0)) - bud, 0.0, n3(p * vec3<f32>(60.0, 20.0, 60.0) + vec3<f32>(0.0, 0.0, 0.4)) - bud);
        n = normalize(n - gb * 2.4 * fine);
        alb *= 1.0 + (bud - 0.4) * 0.9 * fine;
        alb = mix(alb, alb * 1.3 + vec3<f32>(0.05, 0.05, 0.06), smoothstep(0.8, 1.0, in.uv.y));
      } else if (sub == 4) {
        // The old rock a head grows on: pitted limestone under crusts of pink algae and green turf.
        let a = n3(p * 2.2);
        let b = n3(p * 9.0 + vec3<f32>(3.1, 0.0, 1.7));
        let c = n3(p * 34.0);
        let d = n3(p * 110.0);
        let rough = a * 0.4 + b * 0.3 + c * 0.2 + d * 0.1;
        alb = mix(alb, vec3<f32>(0.44, 0.31, 0.30), smoothstep(0.42, 0.62, a * 0.6 + c * 0.4) * 0.5);
        alb = mix(alb, vec3<f32>(0.21, 0.23, 0.12), smoothstep(0.4, 0.62, b * 0.6 + d * 0.4) * smoothstep(0.1, 0.8, n.y) * 0.65);
        // Pitted all over: the hollows are dark, the knobs catch the light.
        alb *= 0.45 + 1.1 * rough * (0.75 + 0.5 * d * fine);
        let q = p * 34.0;
        let gr = vec3<f32>(n3(q + vec3<f32>(0.3, 0.0, 0.0)), n3(q + vec3<f32>(0.0, 0.3, 0.0)), n3(q + vec3<f32>(0.0, 0.0, 0.3))) - c;
        let q2 = p * 9.0 + vec3<f32>(3.1, 0.0, 1.7);
        let gr2 = vec3<f32>(n3(q2 + vec3<f32>(0.3, 0.0, 0.0)), n3(q2 + vec3<f32>(0.0, 0.3, 0.0)), n3(q2 + vec3<f32>(0.0, 0.0, 0.3))) - b;
        n = normalize(n - gr * 2.6 * sat(fine + 0.3) - gr2 * 1.8);
      } else {
        gloss = 0.35;
      }
    }
  }
  var col = shade(in.world, n, alb, select(leaf, 0.3, kind == 3), gloss);
  // Where a trunk or a rock meets the ground, the ground hides the sky from it.
  let above = in.world.y - sampleField(in.world.xz).x;
  if (leaf < 0.5 && above < 0.6) {
    col *= mix(0.6, 1.0, smoothstep(0.0, 0.6, above));
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
  // Tip sway grows with height^1.25 (Abyssal leaf sway), plus shared wind for land grass.
  let sway = pow(max(uv.y, 0.0), 1.25) * (0.28 + weed * 0.5);
  var ph = sin(F.time * 0.5 + inst.x * 0.031 + inst.y * 0.017) * 0.7
    + 0.35 * sin(F.time * 1.3 + inst.x * 0.09 + inst.y * 0.07);
  var dir = vec2<f32>(1.0, 0.35);
  if (weed < 0.5) {
    let v = windAt(inst.xy);
    let id = fract(inst.x * 0.731 + inst.y * 0.417);
    ph = v * v * 0.022 * (0.8 + 0.5 * sin(F.time * (2.2 + 1.5 * id) + id * 30.0))
      + sin(F.time * (5.0 + 3.0 * id) + id * 50.0) * 0.035 * v * uv.y;
    dir = F.wind.xy;
  }
  w.x += ph * sway * dir.x;
  w.z += ph * sway * dir.y;
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
  let mott = n2(in.world.xz * 0.35);
  // Inland meadow green; coastal sand-grass warmer; forest edge darker.
  var col = mix(vec3<f32>(0.09, 0.2, 0.045), vec3<f32>(0.36, 0.44, 0.14), in.uv.y);
  col = mix(col, mix(vec3<f32>(0.14, 0.24, 0.06), vec3<f32>(0.42, 0.48, 0.18), in.uv.y), mott * 0.45);
  if (ground < 1.6 && ground > 0.15) {
    col = mix(vec3<f32>(0.26, 0.3, 0.09), vec3<f32>(0.52, 0.48, 0.2), in.uv.y);
    col = mix(col, vec3<f32>(0.4, 0.38, 0.16), (1.0 - in.uv.y) * 0.25 * mott);
  }
  if (ground > 4.0) {
    col = mix(col, col * vec3<f32>(0.75, 0.85, 0.7), 0.35 * smoothstep(4.0, 10.0, ground));
  }
  if (in.kind > 0.5) { col = mix(vec3<f32>(0.04, 0.16, 0.09), vec3<f32>(0.18, 0.34, 0.16), in.uv.y); }
  let rib = smoothstep(0.08, 0.0, abs(in.uv.x - 0.5));
  col *= 0.8 + 0.24 * n2(in.world.xz * 1.6 + in.uv.y) - rib * 0.14;
  return vec4<f32>(shade(in.world, in.nrm, col, 1.05, 0.0), 1.0);
}

struct BirdV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
}
@vertex fn vsBird(@builtin(instance_index) ii: u32, @location(0) p: vec3<f32>, @location(1) wing: f32, @location(2) inst: vec4<f32>) -> BirdV {
  var lp = p;
  let id = f32(ii);
  // A few beats, then a glide on set wings. Each bird keeps its own time.
  let beat = smoothstep(-0.1, 0.35, sin(F.time * (0.31 + fract(id * 0.37) * 0.22) + id * 2.1));
  let ph = F.time * (5.4 + fract(id * 0.61) * 1.8) + id * 1.9;
  // The hand of the wing trails the arm through the beat, so the wing bends instead of hinging like a board.
  let arm = mix(0.1, sin(ph) * 0.55 + 0.08, beat);
  let hand = mix(-0.06, sin(ph - 1.1) * 0.6 - 0.1, beat);
  let a = abs(wing);
  let d = abs(lp.x) - 0.04;
  let inner = min(d, 0.21);
  let outer = max(d - 0.21, 0.0);
  if (a > 0.5) {
    lp.y += inner * sin(arm) + outer * sin(arm + hand);
    lp.x = sign(lp.x) * (0.04 + inner * cos(arm) + outer * cos(arm + hand));
    // The wing sweeps back a little on the upstroke.
    lp.z -= outer * 0.25 * beat * sat(cos(ph));
  }
  // Lean into the turn.
  lp.y += lp.x * sin(F.time * 0.19 + id * 1.7) * 0.42;
  let s = sin(inst.w); let c = cos(inst.w);
  let x = lp.x * s + lp.z * c;
  let z = lp.z * s - lp.x * c;
  var w = vec3<f32>(inst.x + x, inst.y + lp.y, inst.z + z);
  var o: BirdV;
  o.world = w;
  o.nrm = vec3<f32>(0.0, 1.0, 0.0);
  // White body, grey mantle, black wingtips.
  o.col = mix(mix(vec3<f32>(0.9, 0.91, 0.89), vec3<f32>(0.6, 0.63, 0.67), sat(a)), vec3<f32>(0.1), smoothstep(0.45, 0.6, abs(p.x)));
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}
@fragment fn fsBird(in: BirdV) -> @location(0) vec4<f32> {
  // Seen from below, a bird shows its pale underside, lit by the sea and the sand.
  let below = step(F.camPos.y, in.world.y);
  return vec4<f32>(shade(in.world, vec3<f32>(0.0, 1.0, 0.0), mix(in.col, vec3<f32>(0.85, 0.86, 0.85), below * 0.7), 0.0, 0.0) * (1.0 - 0.3 * below), 1.0);
}

${FISH_WGSL}
${BUG_WGSL}
fn steepQ(i: i32) -> f32 {
  let v = F.steep[i >> 2];
  let k = i & 3;
  if (k == 0) { return v.x; }
  if (k == 1) { return v.y; }
  if (k == 2) { return v.z; }
  return v.w;
}

fn waveGain(len: f32, dist: f32) -> f32 {
  // Seen from low down, a distant wave is squeezed along the line of sight until many
  // crests share one pixel. It has to fade there or it turns into ruled bands.
  let squeezed = dist * dist * 0.0011 / max(abs(F.camPos.y), 1.0);
  let minLen = max(max(dist * 0.012, 2.5), squeezed);
  return smoothstep(minLen * 0.45, minLen * 1.5, len);
}

fn seaFade(dist: f32) -> f32 {
  let reach = mix(5200.0, 1200.0, sat(F.camPos.y / 70.0));
  return smoothstep(reach, reach * 0.32, dist);
}

// The sun's mirror image spread by a rough surface. One lobe serves the body of the sea
// and the glitter on it.
fn ggxGlint(N: vec3<f32>, V: vec3<f32>, rough: f32, fres: f32) -> vec3<f32> {
  let a = max(rough, 0.002);
  let a2 = a * a;
  let H = normalize(V + F.sunDir);
  let ndh = max(dot(N, H), 0.0);
  let ndv = max(dot(N, V), 0.001);
  let ndl = max(dot(N, F.sunDir), 0.0);
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  let D = a2 / max(PI * d * d, 1e-6);
  let k = a2 * 0.5;
  let G = (ndv / (ndv * (1.0 - k) + k)) * (ndl / (ndl * (1.0 - k) + k));
  return F.sunCol * (D * G * fres * ndl) / (4.0 * ndv);
}

fn capillary(xz: vec2<f32>, dist: f32) -> vec2<f32> {
  // Wind waves at several lengths. Each band drops out once it is smaller than a pixel.
  let pix = max(dist * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.012);
  // A gust roughens the water it crosses: the dark patches that run over a bay.
  let chop = mix(0.22, 1.0, sat(F.ctrl.x)) * clamp(windAt(xz) / 4.5, 0.3, 2.2);
  // Chop rides the shared trades, blended with the place swell heading.
  let place = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  let trade = normalize(F.wind.xy + vec2<f32>(1e-5, 0.0));
  let wind = normalize(mix(place, trade, 0.55));
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
    // Offshore the swell is long and low. It only stands up where the bottom shoals,
    // so the open sea is not a row of identical steep ridges.
    let deepW = smoothstep(2.0, 9.0, D);
    if (i < 2) { As *= mix(1.0, 0.26, deepW); }
    if (i == 0) { As *= 0.4 + 0.6 * sin(dot(dir, xz) * 0.062 - F.time * 0.045); }
    if (i == 1) { As *= 0.5 + 0.5 * sin(dot(dir, xz) * 0.09 + 1.3); }
    if (i >= 6) { As *= 0.65 + 0.35 * sin(dot(dir, xz) * 0.041 + F.time * 0.03); }
    let steep = k * As * Q;
    if (steep > 0.72) { As *= 0.72 / steep; }
    let collapse = 1.0 - smoothstep(0.4, 2.4, D);
    As *= 1.0 - collapse * 0.38;
    // The spectral field owns the mid and short waves. These layers were the repeating ripples.
    if (i >= 3 && i < 6) { As *= 0.22; }
    var omega = sqrt(G * k) * spdK;
    if (i == 1) { omega = wP * (k / kP) * spdK; }
    // In open water a crest is not a ruled line. Its phase drifts over a few hundred
    // metres, so the lines bend and break. Near the beach they straighten, as they do.
    let drift = (n2(xz * 0.0041 + vec2<f32>(f32(i) * 7.3, 2.0)) + 0.5 * n2(xz * 0.011 + vec2<f32>(3.0, f32(i) * 4.1)) - 0.75) * 4.4 * deepW;
    let phase = k * dot(dir, xz) - omega * F.time + drift;
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
  let V = normalize(F.camPos - world);
  let cap = capillary(xz, distS / pow(max(V.y, 0.02), 0.6));
  let toCam = normalize(F.camPos.xz - xz + vec2<f32>(1e-4, 0.0));
  // Far out a pixel spans whole waves. Their slopes average away, and what is left
  // is a smooth surface that reflects a little higher than the horizon.
  let calm = smoothstep(1600.0, 220.0, distS);
  let N = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), S.nrm, calm * 0.92)
    + vec3<f32>(cap.x, 0.0, cap.y) * calm * 0.55
    + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.06 * (1.0 - calm * 0.5));
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
  let foam = sat(crest - 0.55) * smoothstep(0.42, 0.78, grain) * seaFade(distS) * max(F.mood.w, 0.0) * calm;
  var base = F.deepC.rgb;
  base = mix(base, vec3<f32>(0.86, 0.88, 0.86) * F.day.rgb, foam * 0.45);
  var col = mix(base, reflCol, fres * (1.0 - foam * 0.5));
  // The peak is narrow. It is scaled so a whole crest cannot clip to white.
  col += ggxGlint(N, V, max(rough, 0.004), fres) * 0.16 * (1.0 - foam);
  return airMix(col, -V, distS);
}

@fragment fn fsSky(in: SkyV) -> @location(0) vec4<f32> {
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  // From under water, whatever nothing else covers is more water.
  if (F.under > 0.5) { return vec4<f32>(waterHaze(rd.y), 1.0); }
  // Any ray that meets the sea plane is open ocean, so the water does not end at the mesh.
  if (rd.y < -0.0003 && F.camPos.y > 0.2 && F.under < 0.5) {
    let t = -F.camPos.y / rd.y;
    if (t > 1.0 && t < 250000.0) {
      let xz = F.camPos.xz + rd.xz * t;
      // The mesh covers the near water. This fills anything it does not, including the horizon.
      return vec4<f32>(farOcean(xz), 1.0);
    }
  }
  var col = skyColor(rd);
  if (F.sunTrue.w > 0.01) {
    // Stars and the moon show through whatever part of the sky the clouds leave open.
    let open = textureSampleLevel(skyMap, skySamp, skyUV(rd), 0.0).a * F.sunTrue.w;
    let sp = rd * 150.0;
    let cell = floor(sp);
    let h = hash31(cell);
    let f = fract(sp) - 0.5 - (vec3<f32>(hash31(cell + 1.7), hash31(cell + 4.3), hash31(cell + 9.1)) - 0.5) * 0.6;
    let star = smoothstep(0.972, 1.0, h) * exp(-dot(f, f) * 42.0) * (0.25 + 2.5 * fract(h * 77.0));
    col += mix(vec3<f32>(1.0, 0.85, 0.7), vec3<f32>(0.75, 0.85, 1.0), fract(h * 31.0)) * star * open * sat(rd.y * 5.0) * 0.5;
    let md = length(cross(rd, F.moon.xyz));
    if (dot(rd, F.moon.xyz) > 0.0) {
      let face = 0.8 + 0.3 * n2(rd.xz * 260.0) - 0.25 * n2(rd.zy * 90.0);
      col += vec3<f32>(0.92, 0.94, 1.0) * (smoothstep(0.0078, 0.0066, md) * face * 0.9 + exp(-md * 26.0) * 0.012) * F.moon.w * open;
    }
  }
  return vec4<f32>(col, 1.0);
}

struct WaterV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) xz0: vec2<f32>,
  @location(2) sheet: f32,
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
fn oceanRot(xz: vec2<f32>) -> vec2<f32> {
  let cs = cos(F.ctrl.w);
  let sn = sin(F.ctrl.w);
  return vec2<f32>(xz.x * cs - xz.y * sn, xz.x * sn + xz.y * cs);
}
${OCEAN_TAP_WGSL}
fn oceanSample(tex: texture_2d<f32>, xz: vec2<f32>, size: f32) -> vec3<f32> {
  return oceanTap(tex, oceanRot(xz) / size).xyz;
}
// The same evolving spectrum, read on a second incommensurate scale, so a
// 220 m tile does not repeat as a wallpaper. Both samples move with one clock.
fn shapeField(xz: vec2<f32>) -> vec3<f32> {
  let a = oceanSample(shapeTex, xz, 220.0);
  let dist = length(xz - F.camPos.xz);
  // Wide soft blend — abrupt second-tile fade shows as interference facets.
  let close = smoothstep(260.0, 40.0, dist);
  let r = vec2<f32>(xz.x * 0.82 - xz.y * 0.57, xz.x * 0.57 + xz.y * 0.82);
  let b = oceanSample(shapeTex, r, 151.0);
  return a + b * 0.26 * close;
}
// Wind chop between the swell and the capillaries, 0.45 to 5 m. This is the
// texture a person actually sees on water from a beach or a boat. Two scales of
// one tile, and it fades once a wavelength is smaller than a pixel.
fn chopField(xz: vec2<f32>, pix: f32) -> vec2<f32> {
  // Soft screen-space cutoff — hard steps read as triangular patches at grazing angles.
  let keep = 1.0 - smoothstep(0.22, 1.8, pix);
  if (keep <= 0.001) { return vec2<f32>(0.0); }
  let a = oceanSample(chopTex, xz, 24.0);
  let r = vec2<f32>(xz.x * 0.94 + xz.y * 0.34, -xz.x * 0.34 + xz.y * 0.94);
  let b = oceanSample(chopTex, r + vec2<f32>(11.0, 5.0), 15.5);
  let bs = vec2<f32>(b.y * 0.94 - b.z * 0.34, b.y * 0.34 + b.z * 0.94);
  return (a.yz + bs * 0.6) * keep;
}
// Shared cascade weights for vertex displacement and fragment normals so the lit
// surface never disagrees with the mesh at grazing views.
// x=swell geom, y=shape FFT, z=chop, w=capillary (normals / glint only).
fn waveWeights(dist: f32, foot: f32, footLong: f32, scale: f32) -> vec4<f32> {
  let open = mix(0.45, 1.0, scale);
  let swell = seaFade(dist);
  // Wider soft cutoffs — hard scale drops read as triangle facets at grazing angles.
  let shape = smoothstep(560.0, 70.0, dist) * (1.0 - smoothstep(5.0, 48.0, footLong)) * open;
  let chop = (1.0 - smoothstep(0.2, 2.1, foot)) * smoothstep(420.0, 48.0, dist) * open;
  let cap = mix(0.03, 0.26, smoothstep(60.0, 6.0, dist)) * (1.0 - smoothstep(0.1, 0.95, foot)) * open;
  return vec4<f32>(swell, shape, chop, cap);
}
// Cheap continuous height for FD normals — FFT height only. Gerstner already has
// analytic normals in seaAt; recomputing it three times per pixel stalls soft GPUs.
fn seaEta(xz: vec2<f32>, w: vec4<f32>) -> f32 {
  return shapeField(xz).x * w.y + oceanSample(chopTex, xz, 24.0).x * w.z * 0.55;
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
  let depth = max(-field.x, 0.2);
  let s = seaAt(xz, field.y, depth);
  let dist = length(xz - F.camPos.xz);
  let pix = max(dist * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let elev = max(abs(F.camPos.y), 0.15);
  let footLong = pix / max(elev / max(dist, 0.1), 0.01);
  let foot = pix / pow(elev / max(dist, 0.1), 0.6);
  let ww = waveWeights(dist, foot, footLong, field.y);
  // Large-scale geometry only. Fine FFT detail stays in fragment normals so grazing
  // views do not reveal triangle facets from high-frequency vertex displacement.
  let geom = smoothstep(1100.0, 140.0, dist);
  let graze = sat(elev / max(dist * 0.35, 1.0));
  let hfGeom = ww.y * smoothstep(0.04, 0.18, graze);
  var w = vec3<f32>(xz.x + s.disp.x * geom * ww.x, s.disp.y * mix(0.05, 1.0, geom) * mix(0.15, 1.0, ww.x), xz.y + s.disp.z * geom * ww.x);
  w.y += ripAt(xz).x * geom * graze;
  w.y += shapeField(xz).x * hfGeom;
  let bedW = sampleField(w.xz).x;
  if (bedW < 0.0) { w.y = max(w.y, min(bedW + 0.05 + dist * 0.008, 0.0)); }
  var o: WaterV;
  o.world = w;
  o.xz0 = xz;
  o.sheet = 0.0;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}

// The surf is its own surface, one vertex per stretch of the shoreline grid,
// so the sheet can climb the sand instead of being painted onto the sea plane.
@vertex fn vsShore(@location(0) uv: vec2<f32>) -> WaterV {
  let xz = SH.origin + SH.along * (uv.x * SH.nx * SH.dx) + SH.sea * (uv.y * SH.nz * SH.dx);
  let sh = shoreFetch(xz);
  let field = sampleField(xz);
  let s = seaAt(xz, field.y, max(-field.x, 0.2));
  let distSh = length(xz - F.camPos.xz);
  let pixSh = max(distSh * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let elevSh = max(abs(F.camPos.y), 0.15);
  let wwSh = waveWeights(distSh, pixSh / pow(elevSh / max(distSh, 0.1), 0.6), pixSh / max(elevSh / max(distSh, 0.1), 0.01), field.y);
  var y = s.disp.y * mix(0.2, 1.0, wwSh.x) + shapeField(xz).x * wwSh.y;
  if (sh.inside > 0.5) {
    // Stay on the sand even where the sheet is dry, so a triangle never stretches
    // from the water up across the sky. Dry fragments are discarded later.
    // In the water the sheet is the simulated surface. On the sand it sits on the
    // smooth beach, so the small bed ridges do not draw contour lines.
    // A thin film on the smooth beach. The bay is not this mesh.
    let hVis = min(sh.h, 0.26);
    y = field.x + hVis + 0.018;
  }
  var o: WaterV;
  o.world = vec3<f32>(xz.x, y, xz.y);
  o.xz0 = xz;
  o.sheet = 1.0;
  o.clip = F.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}

fn worldAt(frag: vec2<f32>, depth: f32) -> vec3<f32> {
  let uv = frag / F.res;
  let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let w = F.invViewProj * ndc;
  return w.xyz / max(w.w, 1e-4);
}


// Each raindrop that lands on water leaves a ring that widens and dies in under a second.
fn rainRings(xz: vec2<f32>) -> vec2<f32> {
  var s = vec2<f32>(0.0);
  for (var k = 0; k < 3; k++) {
    let p = xz * (1.9 + f32(k) * 1.3) + vec2<f32>(f32(k) * 17.3, f32(k) * 5.1);
    let c = floor(p);
    let h = hash22(c + vec2<f32>(f32(k) * 3.1, 1.0));
    let cyc = F.time * (1.1 + 0.7 * h.x) + h.y * 7.0;
    // Fewer cells are struck in light rain. The drop lands somewhere new each time.
    if (hash21(c + vec2<f32>(floor(cyc), 9.0)) > F.wx.x * 1.3) { continue; }
    let t = fract(cyc);
    let d = fract(p) - 0.5 - (hash22(c + vec2<f32>(floor(cyc), 4.0)) - 0.5) * 0.5;
    let r = length(d);
    let x = (r - t * 0.42) * 11.0;
    s += d / max(r, 1e-3) * sin(x * 5.5) * exp(-x * x) * (1.0 - t) * (1.0 - t);
  }
  return s * 0.5;
}

// ---- Things small enough to hang or fall in the air, drawn as instanced quads with no
// buffers behind them: each one's place comes from its index, the clock and the wind.
// Rain falls on the slant the wind gives it, splashes where it lands, and shows the size
// of the cells it falls from. Motes are the droplets and dust that only show in a sunbeam.
// Spray is torn off wherever a wave is breaking and carried downwind.
struct DropV {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) col: vec4<f32>,
  @location(2) form: f32,
  @location(3) seed: f32,
  @location(4) dist: f32,
}
const DROP_SPLASH: u32 = 20000u;
const DROP_MOTE: u32 = 40000u;
const DROP_SPRAY: u32 = 60000u;
@vertex fn vsDrops(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> DropV {
  var corner = array<vec2<f32>, 6>(vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0), vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  let c = corner[vi];
  let id = f32(ii);
  let h = vec3<f32>(hash21(vec2<f32>(id, 1.3)), hash21(vec2<f32>(id, 7.1)), hash21(vec2<f32>(id, 13.7)));
  let pxw = F.tanHalf * 2.0 / max(F.res.y, 1.0);
  var o: DropV;
  o.uv = c;
  o.seed = h.x;
  var pos = vec3<f32>(0.0);
  var a = 0.0;
  var light = F.amb.rgb;
  if (ii < DROP_SPLASH) {
    // A streak the length the drop falls while the eye's shutter is open.
    let box = vec3<f32>(22.0, 14.0, 22.0);
    let vel = vec3<f32>(F.wind.x * F.wind.z * 0.8, -(7.5 + 2.5 * h.y), F.wind.y * F.wind.z * 0.8);
    let w = (fract((h * box + vel * F.time - F.camPos) / box) - 0.5) * box + F.camPos;
    let vd = normalize(vel);
    let side = normalize(cross(vd, w - F.camPos));
    let d = length(w - F.camPos);
    let wid = max(0.003, d * pxw * 0.6);
    pos = w + vd * c.y * 0.26 + side * c.x * wid;
    let cell = smoothstep(0.25, 0.7, n2(w.xz * 0.0016 + F.windOff.xy * 1.6));
    a = 0.8 * (0.003 / wid) * (0.35 + 0.65 * cell) * step(max(sampleField(w.xz).x, 0.0), w.y) * smoothstep(0.5, 1.6, d);
    light = F.amb.rgb * 1.3 + F.sunCol * (0.3 + 1.5 * pow(0.5 + 0.5 * dot(normalize(w - F.camPos), F.sunDir), 6.0));
    o.form = 0.0;
    o.dist = d;
  } else if (ii < DROP_MOTE) {
    // The crown a drop throws up where it lands, gone in a fifth of a second.
    let cyc = F.time * 4.5 + h.x * 10.0;
    let life = fract(cyc);
    let at = F.camPos.xz + (hash22(vec2<f32>(id, floor(cyc))) - 0.5) * 20.0;
    let g = max(sampleField(at).x, 0.0);
    let toE = normalize(F.camPos - vec3<f32>(at.x, g, at.y));
    let side = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), toE));
    pos = vec3<f32>(at.x, g, at.y) + side * c.x * (0.012 + 0.035 * life) + vec3<f32>(0.0, (c.y * 0.5 + 0.5) * (0.012 + 0.07 * sin(life * 3.14159)), 0.0);
    a = (1.0 - life) * 0.5;
    light = F.amb.rgb * 1.2 + F.sunCol * 0.4;
    o.form = 1.0;
    o.dist = length(pos - F.camPos);
  } else if (ii < DROP_SPRAY) {
    let box = vec3<f32>(9.0, 5.0, 9.0);
    let t = F.time;
    let drift = vec3<f32>(F.wind.x, 0.0, F.wind.y) * windAt(F.camPos.xz) * 0.22 * t
      + vec3<f32>(sin(t * 0.7 + h.x * 40.0), sin(t * 0.5 + h.y * 40.0) * 0.6 - t * 0.03, cos(t * 0.6 + h.z * 40.0)) * 0.14;
    let w = (fract((h * box + drift - F.camPos) / box) - 0.5) * box + F.camPos;
    let d = length(w - F.camPos);
    let r = 0.0007 + 0.0012 * h.z;
    let rad = max(r, d * pxw * 0.6);
    pos = w + (F.right * c.x + F.upv * c.y) * rad;
    // A mote is a point of forward-scattered sunlight or nothing.
    let mu = dot(normalize(w - F.camPos), F.sunDir);
    let lit = sunVis(w) * cloudShade(w.xz, w.y) * step(max(sampleField(w.xz).x, 0.0), w.y);
    light = F.sunCol * lit * (0.2 + 5.5 * pow(0.5 + 0.5 * mu, 8.0))
      * mix(vec3<f32>(1.0), vec3<f32>(1.2, 0.95, 0.75), sat(F.day.w));
    a = min(1.0, (r * r) / (rad * rad)) * (0.7 + 0.45 * sat(F.wx.w))
      * smoothstep(0.02, 0.2, dot(light, vec3<f32>(0.33)));
    o.form = 1.0;
    o.dist = d;
  } else {
    // A lattice of places fixed to the sea, a window of it around the eye.
    let k = ii - DROP_SPRAY;
    let cellc = floor(F.camPos.xz / 2.4) + vec2<f32>(f32(k % 48u), f32(k / 48u)) - 24.0;
    let hh = hash22(cellc);
    let home = (cellc + hh) * 2.4;
    let fld = sampleField(home);
    let deep = max(-fld.x, 0.2);
    var force = 0.0;
    var top = 0.0;
    if (fld.x < 0.25 && fld.x > -3.2) {
      let S = seaAt(home, fld.y, deep);
      force = sat(S.brk * 1.6) * smoothstep(2.8, 0.4, deep);
      top = S.disp.y;
      let sh = shoreFetch(home);
      if (sh.inside > 0.5) { force = max(force, sat(sh.foam * 1.3) * smoothstep(0.4, 1.6, length(sh.vel))); top = max(top, sh.eta); }
    }
    let life = fract(F.time * (0.48 + 0.35 * hh.x) + hh.y * 9.0);
    let local = windAt(home);
    let blow = clamp(local / 5.0, 0.25, 2.8);
    let humid = sat(F.wx.w);
    let gold = sat(F.day.w);
    // Low throw: rises then falls while drifting on the shared trades — irregular height per puff.
    let rise = (0.12 + 0.9 * pow(life, 0.5) * (0.7 + 0.5 * hh.y)) * (0.55 + 0.45 * blow) - 0.85 * life * life;
    let w = vec3<f32>(home.x, max(top, 0.0) + rise, home.y)
      + vec3<f32>(F.wind.x, 0.0, F.wind.y) * local * 0.55 * life * 1.6
      + vec3<f32>(0.0, sin(life * 9.0 + hh.x * 20.0) * 0.04, 0.0);
    let rad = (0.22 + 0.95 * life) * (0.65 + 0.7 * hh.x) * (0.85 + 0.25 * humid);
    pos = w + (F.right * c.x + F.upv * c.y) * rad * step(0.015, force);
    let mu = dot(normalize(w - F.camPos), F.sunDir);
    // Backlit spray glows at golden hour; otherwise a soft grey veil.
    let back = pow(sat(mu), 4.0);
    light = F.amb.rgb * 0.55
      + F.sunCol * sunVis(w) * cloudShade(w.xz, 0.0)
        * (0.15 + 1.35 * back + 2.2 * back * gold)
        * mix(vec3<f32>(1.0), vec3<f32>(1.3, 0.95, 0.7), gold);
    o.dist = length(w - F.camPos);
    a = force * sin(life * 3.14159) * (0.18 + 0.14 * humid) * blow
      * smoothstep(1.2, 8.0, o.dist) * smoothstep(55.0, 12.0, o.dist);
    o.form = 2.0;
  }
  o.col = vec4<f32>(airMix(light, normalize(pos - F.camPos), o.dist), a * (1.0 - F.under));
  o.clip = F.viewProj * vec4<f32>(pos, 1.0);
  return o;
}
@fragment fn fsDrops(in: DropV) -> @location(0) vec4<f32> {
  var a = in.col.a;
  let r = length(in.uv);
  if (in.form < 0.5) {
    a *= (1.0 - abs(in.uv.x)) * (1.0 - in.uv.y * in.uv.y);
  } else if (in.form < 1.5) {
    a *= smoothstep(1.0, 0.25, r);
  } else {
    // A puff is torn and uneven, and it does not cut a hard line where it meets the sea or a rock.
    let n = n2(in.uv * 1.7 + vec2<f32>(in.seed * 31.0, in.seed * 17.0)) * 0.6 + n2(in.uv * 4.3 + vec2<f32>(in.seed * 7.0, 3.0)) * 0.4;
    a *= smoothstep(1.0, 0.15, r) * smoothstep(0.2, 0.75, n);
    let dep = textureLoad(sceneDepth, vec2<i32>(in.clip.xy), 0);
    if (dep < 0.99999) { a *= sat((length(worldAt(in.clip.xy, dep) - F.camPos) - in.dist) / 0.8 + 0.3); }
  }
  if (a < 0.003) { discard; }
  return vec4<f32>(tonemap(in.col.rgb), a);
}

// ---- The air between the eye and what it sees, marched at half resolution: mist lying
// in the low ground, damp air under the trees, spray drifting off the surf, rain falling
// from distant cloud. Every step asks the shadow maps whether the sun reaches it, so light
// comes through gaps in the fronds as shafts and stops where a trunk or a hill is in the way.
fn sunVis(p: vec3<f32>) -> f32 {
  let cn = F.nearVP * vec4<f32>(p, 1.0);
  if (max(abs(cn.x), abs(cn.y)) < 0.97) {
    return textureSampleCompareLevel(shadowNear, shadowSamp, vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5), clamp(cn.z, 0.0, 1.0));
  }
  let c = F.shadowVP * vec4<f32>(p, 1.0);
  let uv = vec2<f32>(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 1.0; }
  return textureSampleCompareLevel(shadowMap, shadowSamp, uv, clamp(c.z, 0.0, 1.0));
}
// Metres of a path that count, through a layer thinning upward as exp(-h/H), for a piece of
// the path seg long that runs between heights ya and yb above the ground. Worked out rather
// than sampled, so a long step through a shallow layer of mist cannot hit or miss it.
fn airLayer(H: f32, ya: f32, yb: f32, seg: f32) -> f32 {
  let lo = max(min(ya, yb), 0.0);
  let hi = max(max(ya, yb), 0.0);
  let dy = hi - lo;
  if (dy < 0.02 * H) { return seg * exp(-lo / H); }
  return seg * H / dy * (exp(-lo / H) - exp(-hi / H));
}
// How much water hangs in the air along a piece of a ray, as optical depth. p is a point on
// the piece, y0 and y1 the heights of its ends.
fn airTau(p: vec3<f32>, fld: vec2<f32>, y0: f32, y1: f32, seg: f32) -> f32 {
  let g = max(fld.x, 0.0);
  let ya = y0 - g;
  let yb = y1 - g;
  let q = (p.xz - F.windOff.zw * 0.5) * 0.017;
  let n = n2(q) * 0.62 + n2(q * 3.3 + vec2<f32>(5.0, 1.0)) * 0.38;
  // Mist banks in hollows; thicker on humid mornings (wx.z + humidity).
  let mistAmt = sat(F.wx.z + F.wx.w * 0.35);
  var d = mistAmt * 0.034 * smoothstep(0.22, 0.78, n) * (1.0 - smoothstep(12.0, 52.0, g)) * airLayer(2.0 + 10.0 * n, ya, yb, seg);
  // Damp air near the ground, thickest under forest.
  let wood = smoothstep(1.9, 4.4, fld.x) * smoothstep(-0.62, -0.12, forestNoise(p.xz));
  d += F.wx.w * F.wx.w * (0.0007 + 0.0032 * wood) * airLayer(24.0, ya, yb, seg);
  // Low ocean mist over warm humid water — not a fog wall.
  let sea = smoothstep(-1.8, -0.05, fld.x) * smoothstep(0.9, -0.2, fld.x);
  d += sea * F.wx.w * 0.0011 * (0.45 + 0.55 * n) * airLayer(4.5, ya, yb, seg) * (1.0 - sat(F.sunTrue.w));
  // Spray optical depth over energetic surf.
  let surf = smoothstep(-2.6, -0.4, fld.x) * smoothstep(1.4, 0.1, fld.x) * fld.y;
  d += surf * surf * 0.00055 * F.wind.z * (0.4 + n) * airLayer(3.8, ya, yb, seg);
  // Rain hangs in grey curtains under the heavier cells.
  d += F.wx.x * 0.0022 * smoothstep(0.3, 0.75, n2(p.xz * 0.0016 + F.windOff.xy * 1.6)) * step(p.y, 900.0) * seg;
  return d;
}
@fragment fn fsAir(in: SkyV) -> @location(0) vec4<f32> {
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  let uv = vec2<f32>(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let px = vec2<i32>(clamp(uv * F.res, vec2<f32>(0.0), F.res - 1.0));
  let dep = textureLoad(sceneDepth, px, 0);
  var far = 4000.0;
  if (dep < 0.99999) { far = length(worldAt(vec2<f32>(px) + 0.5, dep) - F.camPos); }
  let jit = fract(52.9829189 * fract(dot(in.clip.xy, vec2<f32>(0.06711056, 0.00583715))));
  let mu = dot(rd, F.sunDir);
  var L = vec3<f32>(0.0);
  var T = 1.0;
  if (F.under > 0.5) {
    // Under water the surface breaks the sun into moving rays, seen where the water
    // scatters them toward the eye. They lean with the refracted sun and fade with depth.
    if (rd.y > 1e-4) { far = min(far, -F.camPos.y / rd.y); }
    let end = min(far, 15.0);
    let sr = normalize(vec3<f32>(F.sunDir.x * 0.75, sqrt(1.0 - 0.5625 * (1.0 - F.sunDir.y * F.sunDir.y)), F.sunDir.z * 0.75));
    let lit = cloudShade(F.camPos.xz, 0.0);
    let ph = 0.25 + 1.5 * pow(0.5 + 0.5 * dot(rd, sr), 4.0);
    for (var i = 0; i < 12; i++) {
      let t = end * (f32(i) + jit) / 12.0;
      let p = F.camPos + rd * t;
      let deep = max(-p.y, 0.0);
      let sxz = p.xz + sr.xz * (deep / sr.y);
      let ray = smoothstep(0.5, 0.82, n2(sxz * 1.5 + vec2<f32>(F.time * 0.22, 0.0)) * 0.6 + n2(sxz * 4.1 - vec2<f32>(0.0, F.time * 0.35)) * 0.4);
      L += F.sunCol * exp(-deep * vec3<f32>(0.19, 0.06, 0.05)) * ray * ph * lit * exp(-t * 0.07) * (end / 12.0) * 0.07;
    }
    return vec4<f32>(L, 1.0);
  }
  if (rd.y < -1e-4) { far = min(far, F.camPos.y / -rd.y); }
  // God rays from cloud-shadow boundaries — not uniform radial streaks.
  let dayK = smoothstep(0.0, 0.1, F.sunTrue.y);
  let gold = sat(F.day.w);
  let ph = 0.2 + 1.35 * pow(0.5 + 0.5 * mu, 5.0) + 8.0 * pow(0.5 + 0.5 * mu, 48.0);
  let amb = F.amb.rgb * mix(0.85, 0.7, gold);
  let cloud0 = cloudShade(F.camPos.xz, F.camPos.y);
  let nearSun = pow(sat(mu * 0.5 + 0.5), 10.0);
  let samples = select(8, 12, F.cloudOct >= 3.5);
  let nearEnd = min(far, 48.0);
  let dn = nearEnd / f32(samples);
  for (var i = 0; i < 12; i++) {
    if (i >= samples) { break; }
    let p = F.camPos + rd * (dn * (f32(i) + jit));
    let a = 1.0 - exp(-airTau(p, sampleField(p.xz), F.camPos.y + rd.y * dn * f32(i), F.camPos.y + rd.y * dn * f32(i + 1), dn));
    let lit = (sunVis(p - rd * (dn * 0.333)) + sunVis(p) + sunVis(p + rd * (dn * 0.333))) / 3.0;
    let cP = cloudShade(p.xz, p.y);
    // Beams where the ray crosses a lit/shadow boundary in the cloud field.
    let gap = sat((cP - cloud0) * 4.8) + sat((cloud0 - cP) * 2.8) * 0.45;
    let humid = sat(F.wx.w);
    let shaft = lit * (cP * 0.35 + gap * 2.35) * (0.3 + 1.7 * nearSun) * (0.55 + 0.9 * humid);
    let sunShaft = F.sunCol * mix(vec3<f32>(1.0), vec3<f32>(1.28, 0.92, 0.62), gold) * shaft * ph * dayK;
    L += T * a * (sunShaft + amb);
    T *= 1.0 - a;
  }
  if (far > 48.0) {
    let span = min(far, 1500.0) - 48.0;
    let farN = select(5, 8, F.cloudOct >= 3.5);
    for (var i = 0; i < 8; i++) {
      if (i >= farN) { break; }
      let t0 = 48.0 + span * f32(i * i) / 64.0;
      let t1 = 48.0 + span * f32((i + 1) * (i + 1)) / 64.0;
      let p = F.camPos + rd * mix(t0, t1, jit);
      let a = 1.0 - exp(-airTau(p, sampleField(p.xz), F.camPos.y + rd.y * t0, F.camPos.y + rd.y * t1, t1 - t0));
      let cP = cloudShade(p.xz, p.y);
      let gap = sat(abs(cP - cloud0) * 3.2);
      let shaft = (cP * 0.35 + gap * 1.6) * (0.4 + 1.2 * nearSun);
      L += T * a * (F.sunCol * shaft * ph * dayK + amb);
      T *= 1.0 - a;
    }
  }
  return vec4<f32>(L, T);
}
// The air pass read back at full resolution. Four taps hide the grain of its jittered steps.
fn airOver(col: vec3<f32>, frag: vec2<f32>) -> vec3<f32> {
  let uv = frag / F.res;
  let e = 1.5 / F.res;
  let a = (textureSampleLevel(airTex, reflSamp, uv + vec2<f32>(e.x, e.y * 0.4), 0.0) + textureSampleLevel(airTex, reflSamp, uv + vec2<f32>(-e.x * 0.4, e.y), 0.0)
    + textureSampleLevel(airTex, reflSamp, uv - vec2<f32>(e.x, e.y * 0.4), 0.0) + textureSampleLevel(airTex, reflSamp, uv - vec2<f32>(-e.x * 0.4, e.y), 0.0)) * 0.25;
  return col * a.a + a.rgb;
}

// The finished scene, with the air over it, to the screen. It writes the scene's depth
// so that what is drawn afterwards, the water and the insects, is hidden by the land.
struct BlitOut {
  @builtin(frag_depth) d: f32,
  @location(0) c: vec4<f32>,
}
@fragment fn fsBlit(in: SkyV) -> BlitOut {
  let px = vec2<i32>(in.clip.xy);
  // Under water the eye opens up: the same scene is exposed a little brighter.
  var col = tonemap(airOver(textureLoad(sceneTex, px, 0).rgb, in.clip.xy) * (1.0 + 0.3 * F.under));
  if (F.under > 0.5) {
    col *= mix(1.0, 0.72, sat(length(in.clip.xy / F.res - 0.5) * 1.35));
  }
  var o: BlitOut;
  o.d = textureLoad(sceneDepth, px, 0);
  o.c = vec4<f32>(col, 1.0);
  return o;
}

@fragment fn fsWater(in: WaterV) -> @location(0) vec4<f32> {
  let sh0 = shoreFetch(in.xz0);
  let shoreD = in.xz0 - SH.origin;
  let shoreOff = dot(shoreD, SH.sea) / SH.dx / max(SH.nz, 1.0);
  // Only water that has climbed onto the sand. Drawing this grid over the bay
  // turns a few wet cells into a huge translucent facet.
  let drawSheet = sh0.inside > 0.5 && sh0.bed > -0.025 && (sh0.h > 0.012 || sh0.foam > 0.08);
  if (in.sheet > 0.5 && !drawSheet) { discard; }
  if (in.sheet < 0.5 && drawSheet) { discard; }
  let field = sampleField(in.xz0);
  let scale = field.y;
  let bed = field.x;
  let depthW = max(-bed, 0.2);
  let S = seaAt(in.xz0, scale, depthW);
  let distS = length(in.world - F.camPos);
  let rip = ripAt(in.xz0);
  let cap = capillary(in.xz0, distS);
  let ocn = shapeField(in.xz0);
  let gl = oceanSample(glintTex, in.xz0, 4.0);
  let pix = max(distS * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let open = mix(0.4, 1.0, scale);
  let elev = max(abs(F.camPos.y - in.world.y), 0.08);
  let foot = pix / pow(elev / max(distS, 0.1), 0.6);
  let footLong = pix / max(elev / max(distS, 0.1), 0.01);
  let ww = waveWeights(distS, foot, footLong, scale);
  let chop = chopField(in.xz0, foot) * ww.z;
  // Analytical Gerstner + FFT slopes, weighted the same way as the vertex height.
  var N = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), S.nrm, ww.x)
    + vec3<f32>(-ocn.y * ww.y + rip.y * ww.y - chop.x + cap.x * ww.w, 0.0,
                -ocn.z * ww.y + rip.z * ww.y - chop.y + cap.y * ww.w));
  // Finite-difference refine on FFT height — continuous across triangle edges.
  let grazeN = sat(elev / max(distS * 0.32, 1.0));
  let eN = max(mix(0.16, 0.85, sat(foot * 0.65)), pix * 2.2);
  let h0 = seaEta(in.xz0, ww);
  let hx = seaEta(in.xz0 + vec2<f32>(eN, 0.0), ww);
  let hz = seaEta(in.xz0 + vec2<f32>(0.0, eN), ww);
  let Nfd = normalize(vec3<f32>((h0 - hx) / eN, 1.0, (h0 - hz) / eN));
  // Prefer FD normals when the mesh footprint is large; ease off when looking flat-on.
  let fdK = (0.28 + 0.52 * sat(foot * 1.15)) * sat(ww.y + ww.z) * mix(0.55, 1.0, grazeN);
  N = normalize(mix(N, Nfd, fdK));
  if (F.wx.x > 0.01 && pix < 0.05) {
    let rr = rainRings(in.xz0) * (1.0 - smoothstep(0.02, 0.05, pix));
    N = normalize(N + vec3<f32>(rr.x, 0.0, rr.y) * ww.w);
  }
  let sh = shoreFetch(in.xz0);
  var bore = 0.0;
  if (sh.inside > 0.5 && sh.bed > -1.5 && (in.sheet > 0.5 || sh.bed < 0.05)) {
    let e = 0.48;
    let spx = shoreFetch(in.xz0 + vec2<f32>(e, 0.0));
    let smx = shoreFetch(in.xz0 - vec2<f32>(e, 0.0));
    let spz = shoreFetch(in.xz0 + vec2<f32>(0.0, e));
    let smz = shoreFetch(in.xz0 - vec2<f32>(0.0, e));
    if (spx.inside > 0.5 && smx.inside > 0.5 && spz.inside > 0.5 && smz.inside > 0.5) {
      let dmn = in.xz0 - SH.origin;
      let fi = dot(dmn, SH.along) / SH.dx;
      let fj = dot(dmn, SH.sea) / SH.dx;
      let brim = smoothstep(2.0, 20.0, fi) * smoothstep(SH.nx - 2.0, SH.nx - 20.0, fi) * smoothstep(2.0, 14.0, fj);
      let onBeach = smoothstep(-0.15, 0.1, sh.bed) * in.sheet;
      let slopeLen = length(vec2<f32>(spx.eta - smx.eta, spz.eta - smz.eta)) / (e * 2.0);
      // Tilt only where the simulated surface is actually sloped, and fade out
      // along the grid, not along a contour of the beach.
      let take = smoothstep(0.012, 0.1, slopeLen) * (1.0 - smoothstep(0.58, 0.82, shoreOff)) * brim;
      let dhx = mix(spx.eta - smx.eta, spx.h - smx.h, onBeach);
      let dhz = mix(spz.eta - smz.eta, spz.h - smz.h, onBeach);
      // The surge keeps the wind ripples on its back. Without them it is a sheet of glass.
      let sn = normalize(vec3<f32>(-dhx / (e * 2.0) + N.x, 1.0, -dhz / (e * 2.0) + N.z));
      N = normalize(mix(N, sn, take));
      // A front this steep in water this shallow has already broken: it is a wall of
      // air and water, not a clear face.
      bore = smoothstep(0.16, 0.42, slopeLen) * smoothstep(-1.6, -0.5, sh.bed) * (1.0 - smoothstep(0.58, 0.82, shoreOff)) * brim;
    }
  }
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.02);
  // Schlick, F0 for water against air (IOR 1.333).
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let reflK = sat(F.mat.y);
  // Microfacet roughness rises with chop scale so the sea is not polished glass.
  let rough = clamp(0.012 + sat(F.mat.x) * 0.06 + 0.01 * scale, 0.008, 0.08);
  let dir0 = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  let alongW = dot(in.xz0, dir0);
  let acrossW = dot(in.xz0, vec2<f32>(-dir0.y, dir0.x));
  let lace = n2(vec2<f32>(alongW * 0.42 - F.time * 0.55, acrossW * 0.16));
  let lace2 = n2(vec2<f32>(acrossW * 0.85 + 4.0, alongW * 0.2 + F.time * 0.12));
  let crest = smoothstep(0.58, 0.2, S.jac) * smoothstep(0.2, 0.65, scale);
  let crestFoam = sat(max(crest, S.brk * 0.65) - 0.5) * smoothstep(0.3, 0.72, lace * 0.62 + lace2 * 0.38);
  let breaker = S.brk * smoothstep(2.6, 0.3, max(-bed, 0.0)) * smoothstep(0.34, 0.72, lace);
  var foam = foamCover(in.xz0, sat(max(crestFoam * 0.45, breaker * (0.55 + 0.45 * lace2))) * max(F.mood.w, 0.0), foot);
  var onSheet = 0.0;
  if (sh.inside > 0.5 && sh.foam > 0.02 && shoreOff < 0.78) {
    // Foam follows the shallow-water velocity: tongues along flow, holes across it.
    let spd = length(sh.vel);
    let dir = sh.vel / max(spd, 0.15);
    let alongF = shoreFetch(in.xz0 - dir * (0.55 + 0.35 * sat(spd))).foam;
    let acrossF = shoreFetch(in.xz0 + vec2<f32>(-dir.y, dir.x) * 0.48).foam;
    let backF = shoreFetch(in.xz0 + dir * 0.5).foam;
    let tongue = sat(sh.foam * 1.35 - acrossF * 0.85);
    let trail = sat(min(sh.foam, alongF * 1.2));
    // Backwash: retreating flow leaves sparse fragments behind the front.
    let retreat = sat(-dot(dir, SH.sea)) * sat(backF * 0.9 - sh.foam * 0.35);
    let grain = n2(in.xz0 * 5.8 + dir * F.time * 0.35 + vec2<f32>(2.0, 0.0));
    let adv = sat(max(tongue, trail * 0.75) * mix(0.7, 1.0, grain) + retreat * 0.45 * grain);
    let band = 1.0 - smoothstep(0.5, 0.78, shoreOff);
    let patches = foamCover(in.xz0 + dir * (F.time * 0.08), adv * 0.78, foot);
    foam = sat(mix(foam * (1.0 - band * 0.92), patches, band));
    onSheet = band * patches;
  }

  if (bore > 0.01) {
    let churn = n2(in.xz0 * 2.3 + sh.vel * F.time * 0.4) * 0.6 + n2(in.xz0 * 7.0 - vec2<f32>(F.time * 0.7, 0.0)) * 0.4;
    foam = max(foam, sat(bore * (0.55 + 0.9 * churn)));
  }
  if (in.sheet > 0.5 && sh.bed < -0.02) { discard; }

  if (F.under > 0.5) {
    let lit0 = cloudShade(in.xz0, 0.0);
    let I = normalize(in.world - F.camPos);
    // Snell window (Abyssal): soft open edge, sun glitter in the refracted disc.
    let ci = sat(dot(I, -N));
    let kWin = 1.0 - 1.769 * (1.0 - ci * ci);
    let win = smoothstep(0.0, 0.22, kWin);
    let rr = refract(I, -N, 1.333);
    let sd = max(dot(normalize(rr + vec3<f32>(1e-5)), F.sunDir), 0.0);
    let fr = pow(1.0 - sqrt(max(kWin, 0.0)), 5.0);
    let sky = skyColor(normalize(rr)) * vec3<f32>(0.85, 0.95, 1.05)
      * (0.85 + 0.35 * lit0)
      + F.sunCol * (pow(sd, 48.0) * 0.9 + pow(sd, 280.0) * 6.0) * (1.0 - fr);
    let down = reflect(I, -N);
    let deep = max(-bed, 0.2);
    let reachB = deep / max(-down.y, 0.05);
    let sandC = vec3<f32>(0.40, 0.58, 0.52) * F.day.rgb * mix(0.5, 1.0, lit0) * exp(W_KD * (-deep));
    let refl = waterFogIn(in.world, down, min(reachB, 60.0)) * 1.05;
    var col = mix(mix(refl, sandC, exp(-reachB * 0.09) * 0.65), sky, win);
    col = applyFog(col, in.world);
    col = mix(col, vec3<f32>(0.75, 0.78, 0.76) * F.day.rgb, foam * 0.28);
    return vec4<f32>(tonemap(airOver(col, in.clip.xy) * 1.25), 1.0);
  }

  let frag = in.clip;
  let px = vec2<i32>(frag.xy);
  let dep = textureLoad(sceneDepth, px, 0);
  // Land, trees and boats in front of this fragment stay as the blit left them.
  // The sheet is allowed to draw over the sand it is running across.
  let swash = sh.inside > 0.5 && sh.bed > -0.12 && (sh.h > 0.018 || sh.foam > 0.2);
  if (!swash && dep < 0.999 && dep < frag.z - 0.00015) { discard; }

  // Reflection uses a filtered macro normal — glint capillaries stay in the specular lobe only.
  let lost = smoothstep(0.22, 1.6, foot) * mix(0.45, 1.0, scale);
  let toCam = normalize(F.camPos.xz - in.xz0 + vec2<f32>(1e-4, 0.0));
  var reflN = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), N, 1.0 - 0.55 * lost)
    + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.06 * lost);
  // Near, a little wind-sea slope; never the capillary glint map (that creates triangular sparkle).
  let nearRefl = smoothstep(110.0, 25.0, distS) * ww.y;
  reflN = normalize(reflN + vec3<f32>(-ocn.y, 0.0, -ocn.z) * 0.35 * nearRefl);
  var reflCol = skyReflect(reflect(-V, reflN));
  let Rd = reflect(-V, reflN);
  if (F.reflOn > 0.5) {
    var uv = frag.xy / F.res;
    let tv = normalize(in.xz0 - F.camPos.xz + vec2<f32>(1e-4, 0.0));
    let rn = reflN.xz;
    let nt = dot(rn, tv);
    let ns = dot(rn, vec2<f32>(-tv.y, tv.x));
    let graze = sat(abs(V.y) * 1.4 + 0.05);
    // At grazing, shrink UV warps so planar reflections do not streak into facets.
    let warpK = reflK * mix(0.35, 1.0, graze);
    uv.y -= clamp(nt / max(F.tanHalf, 0.2), -0.16, 0.16) * warpK;
    uv.x += clamp(ns * graze / max(F.tanHalf * F.aspect, 0.2), -0.06, 0.06) * warpK;
    uv = clamp(uv, vec2<f32>(0.004), vec2<f32>(0.996));
    let conf = sat(graze * 1.8) * (1.0 - smoothstep(0.92, 0.998, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0));
    let blur = 0.008 + rough * 0.06 + lost * 0.02;
    let c0 = textureSampleLevel(reflTex, reflSamp, uv, 0.0).rgb;
    let c1 = textureSampleLevel(reflTex, reflSamp, uv + vec2<f32>(blur * 0.15, blur), 0.0).rgb;
    let c2 = textureSampleLevel(reflTex, reflSamp, uv - vec2<f32>(blur * 0.1, blur * 1.7), 0.0).rgb;
    let rs = (c0 + c1 + c2) * 0.333;
    reflCol = mix(reflCol, rs, conf * (1.0 - foam * 0.65) * reflK);
  }

  var base = F.deepC.rgb;
  if (dep < 0.9995) {
    var look = in.clip.xy;
    var sp = worldAt(look, dep);
    var d = in.world.y - sp.y;
    let sheet = sh.inside > 0.5 && sh.bed > -0.4 && sh.h < 0.85 && sh.h > 0.006;
    if (sheet) {
      let bend = N.xz * sh.h * 5.0 * F.mat.z;
      let shifted = clamp(look + bend, vec2<f32>(1.0), F.res - vec2<f32>(1.0));
      // The sand is a few centimetres under this pixel. Grazing view does not
      // turn that into a metre of water, or the sheet goes milky.
      let depth = max(sh.h, 0.004) / max(ndv, 0.62);
      let sigma = vec3<f32>(0.55, 0.09, 0.045) * max(F.deepC.w, 0.08);
      let trans = exp(-depth * sigma);
      let sceneCol = textureLoad(sceneTex, vec2<i32>(shifted), 0).rgb;
      let scatter = mix(F.shalC.rgb, F.deepC.rgb, sat(sh.h / 0.45));
      base = sceneCol * trans + scatter * (1.0 - trans);
    } else if (d > -0.05) {
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
  // The seabed mesh stops at the edge of the map. The water goes deep before that,
  // so the last row of triangles is never seen through it.
  let fu = (in.xz0 - vec2<f32>(ORIGIN)) / (SPAN * 2.0) - 0.5;
  base = mix(base, F.deepC.rgb, smoothstep(0.56, 0.78, max(abs(fu.x), abs(fu.y)) * 2.0));
  // The last few centimetres of water are a film over sand, not a mirror with an edge.
  var film = 1.0;
  if (dep < 0.9995 && in.sheet < 0.5) {
    film = smoothstep(0.0, 0.09, in.world.y - worldAt(in.clip.xy, dep).y);
  }
  let foamCol = mix(vec3<f32>(0.68, 0.74, 0.72), vec3<f32>(0.9, 0.92, 0.9), sat(foam)) * F.day.rgb;
  base = mix(base, foamCol, foam * mix(0.26, 0.58, onSheet));

  // On the sheet the wash is whitewater, not a mirror. The open sea keeps its Fresnel.
  let sheetK = smoothstep(0.5, 1.0, in.sheet);
  var fresK = fres * reflK * (1.0 - foam * mix(0.45, 0.85, onSheet)) * film;
  // The film on the sand is the water and the foam, not a mirror of the horizon.
  fresK = mix(fresK, fresK * 0.6, sheetK);
  var col = mix(base, reflCol, fresK);
  // Capillary glitter stays in the specular lobe only, gated by screen-space keep.
  let foamK = 1.0 - foam * 0.85;
  let glK = open * ww.w;
  var spec = ggxGlint(normalize(N + vec3<f32>(-gl.y, 0.0, -gl.z) * glK), V, 0.007, fres * reflK);
  if (pix > 0.04 && glK > 0.02) {
    let cell = floor(in.xz0 / pix);
    for (var k = 0u; k < 4u; k++) {
      let j = vec2<f32>(
        hash21(cell + vec2<f32>(f32(k) * 3.1, 1.7)),
        hash21(cell + vec2<f32>(8.2, f32(k) * 2.7))
      );
      let g2 = oceanSample(glintTex, in.xz0 + (j - 0.5) * pix * 2.0, 4.0);
      let Nk = normalize(N + vec3<f32>(-g2.y, 0.0, -g2.z) * glK);
      spec = max(spec, ggxGlint(Nk, V, 0.007, fres * reflK));
    }
  }
  let lit = sunShadow(in.world);
  col += spec * foamK * lit * lit;
  let crestLight = pow(sat(1.0 - N.y), 1.6) * sat(S.disp.y * 0.8) * max(dot(F.sunDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0);
  col += F.sunCol * vec3<f32>(0.45, 0.62, 0.55) * crestLight * 0.12;

  col = airMix(col, -V, distS);
  col *= mix(0.58, 1.0, lit);
  var alpha = 1.0;
  if (in.sheet > 0.5) {
    let dmn = in.xz0 - SH.origin;
    let fi = dot(dmn, SH.along) / SH.dx;
    let border = smoothstep(1.0, 16.0, fi) * smoothstep(SH.nx - 1.0, SH.nx - 16.0, fi);
    let fade = smoothstep(-0.04, 0.04, sh.bed);
    let body = max(smoothstep(0.012, 0.06, sh.h), smoothstep(0.12, 0.4, sh.foam));
    alpha = border * fade * mix(body * 0.32, 0.85, smoothstep(0.22, 0.65, foam));
  }
  return vec4<f32>(tonemap(airOver(col, in.clip.xy)), alpha);
}

`;
}
