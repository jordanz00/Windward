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

fn hash21s(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn rot2(p: vec2<f32>) -> vec2<f32> {
  let cs = cos(U.dir);
  let sn = sin(U.dir);
  return vec2<f32>(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
}
fn oceanSample(xz: vec2<f32>) -> f32 {
  let p = fract(rot2(xz) / 220.0) * 128.0;
  let i = vec2<i32>(floor(p));
  let f = fract(p);
  let x0 = i.x & 127;
  let y0 = i.y & 127;
  let x1 = (i.x + 1) & 127;
  let y1 = (i.y + 1) & 127;
  let a = textureLoad(shapeTex, vec2<i32>(x0, y0), 0).x;
  let b = textureLoad(shapeTex, vec2<i32>(x1, y0), 0).x;
  let c = textureLoad(shapeTex, vec2<i32>(x0, y1), 0).x;
  let d = textureLoad(shapeTex, vec2<i32>(x1, y1), 0).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
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
fn ocean(xz: vec2<f32>) -> vec3<f32> {
  var eta = oceanSample(xz);
  var vel = vec2<f32>(0.0);
  let frq = max(U.frq, 0.2);
  for (var i = 0; i < 4; i++) {
    let w = U.waves[i];
    let dir = rot2(w.xy);
    let len = w.w / frq;
    let k = 6.2831853 / len;
    var As = w.z * U.amp;
    if (i >= 3) { As *= 0.22; }
    let Q = steepOf(i);
    let st = k * As * Q;
    if (st > 0.72) { As *= 0.72 / st; }
    let omega = sqrt(9.81 * k) * U.spd;
    let phase = k * dot(dir, xz) - omega * U.time;
    let s = sin(phase);
    eta += As * s;
    vel += dir * Q * As * s * omega;
  }
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
fn sampleS(xz: vec2<f32>) -> vec4<f32> {
  let d = xz - U.origin;
  let fi = dot(d, U.along) / U.dx - 0.5;
  let fj = dot(d, U.sea) / U.dx - 0.5;
  let x0 = clamp(i32(floor(fi)), 0, i32(NX) - 1);
  let z0 = clamp(i32(floor(fj)), 0, i32(NZ) - 1);
  let x1 = min(x0 + 1, i32(NX) - 1);
  let z1 = min(z0 + 1, i32(NZ) - 1);
  let f = fract(vec2<f32>(fi, fj));
  let a = textureLoad(srcS, vec2<i32>(x0, z0), 0);
  let b = textureLoad(srcS, vec2<i32>(x1, z0), 0);
  let c = textureLoad(srcS, vec2<i32>(x0, z1), 0);
  let dS = textureLoad(srcS, vec2<i32>(x1, z1), 0);
  return mix(mix(a, b, f.x), mix(c, dS, f.x), f.y);
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
  let bed = textureLoad(bedTex, ip, 0);
  let b = bed.x;
  let drive = bed.y;
  let xz = cellPos(x, z);
  let sea = ocean(xz);

  if (drive > 0.82 || b > 2.4) {
    var h0 = 0.0;
    var vel0 = vec2<f32>(0.0);
    if (b < 1.5) {
      h0 = max(sea.x - b, 0.0);
      vel0 = sea.yz;
    }
    let prevF = textureLoad(srcS, ip, 0).w * 0.92;
    textureStore(dstS, ip, vec4<f32>(h0, vel0, prevF));
    textureStore(dstW, ip, vec4<f32>(select(0.0, 1.0, h0 > 0.02 || b < 0.0), b, 0.0, 0.0));
    return;
  }

  let c = textureLoad(srcS, ip, 0);
  let l = at(ip.x - 1, ip.y);
  let r = at(ip.x + 1, ip.y);
  let dwn = at(ip.x, ip.y - 1);
  let up = at(ip.x, ip.y + 1);
  let bl = bedAt(ip.x - 1, ip.y).x;
  let br = bedAt(ip.x + 1, ip.y).x;
  let bd = bedAt(ip.x, ip.y - 1).x;
  let bu = bedAt(ip.x, ip.y + 1).x;
  let gx = ((br + r.x) - (bl + l.x)) / (2.0 * U.dx);
  let gz = ((bu + up.x) - (bd + dwn.x)) / (2.0 * U.dx);
  let slope = clamp(vec2<f32>(gx, gz), vec2<f32>(-0.85), vec2<f32>(0.85));
  let steep = length(vec2<f32>(gx, gz));

  var vel = c.yz;
  // A dry cell has no velocity of its own, so it would never sample the water
  // arriving from offshore. Borrow the deepest neighbor's velocity first.
  if (c.x < 0.025) {
    var donor = c.x;
    var donorV = vel;
    if (l.x > donor) { donor = l.x; donorV = l.yz; }
    if (r.x > donor) { donor = r.x; donorV = r.yz; }
    if (dwn.x > donor) { donor = dwn.x; donorV = dwn.yz; }
    if (up.x > donor) { donor = up.x; donorV = up.yz; }
    if (donor > 0.03) { vel = donorV; }
  }
  let back = xz - vel * U.dt;
  let adv = sampleS(back);
  var h = max(adv.x, 0.0);
  vel = mix(vel, adv.yz, smoothstep(0.0, 0.04, adv.x));
  var foam = adv.w;

  let gworld = U.along * slope.x + U.sea * slope.y;
  vel -= gworld * 9.81 * U.dt;

  let vl = vec2<f32>(dot(l.yz, U.along), dot(l.yz, U.sea));
  let vr = vec2<f32>(dot(r.yz, U.along), dot(r.yz, U.sea));
  let vd = vec2<f32>(dot(dwn.yz, U.along), dot(dwn.yz, U.sea));
  let vu = vec2<f32>(dot(up.yz, U.along), dot(up.yz, U.sea));
  let div = (vr.x - vl.x + vu.y - vd.y) / (2.0 * U.dx);
  h = max(h - h * clamp(div, -6.0, 6.0) * U.dt, 0.0);

  let shallow = smoothstep(1.5, 0.08, max(-b, 0.0));
  let brk = smoothstep(0.10, 0.38, steep) * shallow * smoothstep(0.008, 0.05, h);
  let spd = length(vel);
  let rush = smoothstep(0.35, 1.3, spd) * smoothstep(-0.08, 0.12, b) * smoothstep(0.004, 0.035, h);
  foam = min(foam + brk * 1.8 * U.dt, 1.0);
  // The lip of the sheet foams. The body of the wash is allowed to thin and clear.
  let lip = smoothstep(0.01, 0.035, h) * smoothstep(0.14, 0.045, h) * smoothstep(0.35, 1.2, spd);
  foam = min(foam + (lip * 0.9 + rush * 0.35) * U.dt, 1.0);
  // A breaking crest is nudged toward a bore. Added as a target speed, not an
  // acceleration, so it cannot flood the beach a little more every step.
  let wob = hash21s(xz * 0.37) - 0.5;
  let bore = -U.sea * 2.3 + U.along * wob * 0.9;
  let push = brk * smoothstep(0.55, -0.05, b);
  vel = mix(vel, bore, push * 0.45);
  if (b > -0.02) { h = min(h, mix(0.16, 0.05, smoothstep(0.05, 0.55, b))); }
  if (b > 0.02 && c.x < 0.02) { h = min(h, 0.045); }
  let melt = mix(0.25, 0.7, smoothstep(-0.02, 0.2, b) * (1.0 - brk));
  foam *= exp(-U.dt * melt);
  vel *= exp(-brk * 0.45 * U.dt);
  if (b > 0.62) {
    vel *= exp(-3.0 * U.dt);
    h *= exp(-1.5 * U.dt);
  }

  var drag = 0.08;
  if (b > -0.02) { drag += 0.14; }
  vel *= exp(-drag * U.dt);
  vel *= exp(-min(foam, 1.0) * 0.8 * U.dt);
  let sp2 = length(vel);
  if (sp2 > 4.2) { vel *= 4.2 / sp2; }

  if (h < 0.007 && b > -0.04) {
    h = 0.0;
    vel = vec2<f32>(0.0);
  }
  h = min(h, 2.8);

  if (drive > 0.02) {
    let etaT = max(sea.x - b, 0.0);
    h = mix(h, etaT, drive);
    vel = mix(vel, sea.yz, drive);
  }
  if (x < 5u || x + 5u >= NX) {
    let fade = select(f32(x) / 5.0, f32(NX - 1u - x) / 5.0, x + 5u >= NX);
    h *= fade;
    vel *= fade;
    foam *= fade;
  }
  if (z < 3u) {
    h *= f32(z) / 3.0;
    vel *= f32(z) / 3.0;
  }

  var wet = textureLoad(srcW, ip, 0).x;
  wet = max(wet * exp(-U.dt * 0.1), smoothstep(0.0, 0.028, h));
  if (b < 0.0) { wet = 1.0; }

  textureStore(dstS, ip, vec4<f32>(h, vel, foam));
  textureStore(dstW, ip, vec4<f32>(wet, b, 0.0, 0.0));
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

async function createShore(device, world, anchor, shapeView) {
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
      const ridge = (vnoise(x * 0.47, z * 0.47) - 0.5) * 0.08;
      const grain = (vnoise(x * 1.8 + 4.0, z * 1.8) - 0.5) * 0.025;
      h += (ridge + grain) * band;
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
  const showS = device.createTexture({ size: [nx, nz], format: 'rgba16float', usage: simUsage });
  const showW = device.createTexture({ size: [nx, nz], format: 'rgba16float', usage: simUsage });

  const module = device.createShaderModule({ code: shoreWgsl() });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(errs.map((e) => e.lineNum + ':' + e.message).join('\n'));
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } }
    ]
  });
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
  const group = (src, dst, srcW, dstW) => device.createBindGroup({
    layout: layout,
    entries: [
      { binding: 0, resource: src.createView() },
      { binding: 1, resource: dst.createView() },
      { binding: 2, resource: bedView },
      { binding: 3, resource: srcW.createView() },
      { binding: 4, resource: dstW.createView() },
      { binding: 5, resource: { buffer: ubuf } },
      { binding: 6, resource: shape }
    ]
  });
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
    u[10] = wp.amp;
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
  function dispatch(enc, pipeline, bg) {
    const p = enc.beginComputePass();
    p.setPipeline(pipeline);
    p.setBindGroup(0, bg);
    p.dispatchWorkgroups(nx / 8, nz / 8);
    p.end();
  }
  function seed(enc) {
    writeWaves(0, 0.02);
    dispatch(enc, pipes.seed, stepBG[0]);
    dispatch(enc, pipes.copy, copyBG[1]);
    ping = 1;
  }
  function encode(enc, time, dt) {
    const sub = 2;
    const hdt = Math.max(0.004, Math.min(dt, 0.05)) / sub;
    for (let s = 0; s < sub; s++) {
      writeWaves(time, hdt);
      dispatch(enc, pipes.step, stepBG[ping]);
      ping = 1 - ping;
    }
    dispatch(enc, pipes.copy, copyBG[ping]);
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
