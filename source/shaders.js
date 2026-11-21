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

@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_depth_2d;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var reflSamp: sampler;
@group(1) @binding(4) var shapeTex: texture_2d<f32>;
@group(1) @binding(5) var glintTex: texture_2d<f32>;
@group(1) @binding(6) var chopTex: texture_2d<f32>;

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
  // Bend the coordinates first. Straight cell walls read as cracked tile, not foam.
  let bend = vec2<f32>(n2(xz * 1.3 + vec2<f32>(0.0, F.time * 0.05)), n2(xz * 1.3 + vec2<f32>(9.1, 4.3))) - 0.5;
  let bend2 = vec2<f32>(n2(xz * 4.4 + vec2<f32>(2.0, 7.0)), n2(xz * 4.4 + vec2<f32>(5.5, 1.5))) - 0.5;
  let q = xz + bend * 0.85 + bend2 * 0.2;
  // Holes a hand to an arm wide, drifting slowly.
  let size = 1.7;
  let e2 = laceCell(q * size + vec2<f32>(3.7, 1.1), F.time * 0.45);
  let e1 = laceCell(q * 7.3 + bend * 2.0, F.time * 0.9);
  let t2 = pow(d, 1.25) * 1.05;
  let w2 = clamp(foot * size, 0.06, 0.3);
  let sharp = 1.0 - smoothstep(t2 - w2, t2 + w2, e2 + (e1 - 0.3) * 0.3);
  // Once a pixel is wider than a hole, it shows the share of foam, not the pattern.
  // Widening the edge instead would turn a trace of foam into a grey wash.
  let ribbon = mix(sharp, sat(pow(d, 1.6) * 1.15), smoothstep(0.25, 0.9, foot * size));
  let fineW = sat(foot * 7.3 + 0.25);
  let bubbles = mix(0.8 + 0.2 * smoothstep(0.0, 0.3, e1), 0.92, fineW);
  // Thin foam is also translucent foam.
  return sat(ribbon * bubbles) * smoothstep(0.02, 0.28, d);
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
  o.foam = max(s.w, w.z);
  o.wet = w.x;
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
  let x = max(c, vec3<f32>(0.0)) * F.exposure;
  let y = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  return pow(y, vec3<f32>(0.4545));
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
    let dl = airHit(p, F.sunDir) / 5.0;
    var lR = 0.0;
    var lM = 0.0;
    for (var j = 0; j < 5; j++) {
      let hh = length(p + F.sunDir * dl * (f32(j) + 0.5)) - 6360.0;
      lR += exp(-hh / 8.0) * dl;
      lM += exp(-hh / 1.2) * dl;
    }
    let att = exp(-((bR + bO) * (odR + lR) + bM * 1.1 * (odM + lM)));
    sR += att * dR;
    sM += att * dM;
  }
  let mu = dot(d, F.sunDir);
  let pR = 0.0597 * (1.0 + mu * mu);
  let g = 0.8;
  let pM = 0.1194 * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  return 20.0 * (sR * bR * pR + sM * bM * pM);
}

// Trade-wind cumulus. The cover is a field of separate cells with clear gaps between
// them; each cell is a dome standing on a flat base, taller toward its middle.
fn cloudCover(p: vec2<f32>) -> f32 {
  let pd = p + vec2<f32>(F.time * 0.008, F.time * 0.003);
  let q = pd + (vec2<f32>(n2(pd * 0.31 + vec2<f32>(3.1, 0.0)), n2(pd * 0.31 + vec2<f32>(7.7, 1.3))) - 0.5) * 2.2;
  let cells = n2(q * 1.5) * 0.6 + n2(q * 3.7 + vec2<f32>(4.0, 9.0)) * 0.4;
  let c = cells * (0.62 + 0.6 * n2(pd * 0.09 + vec2<f32>(5.0, 2.0)));
  let thr = mix(0.66, 0.3, sat(F.mood.y));
  return (c - thr) / (1.0 - thr);
}
fn cloudAt(p: vec3<f32>, fine: f32) -> f32 {
  let amt = cloudCover(p.xz);
  if (amt <= 0.0) { return 0.0; }
  let h = (p.y - CLOUD_BASE) / (0.1 + 1.25 * amt);
  if (h < 0.0 || h > 1.0) { return 0.0; }
  var d = smoothstep(0.0, 0.2, h) * (1.0 - h * h) * sat(amt * 6.0);
  // Billows eat into the sides and the top. The base stays flat.
  if (fine > 0.5) {
    let b = n3(p * 4.1) * 0.5 + n3(p * 9.7 + vec3<f32>(4.0, 1.0, 7.0)) * 0.3 + n3(p * 23.0 + vec3<f32>(2.0, 9.0, 5.0)) * 0.2;
    d -= b * (0.2 + 0.65 * h);
  }
  return sat(d * 3.0);
}
struct SkyBake { @location(0) c: vec4<f32> }
@fragment fn fsSkyBake(in: SkyV) -> SkyBake {
  let uv = in.clip.xy / vec2<f32>(SKYW, SKYH);
  let az = (uv.x - 0.5) * 6.2831853;
  let el = uv.y * uv.y * (1.5708 + SKY_E0) - SKY_E0;
  let rd = vec3<f32>(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  let air = atmosphere(rd);
  var col = air;
  var T = 1.0;
  // The slab is lifted a little toward the horizon, standing in for the curve of the earth.
  let sinE = max(rd.y, 0.0) + 0.012;
  let hz = normalize(rd.xz + vec2<f32>(1e-5, 0.0)) * sqrt(1.0 - sinE * sinE);
  let t0 = CLOUD_BASE / sinE;
  let dt = min(1.9 / sinE, 14.0) / 48.0;
  // A different offset for every texel and every bake. The bakes are blended, so it averages out.
  let jit = fract(52.9829189 * fract(dot(in.clip.xy, vec2<f32>(0.06711056, 0.00583715))) + F.time * 7.137);
  let mu = dot(rd, F.sunDir);
  let sunL = F.sunCol * 1.35 * (1.0 + 1.6 * pow(sat(mu), 6.0));
  let skyL = vec3<f32>(0.30, 0.40, 0.56);
  var C = vec3<f32>(0.0);
  var tm = 0.0;
  var wsum = 0.0;
  let org = F.camPos.xz * 0.001;
  if (rd.y > -0.004) {
    for (var i = 0; i < 48; i++) {
      let t = t0 + dt * (f32(i) + jit);
      let p = vec3<f32>(org.x + hz.x * t, sinE * t, org.y + hz.y * t);
      let d = cloudAt(p, 1.0);
      if (d > 0.004) {
        var ls = 0.0;
        ls += cloudAt(p + F.sunDir * 0.10, 0.0) * 0.14;
        ls += cloudAt(p + F.sunDir * 0.30, 0.0) * 0.26;
        ls += cloudAt(p + F.sunDir * 0.70, 0.0) * 0.5;
        let hK = sat((p.y - CLOUD_BASE) / 1.6);
        let sunT = exp(-ls * 13.0);
        // Light that scatters many times still gets out, so the shaded side is grey, not black.
        let L = sunL * (sunT * 0.85 + 0.1 * exp(-ls * 1.5)) + skyL * (0.32 + 0.68 * hK);
        let a = 1.0 - exp(-d * dt * 22.0);
        C += T * a * L;
        tm += T * a * t;
        wsum += T * a;
        T *= 1.0 - a;
        if (T < 0.02) { break; }
      }
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

fn skyColor(rd: vec3<f32>) -> vec3<f32> {
  let up = sat(rd.y);
  let mu = dot(rd, F.sunDir);
  let s = textureSampleLevel(skyMap, skySamp, skyUV(rd), 0.0);
  var col = s.rgb;
  let over = sat(F.mood.y);
  col += vec3<f32>(1.2, 1.02, 0.88) * pow(sat(mu), 2200.0) * 18.0 * (1.0 - over) * s.a;
  let warmK = sat(F.mood.x);
  col = mix(col, col * vec3<f32>(1.08, 0.97, 0.9) + vec3<f32>(0.04, 0.02, 0.0), warmK * 0.55);
  col = mix(col, vec3<f32>(0.50, 0.53, 0.56) * (0.45 + 0.7 * up), over * 0.82);
  return col * max(F.lit.y, 0.0);
}
// The air a distant thing is seen through: the sky just above the horizon, that way.
fn hazeColor(dir: vec3<f32>) -> vec3<f32> {
  return skyColor(normalize(vec3<f32>(dir.x, 0.03, dir.z) + vec3<f32>(1e-5, 0.0, 0.0)));
}

// What a tilted piece of water or wet sand mirrors. A ray that dips under the
// horizon is looking at more sea.
fn skyReflect(rd: vec3<f32>) -> vec3<f32> {
  var col = skyColor(normalize(vec3<f32>(rd.x, max(rd.y, 0.004), rd.z)));
  if (rd.y < 0.0) {
    col = mix(F.deepC.rgb, col, exp(rd.y * 22.0));
  }
  return col;
}

fn cloudShade(xz: vec2<f32>, y: f32) -> f32 {
  let up = (CLOUD_BASE * 1000.0 + 250.0 - y) / max(F.sunDir.y, 0.25);
  let amt = cloudCover((xz + F.sunDir.xz * up) * 0.001);
  return mix(1.0, 0.42, smoothstep(0.0, 0.3, amt));
}

fn applyFog(col: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let dist = length(world - F.camPos);
  var dens = mix(0.00055, 0.00018, sat(F.camPos.y / 160.0));
  var fc = hazeColor(world - F.camPos);
  if (F.under > 0.5) {
    dens = mix(0.028, 0.07, sat(F.camDamp));
    fc = vec3<f32>(0.025, 0.16, 0.20);
  }
  return mix(fc, col, sat(exp(-dist * dens)));
}

fn caustic(xz: vec2<f32>) -> f32 {
  // Sunlight is focused by the small waves, into a moving net of thin bright lines.
  // A 44 m swell does not focus within a few metres of water, so it draws no bands here.
  let depth = max(-sampleField(xz).x, 0.12);
  let surf = xz - F.sunDir.xz * (depth / max(F.sunDir.y, 0.3));
  let bend = vec2<f32>(n2(surf * 0.7 + vec2<f32>(F.time * 0.11, 0.0)), n2(surf * 0.7 + vec2<f32>(5.2, F.time * 0.09))) - 0.5;
  // The net coarsens with depth, the way the pattern on a real bottom does.
  let cell = mix(1.5, 0.55, sat(depth / 5.0));
  let p = (surf + bend * 1.4) * cell;
  let e1 = laceCell(p, F.time * 1.3);
  let e2 = laceCell(p * 1.83 + vec2<f32>(5.3, 2.1), F.time * 1.7);
  let l1 = 1.0 - smoothstep(0.0, 0.3, e1);
  let l2 = 1.0 - smoothstep(0.0, 0.34, e2);
  let net = l1 * l1 * 0.75 + l2 * l2 * 0.4;
  return net * exp(-depth * 0.32) * smoothstep(0.03, 0.35, depth) * 0.5;
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
  return mix(shadowAt(p), s * 0.2, inside);
}

// leaf is 1 for foliage, which wraps the light and passes it when backlit.
fn shade(world: vec3<f32>, nrm: vec3<f32>, albedo: vec3<f32>, leaf: f32) -> vec3<f32> {
  let n = normalize(nrm);
  let ndl = max(dot(n, F.sunDir), 0.0);
  let lit = mix(ndl, sat(ndl * 0.45 + 0.55), leaf);
  let sh = sunShadow(world) * cloudShade(world.xz, world.y);
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
  col += albedo * vec3<f32>(0.72, 1.08, 0.34) * back * sh * leaf * 1.45;
  if (world.y > -0.15 && world.y < 1.1) {
    let V = normalize(F.camPos - world);
    let H = normalize(V + F.sunDir);
    let spec = pow(max(dot(n, H), 0.0), mix(56.0, 22.0, leaf));
    let wet = (1.0 - sat(world.y / 0.7)) * (1.0 - leaf);
    col += F.sunCol * spec * sh * (leaf * 0.04 + wet * 0.09);
  }
  return applyFog(col, world);
}

fn forestNoise(p: vec2<f32>) -> f32 {
  return sin(p.x * 0.031 + 1.3) * sin(p.y * 0.027 + 0.5)
    + 0.6 * sin((p.x + p.y) * 0.053 + 2.1) * sin((p.x - p.y) * 0.047 + 0.4)
    + 0.35 * sin(p.x * 0.11 + 3.0) * sin(p.y * 0.13 + 1.0);
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
  // Dry sand near the eye is pocked and grainy. Each band fades before it is smaller than a pixel.
  let distG = length(in.world - F.camPos);
  let dry = smoothstep(0.3, 0.8, in.world.y) * smoothstep(3.4, 2.2, in.world.y) * (1.0 - smoothstep(0.1, 0.3, slope));
  let nearA = dry * smoothstep(34.0, 5.0, distG);
  let nearB = dry * smoothstep(9.0, 2.0, distG);
  if (nearA > 0.01) {
    let q1 = in.world.xz * 4.3;
    let d0 = n2(q1) + 0.5 * n2(q1 * 2.3 + vec2<f32>(3.0, 1.0));
    let dx1 = n2(q1 + vec2<f32>(0.35, 0.0)) + 0.5 * n2(q1 * 2.3 + vec2<f32>(3.8, 1.0)) - d0;
    let dz1 = n2(q1 + vec2<f32>(0.0, 0.35)) + 0.5 * n2(q1 * 2.3 + vec2<f32>(3.0, 1.8)) - d0;
    n = normalize(n + vec3<f32>(-dx1, 0.0, -dz1) * 1.05 * nearA);
  }
  var alb = terrainAlbedo(in.world.xz, in.world.y, n);
  alb *= 1.0 + (n2(in.world.xz * 37.0) - 0.5) * 0.16 * nearA + (hash21(floor(in.world.xz * 140.0)) - 0.5) * 0.2 * nearB;
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
  var col = shade(in.world, n, alb, 0.0);
  // Wet sand is a mirror at a low angle. Dry sand never is.
  let Vt = normalize(F.camPos - in.world);
  let gloss = max(smoothstep(0.26, 0.02, in.world.y) * step(-0.02, in.world.y), washWet) * (1.0 - slope * 3.0);
  if (gloss > 0.01 && F.under < 0.5) {
    let nw = normalize(mix(n, vec3<f32>(0.0, 1.0, 0.0), 0.8));
    let fr = 0.02 + 0.98 * pow(1.0 - max(dot(nw, Vt), 0.0), 5.0);
    col = mix(col, applyFog(skyReflect(reflect(-Vt, nw)), in.world), sat(fr * gloss * 0.9));
  }
  if (washWet > 0.04 || washFoam > 0.02) {
    col *= mix(1.0, 0.6, washWet * (1.0 - washFoam * 0.5));
    let Vw = normalize(F.camPos - in.world);
    let spec = pow(sat(dot(n, normalize(F.sunDir + Vw))), 24.0) * washWet;
    col += vec3<f32>(0.22, 0.2, 0.16) * spec;
    let sun = 0.62 + 0.5 * max(dot(n, F.sunDir), 0.0);
    col = mix(col, vec3<f32>(0.9, 0.92, 0.9) * sun, washFoam * 0.75);
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
  @location(1) n: vec3<f32>,
  @location(2) c: vec3<f32>,
  @location(3) sway: f32,
  @location(4) kind: f32,
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
fn meshPlace(in: MeshIn) -> vec3<f32> {
  var w = spinY(in.p * vec3<f32>(in.i1.x, in.i1.x * in.i1.y, in.i1.x), in.i0.w) + in.i0.xyz;
  // One wind for the whole island, with a faster flutter that differs along each plant.
  let field = sin(F.time * 0.31 + w.x * 0.012 + w.z * 0.009);
  let phase = F.time * (1.15 + 0.45 * fract(w.x * 0.013 + w.z * 0.017)) + w.z * 0.05;
  let gust = field * 0.55 + sin(phase) * 0.35 + sin(phase * 2.3 + 0.7) * 0.12;
  w.x += gust * in.sway * 1.15;
  w.z += gust * in.sway * 0.22;
  w.y -= abs(gust) * in.sway * in.sway * 0.28;
  return w;
}
@vertex fn vsMesh(in: MeshIn) -> MeshV {
  var o: MeshV;
  o.world = meshPlace(in);
  o.nrm = spinY(normalize(in.n / vec3<f32>(1.0, in.i1.y, 1.0)), in.i0.w);
  o.col = in.c * in.i2.rgb;
  o.kind = in.kind;
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
@fragment fn fsMesh(in: MeshV) -> @location(0) vec4<f32> {
  if (F.clipBelow > 0.5 && in.world.y < -0.2) { discard; }
  var n = normalize(in.nrm);
  var alb = in.col;
  let crown = in.kind > 2.5 && in.kind < 3.5;
  let leafy = select(0.0, 1.0, in.kind > 1.5 && in.kind < 2.5);
  if (crown) {
    // A leaf mass. Its outline is leaves and gaps, not the edge of a smooth lump,
    // and its surface is clumps catching the light at different angles.
    let Vv = normalize(F.camPos - in.world);
    let rim = 1.0 - abs(dot(n, Vv));
    let dist = length(F.camPos - in.world);
    let p = in.world * mix(2.6, 0.9, sat(dist / 220.0));
    let a = n2(p.xz + vec2<f32>(p.y * 0.83, p.y * 0.41));
    let b = n2(p.xz * 2.9 + vec2<f32>(p.y * 2.1, 3.0));
    let leafN = a * 0.62 + b * 0.38;
    if (leafN < rim * rim * 1.05 - 0.1) { discard; }
    alb *= 0.5 + 1.0 * leafN;
    let tilt = vec3<f32>(n2(p.xz * 1.9 + vec2<f32>(1.0, p.y)) - 0.5, n2(p.zy * 1.9 + vec2<f32>(4.0, p.x)) - 0.5, n2(p.yx * 1.9 + vec2<f32>(7.0, p.z)) - 0.5);
    n = normalize(n + tilt * 1.1);
  } else if (dot(n, F.camPos - in.world) < 0.0) { n = -n; }
  // Leaves are a dull, dark green. The saturated value is what reads as plastic.
  alb = mix(alb, mix(vec3<f32>(dot(alb, vec3<f32>(0.3, 0.6, 0.1))), alb, 0.72) * 0.62, leafy);
  var col = shade(in.world, n, alb, select(leafy, 0.3, crown));
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
  let field = sin(F.time * 0.31 + inst.x * 0.012 + inst.y * 0.009);
  let ph = field * 0.65 + sin(F.time * (1.6 + weed) + inst.x * 0.2 + inst.y * 0.17) * 0.45;
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
  return vec4<f32>(shade(in.world, in.nrm, col, 1.0), 1.0);
}

struct BirdV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) nrm: vec3<f32>,
  @location(2) col: vec3<f32>,
}
@vertex fn vsBird(@location(0) p: vec3<f32>, @location(1) wing: f32, @location(2) inst: vec4<f32>) -> BirdV {
  var lp = p;
  let glide = sat(sin(F.time * 0.21 + inst.z * 0.15));
  let flap = sin(F.time * (3.4 + abs(inst.y) * 0.02) + inst.x) * wing * mix(0.15, 1.0, glide);
  lp.y += abs(lp.x) * flap;
  lp.z -= abs(wing) * 0.04 * (1.0 - glide);
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
  return vec4<f32>(shade(in.world, in.nrm, in.col, 0.0), 1.0);
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
  let calm = smoothstep(1500.0, 260.0, distS);
  let N = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), S.nrm, calm) + vec3<f32>(cap.x, 0.0, cap.y) * calm + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.075);
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
  base = mix(base, vec3<f32>(0.86, 0.88, 0.86), foam * 0.45);
  var col = mix(base, reflCol, fres * (1.0 - foam * 0.5));
  col += ggxSun(N, V, rough, fres) * (1.0 - foam);
  let dens = mix(0.00055, 0.00018, sat(F.camPos.y / 160.0));
  return mix(hazeColor(-V), col, sat(exp(-distS * dens)));
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
fn oceanSample(tex: texture_2d<f32>, xz: vec2<f32>, size: f32) -> vec3<f32> {
  let p = fract(oceanRot(xz) / size) * 128.0;
  let i = vec2<i32>(floor(p));
  let f = fract(p);
  let x0 = i.x & 127;
  let y0 = i.y & 127;
  let x1 = (i.x + 1) & 127;
  let y1 = (i.y + 1) & 127;
  let a = textureLoad(tex, vec2<i32>(x0, y0), 0);
  let b = textureLoad(tex, vec2<i32>(x1, y0), 0);
  let c = textureLoad(tex, vec2<i32>(x0, y1), 0);
  let d = textureLoad(tex, vec2<i32>(x1, y1), 0);
  return mix(mix(a.xyz, b.xyz, f.x), mix(c.xyz, d.xyz, f.x), f.y);
}
// The same evolving spectrum, read on a second incommensurate scale, so a
// 220 m tile does not repeat as a wallpaper. Both samples move with one clock.
fn shapeField(xz: vec2<f32>) -> vec3<f32> {
  let a = oceanSample(shapeTex, xz, 220.0);
  // A second scale only near the camera. Far away it would tile across the view.
  let dist = length(xz - F.camPos.xz);
  let close = smoothstep(220.0, 50.0, dist);
  let r = vec2<f32>(xz.x * 0.82 - xz.y * 0.57, xz.x * 0.57 + xz.y * 0.82);
  let b = oceanSample(shapeTex, r, 151.0);
  return a + b * 0.28 * close;
}
// Wind chop between the swell and the capillaries, 0.45 to 5 m. This is the
// texture a person actually sees on water from a beach or a boat. Two scales of
// one tile, and it fades once a wavelength is smaller than a pixel.
fn chopField(xz: vec2<f32>, pix: f32) -> vec2<f32> {
  let keep = 1.0 - smoothstep(0.28, 1.5, pix);
  if (keep <= 0.001) { return vec2<f32>(0.0); }
  let a = oceanSample(chopTex, xz, 24.0);
  let r = vec2<f32>(xz.x * 0.94 + xz.y * 0.34, -xz.x * 0.34 + xz.y * 0.94);
  let b = oceanSample(chopTex, r + vec2<f32>(11.0, 5.0), 15.5);
  // Slopes come back in the rotated frame of the second read.
  let bs = vec2<f32>(b.y * 0.94 - b.z * 0.34, b.y * 0.34 + b.z * 0.94);
  return (a.yz + bs * 0.6) * keep;
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
  // The spectral tile adds the wind sea. Its height fades before the mesh gets coarse.
  let near = smoothstep(460.0, 70.0, dist);
  w.y += shapeField(xz).x * near * mix(0.25, 1.0, field.y);
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
  var y = s.disp.y + shapeField(xz).x * smoothstep(460.0, 70.0, length(xz - F.camPos.xz));
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
  let S = seaAt(in.xz0, scale, max(-bed, 0.2));
  let distS = length(in.world - F.camPos);
  let rip = ripAt(in.xz0);
  let cap = capillary(in.xz0, distS);
  let ocn = shapeField(in.xz0);
  let gl = oceanSample(glintTex, in.xz0, 4.0);
  let pix = max(distS * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let open = mix(0.4, 1.0, scale);
  // The reflection follows the swell. Capillary slopes are reserved for the sun glint,
  // otherwise a distant pixel picks one random facet and the sea turns to static.
  // Sheltered water still carries wind ripples. Only the swell is blocked.
  // At a grazing view a pixel is far longer along the line of sight than across it.
  let foot = pix / pow(max(abs(F.camPos.y - in.world.y) / max(distS, 0.1), 0.02), 0.6);
  let chop = chopField(in.xz0, foot) * mix(0.5, 1.0, scale);
  // The wind sea fades the same way once its crests pile up inside one pixel.
  let footLong = pix / max(abs(F.camPos.y - in.world.y) / max(distS, 0.1), 0.01);
  let seaKeep = (1.0 - smoothstep(5.0, 34.0, footLong)) * open;
  var N = normalize(S.nrm + vec3<f32>(-ocn.y * seaKeep + rip.y - chop.x + cap.x * 0.1, 0.0, -ocn.z * seaKeep + rip.z - chop.y + cap.y * 0.1));
  let sh = shoreFetch(in.xz0);
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
      let sn = normalize(vec3<f32>(-dhx / (e * 2.0), 1.0, -dhz / (e * 2.0)));
      N = normalize(mix(N, sn, take));
    }
  }
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.02);
  // Schlick, F0 for water against air (IOR 1.333).
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let reflK = sat(F.mat.y);
  let rough = clamp(0.008 + sat(F.mat.x) * 0.055, 0.006, 0.065);
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
  if (sh.inside > 0.5 && sh.foam > 0.025 && shoreOff < 0.72) {
    // Structure comes from the transported field sampled along the flow.
    // A patch that is thinner across the current reads as a tongue, not a band.
    let dir = sh.vel / max(length(sh.vel), 0.2);
    let alongF = shoreFetch(in.xz0 - dir * 0.64).foam;
    let acrossF = shoreFetch(in.xz0 + vec2<f32>(-dir.y, dir.x) * 0.42).foam;
    let tongue = sat(sh.foam * 1.25 - acrossF * 0.7);
    let trail = sat(min(sh.foam, alongF * 1.15));
    let grain = n2(in.xz0 * 6.5 + vec2<f32>(F.time * 0.1, 2.0));
    let adv = sat(max(tongue, trail * 0.75) * mix(0.9, 1.0, grain));
    let band = 1.0 - smoothstep(0.46, 0.7, shoreOff);
    // Low concentration stays clear water. The field has to be dense before it reads as foam.
    let patches = foamCover(in.xz0, adv * 0.92, foot);
    foam = sat(mix(foam * (1.0 - band), patches, band));
    onSheet = band * patches;
  }

  if (in.sheet > 0.5 && sh.bed < -0.02) { discard; }

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
  // The sheet is allowed to draw over the sand it is running across.
  let swash = sh.inside > 0.5 && sh.bed > -0.12 && (sh.h > 0.018 || sh.foam > 0.2);
  if (!swash && dep < 0.999 && dep < frag.z - 0.00015) { discard; }

  // One facet, not an average. Averaging the nearby sky samples was flattening
  // the grazing reflection into a single pale column.
  var reflN = N;
  if (distS < 95.0) {
    reflN = normalize(N + vec3<f32>(-gl.y, 0.0, -gl.z) * 0.7);
  }
  // Past the point where the chop is smaller than a pixel, its facets still face the
  // viewer more often than away. The mean reflection comes from higher in the sky,
  // which is why a real sea is darker than the haze just above the horizon.
  let lost = smoothstep(0.28, 1.5, foot) * mix(0.5, 1.0, scale);
  let toCam = normalize(F.camPos.xz - in.xz0 + vec2<f32>(1e-4, 0.0));
  reflN = normalize(reflN + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.075 * lost);
  var reflCol = skyReflect(reflect(-V, reflN));
  let Rd = reflect(-V, reflN);
  if (F.reflOn > 0.5) {
    var uv = frag.xy / F.res;
    // A slope toward the viewer lifts the reflected ray by twice its angle, which is a
    // long way down the screen. A sideways slope barely moves it at a grazing view.
    // That difference is why reflections on ruffled water smear into vertical streaks.
    let tv = normalize(in.xz0 - F.camPos.xz + vec2<f32>(1e-4, 0.0));
    // The chop moves the image. The capillaries only blur it, below.
    let rn = N.xz + toCam * 0.075 * lost;
    let nt = dot(rn, tv);
    let ns = dot(rn, vec2<f32>(-tv.y, tv.x));
    let graze = sat(abs(V.y) + 0.12);
    uv.y -= clamp(nt / max(F.tanHalf, 0.2), -0.22, 0.22) * reflK;
    uv.x += clamp(ns * graze / max(F.tanHalf * F.aspect, 0.2), -0.08, 0.08) * reflK;
    // The mirrored view has the same frame as this one. A ray that leaves it reads the
    // nearest edge, which is sky, instead of switching to a different sky model.
    uv = clamp(uv, vec2<f32>(0.004), vec2<f32>(0.996));
    let edge = 1.0;
    if (edge > 0.001) {
      let blur = 0.006 + rough * 0.05;
      let c0 = textureSampleLevel(reflTex, reflSamp, uv, 0.0).rgb;
      let c1 = textureSampleLevel(reflTex, reflSamp, uv + vec2<f32>(blur * 0.15, blur), 0.0).rgb;
      let c2 = textureSampleLevel(reflTex, reflSamp, uv - vec2<f32>(blur * 0.1, blur * 1.7), 0.0).rgb;
      let rs = (c0 + c1 + c2) * 0.333;
      reflCol = mix(reflCol, rs, edge * (1.0 - foam * 0.65) * reflK);
    }
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
  let foamCol = mix(vec3<f32>(0.78, 0.82, 0.8), vec3<f32>(0.97, 0.98, 0.96), sat(foam));
  base = mix(base, foamCol, foam * mix(0.4, 0.95, onSheet));

  // On the sheet the wash is whitewater, not a mirror. The open sea keeps its Fresnel.
  let sheetK = smoothstep(0.5, 1.0, in.sheet);
  var fresK = fres * reflK * (1.0 - foam * mix(0.5, 0.95, onSheet)) * film;
  // The film on the sand is the water and the foam, not a mirror of the horizon.
  fresK = mix(fresK, fresK * 0.6, sheetK);
  var col = mix(base, reflCol, fresK);
  // The sun lights the capillary facets. Close in, one facet per pixel. Farther away a pixel
  // covers many of them, so the brightest facet in that pixel is the glint that survives.
  let foamK = 1.0 - foam * 0.85;
  var spec = ggxGlint(normalize(N + vec3<f32>(-gl.y, 0.0, -gl.z) * open), V, 0.007, fres * reflK);
  if (pix > 0.04) {
    let cell = floor(in.xz0 / pix);
    for (var k = 0u; k < 4u; k++) {
      let j = vec2<f32>(
        hash21(cell + vec2<f32>(f32(k) * 3.1, 1.7)),
        hash21(cell + vec2<f32>(8.2, f32(k) * 2.7))
      );
      let g2 = oceanSample(glintTex, in.xz0 + (j - 0.5) * pix * 2.0, 4.0);
      let Nk = normalize(N + vec3<f32>(-g2.y, 0.0, -g2.z) * open);
      spec = max(spec, ggxGlint(Nk, V, 0.007, fres * reflK));
    }
  }
  let lit = sunShadow(in.world);
  col += spec * foamK * lit * lit;
  let crestLight = pow(sat(1.0 - N.y), 1.6) * sat(S.disp.y * 0.8) * max(dot(F.sunDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0);
  col += F.sunCol * vec3<f32>(0.45, 0.62, 0.55) * crestLight * 0.12;

  let dens = mix(0.00055, 0.00018, sat(F.camPos.y / 160.0));
  col = mix(hazeColor(-V), col, sat(exp(-distS * dens)));
  col *= mix(0.58, 1.0, lit);
  var alpha = 1.0;
  if (in.sheet > 0.5) {
    let dmn = in.xz0 - SH.origin;
    let fi = dot(dmn, SH.along) / SH.dx;
    let border = smoothstep(1.0, 16.0, fi) * smoothstep(SH.nx - 1.0, SH.nx - 16.0, fi);
    let fade = smoothstep(-0.04, 0.04, sh.bed);
    let body = max(smoothstep(0.012, 0.06, sh.h), smoothstep(0.08, 0.32, sh.foam));
    alpha = border * fade * mix(body * 0.35, 1.0, smoothstep(0.18, 0.55, foam));
  }
  return vec4<f32>(tonemap(col), alpha);
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
