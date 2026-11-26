// Shallow water on its own grid, finer than the island mesh.
// The seaward edge is driven by the swell. The beach is where that water runs up.

const SHORE_NX = 320;
const SHORE_NZ = 176;
const SHORE_DX = 0.32;

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

const NX: u32 = ${SHORE_NX}u;
const NZ: u32 = ${SHORE_NZ}u;

fn rot2(p: vec2<f32>) -> vec2<f32> {
  let cs = cos(U.dir);
  let sn = sin(U.dir);
  return vec2<f32>(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
}
${OCEAN_TAP_WGSL}
fn oceanSample(xz: vec2<f32>) -> f32 {
  return oceanTap(shapeTex, rot2(xz) / 220.0).x;
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
  // Stronger shoal growth so Dirichlet injects enough energy for visible run-up / crash.
  let grow = clamp(sqrt(1.0 / min(cgRel, 1.0)), 1.0, 2.35);
  return mix(1.0, grow, smoothstep(1.95, 0.12, kh));
}
fn ocean(xz: vec2<f32>, depth: f32) -> vec3<f32> {
  var eta = oceanSample(xz);
  var vel = vec2<f32>(0.0);
  let frq = max(U.frq, 0.2);
  let D = max(depth, 0.25);
  // Keep kinematics aligned with seaAt so the wash is driven by the same swell family.
  let deepW = smoothstep(1.6, 7.5, D);
  for (var i = 0; i < 4; i++) {
    let w = U.waves[i];
    let dir = rot2(w.xy);
    let len = w.w / frq;
    let k = 6.2831853 / len;
    let feel = 1.0 - smoothstep(len * 0.08, len * 0.45, D);
    var As = w.z * U.amp * (1.0 + feel * 0.95);
    let Q = min(steepOf(i) + feel * 0.5, 1.1);
    // Keep more offshore swell energy so the rim drive reaches the surf belt.
    if (i < 2) { As *= mix(1.0, 0.58, deepW); }
    if (i == 0) { As *= 0.5 + 0.55 * sin(dot(dir, xz) * 0.062 - U.time * 0.045); }
    if (i == 1) { As *= 0.55 + 0.5 * sin(dot(dir, xz) * 0.09 + 1.3); }
    if (i >= 3) { As *= 0.28; }
    let st = k * As * Q;
    if (st > 0.78) { As *= 0.78 / st; }
    let collapse = 1.0 - smoothstep(0.35, 2.2, D);
    As *= 1.0 - collapse * 0.1;
    let sk = coupleK(k, D, f32(i));
    let kUse = sk.x;
    let thK = sk.y;
    let slow = sqrt(thK);
    if (i < 3) { As *= coupleAmp(kUse, thK, D); }
    let steepShore = kUse * As * Q;
    if (steepShore > 0.78) { As *= 0.78 / steepShore; }
    let omega = sqrt(9.81 * kUse) * U.spd * slow;
    let phase = kUse * dot(dir, xz) - omega * U.time;
    let s = sin(phase);
    eta += As * s;
    // Orbital + progressive shoreward flux so the bore carries mass inland.
    vel += dir * Q * As * s * omega * 1.12;
  }
  let r = vec2<f32>(xz.x * 0.82 - xz.y * 0.57, xz.x * 0.57 + xz.y * 0.82);
  eta += oceanSample(r * (220.0 / 151.0)) * 0.42;
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
  // Positivity: never allow negative depth; cap only at a physical storm ceiling.
  hN = clamp(hN, 0.0, 3.2);
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

  // Depth-aware Manning-like friction: strong on the thin beach film (crash + retreat),
  // mild through the mid-surf so injected swell reaches the foreshore before dying.
  let Cf = 0.0028 + 0.034 * smoothstep(-0.28, 0.14, b) + 0.026 * smoothstep(0.1, 0.012, hN);
  let sp2 = length(vel);
  if (sp2 > 0.02 && hN > 0.004) {
    vel *= 1.0 / (1.0 + dt * Cf * sp2 / max(hN, 0.02));
  }
  if (length(vel) > 9.0) { vel *= 9.0 / length(vel); }

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

  // Authoritative coastal handoff: Dirichlet on a wide seaward rim so FFT/Gerstner
  // swell injects into the conservative SWE — fluid then carries crash → run-up → retreat.
  // Interior cells stay HLL (no wide soft Gerstner overwrite).
  let off = f32(z) / max(U.nz - 1.0, 1.0);
  let wRow = smoothstep(0.72, 0.96, off);
  let wDepth = smoothstep(0.1, -0.6, b);
  let w = wRow * wDepth;
  if (w > 0.001 && b < 0.6) {
    let depthDrive = max(-b, 0.25);
    let sea = ocean(cellPos(x, z), depthDrive);
    // Shared free-surface η ≈ sea.x (mean-sea frame); depth = η − bed.
    // Crest bias so positive phases push a coherent bore inland (visible run-up).
    let crestGate = smoothstep(0.005, 0.08, sea.x);
    let waveH = max(abs(sea.x) * 2.0, 0.02);
    let depthLim = smoothstep(0.28, 0.55, waveH / max(depthDrive, 0.2));
    let coupleSteep = abs(sea.x) * length(sea.yz) / max(depthDrive, 0.3);
    let steepLim = smoothstep(0.04, 0.28, coupleSteep);
    // Same break family as seaAt/breakerEvt — collapse dumps mass/foam into SWE.
    let brkEvt = max(depthLim, steepLim) * smoothstep(2.8, 0.15, depthDrive) * crestGate;
    let dumpK = 1.0 + 0.55 * brkEvt;
    let hO = max(sea.x * (1.32 + 0.28 * brkEvt) - b, 0.0);
    hN = mix(hN, hO, w);
    vel = mix(vel, sea.yz * (1.38 + 0.45 * brkEvt) * dumpK, w);
    // Foam seed only when the drive crest is tripping — transported by SWE, not painted.
    foamN = mix(foamN, max(foamN, brkEvt * 1.55), w * 0.95 * clamp(brkEvt + 0.15, 0.0, 1.0));
  }
  // Alongshore ends are closed walls (flux already zero outside). Do not destroy
  // mass with a fade — only damp foam that would otherwise pile on the rim.
  if (x < 4u || x + 4u >= NX) {
    let edge = select(f32(x) / 4.0, f32(NX - 1u - x) / 4.0, x + 4u >= NX);
    foamN *= mix(0.35, 1.0, edge);
  }

  var wet = wet0.x;
  wet = max(wet * exp(-dt * 0.08), smoothstep(0.0, 0.03, hN));
  if (b < 0.0) { wet = 1.0; }

  textureStore(dstS, ip, vec4<f32>(hN, vel, foamN));
  textureStore(dstW, ip, vec4<f32>(wet, b, ground, 0.0));
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
  const inland = 18;
  const originX = anchor.x - alongX * nx * dx * 0.5 - seaX * inland;
  const originZ = anchor.z - alongZ * nx * dx * 0.5 - seaZ * inland;
  const bedData = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = originX + alongX * (i + 0.5) * dx + seaX * (j + 0.5) * dx;
      const z = originZ + alongZ * (i + 0.5) * dx + seaZ * (j + 0.5) * dx;
      let h = fieldSample(world, x, z);
      const band = smooth01(1.15, 0.2, h) * smooth01(-1.1, -0.2, h);
      // Cusps and ridges live only in the sim bed. The drawn beach stays smooth,
      // so the run-up fingers without painting contour lines on the sand.
      const cusp = (vnoise(x * 0.11, z * 0.11 + 3.0) - 0.5) * 0.42
        + (vnoise(x * 0.29, z * 0.29 + 8.0) - 0.5) * 0.18;
      const ridge = (vnoise(x * 0.55, z * 0.55) - 0.5) * 0.12;
      const grain = (vnoise(x * 1.9 + 4.0, z * 1.9) - 0.5) * 0.05;
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

  const module = device.createShaderModule({ code: shoreWgsl() });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.lineNum + ':' + e.message).join('\n'));
  const layout = layoutOf(device, GPUShaderStage.COMPUTE, 'tottout');
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipe = (name) => device.createComputePipeline({ layout: pl, compute: { module: module, entryPoint: name } });
  const pipes = { seed: pipe('seed'), step: pipe('shoreStep'), copy: pipe('copy') };

  const ubuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(36);
  u[0] = originX; u[1] = originZ; u[2] = dx; u[3] = nx;
  u[4] = alongX; u[5] = alongZ; u[6] = seaX; u[7] = seaZ;
  u[13] = nz;
  const bedView = bedTex.createView();
  const shape = shapeView;
  const group = (src, dst, srcW, dstW) => groupOf(device, layout, [src.createView(), dst.createView(), bedView, srcW.createView(), dstW.createView(), ubuf, shape]);
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
    // Shore breakers track weather wind strength; couple boost so Dirichlet
    // energy survives mid-surf friction into a readable crash / run-up / retreat.
    u[10] = wp.amp * (typeof env !== 'undefined' ? env.sea : 1) * 1.32;
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
    for (const [pipeline, bg] of steps) {
      p.setPipeline(pipeline);
      p.setBindGroup(0, bg);
      p.dispatchWorkgroups(nx / 8, nz / 8);
    }
    p.end();
  }
  function seed(enc) {
    writeWaves(0, 0.02);
    run(enc, [[pipes.seed, stepBG[0]], [pipes.copy, copyBG[1]]]);
    ping = 1;
  }
  function encode(enc, time, dt) {
    // CFL at dx 0.32 m and a ~8 m/s bore is about 0.016 s. Stay under it.
    // Cap at 3 substeps: at ~30 fps (dt≈0.033) that is still full CFL coverage; allowing
    // 5 on hitch frames made slow frames do more SWE work and dig a deeper hole.
    const n = Math.max(1, Math.min(3, Math.ceil(dt / 0.012)));
    writeWaves(time, dt / n);
    const steps = [];
    for (let s = 0; s < n; s++) {
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
    seed: seed,
    encode: encode
  };
}
