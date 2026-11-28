// Shallow water on its own grid, finer than the island mesh.
// The seaward edge is driven by the swell. The beach is where that water runs up.

const SHORE_NX = 320;
const SHORE_NZ = 176;
const SHORE_DX = 0.32;
// Full-shore SPH/PBF carriers (jeantimex density/pressure/XSPH + moebis compression-only λ / vorticity).
// Subordinate to the SWE η sheet — never a second free surface. N covers the entire alongshore belt.
const SHORE_PART_N = 4096;
const SHORE_SPH_H = 1.05;
const SHORE_SPH_RHO0 = 9.2;
const SHORE_SPH_KP = 52.0;
const SHORE_SPH_KN = 9.5;
const SHORE_SPH_XSPH = 0.085;
const SHORE_SPH_VORT = 0.14;

function shoreWgsl() {
  return `
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
@group(0) @binding(0) var srcS: texture_2d<f32>;
@group(0) @binding(1) var dstS: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var bedTex: texture_2d<f32>;
@group(0) @binding(3) var srcW: texture_2d<f32>;
@group(0) @binding(4) var dstW: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> U: ShoreU;
@group(0) @binding(6) var shapeTex: texture_2d<f32>;
@group(0) @binding(7) var<storage, read_write> parts: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> dens: array<vec2<f32>>;
@group(0) @binding(9) var<storage, read_write> heads: array<atomic<u32>>;
@group(0) @binding(10) var<storage, read_write> nextP: array<u32>;

const NX: u32 = ${SHORE_NX}u;
const NZ: u32 = ${SHORE_NZ}u;
const PN: u32 = ${SHORE_PART_N}u;
const SPH_H: f32 = ${SHORE_SPH_H};
const SPH_H2: f32 = ${SHORE_SPH_H * SHORE_SPH_H};
const SPH_RHO0: f32 = ${SHORE_SPH_RHO0};
const SPH_KP: f32 = ${SHORE_SPH_KP};
const SPH_KN: f32 = ${SHORE_SPH_KN};
const SPH_XSPH: f32 = ${SHORE_SPH_XSPH};
const SPH_VORT: f32 = ${SHORE_SPH_VORT};
const K_SPIKY2: f32 = ${6 / (Math.PI * Math.pow(SHORE_SPH_H, 4))};
const K_SPIKY3: f32 = ${10 / (Math.PI * Math.pow(SHORE_SPH_H, 5))};
const K_DSP2: f32 = ${12 / (Math.PI * Math.pow(SHORE_SPH_H, 4))};
const K_DSP3: f32 = ${30 / (Math.PI * Math.pow(SHORE_SPH_H, 5))};
const K_POLY6: f32 = ${4 / (Math.PI * Math.pow(SHORE_SPH_H, 8))};
const EMPTY: u32 = 0xffffffffu;

fn rot2(p: vec2<f32>) -> vec2<f32> {
  let cs = cos(U.dir);
  let sn = sin(U.dir);
  return vec2<f32>(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
}
${OCEAN_TAP_WGSL}
fn oceanSample(xz: vec2<f32>) -> f32 {
  return oceanTap(shapeTex, rot2(xz) / 220.0).x;
}
// Noniv/web-ocean: FFT slope Jacobian fold proxy (break energy cue — not foam paint).
fn fftFold(xz: vec2<f32>) -> f32 {
  let s = oceanTap(shapeTex, rot2(xz) / 220.0).yz;
  let jApprox = 1.0 - (s.x * s.x + s.y * s.y);
  return smoothstep(0.55, 0.12, jApprox);
}
fn steepOf(i: i32) -> f32 {
  if (i == 0) { return U.steep.x; }
  if (i == 1) { return U.steep.y; }
  if (i == 2) { return U.steep.z; }
  return U.steep.w;
}
fn cellPos(ix: u32, iz: u32) -> vec2<f32> {
  return U.origin + U.along * (f32(ix) + 0.5) * U.dx + U.sea * (f32(iz) + 0.5) * U.dx;
}
// Depth-aware swell for the seaward coupling band. Same idea as seaAt's shoreK /
// shoalAmp: hold frequency, shorten k, grow amplitude as group velocity falls.
// The FFT tile stays deep-water; only these Gerstner drive terms feel the bed.
fn coupleK(k: f32, depth: f32, band: f32) -> vec2<f32> {
  let kh0 = k * depth;
  let th0 = tanh(min(kh0, 8.0));
  // Match seaAt shoreK: bunch earlier in mid-depth so the drive shortens with the crest.
  let bunch = smoothstep(2.05, 0.28, kh0) * (1.0 - smoothstep(3.5, 4.5, band));
  let kHold = k / max(th0, 0.32);
  let kUse = mix(k, min(kHold, k * 1.55), bunch);
  let th = tanh(min(kUse * depth, 8.0));
  return vec2<f32>(kUse, max(th, 0.045));
}
fn coupleAmp(kUse: f32, th: f32, depth: f32) -> f32 {
  let kh = min(kUse * depth, 6.0);
  let kh2 = min(kh * 2.0, 10.0);
  let cgFrac = 0.5 * (1.0 + kh2 / max(sinh(kh2), 1e-3));
  let cgRel = max(sqrt(th) * cgFrac, 0.08) / 0.5;
  // Restrained shoal growth — 1.45 still let bores climb walkable beach / cover eye.
  let grow = clamp(sqrt(1.0 / min(cgRel, 1.0)), 1.0, 1.28);
  return mix(1.0, grow, smoothstep(1.95, 0.15, kh));
}
// Helio/Rockstar shore: hard amp vs depth so cm-deep film cannot carry metre crests.
fn depthAmpCap(As: f32, depth: f32) -> f32 {
  return min(As, 0.42 * depth + 0.14);
}
// Rockstar DF / Helio travel-time proxy: crest phase follows shore-arrival, not open-ocean k·x alone.
fn travelPhase(xz: vec2<f32>, depth: f32, omega: f32) -> f32 {
  let dSea = dot(xz - U.origin, U.sea);
  let c = max(sqrt(9.81 * max(depth, 0.08)), 0.45);
  return omega * (dSea / c);
}
fn ocean(xz: vec2<f32>, depth: f32) -> vec3<f32> {
  var eta = oceanSample(xz);
  var vel = vec2<f32>(0.0);
  let frq = max(U.frq, 0.2);
  let D = max(depth, 0.25);
  // Keep kinematics aligned with seaAt so the wash is driven by the same swell family.
  let deepW = smoothstep(1.6, 7.5, D);
  // Shore trains fade in as depth falls (Helio 5.3) — spectrum damp near land.
  let shoreTrain = smoothstep(0.05, 0.55, D) * (1.0 - smoothstep(4.5, 9.0, D));
  for (var i = 0; i < 4; i++) {
    let w = U.waves[i];
    let dir0 = rot2(w.xy);
    let len = w.w / frq;
    let k = 6.2831853 / len;
    let feel = 1.0 - smoothstep(len * 0.08, len * 0.45, D);
    var As = w.z * U.amp * (1.0 + feel * 0.55);
    let Q = min(steepOf(i) + feel * 0.45, 1.05);
    // Keep more offshore swell energy so the rim drive reaches the surf belt.
    if (i < 2) { As *= mix(1.0, 0.42, deepW); }
    if (i == 0) { As *= 0.45 + 0.5 * sin(dot(dir0, xz) * 0.062 - U.time * 0.045); }
    if (i == 1) { As *= 0.5 + 0.45 * sin(dot(dir0, xz) * 0.09 + 1.3); }
    if (i >= 3) { As *= 0.22; }
    let st = k * As * Q;
    if (st > 0.72) { As *= 0.72 / st; }
    let collapse = 1.0 - smoothstep(0.35, 2.2, D);
    As *= 1.0 - collapse * 0.18;
    let sk = coupleK(k, D, f32(i));
    let kUse = sk.x;
    let thK = sk.y;
    let slow = sqrt(thK);
    if (i < 3) { As *= coupleAmp(kUse, thK, D); }
    As = depthAmpCap(As, D);
    let steepShore = kUse * As * Q;
    if (steepShore > 0.78) { As *= 0.78 / steepShore; }
    // Snell toward shore-normal as phase speed drops (Rockstar shore waves // to coast).
    var dir = dir0;
    if (i < 3 && k * D < 2.15) {
      let into = clamp(-dot(dir0, U.sea), 0.0, 1.0);
      let turn = clamp((1.0 - slow) * 1.2, 0.0, 1.0) * shoreTrain;
      dir = normalize(mix(dir0, -U.sea * max(into, 0.08) + U.along * dot(dir0, U.along), turn));
    }
    // Noniv capillary dispersion on short bands: ω² = gk + σk³ (seamless mid/short handoff).
    let cap = select(0.0, 7.4e-5 * kUse * kUse * kUse, i >= 2);
    let omega = sqrt(9.81 * kUse + cap) * U.spd * slow;
    // Helio T-field phase: crests wrap alongshore; open-ocean phase fades near beach.
    let phOpen = kUse * dot(dir, xz);
    let phShore = travelPhase(xz, D, omega) + kUse * dot(U.along, xz) * (0.08 + 0.12 * f32(i));
    let phase = mix(phOpen, phShore, shoreTrain * select(0.55, 0.85, i < 2)) - omega * U.time;
    let s = sin(phase);
    eta += As * s;
    // Orbital + progressive shoreward flux so the bore carries mass inland.
    vel += dir * Q * As * s * omega * 1.22;
    // Shoreward mass bias on the rising face (GTA VI wash onto beach).
    vel += (-U.sea) * Q * As * max(s, 0.0) * omega * 0.38 * shoreTrain;
  }
  let r = vec2<f32>(xz.x * 0.82 - xz.y * 0.57, xz.x * 0.57 + xz.y * 0.82);
  eta += oceanSample(r * (220.0 / 151.0)) * 0.42 * mix(1.0, 0.35, shoreTrain);
  return vec3<f32>(eta, vel);
}
fn at(ix: i32, iz: i32) -> vec4<f32> {
  let x = clamp(ix, 0, i32(NX) - 1);
  let z = clamp(iz, 0, i32(NZ) - 1);
  return textureLoad(srcS, vec2<i32>(x, z), 0);
}
fn bedAt(ix: i32, iz: i32) -> vec2<f32> {
  let x = clamp(ix, 0, i32(NX) - 1);
  let z = clamp(iz, 0, i32(NZ) - 1);
  return textureLoad(bedTex, vec2<i32>(x, z), 0).xy;
}
fn stars(hL: f32, bL: f32, hR: f32, bR: f32) -> vec2<f32> {
  let bstar = max(bL, bR);
  return vec2<f32>(max(hL + bL - bstar, 0.0), max(hR + bR - bstar, 0.0));
}
fn physFlux(h: f32, un: f32, ut: f32) -> vec3<f32> {
  let hu = h * un;
  return vec3<f32>(hu, hu * un + 0.5 * 9.81 * h * h, hu * ut);
}
fn hllFlux(hL: f32, unL: f32, utL: f32, hR: f32, unR: f32, utR: f32) -> vec3<f32> {
  let g = 9.81;
  let eps = 1e-4;
  let cL = sqrt(g * max(hL, 0.0));
  let cR = sqrt(g * max(hR, 0.0));
  var sL = 0.0;
  var sR = 0.0;
  if (hL > eps && hR > eps) {
    sL = min(unL - cL, unR - cR);
    sR = max(unL + cL, unR + cR);
  } else if (hL > eps) {
    sL = unL - cL;
    sR = unL + 2.0 * cL;
  } else if (hR > eps) {
    sL = unR - 2.0 * cR;
    sR = unR + cR;
  } else {
    return vec3<f32>(0.0);
  }
  let fL = physFlux(hL, unL, utL);
  let fR = physFlux(hR, unR, utR);
  if (sL >= 0.0) { return fL; }
  if (sR <= 0.0) { return fR; }
  let UL = vec3<f32>(hL, hL * unL, hL * utL);
  let UR = vec3<f32>(hR, hR * unR, hR * utR);
  return (sR * fL - sL * fR + sL * sR * (UR - UL)) / max(sR - sL, 1e-5);
}
fn faceFlux(hL: f32, bL: f32, vL: vec2<f32>, hR: f32, bR: f32, vR: vec2<f32>, nrm: vec2<f32>, tan: vec2<f32>) -> vec3<f32> {
  let hs = stars(hL, bL, hR, bR);
  var unL = dot(vL, nrm);
  var utL = dot(vL, tan);
  var unR = dot(vR, nrm);
  var utR = dot(vR, tan);
  if (hs.x < 1e-4) { unL = 0.0; utL = 0.0; }
  if (hs.y < 1e-4) { unR = 0.0; utR = 0.0; }
  return hllFlux(hs.x, unL, utL, hs.y, unR, utR);
}
fn worldToCell(xz: vec2<f32>) -> vec2<f32> {
  let d = xz - U.origin;
  return vec2<f32>(dot(d, U.along) / U.dx - 0.5, dot(d, U.sea) / U.dx - 0.5);
}
fn bil4(tex: texture_2d<f32>, xz: vec2<f32>) -> vec4<f32> {
  let f = worldToCell(xz);
  let x0 = clamp(i32(floor(f.x)), 0, i32(NX) - 2);
  let z0 = clamp(i32(floor(f.y)), 0, i32(NZ) - 2);
  let t = vec2<f32>(f.x - f32(x0), f.y - f32(z0));
  let a = textureLoad(tex, vec2<i32>(x0, z0), 0);
  let b = textureLoad(tex, vec2<i32>(x0 + 1, z0), 0);
  let c = textureLoad(tex, vec2<i32>(x0, z0 + 1), 0);
  let d = textureLoad(tex, vec2<i32>(x0 + 1, z0 + 1), 0);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
fn sampleSheet(xz: vec2<f32>) -> vec4<f32> { return bil4(srcS, xz); }
fn sampleBed(xz: vec2<f32>) -> f32 { return bil4(bedTex, xz).x; }
// Bed/rock: kill penetrating normal speed + friction (rocks are bedTex mounds).
fn collideBed(xz: ptr<function, vec2<f32>>, vel: ptr<function, vec2<f32>>, h: f32) {
  let e = U.dx;
  let b = sampleBed(*xz);
  let n2 = vec2<f32>(
    sampleBed(*xz + vec2<f32>(e, 0.0)) - sampleBed(*xz - vec2<f32>(e, 0.0)),
    sampleBed(*xz + vec2<f32>(0.0, e)) - sampleBed(*xz - vec2<f32>(0.0, e))) * (0.5 / e);
  let nLen = length(n2);
  let solid = smoothstep(-0.08, 0.12, b) * smoothstep(0.05, 0.45, nLen);
  if (solid < 0.02 && b < -max(h, 0.01)) { return; }
  let vn = dot(*vel, n2);
  if (vn < 0.0) {
    *vel = (*vel - n2 * vn * (1.0 + 0.35 * solid)) * max(1.0 - (0.28 + 0.55 * solid) * solid, 0.15);
  }
  if (b > -0.02 && nLen > 0.12) { *xz = *xz + n2 * (0.08 + 0.2 * solid) * e; }
}
fn hashCell(cell: vec2<i32>) -> u32 {
  return (u32(cell.x * 15823 + cell.y * 9737333)) % PN;
}
fn cellOf(p: vec2<f32>) -> vec2<i32> {
  return vec2<i32>(i32(floor(p.x / SPH_H)), i32(floor(p.y / SPH_H)));
}

@compute @workgroup_size(8, 8)
fn seed(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= NX || z >= NZ) { return; }
  let b = textureLoad(bedTex, vec2<i32>(i32(x), i32(z)), 0).x;
  var h = 0.0;
  if (b < 0.0) { h = -b; }
  textureStore(dstS, vec2<i32>(i32(x), i32(z)), vec4<f32>(h, 0.0, 0.0, 0.0));
  let wet = select(0.0, 1.0, b < 0.02);
  textureStore(dstW, vec2<i32>(i32(x), i32(z)), vec4<f32>(wet, b, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn shoreStep(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= NX || z >= NZ) { return; }
  let ip = vec2<i32>(i32(x), i32(z));
  let b = textureLoad(bedTex, ip, 0).x;
  let wet0 = textureLoad(srcW, ip, 0);
  if (b > 2.2) {
    textureStore(dstS, ip, vec4<f32>(0.0));
    textureStore(dstW, ip, vec4<f32>(0.0, b, wet0.z * exp(-U.dt * 0.08), 0.0));
    return;
  }

  let c = textureLoad(srcS, ip, 0);
  var h = max(c.x, 0.0);
  var vel = c.yz;
  var foam = max(c.w, 0.0);
  if (h < 0.002) { vel = vec2<f32>(0.0); foam = 0.0; }
  let A = U.along;
  let S = U.sea;
  let l = at(ip.x - 1, ip.y);
  let r = at(ip.x + 1, ip.y);
  let dwn = at(ip.x, ip.y - 1);
  let up = at(ip.x, ip.y + 1);
  let bl = bedAt(ip.x - 1, ip.y).x;
  let br = bedAt(ip.x + 1, ip.y).x;
  let bd = bedAt(ip.x, ip.y - 1).x;
  let bu = bedAt(ip.x, ip.y + 1).x;
  let g2 = 0.5 * 9.81;
  let invDx = 1.0 / U.dx;
  let dt = U.dt;

  // Closed wall outside the grid. The seaward band is replaced by the coupling below.
  var fR = vec3<f32>(0.0, g2 * h * h, 0.0);
  var fL = fR;
  var fU = fR;
  var fD = fR;
  var sRx = h;
  var sLy = h;
  var sUx = h;
  var sDy = h;
  if (x + 1u < NX) {
    fR = faceFlux(h, b, vel, max(r.x, 0.0), br, r.yz, A, S);
    sRx = stars(h, b, max(r.x, 0.0), br).x;
  }
  if (x > 0u) {
    fL = faceFlux(max(l.x, 0.0), bl, l.yz, h, b, vel, A, S);
    sLy = stars(max(l.x, 0.0), bl, h, b).y;
  }
  if (z + 1u < NZ) {
    fU = faceFlux(h, b, vel, max(up.x, 0.0), bu, up.yz, S, A);
    sUx = stars(h, b, max(up.x, 0.0), bu).x;
  }
  if (z > 0u) {
    fD = faceFlux(max(dwn.x, 0.0), bd, dwn.yz, h, b, vel, S, A);
    sDy = stars(max(dwn.x, 0.0), bd, h, b).y;
  }

  var hN = h - dt * invDx * (fR.x - fL.x + fU.x - fD.x);
  // Positivity: never allow negative depth; storm ceiling kept modest nearshore.
  hN = clamp(hN, 0.0, 1.55);
  let srcA = g2 * (sRx * sRx - sLy * sLy);
  let srcS = g2 * (sUx * sUx - sDy * sDy);
  var pA = h * dot(vel, A) + dt * invDx * (-(fR.y - fL.y) - (fU.z - fD.z) + srcA);
  var pS = h * dot(vel, S) + dt * invDx * (-(fU.y - fD.y) - (fR.z - fL.z) + srcS);

  // Foam travels with the volume flux. Upwind, so a dry cell can receive it.
  let ffR = select(fR.x * r.w, fR.x * foam, fR.x >= 0.0);
  let ffL = select(fL.x * foam, fL.x * l.w, fL.x >= 0.0);
  let ffU = select(fU.x * up.w, fU.x * foam, fU.x >= 0.0);
  let ffD = select(fD.x * foam, fD.x * dwn.w, fD.x >= 0.0);
  var hf = h * foam - dt * invDx * (ffR - ffL + ffU - ffD);
  hf = max(hf, 0.0);

  // Desingularized velocity: freeze dry cells; avoid 1/h blow-ups on the film.
  let hDry = 0.0025;
  if (hN < hDry) {
    vel = vec2<f32>(0.0);
    pA = 0.0;
    pS = 0.0;
    hN = 0.0;
  } else {
    let denom = hN * hN + 0.00025;
    vel = A * (pA * hN / denom) + S * (pS * hN / denom);
  }

  // jeantimex/fluid → SWE: XSPH + PIC/FLIP fluidity + near-pressure (grid + sparse particle belt).
  if (hN >= hDry) {
    let wL = smoothstep(0.0015, 0.045, max(l.x, 0.0));
    let wR = smoothstep(0.0015, 0.045, max(r.x, 0.0));
    let wD = smoothstep(0.0015, 0.045, max(dwn.x, 0.0));
    let wU = smoothstep(0.0015, 0.045, max(up.x, 0.0));
    let wSum = max(wL + wR + wD + wU, 1e-4);
    let vPic = (l.yz * wL + r.yz * wR + dwn.yz * wD + up.yz * wU) / wSum;
    let filmN = smoothstep(0.18, 0.025, hN);
    let fluidity = clamp(1.0 - filmN * (0.55 + 0.35 * smoothstep(-0.35, 0.12, b)), 0.12, 0.97);
    vel = vel + (vPic - vel) * ((0.4 + 0.4 * filmN) * (1.0 - 0.5 * fluidity));
    vel = mix(vPic, vel, fluidity);
    let hMean = (max(l.x, 0.0) * wL + max(r.x, 0.0) * wR + max(dwn.x, 0.0) * wD + max(up.x, 0.0) * wU) / wSum;
    let gEta = vec2<f32>((max(r.x, 0.0) + br) - (max(l.x, 0.0) + bl),
      (max(up.x, 0.0) + bu) - (max(dwn.x, 0.0) + bd)) * invDx * 0.5;
    let gLen = length(gEta);
    let nearP = (max(hN - hMean * 1.12, 0.0) * 1.35 - max(hMean * 0.82 - hN, 0.0) * filmN * 0.85)
      * mix(2.6, 0.5, fluidity);
    if (gLen > 1e-4) { vel -= (gEta / gLen) * nearP * dt * 2.2; }
  }

  let uAr = dot(r.yz, A);
  let uAl = dot(l.yz, A);
  let uSu = dot(up.yz, S);
  let uSd = dot(dwn.yz, S);
  let div = (uAr - uAl + uSu - uSd) * invDx * 0.5;
  let shear = (dot(up.yz, A) - dot(dwn.yz, A) + uAr - uAl) * invDx * 0.5;
  let etaL = max(l.x, 0.0) + bl;
  let etaR = max(r.x, 0.0) + br;
  let etaD = max(dwn.x, 0.0) + bd;
  let etaU = max(up.x, 0.0) + bu;
  let steep = length(vec2<f32>(etaR - etaL, etaU - etaD)) * invDx * 0.5;
  let celer = sqrt(9.81 * max(hN, 0.02));
  let sp = length(vel);
  let Fr = sp / celer;
  let shallow = smoothstep(1.8, 0.2, max(-b, 0.0));
  var brk = smoothstep(0.04, 0.2, steep) * smoothstep(0.65, 1.25, Fr) * shallow;
  brk = max(brk, smoothstep(0.35, 1.4, -div) * shallow * smoothstep(0.02, 0.1, hN));
  // On a steep foreshore, supercritical run-up collapses sooner (surge→collapse handoff).
  let bedDrop = abs(bu - bd) * invDx * 0.5;
  brk = max(brk, smoothstep(0.55, 1.35, Fr) * smoothstep(0.08, 0.45, bedDrop) * shallow * 0.55);
  // Dissipate supercritical momentum. The bore speed is the local wave speed, not a constant.
  vel *= exp(-brk * 1.65 * dt);

  // Depth-aware Manning-like friction: stronger on walkable beach so run-up dies
  // before covering standing eye height; mid-surf stays mild so wash tongues arrive.
  let Cf = 0.0038 + 0.068 * smoothstep(-0.22, 0.16, b) + 0.048 * smoothstep(0.14, 0.01, hN);
  let sp2 = length(vel);
  if (sp2 > 0.02 && hN > 0.004) {
    vel *= 1.0 / (1.0 + dt * Cf * sp2 / max(hN, 0.02));
  }
  if (length(vel) > 5.2) { vel *= 5.2 / length(vel); }
  // Bed/rock sheet collision (bedTex mounds): normal + friction, no clip-through.
  {
    let n2 = vec2<f32>((br - bl) * invDx * 0.5, (bu - bd) * invDx * 0.5);
    let nLen = length(n2);
    let solid = smoothstep(0.28, 1.1, nLen) * smoothstep(-0.85, 0.15, b);
    if (solid > 0.02) {
      let nHat = n2 / max(nLen, 1e-4);
      let vn = dot(vel, nHat);
      if (vn < 0.0) { vel -= nHat * vn * (1.0 + 0.4 * solid); }
      vel *= max(1.0 - (0.22 + 0.45 * solid) * solid, 0.2);
      if (b > -0.05 && hN > 0.01) {
        vel += nHat * (0.15 + 0.55 * solid) * max(-vn, 0.0);
        hN = mix(hN, min(hN, 0.14), solid * smoothstep(-0.05, 0.2, b));
      }
    }
  }
  // Bound film depth on dry / barely-wet beach — walkable sand keeps eye above η.
  // Allow a slightly taller swash tongue than #70 so wash reads, still below eye.
  let off = f32(z) / max(U.nz - 1.0, 1.0);
  if (b > -0.12 && hN > 0.16) {
    let hCap = mix(0.16, 0.07, smoothstep(-0.12, 0.18, b));
    hN = mix(hN, min(hN, hCap), smoothstep(-0.12, 0.1, b));
  }
  // Extra inland kill: once past the foreshore, shed height before dune climb.
  let inlandK = smoothstep(0.38, 0.1, off) * smoothstep(-0.12, 0.22, b);
  if (inlandK > 0.01) {
    hN *= 1.0 - 0.48 * inlandK;
    vel *= 1.0 - 0.35 * inlandK;
  }
  // Continuous free-surface: mild film Laplacian (Helio flat contact film) — kills
  // cell-to-cell η sawteeth without raising mesh density or painting foam.
  if (hN >= hDry && hN < 0.22) {
    let hAvg = 0.25 * (max(l.x, 0.0) + max(r.x, 0.0) + max(dwn.x, 0.0) + max(up.x, 0.0));
    let smoothK = smoothstep(0.2, 0.03, hN) * (0.35 + 0.45 * smoothstep(-0.25, 0.08, b));
    hN = mix(hN, hAvg, smoothK * 0.42);
  }

  var foamN = 0.0;
  if (hN > 0.006) { foamN = clamp(hf / hN, 0.0, 1.25); }
  let lost = sp * (1.0 - exp(-brk * 1.6 * dt));
  // Alongshore peaks of the front get the foam, so the break is not one straight line.
  let front = abs(etaU - etaD);
  let lU = at(ip.x - 1, ip.y + 1);
  let lD = at(ip.x - 1, ip.y - 1);
  let rU = at(ip.x + 1, ip.y + 1);
  let rD = at(ip.x + 1, ip.y - 1);
  let frontL = abs(max(lU.x, 0.0) + bedAt(ip.x - 1, ip.y + 1).x - max(lD.x, 0.0) - bedAt(ip.x - 1, ip.y - 1).x);
  let frontR = abs(max(rU.x, 0.0) + bedAt(ip.x + 1, ip.y + 1).x - max(rD.x, 0.0) - bedAt(ip.x + 1, ip.y - 1).x);
  let peak = max(front - 0.5 * (frontL + frontR), 0.0) * invDx;
  let peakGate = smoothstep(0.003, 0.04, peak);
  let conv = smoothstep(0.06, 0.65, -div);
  let pos = cellPos(x, z);
  let cuspN = fract(sin(dot(pos, vec2<f32>(0.137, 0.091)) + U.time * 0.31) * 43758.17);
  let cuspBias = 0.55 + 0.9 * cuspN;
  foamN += brk * (0.08 + 1.45 * max(peakGate, conv * 0.85) * cuspBias) * (0.16 + lost * 0.9) * dt * 11.0;
  let skim = smoothstep(0.3, 1.05, Fr) * smoothstep(0.14, 0.02, hN) * smoothstep(-0.08, 0.1, b);
  foamN += skim * (0.4 + 0.7 * peakGate) * dt * 2.8;
  let bedGrad = length(vec2<f32>(br - bl, bu - bd)) * invDx * 0.5;
  let rockFace = smoothstep(0.35, 1.4, bedGrad) * smoothstep(-0.9, 0.2, b);
  foamN += rockFace * (0.2 + 0.8 * sp / max(celer, 0.2)) * (0.3 + 0.7 * Fr) * dt * 2.6;
  brk = max(brk, rockFace * smoothstep(0.4, 1.1, Fr) * 0.55);
  let dilute = smoothstep(0.28, 0.035, foamN);
  let retreat = clamp(dot(vel, S) / max(sp, 0.15), 0.0, 1.0);
  foamN *= exp(-dt * (0.16 + 3.4 * max(div, 0.0) + 1.2 * abs(shear) + dilute * 1.15 + retreat * 0.55));
  // Noniv semi-Lagrangian downwind drift of break energy (scalar transport, not foam paint).
  {
    let windD = rot2(vec2<f32>(1.0, 0.0));
    let back = cellPos(x, z) - windD * (dt * 0.4);
    let aged = sampleSheet(back).w;
    foamN = mix(foamN, aged, 0.07 * smoothstep(0.02, 0.15, foamN));
  }
  foamN = clamp(foamN, 0.0, 1.25);

  var ground = wet0.z;
  if (hN < 0.035 && b > -0.08 && foamN > 0.025) {
    ground = max(ground, foamN * (0.9 + 0.4 * peakGate));
    foamN *= 0.48;
  }
  let back = clamp(dot(vel, S) / max(sp, 0.12), 0.0, 1.0);
  if (hN < 0.028 && b > -0.08 && wet0.x > 0.35) {
    ground = max(ground, (0.1 + 0.14 * back + 0.08 * clamp(sp * 0.15, 0.0, 1.0)) * wet0.x);
  }
  ground *= exp(-dt * 0.032);
  if (hN > 0.08) { ground *= exp(-dt * 0.28); }

  // Authoritative coastal handoff: Dirichlet on a seaward rim spanning full alongshore.
  // Rockstar ocean→shore lerp: displacements + normals owned by SWE inland of rim.
  // Mild couple only — prior crest× / vel× dump still over-ran walkable beach.
  let wRow = smoothstep(0.84, 0.985, off);
  let wDepth = smoothstep(0.05, -0.55, b);
  let w = wRow * wDepth;
  if (w > 0.001 && b < 0.25) {
    let posC = cellPos(x, z);
    let depthDrive = max(-b, 0.25);
    let sea = ocean(posC, depthDrive);
    // Shared free-surface η ≈ sea.x; almost no crest amplify on the rim.
    let crestGate = smoothstep(0.01, 0.12, sea.x);
    let waveH = max(abs(sea.x) * 2.0, 0.02);
    let depthLim = smoothstep(0.4, 0.75, waveH / max(depthDrive, 0.2));
    let coupleSteep = abs(sea.x) * length(sea.yz) / max(depthDrive, 0.3);
    let steepLim = smoothstep(0.08, 0.36, coupleSteep);
    // Noniv Jacobian fold from FFT slopes — same open-sea fold family into shore couple.
    let fold = fftFold(posC);
    let brkEvt = max(max(depthLim, steepLim), fold * 0.8) * smoothstep(2.8, 0.2, depthDrive) * crestGate;
    // Depth-capped couple height (Helio a ≤ 0.42d+0.14 family via ocean()).
    let hO = max(sea.x * (1.0 + 0.05 * brkEvt) - b, 0.0);
    hN = mix(hN, hO, w);
    vel = mix(vel, sea.yz * (1.0 + 0.08 * brkEvt), w);
    // Foam seed when the drive crest trips — transported by SWE, not painted.
    foamN = mix(foamN, max(foamN, brkEvt * 0.85), w * 0.55 * clamp(brkEvt + 0.1, 0.0, 1.0));
  }
  // Alongshore ends are closed walls (flux already zero outside). Do not destroy
  // mass with a fade — only damp foam that would otherwise pile on the rim.
  if (x < 4u || x + 4u >= NX) {
    let edge = select(f32(x) / 4.0, f32(NX - 1u - x) / 4.0, x + 4u >= NX);
    foamN *= mix(0.35, 1.0, edge);
  }

  // Full SPH gather (9-cell hash walk) → sheet. Carriers subordinate; η stays SWE-owned.
  {
    let belt = smoothstep(0.05, 0.18, off) * (1.0 - smoothstep(0.8, 0.95, off))
      * smoothstep(0.002, 0.04, hN) * smoothstep(0.28, -0.12, b);
    if (belt > 0.015) {
      let pos = cellPos(x, z);
      var pull = vec2<f32>(0.0);
      var wP = 0.0;
      var massP = 0.0;
      let oc = cellOf(pos);
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          let key = hashCell(oc + vec2<i32>(ox, oy));
          var j = atomicLoad(&heads[key]);
          var guard = 0u;
          loop {
            if (j == EMPTY || guard >= 48u) { break; }
            let p = parts[j];
            let d = p.xy - pos;
            let r2 = dot(d, d);
            if (r2 < SPH_H2) {
              let v = SPH_H2 - r2;
              let wk = v * v * v * K_POLY6;
              pull += p.zw * wk;
              wP += wk;
              massP += dens[j].x * wk;
            }
            j = nextP[j];
            guard = guard + 1u;
          }
        }
      }
      if (wP > 1e-5) {
        let filmG = smoothstep(0.14, 0.02, hN);
        // FLIP/PIC fluidity (jeantimex) + mild density couple into sheet velocity (moebis continuity).
        let densGate = smoothstep(SPH_RHO0 * 0.45, SPH_RHO0 * 1.15, massP / wP);
        vel = mix(vel, pull / wP, mix(0.3, 0.72, smoothstep(0.025, 0.14, hN))
          * (1.0 - 0.35 * filmG) * belt * (0.55 + 0.45 * densGate));
      }
    }
  }

  var wet = wet0.x;
  wet = max(wet * exp(-dt * 0.08), smoothstep(0.0, 0.03, hN));
  if (b < 0.0) { wet = 1.0; }

  textureStore(dstS, ip, vec4<f32>(hN, vel, foamN));
  textureStore(dstW, ip, vec4<f32>(wet, b, ground, 0.0));
}

// --- Full SPH/PBF belt (jeantimex + moebis transferable) ---
// Spatial hash via atomic linked lists (9-cell neighbor walks). Particles never draw η.
@compute @workgroup_size(64)
fn partClear(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= PN) { return; }
  atomicStore(&heads[i], EMPTY);
  nextP[i] = EMPTY;
}

@compute @workgroup_size(64)
fn partHash(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= PN) { return; }
  // Predict a half-step (jeantimex externalForces→predicted) for neighbor queries.
  let p = parts[i];
  let pred = p.xy + p.zw * (U.dt * 0.25);
  let key = hashCell(cellOf(pred));
  nextP[i] = atomicExchange(&heads[key], i);
}

@compute @workgroup_size(64)
fn partDens(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= PN) { return; }
  let p = parts[i];
  let pos = p.xy + p.zw * (U.dt * 0.25);
  let oc = cellOf(pos);
  var density = 0.0;
  var nearD = 0.0;
  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      let key = hashCell(oc + vec2<i32>(ox, oy));
      var j = atomicLoad(&heads[key]);
      var guard = 0u;
      loop {
        if (j == EMPTY || guard >= 48u) { break; }
        let q = parts[j];
        let npos = q.xy + q.zw * (U.dt * 0.25);
        let r2 = dot(npos - pos, npos - pos);
        if (r2 < SPH_H2) {
          let dst = sqrt(max(r2, 1e-10));
          let v = SPH_H - dst;
          density = density + v * v * K_SPIKY2;
          nearD = nearD + v * v * v * K_SPIKY3;
        }
        j = nextP[j];
        guard = guard + 1u;
      }
    }
  }
  dens[i] = vec2<f32>(density, nearD);
}

@compute @workgroup_size(64)
fn partForce(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= PN) { return; }
  let p = parts[i];
  let pos = p.xy + p.zw * (U.dt * 0.25);
  var vel = p.zw;
  let densI = dens[i];
  let density = densI.x;
  let nearD = densI.y;
  // moebis/PBF free-surface: only correct compression (C>0); λ≈0 when under-dense.
  let press = max(density - SPH_RHO0, 0.0) * SPH_KP;
  let nearP = nearD * SPH_KN;
  let oc = cellOf(pos);
  var fP = vec2<f32>(0.0);
  var fV = vec2<f32>(0.0);
  var omega = 0.0;
  var gradW = vec2<f32>(0.0);
  if (density > 1e-5) {
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        let key = hashCell(oc + vec2<i32>(ox, oy));
        var j = atomicLoad(&heads[key]);
        var guard = 0u;
        loop {
          if (j == EMPTY || guard >= 48u) { break; }
          if (j != i) {
            let q = parts[j];
            let npos = q.xy + q.zw * (U.dt * 0.25);
            let d = npos - pos;
            let r2 = dot(d, d);
            if (r2 < SPH_H2 && r2 > 1e-12) {
              let dst = sqrt(r2);
              let dir = d / dst;
              let densJ = dens[j];
              let nDens = densJ.x;
              let nNear = densJ.y;
              let nPress = max(nDens - SPH_RHO0, 0.0) * SPH_KP;
              let nNearP = nNear * SPH_KN;
              if (nDens > 1e-5) {
                let sp = (press + nPress) * 0.5;
                let sn = (nearP + nNearP) * 0.5;
                let v = SPH_H - dst;
                fP += dir * ((-v * K_DSP2) * (sp / nDens) + (-v * v * K_DSP3) * (sn / max(nNear, 1e-5)));
              }
              // XSPH (jeantimex/moebis) + Müller Laplacian viscosity (matsuoka SPH force).
              let wPoly = (SPH_H2 - r2);
              let w6 = wPoly * wPoly * wPoly * K_POLY6;
              let lap = (SPH_H - dst) * K_DSP2;
              fV += (q.zw - vel) * (w6 + lap * 0.22 / nDens);
              // Compact 2D vorticity confinement (moebis vorticity).
              let cross = (q.zw.x - vel.x) * dir.y - (q.zw.y - vel.y) * dir.x;
              omega = omega + cross * w6;
              gradW += dir * w6;
            }
          }
          j = nextP[j];
          guard = guard + 1u;
        }
      }
    }
    vel = vel + (fP / density) * U.dt;
    vel = vel + fV * SPH_XSPH * U.dt;
    let gLen = length(gradW);
    if (gLen > 1e-5 && abs(omega) > 1e-5) {
      let nHat = gradW / gLen;
      // Force restores swirl: N × ω (2D → perpendicular to density-color gradient).
      vel = vel + vec2<f32>(-nHat.y, nHat.x) * (omega * SPH_VORT * U.dt);
    }
  }
  parts[i] = vec4<f32>(p.xy, vel);
}

@compute @workgroup_size(64)
fn partStep(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= PN) { return; }
  var xz = parts[i].xy;
  var vel = parts[i].zw;
  let dt = U.dt;
  let f0 = worldToCell(xz);
  let off0 = f0.y / max(U.nz - 1.0, 1.0);
  let s0 = sampleSheet(xz);
  let bed0 = sampleBed(xz);
  let dead = f0.x < 1.0 || f0.y < 1.0 || f0.x > f32(NX) - 2.0 || f0.y > f32(NZ) - 2.0
    || s0.x < 0.003 || off0 < 0.04 || off0 > 0.97 || bed0 > 0.35;
  if (dead) {
    let seed = f32(i) * 0.017 + U.time * 0.31;
    let alongT = fract(sin(seed * 12.9898) * 43758.17);
    // Full shoreline length × sea→film band (seamless with Dirichlet / wet-film handoff).
    let seaT = mix(0.1, 0.88, fract(sin(seed * 78.233) * 43758.17));
    let ix = u32(clamp(alongT * (f32(NX) - 2.0) + 1.0, 1.0, f32(NX) - 2.0));
    let iz = u32(clamp(seaT * (f32(NZ) - 2.0) + 1.0, 1.0, f32(NZ) - 2.0));
    xz = cellPos(ix, iz);
    vel = textureLoad(srcS, vec2<i32>(i32(ix), i32(iz)), 0).yz;
  }
  let sheet = sampleSheet(xz);
  let h = max(sheet.x, 0.0);
  // matsuoka MLS-MPM G2P idea: quadratic-ish 3×3 weighted gather from SWE (η still sheet-owned).
  var gV = sheet.yz;
  {
    let f = worldToCell(xz);
    let ix0 = i32(floor(f.x));
    let iz0 = i32(floor(f.y));
    let fx = f.x - f32(ix0);
    let fz = f.y - f32(iz0);
    var wSum = 0.0;
    var vSum = vec2<f32>(0.0);
    for (var gz = -1; gz <= 1; gz++) {
      for (var gx = -1; gx <= 1; gx++) {
        let wx = select(select(0.5 * (0.5 + fx) * (0.5 + fx), 0.75 - fx * fx, gx == 0), 0.5 * (0.5 - fx) * (0.5 - fx), gx == -1);
        let wz = select(select(0.5 * (0.5 + fz) * (0.5 + fz), 0.75 - fz * fz, gz == 0), 0.5 * (0.5 - fz) * (0.5 - fz), gz == -1);
        let ww = wx * wz;
        let c = at(ix0 + gx, iz0 + gz);
        vSum += c.yz * ww;
        wSum += ww;
      }
    }
    if (wSum > 1e-5) { gV = vSum / wSum; }
  }
  // PIC/FLIP (jeantimex) + density-aware free-surface lean (matsuoka/MPM): under-dense → PIC.
  let densI = dens[i].x;
  let densFlip = smoothstep(SPH_RHO0 * 0.35, SPH_RHO0 * 1.05, densI);
  let fl = clamp((1.0 - smoothstep(0.14, 0.018, h) * 0.78) * densFlip, 0.1, 0.96);
  vel = mix(gV, vel, fl);
  vel += (gV - vel) * (0.4 * (1.0 - fl));
  // Mild seaAt/SWE couple at seaward rim so particles inherit ocean drive without owning η.
  let rim = smoothstep(0.82, 0.95, off0);
  if (rim > 0.01) {
    let depthDrive = max(-bed0, 0.25);
    let sea = ocean(xz, depthDrive);
    let foldP = fftFold(xz);
    vel = mix(vel, sea.yz * (1.0 + 0.08 * foldP), rim * 0.35);
  }
  xz += vel * dt;
  collideBed(&xz, &vel, h);
  let f1 = worldToCell(xz);
  if (f1.x < 1.0 || f1.y < 1.0 || f1.x > f32(NX) - 2.0 || f1.y > f32(NZ) - 2.0) {
    vel *= 0.2;
    xz = cellPos(u32(clamp(f1.x, 1.0, f32(NX) - 2.0)), u32(clamp(f1.y, 1.0, f32(NZ) - 2.0)));
  }
  let bed1 = sampleBed(xz);
  // Wet-film handoff + moebis-style adhesion damp on dry bed (sheet owns η).
  if (bed1 > -0.08) { vel *= mix(0.88, 0.5, smoothstep(-0.08, 0.2, bed1)); }
  if (h < 0.03) { vel *= 0.78; }
  parts[i] = vec4<f32>(xz, vel);
}

@compute @workgroup_size(8, 8)
fn copy(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let z = id.y;
  if (x >= NX || z >= NZ) { return; }
  let ip = vec2<i32>(i32(x), i32(z));
  textureStore(dstS, ip, textureLoad(srcS, ip, 0));
  textureStore(dstW, ip, textureLoad(srcW, ip, 0));
}
`;
}

async function createShore(device, world, anchor, shapeView, rocks) {
  const nx = SHORE_NX, nz = SHORE_NZ, dx = SHORE_DX;
  const seaX = anchor.fx, seaZ = anchor.fz;
  const alongX = -seaZ, alongZ = seaX;
  // Wash domain on foreshore — GTA VI-style run-up needs a few metres of sand;
  // prior 18 m climbed the dune; 12 m was tight for continuous wash tongues.
  const inland = 13;
  const originX = anchor.x - alongX * nx * dx * 0.5 - seaX * inland;
  const originZ = anchor.z - alongZ * nx * dx * 0.5 - seaZ * inland;
  const bedData = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = originX + alongX * (i + 0.5) * dx + seaX * (j + 0.5) * dx;
      const z = originZ + alongZ * (i + 0.5) * dx + seaZ * (j + 0.5) * dx;
      let h = fieldSample(world, x, z);
      const band = smooth01(1.15, 0.2, h) * smooth01(-1.1, -0.2, h);
      // Mild foreshore grain only — heavy cusp ridges faceted the free-surface mesh.
      // Alongshore wash variation comes from travel-time phase + SWE, not bed sawteeth.
      const cusp = (vnoise(x * 0.11, z * 0.11 + 3.0) - 0.5) * 0.22
        + (vnoise(x * 0.29, z * 0.29 + 8.0) - 0.5) * 0.1;
      const ridge = (vnoise(x * 0.55, z * 0.55) - 0.5) * 0.06;
      const grain = (vnoise(x * 1.9 + 4.0, z * 1.9) - 0.5) * 0.03;
      h += (cusp + ridge + grain) * band;
      // Deeper than the surf zone, the cell is the ocean. The solver owns the wash.
      let drive = 0;
      if (h < -0.7) drive = 1;
      else if (h < -0.32) drive = (-0.32 - h) / 0.38;
      if (j > nz - 6) drive = 1;
      const o = (j * nx + i) * 2;
      bedData[o] = h;
      bedData[o + 1] = drive;
    }
  }
  // Stamp coastal rocks into the sim bed so the shallow-water sheet wraps, piles, and
  // foams around them. Visual meshes stay separate; this is collision for the wash only.
  if (rocks && rocks.length) {
    const invAlong = 1 / (nx * dx), invSea = 1 / (nz * dx);
    for (let r = 0; r < rocks.length; r += 4) {
      const rx = rocks[r], rz = rocks[r + 1], peak = rocks[r + 2], rad = Math.max(rocks[r + 3], 0.25);
      const dOx = rx - originX, dOz = rz - originZ;
      const fi = (dOx * alongX + dOz * alongZ) / dx;
      const fj = (dOx * seaX + dOz * seaZ) / dx;
      const i0 = Math.max(0, Math.floor(fi - rad / dx - 1));
      const i1 = Math.min(nx - 1, Math.ceil(fi + rad / dx + 1));
      const j0 = Math.max(0, Math.floor(fj - rad / dx - 1));
      const j1 = Math.min(nz - 1, Math.ceil(fj + rad / dx + 1));
      const r2 = rad * rad;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = originX + alongX * (i + 0.5) * dx + seaX * (j + 0.5) * dx;
          const z = originZ + alongZ * (i + 0.5) * dx + seaZ * (j + 0.5) * dx;
          const dxr = x - rx, dzr = z - rz, d2 = dxr * dxr + dzr * dzr;
          if (d2 >= r2) continue;
          const t = 1 - d2 / r2;
          // Smooth mound: peaks near rock crown, skirts into surrounding sand.
          const mound = peak * (t * t * (3 - 2 * t));
          const o = (j * nx + i) * 2;
          if (mound > bedData[o]) {
            bedData[o] = mound;
            // Rocks are walls for the wash, not open-ocean drive cells.
            if (mound > -0.15) bedData[o + 1] = Math.min(bedData[o + 1], 0.15);
          }
        }
      }
    }
  }

  const bedTex = device.createTexture({
    size: [nx, nz],
    format: 'rg32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.writeTexture(
    { texture: bedTex },
    bedData,
    { bytesPerRow: nx * 8, rowsPerImage: nz },
    { width: nx, height: nz }
  );

  const simUsage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
  const makeTex = () => device.createTexture({ size: [nx, nz], format: 'rgba16float', usage: simUsage });
  const state = [makeTex(), makeTex()];
  const wet = [makeTex(), makeTex()];
  const showS = makeTex();
  const showW = makeTex();

  const partData = new Float32Array(SHORE_PART_N * 4);
  for (let i = 0; i < SHORE_PART_N; i++) {
    // Seed across full alongshore × sea→film band (entire shoreline belt).
    const ix = 1 + ((i * 17) % (nx - 2));
    const band = Math.max(1, ((nz * 0.78) | 0));
    const iz = 1 + ((((i / 7) | 0) % band));
    const iz2 = Math.min(nz - 2, Math.max(1, ((0.1 * nz) | 0) + iz));
    partData[i * 4] = originX + alongX * (ix + 0.5) * dx + seaX * (iz2 + 0.5) * dx;
    partData[i * 4 + 1] = originZ + alongZ * (ix + 0.5) * dx + seaZ * (iz2 + 0.5) * dx;
  }
  const partBuf = device.createBuffer({
    size: partData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  device.queue.writeBuffer(partBuf, 0, partData);
  const densBuf = device.createBuffer({
    size: SHORE_PART_N * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const headsBuf = device.createBuffer({
    size: SHORE_PART_N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const nextBuf = device.createBuffer({
    size: SHORE_PART_N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  const module = device.createShaderModule({ code: shoreWgsl() });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.lineNum + ':' + e.message).join('\n'));
  // textures + uniform + shape + parts/dens/heads/next
  const layout = layoutOf(device, GPUShaderStage.COMPUTE, 'tottoutwwww');
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipe = (name) => device.createComputePipeline({ layout: pl, compute: { module: module, entryPoint: name } });
  const pipes = {
    seed: pipe('seed'),
    step: pipe('shoreStep'),
    partClear: pipe('partClear'),
    partHash: pipe('partHash'),
    partDens: pipe('partDens'),
    partForce: pipe('partForce'),
    part: pipe('partStep'),
    copy: pipe('copy')
  };

  const ubuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(36);
  u[0] = originX; u[1] = originZ; u[2] = dx; u[3] = nx;
  u[4] = alongX; u[5] = alongZ; u[6] = seaX; u[7] = seaZ;
  u[13] = nz;
  const bedView = bedTex.createView();
  const shape = shapeView;
  const group = (src, dst, srcW, dstW) => groupOf(device, layout, [
    src.createView(), dst.createView(), bedView, srcW.createView(), dstW.createView(),
    ubuf, shape, partBuf, densBuf, headsBuf, nextBuf
  ]);
  const stepBG = [
    group(state[0], state[1], wet[0], wet[1]),
    group(state[1], state[0], wet[1], wet[0])
  ];
  const copyBG = [
    group(state[0], showS, wet[0], showW),
    group(state[1], showS, wet[1], showW)
  ];
  let ping = 0;

  function writeWaves(time, dt) {
    u[8] = time;
    u[9] = dt;
    // Shore breakers track weather wind strength; couple ≤ seaAt (no amp boost).
    u[10] = wp.amp * (typeof env !== 'undefined' ? env.sea : 1) * 0.98;
    u[11] = wp.spd;
    u[12] = wp.dir;
    u[14] = Math.max(wp.frq, 0.2);
    for (let i = 0; i < 4; i++) {
      const w = WAVES[i];
      const L = Math.hypot(w[0], w[1]) || 1;
      u[16 + i * 4] = w[0] / L;
      u[17 + i * 4] = w[1] / L;
      u[18 + i * 4] = w[2];
      u[19 + i * 4] = w[3];
      u[32 + i] = w[4];
    }
    device.queue.writeBuffer(ubuf, 0, u);
  }
  function run(enc, steps) {
    const p = enc.beginComputePass();
    for (const [pipeline, bg, mode] of steps) {
      p.setPipeline(pipeline);
      p.setBindGroup(0, bg);
      if (mode === 'part') p.dispatchWorkgroups(Math.ceil(SHORE_PART_N / 64));
      else p.dispatchWorkgroups(nx / 8, nz / 8);
    }
    p.end();
  }
  // One SPH substep: clear → hash → density → pressure/XSPH/vorticity → PIC/FLIP integrate.
  function sphChain(bg) {
    return [
      [pipes.partClear, bg, 'part'],
      [pipes.partHash, bg, 'part'],
      [pipes.partDens, bg, 'part'],
      [pipes.partForce, bg, 'part'],
      [pipes.part, bg, 'part']
    ];
  }
  function seed(enc) {
    writeWaves(0, 0.02);
    run(enc, [[pipes.seed, stepBG[0]], ...sphChain(stepBG[0]), [pipes.copy, copyBG[1]]]);
    ping = 1;
  }
  function encode(enc, time, dt) {
    // CFL at dx 0.32 m and a ~8 m/s bore is about 0.016 s. Stay under it.
    // Cap at 3 substeps: at ~30 fps (dt≈0.033) that is still full CFL coverage.
    const n = Math.max(1, Math.min(3, Math.ceil(dt / 0.012)));
    writeWaves(time, dt / n);
    const steps = [];
    for (let s = 0; s < n; s++) {
      // Full SPH on current src sheet, then shoreStep gathers neighbors into η.
      steps.push(...sphChain(stepBG[ping]));
      steps.push([pipes.step, stepBG[ping]]);
      ping = 1 - ping;
    }
    steps.push([pipes.copy, copyBG[ping]]);
    run(enc, steps);
  }

  return {
    ubuf: ubuf,
    stateView: showS.createView(),
    wetView: showW.createView(),
    module: module,
    partBuf: partBuf,
    partN: SHORE_PART_N,
    sphH: SHORE_SPH_H,
    solverSteps: ['partClear', 'partHash', 'partDens', 'partForce', 'partStep', 'shoreStep'],
    seed: seed,
    encode: encode
  };
}
