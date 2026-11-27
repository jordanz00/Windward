function shaderCode(res, span, wgrid, samples) {
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
  // Sea-disk ring exponent. The water mesh reads this as the inner spacing.
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
  // day: all the light now falling on open ground, as a share of the framed afternoon's;
  // w is how low the sun stands, from 0 above 24 degrees to 1 near the horizon.
  amb: vec4<f32>,
  sunTrue: vec4<f32>,
  moon: vec4<f32>,
  wind: vec4<f32>,
  windOff: vec4<f32>,
  wx: vec4<f32>,
  disc: vec4<f32>,
  day: vec4<f32>,
  // The clouds. cldA: how much of the air holds cumulus, how unstable it is, the height
  // cloud forms at and the height the tallest tower reaches (km). cldB: cirrus, deck, the
  // deck's base, a slow clock. cldC: how far the upper wind has carried the cirrus, along it
  // and across, and how far the deck has gone. skyS: strips of panorama baked so far, strips in
  // all, the share of the blend kept clear of a bake, the depth of fair-weather cumulus.
  // skyD: the panorama's size, how far the towers have gone. cldE: lean downwind per km of
  // height, the deck's thickness, how far the billows have risen.
  cldA: vec4<f32>,
  cldB: vec4<f32>,
  cldC: vec4<f32>,
  skyS: vec4<f32>,
  skyD: vec4<f32>,
  cldE: vec4<f32>,
  // Lightning. bolt: where the flash is (m; y is the height of the glow in the cloud) and how
  // bright it is now. boltB: its seed, and whether a channel comes down out of the cloud.
  bolt: vec4<f32>,
  boltB: vec4<f32>,
  // The night sky over Saint Lucia. astro: local sidereal time, illuminated fraction,
  // the moon's angular radius, and whether the moon is the real one. astroB: where the
  // real sun is, in this same frame, and how much moonlight the clouds and the sea take.
  // astroC: east.x, east.z, north.x, north.z, turned with the island like the moon.
  astro: vec4<f32>,
  astroB: vec4<f32>,
  astroC: vec4<f32>,
  // 0 keeps every blade. Above 1, geometric grass shrinks out by this distance (metres).
  grassFade: f32,
  // 1 when the eye is near or inside the cloud deck: the volume pass owns low cloud.
  // Float 87 (pad0) is the sea-disk exponent, so this flag sits in the tail padding.
  cloudOwn: f32,
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
@group(0) @binding(8) var skyMap: texture_2d_array<f32>;
@group(0) @binding(9) var skySamp: sampler;
@group(0) @binding(10) var shadowNear: texture_depth_2d;
@group(0) @binding(11) var cshMap: texture_2d<f32>;
@group(0) @binding(12) var<storage, read> starCat: array<vec4<f32>>;

@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var sceneDepth: texture_depth_${samples > 1 ? 'multisampled_' : ''}2d;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var reflSamp: sampler;
@group(1) @binding(4) var shapeTex: texture_2d<f32>;
@group(1) @binding(5) var glintTex: texture_2d<f32>;
@group(1) @binding(6) var chopTex: texture_2d<f32>;
@group(1) @binding(7) var airTex: texture_2d<f32>;
@group(1) @binding(13) var cloudTex: texture_2d<f32>;
// What the sky's own passes read: the noise all cloud is carved from, the weather map,
// the cloud-shadow map, and the two panoramas for gathering the sky's light.
@group(1) @binding(8) var noiseTex: texture_3d<f32>;
@group(1) @binding(9) var nSamp: sampler;
@group(1) @binding(10) var wxMap: texture_2d<f32>;
@group(1) @binding(11) var cshBake: texture_2d<f32>;
@group(1) @binding(12) var skyBase: texture_2d_array<f32>;

const SPAN: f32 = ${span.toFixed(1)};
const ORIGIN: f32 = ${(-span).toFixed(1)};
const HRES: i32 = ${res | 0};
const TEXEL: f32 = ${texel.toFixed(5)};
const PI: f32 = 3.14159265;
const G: f32 = 9.81;

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
// x to the fifth, for Fresnel. x is one less a cosine, and a cosine of two unit vectors can
// round to a hair over one: pow() of a negative base is not a number on some GPUs.
fn pow5(x: f32) -> f32 { let c = sat(x); let c2 = c * c; return c2 * c2 * c; }

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
      // Drift that breathes — cells migrate, stretch, and recombine like real foam.
      let o = 0.5 + 0.42 * sin(vec2<f32>(t * 0.85 + h.y * 1.7, t * 1.15 + h.x * 2.1) + 6.2831853 * h);
      let r = g + o - f;
      let d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}
fn foamCover(xz: vec2<f32>, dens: f32, foot: f32) -> f32 {
  if (dens <= 0.01) { return 0.0; }
  let d = sat(dens);
  // Advected domain: foam rides a slow current and a faster ripple so patches tear organically.
  let flow = vec2<f32>(n2(xz * 0.07 + vec2<f32>(F.time * 0.028, 1.0)), n2(xz * 0.07 + vec2<f32>(4.0, F.time * 0.019))) - 0.5;
  let gust = vec2<f32>(n2(xz * 0.22 + F.windOff.xy * 0.4), n2(xz * 0.22 + vec2<f32>(8.0, 3.0))) - 0.5;
  let bend = vec2<f32>(n2(xz * 1.15 + flow * 2.2 + vec2<f32>(0.0, F.time * 0.05)), n2(xz * 1.15 + vec2<f32>(9.1, 4.3))) - 0.5;
  let bend2 = vec2<f32>(n2(xz * 3.9 + vec2<f32>(2.0, 7.0) + F.time * 0.03), n2(xz * 3.9 + vec2<f32>(5.5, 1.5))) - 0.5;
  let q = xz + flow * 0.7 + gust * 0.35 + bend * 1.05 + bend2 * 0.28;
  // Large lobes, medium filaments, fine bubble lace — three scales that shear apart.
  let e3 = laceCell(q * 0.72 + vec2<f32>(1.1, 0.4), F.time * 0.18);
  let e2 = laceCell(q * 1.55 + vec2<f32>(3.7, 1.1), F.time * 0.42);
  let e1 = laceCell(q * 6.8 + bend * 2.4, F.time * 0.95);
  let e0 = laceCell(q * 14.0 + gust * 3.0, F.time * 1.55);
  let t2 = pow(d, 1.15) * 1.08;
  let w2 = clamp(foot * 1.55, 0.04, 0.26);
  let field = e2 + (e1 - 0.26) * 0.32 + (e3 - 0.18) * 0.22 + (e0 - 0.3) * 0.12;
  let sharp = 1.0 - smoothstep(t2 - w2, t2 + w2 * 1.15, field);
  let ribbon = mix(sharp, sat(pow(d, 1.45) * 1.15), smoothstep(0.22, 0.85, foot * 1.7));
  let fineW = sat(foot * 7.0 + 0.2);
  // Bubble brightness varies — fresh foam is brighter; aging lace goes duller.
  let age = 0.55 + 0.45 * n2(q * 2.4 + vec2<f32>(F.time * 0.11, 6.0));
  let bubbles = mix(0.72 + 0.28 * smoothstep(0.0, 0.28, e1) * age, 0.94, fineW);
  // Sparse density stays as isolated tongues and freckles, not a continuous band.
  let frag = smoothstep(0.02, 0.2, d) * (0.48 + 0.52 * smoothstep(0.1, 0.58, e3 + 0.45));
  let edgeSoft = 0.82 + 0.18 * smoothstep(0.05, 0.35, e2);
  return sat(ribbon * bubbles * edgeSoft) * frag;
}

fn shoreFetch(xz: vec2<f32>) -> ShoreS {
  var o: ShoreS;
  o.h = 0.0; o.vel = vec2<f32>(0.0); o.foam = 0.0; o.wet = 0.0; o.bed = 0.0; o.inside = 0.0; o.eta = 0.0;
  let d = xz - SH.origin;
  let fi = dot(d, SH.along) / SH.dx - 0.5;
  let fj = dot(d, SH.sea) / SH.dx - 0.5;
  // Outside the solver domain: not water at η=0 — leave inside=0 so ocean owns.
  if (fi < -0.5 || fj < -0.5 || fi > SH.nx - 0.5 || fj > SH.nz - 0.5) { return o; }
  // Clamp the bilinear stencil to valid texels. Never invent zero-valued water.
  let x0 = clamp(i32(floor(fi)), 0, i32(SH.nx) - 2);
  let z0 = clamp(i32(floor(fj)), 0, i32(SH.nz) - 2);
  let x1 = x0 + 1;
  let z1 = z0 + 1;
  let f = fract(vec2<f32>(clamp(fi, 0.0, SH.nx - 1.001), clamp(fj, 0.0, SH.nz - 1.001)));
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
// Foam-only neighbor tap — 4 loads instead of shoreFetch's 8 (state+wet).
fn shoreFoamAt(xz: vec2<f32>) -> f32 {
  let d = xz - SH.origin;
  let fi = dot(d, SH.along) / SH.dx - 0.5;
  let fj = dot(d, SH.sea) / SH.dx - 0.5;
  if (fi < -0.5 || fj < -0.5 || fi > SH.nx - 0.5 || fj > SH.nz - 0.5) { return 0.0; }
  let x0 = clamp(i32(floor(fi)), 0, i32(SH.nx) - 2);
  let z0 = clamp(i32(floor(fj)), 0, i32(SH.nz) - 2);
  let f = fract(vec2<f32>(clamp(fi, 0.0, SH.nx - 1.001), clamp(fj, 0.0, SH.nz - 1.001)));
  let a = textureLoad(shoreTex, vec2<i32>(x0, z0), 0).w;
  let b = textureLoad(shoreTex, vec2<i32>(x0 + 1, z0), 0).w;
  let c = textureLoad(shoreTex, vec2<i32>(x0, z0 + 1), 0).w;
  let d4 = textureLoad(shoreTex, vec2<i32>(x0 + 1, z0 + 1), 0).w;
  return mix(mix(a, b, f.x), mix(c, d4, f.x), f.y);
}
// Depth-only neighbor tap for bore slopes — state.x only (4 loads).
// η ≈ centerBed + h (bed varies slowly over the ~0.5 m stencil).
fn shoreHAt(xz: vec2<f32>) -> vec2<f32> {
  // returns (h, inside)
  let d = xz - SH.origin;
  let fi = dot(d, SH.along) / SH.dx - 0.5;
  let fj = dot(d, SH.sea) / SH.dx - 0.5;
  if (fi < -0.5 || fj < -0.5 || fi > SH.nx - 0.5 || fj > SH.nz - 0.5) {
    return vec2<f32>(0.0, 0.0);
  }
  let x0 = clamp(i32(floor(fi)), 0, i32(SH.nx) - 2);
  let z0 = clamp(i32(floor(fj)), 0, i32(SH.nz) - 2);
  let f = fract(vec2<f32>(clamp(fi, 0.0, SH.nx - 1.001), clamp(fj, 0.0, SH.nz - 1.001)));
  let a = textureLoad(shoreTex, vec2<i32>(x0, z0), 0).x;
  let b = textureLoad(shoreTex, vec2<i32>(x0 + 1, z0), 0).x;
  let c = textureLoad(shoreTex, vec2<i32>(x0, z0 + 1), 0).x;
  let d4 = textureLoad(shoreTex, vec2<i32>(x0 + 1, z0 + 1), 0).x;
  return vec2<f32>(max(mix(mix(a, b, f.x), mix(c, d4, f.x), f.y), 0.0), 1.0);
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

fn shoulder(x: vec3<f32>) -> vec3<f32> {
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  let s = a / b;
  return s / (1.0 + max(s - 0.94, vec3<f32>(0.0)) * 0.55);
}
fn tonemap(c: vec3<f32>) -> vec3<f32> {
  // Photographic response: soft shoulder, gentle midtone S-curve, restrained desat —
  // documentary punch without crushed blacks or clipped highlights.
  let x = max(c, vec3<f32>(0.0)) * F.exposure;
  var soft = shoulder(x);
  // Each channel bent by itself bleaches a bright orange to pale yellow: red is held at the
  // top while green and blue catch up. The light of a low sun is the one bright thing in
  // the day that is strongly coloured, so for it part of the answer is the colour as it
  // came, bent as a whole by its brightest channel.
  if (F.day.w > 0.0) {
    let m = max(max(x.r, x.g), max(x.b, 1e-5));
    soft = mix(soft, x * (shoulder(vec3<f32>(m)).x / m), 0.4 * F.day.w);
  }
  let luma = dot(soft, vec3<f32>(0.2126, 0.7152, 0.0722));
  // Mild S-curve around mid greys (nature-doc contrast) — shadows stay open.
  let lift = soft + (soft - vec3<f32>(luma)) * 0.06;
  let contrast = mix(lift, soft * soft * (3.0 - 2.0 * soft), 0.12);
  let mid = smoothstep(0.05, 0.2, luma) * (1.0 - smoothstep(0.55, 0.92, luma));
  let photo = mix(contrast, vec3<f32>(dot(contrast, vec3<f32>(0.2126, 0.7152, 0.0722))), mid * 0.14);
  return pow(clamp(photo, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(0.4545));
}

${skyWGSL()}
// Water optical constants — Abyssal Garden Beer's law family (SIG/KD/WCOL), tuned
// for Windward's tropical shelf: turquoise shallows, cyan mid, deeper blue far.
const W_SIG = vec3<f32>(0.048, 0.024, 0.020);
const W_KD = vec3<f32>(0.068, 0.0235, 0.0155);
const W_COL = vec3<f32>(0.15, 0.56, 0.84);
// In-scattered water light along a ray (AG fogIn: Beer's integral + soft forward phase).
fn waterFogIn(ro: vec3<f32>, rd: vec3<f32>, dist: f32) -> vec3<f32> {
  let a = W_SIG - W_KD * rd.y;
  let I = (1.0 - exp(-a * dist)) / max(a, vec3<f32>(1e-4));
  let mu = max(dot(rd, F.sunDir), 0.0);
  let m2 = mu * mu;
  let phase = 1.22 + 0.3 * m2 * m2;
  let lit = mix(0.5, 1.0, cloudShade(ro.xz, ro.y)) * max(F.lit.y, 0.0);
  return W_COL * W_SIG * exp(W_KD * min(ro.y, 0.0)) * I * phase * lit * F.day.rgb;
}
fn waterHaze(dy: f32) -> vec3<f32> {
  // Far-field water colour when looking into open sea (uses fog integral over a long path).
  let rd = normalize(vec3<f32>(0.02, dy, 1.0));
  return waterFogIn(F.camPos, rd, 120.0);
}
// AG sunE: sunlight energy remaining at depth y (Snell-bent sun).
fn sunEUnder(y: f32) -> vec3<f32> {
  let Lw = sunUnder();
  return F.sunCol * exp(W_KD * (min(y, 0.0) / max(Lw.y, 0.12)))
    * (0.5 + 0.5 * sat(-y / 30.0)) * max(F.lit.y, 0.0) * F.day.rgb
    * mix(0.55, 1.0, cloudShade(F.camPos.xz, 0.0));
}
// AG amb: open-water skylight fill on a surface normal.
fn waterAmbAG(p: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  let up = n.y * 0.5 + 0.5;
  return W_COL * exp(W_KD * min(p.y, 0.0) * 1.2)
    * (0.24 + 0.76 * up * up) * 1.25 * (0.55 + 0.45 * sat(-p.y / 30.0))
    + vec3<f32>(0.003, 0.010, 0.016);
}
// AG side: horizontal faces pick up more volume scatter.
fn waterSideAG(p: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  return W_COL * exp(W_KD * min(p.y, 0.0)) * (1.0 - abs(n.y)) * 0.65
    * (0.4 + 0.6 * sat(-p.y / 22.0));
}
// Light scattered by the water itself reaches every side of a thing that is in it.
fn waterFill(depth: f32) -> vec3<f32> {
  return sunEUnder(-depth) * 0.42 * F.under * sat(depth * 3.0);
}
// Aerial perspective, by the same air the sky is made of: Rayleigh, ozone and the sea's
// aerosol, thinning with height exactly as they do in the panorama, so a far headland fades
// into the sky behind it and never into some other colour. Over an island's width that is
// very little, which is how clear sea air looks. Humidity, mist and rain add a low veil.
// dy is how far the ray climbs.
fn airKeep(dist: f32, dy: f32) -> vec3<f32> {
  let ha = max(F.camPos.y, 0.0) * 0.001;
  let hb = max(F.camPos.y + dy, 0.0) * 0.001;
  let t = dist * 0.001;
  let humid = sat(F.wx.w);
  // Clear dry air: keep distance colour almost pure. Mist/rain/humidity still veil.
  // Low sun adds a thin coherent veil so far headlands sit in the same air as the sky.
  let veil = (0.16 * humid * humid + 1.35 * sat(F.wx.z) + 2.9 * F.wx.x + 0.08 * sat(F.day.w))
    * layerMean(ha, hb, 0.16) * mix(1.0, 0.42, sat(F.sunTrue.w));
  return pathKeep(t, ha, hb) * exp(-t * veil);
}
// What replaces the light the air takes is the sky low down in that direction: the same
// scattering seen through a path with no end, bright toward the sun and the colour of the hour.
fn airMix(col: vec3<f32>, dir: vec3<f32>, dist: f32) -> vec3<f32> {
  let keep = airKeep(dist, dir.y * dist);
  return col * keep + hazeColor(dir) * (1.0 - keep);
}
// Soft underwater weight — immersion is continuous; avoid hard 0.5 snaps at the waterline.
fn underK() -> f32 { return smoothstep(0.12, 0.72, F.under); }
fn applyFog(col: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let d = world - F.camPos;
  let dist = length(d);
  let rd = d / max(dist, 1e-3);
  let air = airMix(col, rd, dist);
  let uk = underK();
  if (uk < 0.001) { return air; }
  // Depth-aware underwater fog: shallows stay clearer; deep basins denser + bluer.
  // Slightly stronger mid-range kill so the bed horizon softens into volume (no hard rim).
  let camDeep = max(-F.camPos.y, 0.0);
  let depthFog = mix(0.95, 1.85, sat(camDeep / 14.0)) * mix(0.9, 1.3, sat(F.camDamp));
  let keep = exp(-W_SIG * dist * depthFog) * smoothstep(280.0, 160.0, dist);
  var haze = waterFogIn(F.camPos, rd, dist) * (0.55 + 0.45 * sat(exp(-dist * 0.02)));
  haze = mix(haze, haze * vec3<f32>(0.5, 0.75, 1.2), sat(camDeep / 12.0));
  // Deep-only biolum veil in the fog integral (abyss band).
  let bio = smoothstep(8.0, 16.0, camDeep) * uk * (0.025 + 0.04 * n2(rd.xz * 3.0 + F.time * 0.05));
  haze += vec3<f32>(0.04, 0.2, 0.32) * bio;
  // Sparse drifting photophore motes along the view ray in the abyss.
  let mote = smoothstep(11.0, 18.0, camDeep) * uk;
  if (mote > 0.01) {
    let cell = floor(F.camPos.xz * 0.08 + rd.xz * dist * 0.04 + F.time * 0.08);
    let spark = n2(cell + 19.0);
    haze += vec3<f32>(0.08, 0.35, 0.48) * mote * smoothstep(0.82, 0.96, spark) * (0.4 + 0.6 * n2(cell.yx + F.time * 0.2));
  }
  let wet = col * keep + haze;
  return mix(air, wet, uk);
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
// The sun as it stands for anything under water. The surface bends its light toward the
// vertical, so down there it is never lower than 41 degrees, however low it is in the air.
fn sunUnder() -> vec3<f32> {
  let h = F.sunDir.xz * 0.75;
  return vec3<f32>(h.x, sqrt(1.0 - dot(h, h)), h.y);
}
// Caustics from the shared wave field: project along sunUnder to the surface, read the
// same Gerstner+FFT slopes/jacobian that displace the mesh, then fold a fine interference
// lattice modulated by that focus. Not an independent scrolling texture.
fn caustic(p: vec3<f32>, foot: f32) -> vec3<f32> {
  let depth = max(-p.y, 0.12);
  if (F.sunDir.y < 0.04) { return vec3<f32>(0.0); }
  let cell = mix(0.35, 0.85, sat(depth / 8.0));
  let seen = sat(1.7 - foot / (0.28 * cell));
  var net = vec3<f32>(1.0);
  if (seen > 0.0) {
    let L = sunUnder();
    let surf = p.xz - L.xz * (depth / max(L.y, 0.2));
    let fld = sampleField(surf);
    // Shared Gerstner seaAt only — no FFT shapeTex. Caustics run from terrain/mesh
    // (group 0) as well as water; FFT tiles stay on the water bind group.
    let S = seaAt(surf, fld.y, max(-fld.x, 0.25));
    let slopeLen = length(S.nrm.xz);
    let focus = sat((1.0 - S.jac) * 1.35) * (0.45 + 0.9 * sat(slopeLen * 2.4)) + S.brk * 0.55;
    let t = F.time * (0.32 + 0.28 * max(F.mood.w, 0.35));
    let dir = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
    // Domain warped by the live surface normal so cells dance with the waves.
    let warp = S.nrm.xz * (1.8 + depth * 0.15);
    let q = vec2<f32>(dot(surf + warp, dir), dot(surf + warp, vec2<f32>(-dir.y, dir.x)));
    let uv = q / (5.2 * cell);
    let uv2 = vec2<f32>(uv.x * 0.78 + uv.y * 0.62, uv.y * 0.78 - uv.x * 0.62) * 0.7 + vec2<f32>(0.37, 0.11);
    let uv3 = uv * 1.65 + S.disp.xz * 0.08;
    let split = vec2<f32>(0.007, 0.0045) * (1.0 + focus);
    let a = vec3<f32>(causWave(uv + split, t + 23.0), causWave(uv, t + 23.0), causWave(uv - split, t + 23.0));
    let b = causWave(uv2, t * 0.85 + 5.0);
    let c = causWave(uv3, t * 1.15 + 11.0);
    // Multi-scale: fine in shallows, broader/softer at depth.
    let fineW = mix(0.55, 0.15, sat(depth / 7.0));
    let thread = pow(min(a, vec3<f32>(b)) * mix(0.9, 1.05, fineW) * (0.75 + 0.45 * c), vec3<f32>(mix(1.85, 1.15, sat(depth / 9.0))));
    var web = min(thread, vec3<f32>(3.6)) * mix(1.15, 2.15, focus);
    // Chromatic edge from wavelength-dependent bend (approx).
    web *= vec3<f32>(1.05, 1.0, 0.94) + vec3<f32>(-0.04, 0.02, 0.06) * sat(focus);
    web = mix(web, pow(web, vec3<f32>(1.55)) * 0.78, underK());
    net = mix(net, web, seen * (0.55 + 0.45 * sat(focus + 0.2)));
  }
  let lit = cloudShade(p.xz, 0.0);
  let day = smoothstep(0.02, 0.12, F.sunTrue.y);
  let moon = (1.0 - day) * smoothstep(0.04, 0.25, F.moon.y) * sat(F.astroB.w * 16.0);
  // Brightest in shallow lagoon / shore (fine detail); broader & softer with depth — never gated off near 0.
  let depthK = mix(1.25, 0.4, sat(depth / 10.0)) * exp(-depth * 0.12);
  return net * (depthK * lit * (day + moon * 0.35) * 0.95);
}

// Procedural open-ocean floor (Abyssal layered noise). Continues past the terrain mesh
// so underwater views never hit a hard cliff into empty haze.
fn seaBedProc(xz: vec2<f32>) -> f32 {
  let r = length(xz);
  // Broad abyssal shelf that keeps sloping gently — never a flat plate or hard rim.
  var h = -12.5 - r * 0.009 - pow(r * 0.0011, 1.35) * 6.0;
  h += (n2(xz * 0.0014) - 0.5) * 14.0;
  h += (n2(xz * 0.0038 + vec2<f32>(7.2, 1.1)) - 0.5) * 7.0;
  h += (n2(xz * 0.0095 + vec2<f32>(4.1, 1.7)) - 0.5) * 3.2;
  h += (n2(xz * 0.028 + vec2<f32>(2.0, 9.0)) - 0.5) * 1.1;
  h += (n2(xz * 0.085) - 0.5) * 0.28;
  // Occasional sandbar / reef mound so the far bed has readable structure.
  let mound = smoothstep(0.72, 0.92, n2(xz * 0.0042 + vec2<f32>(11.0, 3.0)));
  h += mound * mound * 4.5;
  return min(h, -1.8);
}
fn seaBedAt(xz: vec2<f32>) -> f32 {
  let fld = sampleField(xz);
  let u = (xz.x - ORIGIN) / (SPAN * 2.0);
  let v = (xz.y - ORIGIN) / (SPAN * 2.0);
  // 0 deep inside the heightfield, 1 at/beyond the rim (where sampleField returns -26).
  let rim = max(max(-u, u - 1.0), max(-v, v - 1.0));
  let fade = smoothstep(-0.04, 0.1, rim);
  return mix(fld.x, seaBedProc(xz), fade);
}
fn seaBedNormal(xz: vec2<f32>) -> vec3<f32> {
  let e = 1.8;
  let hx = seaBedAt(xz + vec2<f32>(e, 0.0)) - seaBedAt(xz - vec2<f32>(e, 0.0));
  let hz = seaBedAt(xz + vec2<f32>(0.0, e)) - seaBedAt(xz - vec2<f32>(0.0, e));
  var n = normalize(vec3<f32>(-hx, e * 2.0, -hz));
  let g = n2(xz * 0.55) - 0.5;
  n = normalize(n + vec3<f32>(g, 0.0, n2(xz * 0.55 + 3.0) - 0.5) * 0.12);
  return n;
}
fn shadeFarBed(wp: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
  let Lw = sunUnder();
  let nl = max(dot(n, Lw), 0.0);
  let deep = sat(-wp.y / 22.0);
  let grain = n2(wp.xz * 0.35) * 0.55 + n2(wp.xz * 1.1) * 0.45;
  // Brighter coral-sand so the procedural continuation still reads as bed after Beer fog
  // (a fully fogged bed looked like the empty cyan void past the mesh rim).
  var alb = mix(vec3<f32>(0.72, 0.66, 0.52), vec3<f32>(0.22, 0.28, 0.30), deep);
  alb = mix(alb, vec3<f32>(0.55, 0.50, 0.40), grain * 0.4 * (1.0 - deep));
  alb *= mix(vec3<f32>(0.7, 0.74, 0.72), vec3<f32>(1.0), sat(deep * 1.2));
  let sun = sunEUnder(wp.y);
  var light = sun * (0.35 + 0.65 * nl) + waterAmbAG(wp, n) * 1.15 + waterSideAG(wp, n);
  let foot = length(wp - F.camPos) * 2.0 * F.tanHalf / max(F.res.y, 1.0);
  light += sun * max(nl, 0.15) * caustic(wp, foot) * mix(1.1, 0.4, deep);
  var col = alb * light;
  // Softer distance kill than full applyFog so mid-range bed keeps sand/caustic signal.
  let d = length(wp - F.camPos);
  let rd = (wp - F.camPos) / max(d, 1e-3);
  let depthFog = mix(0.75, 1.35, sat(-F.camPos.y / 14.0));
  let keep = exp(-W_SIG * d * depthFog * 0.72);
  let haze = waterFogIn(F.camPos, rd, d);
  return col * keep + haze * (0.5 + 0.5 * sat(exp(-d * 0.01)));
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
  // Small receiver offset — large sunDir lifts detached shadows from trunks and fronds.
  let sy = max(F.sunDir.y, 0.08);
  let recvFar = F.sunDir * (0.035 / sy);
  let c = F.shadowVP * vec4<f32>(p + recvFar, 1.0);
  let w = max(c.w, 1e-4);
  let raw = vec2<f32>(c.x / w * 0.5 + 0.5, 0.5 - c.y / w * 0.5);
  let uv = clamp(raw, vec2<f32>(0.001), vec2<f32>(0.999));
  // Depth bias in light space (~1–2 texels) instead of a metre-scale world offset.
  let z = clamp(c.z / w - 0.0012, 0.0, 1.0);
  let t = 1.0 / 2048.0;
  // CompareLevel: sunShadow is sampled from divergent water/leaf paths; plain Compare is illegal there.
  var s = 0.0;
  s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2<f32>(-t, -t), z);
  s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2<f32>(t, -t), z);
  s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2<f32>(-t, t), z);
  s += textureSampleCompareLevel(shadowMap, shadowSamp, uv + vec2<f32>(t, t), z);
  s += textureSampleCompareLevel(shadowMap, shadowSamp, uv, z);
  let inside = smoothstep(0.0, 0.04, raw.x) * smoothstep(1.0, 0.96, raw.x)
             * smoothstep(0.0, 0.04, raw.y) * smoothstep(1.0, 0.96, raw.y);
  let far = mix(shadowAt(p), s * 0.2, inside);
  // Close to the eye, the tight map. Soft penumbra matches sunlight past a frond.
  let recvNear = F.sunDir * (0.012 / sy);
  let cn = F.nearVP * vec4<f32>(p + recvNear, 1.0);
  let un = clamp(vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5), vec2<f32>(0.001), vec2<f32>(0.999));
  let zn = clamp(cn.z - 0.0008, 0.0, 1.0);
  let tn = 3.6 / 2048.0;
  var sn = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      sn += textureSampleCompareLevel(shadowNear, shadowSamp, un + vec2<f32>(f32(x), f32(y)) * tn, zn);
    }
  }
  // Wider soft handoff so cascade edges do not jump when the eye moves.
  let wn = 1.0 - smoothstep(0.62, 0.94, max(abs(cn.x), abs(cn.y)));
  return mix(far, sn / 9.0, wn);
}

// Microfacet GGX (shared by land materials). Energy-conserving with Fresnel + Schlick-GGX.
fn microSpec(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, rough: f32, F0: vec3<f32>) -> vec3<f32> {
  let a = max(rough * rough, 0.0025);
  let a2 = a * a;
  // Guard against V ≈ -L (zero-length half vector → NaN glitches).
  let Hraw = V + L;
  let hl = length(Hraw);
  if (hl < 1e-4) { return vec3<f32>(0.0); }
  let H = Hraw / hl;
  let ndh = max(dot(N, H), 0.0);
  let ndv = max(dot(N, V), 0.001);
  let ndl = max(dot(N, L), 0.0);
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  let D = a2 / max(PI * d * d, 1e-6);
  let k = (rough + 1.0) * (rough + 1.0) * 0.125;
  let G = (ndv / (ndv * (1.0 - k) + k)) * (ndl / (ndl * (1.0 - k) + k));
  let hv = max(dot(H, V), 0.0);
  let Fr = F0 + (1.0 - F0) * pow5(1.0 - hv);
  return Fr * (D * G * ndl) / max(4.0 * ndv, 1e-4);
}

// Land shading. Three lights and nothing else: the sun, shadowed; the sky and the ground's
// bounce, gathered over the hemisphere the surface faces and hidden by whatever canopy is
// overhead; and under trees the sunlight that has come down through the leaves. No fill, no
// tint: shade is the colour of the sky because the sky is what lights it.
fn shade(world: vec3<f32>, nrm: vec3<f32>, albedo: vec3<f32>, leaf: f32, gloss: f32) -> vec3<f32> {
  let n = normalize(nrm);
  let toCam = F.camPos - world;
  let V = toCam / max(length(toCam), 1e-4);
  let L = F.sunDir;
  // Seen from under water, the bed is lit by the sun where the surface has bent it to, less
  // what the surface turned back: steeper and through less water than the sun in the air.
  let dived = underK() > 0.35 && world.y < 0.02;
  let Lw = select(L, sunUnder(), dived);
  let nl = dot(n, Lw);
  let cs = cloudShade(world.xz, world.y);
  let sh = sunShadow(world) * cs;
  // How much of the sky a point under the forest can see: little at the floor, all of it above the crowns.
  let fld = sampleField(world.xz);
  let forest = smoothstep(1.8, 4.6, fld.x) * smoothstep(-0.65, -0.1, forestNoise(world.xz));
  let roof = forest * (1.0 - smoothstep(3.5, 10.0, world.y - fld.x));
  let skyVis = 1.0 - roof * mix(0.74, 0.5, sat(leaf));
  // Contact AO: soft darkening near the floor / against the bed — not a second shadow map.
  let hAbove = max(world.y - fld.x, 0.0);
  let contactAO = mix(0.72, 1.0, smoothstep(0.0, 1.35, hAbove)) * mix(0.88, 1.0, sat(n.y * 0.55 + 0.45));
  let wet = max(F.wx.y * step(0.05, world.y) * (1.0 - underK()), sat(gloss) * (1.0 - underK()) * 0.85);
  // Dry leaves are matte; rain only lifts their gloss a little. Non-leaf wet still goes
  // shiny. Gloss still opens the surface when asked (wet sand, coral).
  let leafK = sat(leaf);
  // Leaves stay matte: roughness up, F0 down — rain only lifts gloss a little.
  // Extra leaf roughness so crowns never read as wet plastic in dry sun.
  let rough = clamp(mix(0.78, 0.44, sat(gloss)) * mix(1.0, 1.48, leafK) * mix(1.0, mix(0.6, 0.92, leafK), wet), 0.12, 0.97);
  // Dielectric F0: dry ~4%, wet sand/rock lifts toward ~8%; leaves stay lower.
  let F0 = mix(mix(vec3<f32>(0.04), vec3<f32>(0.07), sat(gloss) * 0.85), vec3<f32>(0.022), leafK);
  // Thickness-aware wrap: thin tips (high leaf) catch more transmitted fill.
  let wrap = mix(0.22, 0.52, leafK);
  let sunDiff = sat((nl + wrap) / (1.0 + wrap));
  // Cheap ground bounce into the hemisphere (single bounce from average terrain albedo).
  let gndBounce = vec3<f32>(0.18, 0.16, 0.12) * F.day.rgb * max(-n.y, 0.0) * 0.22
    + vec3<f32>(0.22, 0.20, 0.14) * F.day.rgb * sat(n.y) * 0.06 * (1.0 - roof);
  var light = (F.sunCol * sunDiff * sh
    + skyIrr(n) * skyVis
    + gndBounce * skyVis
    + boltOnSurf(world, n, 1.05) * mix(0.62, 1.0, skyVis)
    + F.sunCol * vec3<f32>(0.3, 0.42, 0.13) * (0.11 * roof * max(L.y, 0.0) * cs)) * contactAO;
  // A crown gap (fsShadowMesh) prints on the floor. Only under the roof, only near
  // the ground, and only where the shadow map is actually open: open sand is unchanged.
  let onFloor = 1.0 - smoothstep(0.35, 2.6, world.y - fld.x);
  let floorLit = sat((sh - 0.42) * 2.2) * roof * onFloor * max(L.y, 0.03) * (1.0 - 0.55 * sat(F.wx.x));
  light += F.sunCol * vec3<f32>(1.02, 0.9, 0.58) * floorLit * 0.36;
  if (world.y < 0.08) {
    let depth = max(-world.y, 0.0);
    // Wavelength-dependent Beer: red falls first → turquoise shallow, cyan/blue deep.
    let absorb = exp(W_KD * (-depth) / max(Lw.y, 0.12))
      * mix(1.0, 1.0 - 0.98 * pow(1.0 - sat(F.sunDir.y), 5.0), underK());
    let depthTone = mix(vec3<f32>(1.05, 1.0, 0.92), vec3<f32>(0.55, 0.85, 1.15), sat(depth / 9.0));
    light *= mix(vec3<f32>(1.0), absorb * depthTone * (0.5 + 0.5 * sat(depth / 8.0 + 0.2)), sat(depth / 0.06));
    // Caustics on seabed even in ankle-deep shallows / lagoon (not deep-only).
    if (world.y < 0.02) {
      let k = smoothstep(0.0, 0.25, depth) * exp(-depth * 0.28);
      let foot = length(toCam) * 2.0 * F.tanHalf / F.res.y / max(abs(V.y), 0.12);
      let causK = mix(2.4, 3.6, underK());
      // Extra punch in the top 2 m where multi-scale detail must read.
      let nearShore = mix(1.35, 1.0, sat(depth / 2.2));
      light += F.sunCol * max(nl, 0.0) * sh * (caustic(world, foot) * causK * nearShore - 0.06 * k) * absorb;
    }
  }
  {
    let uk = underK();
    if (uk > 0.01) {
      let d = max(-world.y, 0.0);
      // Abyssal Garden underwater lighting: sunE + amb + side + fill (Beer SIG/KD).
      let agSun = sunEUnder(world.y) * max(nl, 0.0) * mix(1.0, sh, 0.55);
      let agAmb = waterAmbAG(world, n) + waterSideAG(world, n);
      let fill = waterFill(d) * mix(vec3<f32>(1.1, 1.05, 0.9), vec3<f32>(0.7, 0.95, 1.2), sat(d / 8.0));
      let footU = length(toCam) * 2.0 * F.tanHalf / max(F.res.y, 1.0) / max(abs(V.y), 0.12);
      let agCaus = agSun * caustic(world, footU) * mix(0.95, 0.3, sat(d / 12.0));
      var agLight = agSun * 0.92 + agAmb + agCaus + fill * (0.55 + 0.45 * (n.y * 0.5 + 0.5));
      // Blend toward AG as immersion/depth rise — keeps above-water land lighting intact.
      let agW = uk * mix(0.5, 0.95, sat(d / 1.8 + underK() * 0.35));
      light = mix(light, agLight, agW);
      // Deep bioluminescence on the bed — only below the reef, stronger in the abyss.
      let deepK = smoothstep(7.5, 14.0, d) * uk;
      let abyssK = smoothstep(12.0, 18.0, d) * uk;
      if (deepK > 0.01) {
        let glow = n3(world * 0.35 + vec3<f32>(0.0, F.time * 0.04, 0.0));
        let pulse = 0.55 + 0.45 * sin(F.time * 0.7 + glow * 12.0 + world.x * 0.2);
        light += vec3<f32>(0.05, 0.22, 0.35) * deepK * pulse * smoothstep(0.55, 0.85, glow) * (0.35 + 0.65 * sat(n.y));
        let dots = n3(world * 1.8 + vec3<f32>(F.time * 0.02, 0.0, 3.0));
        light += vec3<f32>(0.1, 0.45, 0.6) * abyssK * smoothstep(0.78, 0.92, dots)
          * (0.5 + 0.5 * sin(F.time * 1.6 + dots * 20.0)) * (0.4 + 0.6 * sat(n.y));
      }
    }
  }
  let alb = albedo * mix(1.0, mix(0.58, 0.84, sat(leaf)), wet);
  // A leaf is seen from either side. A rough surface never becomes a mirror at a glancing
  // angle: its facets face every way, so its edge-on reflectance stops well short of one.
  let nv = dot(n, V);
  let ndv = mix(max(nv, 0.0), abs(nv), sat(leaf));
  let Fs = F0 + (max(vec3<f32>(1.0 - rough), F0) - F0) * 0.6 * pow5(1.0 - ndv);
  var col = alb * (1.0 - Fs) * light;
  // The sun's highlight, and the sky mirrored in whatever is smooth enough to mirror it.
  // Leaves take a softer highlight than bark or wet sand, so a crown does not read as wax.
  // Under water the highlight follows the refracted sun (Lw), same as diffuse.
  col += F.sunCol * microSpec(n, V, Lw, rough, F0) * sh * mix(1.85, 0.48, leafK);
  col += skyDim(reflect(-V, n)) * Fs * skyVis * sat(n.y * 1.4 + 0.4) * mix(1.0, 0.28, leafK);
  // Transmission scales with leaf thickness proxy: thin tips glow more, thick bases less.
  // Keep grazing edge soft — heavy edge boost read as a blurry green halo on silhouettes.
  let edge = pow(1.0 - ndv, 2.4);
  let thin = mix(0.5, 1.25, clamp(leaf * 0.55, 0.0, 1.0));
  // Chlorophyll transmission: thin blades pass yellow-green, thick ones stay dark.
  // The shadowed floor is what you see looking up into a crown with the sun behind it.
  let trans = max(-nl, 0.0) * leaf * (0.55 + 0.45 * edge) * thin;
  col += alb * vec3<f32>(0.68, 1.34, 0.26) * F.sunCol * trans * mix(0.24, 0.88, sh);
  if (world.y > -0.15 && world.y < 1.1 && leaf < 0.5) {
    let shoreWet = 1.0 - sat(world.y / 0.7);
    col += F.sunCol * microSpec(n, V, Lw, 0.22, vec3<f32>(0.05)) * sh * shoreWet * 0.28;
  }
  return applyFog(col, world);
}

fn forestNoise(p: vec2<f32>) -> f32 {
  return sin(p.x * 0.031 + 1.3) * sin(p.y * 0.027 + 0.5)
    + 0.6 * sin((p.x + p.y) * 0.053 + 2.1) * sin((p.x - p.y) * 0.047 + 0.4)
    + 0.35 * sin(p.x * 0.11 + 3.0) * sin(p.y * 0.13 + 1.0);
}
// Domain-warped cluster field — mirrors JS clusterField; soft lobes, not rings.
fn clusterField(p: vec2<f32>) -> f32 {
  let w0 = (n2(p * 0.018 + vec2<f32>(17.1, 3.7)) - 0.5) * 14.0;
  let w1 = (n2(p * 0.018 + vec2<f32>(9.2, 21.4)) - 0.5) * 14.0;
  let q = p + vec2<f32>(w0, w1);
  let w2 = (n2(q * 0.055 + vec2<f32>(2.0, 5.0)) - 0.5) * 4.5;
  let w3 = (n2(q * 0.055 + vec2<f32>(8.0, 1.0)) - 0.5) * 4.5;
  let b = q + vec2<f32>(w2, w3);
  let broad = n2(b * 0.011 + vec2<f32>(1.1, 0.0));
  let mid = n2(b * 0.038 + vec2<f32>(4.7, 0.0));
  let fine = n2(b * 0.11 + vec2<f32>(8.3, 0.0));
  return sat(broad * 0.48 + mid * 0.34 + fine * 0.22);
}
// Soft contact disks under land grass tufts and flower/shrub feet. Density is metres⁻¹;
// returns 0..1 darkening weight (centre of a planted clump ≈ 1).
fn plantContactDisks(p: vec2<f32>, density: f32) -> f32 {
  let q = p * density;
  let c = floor(q);
  var best = 9.0;
  var str = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = c + vec2<f32>(f32(i), f32(j));
      let h = hash22(g);
      let k = hash21(g + vec2<f32>(11.0, 5.0));
      // Skip sparse cells so open sand stays bright between clumps.
      if (k < 0.28) { continue; }
      let d = length(g + 0.1 + 0.8 * h - q) / (0.34 + 0.62 * k);
      if (d < best) {
        best = d;
        str = 0.6 + 0.4 * k;
      }
    }
  }
  // Soft falloff with a darker core so contact reads under soft shadow-map filtering.
  return sat(1.15 - best) * str * sat(1.35 - best * 0.85);
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
  sandC *= 0.94 + 0.05 * wash + 0.04 * (n2(xz * 18.0) - 0.5);
  // Sparse shell grit / darker flecks — irregular, not a noise carpet.
  sandC = mix(sandC, sandC * vec3<f32>(0.78, 0.74, 0.66), smoothstep(0.78, 0.92, n2(xz * 6.5)) * 0.35);
  // Sand the last high wash reached is still damp: darker, and it ends at a ragged line.
  let damp = 1.0 - smoothstep(-0.035, 0.035, y - dampLine(xz));
  sandC = mix(sandC, sandC * vec3<f32>(0.56, 0.55, 0.52), damp * 0.85);
  let wet = smoothstep(0.2, 0.0, y);
  sandC = mix(sandC, sandC * vec3<f32>(0.62, 0.66, 0.66), wet * 0.7);
  if (y < 0.05) { sandC = mix(vec3<f32>(0.70, 0.64, 0.50), sandC, sat(-y * 0.4 + 0.3)); }
  var grassC = mix(vec3<f32>(0.07, 0.115, 0.038), vec3<f32>(0.16, 0.19, 0.075), m);
  grassC *= 0.78 + 0.32 * n2(xz * 0.22);
  grassC = mix(grassC, vec3<f32>(0.32, 0.3, 0.13), smoothstep(3.5, 0.9, y) * 0.28);
  grassC = mix(grassC, grassC * 0.72, smoothstep(0.55, 0.85, n2(xz * 1.4)) * 0.45);
  // Pull chroma — tropical turf in photos is duller than game “lush green.”
  grassC = mix(grassC, vec3<f32>(dot(grassC, vec3<f32>(0.3, 0.55, 0.15))), 0.28);
  // Multi-layer forest floor: soil/debris → moss → litter under canopy (domain-warped).
  let forest = smoothstep(1.9, 4.4, y) * (1.0 - smoothstep(0.12, 0.29, slope)) * smoothstep(-0.62, -0.12, forestNoise(xz));
  let clump = clusterField(xz);
  let moist = smoothstep(0.2, 2.2, y) * (1.0 - smoothstep(0.2, 0.7, slope)) * (0.45 + 0.55 * n2(xz * 0.02 + vec2<f32>(3.0, 0.0)));
  // Bare soil / woody debris under dense cover — base layer before moss and litter.
  let soil = mix(vec3<f32>(0.055, 0.042, 0.028), vec3<f32>(0.1, 0.078, 0.045), n2(xz * 1.7));
  let debris = mix(vec3<f32>(0.08, 0.055, 0.03), vec3<f32>(0.14, 0.1, 0.055), n2(xz * 3.2 + vec2<f32>(2.0, 5.0)));
  let debrisK = forest * smoothstep(0.35, 0.7, clump) * (0.35 + 0.45 * n2(xz * 2.4));
  grassC = mix(grassC, mix(soil, debris, n2(xz * 0.8)), debrisK * 0.85);
  // Moss cushions in moist shade — soft green, irregular patches (no ring edges).
  let mossC = mix(vec3<f32>(0.035, 0.15, 0.03), vec3<f32>(0.09, 0.22, 0.055), n2(xz * 2.1));
  let mossK = sat(moist * 0.65 + forest * 0.85) * smoothstep(0.18, 0.55, clump)
    * (0.45 + 0.55 * n2(xz * 0.9 + vec2<f32>(4.0, 1.0))) * (1.0 - smoothstep(0.35, 0.7, slope));
  grassC = mix(grassC, mossC, mossK * 0.88);
  // Leaf litter on top of moss/soil in deep canopy.
  let litter = mix(vec3<f32>(0.035, 0.045, 0.022), vec3<f32>(0.075, 0.062, 0.035), n2(xz * 0.9));
  grassC = mix(grassC, litter, forest * 0.72 * smoothstep(0.2, 0.6, clump));
  // Beach→jungle: dry straw fringe gives way to richer turf inland (no hard band).
  let beachFringe = smoothstep(2.6, 0.4, y) * (1.0 - forest) * smoothstep(0.3, 0.7, n2(xz * 0.05));
  grassC = mix(grassC, grassC * vec3<f32>(1.15, 1.05, 0.85), beachFringe * 0.22);
  var rockC = mix(vec3<f32>(0.40, 0.38, 0.34), vec3<f32>(0.22, 0.21, 0.19), m);
  rockC *= 0.84 + 0.2 * sin(y * 1.4 + m * 5.0) + 0.08 * (n2(xz * 4.2) - 0.5);
  rockC = mix(rockC, vec3<f32>(0.34, 0.36, 0.22), smoothstep(0.62, 0.86, n2(xz * 0.35)) * (1.0 - slope));
  // Weathered lichen / damp seepage on shaded faces.
  rockC = mix(rockC, rockC * vec3<f32>(0.7, 0.78, 0.62), smoothstep(0.55, 0.2, n.y) * smoothstep(0.45, 0.8, n2(xz * 1.1)) * 0.4);
  // Structure reclaim: moss blankets on rock crowns and damp ledges.
  let rockMoss = smoothstep(0.4, 0.9, n.y) * smoothstep(0.3, 0.75, moist + clump * 0.5)
    * (0.35 + 0.65 * n2(xz * 1.4 + vec2<f32>(6.0, 2.0)));
  rockC = mix(rockC, mossC * 0.85, rockMoss * 0.55);
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
  // Outside the heightfield (±SPAN) sampleField is the −26 sentinel — use the procedural
  // infinite bed so the abyss skirt mesh shades like open-ocean floor, not a flat plate.
  let fld0 = sampleField(in.world.xz);
  let outside = select(0.0, 1.0, fld0.x < -25.5);
  var n: vec3<f32>;
  if (outside > 0.5) {
    n = seaBedNormal(in.world.xz);
  } else {
    n = normalize(vec3<f32>(
      sampleField(in.world.xz - vec2<f32>(TEXEL, 0.0)).x - sampleField(in.world.xz + vec2<f32>(TEXEL, 0.0)).x,
      TEXEL * 2.0,
      sampleField(in.world.xz - vec2<f32>(0.0, TEXEL)).x - sampleField(in.world.xz + vec2<f32>(0.0, TEXEL)).x
    ));
  }
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
    // Wet reflective film + residual foam after swash retreats (solver wet/ground channels).
    // Activity (foam + sheet speed) darkens a longer tongue inland than a still sheet.
    let wetEdge = n2(in.world.xz * 2.8) * 0.045;
    let act = sat(sh.foam * 1.1 + length(sh.vel) * 0.08);
    washWet = max(sh.wet * smoothstep(0.18 + wetEdge, 0.0, sh.h), sh.wet * (0.4 + 0.35 * act) * smoothstep(0.24, 0.0, sh.h));
    washWet = max(washWet, sh.wet * 0.55 * act * smoothstep(0.12, 0.0, sh.h));
    let distT = length(in.world - F.camPos);
    let footT = distT * F.tanHalf * 2.0 / max(F.res.y, 1.0) / max(abs(F.camPos.y - in.world.y) / max(distT, 0.1), 0.08);
    let leave = max(sh.foam, sh.wet * (0.22 + 0.2 * act)) * smoothstep(0.12, 0.0, sh.h)
      * (0.5 + 0.5 * n2(in.world.xz * 1.6 + vec2<f32>(F.time * 0.05, 0.0)));
    washFoam = foamCover(in.world.xz, leave * 0.95, footT);
  }
  // Soft contact under ALL land grass, small plants and flowering shrubs — complements
  // shadow-map casters (groundPL grass + mesh flowers) so sand still reads planted in soft light.
  if (in.world.y > 0.08 && in.world.y < 28.0 && slope < 0.62) {
    let gPatch = n2(in.world.xz * 0.028);
    let gFine = n2(in.world.xz * 0.09 + vec2<f32>(4.0, 0.0));
    // Match grassDens bands: dune fringe (~0.2–1.35) and inland meadow (~1.05–28).
    let meadow = smoothstep(0.85, 1.55, in.world.y) * (1.0 - smoothstep(22.0, 30.0, in.world.y));
    let dune = smoothstep(0.1, 0.32, in.world.y) * (1.0 - smoothstep(1.15, 1.7, in.world.y));
    let grassHere = sat(gPatch - 0.16) * (0.45 + 0.55 * gFine) * max(meadow, dune);
    let shrub = smoothstep(0.4, 0.82, n2(in.world.xz * 0.045 + vec2<f32>(2.0, 0.0)))
      * smoothstep(0.2, 1.5, in.world.y) * (1.0 - smoothstep(7.0, 12.0, in.world.y));
    // Flower belts (open sun behind beach / lagoon / forest edge) share shrub patch noise.
    let flowerBed = shrub * smoothstep(0.5, 2.2, in.world.y) * (1.0 - smoothstep(8.0, 11.0, in.world.y));
    let fernFloor = smoothstep(1.2, 3.0, in.world.y) * (1.0 - smoothstep(10.0, 16.0, in.world.y))
      * smoothstep(0.3, 0.7, n2(in.world.xz * 0.06 + vec2<f32>(6.0, 1.0)));
    let woodFloor = smoothstep(1.9, 4.4, in.world.y) * smoothstep(-0.62, -0.12, forestNoise(in.world.xz));
    let clumpAO = clusterField(in.world.xz);
    let mossAO = woodFloor * smoothstep(0.3, 0.7, clumpAO) * (0.5 + 0.5 * n2(in.world.xz * 1.2));
    let vineAO = woodFloor * smoothstep(0.45, 0.8, clumpAO) * smoothstep(0.55, 0.85, n2(in.world.xz * 0.07 + vec2<f32>(3.0, 8.0)));
    // Per-tuft / per-plant contact disks (tight under blades, wider under flower shrubs).
    let grassDisk = plantContactDisks(in.world.xz, 1.9) * max(grassHere, dune * 0.85);
    let grassDisk2 = plantContactDisks(in.world.xz * 1.35 + vec2<f32>(8.2, 2.1), 3.1) * grassHere;
    let flowerDisk = plantContactDisks(in.world.xz * 0.72 + vec2<f32>(3.1, 7.4), 0.62) * max(flowerBed, shrub * 0.9);
    let fernDisk = plantContactDisks(in.world.xz * 0.9 + vec2<f32>(1.7, 4.2), 0.95) * fernFloor;
    let plantAO = sat(
      grassHere * 0.5 + grassDisk * 0.95 + grassDisk2 * 0.55
      + shrub * 0.45 + flowerBed * 0.48 + flowerDisk * 0.85
      + fernFloor * 0.4 + fernDisk * 0.65
      + woodFloor * 0.3 + mossAO * 0.4 + vineAO * 0.22
    ) * (0.78 + 0.22 * n2(in.world.xz * 1.7));
    // Stronger near the eye so contact reads; far meadows keep a soft fill only.
    let nearPlant = mix(0.62, 1.0, sat(1.55 - foot * 7.0));
    alb *= 1.0 - plantAO * (0.62 * nearPlant + 0.22);
  }
  // Rain wets the ground everywhere, and it stays dark after the shower until it dries.
  let rainWet = F.wx.y * step(0.0, in.world.y) * (0.75 + 0.25 * n2(in.world.xz * 0.6));
  // Dew darkens sand without making a mirror of it; that takes a soaking.
  washWet = max(washWet, rainWet * 0.8 * smoothstep(0.2, 0.7, rainWet));
  // Feed wetness into PBR gloss so shade() roughness/F0 match the mirror film below.
  let gloss = max(smoothstep(0.26, 0.02, in.world.y) * smoothstep(-0.9, -0.35, in.world.y), washWet * sandy) * (1.0 - slope * 3.0);
  // Rock faces keep a faint sheen; dry sand stays matte.
  let matGloss = max(gloss, smoothstep(0.55, 0.88, slope) * 0.08 * (1.0 - sandy));
  var col = shade(in.world, n, alb, 0.0, matGloss);
  // Wet sand is a mirror at a low angle. Dry sand never is.
  let Vt = normalize(F.camPos - in.world);
  if (gloss > 0.01 && underK() < 0.5) {
    let nw = normalize(mix(n, vec3<f32>(0.0, 1.0, 0.0), 0.8));
    let fr = 0.02 + 0.98 * pow5(1.0 - dot(nw, Vt));
    col = mix(col, applyFog(skyReflect(reflect(-Vt, nw)), in.world), sat(fr * gloss * 0.9));
  }
  if (washWet > 0.04 || washFoam > 0.02) {
    // Wet sand goes darker and slightly specular; foam is a sparse lace, not a white band.
    col *= mix(1.0, 0.48, washWet * (1.0 - washFoam * 0.35));
    let Vw = normalize(F.camPos - in.world);
    let nw = normalize(mix(n, vec3<f32>(0.0, 1.0, 0.0), 0.55));
    let frWet = 0.04 + 0.96 * pow5(1.0 - sat(dot(nw, Vw)));
    let spec = pow(sat(dot(n, normalize(F.sunDir + Vw))), mix(18.0, 42.0, washWet)) * washWet;
    col += vec3<f32>(0.2, 0.21, 0.2) * F.sunCol * spec * (0.75 + 0.35 * washWet);
    // Grazing film: a thin sky gleam on the wet strip without bleaching dry sand.
    col = mix(col, applyFog(skyReflect(reflect(-Vw, nw)), in.world), sat(frWet * washWet * 0.45));
    let sun = 0.58 + 0.55 * max(dot(n, F.sunDir), 0.0);
    let foamTint = mix(vec3<f32>(0.78, 0.82, 0.8), vec3<f32>(0.9, 0.92, 0.9), washFoam);
    col = mix(col, foamTint * F.day.rgb * sun, washFoam * 0.42);
  }
  return vec4<f32>(col, 1.0);
}

// A leaflet narrower than a pixel is shaded for a pixel whose centre it misses. Read at the
// centre these would be read from beyond its edge, where colour and normal run on to
// values no leaf has; centroid reads them from the part of the pixel it does cover.
struct MeshV {
  @builtin(position) clip: vec4<f32>,
  @location(0) @interpolate(perspective, centroid) world: vec3<f32>,
  @location(1) @interpolate(perspective, centroid) nrm: vec3<f32>,
  @location(2) @interpolate(perspective, centroid) col: vec3<f32>,
  @location(3) @interpolate(perspective, centroid) kind: f32,
  @location(4) @interpolate(perspective, centroid) uv: vec2<f32>,
  // Pre-wind plant space — foliage cutouts must not crawl when the crown sways.
  @location(5) @interpolate(perspective, centroid) rest: vec3<f32>,
  // Between two levels of detail: how far the change has gone (see fsMesh).
  @location(6) @interpolate(flat) fade: f32,
  // A number of its own for each leaf, the same at all its vertices.
  @location(7) @interpolate(flat) leaf: f32,
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
// i1.z holds how open the plant stands to the wind, under 2, and above that twice the
// number that says how far it is between two levels of detail.
fn windExpo(z: f32) -> f32 { return z - 2.0 * floor(z * 0.5); }
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
// Shared underwater current from trades + a slow wave-driven swirl (m/s-ish, unitless push).
fn seaCurrent(xz: vec2<f32>) -> vec2<f32> {
  let trades = F.wind.xy * (0.35 + 0.08 * F.wind.z);
  let swirl = vec2<f32>(
    sin(F.time * 0.31 + xz.x * 0.04 + xz.y * 0.02),
    cos(F.time * 0.27 + xz.y * 0.035 - xz.x * 0.018)
  );
  let gust = n2(xz * 0.03 - F.windOff.zw * 0.2) - 0.5;
  return trades * (0.85 + 0.3 * gust) + swirl * (0.22 + 0.08 * F.wind.z);
}
// Soft underwater lean along a stem height — bend grows with length, not base-only rotate.
fn underSway(at: vec2<f32>, h: f32, soft: f32) -> vec3<f32> {
  let cur = seaCurrent(at);
  let t = max(h, 0.0);
  // Bend grows along the stem; deeper soft fronds take a longer period swell.
  let along = t * t * (0.55 + 1.15 * soft);
  let phase = F.time * (0.52 + 0.28 * soft) + at.x * 0.04 + at.y * 0.03 + t * 0.35;
  let flutter = sin(phase) * 0.38 + sin(phase * 1.7 + 1.1) * 0.2 + sin(phase * 0.37 + 2.2) * 0.12;
  let push = cur * (along * (0.72 + 0.48 * flutter));
  let across = vec2<f32>(-cur.y, cur.x) * (along * 0.24 * sin(phase * 0.85 + 0.4));
  let drop = length(push + across) * (0.12 + 0.12 * soft);
  return vec3<f32>(push.x + across.x, -drop, push.y + across.y);
}
// Where a part of a plant is in the rocking of its boughs, from how far it stands from the
// foot of the plant on the plan. It turns about a radian in a metre and a half: neighbours
// move nearly together, the two sides of a big crown do not, and nothing is pulled apart.
fn boughAt(off: vec2<f32>) -> f32 { return dot(off, vec2<f32>(0.55, 0.38)); }
// How a part of a plant standing at a place gives to the wind, per unit of a vertex's sway:
// downwind, across the wind, then the wind speed it feels and a number of its own. The
// plant has mass: it leans with the pressure and rocks slowly at its own rate, and its
// boughs rock faster on top of that, each at its own moment (ph, from boughAt). The lean
// stops growing in a gale, as a crown that has streamlined does. Anything sitting on the
// plant asks the same question and so moves with it.
fn plantLeanFromV(at: vec2<f32>, scale: f32, soft: f32, v: f32, ph: f32) -> vec4<f32> {
  let id = fract(at.x * 0.137 + at.y * 0.291);
  let stiff = mix(0.55, 1.35, sat(soft));
  let push = v * v * 0.011 / (1.0 + v * v * 0.012) * stiff;
  // Big plants are slow. soft (i1.w) is species stiffness; scale is mass.
  let rate = (1.35 + 0.9 * id) / (sqrt(max(scale, 0.3)) * mix(0.75, 1.25, sat(soft)));
  let rock = sin(F.time * rate + id * 40.0) * 0.45 + sin(F.time * rate * 0.37 + id * 11.0) * 0.25;
  let rb = rate * 2.6 + 0.5;
  let bough = sin(F.time * rb + ph + id * 17.0) * 0.3 + sin(F.time * rb * 1.71 + ph * 1.9 + id * 29.0) * 0.16;
  let side = sin(F.time * rb * 0.83 + ph * 1.4 + id * 7.0) * 0.26;
  return vec4<f32>(push * (0.75 + rock + bough), push * (0.3 * sin(F.time * rate * 0.61 + id * 23.0) + side), v, id);
}
fn plantLean(at: vec2<f32>, scale: f32, expo: f32, soft: f32, ph: f32) -> vec4<f32> {
  return plantLeanFromV(at, scale, soft, windAt(at) * expo, ph);
}
fn plantShift(L: vec2<f32>, sway: f32) -> vec3<f32> {
  let d = F.wind.xy * L.x + vec2<f32>(-F.wind.y, F.wind.x) * L.y;
  return vec3<f32>(d.x * sway * 1.15, -length(d) * sway * sway * 0.28, d.y * sway * 1.15);
}
// Height-powered tip flutter — capped so tall palm crowns do not tear at the tips.
fn tipSway(at: vec2<f32>, h: f32) -> vec2<f32> {
  let ph = dot(at, vec2<f32>(0.031, 0.017));
  let hh = min(max(h, 0.0), 4.2);
  // Equivalent envelopes without three pow() — hh in [0,4.2].
  let a0 = 0.006 * hh * (0.97 + 0.03 * hh);
  let a1 = 0.007 * hh * (0.92 + 0.08 * hh);
  let a2 = 0.0028 * hh * (0.85 + 0.15 * hh);
  let t = F.time;
  return a0 * vec2<f32>(sin(t * 0.22 + ph), cos(t * 0.18 + ph * 1.2))
    + a1 * vec2<f32>(sin(t * 0.55 + ph + hh * 0.09), cos(t * 0.42 + ph * 1.3 + hh * 0.07))
    + a2 * vec2<f32>(sin(t * 1.35 + ph * 2.8 + hh * 0.28), cos(t * 1.1 + ph * 2.0 + hh * 0.22));
}
// Shared plant lean + low-frequency tip sway for shadow casters.
// Matches the lit crown phase without leaflet flutter (that would flicker the maps).
fn meshPlaceLean(in: MeshIn) -> vec3<f32> {
  var w = spinY(in.p * vec3<f32>(in.i1.x, in.i1.x * in.i1.y, in.i1.x), in.i0.w) + in.i0.xyz;
  if (in.c.w <= 0.0) { return w; }
  if (in.i0.y < -0.3) {
    let h = max(w.y - in.i0.y, 0.0);
    let sw = underSway(in.i0.xz, h * (0.35 + 0.9 * sat(in.c.w * 4.0)), sat(in.c.w * 5.0));
    w += sw * (0.55 + 0.45 * sat(in.c.w * 3.0));
    return w;
  }
  let L = plantLean(in.i0.xz, in.i1.x, windExpo(in.i1.z), in.i1.w, boughAt(w.xz - in.i0.xz));
  let k = i32(in.n.w + 0.5);
  var along = L.x;
  var across = L.y;
  if (k == 1) { along *= 0.32; across *= 0.32; }
  let sw = in.c.w * select(0.55, 1.0, k == 2 || k == 3);
  var out = w + plantShift(vec2<f32>(along, across), sw);
  // Same tipSway as the lit pass (damped) — keeps frond shadows attached while crowns move.
  if (k == 2 || k == 3 || (k == 0 && in.c.w > 0.05)) {
    let tipK = select(sat(in.uv.y) * sat(in.uv.y), 0.65, k != 2);
    let h = min(max(out.y - in.i0.y, 0.0), 4.5) * (0.35 + 0.65 * sat(in.c.w * 6.0));
    let tw = tipSway(in.i0.xz + vec2<f32>(L.w * 3.1, L.w * 1.7), h) * 0.72 * tipK;
    out.x += tw.x; out.z += tw.y;
    out.y -= (abs(tw.x) + abs(tw.y)) * 0.1;
  }
  return out;
}
// How one vertex of a plant gives to the wind. Leaflet verts of one blade must share phase.
fn meshPlace(in: MeshIn) -> vec3<f32> {
  var w = spinY(in.p * vec3<f32>(in.i1.x, in.i1.x * in.i1.y, in.i1.x), in.i0.w) + in.i0.xyz;
  if (in.c.w <= 0.0) { return w; }
  if (in.i0.y < -0.3) {
    // Soft fans / kelp / whips: current-driven bend along stem height (shared seaCurrent).
    let h = max(w.y - in.i0.y, 0.0);
    let soft = sat(in.c.w * 5.0);
    let sw = underSway(in.i0.xz, h * (0.4 + soft), soft);
    w += sw * (0.65 + 0.55 * soft);
    return w;
  }
  // Fade high-frequency flutter with distance — cheaper + stops distant crown sparkle.
  let dist = length(in.i0.xyz - F.camPos);
  let nearW = 1.0 - smoothstep(35.0, 120.0, dist);
  // The lean, the rocking and the gusts are the same at any distance, and the same as the
  // shadow's: a forest seen from the air moves as it does from under it.
  let off = w.xz - in.i0.xz;
  let L = plantLean(in.i0.xz, in.i1.x, windExpo(in.i1.z), in.i1.w, boughAt(off));
  let v = L.z;
  let id = L.w;
  let k = i32(in.n.w + 0.5);
  var along = L.x;
  var across = L.y;
  if (k == 2 && nearW > 0.02) {
    // The phase runs along the leaf by its uv, and from leaf to leaf by where the leaf is on
    // the plant, gently enough (a radian in 40 cm) that one blade is not stretched by it.
    // Without that every leaf of a plant fluttered in step.
    let tip = sat(in.uv.y);
    let ph = F.time * (1.55 + 0.45 * v) + id * 19.0 + in.i2.w * 11.0 + in.uv.y * 2.4 + abs(in.uv.x) * 0.15
      + dot(off, vec2<f32>(2.1, 1.6));
    // Tip flutter only. The crown's lean already moved this vertex with its bough;
    // a larger term lifted whole leaves off the twigs they belong to.
    let fl = (sin(ph) + 0.32 * sin(ph * 2.15 + 1.1))
      * (0.002 + 0.0036 * v) * tip * tip * nearW * select(1.0, 0.12, in.uv.y < -0.5);
    along += fl;
    across += fl * 0.45 * cos(ph * 0.68 + 0.5);
  } else if (k == 3 && nearW > 0.02) {
    along += sin(F.time * (1.2 + 0.35 * id) + id * 7.0) * 0.004 * v * nearW;
    across += sin(F.time * (0.75 + 0.3 * id) + id * 5.0) * 0.0025 * v * nearW;
  } else if (k == 1) {
    along *= 0.32; across *= 0.32;
  }
  var out = w + plantShift(vec2<f32>(along, across), in.c.w);
  // Secondary tip motion: shared plant-space phase, capped height, tip-weighted for leaflets.
  if ((k == 2 || k == 3 || (k == 0 && in.c.w > 0.05)) && nearW > 0.02) {
    let tipK = select(sat(in.uv.y) * sat(in.uv.y), 0.65, k != 2);
    let h = min(max(out.y - in.i0.y, 0.0), 4.5) * (0.35 + 0.65 * sat(in.c.w * 6.0));
    let tw = tipSway(in.i0.xz + vec2<f32>(id * 3.1, id * 1.7), h)
      * mix(0.28, 0.55, sat(v / 7.0)) * tipK * nearW;
    out.x += tw.x; out.z += tw.y;
    out.y -= (abs(tw.x) + abs(tw.y)) * 0.1;
  }
  return out;
}
@vertex fn vsMesh(in: MeshIn) -> MeshV {
  var o: MeshV;
  o.rest = spinY(in.p * vec3<f32>(in.i1.x, in.i1.x * in.i1.y, in.i1.x), in.i0.w) + in.i0.xyz;
  o.world = meshPlace(in);
  o.nrm = spinY(normalize(in.n.xyz / vec3<f32>(1.0, in.i1.y, 1.0)), in.i0.w);
  // Sub-pixel depth separation for overlapping leaflets/crowns — kills aerial z-fight sparkle.
  if (in.n.w > 1.5 && in.n.w < 3.5) {
    let id = fract(in.i0.x * 0.137 + in.i0.z * 0.291 + in.i2.w * 3.1 + in.uv.x * 0.07);
    o.world += o.nrm * (id * 0.014 + 0.002);
  }
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
  o.fade = floor(in.i1.z * 0.5);
  o.leaf = fract(in.n.w) * 2.5;
  o.clip = F.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}
struct ShadowV { @builtin(position) clip: vec4<f32> }
struct ShadowMV {
  @builtin(position) clip: vec4<f32>,
  @location(0) rest: vec3<f32>,
  // Kind, seed and scale are the same at every vertex of a triangle.
  @location(1) kind: f32,
  @location(2) seed: f32,
  @location(3) plantSc: f32,
}
@vertex fn vsShadowTerrain(@location(0) p: vec3<f32>) -> ShadowV {
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(p, 1.0);
  return o;
}
// Crown hulls are closed shells. Without a hole, the shadow map is solid under the
// whole crown and the air march can only light the gaps between trees. These holes
// are columns along the sun, tested at the leaned point the shadow map actually draws.
fn crownBlocks(rest: vec3<f32>, seed: f32) -> bool {
  let s = F.sunDir;
  let ax = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(s.x) > 0.85);
  let u = normalize(cross(s, ax));
  let v = cross(s, u);
  let q = vec2<f32>(dot(rest, u), dot(rest, v));
  // One field for every crown the ray meets, so a crack stays a shaft down to the floor.
  // Cells are several metres across. Narrower cracks vanish under the shadow filter.
  let bough = leafCells(q * 0.14 + vec2<f32>(5.0, 1.7));
  let qk = sat((F.cloudOct - 1.0) * 0.5);
  // Narrower cracks disappear once the shadow filter and the crown's own limbs close them.
  // Low leaves the thicker shade. High lets a few more columns through.
  if (bough.x > mix(0.46, 0.40, qk)) { return false; }
  // Low keeps the wide cracks only. Med and high also open a finer leaf field inside
  // a mass; it changes along the ray, so some of that light dies in the crown.
  if (F.cloudOct < 1.5) { return true; }
  let along = dot(rest, s);
  let q2 = q + vec2<f32>(seed * 19.0, seed * 7.0);
  let fine = leafCells(vec2<f32>(q2.x * 0.55, along * 0.16 + q2.y * 0.22) + vec2<f32>(11.0, 4.0));
  return fine.x < mix(0.98, 0.90, qk);
}
@vertex fn vsShadowMesh(in: MeshIn) -> ShadowMV {
  var o: ShadowMV;
  o.kind = in.n.w;
  o.seed = fract(in.i0.x * 0.137 + in.i0.z * 0.291);
  o.plantSc = in.i1.x;
  // The crack test has to use the same point the shadow map rasterises. The rest pose
  // sits a different column once the crown leans, and the enlarged leaves then seal it.
  var w = meshPlaceLean(in);
  let kind = in.n.w;
  if (kind > 1.5 && kind < 3.5) {
    w = w - F.sunDir * 0.018;
  }
  o.rest = w;
  o.clip = F.shadowVP * vec4<f32>(w, 1.0);
  return o;
}
// Depth-only. A forest crown is a solid hull plus, up close, enlarged leaf sprays that
// would cover any hole in the hull. Both use the same sun-aligned cracks, so a shaft
// stays open. Palms are small in scale and keep every leaflet. Trunks and rocks stay solid.
@fragment fn fsShadowMesh(in: ShadowMV) {
  let hull = in.kind > 2.5 && in.kind < 3.5;
  let crownLeaf = in.kind > 1.5 && in.kind < 2.5 && in.plantSc > 5.0;
  if ((hull || crownLeaf) && !crownBlocks(in.rest, in.seed)) { discard; }
}
// Grass and seaweed into shadow maps: lean only (no tread). Blades are widened for the
// depth pass so a meadow actually darkens the sand under the soft near-map filter.
@vertex fn vsShadowGrass(@location(0) p: vec3<f32>, @location(1) uv: vec2<f32>, @location(2) inst: vec4<f32>) -> ShadowV {
  let sc = abs(inst.w);
  let weed = select(0.0, 1.0, inst.w < 0.0);
  let s = sin(inst.z); let c = cos(inst.z);
  let ground = sampleField(vec2<f32>(inst.x, inst.y)).x;
  var w: vec3<f32>;
  // Contact disk (uv.y < 0): flat plate on the ground under land grass only — stamps sand
  // in the depth map without drawing in the colour pass.
  if (uv.y < 0.0 && weed < 0.5) {
    let disk = 1.35;
    let x = (p.x * c - p.z * s) * sc * disk;
    let z = (p.x * s + p.z * c) * sc * disk;
    w = vec3<f32>(inst.x + x, ground + 0.01, inst.y + z) - F.sunDir * 0.04;
  } else {
    // Widen blades ~2.4× in the shadow caster only (kept skinny in the colour pass).
    // Extra fattening at the foot so each land tuft leaves a soft contact disk on sand.
    var fat = select(2.4, 1.6, weed > 0.5);
    if (weed < 0.5) {
      fat *= mix(1.9, 1.0, sat(uv.y * 1.65));
    }
    var lp = vec3<f32>(p.x * sc * fat, p.y * sc, p.z * sc * fat);
    let x = lp.x * c - lp.z * s;
    let z = lp.x * s + lp.z * c;
    w = vec3<f32>(inst.x + x, ground + lp.y, inst.y + z);
    var ph = 0.0;
    var dir = vec2<f32>(1.0, 0.35);
    if (weed < 0.5) {
      let v = windAt(inst.xy);
      let id = fract(inst.x * 0.731 + inst.y * 0.417);
      let roll = sin(dot(inst.xy, F.wind.xy) * 0.8 - F.time * (1.4 + 0.3 * v) + id * 1.2);
      ph = v * v * 0.02 * (0.85 + 0.5 * roll);
      ph = ph / (1.0 + 0.6 * abs(ph));
      dir = normalize(F.wind.xy + vec2<f32>(-F.wind.y, F.wind.x) * (id - 0.5) * 0.5);
      let bend = ph * sqrt(max(uv.y, 0.0)) * lp.y;
      w.y -= bend * bend * 0.5 / max(lp.y, 0.02);
      w.x += bend * dir.x;
      w.z += bend * dir.y;
    } else {
      let bend = sin(F.time * 0.5 + inst.x * 0.031) * 0.5 * pow(max(uv.y, 0.0), 1.25) * 0.6;
      w.x += bend; w.z += bend * 0.35;
    }
    // Light-axis slab + stronger push at the foot for contact under sparse beach tufts.
    let footPush = select(0.0, (1.0 - sat(uv.y)) * 0.028, weed < 0.5);
    w = w - F.sunDir * (0.014 * (1.0 - weed) + footPush);
  }
  var o: ShadowV;
  o.clip = F.shadowVP * vec4<f32>(w, 1.0);
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
// The first n of a pixel's four samples, taken a diagonal pair at a time.
fn sampleSet(n: u32) -> u32 {
  return select(0u, 1u, n > 0u) | select(0u, 8u, n > 1u) | select(0u, 2u, n > 2u) | select(0u, 4u, n > 3u);
}
struct MeshOut {
  @location(0) col: vec4<f32>,
  @builtin(sample_mask) mask: u32,
}
@fragment fn fsMesh(in: MeshV) -> MeshOut {
  if (F.clipBelow > 0.5 && in.world.y < -0.2) { discard; }
  // Dual-LOD cross-fade. Finer share is 1..63/64 (coarser copy adds +64).
  // MSAA: partition samples so wood mixes without holes that crawl in the wind.
  // Leaves: each leaflet appears/disappears whole by its own id over a wide share band —
  // no screen-space dither (that flickered as the crown swayed across pixels).
  var mask = 15u;
  if (in.fade > 0.5) {
    let coarse = in.fade > 64.5;
    let share = (in.fade - select(0.0, 64.0, coarse)) / 64.0;
    let keep = select(share, 1.0 - share, coarse);
    if (in.kind > 1.5 && in.kind < 2.5) {
      // Soft leaf dissolve over ~55% of the fade; leaf id is stable in mesh space.
      let gate = sat((keep - in.leaf * 0.5) / 0.55);
      if (gate < 0.02) { discard; }
      if (${samples} > 1) {
        let n = u32(gate * 4.0 + 0.5);
        mask = select(sampleSet(n), 15u ^ sampleSet(4u - min(n, 4u)), coarse);
        if (mask == 0u) { discard; }
      }
      // Single-sample: whole-leaf keep/drop from gate (band is long, so no snap).
      else if (gate < 0.5) { discard; }
    } else {
      if (${samples} > 1) {
        let px = vec2<u32>(in.clip.xy);
        let jit = (f32(((px.x & 1u) * 2u) ^ ((px.y & 1u) * 3u)) + 0.5) * 0.25;
        mask = sampleSet(u32(share * 4.0 + jit));
        if (coarse) { mask = 15u ^ mask; }
        if (mask == 0u) { discard; }
      } else {
        // Stable world-space dither for bark/hull when MSAA is off.
        let h = fract(in.world.x * 0.37 + in.world.z * 0.61 + in.world.y * 0.17);
        if (keep < h) { discard; }
      }
    }
  }
  var n = normalize(in.nrm);
  var alb = in.col;
  let Vv = normalize(F.camPos - in.world);
  let kind = i32(in.kind + 0.5);
  var leaf = 0.0;
  var gloss = 0.0;
  if (kind == 3) {
    // The mass inside a crown: leaves in the shade of the leaves round them. Near, real
    // leaves stand over it and it shows between them; far, it is the whole crown. It is
    // solid everywhere. Nothing is cut out of it, so nothing on it can flicker as the eye
    // moves: what reads as leaf is tone and tilt, and both are left out once a clump of
    // leaves is smaller than a pixel.
    let dist = length(F.camPos - in.world);
    let an = abs(n);
    // In the rest pose, so the clumps ride with the crown as it sways.
    var pq = in.rest.xz;
    if (an.x > an.y && an.x > an.z) { pq = in.rest.zy; } else if (an.z > an.y) { pq = in.rest.xy; }
    let foot = dist * F.tanHalf * 2.0 / max(F.res.y, 1.0);
    let kB = sat(1.6 - foot * 3.2);
    if (kB > 0.01) {
      let B = leafCells(pq * 0.85 + 17.0);
      // Narrower cell bands — soft smoothsteps read as airbrushed blur on pad edges.
      let mB = smoothstep(0.50, 0.40, B.x);
      alb *= mix(1.0, mix(0.62, 0.82 + 0.42 * B.w, mB), kB);
      n = normalize(n + (vec3<f32>(B.z, B.y + 0.5, B.w) - 0.5) * (0.7 * kB * mB));
      let kA = sat(1.5 - foot * 14.0);
      if (kA > 0.01) {
        let A = leafCells(pq * 3.3);
        let mA = smoothstep(0.58, 0.48, A.x);
        alb *= mix(1.0, mix(0.55, 0.85 + 0.45 * A.w, mA), kA);
        n = normalize(n + (vec3<f32>(A.z, A.y + 0.5, A.w) - 0.5) * (0.95 * kA * mA));
      }
    }
    // From far off a crown is boughs: masses of leaf a few metres across with shade between
    // them, standing more or less level. Without them a far crown is a smooth green ball.
    let kC = sat(foot * 5.0 - 0.3);
    if (kC > 0.01) {
      let C = leafCells(pq * 0.26 + 5.0);
      alb *= mix(1.0, 0.5 + 0.75 * smoothstep(0.62, 0.32, C.x), kC * 0.85);
      n = normalize(n + vec3<f32>(C.z - 0.5, 0.9, C.w - 0.5) * (0.75 * kC));
    }
    // The belly of a pad is in its own shade. The lit skin is the upper shell.
    let cavity = sat(0.46 - n.y);
    alb *= mix(1.0, 0.5, cavity);
    if (dot(n, Vv) < 0.0) { n = -n; alb *= 0.5; }
  } else if (kind == 2) {
    // Leaflet: dull upper wax, pale underside, thin-film transmission — not green plastic.
    let upper = dot(n, Vv) > 0.0;
    if (!upper) {
      n = -n;
      alb = mix(alb, vec3<f32>(dot(alb, vec3<f32>(0.28, 0.58, 0.12))), 0.35) * 1.32;
    }
    let rib = smoothstep(0.26, 0.0, abs(in.uv.x));
    alb = mix(alb, alb * 1.24 + vec3<f32>(0.014, 0.02, 0.0), rib * 0.5);
    // Desaturate mature faces slightly; keep young tips warmer.
    alb = mix(alb, vec3<f32>(dot(alb, vec3<f32>(0.3, 0.55, 0.15))), 0.26 + 0.12 * (1.0 - in.uv.y));
    let grit = 0.8 + 0.15 * sin(in.uv.x * 11.0 + in.uv.y * 4.0) + 0.07 * sin(in.uv.y * 29.0);
    alb *= grit;
    // Vein micro-normals: midrib V-fold + fine lateral ridges.
    let side = sign(in.uv.x + 1e-4);
    let vein = sin(in.uv.y * 48.0 + in.uv.x * 6.0) * 0.04 * (1.0 - rib);
    n = normalize(n + side * cross(n, vec3<f32>(0.0, 1.0, 0.0)) * (0.2 + 0.24 * (1.0 - rib) + vein) * select(-0.4, 1.0, upper));
    // Variable thickness: tip thinner than base, plus midrib thicker and a soft blotch map
    // so neighbouring leaflets don't share one transmission look.
    let tip = sat(in.uv.y);
    let blotch = 0.72 + 0.55 * n2(in.rest.xz * 3.1 + in.uv * 2.4);
    let thick = mix(1.28, 0.42, tip) * mix(1.18, 0.78, rib) * blotch;
    leaf = select(1.7, 0.42, upper) * (0.7 + 0.45 * tip) / max(thick, 0.35);
    gloss = select(0.002, 0.005 + 0.01 * rib, upper) * (1.0 + 1.0 * F.wx.y) * thick;
    if (in.world.y < -0.1) { gloss *= 0.1; leaf *= 0.4; }
  } else {
    if (dot(n, Vv) < 0.0) { n = -n; }
    if (kind == 1) {
      // Bark by height: the scar of each fallen frond is a ring, with fibre running up between them.
      let wob = n2(vec2<f32>(in.uv.x * 7.0, in.uv.y * 0.8));
      let ring = fract(in.uv.y * 8.5 + wob * 0.6);
      let groove = smoothstep(0.0, 0.14, ring) * smoothstep(1.0, 0.86, ring);
      let fibre = n2(vec2<f32>(in.uv.x * 110.0, in.uv.y * 5.0));
      let blotch = n2(vec2<f32>(in.uv.x * 5.0 + 3.0, in.uv.y * 0.9));
      // Close to, the fibre is cracked across and the lip of each scar stands proud.
      let crack = n2(vec2<f32>(in.uv.x * 46.0, in.uv.y * 31.0));
      let lip = smoothstep(0.7, 0.95, ring);
      alb *= (0.5 + 0.5 * groove) * (0.78 + 0.34 * fibre) * (0.75 + 0.5 * blotch) * (0.82 + 0.36 * crack) * (1.0 + 0.22 * lip);
      alb = mix(alb, vec3<f32>(0.40, 0.42, 0.33), smoothstep(0.58, 0.85, blotch) * 0.35);
      alb *= mix(0.62, 1.0, smoothstep(0.0, 1.4, in.uv.y));
      n = normalize(n + vec3<f32>(0.0, (ring - 0.5) * 1.1 * groove + (crack - 0.5) * 0.3, 0.0) + ((fibre - 0.5) * 0.4 + (crack - 0.5) * 0.25) * cross(n, vec3<f32>(0.0, 1.0, 0.0)));
      // Palm bark: dull plates with a faint wet sheen in rain only.
      gloss = 0.04 + 0.06 * F.wx.y * groove;
    }
    if (kind == 9) {
      // Bark of a forest tree: furrows running up the trunk, plates between them, lichen in patches.
      let wy = in.world.y * 1.3;
      let fur = n2(vec2<f32>(in.uv.x * 44.0 + n2(vec2<f32>(in.uv.x * 9.0, wy * 0.5)) * 2.0, wy));
      let plate = n2(vec2<f32>(in.uv.x * 13.0, wy * 3.1));
      let blotch = n2(vec2<f32>(in.uv.x * 5.0 + 3.0, wy * 1.1)) * 0.7 + n2(vec2<f32>(in.uv.x * 17.0, wy * 3.7)) * 0.3;
      // Fine cracks across the plates, and the furrows cut deep enough to hold shadow.
      let fine = n2(vec2<f32>(in.uv.x * 130.0, wy * 9.0));
      alb *= (0.34 + 0.66 * smoothstep(0.26, 0.5, fur)) * (0.7 + 0.6 * plate) * (0.8 + 0.4 * fine);
      alb = mix(alb, vec3<f32>(0.27, 0.28, 0.24), smoothstep(0.6, 0.8, blotch) * 0.4);
      n = normalize(n + ((fur - 0.5) * 1.4 + (fine - 0.5) * 0.35) * cross(n, vec3<f32>(0.0, 1.0, 0.0)) + vec3<f32>(0.0, (plate - 0.5) * 0.35, 0.0));
      // Plate faces catch a little more than the furrows (still matte).
      gloss = 0.03 + 0.05 * smoothstep(0.4, 0.7, plate) + 0.04 * F.wx.y;
    }
    if (kind == 8) {
      // Coral. uv.x says which: 0 branches, 1 a boulder with a maze of grooves, 2 a table, 3 soft tissue.
      let p = in.world;
      let sub = i32(in.uv.x + 0.5);
      let fine = sat(1.6 - length(F.camPos - p) * 0.22);
      let mott = n3(p * 8.0);
      let polyp = n3(p * 150.0);
      // Colony colour drift: dusty rose / olive / mauve — muted under water, not neon.
      // n3 is scalar noise; three offsets give an independent RGB-like drift vector.
      let drift = vec3<f32>(
        n3(p * 0.55 + vec3<f32>(2.1, 0.7, 5.3)),
        n3(p * 0.55 + vec3<f32>(5.3, 2.1, 0.7)),
        n3(p * 0.55 + vec3<f32>(0.7, 5.3, 2.1))
      );
      let rose = vec3<f32>(0.62, 0.36, 0.34);
      let olive = vec3<f32>(0.42, 0.44, 0.28);
      let mauve = vec3<f32>(0.46, 0.34, 0.46);
      let ochre = vec3<f32>(0.58, 0.44, 0.28);
      let tintC = mix(mix(ochre, rose, drift.x), mix(olive, mauve, drift.y), drift.z);
      alb = mix(alb, alb * tintC * 1.15, 0.38 + 0.22 * mott);
      alb *= 0.8 + 0.34 * mott;
      // Soft wet sheen, never plastic.
      gloss = mix(gloss, 0.08, 0.35);
      if (sub == 0) {
        // Growing tips are pale, and each branch is studded with polyps.
        alb = mix(alb, alb * 1.22 + vec3<f32>(0.08, 0.07, 0.06), smoothstep(0.75, 1.0, in.uv.y));
        alb = mix(alb, rose * 0.9, smoothstep(0.35, 0.75, drift.x) * 0.18 * fine);
        alb *= 1.0 - 0.28 * smoothstep(0.45, 0.6, polyp) * fine;
      } else if (sub == 1) {
        // A brain coral: ridges a centimetre apart winding over the whole surface.
        let q = p * 85.0;
        let g0 = n3(q);
        let maze = smoothstep(0.0, 0.16, abs(g0 - 0.5));
        alb *= mix(1.0, 0.68 + 0.36 * maze, fine);
        alb = mix(alb, ochre * 0.95, (1.0 - maze) * 0.2 * fine);
        let gr = vec3<f32>(n3(q + vec3<f32>(0.3, 0.0, 0.0)), n3(q + vec3<f32>(0.0, 0.3, 0.0)), n3(q + vec3<f32>(0.0, 0.0, 0.3))) - g0;
        n = normalize(n - gr * sign(g0 - 0.5) * (1.0 - maze) * 2.6 * fine);
        let lump = n3(p * 5.0) - 0.5;
        alb *= 1.0 + 0.28 * lump;
      } else if (sub == 2) {
        // A table: a lawn of finger-length branchlets seen end on, paler toward the growing rim.
        let bud = n3(p * vec3<f32>(60.0, 20.0, 60.0));
        let gb = vec3<f32>(n3(p * vec3<f32>(60.0, 20.0, 60.0) + vec3<f32>(0.4, 0.0, 0.0)) - bud, 0.0, n3(p * vec3<f32>(60.0, 20.0, 60.0) + vec3<f32>(0.0, 0.0, 0.4)) - bud);
        n = normalize(n - gb * 2.4 * fine);
        alb *= 1.0 + (bud - 0.4) * 0.85 * fine;
        alb = mix(alb, mix(ochre, rose, 0.4) * 1.05, smoothstep(0.78, 1.0, in.uv.y) * 0.45);
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
  // Crown hulls: leaf response varies with the procedural leaf-cell field so light
  // filters through thin edges of clumps and thick interiors stay denser.
  var crownLeaf = leaf;
  var crownGloss = gloss;
  if (kind == 3) {
    let anC = abs(n);
    var pqC = in.rest.xz;
    if (anC.x > anC.y && anC.x > anC.z) { pqC = in.rest.zy; } else if (anC.z > anC.y) { pqC = in.rest.xy; }
    let cells = leafCells(pqC * 0.9 + 11.0);
    // cells.x near 0 at leaf centres (thicker), higher toward gaps (thinner).
    let thinEdge = smoothstep(0.32, 0.55, cells.x);
    crownLeaf = mix(0.38, 0.95, thinEdge) * (0.75 + 0.35 * cells.w);
    crownGloss = 0.004 * (1.0 + 0.9 * F.wx.y) * mix(1.15, 0.55, thinEdge);
  }
  var col = shade(in.world, n, alb, select(leaf, crownLeaf, kind == 3), select(gloss, crownGloss, kind == 3));
  if (kind == 3) {
    // Sun that has come down through the crown: the green light on its underside and its
    // shaded flank, which the shadow map alone would leave black.
    let canopyTx = 0.26 + 0.22 * crownLeaf;
    col += alb * vec3<f32>(0.72, 1.3, 0.3) * F.sunCol * (canopyTx * sat(0.65 - dot(n, F.sunDir) * 0.7) * sat(0.55 - n.y) * cloudShade(in.world.xz, in.world.y));
    // Crisp silhouette cue — prior soft rim + half-res air blur read as fuzzy leaf edges.
    let graz = pow(sat(1.0 - abs(dot(n, Vv))), 4.2);
    col += alb * vec3<f32>(0.9, 1.0, 0.72) * graz * 0.035 * F.day.rgb;
  }
  // Contact AO where land plants meet the ground: trunks/rocks, and also low leaves of
  // shrubs, ferns and flowering plants (canopy leaflets sit high and stay untouched).
  let above = in.world.y - sampleField(in.world.xz).x;
  if (in.world.y > -0.05 && above < 1.05) {
    let reach = select(0.6, 1.05, leaf > 0.4);
    let floorK = mix(0.52, 1.0, smoothstep(0.0, reach, above));
    // Leaflets near the stem foot (uv.y low) darken more; tips stay brighter.
    let bladeFoot = select(1.0, mix(0.72, 1.0, smoothstep(0.0, 0.45, sat(in.uv.y))), leaf > 0.4);
    col *= mix(1.0, floorK * bladeFoot, select(1.0, 0.85, leaf > 0.4));
  }
  return MeshOut(vec4<f32>(col, 1.0), mask);
}

struct GrassV {
  @builtin(position) clip: vec4<f32>,
  @location(0) @interpolate(perspective, centroid) world: vec3<f32>,
  @location(1) @interpolate(perspective, centroid) nrm: vec3<f32>,
  @location(2) @interpolate(perspective, centroid) uv: vec2<f32>,
  @location(3) @interpolate(perspective, centroid) kind: f32,
}
@vertex fn vsGrass(@location(0) p: vec3<f32>, @location(1) uv: vec2<f32>, @location(2) inst: vec4<f32>) -> GrassV {
  let sc = abs(inst.w);
  let weed = select(0.0, 1.0, inst.w < 0.0);
  let s = sin(inst.z); let c = cos(inst.z);
  var lp = vec3<f32>(p.x * sc, p.y * sc, p.z * sc);
  // Streaming fades tufts before their cell is dropped. 0 leaves the old full set.
  let fadeEnd = F.grassFade;
  let gd = length(inst.xy - F.camPos.xz);
  let keepG = select(1.0, 1.0 - smoothstep(fadeEnd * 0.62, fadeEnd, gd), fadeEnd > 1.0);
  var o: GrassV;
  if (keepG < 0.02 || (uv.y < 0.0 && weed < 0.5)) {
    // Cull streamed tufts; contact disks are shadow-only (discarded in fsGrass).
    o.world = vec3<f32>(inst.x, 0.0, inst.y);
    o.nrm = vec3<f32>(0.0, 1.0, 0.0);
    o.uv = uv;
    o.kind = weed;
    o.clip = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return o;
  }
  lp *= keepG;
  let x = lp.x * c - lp.z * s;
  let z = lp.x * s + lp.z * c;
  let ground = sampleField(vec2<f32>(inst.x, inst.y)).x;
  var w = vec3<f32>(inst.x + x, ground + lp.y, inst.y + z);
  // Grass bends by blade height. Seaweed/kelp uses shared underwater current with
  // along-length deformation (tip travels furthest — not a base-only rotate).
  var ph = sin(F.time * 0.5 + inst.x * 0.031 + inst.y * 0.017) * 0.7
    + 0.35 * sin(F.time * 1.3 + inst.x * 0.09 + inst.y * 0.07);
  var dir = vec2<f32>(1.0, 0.35);
  var bend = ph * pow(max(uv.y, 0.0), 1.25) * 0.78;
  if (weed < 0.5) {
    let v = windAt(inst.xy);
    let id = fract(inst.x * 0.731 + inst.y * 0.417);
    // A gust crosses a meadow as a wave running downwind, each tuft a little early or late,
    // and every blade shivers on top of it.
    let roll = sin(dot(inst.xy, F.wind.xy) * 0.8 - F.time * (1.4 + 0.3 * v) + id * 1.2);
    ph = v * v * 0.02 * (0.85 + 0.5 * roll + 0.25 * sin(F.time * (2.1 + 1.6 * id) + id * 30.0))
      + sin(F.time * (5.2 + 3.2 * id) + id * 50.0) * 0.035 * v * uv.y
      + sin(F.time * (9.5 + 4.0 * id) + id * 17.0) * 0.012 * v * uv.y * uv.y;
    ph = ph / (1.0 + 0.6 * abs(ph));
    dir = normalize(F.wind.xy + vec2<f32>(-F.wind.y, F.wind.x) * (id - 0.5) * 0.5);
    bend = ph * sqrt(max(uv.y, 0.0)) * lp.y;
    w.y -= bend * bend * 0.5 / max(lp.y, 0.02);
  } else {
    // Seaweed / kelp: stronger along-length current bend + cross-flow flutter.
    let cur = seaCurrent(inst.xy);
    let id = fract(inst.x * 0.731 + inst.y * 0.417);
    let t = max(uv.y, 0.0);
    let along = pow(t, 1.45) * lp.y;
    let phase = F.time * (0.52 + 0.22 * id) + inst.x * 0.05 + inst.y * 0.03 + t * 2.6;
    let flutter = sin(phase) * 0.42 + sin(phase * 1.85 + id * 9.0) * 0.24 + sin(phase * 0.41 + id * 3.0) * 0.14;
    dir = normalize(cur + vec2<f32>(-cur.y, cur.x) * (id - 0.5) * 0.65 + vec2<f32>(0.001));
    bend = length(cur) * (0.62 + 0.5 * flutter) * along * 1.35;
    ph = bend;
    w.y -= bend * bend * 0.32 / max(lp.y, 0.05);
  }
  w.x += bend * dir.x;
  w.z += bend * dir.y;
  // Someone wading through: the blades lean away from the legs, and those underfoot lie down.
  let off = inst.xy - F.camPos.xz;
  let reach = length(off);
  let tread = smoothstep(1.3, 0.2, reach) * smoothstep(3.2, 2.2, F.camPos.y - ground);
  if (tread > 0.0) {
    let push = off / max(reach, 0.05) * (tread * 0.8 * sqrt(max(uv.y, 0.0)) * lp.y);
    w.x += push.x;
    w.z += push.y;
    w.y -= tread * 0.5 * lp.y;
  }
  o.world = w;
  o.nrm = normalize(vec3<f32>(ph * 0.3, 1.0, 0.1));
  o.uv = uv;
  o.kind = weed;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}
@fragment fn fsGrass(in: GrassV) -> @location(0) vec4<f32> {
  // Contact disks are depth casters only (see grassGeom / vsShadowGrass).
  if (in.uv.y < 0.0) { discard; }
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
  if (in.kind > 0.5) {
    // Underwater weed / kelp strips: olive → brighter tip, mottled for denser beds.
    col = mix(vec3<f32>(0.035, 0.15, 0.085), vec3<f32>(0.16, 0.36, 0.15), in.uv.y);
    col = mix(col, vec3<f32>(0.05, 0.22, 0.12), mott * 0.35);
  }
  let rib = smoothstep(0.08, 0.0, abs(in.uv.x - 0.5));
  // Grass is a dark thing in full sun: a blade reflects about a tenth of what falls on it.
  // The foot of the blade is darker still, so a tuft reads as planted, not floating.
  col *= 0.46 + 0.14 * n2(in.world.xz * 1.6 + in.uv.y) - rib * 0.08;
  col *= mix(0.34, 1.0, smoothstep(0.0, 0.48, in.uv.y));
  // Extra contact AO for land grass only (weed stays lit by the water column).
  if (in.kind < 0.5) {
    let hAbove = max(in.world.y - ground, 0.0);
    col *= mix(0.5, 1.0, smoothstep(0.0, 0.62, hAbove));
  }
  return vec4<f32>(shade(in.world, in.nrm, col, 1.05, 0.0), 1.0);
}

${FISH_WGSL}
${BUG_WGSL}
${BIRD_WGSL}
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
  // Broad swell must stay readable from cliffs and altitude — shrinking reach with height
  // was flattening the open sea into a blue plane. Squeeze-fade still kills ruled bands.
  let elev = max(abs(F.camPos.y), 1.0);
  let reach = mix(5200.0, 9200.0, sat(elev / 140.0));
  let squeezed = dist * dist * 0.00055 / elev;
  let low = smoothstep(reach, reach * 0.22, dist);
  let bandFade = 1.0 - smoothstep(elev * 5.0, elev * 36.0, squeezed);
  return low * bandFade;
}

// Near / mid / far ocean bands. x=fine keep, y=mid keep, z=far flatten, w=roughness lift.
// Altitude only kills high-frequency aliasing — broad swell/mid structure stay readable overhead.
fn seaBands(dist: f32, foot: f32) -> vec4<f32> {
  let elev = max(abs(F.camPos.y), 0.5);
  let alt = sat((elev - 12.0) / 200.0);
  // Fine detail eases out over a long reach so no ring reads as a cut.
  let fine = smoothstep(420.0, 18.0, dist) * (1.0 - smoothstep(0.18, 3.2, foot));
  let farK = smoothstep(180.0, 980.0, dist) * mix(0.32, 0.72, alt) * (0.5 + 0.5 * smoothstep(0.12, 1.8, foot));
  let midK = sat(1.0 - fine - farK * 0.45);
  let roughLift = sat(farK * 0.7 + smoothstep(0.1, 1.6, foot) * 0.5 + alt * farK * 0.22);
  return vec4<f32>(fine, midK, farK, roughLift);
}

// Schlick for water against air (F0 ≈ 0.02, IOR 1.333). Mid angles stay a touch
// softer than pure Schlick so the sea reads as volume, not a chrome plate; roughness
// still pulls the grazing peak down for far chop.
fn waterFresnel(ndv: f32, rough: f32) -> f32 {
  let f0 = 0.02;
  let grazing = max(1.0 - rough * 1.15, f0);
  let schlick = f0 + (grazing - f0) * pow5(1.0 - ndv);
  // Soften facing reflection slightly (documentary ocean, not game mirror).
  return mix(schlick * 0.88, schlick, smoothstep(0.15, 0.72, 1.0 - ndv));
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
    let keep = smoothstep(pix * 0.9, pix * 7.0, len);
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

// Open-ocean FFT tiles stay on deep-water dispersion. Near shore the Gerstner
// bands hold that frequency and shorten: ω² = g k tanh(kh). One eased step,
// not a swept ray. x = k to use, y = tanh(k * depth). Swell bunches; chop does not.
fn shoreK(k: f32, depth: f32, band: f32) -> vec2<f32> {
  let kh0 = k * depth;
  let th0 = tanh(min(kh0, 8.0));
  // Start wavelength bunching earlier in mid-depth so shoaling reads before the last metre.
  let bunch = smoothstep(2.05, 0.28, kh0) * (1.0 - smoothstep(3.5, 4.5, band));
  let kHold = k / max(th0, 0.32);
  let kUse = mix(k, min(kHold, k * 1.55), bunch);
  let th = tanh(min(kUse * depth, 8.0));
  return vec2<f32>(kUse, max(th, 0.045));
}

// Along-crest group, 0..1. The lip and the foam wake both read it, so whitewater
// sits on the sections that trip and not along the whole crest.
fn crestPack(across: f32, band: f32) -> f32 {
  return n2(vec2<f32>(across * 0.017 + band * 5.1, F.time * 0.031));
}

// Amplitude grows as group velocity falls (cg / cg_deep). Never shrinks the
// offshore swell, and the cap is what stops a bar from spiking.
fn shoalAmp(kUse: f32, th: f32, depth: f32) -> f32 {
  let kh = min(kUse * depth, 6.0);
  let kh2 = min(kh * 2.0, 10.0);
  let cgFrac = 0.5 * (1.0 + kh2 / max(sinh(kh2), 1e-3));
  let cgRel = max(sqrt(th) * cgFrac, 0.08) / 0.5;
  // Moderate shoal growth — prior 1.75 + stacked stand-ups made nearshore walls.
  let grow = clamp(sqrt(1.0 / min(cgRel, 1.0)), 1.0, 1.45);
  return mix(1.0, grow, smoothstep(1.95, 0.15, kh));
}

fn seaAt(xz: vec2<f32>, scale: f32, depth: f32) -> Sea {
  var d = vec3<f32>(0.0);
  var n = vec3<f32>(0.0, 1.0, 0.0);
  var jxx = 0.0;
  var jzz = 0.0;
  var jxz = 0.0;
  var brk = 0.0;
  let D = max(depth, 0.25);
  // Heightfield damp can mute the surf/lagoon; keep a nearshore floor so shoaling
  // and hinge lips still have amplitude to work with.
  let scaleUse = max(scale, 0.7 * smoothstep(5.0, 0.6, D));
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
    var As = w.z * ampK * scaleUse * fade * (1.0 + feel * 0.55);
    let Q = min(steepQ(i) + feel * 0.45, 1.05);
    // Offshore the swell is long and low. It only stands up where the bottom shoals,
    // so the open sea is not a row of identical steep ridges.
    // Mid-depth (≈1.6–7.5 m) starts standing up earlier so shoaling is visible approaching the beach.
    // Keep a higher offshore floor so swell trains remain readable before the bed rises.
    let deepW = smoothstep(1.6, 7.5, D);
    if (i < 2) { As *= mix(1.0, 0.42, deepW); }
    if (i == 0) { As *= 0.4 + 0.6 * sin(dot(dir, xz) * 0.062 - F.time * 0.045); }
    if (i == 1) { As *= 0.5 + 0.5 * sin(dot(dir, xz) * 0.09 + 1.3); }
    if (i >= 6) { As *= 0.65 + 0.35 * sin(dot(dir, xz) * 0.041 + F.time * 0.03); }
    let steep = k * As * Q;
    if (steep > 0.72) { As *= 0.72 / steep; }
    // Soften ankle-depth collapse; keep a little height without walling the beach.
    let collapse = 1.0 - smoothstep(0.35, 2.2, D);
    As *= 1.0 - collapse * 0.18;
    // Mild mid-depth stand-up only — stacked 1.28× + shoalAmp made jagged walls.
    if (i < 2) { As *= mix(1.0, 1.08, smoothstep(4.5, 0.6, D)); }
    // The spectral field owns the mid and short waves. These layers were the repeating ripples.
    if (i >= 3 && i < 6) { As *= 0.22; }
    // Depth-aware dispersion. Deep water (tanh → 1) matches the old sqrt(gk).
    // In the surf the same frequency rides a shorter k, so crests bunch and slow.
    let sk = shoreK(k, D, f32(i));
    let kUse = sk.x;
    let thK = sk.y;
    let slow = sqrt(thK);
    if (i < 3) { As *= shoalAmp(kUse, thK, D); }
    let steepShore = kUse * As * Q;
    if (steepShore > 0.72) { As *= 0.72 / steepShore; }
    var omega = sqrt(G * kUse) * spdK * slow;
    if (i == 1) { omega = wP * (kUse / max(kP, 1e-3)) * spdK * slow; }
    // Snell toward the shore-normal as phase speed drops. Uphill on the bed is
    // shallower water. Approximate — the crest is turned, not ray-marched.
    var dirN = dir;
    if (i < 3 && k * D < 2.15) {
      let gx = sampleField(xz + vec2<f32>(1.6, 0.0)).x - sampleField(xz - vec2<f32>(1.6, 0.0)).x;
      let gz = sampleField(xz + vec2<f32>(0.0, 1.6)).x - sampleField(xz - vec2<f32>(0.0, 1.6)).x;
      let gLen = length(vec2<f32>(gx, gz));
      if (gLen > 0.03) {
        let gN = vec2<f32>(gx, gz) / gLen;
        let turn = sat((1.0 - slow) * 1.25);
        let coast = dot(dir, gN);
        let tang = dir - gN * coast;
        let into = mix(coast, max(coast, 0.04), turn);
        dirN = normalize(gN * into + tang * mix(1.0, 0.62, turn));
      }
    }
    // In open water a crest is not a ruled line. Its phase drifts over a few hundred
    // metres, so the lines bend and break. Near the beach they straighten, as they do.
    let drift = (n2(xz * 0.0041 + vec2<f32>(f32(i) * 7.3, 2.0)) + 0.5 * n2(xz * 0.011 + vec2<f32>(3.0, f32(i) * 4.1)) - 0.75) * 4.4 * deepW;
    let phase = kUse * dot(dirN, xz) - omega * F.time + drift;
    let s = sin(phase);
    let c = cos(phase);
    let wa = kUse * As;
    d.x += Q * As * dirN.x * c;
    d.z += Q * As * dirN.y * c;
    d.y += As * s;
    n.x -= dirN.x * wa * c;
    n.z -= dirN.y * wa * c;
    n.y -= Q * wa * s;
    // Localized depth-limited breaking. Trip only where H/h or steepness crosses a
    // Miche-like limit AND the along-crest pack is high — patches, not a beach-wide bar.
    // signalGate: break cue + face steepen/pitch/collapse Y (surf belt).
    // tipGate: horizontal tip throw on the single-valued heightfield (mid/deep only).
    // Ribbon owns multi-valued overhang; sheet keeps vertical crest stand-up from signalGate.
    if (i <= 2 && kUse * D < 2.35) {
      let signalGate = smoothstep(0.28, 2.55, D);
      let tipGate = smoothstep(1.15, 3.4, D);
      let crestS = sat(s * (1.15 + 0.2 * f32(1 - i)) - 0.1);
      let tip = pow(sat(s), 2.15) * signalGate;
      let faceHold = sat(0.55 + 0.55 * c) * (1.0 - tip * 0.78);
      let waveH = max(As * 2.0, 0.02);
      let gamma = 0.5 * max(thK, 0.22);
      let depthLim = sat((waveH / D - gamma) / 0.22);
      let steepLim = sat((kUse * As * Q - 0.32) / 0.24);
      let across = dot(vec2<f32>(-dir.y, dir.x), xz);
      let section = smoothstep(0.34, 0.68, crestPack(across, f32(i)));
      let wxBoost = 1.0 + 0.45 * sat(F.mood.y) + 0.28 * sat(F.wx.x);
      let excess = sat(max(depthLim, steepLim) * wxBoost);
      let nearForce = smoothstep(3.2, 0.55, D) * tip * max(section, 0.5) * 0.85;
      let trip = sat(max(excess, nearForce) * wxBoost) * max(section, 0.5) * max(crestS, tip * 0.8) * fade * signalGate;
      let slopeDrop = sampleField(xz + dirN * 2.2).x - sampleField(xz - dirN * 2.2).x;
      let beta = abs(slopeDrop) / 4.4;
      let xi = beta / sqrt(max(waveH / max(len, 1.0), 0.003));
      let spillW = 1.0 - smoothstep(0.18, 0.55, xi);
      let plungeW = smoothstep(0.18, 0.55, xi) * (1.0 - smoothstep(0.95, 1.65, xi));
      let crumpleW = smoothstep(0.95, 1.65, xi) * (1.0 - smoothstep(2.4, 3.4, xi));
      let surgeW = smoothstep(2.4, 3.4, xi);
      let plungeBias = 0.58 + 0.42 * smoothstep(2.8, 0.5, D);
      let face = sat(0.55 + 0.55 * c);
      let phase = sat(crestS * (0.32 + 0.6 * face) * (0.5 + 0.6 * excess + nearForce * 0.9)
        + tip * 0.15 * trip);
      let steepen = smoothstep(0.0, 0.25, phase) * (1.0 - smoothstep(0.25, 0.45, phase));
      let pitch = smoothstep(0.18, 0.45, phase) * (1.0 - smoothstep(0.45, 0.68, phase));
      let curl = smoothstep(0.4, 0.68, phase) * (1.0 - smoothstep(0.68, 0.9, phase));
      let fall = smoothstep(0.7, 1.0, phase);
      let spill = trip * spillW * (1.0 - plungeBias * 0.75) * signalGate;
      let plunge = trip * max(plungeW, plungeBias * (1.0 - surgeW * 0.3)) * signalGate;
      let crumpleBrk = trip * max(crumpleW, plungeBias * 0.3 * fall) * signalGate;
      let surge = trip * surgeW * (1.0 - plungeBias * 0.55) * signalGate;
      // Restrained face/tip — prior tipBandK×lipR shards self-intersected the heightfield.
      let faceBandK = select(0.35, select(0.5, 0.72, i == 0), i == 1) * signalGate;
      let tipBandK = select(0.22, select(0.32, 0.48, i == 0), i == 1) * tipGate;
      let fold = sat(pitch * 0.5 + curl * 1.0 + fall * 0.15);
      // Vertical crest: steepen → pitch → mild curl lift → collapse dump (signalGate).
      d.y += As * faceHold * plunge * (steepen * 0.35 + pitch * 0.55 + curl * 0.7) * faceBandK;
      d.y += As * tip * plunge * curl * 0.28 * faceBandK;
      let dump = (crumpleBrk * fall * 1.0 + plunge * fall * fall * 1.25 + spill * fall * 0.35) * faceBandK;
      d.y -= As * dump * (0.75 + 0.35 * tip);
      d.y -= As * spill * 0.08;
      d.y += As * surge * crestS * 0.1;
      let washBody = trip * fall * (0.5 + 0.5 * section) * (1.0 - tip * 0.6);
      d.y += As * washBody * 0.12;
      // Horizontal tip throw: mid/deep heightfield only; ribbon owns surf overhang.
      let ang = clamp(0.7 + fold * 0.75 * plunge * tipBandK, 0.7, 1.45);
      let lipR = As * (1.6 + 1.1 * excess) * tipBandK;
      let wLip = tip * (0.3 + 0.55 * max(section, 0.5));
      let ox = sin(ang) * lipR * wLip;
      let oy = (cos(ang) - 1.0) * lipR * wLip * 0.4;
      d.x += dirN.x * ox;
      d.z += dirN.y * ox;
      d.y += oy;
      d.x += dirN.x * As * tip * plunge * (0.35 + curl * 0.85 + fall * 0.4) * tipBandK;
      d.z += dirN.y * As * tip * plunge * (0.35 + curl * 0.85 + fall * 0.4) * tipBandK;
      d.x += dirN.x * As * (dump * 0.55 + spill * fall * 0.2 + surge * 0.2 + washBody * 0.2);
      d.z += dirN.y * As * (dump * 0.55 + spill * fall * 0.2 + surge * 0.2 + washBody * 0.2);
      let faceTilt = plunge * (steepen * 0.75 + pitch * 1.6 + curl * 2.2) + crumpleBrk * fall * (0.85 + fall)
        + spill * 0.3 + surge * 0.15;
      n.x -= dirN.x * faceTilt * wLip * signalGate;
      n.z -= dirN.y * faceTilt * wLip * signalGate;
      n.y -= plunge * (pitch * 0.4 + curl * 0.95) * wLip * signalGate + dump * 0.55 + spill * 0.12 + surge * 0.08;
      n.x -= dirN.x * tip * plunge * curl * 0.85 * tipBandK;
      n.z -= dirN.y * tip * plunge * curl * 0.85 * tipBandK;
      n.y -= tip * plunge * curl * 0.55 * tipBandK;
      // Break cue (ribbon / foam / spray / SWE) — signalGate, not tipGate.
      brk += trip * select(0.6, select(0.9, 1.25, i == 0), i == 1) * (0.35 + 0.65 * curl + 0.35 * fall);
      brk += plunge * (curl * 1.05 + fall * 2.35) + crumpleBrk * fall * (1.15 + fall) + spill * fall * 1.1;
      brk += surge * 0.12 + washBody * 0.7;
      jxx += plunge * curl * wLip * 0.9 * signalGate;
      jzz += plunge * curl * wLip * 0.55 * signalGate;
    }
    jxx += Q * dirN.x * dirN.x * wa * s;
    jzz += Q * dirN.y * dirN.y * wa * s;
    jxz += Q * dirN.x * dirN.y * wa * s;
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
  let pix = max(distS * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.02);
  let elev = max(abs(F.camPos.y), 0.5);
  let foot = pix / pow(elev / max(distS, 0.1), 0.6);
  let band = seaBands(distS, foot);
  let cap = capillary(xz, distS / pow(max(V.y, 0.02), 0.6));
  let toCam = normalize(F.camPos.xz - xz + vec2<f32>(1e-4, 0.0));
  // Keep broad swell farther out from altitude; only fine slopes calm toward the horizon.
  let calm = smoothstep(mix(2200.0, 5200.0, sat(elev / 120.0)), mix(280.0, 720.0, sat(elev / 120.0)), distS);
  let Nmacro = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), S.nrm, calm * 0.95));
  var N = normalize(Nmacro
    + vec3<f32>(cap.x, 0.0, cap.y) * calm * band.x * 0.45
    + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.05 * (1.0 - calm * 0.45));
  N = normalize(vec3<f32>(N.x * (1.0 - band.z * 0.55), mix(N.y, 1.0, band.z * 0.28), N.z * (1.0 - band.z * 0.55)));
  let ndv = max(dot(N, V), 0.02);
  let rough = clamp(0.022 + sat(F.mat.x) * 0.08 + band.w * 0.06, 0.018, 0.16);
  let fres = waterFresnel(ndv, rough);
  var reflCol = skyColor(reflect(-V, N));
  let Rd = reflect(-V, N);
  if (Rd.y < 0.02) {
    reflCol = mix(F.deepC.rgb, reflCol, sat(Rd.y * 12.0 + 0.15));
  }
  // Distant water borrows more sky so it does not read as a flat paint chip.
  reflCol = mix(reflCol, hazeColor(Rd), band.z * 0.22);
  let crest = smoothstep(0.5, 0.18, S.jac);
  let grain = n2(xz * 0.11 + vec2<f32>(F.time * 0.04, 0.0));
  let foam = sat(crest - 0.55) * smoothstep(0.42, 0.78, grain) * seaFade(distS)
    * max(F.mood.w, 0.0) * calm * (1.0 - smoothstep(0.4, 1.8, foot)) * (1.0 - band.z * 0.7);
  // Far ocean: depth color + sky haze — not a flat paint chip.
  var base = mix(F.deepC.rgb, hazeColor(vec3<f32>(V.x, max(V.y, 0.02), V.z)) * 0.35 + F.deepC.rgb * 0.65, band.z * 0.55);
  base = mix(base, vec3<f32>(0.86, 0.88, 0.86) * F.day.rgb, foam * 0.4);
  // A cloud's shadow on the sea: the water's own colour is mostly sunlight sent back up.
  let cs = cloudShade(xz, 0.0);
  base *= mix(0.55, 1.0, cs);
  var col = mix(base, reflCol, fres * (1.0 - foam * 0.5) * (1.0 - band.z * 0.15));
  // Soft glints only — hard GGX fireflies shimmer across the horizon.
  col += ggxGlint(N, V, max(rough, 0.032), fres) * mix(0.09, 0.03, band.z) * (1.0 - foam) * cs;
  col += boltOnSurf(world, N, 0.2);
  return airMix(col, -V, distS);
}

// The channel of a stroke that reaches the sea: a crooked line down from the cloud with two
// forks that give out part way, seen from the side. q is how far the ray passes from the
// upright through the strike, y how high it is there, t how far away.
fn boltKink(y: f32, s: f32) -> f32 {
  let a = y / 310.0 + s;
  let b = y / 83.0 + s * 3.1;
  let c = y / 21.0 + s * 7.3;
  let fa = fract(a); let fb = fract(b); let fc = fract(c);
  return (mix(hash21(vec2<f32>(floor(a), s)), hash21(vec2<f32>(floor(a) + 1.0, s)), fa * fa * (3.0 - 2.0 * fa)) - 0.5) * 240.0
    + (mix(hash21(vec2<f32>(floor(b), s + 5.0)), hash21(vec2<f32>(floor(b) + 1.0, s + 5.0)), fb) - 0.5) * 60.0
    + (mix(hash21(vec2<f32>(floor(c), s + 9.0)), hash21(vec2<f32>(floor(c) + 1.0, s + 9.0)), fc) - 0.5) * 15.0;
}
fn boltLine(d: f32, w: f32) -> f32 {
  return w * w / (d * d + w * w) + 0.05 * w / (abs(d) + 12.0 * w);
}
fn boltSeen(rd: vec3<f32>) -> vec3<f32> {
  if (F.bolt.w * F.boltB.y <= 0.0) { return vec3<f32>(0.0); }
  let h = rd.xz;
  let hl = max(length(h), 1e-4);
  let to = F.bolt.xz - F.camPos.xz;
  let t = dot(to, h) / (hl * hl);
  if (t <= 0.0) { return vec3<f32>(0.0); }
  let y = F.camPos.y + rd.y * t;
  let top = F.cldB.z * 1000.0 + 120.0;
  if (y < 0.0 || y > top) { return vec3<f32>(0.0); }
  let q = (to.x * h.y - to.y * h.x) / hl;
  let s = F.boltB.x;
  let w = max(2.6, t * hl * 0.0014);
  // Pinned to the strike at the sea, wandering more the higher it is.
  let k0 = boltKink(y, s) - boltKink(0.0, s);
  var g = boltLine(q - k0, w);
  for (var i = 0; i < 2; i++) {
    let fs = s + 13.0 + f32(i) * 17.0;
    let y0 = top * (0.5 + 0.3 * hash21(vec2<f32>(fs, 1.0)));
    let y1 = y0 * (0.25 + 0.4 * hash21(vec2<f32>(fs, 2.0)));
    if (y < y0 && y > y1) {
      let side = select(-1.0, 1.0, hash21(vec2<f32>(fs, 3.0)) > 0.5);
      let kf = boltKink(y0, s) - boltKink(0.0, s) + (y0 - y) * side * (0.35 + 0.5 * hash21(vec2<f32>(fs, 4.0)))
        + (boltKink(y, fs) - boltKink(y0, fs)) * 0.6;
      g += boltLine(q - kf, w * 0.7) * 0.4 * smoothstep(y1, y1 + (y0 - y1) * 0.4, y);
    }
  }
  return BOLT_C * (F.bolt.w * 46.0 * g * smoothstep(top, top - 160.0, y) * exp(-t * hl * F.wx.x * 0.00012));
}
@fragment fn fsSky(in: SkyV) -> @location(0) vec4<f32> {
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  // Underwater (or eye below the local surface): rays that miss the terrain mesh hit a
  // procedural infinite seafloor so the bed never ends in a hard cliff of empty haze.
  let uwSky = underK() > 0.22 || F.camPos.y < 0.2;
  if (uwSky) {
    // Near-horizontal rays need long range: bed at −12 m with rd.y=−0.01 is t≈1200 m.
    // Fill the gap between the shelf rim and the underside of the water surface.
    if (rd.y < 0.12) {
      let bed0 = seaBedAt(F.camPos.xz);
      var t = 1.0;
      var hit = false;
      if (rd.y < -1e-4) {
        // Seed on the local bed plane, then walk forward when the shelf drops away
        // (lagoon → open ocean). Δt = −dy/rd.y so above-bed (dy>0) advances along the ray.
        t = clamp((bed0 - F.camPos.y) / rd.y, 0.5, 2400.0);
        for (var k = 0; k < 10; k++) {
          let pk = F.camPos + rd * t;
          let dyk = pk.y - seaBedAt(pk.xz);
          if (abs(dyk) < 0.12) { break; }
          t = clamp(t - dyk / min(rd.y, -1e-4), 0.5, 2400.0);
        }
        hit = true;
      } else {
        // Barely upward: still try a short march in case a rise sits ahead.
        var wp = F.camPos + rd * t;
        for (var i = 0; i < 40; i++) {
          let bed = seaBedAt(wp.xz);
          let dy = wp.y - bed;
          if (dy < 0.12) { hit = true; break; }
          t += clamp(dy * 0.9 / 0.08, 0.6, 28.0);
          if (t > 900.0) { break; }
          wp = F.camPos + rd * t;
        }
      }
      if (hit) {
        var t0 = max(t * 0.92, 0.2);
        var t1 = min(t * 1.08 + 8.0, 2500.0);
        for (var j = 0; j < 14; j++) {
          let tm = 0.5 * (t0 + t1);
          let pm = F.camPos + rd * tm;
          if (pm.y > seaBedAt(pm.xz)) { t0 = tm; } else { t1 = tm; }
        }
        let ph = F.camPos + rd * t1;
        let hy = seaBedAt(ph.xz);
        let n = seaBedNormal(ph.xz);
        return vec4<f32>(shadeFarBed(vec3<f32>(ph.x, hy, ph.z), n), 1.0);
      }
    }
    // Looking up / open water volume: AG in-scatter, muted near the Snell window.
    let haze = waterFogIn(F.camPos, rd, mix(90.0, 160.0, sat(-rd.y * 0.5 + 0.5)));
    let up = sat(rd.y * 2.2);
    return vec4<f32>(haze * mix(1.0, 0.62, up) * mix(vec3<f32>(1.0), vec3<f32>(1.06, 0.94, 0.86), up), 1.0);
  }
  let seen = boltSeen(rd);
  // Any ray that meets the sea plane is open ocean, so the water does not end at the mesh.
  if (rd.y < -0.0003 && F.camPos.y > 0.2 && F.under < 0.5) {
    let t = -F.camPos.y / rd.y;
    if (t > 1.0 && t < 250000.0) {
      let xz = F.camPos.xz + rd.xz * t;
      // The mesh covers the near water. This fills anything it does not, including the horizon.
      return vec4<f32>(farOcean(xz) + seen, 1.0);
    }
  }
  var col = skyColor(rd);
  return vec4<f32>(col + seen, 1.0);
}

struct WaterV {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) xz0: vec2<f32>,
  @location(2) sheet: f32,
  // Breaker ribbon live weight (0 on ocean/shore sheets). Drives alpha + whitewater.
  @location(3) live: f32,
}
// Shared break event from seaAt + shore: one signal for ribbon lip, whitewater, spray, SWE dump cues.
struct BrkEvt {
  live: f32,
  curl: f32,
  collapse: f32,
  brk: f32,
  jac: f32,
  disp: vec3<f32>,
  nrm: vec3<f32>,
  dirN: vec2<f32>,
  depth: f32,
  vel: vec2<f32>,
}
fn breakerEvt(xz: vec2<f32>) -> BrkEvt {
  var o: BrkEvt;
  o.live = 0.0; o.curl = 0.0; o.collapse = 0.0; o.brk = 0.0; o.jac = 1.0;
  o.disp = vec3<f32>(0.0); o.nrm = vec3<f32>(0.0, 1.0, 0.0);
  o.dirN = -SH.sea; o.depth = 30.0; o.vel = vec2<f32>(0.0);
  let field = sampleField(xz);
  let depth = max(-field.x, 0.2);
  o.depth = depth;
  // Active breaker belt only — mid foreshore, not open sea or dry sand.
  let belt = smoothstep(3.4, 0.55, depth) * smoothstep(0.22, -0.05, field.x)
    * smoothstep(-2.65, -0.35, field.x);
  if (belt < 0.02) { return o; }
  let S = seaAt(xz, field.y, depth);
  o.disp = S.disp;
  o.nrm = S.nrm;
  o.jac = S.jac;
  o.brk = S.brk;
  let fold = sat((0.55 - S.jac) * 1.45);
  let tipLen = length(S.disp.xz);
  let dirRaw = select(-SH.sea, S.disp.xz / max(tipLen, 1e-3), tipLen > 0.02);
  // Prefer shoreward (inland = -SH.sea).
  let shoreW = sat(-dot(dirRaw, SH.sea));
  o.dirN = normalize(mix(dirRaw, -SH.sea, 0.35 + 0.45 * shoreW));
  let sh = shoreFetch(xz);
  if (sh.inside > 0.5) {
    o.vel = sh.vel;
  } else {
    o.vel = S.disp.xz * 0.35;
  }
  // Curl = overhang phase; collapse = dump/whitewater/spray phase — same event family.
  o.curl = sat(S.brk * 1.45 + fold * 1.15 + sat(S.disp.y) * 0.5) * belt;
  // Collapse needs break energy + shoreward dump — foam/spray read this, not a paint band.
  o.collapse = sat(S.brk * 1.65 + fold * 0.85) * belt
    * (0.35 + 0.65 * sat(length(o.vel) * 0.12 + sat(-dot(o.dirN, SH.sea)) * 0.4));
  let pack = max(crestPack(dot(vec2<f32>(-o.dirN.y, o.dirN.x), xz), 0.0),
                 crestPack(dot(vec2<f32>(-o.dirN.y, o.dirN.x), xz), 1.0) * 0.85);
  let section = smoothstep(0.16, 0.5, pack);
  // Live wakes on curl/collapse; belt floor only where brk already tripped.
  o.live = sat(max(o.curl, o.collapse * 0.95) * (0.35 + 0.65 * section) * belt
    + belt * sat(S.brk) * (0.18 + 0.22 * fold));
  return o;
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
  // Both periods stay through the shape disk. Ending the second one by a few
  // hundred metres left a single 220 m square once the view held more than one tile.
  let close = 1.0 - smoothstep(160.0, 1800.0, dist);
  let r = vec2<f32>(xz.x * 0.82 - xz.y * 0.57, xz.x * 0.57 + xz.y * 0.82);
  let b = oceanSample(shapeTex, r, 151.0);
  // Shared field tracks weather wind/sea energy (same amp that drives Gerstner).
  let seaE = mix(0.35, 1.15, sat(F.ctrl.x));
  return (a + b * 0.26 * close) * seaE;
}
// Wind chop between the swell and the capillaries, 0.45 to 5 m. This is the
// texture a person actually sees on water from a beach or a boat. Two scales of
// one tile, and it fades once a wavelength is smaller than a pixel.
fn chopField(xz: vec2<f32>, pix: f32) -> vec2<f32> {
  // Soft screen-space cutoff — hard steps read as triangular patches at grazing angles.
  let keep = 1.0 - smoothstep(0.14, 3.4, pix);
  if (keep <= 0.001) { return vec2<f32>(0.0); }
  let seaE = mix(0.4, 1.2, sat(F.ctrl.x));
  let a = oceanSample(chopTex, xz, 24.0);
  let r = vec2<f32>(xz.x * 0.94 + xz.y * 0.34, -xz.x * 0.34 + xz.y * 0.94);
  let b = oceanSample(chopTex, r + vec2<f32>(11.0, 5.0), 15.5);
  let bs = vec2<f32>(b.y * 0.94 - b.z * 0.34, b.y * 0.34 + b.z * 0.94);
  return (a.yz + bs * 0.6) * keep * seaE;
}
// Shared cascade weights for vertex displacement and fragment normals so the lit
// surface never disagrees with the mesh at grazing views.
// x=swell geom, y=shape FFT, z=chop, w=capillary (normals / glint only).
fn waveWeights(dist: f32, foot: f32, footLong: f32, scale: f32) -> vec4<f32> {
  let open = mix(0.45, 1.0, scale);
  let band = seaBands(dist, foot);
  let swell = seaFade(dist);
  let elev = max(abs(F.camPos.y), 0.5);
  // Soft cascade handoff: fine FFT/chop leave first; swell carries the mid/far silhouette.
  // Keep more shape energy at altitude so overhead views still show wave structure.
  // Shape / chop / capillary each fade on long smoothsteps — amplitude never drops as a step.
  let shape = smoothstep(mix(900.0, 1800.0, sat(elev / 180.0)), 40.0, dist)
    * (1.0 - smoothstep(3.0, 70.0, footLong))
    * open * mix(1.0, 0.5, band.z);
  let chopCut = mix(3.2, 1.35, sat(elev / 120.0));
  let chop = (1.0 - smoothstep(0.1, chopCut, foot)) * smoothstep(980.0, 35.0, dist)
    * open * (0.25 + 0.75 * band.x);
  let cap = mix(0.015, 0.28, band.x) * (1.0 - smoothstep(0.05, 1.6, foot)) * open;
  return vec4<f32>(swell, shape, chop, cap);
}
// Cheap continuous height for FD normals — FFT height only. Gerstner already has
// analytic normals in seaAt; recomputing it three times per pixel stalls soft GPUs.
fn seaEta(xz: vec2<f32>, w: vec4<f32>) -> f32 {
  return shapeField(xz).x * w.y + oceanSample(chopTex, xz, 24.0).x * w.z * 0.55;
}
const WGRID: f32 = ${(wgrid - 1).toFixed(1)};
// Disk around the camera. Inner rings (SEA_SPLIT of the grid) hold the waves out to
// SEA_INNER metres; the rest carry that same sea out toward the horizon, still
// inside the projection far plane. F.cover is the outer radius, F.pad0 the inner
// exponent, F.gridO the snapped centre.
const SEA_SPLIT: f32 = 0.72;
const SEA_INNER: f32 = 8000.0;
fn seaRadius(t: f32) -> f32 {
  let k = max(F.pad0, 2.0);
  let reach = max(F.cover, SEA_INNER);
  if (t <= SEA_SPLIT) {
    let u = t / SEA_SPLIT;
    return SEA_INNER * (exp(k * u) - 1.0) / (exp(k) - 1.0);
  }
  let u = (t - SEA_SPLIT) / (1.0 - SEA_SPLIT);
  return SEA_INNER * exp(log(reach / SEA_INNER) * u);
}
// Coarse edge of the ring under this point: radial spacing against the arc.
// The old square used max(cell.x, cell.y), so the level set was a diamond.
fn seaCell(dist: f32) -> f32 {
  let k = max(F.pad0, 2.0);
  let radial = k * (dist + SEA_INNER / (exp(k) - 1.0)) / (SEA_SPLIT * WGRID);
  let arc = dist * 6.28318530718 / WGRID;
  return max(radial, arc);
}
// Displacement LOD shared with the fragment normal. x = swell, y = shape.
// One Gerstner / FFT phase at every level — only the amplitude eases, on a long
// smoothstep, so a grid snap cannot pop a ring.
fn seaLod(dist: f32, depth: f32) -> vec2<f32> {
  let elev = max(abs(F.camPos.y), 0.5);
  let graze = sat(elev / max(dist * 0.35, 1.0));
  let cell = seaCell(dist);
  let shallow = 1.0 - smoothstep(0.35, 3.2, depth);
  let swell = 1.0 - smoothstep(mix(3.4, 5.5, shallow), mix(13.0, 20.0, shallow), cell);
  let shape = (1.0 - smoothstep(mix(1.6, 2.6, shallow), mix(7.2, 12.0, shallow), cell))
            * smoothstep(0.01, 0.12, graze);
  return vec2<f32>(swell, shape);
}
@vertex fn vsWater(@location(0) uv: vec2<f32>) -> WaterV {
  let ang = uv.x * 6.28318530718;
  let xz = F.gridO + vec2<f32>(cos(ang), sin(ang)) * seaRadius(uv.y);
  let field = sampleField(xz);
  let depth = max(-field.x, 0.2);
  let s = seaAt(xz, field.y, depth);
  let dist = length(xz - F.camPos.xz);
  let pix = max(dist * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let elev = max(abs(F.camPos.y), 0.15);
  let footLong = pix / max(elev / max(dist, 0.1), 0.01);
  let foot = pix / pow(elev / max(dist, 0.1), 0.6);
  let ww = waveWeights(dist, foot, footLong, field.y);
  // Large-scale geometry, then the same radial LOD the fragment applies to normals.
  // A short per-axis gate left a diamond of ripples; what fades from the mesh fades
  // from the lighting. Swell still carries the silhouette when the eye is high.
  let geom = smoothstep(mix(1100.0, 2600.0, sat(elev / 200.0)), 140.0, dist);
  let lod = seaLod(dist, depth);
  let gs = geom * ww.x * lod.x;
  // Depth-only coastal yield — never shoreFetch on the ocean disk (8 loads/vert tanked FPS).
  // Strong XZ yield nearshore so sheet owns the free surface; keep Y for continuous height.
  let tipXZ = mix(1.0, 0.22, smoothstep(5.0, 0.55, depth));
  let tipY = mix(1.0, 0.9, smoothstep(3.8, 0.45, depth));
  var w = vec3<f32>(
    xz.x + s.disp.x * gs * tipXZ,
    s.disp.y * mix(0.05, 1.0, geom) * mix(0.15, 1.0, ww.x) * lod.x * tipY,
    xz.y + s.disp.z * gs * tipXZ
  );
  w.y += ripAt(xz).x * geom * lod.y * tipY;
  w.y += shapeField(xz).x * ww.y * lod.y * tipY;
  let bedW = sampleField(w.xz).x;
  if (bedW < 0.0) { w.y = max(w.y, min(bedW + 0.05 + dist * 0.008, 0.0)); }
  // Near-plane safety: when the eye sits in the waterline band, keep surface verts
  // beyond the near clip so the mesh does not vanish into giant clipped holes. The vertex
  // slides level along the water, so it is never lifted off the sea into the view: water
  // behind the eye is left to the clipper, and never lands in the sky of an upward look.
  let along = dot(w - F.camPos, F.fwd);
  let lvl = F.fwd.xz / max(length(F.fwd.xz), 1e-3);
  let cosP = dot(lvl, F.fwd.xz);
  if (along < 0.14 && along > -3.0 && cosP > 0.25 && dot(w.xz - F.camPos.xz, lvl) > -0.3) {
    let push = (0.14 - along) / cosP;
    w = vec3<f32>(w.x + lvl.x * push, w.y, w.z + lvl.y * push);
  }
  var o: WaterV;
  o.world = w;
  o.xz0 = xz;
  o.sheet = 0.0;
  o.live = 0.0;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}

// Identity UV — sim grid owns spacing; do not warp to hide instability.
fn shoreWarp(uv: vec2<f32>) -> vec2<f32> {
  return uv;
}
// ONE coastal free surface on the shore sheet:
//   seaward rim — seaAt (phase-matched to ocean);
//   foreshore / wash — SWE η = bed + h;
//   blend weight from bed/depth/wet only — never brk-flip between shapes (that popped).
@vertex fn vsShore(@location(0) uv: vec2<f32>) -> WaterV {
  let suv = shoreWarp(uv);
  let fi = suv.x * max(SH.nx - 1.0, 1.0);
  let fj = suv.y * max(SH.nz - 1.0, 1.0);
  let xz0 = SH.origin + SH.along * (fi + 0.5) * SH.dx + SH.sea * (fj + 0.5) * SH.dx;
  let sh = shoreFetch(xz0);
  let field0 = sampleField(xz0);
  let bedUse = select(field0.x, sh.bed, sh.inside > 0.5);
  let toSand = smoothstep(-0.28, 0.04, bedUse);
  let shoreOffV = fj / max(SH.nz - 1.0, 1.0);
  // Interior of domain prefers fluid once any sheet water exists; rim stays seaAt-led.
  let pastRim = 1.0 - smoothstep(0.62, 0.9, shoreOffV);
  let hasSheet = smoothstep(0.004, 0.07, sh.h + sh.foam * 0.3 + sh.wet * 0.015);
  // Continuous fluid ownership — bed + wet only (no brk crestHold flip).
  let fluidW = sat(max(toSand, pastRim * max(hasSheet, 0.35))) * sh.inside;
  var xz = xz0;
  var y = select(field0.x, sh.eta, sh.inside > 0.5);
  // Sample seaAt whenever the sheet is not fully fluid-owned sand (continuous rim).
  if (sh.inside > 0.5 && fluidW < 0.97) {
    let depth0 = max(-bedUse, 0.2);
    let s = seaAt(xz0, field0.y, depth0);
    let distSh = length(xz0 - F.camPos.xz);
    let pixSh = max(distSh * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
    let elevSh = max(abs(F.camPos.y), 0.15);
    let footSh = pixSh / pow(elevSh / max(distSh, 0.1), 0.6);
    let footLongSh = pixSh / max(elevSh / max(distSh, 0.1), 0.01);
    let wwSh = waveWeights(distSh, footSh, footLongSh, field0.y);
    let geomSh = smoothstep(mix(1100.0, 2600.0, sat(elevSh / 200.0)), 140.0, distSh);
    let lodSh = seaLod(distSh, depth0);
    let gs = geomSh * wwSh.x * lodSh.x;
    // Cap tip XZ on the sheet — large tip throw was the shard/pop source.
    let tipCap = mix(0.55, 0.12, smoothstep(3.5, 0.4, depth0));
    xz = xz0 + s.disp.xz * gs * (1.0 - fluidW) * tipCap;
    var ySea = s.disp.y * mix(0.2, 1.0, geomSh) * mix(0.35, 1.0, wwSh.x) * lodSh.x;
    ySea += shapeField(xz0).x * wwSh.y * lodSh.y * (1.0 - fluidW * 0.7);
    let film = smoothstep(0.12, 0.015, sh.h);
    let yWash = mix(sh.eta, max(sh.eta, bedUse + 0.003), film * toSand);
    // Soft bed/wet mix only — one continuous η, no shape popping.
    y = mix(ySea, yWash, fluidW);
  } else if (sh.inside > 0.5) {
    let film = smoothstep(0.12, 0.015, sh.h);
    y = mix(sh.eta, max(sh.eta, bedUse + 0.003), film * toSand);
  }
  // Mild run-up silhouette from SWE velocity — not noise-jagged tongues.
  if (sh.inside > 0.5 && toSand > 0.18) {
    let runK = smoothstep(0.2, 0.9, toSand) * smoothstep(0.004, 0.06, sh.h + sh.foam * 0.25);
    y -= sat(dot(sh.vel, SH.sea)) * runK * 0.014;
    y += sat(-dot(sh.vel, SH.sea)) * runK * 0.01 * smoothstep(0.02, 0.1, sh.h);
  }
  var o: WaterV;
  o.world = vec3<f32>(xz.x, y, xz.y);
  o.xz0 = xz0;
  o.sheet = 1.0;
  o.live = 0.0;
  o.clip = F.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}

// Localized breaker ribbon: alongshore × cross-section. Multi-valued overhang lives here —
// FFT/Gerstner sheets stay single-valued. Only draws where breakerEvt.live is high.
// Crest track follows break-belt depth so the lip rides the shared event, not a fixed fj.
@vertex fn vsBreaker(@location(0) uv: vec2<f32>) -> WaterV {
  let alongT = uv.x;
  let sec = uv.y;
  let nx = max(SH.nx, 1.0);
  let nz = max(SH.nz, 1.0);
  let fiB = alongT * max(nx - 1.0, 1.0);
  // Probe seaward column for break-belt bed; place ribbon where depth matches trip.
  let alongP = SH.origin + SH.along * (fiB + 0.5) * SH.dx;
  let pLo = alongP + SH.sea * (0.28 * nz + 0.5) * SH.dx;
  let pMid = alongP + SH.sea * (0.48 * nz + 0.5) * SH.dx;
  let pHi = alongP + SH.sea * (0.66 * nz + 0.5) * SH.dx;
  let dLo = max(-sampleField(pLo).x, 0.2);
  let dMid = max(-sampleField(pMid).x, 0.2);
  let dHi = max(-sampleField(pHi).x, 0.2);
  // Prefer ~0.7–2.2 m depth for plunging crest; fall inland as bed shallows.
  let sLo = smoothstep(2.6, 1.1, dLo) * smoothstep(0.35, 0.9, dLo);
  let sMid = smoothstep(2.6, 1.1, dMid) * smoothstep(0.35, 0.9, dMid);
  let sHi = smoothstep(2.6, 1.1, dHi) * smoothstep(0.35, 0.9, dHi);
  var crestJ = 0.48;
  var best = sMid;
  if (sLo > best) { crestJ = 0.28; best = sLo; }
  if (sHi > best) { crestJ = 0.66; best = sHi; }
  crestJ += (n2(vec2<f32>(alongT * 11.0, F.time * 0.07)) - 0.5) * 0.08;
  crestJ = clamp(crestJ, 0.22, 0.72);
  let fjB = crestJ * max(nz - 1.0, 1.0);
  let home = alongP + SH.sea * (fjB + 0.5) * SH.dx;
  let meander = (n2(vec2<f32>(alongT * 7.3, floor(F.time * 0.15))) - 0.5) * 1.6
    + (n2(vec2<f32>(alongT * 19.0, 3.1)) - 0.5) * 0.65;
  let homeM = home + SH.along * meander;
  let ev = breakerEvt(homeM);
  let field = sampleField(homeM);
  let S = seaAt(homeM, field.y, ev.depth);
  let baseY = S.disp.y + shapeField(homeM).x * 0.35;
  let baseXZ = homeM + S.disp.xz;
  // Cross-section: seaward root → steep face → overhanging lip → collapse dump shoreward.
  let face = smoothstep(0.0, 0.28, sec) * (1.0 - smoothstep(0.28, 0.55, sec));
  let lip = smoothstep(0.2, 0.5, sec) * (1.0 - smoothstep(0.5, 0.78, sec));
  let fall = smoothstep(0.6, 1.0, sec);
  let root = 1.0 - smoothstep(0.0, 0.16, sec);
  // Restrained lip — prior tipThrow×amp self-intersected into sky shards through foliage.
  let live = sat(ev.live * 1.05 + sat(ev.brk * 0.55 + ev.curl * 0.4) * 0.3);
  let ang = clamp(0.75 + (ev.curl * 1.05 + lip * 0.55) * max(live, 0.35), 0.7, 1.55);
  let amp = max(abs(S.disp.y), 0.18) * (1.0 + 0.35 * sat(ev.brk) + 0.22 * ev.curl);
  let lipR = (0.75 + 1.35 * amp + 1.0 * ev.curl) * (0.45 + 0.55 * live);
  let wLip = lip * max(live, 0.35);
  let ox = sin(ang) * lipR * wLip;
  let oy = (cos(ang) - 1.0) * lipR * wLip * 0.4;
  let faceLift = face * max(live, 0.35) * (0.45 + 0.85 * ev.curl + 0.3 * sat(ev.brk)) * amp;
  let tipThrow = ox + (0.85 + 1.5 * ev.curl) * lip * max(live, 0.3) * amp;
  let dumpPush = fall * max(live, 0.3) * (0.7 + 1.15 * ev.collapse) * amp;
  let dumpDrop = fall * max(live, 0.3) * (0.35 + 0.85 * ev.collapse) * amp;
  let cross = (sec - 0.15) * (1.8 + 2.6 * live) + tipThrow * 0.18;
  let inland = -SH.sea;
  var w = vec3<f32>(
    baseXZ.x + inland.x * (cross + tipThrow * 0.7 + dumpPush * 0.85),
    mix(baseY, baseY + faceLift + oy + lip * max(live, 0.45) * 0.7 * max(S.disp.y, 0.08) - dumpDrop, max(live, 0.35)),
    baseXZ.y + inland.y * (cross + tipThrow * 0.7 + dumpPush * 0.85)
  );
  let shapeK = sat(live * (1.0 - root * 0.65) + (1.0 - root) * max(live, 0.35));
  w = mix(vec3<f32>(baseXZ.x, baseY, baseXZ.y), w, shapeK);
  w = mix(vec3<f32>(baseXZ.x, baseY, baseXZ.y), w, smoothstep(0.08, 0.28, live));
  var o: WaterV;
  o.world = w;
  o.xz0 = homeM;
  o.sheet = 2.0;
  o.live = live;
  o.clip = F.viewProj * vec4<f32>(w, 1.0);
  return o;
}

fn worldAt(frag: vec2<f32>, depth: f32) -> vec3<f32> {
  let uv = frag / F.res;
  let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let w = F.invViewProj * ndc;
  return w.xyz / max(w.w, 1e-4);
}

// The flash, marched through the cloud and added onto the sky. Land already covers
// those pixels, so anything in front of the sky is left alone. F.cloudOwn means a
// near-field volume pass owns the low cloud and adds boltAt itself.
@fragment fn fsBoltVol(in: SkyV) -> @location(0) vec4<f32> {
  if (F.bolt.w <= 0.0 || F.under > 0.5 || F.cloudOwn > 0.5) { discard; }
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  if (boltMiss(rd) > 3.2) { discard; }
  let uv = vec2<f32>(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let px = vec2<i32>(clamp(uv * F.res, vec2<f32>(0.0), F.res - 1.0));
  let dep = textureLoad(sceneDepth, px, 0);
  if (dep < 0.9995) { discard; }
  return vec4<f32>(boltMarch(rd), 1.0);
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
    light = F.amb.rgb * 1.3 + F.sunCol * (0.3 + 1.5 * pow(sat(0.5 + 0.5 * dot(normalize(w - F.camPos), F.sunDir)), 6.0))
      + BOLT_C * boltNear(w) * 0.08;
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
    light = F.sunCol * lit * (0.2 + 5.5 * pow(sat(0.5 + 0.5 * mu), 8.0));
    a = min(1.0, (r * r) / (rad * rad)) * (0.7 + 0.45 * sat(F.wx.w))
      * smoothstep(0.02, 0.2, dot(light, vec3<f32>(0.33)));
    o.form = 1.0;
    o.dist = d;
  } else {
    // Shore spray from overturn collapse: seaAt.brk (curl/fall) + shore foam/velocity.
    // Large droplets from the lip; fine mist from the aerated wash — both inherit jet+wind.
    let k = ii - DROP_SPRAY;
    let stormOpen = sat(F.mood.y) * 0.55 + sat(F.wx.x) * 0.35;
    let mistSlot = select(0u, 1u, (k % 3u) == 2u);
    let slotStride = select(4u, 2u, stormOpen > 0.45);
    let slotOn = select(0u, 1u, (k % slotStride) == 0u || mistSlot > 0u);
    let cellc = floor(F.camPos.xz / 3.6) + vec2<f32>(f32(k % 32u), f32(k / 32u)) - 16.0;
    let hh = hash22(cellc);
    let home = (cellc + hh) * 3.6;
    let fld = sampleField(home);
    let deep = max(-fld.x, 0.2);
    var force = 0.0;
    var top = 0.0;
    var jet = vec2<f32>(0.0);
    var breakDir = vec2<f32>(0.0);
    if (slotOn > 0u && fld.x < 0.15 && fld.x > -2.2) {
      // Shared breaker event — spray only from collapse region, same signal as ribbon/SWE.
      let ev = breakerEvt(home);
      let focus = sat((1.0 - ev.jac) * 1.25) + sat(length(ev.nrm.xz) * 1.3) * 0.28;
      let collapse = sat(ev.collapse * 1.15 + focus * 0.45 + ev.brk * 0.55);
      force = collapse * max(ev.live, 0.35) * smoothstep(2.4, 0.35, deep) * (0.65 + 0.45 * stormOpen);
      // Mist layer needs less force; big droplets need a hard collapse.
      if (mistSlot == 0u) { force *= smoothstep(0.15, 0.48, collapse); }
      top = ev.disp.y;
      breakDir = ev.dirN;
      // Lip jet inherits overturn throw; shoreward bias so spray leaves the crest, not floats.
      jet = ev.dirN * sat(ev.collapse * 1.85 + ev.curl * 0.7) * (0.85 + 0.55 * ev.live);
      jet += ev.vel * 0.22;
      let sh = shoreFetch(home);
      if (sh.inside > 0.5) {
        let spd = length(sh.vel);
        force = max(force, sat(sh.foam * 0.95) * smoothstep(0.4, 1.9, spd) * (0.4 + 0.3 * stormOpen) * sat(ev.collapse + 0.25));
        force = max(force, smoothstep(-0.25, 0.2, sh.bed) * sat(sh.foam + spd * 0.1) * 0.32 * sat(ev.live + 0.2));
        top = max(top, sh.eta);
        jet += sh.vel * 0.25;
        breakDir += sh.vel * 0.15;
      }
    }
    let life = fract(F.time * (0.38 + 0.32 * hh.x) + hh.y * 9.0);
    let local = windAt(home);
    let blow = clamp(local / 5.0, 0.2, 2.2);
    let humid = sat(F.wx.w);
    // Gravity arc: launch with break jet, then fall; wind advects after leave.
    let launch = 0.55 + 0.9 * force * (0.4 + 0.6 * hh.y);
    let rise = (0.1 + launch * pow(life, 0.38) * (select(0.55, 1.15, mistSlot == 0u)))
      * (0.45 + 0.5 * blow) - (1.05 + 0.35 * force) * life * life;
    let throwK = select(1.6, 3.2, mistSlot == 0u);
    let w = vec3<f32>(
      home.x + jet.x * life * throwK + breakDir.x * life * 0.35,
      max(top, 0.0) + rise,
      home.y + jet.y * life * throwK + breakDir.y * life * 0.35
    )
      + vec3<f32>(F.wind.x, 0.0, F.wind.y) * local * 0.55 * life * life * 1.6
      + vec3<f32>(0.0, sin(life * 9.0 + hh.x * 20.0) * select(0.015, 0.04, mistSlot == 0u), 0.0);
    let rad = select(0.06 + 0.22 * life, 0.16 + 0.62 * life, mistSlot == 0u)
      * (0.5 + 0.55 * hh.x) * (0.7 + 0.25 * humid) * (1.0 + 0.2 * stormOpen);
    pos = w + (F.right * c.x + F.upv * c.y) * rad * step(select(0.04, 0.05, mistSlot == 0u), force);
    let mu = dot(normalize(w - F.camPos), F.sunDir);
    // Backlit spray glows; mist is a softer veil.
    let back = pow(sat(mu), select(3.2, 4.5, mistSlot == 0u));
    light = F.amb.rgb * select(0.55, 0.4, mistSlot == 0u)
      + F.sunCol * sunVis(w) * cloudShade(w.xz, 0.0)
        * (0.1 + select(1.1, 1.55, mistSlot == 0u) * back);
    o.dist = length(w - F.camPos);
    a = force * sin(life * 3.14159) * (select(0.07, 0.13, mistSlot == 0u) + 0.08 * humid + 0.05 * stormOpen) * blow
      * smoothstep(1.2, 8.0, o.dist) * smoothstep(select(36.0, 52.0, mistSlot == 0u), 10.0, o.dist);
    o.form = 2.0;
  }
  // Rising underwater bubbles (form≈3): reuse spray lattice slots when submerged.
  if (F.under > 0.35 && ii >= DROP_SPRAY) {
    let k = ii - DROP_SPRAY;
    let bubOn = select(0u, 1u, (k % 5u) == 0u);
    let cellc = floor(F.camPos.xz / 2.8) + vec2<f32>(f32(k % 28u), f32(k / 28u)) - 14.0;
    let hh = hash22(cellc + 17.0);
    let home = (cellc + hh) * 2.8;
    let fld = sampleField(home);
    let bed = fld.x;
    var ba = 0.0;
    var bpos = vec3<f32>(0.0);
    if (bubOn > 0u && bed < -0.4 && F.camPos.y < 0.6) {
      let life = fract(F.time * (0.22 + 0.18 * hh.x) + hh.y * 11.0);
      let deep = max(-bed, 0.5);
      let rise = bed + 0.15 + life * min(deep - 0.25, 4.5);
      let drift = seaCurrent(home) * life * 0.8;
      // Wreck / reef bubble bias at both 1800s hull sites.
      let nearWreck = max(
        exp(-length(home - vec2<f32>(232.0, -45.0)) * 0.08),
        exp(-length(home - vec2<f32>(240.0, 10.0)) * 0.08)
      );
      let rate = 0.35 + 0.55 * nearWreck + 0.25 * sat((-bed - 2.0) / 5.0) + 0.2 * sat((-bed - 10.0) / 8.0);
      bpos = vec3<f32>(home.x + drift.x, rise, home.y + drift.y);
      let d = length(bpos - F.camPos);
      let rad = max(0.008 + 0.02 * hh.x * (1.0 - life * 0.5), d * pxw * 0.55);
      pos = bpos + (F.right * c.x + F.upv * c.y) * rad;
      light = F.amb.rgb * 0.8 + F.sunCol * 0.25 * sat(F.sunDir.y + 0.2);
      ba = rate * (1.0 - life) * life * 4.0 * smoothstep(0.4, 3.0, d) * smoothstep(28.0, 8.0, d)
        * step(bpos.y, -0.05) * step(bed + 0.08, bpos.y);
      o.dist = d;
      o.form = 3.0;
      a = ba;
    }
  }
  let aboveK = select(1.0 - F.under, 1.0, o.form > 2.5);
  o.col = vec4<f32>(airMix(light, normalize(pos - F.camPos), o.dist), a * aboveK);
  o.clip = F.viewProj * vec4<f32>(pos, 1.0);
  return o;
}
@fragment fn fsDrops(in: DropV) -> @location(0) vec4<f32> {
  if (hidden(in.clip)) { discard; }
  var a = in.col.a;
  let r = length(in.uv);
  if (in.form < 0.5) {
    a *= (1.0 - abs(in.uv.x)) * (1.0 - in.uv.y * in.uv.y);
  } else if (in.form < 1.5) {
    a *= smoothstep(1.0, 0.25, r);
  } else if (in.form < 2.5) {
    // A puff is torn and uneven; softer falloff so sparse spray does not read as a fog wall.
    let n = n2(in.uv * 1.7 + vec2<f32>(in.seed * 31.0, in.seed * 17.0)) * 0.6 + n2(in.uv * 4.3 + vec2<f32>(in.seed * 7.0, 3.0)) * 0.4;
    a *= smoothstep(1.0, 0.28, r) * smoothstep(0.28, 0.82, n) * 0.72;
    let dep = textureLoad(sceneDepth, vec2<i32>(in.clip.xy), 0);
    if (dep < 0.99999) { a *= sat((length(worldAt(in.clip.xy, dep) - F.camPos) - in.dist) / 0.8 + 0.3); }
  } else {
    // Rising bubble: bright rim, soft core.
    a *= smoothstep(1.0, 0.55, r) * (0.35 + 0.65 * smoothstep(0.15, 0.55, r));
  }
  if (a < 0.003) { discard; }
  return vec4<f32>(tonemap(in.col.rgb), a);
}

// ---- The air between the eye and what it sees, marched at half resolution: mist lying
// in the low ground, damp air under the trees, spray drifting off the surf, rain falling
// from distant cloud. Every step asks the shadow maps whether the sun reaches it, so light
// comes through gaps in the fronds as shafts and stops where a trunk or a hill is in the way.
fn sunVis(p: vec3<f32>) -> f32 {
  // Tiny offset toward the sun so volumetric samples sit just above caster surfaces.
  // Always sample both maps (no divergent if) — safer under air-pass wave divergence.
  let q = p + F.sunDir * 0.04;
  let cn = F.nearVP * vec4<f32>(q, 1.0);
  let nearIn = max(abs(cn.x), abs(cn.y));
  let un = clamp(vec2<f32>(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5), vec2<f32>(0.001), vec2<f32>(0.999));
  let nearLit = textureSampleCompareLevel(shadowNear, shadowSamp, un, clamp(cn.z - 0.0006, 0.0, 1.0));
  let c = F.shadowVP * vec4<f32>(q, 1.0);
  let uv = clamp(vec2<f32>(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5), vec2<f32>(0.001), vec2<f32>(0.999));
  let farLit = textureSampleCompareLevel(shadowMap, shadowSamp, uv, clamp(c.z - 0.001, 0.0, 1.0));
  let wn = 1.0 - smoothstep(0.7, 0.96, nearIn);
  let inside = smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x)
    * smoothstep(0.0, 0.04, uv.y) * smoothstep(1.0, 0.96, uv.y);
  return mix(mix(1.0, farLit, inside), nearLit, wn);
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
  // Damp air near the ground, thickest under forest — clear days stay clear (humidity²).
  let wood = smoothstep(1.9, 4.4, fld.x) * smoothstep(-0.62, -0.12, forestNoise(p.xz));
  d += F.wx.w * F.wx.w * (0.00055 + 0.0030 * wood) * airLayer(22.0, ya, yb, seg);
  // The air of a low sun: cooling, it holds a thin haze near the ground and the sea, and that
  // is what the light stands in between the trunks and under the gaps in the cloud.
  // Slightly denser so golden-hour shafts and headlands read through real air, not a vacuum.
  d += F.day.w * 0.00072 * airLayer(36.0, ya, yb, seg);
  // Low ocean mist — kept very thin until a realistic spray model replaces the puff cards.
  let sea = smoothstep(-1.8, -0.05, fld.x) * smoothstep(0.9, -0.2, fld.x);
  d += sea * F.wx.w * 0.00032 * (0.45 + 0.55 * n) * airLayer(3.2, ya, yb, seg) * (1.0 - sat(F.sunTrue.w));
  // Spray optical depth over energetic surf — sparse, low, only right at the break.
  let surf = smoothstep(-1.6, -0.35, fld.x) * smoothstep(0.85, 0.05, fld.x) * fld.y;
  d += surf * surf * 0.00012 * F.wind.z * (0.35 + n) * airLayer(2.2, ya, yb, seg);
  // Rain hangs in grey curtains under the heavier cells.
  d += F.wx.x * 0.0022 * smoothstep(0.3, 0.75, n2(p.xz * 0.0016 + F.windOff.xy * 1.6)) * step(p.y, 900.0) * seg;
  return d;
}
// Motes under trees: pollen, dust and insects' wings, which hang where leaves keep the wind
// off. They are too few to dim anything or to hold the light of the sky, but each throws
// the sun forward, so they are what a shaft through the leaves is seen by. Per metre, at a
// point with the ground fld below it: thick under the forest, thin wherever else there is
// ground, none out at sea, and thinning with height above the crowns.
fn motes(p: vec3<f32>, fld: vec2<f32>) -> f32 {
  let wood = smoothstep(1.9, 4.4, fld.x) * smoothstep(-0.62, -0.12, forestNoise(p.xz));
  let land = smoothstep(-0.3, 0.6, fld.x);
  let h = max(p.y - max(fld.x, 0.0), 0.0);
  // Open ground: thin dust, strongest low, so a palm shaft still meets the sand.
  let dust = exp(-h / 16.0);
  // Under crowns the dust hangs in the volume the gaps light, and thins at the floor
  // so the beams stay shafts and the ground stays a surface.
  let beam = smoothstep(0.35, 1.8, h) * exp(-max(h - 2.2, 0.0) / 14.0);
  let hang = mix(dust, beam, wood);
  // A low sun stands in them. Rain and a high sun keep them quiet. No extinction.
  let gleam = mix(0.7, 1.22, sat(F.day.w)) * (1.0 - 0.65 * sat(F.wx.x));
  return (0.0009 * land + 0.018 * wood * gleam) * hang;
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
  if (underK() > 0.45) {
    // Volumetric shafts from the shared surface field (same seaAt/FFT as caustics/mesh).
    if (rd.y > 1e-4) { far = min(far, -F.camPos.y / rd.y); }
    let end = min(far, 16.0);
    let sr = normalize(vec3<f32>(F.sunDir.x * 0.75, sqrt(1.0 - 0.5625 * (1.0 - F.sunDir.y * F.sunDir.y)), F.sunDir.z * 0.75));
    let lit = cloudShade(F.camPos.xz, 0.0);
    let ph = 0.22 + 1.65 * pow(sat(0.5 + 0.5 * dot(rd, sr)), 4.0);
    for (var i = 0; i < 12; i++) {
      let t = end * (f32(i) + jit) / 12.0;
      let p = F.camPos + rd * t;
      let deep = max(-p.y, 0.0);
      let sxz = p.xz + sr.xz * (deep / max(sr.y, 0.2));
      let fldS = sampleField(sxz);
      // seaAt only (group 0) — fsAir has no FFT bind group.
      let SS = seaAt(sxz, fldS.y, max(-fldS.x, 0.25));
      let focus = sat((1.0 - SS.jac) * 1.2) + sat(length(SS.nrm.xz) * 1.8) * 0.45 + SS.brk * 0.4;
      // Fine particulate flicker rides the same focus — suspended scatter, not flat haze.
      let mote = 0.55 + 0.45 * n2(p.xz * 3.2 + vec2<f32>(F.time * 0.15, deep));
      let ray = smoothstep(0.25, 0.85, focus) * mote;
      let absorb = exp(-deep * vec3<f32>(0.22, 0.07, 0.045));
      L += F.sunCol * absorb * ray * ph * lit * exp(-t * 0.065) * (end / 12.0) * 0.095;
    }
    return foldCloud(vec4<f32>(L, 1.0), in.clip.xy);
  }
  if (rd.y < -1e-4) { far = min(far, F.camPos.y / -rd.y); }
  // Each stretch of damp air sends on the sunlight that reaches it, past the fronds and past
  // the clouds, and the light of the sky. A shaft is the lit air beside the air in shadow,
  // and under trees the motes (above) are most of what is lit. Droplets throw most of what they scatter forward, so the
  // air is brightest toward the sun, by the same law as the haze in the sky behind it.
  let dayK = smoothstep(-0.02, 0.04, F.sunTrue.y);
  let ph = 0.07 + 0.18 * hg(mu, 0.75);
  // The motes' own lobe: wider than a droplet's, so a shaft seen from the side still shows.
  let phM = (0.05 + 0.3 * hg(mu, 0.5)) * dayK;
  let amb = skyDim(normalize(vec3<f32>(rd.x, abs(rd.y) + 0.6, rd.z))) * 0.75 + F.amb.rgb * 0.08;
  let samples = select(10, 14, F.cloudOct >= 2.5);
  let nearEnd = min(far, 56.0);
  let dn = nearEnd / f32(samples);
  for (var i = 0; i < 14; i++) {
    if (i >= samples) { break; }
    let t = dn * (f32(i) + jit);
    let p = F.camPos + rd * t;
    let fld = sampleField(p.xz);
    let a = 1.0 - exp(-airTau(p, fld, F.camPos.y + rd.y * dn * f32(i), F.camPos.y + rd.y * dn * f32(i + 1), dn));
    let litA = sunVis(p - rd * (dn * 0.28));
    let litB = sunVis(p);
    let litC = sunVis(p + rd * (dn * 0.28));
    let lit = (litA + litB + litC) * 0.333 * cloudShade(p.xz, p.y);
    L += T * (a * (F.sunCol * (lit * ph * dayK) + amb) + F.sunCol * (lit * phM * motes(p, fld) * dn));
    L += BOLT_C * boltNear(p) * 0.00045 * dn;
    T *= 1.0 - a;
  }
  if (far > 56.0) {
    let span = min(far, 1500.0) - 56.0;
    let farN = select(6, 9, F.cloudOct >= 2.5);
    for (var i = 0; i < 9; i++) {
      if (i >= farN) { break; }
      let t0 = 56.0 + span * f32(i * i) / 81.0;
      let t1 = 56.0 + span * f32((i + 1) * (i + 1)) / 81.0;
      let p = F.camPos + rd * mix(t0, t1, jit);
      let fld = sampleField(p.xz);
      let a = 1.0 - exp(-airTau(p, fld, F.camPos.y + rd.y * t0, F.camPos.y + rd.y * t1, t1 - t0));
      let lit = sunVis(p) * cloudShade(p.xz, p.y);
      // Far off a shaft is narrower than a step and the motes are a veil, not a shaft: they
      // are counted at half strength and let go over the next couple of hundred metres.
      L += T * (a * (F.sunCol * (lit * ph * dayK) + amb) + F.sunCol * (lit * phM * motes(p, fld) * (t1 - t0) * 0.5 * exp(-(t0 - 56.0) / 90.0)));
      L += BOLT_C * boltNear(p) * 0.00045 * (t1 - t0);
      T *= 1.0 - a;
    }
  }
  return foldCloud(vec4<f32>(L, T), in.clip.xy);
}
// The cloud buffer is the same size as this pass. Folding it here keeps water under
// the 16-sampled-texture limit (stars are procedural storage, not a sampled map).
// Cross + diagonal blur hides residual march grain without a spatial dither pattern.
fn foldCloud(air: vec4<f32>, px: vec2<f32>) -> vec4<f32> {
  let p = vec2<i32>(px);
  let c = (textureLoad(cloudTex, p, 0) * 2.0
    + textureLoad(cloudTex, p + vec2<i32>(1, 0), 0)
    + textureLoad(cloudTex, p + vec2<i32>(-1, 0), 0)
    + textureLoad(cloudTex, p + vec2<i32>(0, 1), 0)
    + textureLoad(cloudTex, p + vec2<i32>(0, -1), 0)
    + textureLoad(cloudTex, p + vec2<i32>(1, 1), 0)
    + textureLoad(cloudTex, p + vec2<i32>(-1, -1), 0)) * 0.125;
  return vec4<f32>(c.rgb * air.a + air.rgb, c.a * air.a);
}
// The cloud deck in front of the world, marched every frame once the eye is near it.
// Distances in metres; cloudDen is in kilometres. rgb is in-scatter, a is transmittance.
// Quality (F.cloudOct 1..3) is the step count and the light taps.
fn cloudSlab(y: f32, dy: f32, y0: f32, y1: f32) -> vec2<f32> {
  if (abs(dy) < 1e-3) {
    if (y > y0 && y < y1) { return vec2<f32>(0.0, 6000.0); }
    return vec2<f32>(1.0, 0.0);
  }
  let ta = (y0 - y) / dy;
  let tb = (y1 - y) / dy;
  return vec2<f32>(min(ta, tb), max(ta, tb));
}
// One step of the volume march. rgb is in-scatter, a is the transmittance of the step.
// An empty step is (0,0,0,1). Beer–Lambert self-shadow + HG energy: bright tops, dark bases,
// silver lining on thin sunward skin. Close to the eye, gain stays below the panorama so a
// thick first step does not tonemap white.
fn volStep(rd: vec3<f32>, t: f32, dt: f32, nLight: i32, ld: vec3<f32>, mu: f32, stormK: f32, sigK: f32, lightC: vec3<f32>, byMoon: bool, hEye: f32) -> vec4<f32> {
  let pm = (F.camPos + rd * t) * 0.001;
  let w = wxAt(pm.xz);
  var d = 0.0;
  if (cloudMay(w, pm.y)) {
    let fine = 1.0 - smoothstep(1.2, 8.0, t * 0.001);
    d = cloudDenW(pm, w, fine);
  }
  let dC = cirrusDen(pm);
  if (dC > d) { d = dC; }
  if (d <= 0.003) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  // Soft self-shadow: mild Beer taps so fluffy bodies stay luminous, not speckled.
  var tau = d * mix(2.4, 4.8, stormK);
  if (d >= 0.14) {
    var marched = 0.0;
    var sl = 0.055;
    var ll = 0.0;
    let taps = max(nLight, 2);
    for (var k = 0; k < 6; k++) {
      if (k >= taps) { break; }
      marched += cloudDen(pm + ld * (ll + sl * 0.5)) * sl;
      ll += sl;
      sl *= 1.85;
    }
    tau = mix(tau, marched * sigK * 0.07, smoothstep(0.14, 0.55, d));
  }
  let E = cloudEnergy(mu, tau, d, stormK);
  let hr = sat((pm.y - F.cldA.z) / 2.5);
  let hRel = sat((pm.y - F.cldA.z) / max(F.cldA.w - F.cldA.z, 0.05));
  let topLit = mix(0.85, 1.1, smoothstep(0.05, 0.65, hRel));
  let belly = mix(1.0, mix(0.92, 0.72, stormK), smoothstep(0.38, 0.04, hRel) * (1.0 - sat(mu) * 0.3));
  let ambC = F.amb.rgb * mix(1.15, 0.5, stormK);
  // Fair weather: lift toward white fluff; storms keep cooler grey.
  let fluff = mix(vec3<f32>(1.08, 1.06, 1.04), vec3<f32>(0.9, 0.93, 0.98), stormK);
  let Ls = (lightC * select(sunT(pm.y, F.sunTrue.y), vec3<f32>(1.0), byMoon) * E * mix(0.48, 0.24, stormK)
    + ambC * (0.1 + 0.28 * hr)) * (topLit * belly) * fluff;
  let al = 1.0 - exp(-d * sigK * max(dt, 0.4) * mix(0.00055, 0.0009, stormK));
  let keep = pathKeep(t * 0.001, hEye, pm.y);
  // The screen bolt pass skips this view once pad0 is set, so the flash is added here.
  return vec4<f32>(al * (Ls + boltAt(pm, d)) * keep, 1.0 - al);
}
// Adaptive empty-space skip (same density field as the bake). Centered samples —
// no spatial dither — so adjacent pixels share depths and edges stay soft.
fn volMarch(rd: vec3<f32>, tA: f32, tB: f32, nNear: i32, nFar: i32, nLight: i32, jit: f32, ld: vec3<f32>, mu: f32, stormK: f32, sigK: f32, lightC: vec3<f32>, byMoon: bool, hEye: f32, nearEye: bool) -> vec4<f32> {
  var C = vec3<f32>(0.0);
  var Tr = 1.0;
  let spanAll = max(tB - tA, 0.0);
  if (spanAll <= 1.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let nMax = min(nNear + nFar, 40);
  var t = tA;
  let tEnd = tB;
  // Prefer smaller steps near the eye; stretch farther out.
  let nearSpan = select(spanAll, min(spanAll, 2200.0), nearEye);
  for (var i = 0; i < 40; i++) {
    if (i >= nMax || t >= tEnd || Tr < 0.02) { break; }
    let along = (t - tA) / spanAll;
    var dt = mix(spanAll / f32(max(nMax, 1)), spanAll * 0.08, sat(along));
    if (nearEye && t < tA + nearSpan) {
      dt = nearSpan / f32(max(nNear, 1));
    }
    let pm = (F.camPos + rd * (t + dt * jit)) * 0.001;
    let w = wxAt(pm.xz);
    if (!cloudMay(w, pm.y) && cirrusDen(pm) <= 0.0) {
      t += dt * 1.65;
      continue;
    }
    let bit = volStep(rd, t + dt * jit, dt, nLight, ld, mu, stormK, sigK, lightC, byMoon, hEye);
    C += Tr * bit.rgb;
    Tr *= bit.a;
    // Dense regions take smaller strides so soft edges do not stair-step.
    let dens = select(0.0, 1.0 - bit.a, bit.a < 0.995);
    dt *= mix(1.35, 0.55, sat(dens * 4.0));
    t += max(dt, spanAll * 0.012);
  }
  return vec4<f32>(C, Tr);
}
@fragment fn fsCloudVol(in: SkyV) -> @location(0) vec4<f32> {
  if (F.cloudOwn < 0.5 || F.under > 0.45) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let rd = normalize(F.fwd + F.right * in.ndc.x * F.tanHalf * F.aspect + F.upv * in.ndc.y * F.tanHalf);
  let uv = vec2<f32>(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let px = vec2<i32>(clamp(uv * F.res, vec2<f32>(0.0), F.res - 1.0));
  let dep = textureLoad(sceneDepth, px, 0);
  var farM = 24000.0;
  if (dep < 0.99999) { farM = length(worldAt(vec2<f32>(px) + 0.5, dep) - F.camPos); }
  let cq = clamp(F.cloudOct, 1.0, 3.0);
  let nNear = i32(10.0 + 7.0 * cq);
  let nFar = i32(5.0 + 3.0 * cq);
  let nLight = i32(2.0 + cq);
  let stormK = sat(F.mood.y) * (0.45 + 0.55 * sat(F.wx.x));
  let sigK = C_SIG * mix(1.0, 1.35, stormK);
  let byMoon = F.sunTrue.y < -0.16;
  let ld = select(F.sunTrue.xyz, F.moon.xyz, byMoon);
  let stormDim = mix(1.0, 0.7, stormK) * mix(1.0, 0.9, sat(F.wx.x));
  let lightC = select(F.disc.rgb * stormDim * mix(vec3<f32>(1.0), vec3<f32>(0.78, 0.84, 0.98), stormK), vec3<f32>(0.62, 0.72, 0.9) * F.astroB.w * 1.7, byMoon);
  let mu = dot(rd, ld);
  // Centered samples — no spatial dither (IGN made the half-res volume look speckled).
  let jit = 0.5;
  let hEye = max(F.camPos.y, 0.0) * 0.001;
  var acc = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  let baseM = F.cldA.z * 1000.0;
  let topM = max(F.cldA.w, F.cldA.z + 0.05) * 1000.0;
  let slab = cloudSlab(F.camPos.y, rd.y, baseM, topM);
  let tA = max(slab.x, 0.0);
  let tB = min(slab.y, max(farM - 1.0, 0.0));
  if (slab.y > 0.0 && tB > tA + 3.0) {
    let eyeIn = F.camPos.y > baseM && F.camPos.y < topM;
    acc = volMarch(rd, tA, tB, nNear, nFar, nLight, jit, ld, mu, stormK, sigK, lightC, byMoon, hEye, eyeIn);
  }
  // Cirrus hands off from the panorama once the eye is within 700 m of the sheet.
  if (hEye >= C_HIGH - 0.7) {
    let hi = cloudSlab(F.camPos.y, rd.y, (C_HIGH - 0.2) * 1000.0, (C_HIGH + 0.5) * 1000.0);
    let hA = max(hi.x, 0.0);
    let hB = min(hi.y, max(farM - 1.0, 0.0));
    if (hi.y > 0.0 && hB > hA + 3.0) {
      let eyeHi = F.camPos.y > (C_HIGH - 0.2) * 1000.0 && F.camPos.y < (C_HIGH + 0.5) * 1000.0;
      let b = volMarch(rd, hA, hB, nFar, 0, nLight, jit, ld, mu, stormK, sigK, lightC, byMoon, hEye, eyeHi);
      acc = vec4<f32>(acc.rgb + acc.a * b.rgb, acc.a * b.a);
    }
  }
  return vec4<f32>(acc.rgb * max(F.lit.y, 0.0), acc.a);
}

// The air pass is half-res. Soft taps hide march grain in open air, but the same blur
// fringes tree leaflets and crown edges against sky/shafts — depth-aware so silhouettes stay sharp.
fn airOver(col: vec3<f32>, frag: vec2<f32>) -> vec3<f32> {
  let uv = frag / F.res;
  let px = vec2<i32>(frag);
  let lim = vec2<i32>(F.res) - 1;
  let d0 = textureLoad(sceneDepth, px, 0);
  let dR = textureLoad(sceneDepth, min(px + vec2<i32>(1, 0), lim), 0);
  let dU = textureLoad(sceneDepth, min(px + vec2<i32>(0, 1), lim), 0);
  let jump = max(abs(d0 - dR), abs(d0 - dU));
  // Soft only where depth is continuous. Leaf/sky (and leaf/ground) edges take a hard tap.
  let soft = 1.0 - smoothstep(6e-5, 7e-4, jump);
  let center = textureSampleLevel(airTex, reflSamp, uv, 0.0);
  if (soft < 0.12) {
    return col * center.a + center.rgb;
  }
  let e = (0.35 + 0.95 * soft) / F.res;
  let a = (textureSampleLevel(airTex, reflSamp, uv + vec2<f32>(e.x, e.y * 0.4), 0.0)
    + textureSampleLevel(airTex, reflSamp, uv + vec2<f32>(-e.x * 0.4, e.y), 0.0)
    + textureSampleLevel(airTex, reflSamp, uv - vec2<f32>(e.x, e.y * 0.4), 0.0)
    + textureSampleLevel(airTex, reflSamp, uv - vec2<f32>(-e.x * 0.4, e.y), 0.0)) * 0.25;
  let air = mix(center, a, soft);
  return col * air.a + air.rgb;
}
// The finished scene, with the air over it, to the screen. Clouds are already in the air target.
@fragment fn fsBlit(in: SkyV) -> @location(0) vec4<f32> {
  let px = vec2<i32>(in.clip.xy);
  // Under water the eye opens a little — keep the lift mild so the Snell disc does not blow.
  var col = tonemap(airOver(textureLoad(sceneTex, px, 0).rgb, in.clip.xy) * (1.0 + 0.14 * F.under));
  let ukB = underK();
  if (ukB > 0.01) {
    col *= mix(1.0, mix(1.0, 0.72, sat(length(in.clip.xy / F.res - 0.5) * 1.35)), ukB);
  }
  return vec4<f32>(col, 1.0);
}

// What is drawn over the finished scene, the water, the insects and the drops, is hidden by
// the land by asking the scene's own depth, here. No second depth buffer carries a copy of
// it for the hardware to test against: that copy is the one thing between the passes that a
// GPU may keep differently from the texture it was written from. A fragment whose own depth
// is not a number is hidden too.
fn hidden(clip: vec4<f32>) -> bool {
  return !(clip.z < textureLoad(sceneDepth, vec2<i32>(clip.xy), 0));
}

@fragment fn fsWater(in: WaterV) -> @location(0) vec4<f32> {
  // The sea stops where the scene is in front of it, at any distance. The sheet is drawn over
  // the sand it runs across, which the coarser beach mesh may put a little in front of it,
  // so it is hidden only by what stands clear of it: a trunk, a rock, a rise in the beach.
  // With several samples to the pixel the scene may stand in front of the water in some and
  // not in others, along the edge of a frond or a trunk. The water covers the pixel by the
  // share it shows in, and what lies under it is the furthest of them.
  var dep = 0.0;
  var clear = 0.0;
  for (var i = 0; i < ${samples}; i++) {
    let di = textureLoad(sceneDepth, vec2<i32>(in.clip.xy), i);
    dep = max(dep, di);
    if (in.clip.z < di) { clear += ${(1 / samples).toFixed(4)}; }
  }
  if (clear <= 0.0 && (in.sheet < 0.5 || abs(worldAt(in.clip.xy, dep).y - in.world.y) > 0.2)) {
    discard;
    return vec4<f32>(0.0);
  }
  let sh0 = shoreFetch(in.xz0);
  let shoreD = in.xz0 - SH.origin;
  let shoreOff = dot(shoreD, SH.sea) / SH.dx / max(SH.nz, 1.0);
  let isBreaker = in.sheet > 1.5;
  // Continuous ownership: soft bed/wet weights (no knife-edge on noisy sim bed).
  // Wide seaward fade so ocean↔sheet is one surface, not a cyan strip seam.
  let deepFade = smoothstep(-3.1, -2.2, sh0.bed);
  let wetSand = smoothstep(0.003, 0.018, sh0.h) + smoothstep(0.03, 0.1, sh0.foam) * 0.55;
  let sandW = smoothstep(-0.18, 0.05, sh0.bed) * sat(wetSand);
  let surfW = (1.0 - smoothstep(-0.18, 0.05, sh0.bed)) * deepFade;
  let sheetOwn = sh0.inside * max(sandW, surfW);
  let sheetSoft = sheetOwn * (1.0 - smoothstep(0.68, 1.02, shoreOff));
  if (!isBreaker) {
    // Soft overlap — sheet fades out seaward; ocean yields only where sheet is strong.
    if (in.sheet > 0.5 && sheetSoft < 0.012) { discard; }
    if (in.sheet < 0.5 && sheetSoft > 0.88) { discard; }
  } else {
    if (in.live < 0.14) { discard; }
  }
  let field = sampleField(in.xz0);
  let scale = field.y;
  let bed = field.x;
  let depthW = max(-bed, 0.2);
  let S = seaAt(in.xz0, scale, depthW);
  let distS = length(in.world - F.camPos);
  let rip = ripAt(in.xz0);
  let ocn = shapeField(in.xz0);
  let gl = oceanSample(glintTex, in.xz0, 4.0);
  let pix = max(distS * F.tanHalf * 2.0 / max(F.res.y, 1.0), 0.004);
  let open = mix(0.4, 1.0, scale);
  let elev = max(abs(F.camPos.y - in.world.y), 0.08);
  let foot = pix / pow(elev / max(distS, 0.1), 0.6);
  let footLong = pix / max(elev / max(distS, 0.1), 0.01);
  let ww = waveWeights(distS, foot, footLong, scale);
  let band = seaBands(distS, foot);
  // Same weights as vsWater (horizontal distance, shared phase). A level that has
  // left the mesh has left the normal, including the reflection built from it.
  let distH = length(in.xz0 - F.camPos.xz);
  let lod = seaLod(distH, depthW);
  // Capillary / chop only where their weight is visible — same normals, less far-field work.
  var cap = vec2<f32>(0.0);
  if (ww.w > 0.015) { cap = capillary(in.xz0, distS); }
  var chop = vec2<f32>(0.0);
  if (ww.z > 0.015) { chop = chopField(in.xz0, foot) * ww.z; }
  // Analytical Gerstner + FFT slopes, weighted the same way as the vertex height.
  var N = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), S.nrm, ww.x * lod.x)
    + vec3<f32>(-ocn.y * ww.y * lod.y + rip.y * ww.y * lod.y - chop.x + cap.x * ww.w, 0.0,
                -ocn.z * ww.y * lod.y + rip.z * ww.y * lod.y - chop.y + cap.y * ww.w));
  // Breaker ribbon: tip normal from shared event so lighting matches the overhanging lip.
  if (isBreaker) {
    let evN = breakerEvt(in.xz0);
    let tipN = normalize(mix(evN.nrm, vec3<f32>(-evN.dirN.x, 0.15 - 0.55 * evN.curl, -evN.dirN.y), sat(evN.curl * 1.2)));
    N = normalize(mix(N, tipN, sat(in.live * 1.1)));
  }
  // Finite-difference refine on FFT height — continuous across triangle edges.
  // Shape amplitude matches the vertex; one lod for the stencil, so the ramp
  // itself is not a slope.
  let grazeN = sat(elev / max(distS * 0.32, 1.0));
  let fdK = (0.28 + 0.52 * sat(foot * 1.15)) * sat(ww.y + ww.z) * mix(0.55, 1.0, grazeN) * (1.0 - band.z * 0.35);
  if (fdK > 0.02) {
    // Widen the FD stencil with distance so mid/far normals track broad waves, not sparkle.
    let eN = max(mix(0.16, 0.85, sat(foot * 0.65)), pix * mix(2.2, 5.5, band.z));
    let wN = vec4<f32>(ww.x, ww.y * lod.y, ww.z, ww.w);
    let h0 = seaEta(in.xz0, wN);
    let hx = seaEta(in.xz0 + vec2<f32>(eN, 0.0), wN);
    let hz = seaEta(in.xz0 + vec2<f32>(0.0, eN), wN);
    let Nfd = normalize(vec3<f32>((h0 - hx) / eN, 1.0, (h0 - hz) / eN));
    // Prefer FD normals when the mesh footprint is large; ease off when looking flat-on.
    N = normalize(mix(N, Nfd, fdK));
  }
  // Distance-aware normal filter: drop fine slope energy toward the horizon / from cliffs.
  // Keep more micro-slope energy in shallow nearshore so the beach does not go plastic-smooth.
  let nearShoreKeep = 1.0 - 0.55 * smoothstep(2.8, 0.4, depthW) * band.x;
  N = normalize(vec3<f32>(
    N.x * (1.0 - band.z * 0.48 * nearShoreKeep),
    mix(N.y, 1.0, band.z * 0.24 * nearShoreKeep),
    N.z * (1.0 - band.z * 0.48 * nearShoreKeep)
  ));
  if (F.wx.x > 0.01 && pix < 0.05 && band.x > 0.2) {
    let rr = rainRings(in.xz0) * (1.0 - smoothstep(0.02, 0.05, pix));
    N = normalize(N + vec3<f32>(rr.x, 0.0, rr.y) * ww.w);
  }
  // Reuse the shore sample from the sheet test (identical xz0).
  let sh = sh0;
  var bore = 0.0;
  // Bore stencil on sheet; jeantimex/fluid screen-space idea: SWE η normals when sheet owns.
  // shoreHAt = 4 loads/tap vs shoreFetch's 8 — same visual slope, half the bandwidth.
  if (in.sheet > 0.5 && sh.inside > 0.5 && sh.bed > -1.5 && shoreOff < 0.9) {
    let e = max(mix(0.28, 0.72, sat(foot * 0.9)), pix * 2.4);
    let spx = shoreHAt(in.xz0 + vec2<f32>(e, 0.0));
    let smx = shoreHAt(in.xz0 - vec2<f32>(e, 0.0));
    let spz = shoreHAt(in.xz0 + vec2<f32>(0.0, e));
    let smz = shoreHAt(in.xz0 - vec2<f32>(0.0, e));
    if (spx.y > 0.5 && smx.y > 0.5 && spz.y > 0.5 && smz.y > 0.5) {
      let dmn = in.xz0 - SH.origin;
      let fi = dot(dmn, SH.along) / SH.dx;
      let fj = dot(dmn, SH.sea) / SH.dx;
      let brim = smoothstep(2.0, 20.0, fi) * smoothstep(SH.nx - 2.0, SH.nx - 20.0, fi) * smoothstep(2.0, 14.0, fj);
      let onBeach = smoothstep(-0.15, 0.1, sh.bed);
      let etax = spx.x - smx.x;
      let etaz = spz.x - smz.x;
      let slopeLen = length(vec2<f32>(etax, etaz)) / (e * 2.0);
      let takeSlope = smoothstep(0.012, 0.1, slopeLen) * (1.0 - smoothstep(0.48, 0.92, shoreOff)) * brim;
      let fluidOwnN = sat(max(smoothstep(-0.22, 0.04, sh.bed), smoothstep(0.005, 0.07, sh.h)))
        * (1.0 - smoothstep(0.55, 0.92, shoreOff)) * brim;
      let take = max(takeSlope, fluidOwnN * 0.78);
      let dhx = mix(etax, spx.x - smx.x, onBeach);
      let dhz = mix(etaz, spz.x - smz.x, onBeach);
      let sn = normalize(vec3<f32>(-dhx / (e * 2.0) + N.x, 1.0, -dhz / (e * 2.0) + N.z));
      N = normalize(mix(N, sn, take));
      bore = smoothstep(0.16, 0.42, slopeLen) * smoothstep(-1.6, -0.5, sh.bed) * (1.0 - smoothstep(0.48, 0.92, shoreOff)) * brim;
    }
  }
  let V = normalize(F.camPos - in.world);
  let ndv = max(dot(N, V), 0.02);
  let reflK = sat(F.mat.y);
  // Roughness rises with distance / footprint so distant specular stays soft, not sparkly.
  let rough = clamp(0.012 + sat(F.mat.x) * 0.06 + 0.01 * scale + band.w * 0.055, 0.01, 0.14);
  let fres = waterFresnel(ndv, rough);
  let dir0 = vec2<f32>(cos(F.ctrl.w), sin(F.ctrl.w));
  let alongW = dot(in.xz0, dir0);
  let acrossW = dot(in.xz0, vec2<f32>(-dir0.y, dir0.x));
  let lace = n2(vec2<f32>(alongW * 0.42 - F.time * 0.55, acrossW * 0.16));
  let shoal = smoothstep(4.0, 0.35, max(-bed, 0.0));
  // Lip / collapse mask from seaAt hinge overturn — crest section, not a bar.
  let lipF = sat(S.brk);
  // Folded Jacobian marks the overhanging lip; wakes scroll down-wave from that pack.
  let fold = sat((0.55 - S.jac) * 1.4) * shoal;
  let packM = max(crestPack(acrossW, 0.0), crestPack(acrossW, 1.0) * 0.85);
  let sectionF = smoothstep(0.46, 0.78, packM);
  let wakeN = n2(vec2<f32>(alongW * 0.085 - F.time * 0.16, acrossW * 0.028 + 2.0));
  // Wake trails the collapse — gated by section so it is not a beach-wide paint strip.
  let wake = sectionF * shoal * smoothstep(0.45, 0.82, wakeN) * (0.12 + 0.7 * lipF + 0.55 * fold);
  let crest = smoothstep(0.48, 0.16, S.jac) * smoothstep(0.2, 0.75, scale);
  // Open-ocean whitecaps stay sparse — do not bleach the whole sea to fake surf.
  let whitecap = sat(crest - 0.62) * (1.0 - shoal * 0.85) * smoothstep(0.4, 0.75, lace);
  // Whitewater only from shared break/run-up state — not a waterline disguise.
  let stormFoam = 1.0 + 0.45 * sat(F.mood.y) + 0.25 * sat(F.wx.x);
  let holeGate = 0.4 + 0.6 * smoothstep(0.18, 0.62, n2(in.xz0 * 1.9 + vec2<f32>(F.time * 0.11, 2.0)));
  let evF = breakerEvt(in.xz0);
  let faceHole = smoothstep(0.25, 0.7, n2(in.xz0 * 3.2 + evF.dirN * F.time * 0.2));
  // Collapse foam requires live break event; lipF alone no longer paints a beach bar.
  let collapseFoam = sat(evF.collapse * 1.25 + evF.curl * 0.35 + lipF * 0.35 * sat(evF.live))
    * (0.4 + 0.6 * sectionF) * (0.45 + 0.55 * faceHole);
  let wakeBrk = wake * sat(evF.live * 0.85 + evF.collapse * 0.55 + lipF * 0.25);
  var foamDens = sat(max(max(collapseFoam, wakeBrk), whitecap * 0.3)) * max(F.mood.w, 0.0) * stormFoam
    * (1.0 - smoothstep(0.45, 2.4, foot) * 0.8) * (1.0 - band.z * 0.55) * holeGate;
  if (isBreaker) {
    // Curl keeps a dark face; whitewater spikes on collapse dump (shared event).
    let dumpFoam = sat(evF.collapse * 1.35 + evF.curl * 0.2);
    foamDens = sat(foamDens * mix(0.25, 1.0, dumpFoam)
      + collapseFoam * in.live * dumpFoam * 1.35);
  } else if (in.sheet > 0.5 && shoal > 0.2) {
    // Sheet whitewater from collapse + SWE foam transport — not edge paint.
    foamDens = sat(foamDens * mix(0.4, 1.0, sat(evF.collapse + sh0.foam))
      + collapseFoam * max(evF.live * sat(evF.collapse), sat(sh0.foam) * 0.55) * 0.9);
  }
  var foam = foamCover(in.xz0, foamDens, foot);
  var onSheet = 0.0;
  var sheetFilm = 0.0;
  if (sh.inside > 0.5 && shoreOff < 0.82 && in.sheet > 0.5) {
    let spd = length(sh.vel);
    let dir = sh.vel / max(spd, 0.12);
    // Foam-only taps (4 loads each) — tongues still fork without full shoreFetch.
    let alongF = shoreFoamAt(in.xz0 - dir * (0.7 + 0.45 * sat(spd)));
    let acrossF = shoreFoamAt(in.xz0 + vec2<f32>(-dir.y, dir.x) * 0.48);
    let tongue = sat(sh.foam * 1.7 - acrossF * 1.05);
    let trail = sat(min(sh.foam, alongF * 1.35));
    let retreat = sat(dot(dir, SH.sea)) * sat(alongF * 0.55 - sh.foam * 0.15);
    let cusp = n2(in.xz0 * 1.7 + dir * F.time * 0.22) * 0.55 + n2(in.xz0 * 4.6 + vec2<f32>(F.time * 0.3, 2.0)) * 0.45;
    let grain = n2(in.xz0 * 6.2 + dir * F.time * 0.4 + vec2<f32>(2.0, 0.0));
    let hole = smoothstep(0.15, 0.55, n2(in.xz0 * 2.4 + dir * 0.15));
    let adv = sat(max(tongue, trail * 0.75) * mix(0.55, 1.12, cusp) * mix(0.7, 1.08, grain) * (0.55 + 0.55 * hole)
      + retreat * 0.65 * grain * (0.4 + 0.6 * hole));
    let band = 1.0 - smoothstep(0.48, 0.82, shoreOff);
    let densS = sat(adv * 1.15 + sh.foam * tongue * (0.35 + 0.4 * cusp) * hole) * band;
    let patches = foamCover(in.xz0 + dir * (F.time * 0.1), densS * 0.9, foot);
    let laceS = sat(patches);
    foam = sat(mix(foam * (1.0 - band * 0.85), laceS, band * smoothstep(0.02, 0.09, densS)));
    onSheet = band * laceS;
    sheetFilm = band * smoothstep(0.004, 0.05, sh.h) * (1.0 - laceS * 0.7)
      * (0.55 + 0.45 * n2(in.xz0 * 3.1 + vec2<f32>(0.0, F.time * 0.08)));
  }

  if (bore > 0.01) {
    let churn = n2(in.xz0 * 2.1 + sh.vel * F.time * 0.45) * 0.5
      + n2(in.xz0 * 6.5 - vec2<f32>(F.time * 0.75, 0.0)) * 0.32
      + n2(in.xz0 * 14.0 + sh.vel.yx * F.time * 0.2) * 0.18;
    // Bore aeration stays patchy — churn tears holes so it is not a solid white wall.
    foam = max(foam, sat(bore * (0.35 + 1.0 * churn) * smoothstep(0.2, 0.65, churn)));
  }
  // Whitewash piles against raised bed (rocks stamped into the shore sim).
  if (sh.inside > 0.5 && sh.bed > -0.35) {
    let rockWash = smoothstep(-0.55, 0.15, sh.bed) * smoothstep(0.02, 0.14, sh.h + sh.foam * 0.5)
      * (0.35 + 0.65 * n2(in.xz0 * 3.4 + sh.vel * 0.2));
    foam = max(foam, rockWash * (0.45 + 0.7 * sh.foam));
  }
  // Dry inland sheet: soft cut — keep a thin wet/foam tongue during retreat (not a knife edge).
  if (!isBreaker && in.sheet > 0.5 && sh.bed > -0.04 && sh.h < 0.004 && sh.foam < 0.03 && sh.wet < 0.15) { discard; }

  if (F.under > 0.5) {
    let lit0 = cloudShade(in.xz0, 0.0);
    let I = normalize(in.world - F.camPos);
    // Snell window: soft rim, restrained glitter — looking up must not go cyan or blow white.
    let ci = sat(dot(I, -N));
    let kWin = 1.0 - 1.769 * (1.0 - ci * ci);
    let win = smoothstep(-0.04, 0.34, kWin);
    let rr = refract(I, -N, 1.333);
    let sd = max(dot(normalize(rr + vec3<f32>(1e-5)), F.sunDir), 0.0);
    // Softer Fresnel at the critical rim (less hard teal ring outside the disc).
    let fr = pow5(1.0 - sqrt(max(kWin, 0.0))) * 0.7;
    // Neutral sky through the window — drop the blue push that read as harsh teal.
    let sky = skyColor(normalize(rr)) * vec3<f32>(0.94, 0.97, 0.98)
      * (0.76 + 0.26 * lit0)
      + F.sunCol * (pow(sd, 72.0) * 0.48 + pow(sd, 340.0) * 2.4) * (1.0 - fr) * lit0;
    let down = reflect(I, -N);
    let deep = max(-bed, 0.2);
    let reachB = deep / max(-down.y, 0.05);
    // Milder Beer on the TIR seabed bounce so the frame around the disc stays muted.
    let sandC = vec3<f32>(0.44, 0.52, 0.47) * F.day.rgb * mix(0.5, 1.0, lit0) * exp(W_KD * (-deep) * 0.7);
    let refl = waterFogIn(in.world, down, min(reachB, 60.0)) * 0.78;
    var colU = mix(mix(refl, sandC, exp(-reachB * 0.09) * 0.55), sky, win);
    // Soft bleed of absorbed sky into the TIR side — no hard cyan edge.
    colU = mix(colU, sky * vec3<f32>(0.58, 0.72, 0.78), (1.0 - win) * fr * 0.2);
    colU = applyFog(colU, in.world);
    colU = mix(colU, vec3<f32>(0.75, 0.78, 0.76) * F.day.rgb, foam * 0.28);
    // Mild pre-tonemap gain; fsBlit already lifts underwater slightly.
    return vec4<f32>(tonemap(airOver(colU, in.clip.xy) * 1.05), 1.0);
  }

  let frag = in.clip;
  let px = vec2<i32>(frag.xy);

  // Reflection uses a filtered macro normal — glint capillaries stay in the specular lobe only.
  let lost = sat(smoothstep(0.22, 1.6, foot) * mix(0.45, 1.0, scale) + band.z * 0.55);
  let toCam = normalize(F.camPos.xz - in.xz0 + vec2<f32>(1e-4, 0.0));
  var reflN = normalize(mix(vec3<f32>(0.0, 1.0, 0.0), N, 1.0 - 0.62 * lost)
    + vec3<f32>(toCam.x, 0.0, toCam.y) * 0.05 * lost);
  // Near, a little wind-sea slope; never the capillary glint map (that creates triangular sparkle).
  // Shape slope uses the mesh LOD so a reflection does not keep a crest the surface dropped.
  let nearRefl = band.x * ww.y * lod.y;
  reflN = normalize(reflN + vec3<f32>(-ocn.y, 0.0, -ocn.z) * 0.35 * nearRefl);
  var reflCol = skyReflect(reflect(-V, reflN));
  let Rd = reflect(-V, reflN);
  // Horizon: lean distant reflections into aerial haze so the sea does not detach as a hard plate.
  reflCol = mix(reflCol, hazeColor(Rd), band.z * 0.28);
  if (F.reflOn > 0.5) {
    var uv = frag.xy / F.res;
    let tv = normalize(in.xz0 - F.camPos.xz + vec2<f32>(1e-4, 0.0));
    let rn = reflN.xz;
    let nt = dot(rn, tv);
    let ns = dot(rn, vec2<f32>(-tv.y, tv.x));
    let graze = sat(abs(V.y) * 1.4 + 0.05);
    // At grazing / distance, shrink UV warps so planar reflections do not streak into facets.
    let warpK = reflK * mix(0.35, 1.0, graze) * (1.0 - band.z * 0.45);
    uv.y -= clamp(nt / max(F.tanHalf, 0.2), -0.16, 0.16) * warpK;
    uv.x += clamp(ns * graze / max(F.tanHalf * F.aspect, 0.2), -0.06, 0.06) * warpK;
    uv = clamp(uv, vec2<f32>(0.004), vec2<f32>(0.996));
    let conf = sat(graze * 1.8) * (1.0 - smoothstep(0.92, 0.998, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0))
      * (1.0 - band.z * 0.4);
    let blur = 0.008 + rough * 0.08 + lost * 0.025 + band.z * 0.012;
    let c0 = textureSampleLevel(reflTex, reflSamp, uv, 0.0);
    let c1 = textureSampleLevel(reflTex, reflSamp, uv + vec2<f32>(blur * 0.15, blur), 0.0);
    let c2 = textureSampleLevel(reflTex, reflSamp, uv - vec2<f32>(blur * 0.1, blur * 1.7), 0.0);
    // Alpha is how much of the three taps was land or leaf: the rest is sky, already in reflCol.
    let rs = (c0 + c1 + c2) * 0.3333;
    reflCol = mix(reflCol, rs.rgb / max(rs.a, 1e-3), sat(rs.a) * conf * (1.0 - foam * 0.65) * reflK);
  }

  // One shadow sample for the whole fragment (never behind a divergent if).
  let lit = sunShadow(in.world);
  // The sun's own glitter needs the sun: a cloud over this water puts it out.
  let sunLit = lit * cloudShade(in.xz0, 0.0);
  // A shadow on water falls on what is in it. The light the water's body scatters back up
  // goes down to what the sky alone gives; the sky it mirrors is the same sky as before.
  let bodyK = mix(0.42, 1.0, sunLit);
  let deepLit = F.deepC.rgb * bodyK;
  let shalLit = F.shalC.rgb * bodyK;
  var base = deepLit;
  // Any depth short of the far plane is the sea floor or something standing in the water.
  // (A nearer cut-off left all water more than a couple of hundred metres off bottomless:
  // from the air the lagoon and the shallows went the blue of the open sea.)
  if (dep < 0.99999) {
    var look = in.clip.xy;
    var sp = worldAt(look, dep);
    var d = in.world.y - sp.y;
    let sheet = sh.inside > 0.5 && sh.bed > -0.4 && sh.h < 0.85 && sh.h > 0.004;
    if (sheet) {
      let bend = N.xz * sh.h * 4.2 * F.mat.z;
      let shifted = clamp(look + bend, vec2<f32>(1.0), F.res - vec2<f32>(1.0));
      // Thin swash: sand reads through a short optical path — turquoise film, not milky glass.
      let depth = max(sh.h, 0.003) / max(ndv, 0.55);
      let sigma = (W_KD * 8.4 + vec3<f32>(0.1, 0.018, 0.012)) * max(F.deepC.w, 0.08);
      let trans = exp(-depth * sigma * mix(1.35, 0.85, sat(sh.h / 0.2)));
      let sceneCol = textureLoad(sceneTex, vec2<i32>(shifted), 0).rgb;
      // Warm shallow scatter near the lip; cooler as the sheet thickens.
      let scatter = mix(
        mix(shalLit * 1.15, vec3<f32>(0.12, 0.42, 0.48), 0.35),
        deepLit,
        sat(sh.h / 0.38)
      );
      base = sceneCol * trans + scatter * (1.0 - trans);
      // Leading edge of the wash: a soft bright rim before the foam lace takes over.
      let lip = smoothstep(0.002, 0.028, sh.h) * (1.0 - smoothstep(0.04, 0.14, sh.h));
      base = mix(base, base * vec3<f32>(1.08, 1.12, 1.06) + shalLit * 0.12, lip * 0.55);
    } else if (d > -0.05) {
      // Clamp refraction warp near the eye / grazing — stops waterline streaks from wrong-side samples.
      let bendScale = 7.0 * F.mat.z * (1.0 - sat(1.0 - length(in.world - F.camPos) / 6.0) * 0.65)
        * mix(1.0, 0.35, sat(1.0 - abs(V.y)));
      let bend = N.xz * clamp(d, 0.0, 3.0) * bendScale;
      let shifted = clamp(look + bend, vec2<f32>(1.0), F.res - vec2<f32>(1.0));
      let rd = textureLoad(sceneDepth, vec2<i32>(shifted), 0);
      if (rd < 0.99999) {
        let rw = worldAt(shifted, rd);
        // Only accept refracted samples that stay below the water surface.
        if (rw.y < in.world.y - 0.03 && rw.y < F.camPos.y + 2.0) { look = shifted; sp = rw; d = in.world.y - rw.y; }
      }
      let depth = max(d, 0.02);
      // Stronger red kill in the first metres → turquoise film over sand, not grey-green.
      let sigma = (W_KD * 8.8 + vec3<f32>(0.12, 0.016, 0.009)) * max(F.deepC.w, 0.08);
      let trans = exp(-depth * sigma);
      let sceneCol = textureLoad(sceneTex, vec2<i32>(look), 0).rgb;
      // Shallow scatter biased warm-turquoise; deep stays the open-sea body colour.
      let scatter = mix(shalLit * vec3<f32>(0.95, 1.08, 1.02), deepLit, sat(depth / 6.2));
      base = sceneCol * trans + scatter * (1.0 - trans);
    }
  }
  base = mix(deepLit, base, sat(F.mat.w));
  // Breaking face: dark translucent wall under the lip (pitch/curl), then aerated collapse.
  // Keep the face readable — do not turn the whole crest into white before it dumps.
  let faceBrk = sat(S.brk * 1.05 + fold * 0.55) * smoothstep(2.8, 0.35, max(-bed, 0.0)) * (1.0 - foam * 0.55);
  if (faceBrk > 0.02) {
    let path = 0.4 + 1.05 * sat(S.disp.y) + 0.35 * fold;
    let beer = exp(-W_KD * path * 6.8);
    // Steep face: cooler/darker transmission; foam only where collapse has already aerated.
    let faceCol = (shalLit * vec3<f32>(0.32, 0.78, 0.72) + F.sunCol * sat(1.0 - N.y) * sunLit * 0.28) * beer;
    let faceAmt = faceBrk * mix(0.42, 0.28, sat(foam)) * (0.55 + 0.45 * sat(1.0 - N.y));
    base = mix(base, faceCol + shalLit * 0.06, faceAmt);
  }
  // Crest subsurface when the sun sits behind the wave. A wrap, not a scatter integral.
  // Green-gold transmission (chlorophyll / shallow scatter), falls off with foam.
  let crestT = pow(sat(1.0 - N.y), 1.28) * sat(S.disp.y * 1.1 + 0.04);
  let vxz = V.xz;
  let vxl = length(vxz);
  let backL = select(0.0, sat(dot(vxz / max(vxl, 1e-3), -F.sunDir.xz)), vxl > 0.08);
  let sss = crestT * pow(backL, 1.45) * sunLit * (1.0 - foam * 0.82);
  base += F.sunCol * vec3<f32>(0.14, 0.58, 0.40) * sss * 0.48;
  let fu = (in.xz0 - vec2<f32>(ORIGIN)) / (SPAN * 2.0) - 0.5;
  base = mix(base, deepLit, smoothstep(0.56, 0.78, max(abs(fu.x), abs(fu.y)) * 2.0));
  // The last few centimetres of water are a film over sand, not a mirror with an edge.
  var film = 1.0;
  if (dep < 0.99999 && in.sheet < 0.5) {
    film = smoothstep(0.0, 0.09, in.world.y - worldAt(in.clip.xy, dep).y);
  }
  // Fresh lip is bright; the scrolled wake is the duller lace behind it.
  let foamAge = sat(lipF * 0.82 + wakeN * 0.28 + onSheet * 0.35);
  let foamN = sat(dot(N, F.sunDir) * 0.5 + 0.5);
  let foamCol = mix(
    vec3<f32>(0.62, 0.7, 0.68),
    mix(vec3<f32>(0.88, 0.9, 0.89), vec3<f32>(0.95, 0.96, 0.94), foamAge),
    sat(foam)
  ) * F.day.rgb * mix(0.55, 1.0, sunLit) * mix(0.64, 1.0, foamN);
  // Keep sheet foam lacey — heavy bleach read as a flat white shelf on the sand.
  base = mix(base, foamCol, foam * mix(0.28, 0.48, onSheet));
  // Clear run-up film tints sand without hiding it.
  if (sheetFilm > 0.02) {
    base = mix(base, mix(base, shalLit * 1.05, 0.35), sheetFilm * 0.4);
  }

  // On the sheet the wash is whitewater, not a mirror. The open sea keeps its Fresnel.
  let sheetK = smoothstep(0.5, 1.0, in.sheet);
  // Soft Fresnel on thin film — wet sand gleams at grazing angles without a hard plate.
  let filmFres = mix(0.35, 0.85, pow(sat(1.0 - ndv), 3.2)) * (0.4 + 0.6 * sheetFilm);
  var fresK = fres * reflK * (1.0 - foam * mix(0.45, 0.88, onSheet)) * film;
  fresK = mix(fresK, max(fresK * 0.45, filmFres * reflK * 0.55), sheetK);
  var col = mix(base, reflCol, fresK);
  // Capillary glitter stays in the specular lobe only; distance raises lobe width to kill fireflies.
  let foamK = 1.0 - foam * 0.85;
  let glK = open * ww.w * (1.0 - band.z * 0.85);
  // Broader, quieter glints — sharp fireflies read as game water.
  let glRough = mix(0.018, 0.07, band.w);
  var spec = ggxGlint(normalize(N + vec3<f32>(-gl.y, 0.0, -gl.z) * glK), V, glRough, fres * reflK * 0.85);
  // Super-sample glints only near — max() of sharp lobes shimmer as white noise at distance.
  if (pix > 0.04 && glK > 0.02 && band.z < 0.35) {
    let cell = floor(in.xz0 / pix);
    for (var k = 0u; k < 3u; k++) {
      let j = vec2<f32>(
        hash21(cell + vec2<f32>(f32(k) * 3.1, 1.7)),
        hash21(cell + vec2<f32>(8.2, f32(k) * 2.7))
      );
      let g2 = oceanSample(glintTex, in.xz0 + (j - 0.5) * pix * 2.0, 4.0);
      let Nk = normalize(N + vec3<f32>(-g2.y, 0.0, -g2.z) * glK);
      spec = max(spec, ggxGlint(Nk, V, glRough, fres * reflK * 0.85));
    }
  }
  let sheen = pow(sat(dot(N, normalize(F.sunDir + V))), mix(48.0, 18.0, foam))
    * (sheetFilm * 0.55 + onSheet * 0.35 + foam * 0.15) * sat(sheetK * 2.0);
  col += F.sunCol * vec3<f32>(0.85, 0.92, 0.95) * sheen * 0.22 * sunLit;
  col += spec * foamK * sunLit * mix(0.72, 0.4, band.z) * (1.0 - fresK * 0.25);
  let crestLight = pow(sat(1.0 - N.y), 1.6) * sat(S.disp.y * 0.8) * max(dot(F.sunDir, vec3<f32>(0.0, 1.0, 0.0)), 0.0);
  col += F.sunCol * vec3<f32>(0.4, 0.55, 0.5) * crestLight * 0.07 * sunLit;
  col += boltOnSurf(in.world, N, 0.22);

  col = airMix(col, -V, distS);
  var alpha = clear;
  if (isBreaker) {
    // Smooth blend into ocean/shore — live gates the ribbon; alongshore edges feather.
    let dmnB = in.xz0 - SH.origin;
    let fiB = dot(dmnB, SH.along) / SH.dx / max(SH.nx, 1.0);
    let edgeU = smoothstep(0.0, 0.05, fiB) * smoothstep(1.0, 0.95, fiB);
    let feather = sat(in.live * 1.55) * smoothstep(0.04, 0.22, in.live) * edgeU;
    alpha = clear * feather * (0.65 + 0.35 * sat(foam + lipF));
  } else if (in.sheet > 0.5) {
    let dmn = in.xz0 - SH.origin;
    let fi = dot(dmn, SH.along) / SH.dx;
    let border = smoothstep(1.0, 28.0, fi) * smoothstep(SH.nx - 1.0, SH.nx - 28.0, fi);
    // Soft waterline — multi-scale ragged edge kills stair-step facet silhouette.
    let ragged = n2(in.xz0 * 1.6) * 0.07 + n2(in.xz0 * 4.2 + vec2<f32>(F.time * 0.04, 1.0)) * 0.04
      + n2(in.xz0 * 11.0 + vec2<f32>(0.0, F.time * 0.06)) * 0.02;
    let fade = smoothstep(-0.14 - ragged, 0.16 + ragged, sh.bed);
    // Thin run-up / retreat film must stay readable — not discarded into dry sand.
    let body = max(smoothstep(0.0025, 0.055, sh.h), smoothstep(0.06, 0.35, sh.foam) * 0.6 + smoothstep(0.25, 0.7, sh.wet) * 0.25);
    let filmA = sheetFilm * 0.48;
    // Ownership soft weight — keep sheet translucent; foam must not force an opaque white shelf.
    let own = mix(0.32, 0.94, sat(sheetSoft));
    alpha = border * fade * own * sat(mix(body * 0.28 + filmA, 0.45, smoothstep(0.28, 0.82, foam)));
  } else {
    // Ocean disk yields where the sheet owns the surf — soft handoff, not a hard strip.
    alpha = clear * (1.0 - sat(sheetSoft) * 0.96);
  }
  if (alpha < 0.008) { discard; }
  return vec4<f32>(tonemap(airOver(col, in.clip.xy)), alpha);
}

`;
}
