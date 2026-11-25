// The sky's own machinery. Four things are kept on the GPU and everything that looks at the
// sky, or stands under it, reads them:
//   a block of tiling noise, made once, that every cloud is carved from;
//   a weather map: for each place, how much cloud its air holds and how deep that cloud grows;
//   a shadow map: how much sunlight is left under the cloud, for the ground, the sea and the air;
//   the panorama: air and cloud as seen from where the camera stands, baked a strip a frame.
// The WGSL for the last three is with the other shaders; this is the noise and the scheduling.

const SKY_NOISE_N = 96;
// Tiling Perlin and Worley noise. Each channel is stretched to fill 0..1 with its middle at a half,
// so a threshold on it means a share of the sky. r: billows, Perlin lifted by Worley. g, b: cells
// at two finer scales. a: smooth, for the slow fields and for bending the others.
const SKY_NOISE_WGSL = `
@group(0) @binding(0) var dst: texture_storage_3d<rgba8unorm, write>;
const N: f32 = ${SKY_NOISE_N}.0;
fn h3(p: vec3<u32>) -> vec3<f32> {
  var v = p * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3<u32>(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3<f32>(v) * (1.0 / 4294967296.0);
}
fn cellPt(c: vec3<i32>, f: i32, seed: u32) -> vec3<f32> {
  let m = vec3<u32>((c % f + f) % f);
  return h3(m + vec3<u32>(seed * 131u + 7u, seed * 17u + 3u, seed * 61u + 11u));
}
fn worley(p: vec3<f32>, f: i32, seed: u32) -> f32 {
  let q = p * f32(f);
  let i = vec3<i32>(floor(q));
  let fr = fract(q);
  var d = 1.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let o = vec3<i32>(x, y, z);
        let r = vec3<f32>(o) + cellPt(i + o, f, seed) - fr;
        d = min(d, dot(r, r));
      }
    }
  }
  return 1.0 - min(sqrt(d), 1.0);
}
fn perlin(p: vec3<f32>, f: i32, seed: u32) -> f32 {
  let q = p * f32(f);
  let i = vec3<i32>(floor(q));
  let fr = fract(q);
  let u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  var v: array<f32, 8>;
  for (var k = 0; k < 8; k++) {
    let o = vec3<i32>(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    let g = normalize(cellPt(i + o, f, seed) * 2.0 - 1.0 + vec3<f32>(1e-4));
    v[k] = dot(g, fr - vec3<f32>(o));
  }
  return mix(mix(mix(v[0], v[1], u.x), mix(v[2], v[3], u.x), u.y), mix(mix(v[4], v[5], u.x), mix(v[6], v[7], u.x), u.y), u.z);
}
fn fit(x: f32, mid: f32, half: f32) -> f32 { return clamp(0.5 + (x - mid) / (2.0 * half), 0.0, 1.0); }
@compute @workgroup_size(4, 4, 4) fn noise(@builtin(global_invocation_id) id: vec3<u32>) {
  let p = (vec3<f32>(id) + 0.5) / N;
  let pf = perlin(p, 4, 1u) + 0.5 * perlin(p, 8, 2u) + 0.25 * perlin(p, 16, 3u);
  let wf = worley(p, 4, 4u) * 0.625 + worley(p, 8, 5u) * 0.25 + worley(p, 16, 6u) * 0.125;
  let pw = wf + clamp(0.5 + pf * 0.9, 0.0, 1.0) * (1.0 - wf);
  let g = worley(p, 8, 7u) * 0.65 + worley(p, 16, 8u) * 0.35;
  let b = worley(p, 16, 9u) * 0.65 + worley(p, 32, 10u) * 0.35;
  let a = perlin(p, 2, 11u) + 0.5 * perlin(p, 4, 12u) + 0.25 * perlin(p, 8, 13u);
  textureStore(dst, vec3<i32>(id), vec4<f32>(fit(pw, NORM_R), fit(g, NORM_G), fit(b, NORM_B), fit(a, NORM_A)));
}`;
// Measured middle and half-range of each raw channel (2nd to 98th percentile).
const SKY_NOISE_NORM = { NORM_R: '0.704, 0.245', NORM_G: '0.484, 0.253', NORM_B: '0.483, 0.259', NORM_A: '0.0, 0.5' };

function createSky(device, o) {
  const N = SKY_NOISE_N, W = o.dim[0], H = o.dim[1], NS = o.dim[2], CSN = o.dim[3], WXN = 512;
  const T = GPUTextureUsage;
  const noise = device.createTexture({ size: [N, N, N], dimension: '3d', format: 'rgba8unorm', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING | T.COPY_SRC });
  {
    const code = SKY_NOISE_WGSL.replace(/NORM_[RGBA]/g, (k) => (o.norm || SKY_NOISE_NORM)[k]);
    const pipe = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: code }), entryPoint: 'noise' } });
    const enc = device.createCommandEncoder(), cp = enc.beginComputePass();
    cp.setPipeline(pipe);
    cp.setBindGroup(0, device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: noise.createView() }] }));
    cp.dispatchWorkgroups(N / 4, N / 4, N / 4);
    cp.end();
    device.queue.submit([enc.finish()]);
  }
  // Two panoramas, as two layers of one texture. Each strip of sky is baked into one and then
  // the other, and what is shown leans on whichever is further from being replaced. A small
  // mip of the first layer holds the sky gathered coarsely, for lighting things by it.
  const pano = device.createTexture({ size: [W, H, 2], mipLevelCount: 5, format: o.format, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC | T.COPY_DST });
  const layer = (i, mip) => pano.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1, baseMipLevel: mip, mipLevelCount: 1 });
  const wx = targetOf(device, WXN, WXN, o.format).createView(), shade = targetOf(device, CSN, CSN, o.format).createView();
  const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
  const nv = noise.createView();
  const L = o.layouts;
  const groups = [groupOf(device, L[0], [nv, samp], 8), groupOf(device, L[1], [nv, samp, wx], 8), groupOf(device, L[2], [nv, samp, wx, shade], 8),
    groupOf(device, L[3], [null, samp, null, null, pano.createView({ dimension: '2d-array', mipLevelCount: 1 })], 8)];
  // The gathered sky again, as a source: only the small mip, so the mip beside it can be drawn into.
  const irrGroup = groupOf(device, L[3], [null, samp, null, null, pano.createView({ dimension: '2d-array', baseMipLevel: 4, mipLevelCount: 1 })], 8);
  const wxPass = passOf(wx), shadePass = passOf(shade), panoPass = [passOf(layer(0, 0)), passOf(layer(1, 0))], dimPass = passOf(layer(0, 4)), irrPass = passOf(layer(0, 3));
  let count = -1, todo = 0, tick = 0;
  return {
    view: pano.createView({ dimension: '2d-array' }), shade: shade, wx: wx, noise: noise, samp: samp, nSamp: samp, pano: pano,
    // Bake everything again, at once: the weather was set, not drifted into.
    reset() { count = -1; },
    // Decide how many strips this frame bakes and tell the shaders where the blend stands.
    // `pace` asks for more when the light, the weather or the camera is moving quickly.
    plan(arr, pace) {
      todo = count < 0 ? NS : Math.max(1, Math.min(NS >> 2, pace | 0));
      arr[232] = (count < 0 ? NS : count + todo) % (NS * 2); arr[233] = NS;
      arr[234] = (Math.max(1, Math.min(NS >> 2, pace)) + 2.5) / NS;
      arr[236] = W; arr[237] = H;
    },
    encode(enc, pipes, ub) {
      if (!pipes.skyBake || !pipes.weather || !pipes.cloudShadow || !pipes.skyDim) return;
      const one = (pass, pipe, group, k) => {
        const p = enc.beginRenderPass(pass);
        p.setPipeline(pipe); p.setBindGroup(0, ub); p.setBindGroup(1, group);
        if (k) p.setBlendConstant([k, k, k, k]);
        p.draw(3); p.end();
      };
      const first = count < 0;
      // The weather and its shadow drift a few centimetres a frame: every fourth frame is enough.
      if (first || (tick++ & 3) === 0) {
        one(wxPass, pipes.weather, groups[0]);
        one(shadePass, pipes.cloudShadow, groups[1]);
      }
      if (first) count = 0;
      const sw = W / NS;
      while (todo > 0) {
        const s = count % NS, run = Math.min(todo, NS - s);
        const p = enc.beginRenderPass(panoPass[(count / NS) | 0]);
        p.setPipeline(pipes.skyBake); p.setBindGroup(0, ub); p.setBindGroup(1, groups[2]);
        p.setScissorRect(s * sw, 0, run * sw, H);
        p.draw(3); p.end();
        count = (count + run) % (NS * 2); todo -= run;
      }
      if (first) enc.copyTextureToTexture({ texture: pano }, { texture: pano, origin: [0, 0, 1] }, [W, H, 1]);
      one(dimPass, pipes.skyDim, groups[3], first ? 1 : 0.15);
      // What the whole sky sheds on a surface facing each way: a corner of the next mip.
      if (pipes.skyIrr) {
        const p = enc.beginRenderPass(irrPass);
        p.setPipeline(pipes.skyIrr); p.setBindGroup(0, ub); p.setBindGroup(1, irrGroup);
        p.setViewport(0, 0, 34, 16, 0, 1); p.setScissorRect(0, 0, 34, 16);
        p.draw(3); p.end();
      }
    }
  };
}

// The sky's shaders: air, weather, cloud, the light under it. Distances here are kilometres.
function skyWGSL() {
  return `
// ---- Sky. The panorama holds the air and the clouds as seen from where the camera stands.
// u is azimuth; v is elevation, with most of its rows near the horizon. Two copies are kept,
// baked alternately a strip at a time, and what is read is a blend of the two.
const SKY_E0: f32 = 0.05;
const RE: f32 = 6360.0;
// How far from the island the weather map and the cloud-shadow map have half their texels.
const WX_K: f32 = 30.0;
const CS_K: f32 = 5.0;
// Extinction of full cloud per kilometre, the width of one tile of cloud noise, and the cirrus level.
const C_SIG: f32 = 45.0;
const C_TILE: f32 = 9.6;
const C_HIGH: f32 = 12.0;
const BR = vec3<f32>(5.8e-3, 13.5e-3, 33.1e-3);
// Ozone takes green out of the long horizontal paths, which keeps the horizon from going teal.
const BO = vec3<f32>(1.3e-3, 3.8e-3, 0.2e-3);
fn mieB() -> f32 { return 23.1e-3 * mix(0.7, 2.4, sat(F.mood.z)); }
fn skyUV(rd: vec3<f32>) -> vec2<f32> {
  let el = asin(clamp(rd.y, -1.0, 1.0));
  let v = sqrt(sat((el + SKY_E0) / (1.5708 + SKY_E0)));
  let e = 0.5 / F.skyD.y;
  return vec2<f32>(atan2(rd.z, rd.x) / 6.2831853 + 0.5, clamp(v, e, 1.0 - e));
}
// A strip counts for most when it is half way between two bakes and for nothing while it is
// being replaced, so no bake is ever seen arriving.
fn skyBlend(t: texture_2d_array<f32>, s: sampler, uv: vec2<f32>) -> vec4<f32> {
  let ns = F.skyS.y;
  let ph = fract((F.skyS.x - fract(uv.x) * ns - 0.5) / (2.0 * ns));
  let w = sat((1.0 - abs(2.0 * ph - 1.0) - F.skyS.z) / (1.0 - 2.0 * F.skyS.z));
  return mix(textureSampleLevel(t, s, uv, 1, 0.0), textureSampleLevel(t, s, uv, 0, 0.0), w);
}

// The air a ray of sunlight has crossed to reach height h, in scale heights of that air:
// Chapman's function, which stays right when the sun is on the horizon or under it. X is the
// earth's radius and h the height, both in scale heights; c is the cosine of the sun's zenith angle.
fn chap(X: f32, h: f32, c: f32) -> f32 {
  let q = sqrt(X + h);
  if (c >= 0.0) { return q / (q * c + 1.0) * exp(-h); }
  let x0 = sqrt(1.0 - c * c) * (X + h);
  return 2.0 * sqrt(x0) * exp(min(X - x0, 60.0)) - q / (1.0 - q * c) * exp(-h);
}
fn sunDepth(h: f32, c: f32) -> vec3<f32> {
  return (BR + BO) * (8.0 * chap(795.0, h / 8.0, c)) + vec3<f32>(mieB() * 1.2 * chap(5300.0, h / 1.2, c));
}
// What is left of sunlight at height h. It reddens and fails as the sun goes down, and the
// ground loses it before the cloud tops do.
fn sunT(h: f32, c: f32) -> vec3<f32> { return exp(-min(sunDepth(max(h, 0.0), c), vec3<f32>(60.0))); }
fn airHit(p: vec3<f32>, d: vec3<f32>) -> f32 {
  let b = dot(p, d);
  return -b + sqrt(max(b * b - dot(p, p) + 6420.0 * 6420.0, 0.0));
}
fn sat3(x: vec3<f32>) -> vec3<f32> { return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0)); }
fn hg(mu: f32, g: f32) -> f32 { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5); }
struct Air { c: vec3<f32>, t: vec3<f32> }
// Rayleigh and Mie scattering along a ray from height h0 out through the shell of air:
// the light scattered toward the eye, and how much of what lies beyond comes through.
fn atmosphere(rd: vec3<f32>, h0: f32) -> Air {
  let bM = mieB();
  let d = normalize(vec3<f32>(rd.x, max(rd.y, 0.0), rd.z));
  let o = vec3<f32>(0.0, RE + h0, 0.0);
  let tmax = airHit(o, d);
  var od = vec2<f32>(0.0);
  var sR = vec3<f32>(0.0);
  var sM = vec3<f32>(0.0);
  var sS = vec3<f32>(0.0);
  for (var i = 0; i < 16; i++) {
    // Steps grow with distance, so the dense air near the ground is resolved.
    let f0 = pow(f32(i) / 16.0, 2.0);
    let f1 = pow(f32(i + 1) / 16.0, 2.0);
    let p = o + d * tmax * (f0 + f1) * 0.5;
    let r = length(p);
    let h = max(r - RE, 0.0);
    let dn = vec2<f32>(exp(-h / 8.0), exp(-h / 1.2)) * tmax * (f1 - f0);
    od += dn * 0.5;
    let view = (BR + BO) * od.x + bM * od.y;
    let sun = sunDepth(h, dot(p, F.sunTrue.xyz) / r);
    let att = exp(-min(view + sun, vec3<f32>(60.0)));
    sR += att * dn.x;
    sM += att * dn.y;
    // Light scattered more than once has come by many paths and lost less on the way. But
    // it began as sunlight, and where the sun's own path is long enough to have taken most
    // of a colour, the paths round it are long too: the dome dims and loses its blue with
    // a low sun, as it is measured to, and does not stay a midday blue over a red one.
    sS += exp(-min(view + sun * 0.4 + max(sun - vec3<f32>(1.0), vec3<f32>(0.0)) * 0.6, vec3<f32>(60.0))) * (BR * dn.x + bM * dn.y);
    od += dn * 0.5;
  }
  let mu = dot(d, F.sunTrue.xyz);
  let pR = 0.0597 * (1.0 + mu * mu);
  let g = 0.8;
  let pM = 0.1194 * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  var a: Air;
  // disc is the sun as the light it puts on a matt white surface, so its light scattered once
  // is pi times the sums. The rest of the factor stands for the light that reaches the eye after
  // several scatterings, which this sum leaves out: with it the sky sheds on level ground about
  // a quarter of what the high sun does, as it is measured to. The forward glare round the sun
  // is nearly all first scattering and is not raised by it.
  // Multi-scatter term lifted slightly at low sun so the dome stays softly luminous
  // without bleaching midday blue (sS already carries sun-path reddening).
  let ms = mix(0.02, 0.028, sat(F.day.w));
  a.c = F.disc.rgb * 5.6 * (sR * BR * pR + sM * bM * pM * 0.44 + sS * ms);
  a.t = exp(-((BR + BO) * od.x + bM * od.y));
  return a;
}
// The mean density of air between two heights, as a share of its density at the sea.
fn layerMean(a: f32, b: f32, H: f32) -> f32 {
  let x = (b - a) / H;
  let e = exp(-a / H);
  if (abs(x) < 1e-3) { return e; }
  return e * (1.0 - exp(-x)) / x;
}
// How much of a thing t away at height hb reaches an eye at height ha.
fn pathKeep(t: f32, ha: f32, hb: f32) -> vec3<f32> {
  return exp(-t * ((BR + BO) * layerMean(ha, hb, 8.0) + vec3<f32>(mieB() * layerMean(ha, hb, 1.2))));
}
// Distance along a ray to the height dh above its start, and the height gained after t,
// over a round earth. b is the ray's climb times Rc, the start's distance from the centre.
fn shellT(b: f32, Rc: f32, dh: f32) -> f32 {
  let cc = dh * (2.0 * Rc + dh);
  let sq = sqrt(b * b + cc);
  return select(-b + sq, cc / (b + sq), b >= 0.0);
}
// Distance to a shell dh above the start, or -1 when that shell is not ahead.
// shellT is the historical form and is kept for the view from under the clouds;
// this one refuses a negative discriminant, which is what a camera inside or
// above the deck would hand it.
fn shellAhead(b: f32, Rc: f32, dh: f32) -> f32 {
  if (abs(dh) < 1e-5) { return 0.0; }
  let cc = dh * (2.0 * Rc + dh);
  let disc = b * b + cc;
  if (disc <= 0.0) { return -1.0; }
  let sq = sqrt(disc);
  let t = select(-b + sq, cc / max(b + sq, 1e-5), b >= 0.0);
  if (t >= 0.0) { return t; }
  return -1.0;
}
fn riseAt(b: f32, Rc: f32, t: f32) -> f32 {
  let x = 2.0 * b * t + t * t;
  return x / (sqrt(Rc * Rc + x) + Rc);
}

// ---- Weather. One map for the whole sky, centred on the island and coarser with distance.
// r: how much of the air here holds cumulus. g: a convective tower, 1 at its core.
// b: the anvil spread from a tower's top. a: the stratocumulus deck.
fn nz(p: vec3<f32>) -> vec4<f32> { return textureSampleLevel(noiseTex, nSamp, p, 0.0); }
fn wxAt(g: vec2<f32>) -> vec4<f32> { return textureSampleLevel(wxMap, nSamp, g / (length(g) + WX_K) * 0.5 + 0.5, 0.0); }
fn mapPlace(ndc: vec2<f32>, k: f32) -> vec2<f32> {
  let q = ndc * vec2<f32>(1.0, -1.0);
  let l = length(q);
  let m = min(l, 0.992);
  return q / max(l, 1e-5) * (k * m / (1.0 - m));
}
@fragment fn fsWeather(in: SkyV) -> @location(0) vec4<f32> {
  let g = mapPlace(in.ndc, WX_K);
  let evo = F.cldB.w;
  let gd = g + F.windOff.xy;
  // Moist and dry provinces a hundred kilometres across, and clusters within them.
  let prov = nz(vec3<f32>(gd / 288.0, evo)).a;
  let cl = nz(vec3<f32>(gd / 72.0 + vec2<f32>(0.37, 0.11), evo * 3.0 + 0.5));
  let cum = F.cldA.x;
  // Moist provinces run a little larger than the dry ones, so a fair day still has
  // scattered cumulus and a cloudy day has fields of it, with holes either way.
  let moist = (prov - 0.4) * 1.05 + (cl.a - 0.46) * 0.7;
  let c = sat(cum * 1.2 + 0.06 + moist * (0.4 + cum));
  let dn = nz(vec3<f32>((g + F.cldC.zw) / 144.0 + vec2<f32>(0.61, 0.23), evo * 2.0 + 0.25)).a;
  let dk = F.cldB.y;
  // A small deck amount is a broken layer. Only a high amount closes the gaps.
  let deck = sat(dk * 1.15 + (dn - 0.42) * (0.35 + dk) - 0.08 * (1.0 - dk));
  // Towers stand on a loose grid of sites. Each grows, spreads an anvil downwind and rains
  // out, on its own clock, and unstable air fills more of the sites.
  let gw = g + F.skyD.zw + (cl.ar - 0.5) * 9.0;
  let cell = floor(gw / 36.0);
  var body = 0.0;
  var anv = 0.0;
  var sink = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let id = cell + vec2<f32>(f32(i), f32(j));
      let m = id - 8.0 * floor(id / 8.0);
      let h = hash22(m * 1.37 + 17.3);
      let k = hash22(m * 2.11 + 5.7);
      let ctr = (id + 0.15 + 0.7 * h) * 36.0;
      let life = fract(k.x + evo * 4.0);
      let grow = smoothstep(0.0, 0.35, life) * smoothstep(1.0, 0.8, life);
      let there = sat((F.cldA.y * 1.25 - 0.22 - k.y * 0.65) * 4.0);
      // A gap over the island, narrower than the old one, so towers stand offshore.
      // Rain fills it. The thundercloud pass darkens these towers; it does not add more.
      let clear = mix(smoothstep(3.5, 12.0, length(ctr - F.skyD.zw)), 1.0, sat(F.wx.x * 2.0));
      let s = grow * there * clear * (0.62 + 0.38 * h.x);
      let R = mix(5.0, 10.0, h.y);
      let dr = length(gw - ctr) / R;
      body = max(body, s * (1.0 - smoothstep(0.12, 1.0, dr)));
      // Air sinks round a tower, and the small cloud there dries out.
      sink = max(sink, s * (1.0 - smoothstep(1.0, 3.2, dr)));
      let am = smoothstep(0.7, 0.86, s) * smoothstep(0.4, 0.75, life);
      let da = length(gw - ctr - vec2<f32>(0.7071) * R * (0.4 + 0.9 * am)) / (R * (0.8 + 1.0 * am));
      anv = max(anv, am * (1.0 - smoothstep(0.35, 1.0, da)));
    }
  }
  return vec4<f32>(c * (1.0 - 0.5 * sink), body, anv, deck);
}
// Whether any cloud can stand in this column at this height. The march takes long strides
// wherever this says no.
fn cloudMay(w: vec4<f32>, y: f32) -> bool {
  let rel = y - F.cldA.z;
  let hT = rel / (F.cldA.w - F.cldA.z);
  let inCol = hT >= 0.0 && hT <= 1.0;
  let hD = (y - F.cldB.z) / F.cldE.z;
  let cir = y > C_HIGH - 0.22 && y < C_HIGH + 0.5;
  if (!inCol && !cir) { return false; }
  return (inCol && w.r > 0.08 && rel < F.skyS.w * (0.55 + 1.15 * w.r))
    || (inCol && w.g > 0.16 && hT < pow(max(w.g - 0.14, 0.0) / 0.45, 1.2))
    || (inCol && w.b > 0.08 && hT > 0.7)
    || (inCol && w.a > 0.08 && hD > 0.0 && hD < 1.0)
    || (cir && F.cldB.x > 0.02);
}
// World-space sample point for density: lean with height, rise of billows, and a slow
  // domain warp so shapes evolve instead of rigidly scrolling with the wind.
fn cloudQ(p: vec3<f32>) -> vec3<f32> {
  let rel = p.y - F.cldA.z;
  var q = vec3<f32>(p.x + F.windOff.x + F.cldE.x * rel, p.y - F.cldE.w, p.z + F.windOff.y + F.cldE.y * rel) / C_TILE;
  let evo = F.cldB.w;
  let warp = nz(vec3<f32>(q.x * 0.31 + 0.17, q.y * 0.22 + evo * 1.7, q.z * 0.31 + 0.41));
  let w2 = nz(vec3<f32>(q.z * 0.55 + 0.7, evo * 2.4 + 0.3, q.x * 0.55 + 0.2));
  q += vec3<f32>((warp.a - 0.5) * 0.42 + (w2.a - 0.5) * 0.18, (warp.r - 0.5) * 0.12, (warp.a - 0.5) * 0.34 + (w2.r - 0.5) * 0.16);
  return q;
}
// Soft density remapping: coverage lowers the bar, gain keeps a steep opaque core.
fn cloudRemap(n: f32, cov: f32, gain: f32) -> f32 {
  return sat((n - 1.0 + cov) * gain);
}
// Cloud at a place, from the weather there. Each family has its own profile with height,
// and one Perlin–Worley field carves them all. fine adds the small scale, for what the eye
// sees; light and shadow use the cloud without it.
fn cloudDenW(p: vec3<f32>, w: vec4<f32>, fine: f32) -> f32 {
  let rel = p.y - F.cldA.z;
  let hT = rel / max(F.cldA.w - F.cldA.z, 0.05);
  let q = cloudQ(p);
  let n0 = nz(q);
  let n1 = nz(q * 2.15 + vec3<f32>(0.19, 0.07, 0.33));
  // Billows: coarse Perlin–Worley lifted by a mid octave so crowns are cauliflower, not balls.
  let s = n0.r * 0.72 + n1.r * 0.28;
  // d: how full the cloud is here, 0 to 1. k: how dense that kind of cloud is when full.
  // cut: how much of the fine scale it takes.
  var d = 0.0;
  var k = 1.0;
  var cut = 1.0;
  // Cumulus: flat base at the condensation level, widest there, narrowing to a rounded crown.
  let h1 = rel / (F.skyS.w * (0.55 + 1.15 * w.r));
  if (w.r > 0.02 && h1 > 0.0 && h1 < 1.0) {
    let base = smoothstep(0.0, 0.045, h1) * smoothstep(1.0, 0.7, h1);
    let width = 1.0 - 0.55 * pow(h1, 1.2);
    // Lateral puff: billows thicken the core so the cloud reads as a 3D mass, not a sheet.
    let puff = sat(0.55 + (s - 0.5) * 0.9 + (n0.a - 0.5) * 0.35);
    let cov = w.r * width * (1.05 + 0.2 * n0.a) * puff;
    d = cloudRemap(s, cov * 1.18, 4.2) * base;
  }
  // Cumulonimbus towers: a column that tapers as it climbs, billows pushing the sides.
  if (w.g > 0.14 && hT > 0.0 && hT < 1.0) {
    let m = w.g + (s - 0.5) * 0.22 + (n1.a - 0.5) * 0.1;
    let taper = 0.28 + 0.42 * pow(hT, 0.75);
    let f = sat((m - taper) * 6.2) * smoothstep(0.0, 0.025, hT) * smoothstep(1.0, 0.96, hT);
    if (f > d) { d = f; k = 1.45; }
  }
  // Anvil: thin ice shelf under the tropopause. Storms build a real shelf; fair weather a sheet.
  if (w.b > 0.02 && hT > 0.68 && hT < 1.0) {
    let f = cloudRemap(s * 0.55 + n0.a * 0.45, w.b * 0.95 + 0.18, 2.6)
      * smoothstep(0.68, 0.8, hT) * smoothstep(1.0, 0.92, hT);
    if (f > d) { d = f; k = mix(0.36, 0.78, sat(F.mood.y * F.wx.x)); cut = 0.2; }
  }
  // Altocumulus: a broken band well above the trade cumulus, not a second deck.
  let yA = (p.y - 2.7) / 1.45;
  if (yA > 0.0 && yA < 1.0 && hT > 0.0 && hT < 1.0 && w.a > 0.12) {
    let nA = nz(vec3<f32>((p.x + F.cldC.x) / 22.0, p.y / 2.2 + 0.2 + F.cldB.w, (p.z + F.cldC.y) / 22.0));
    let covA = sat(w.r * 0.5 + F.cldB.x * 0.4) * sat(6.0 * yA * (1.0 - yA));
    let fA = cloudRemap(nA.r * 0.7 + nA.a * 0.3, covA * 0.95 + 0.08, 3.1);
    if (fA > d) { d = fA; k = 0.42; cut = 0.32; }
  }
  // Stratocumulus deck: broad shallow cells with soft breaks and vertical heave between them.
  let hD = (p.y - F.cldB.z) / max(F.cldE.z, 0.05);
  if (w.a > 0.02 && hD > 0.0 && hD < 1.0) {
    let n = nz(vec3<f32>((p.x + F.cldC.z) / 14.4, p.y / 3.2 + 0.37 + F.cldB.w * 0.5, (p.z + F.cldC.w) / 14.4));
    let heave = sat(5.2 * hD * (1.0 - hD)) * (0.75 + 0.35 * n.a);
    let cov = w.a * (0.42 + 0.58 * heave);
    let f = cloudRemap(n.r * 0.58 + n.g * 0.42, cov * 1.05 + 0.08, 3.2);
    if (f > d) { d = f; k = 0.82; cut = 0.45; }
  }
  if (d <= 0.0) { return 0.0; }
  var e = 0.48;
  if (fine > 0.0) {
    // Fine Worley cells stand; seams cut away — cauliflower of a growing cloud. Higher up
    // the cut goes deeper and the cloud frays into a soft skin.
    let n = nz(q * 5.6 + vec3<f32>(0.13, 0.41 + F.cldB.w * 0.8, 0.77));
    let nF = nz(q * 11.0 + vec3<f32>(0.55, 0.21, 0.09));
    let cell = n.g * 0.55 + n.b * 0.28 + nF.b * 0.17;
    e = mix(0.48, sat(1.08 - cell * 1.55), fine);
  }
  let erode = e * cut * (0.38 + 0.28 * sat(hT * 2.6)) * max(1.12 - d, 0.0);
  return k * max(d - erode, 0.0);
}
fn cloudDen(p: vec3<f32>) -> f32 {
  let w = wxAt(p.xz);
  if (!cloudMay(w, p.y)) { return 0.0; }
  return cloudDenW(p, w, 0.0);
}
// Ice fibres at the cirrus sheet. The panorama draws that sheet on its own;
// this is the same band once a ray is up there, so it stays out of the bake march.
fn cirrusDen(p: vec3<f32>) -> f32 {
  let yC = p.y - (C_HIGH - 0.2);
  if (F.cldB.x <= 0.02 || yC <= 0.0 || yC >= 0.7) { return 0.0; }
  let al = dot(p.xz, vec2<f32>(0.7071)) + F.cldC.x;
  let ac = dot(p.xz, vec2<f32>(-0.7071, 0.7071)) + F.cldC.y;
  let evo = F.cldB.w;
  let field = nz(vec3<f32>(al / 288.0, ac / 144.0, 0.21 + evo * 0.4)).a;
  let bend = ac + (nz(vec3<f32>(al / 144.0 + 0.3, ac / 144.0 + 0.7, 0.63 + evo)).a - 0.5) * 22.0;
  let tuft = nz(vec3<f32>(al / 72.0, bend / 18.0, 0.4 + yC + evo * 0.6));
  let covC = sat((field - 0.76 + F.cldB.x * 0.85) * 2.2);
  let fC = sat((tuft.a * 0.65 + tuft.r * 0.35 - 0.4) * 2.5) * covC * sat(10.0 * yC * (0.7 - yC));
  return fC * 0.28;
}

// ---- Cloud shadow. For each place on the sea, how much sunlight the clouds let through
// and the height of whatever is taking it. The ground, the water, the air and the animals all
// read this, so a shadow on the sand belongs to a cloud that is there in the sky.
fn shadeDir() -> vec3<f32> {
  // After the sun has set, cloud shadows fall along the moon, kept a little above the sea.
  if (F.sunTrue.y < -0.02 && F.moon.y > 0.04) {
    return normalize(vec3<f32>(F.moon.x, max(F.moon.y, 0.08), F.moon.z));
  }
  return normalize(vec3<f32>(F.sunTrue.x, max(F.sunTrue.y, 0.09), F.sunTrue.z));
}
@fragment fn fsCloudShadow(in: SkyV) -> @location(0) vec4<f32> {
  let g = mapPlace(in.ndc, CS_K);
  let foot = max(length(dpdx(g)), length(dpdy(g)));
  let sd = shadeDir();
  let base = F.cldA.z;
  let top = max(F.cldA.w, base + 0.05);
  // Stratified height samples with empty-space skip so ocean shadows match visible towers
  // without a full-res march. Density uses the same world-space field as the sky bake.
  var tau = 0.0;
  var hs = 0.0;
  var h = base;
  let hSpan = top - base;
  for (var i = 0; i < 32; i++) {
    if (h >= top) { break; }
    let w = wxAt(g + sd.xz * (h / sd.y));
    var dh = hSpan * 0.085;
    if (!cloudMay(w, h)) {
      dh = hSpan * 0.14;
      h += dh;
      continue;
    }
    let p = vec3<f32>(g.x + sd.x * h / sd.y, h, g.y + sd.z * h / sd.y);
    let dens = cloudDen(p);
    if (dens > 0.02) { dh = hSpan * mix(0.085, 0.04, sat(dens * 1.6)); }
    let dt = C_SIG * dens * dh / sd.y;
    tau += dt;
    hs += dt * h;
    h += dh;
  }
  // Far out one texel of this map is wider than a cloud, and what it holds is the share of
  // the sea in shadow, not which part.
  let w = wxAt(g + sd.xz * (base + 0.5) / sd.y);
  let mean = 1.0 - 0.88 * sat(w.r * 1.2 + w.a + w.g * 2.0);
  let far = smoothstep(0.22, 0.82, foot);
  return vec4<f32>(mix(exp(-tau), mean, far), select(top, hs / max(tau, 1e-5), tau > 1e-4), 0.0, 1.0);
}
// Sunlight left at a place g and height alt. Above whatever casts the shadow there is none.
fn cloudLight(t: texture_2d<f32>, s: sampler, g: vec2<f32>, alt: f32) -> f32 {
  let sd = shadeDir();
  let f = g - sd.xz * (alt / sd.y);
  let v = textureSampleLevel(t, s, f / (length(f) + CS_K) * 0.5 + 0.5, 0.0);
  return mix(v.r, 1.0, smoothstep(-0.25, 0.05, alt - v.g));
}
fn cloudShade(xz: vec2<f32>, y: f32) -> f32 {
  let dayK = smoothstep(-0.02, 0.08, F.sunTrue.y);
  let moonK = (1.0 - dayK) * smoothstep(0.02, 0.22, F.moon.y) * smoothstep(0.0, 0.04, F.astroB.w);
  let k = max(dayK, moonK);
  if (k < 0.01) { return 1.0; }
  let lit = cloudLight(cshMap, skySamp, xz * 0.001, max(y, 0.0) * 0.001);
  let rest = mix(0.42, 0.05, dayK);
  return mix(1.0, rest + (1.0 - rest) * lit, k);
}
// How a sample throws the sun. Dual HG (back + forward) for the soft body, a multi-scatter
// powder term that keeps thick cores from going black, and a silver lining when the sun
// sits behind a thin skin. stormK greys a deck; fair weather keeps the bright rim.
fn cloudEnergy(mu: f32, tau: f32, d: f32, stormK: f32) -> f32 {
  let fwd = hg(mu, 0.78);
  let back = hg(mu, -0.22);
  let mid = hg(mu, 0.35);
  let p0 = mix(back, fwd, 0.62);
  let p1 = mix(hg(mu, -0.08), mid, 0.55);
  let beer = exp(-tau);
  // Powder / multi-scatter: light that bounced inside still reaches the eye through thick cloud.
  let powder = 1.0 - exp(-tau * 2.0 * d);
  let multi = exp(-tau * mix(0.18, 0.38, stormK)) * (0.55 + 0.45 * powder);
  let body = p0 * beer * (0.65 + 0.35 * powder) + 0.55 * p1 * multi;
  let glow = mix(0.22, 0.07, stormK) / (1.0 + mix(0.22, 0.65, stormK) * tau);
  let skin = sat(d * 2.8) * exp(-d * 0.7);
  // Silver lining: strong HG forward lobe on a thin edge with the sun behind.
  let rim = pow(sat(mu), 5.0) * exp(-tau * 0.42) * skin * mix(1.15, 0.22, stormK) * (0.55 + 0.45 * fwd);
  return body + glow + rim;
}

struct SkyBake { @location(0) c: vec4<f32> }
@fragment fn fsSkyBake(in: SkyV) -> SkyBake {
  let uv = vec2<f32>(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let az = (uv.x - 0.5) * 6.2831853;
  let el = uv.y * uv.y * (1.5708 + SKY_E0) - SKY_E0;
  let rd = vec3<f32>(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  // Real eye height, up through the cloud deck and past the cirrus. The old 400 m
  // cap kept every bake under the cloud base, so the march could assume that.
  let h0 = clamp(F.camPos.y, 2.0, 16500.0) * 0.001;
  let A = atmosphere(rd, h0);
  // Single scattering goes dark soon after the sun sets. The real sky does not: light that has
  // been scattered more than once keeps the whole dome a deep blue through twilight.
  // After dark what is left is airglow and whatever the moon puts into the air.
  let dusk = smoothstep(0.06, -0.08, F.sunTrue.y);
  let air = A.c + F.amb.rgb * vec3<f32>(0.5, 0.72, 1.1) * dusk * (0.5 + 0.5 * sat(rd.y))
    + vec3<f32>(0.0035, 0.0055, 0.011) * F.sunTrue.w * (0.35 + 0.65 * sat(F.astroB.w * 18.0)) * (1.0 + 0.8 * pow(1.0 - sat(rd.y), 4.0));
  var o: SkyBake;
  o.c = vec4<f32>(air, 1.0);
  // The rows under the horizon hold the air alone: they are the colour of the haze.
  if (rd.y <= 0.0) { return o; }
  let sy = F.sunTrue.y;
  // The sun lights the clouds until it is well under the horizon, the high ones last. Then the moon does.
  let byMoon = sy < -0.16;
  let ld = select(F.sunTrue.xyz, F.moon.xyz, byMoon);
  // F.mood.y = cloud cover, F.wx.x = rain. A storm is a dark cumulonimbus: charcoal
  // belly, a brighter anvil, billows still visible. Not a black cutout in the sky.
  let stormK = sat(F.mood.y) * (0.45 + 0.55 * sat(F.wx.x));
  let stormDim = mix(1.0, 0.7, stormK) * mix(1.0, 0.9, sat(F.wx.x));
  let lightC = select(F.disc.rgb * stormDim * mix(vec3<f32>(1.0), vec3<f32>(0.78, 0.84, 0.98), stormK), vec3<f32>(0.62, 0.72, 0.9) * F.astroB.w * 1.7, byMoon);
  let mu = dot(rd, ld);
  let Rc = RE + h0;
  let b = Rc * rd.y;
  let base = F.cldA.z;
  let top = max(F.cldA.w, base + 0.05);
  let org = F.camPos.xz * 0.001;
  let cq = clamp(F.cloudOct, 1.0, 3.0);
  // Under the deck the march still starts just under the base, so the first step is
  // the same kind for every ray. Once the eye is near the base, pad0 hands low cloud
  // to the per-frame volume pass: a strip bake would lag inside the deck and draw it twice.
  // F.cloudOwn is that handoff. F.pad0 is the sea disk's ring exponent.
  // tShaft is how far the upward air is still in cloud shadow, for the shafts below.
  var t0 = 0.0;
  var t1 = 0.0;
  var tShaft = 0.0;
  if (F.cloudOwn > 0.5 || h0 > top + 0.02) {
    t0 = 1.0;
    t1 = 0.0;
    if (h0 < base - 0.01) { tShaft = shellT(b, Rc, base - h0); }
  } else if (h0 < base - 0.02) {
    t0 = shellT(b, Rc, base - 0.01 - h0);
    t1 = min(shellT(b, Rc, top - h0), 320.0);
    tShaft = t0;
  } else {
    t0 = 0.0;
    t1 = min(max(shellAhead(b, Rc, top - h0), 0.0), 80.0);
    tShaft = t0;
  }
  let span = 1.0 / (1.0 - A.t + 1e-4);
  var C = vec3<f32>(0.0);
  var T = 1.0;
  // Adaptive 3D density march for the panorama: empty-space skip, smaller steps in dense
  // cloud, early out on opacity. Cap is fixed so a full-dome bake still finishes on soft GPU.
  // Self-shadow: a short Beer march toward the sun so tops stay bright and bases go dark.
  let nBake = i32(10.0 + 4.0 * cq);
  var t = t0;
  for (var i = 0; i < 24; i++) {
    if (i >= nBake || t > t1 || T < 0.02) { break; }
    let p = vec3<f32>(org.x + rd.x * t, h0 + riseAt(b, Rc, t), org.y + rd.z * t);
    let w = wxAt(p.xz);
    var d = 0.0;
    var ds = 0.55;
    if (cloudMay(w, p.y)) {
      d = cloudDenW(p, w, 0.4);
      ds = mix(0.42, 0.16, sat(d * 2.2));
    } else {
      ds = 0.72;
    }
    if (d > 0.015) {
      // Optical depth toward the light: height grade + short sample chain.
      var tau = d * mix(3.2, 5.5, stormK);
      if (d > 0.12) {
        var marched = 0.0;
        var sl = 0.07;
        var ll = 0.0;
        let nL = i32(2.0 + cq);
        for (var k = 0; k < 5; k++) {
          if (k >= nL) { break; }
          marched += cloudDen(p + ld * (ll + sl * 0.5)) * sl;
          ll += sl;
          sl *= 1.85;
        }
        tau = mix(tau, marched * C_SIG * 0.085, smoothstep(0.12, 0.45, d));
      }
      let E = cloudEnergy(mu, tau, d, stormK);
      let hr = sat((p.y - base) / 2.5);
      let hRel = sat((p.y - base) / max(F.cldA.w - base, 0.05));
      // Bright sunlit tops, darker shadowed bases — even in fair weather.
      let topLit = mix(0.62, 1.18, smoothstep(0.08, 0.72, hRel));
      let belly = mix(1.0, 0.72, smoothstep(0.45, 0.05, hRel) * (1.0 - sat(mu) * 0.35));
      let anvilK = smoothstep(0.55, 0.92, hRel);
      let bellyK = smoothstep(0.4, 0.02, hRel);
      let grade = topLit * belly * mix(1.0, mix(0.82, 1.28, anvilK) * mix(1.0, 0.74, bellyK), stormK);
      let direct = lightC * select(sunT(p.y, sy), vec3<f32>(1.0), byMoon) * E * 0.68;
      let ambFair = F.amb.rgb * (0.08 + 0.38 * hr);
      let ambStorm = vec3<f32>(0.18, 0.21, 0.28) * (0.28 + 0.5 * hr);
      let L = (direct + mix(ambFair, ambStorm, stormK)) * grade;
      let al = 1.0 - exp(-d * mix(5.2, 7.0, stormK));
      let keep = pathKeep(t, h0, p.y);
      C += T * al * (L * keep + air * sat3((1.0 - keep) * span));
      T *= 1.0 - al;
    }
    t += ds;
  }
  // Mid band: three samples where the ray crosses it. The fine march stays with
  // the cumulus, so a broken deck does not multiply the cost of every strip.
  if (h0 < 4.15 && T > 0.04) {
    var tAl = 0.0;
    if (h0 < 2.7) { tAl = shellT(b, Rc, 2.7 - h0); }
    if (tAl >= 0.0 && tAl < 90.0) {
      for (var ia = 0; ia < 3; ia++) {
        let tm = tAl + f32(ia) * 0.45;
        let pm = vec3<f32>(org.x + rd.x * tm, h0 + riseAt(b, Rc, tm), org.y + rd.z * tm);
        let yA = (pm.y - 2.7) / 1.45;
        if (yA > 0.0 && yA < 1.0) {
          let wm = wxAt(pm.xz);
          if (wm.a > 0.12) {
            let nA = nz(vec3<f32>((pm.x + F.cldC.x) / 22.0, pm.y / 2.2 + 0.2, (pm.z + F.cldC.y) / 22.0));
            let covA = sat(wm.r * 0.5 + F.cldB.x * 0.4) * sat(6.0 * yA * (1.0 - yA));
            let fA = sat((nA.r * 0.7 + nA.a * 0.3 - 0.9 + covA) * 3.0);
            if (fA > 0.04) {
              let dm = fA * 0.42;
              let Em = cloudEnergy(mu, dm * 1.4, dm, stormK);
              let Lm = lightC * select(sunT(pm.y, sy), vec3<f32>(1.0), byMoon) * Em * 0.4 + F.amb.rgb * 0.12;
              let am = 1.0 - exp(-dm * 3.0);
              C += T * am * Lm * pathKeep(tm, h0, pm.y);
              T *= 1.0 - am;
            }
          }
        }
      }
    }
  }
  // Cirrus: a sheet of ice far above, combed into streaks along the upper wind.
  var back = air;
  var open = 1.0;
  if (F.cldB.x > 0.01 && h0 < C_HIGH - 0.7) {
    let tc = shellAhead(b, Rc, C_HIGH - h0);
    if (tc > 0.0) {
    let pc = org + rd.xz * tc;
    let al = dot(pc, vec2<f32>(0.7071)) + F.cldC.x;
    let ac = dot(pc, vec2<f32>(-0.7071, 0.7071)) + F.cldC.y;
    // Where the high cloud is at all, in fields a hundred kilometres across; within a field,
    // tufts; within a tuft, fibres drawn out along the wind and bent by slow eddies.
    let field = nz(vec3<f32>(al / 288.0, ac / 144.0, 0.21)).a;
    let bend = ac + (nz(vec3<f32>(al / 144.0 + 0.3, ac / 144.0 + 0.7, 0.63)).a - 0.5) * 22.0;
    let tuft = nz(vec3<f32>(al / 72.0, bend / 24.0, 0.4));
    let fb = mix(0.5, nz(vec3<f32>(al / 36.0, bend / 2.4, 0.8)).g, 1.0 - smoothstep(30.0, 110.0, tc));
    let cov = sat((field - 0.76 + F.cldB.x * 0.85) * 2.2);
    let dc = sat((tuft.a * 0.6 + tuft.r * 0.4 - 0.4) * 2.4) * (0.25 + 0.75 * fb * fb) * cov;
    let aC = 1.0 - exp(-0.42 * dc / max((b + tc) / (Rc + C_HIGH - h0), 0.15));
    let Lc = lightC * select(sunT(C_HIGH, sy), vec3<f32>(1.0), byMoon) * (0.22 + 0.26 * hg(mu, 0.6)) + F.amb.rgb * 0.28;
    let keep = pathKeep(tc, h0, C_HIGH);
    back = air * (1.0 - aC * (1.0 - sat3((1.0 - keep) * span))) + aC * Lc * keep;
    open = 1.0 - aC;
    }
  }
  var col = C + T * back;
  // Shafts. Under the clouds the air is lit only where the sun finds a gap, so the light
  // the air sends to the eye is taken away along each stretch of the ray that lies in shadow.
  let shaftK = smoothstep(-0.02, 0.06, sy);
  let tS = min(tShaft, 60.0);
  if (shaftK > 0.0 && tS > 0.4) {
    let grow = pow(tS / 0.3, 1.0 / 20.0);
    var ta = 0.3;
    var ka = pathKeep(ta, h0, h0 + riseAt(b, Rc, ta));
    var dark = vec3<f32>(0.0);
    for (var k = 0; k < 20; k++) {
      let tb = ta * grow;
      let hb = h0 + riseAt(b, Rc, tb);
      let kb = pathKeep(tb, h0, hb);
      let tm = (ta + tb) * 0.5;
      let lit = cloudLight(cshBake, nSamp, org + rd.xz * tm, h0 + riseAt(b, Rc, tm));
      dark += (ka - kb) * (1.0 - lit);
      ta = tb;
      ka = kb;
    }
    col -= A.c * sat3(dark * span) * 0.85 * shaftK;
  }
  o.c = vec4<f32>(col, T * open);
  return o;
}
// The sky's light gathered coarsely, for lighting things by it. Lives in a small mip of the panorama.
@fragment fn fsSkyDim(in: SkyV) -> @location(0) vec4<f32> {
  let uv = vec2<f32>(in.ndc.x * 0.5 + 0.5, 0.5 - in.ndc.y * 0.5);
  let px = 16.0 / F.skyD.xy;
  var acc = vec4<f32>(0.0);
  var ws = 0.0;
  for (var j = 0; j < 6; j++) {
    for (var i = 0; i < 6; i++) {
      let f = (vec2<f32>(f32(i), f32(j)) + 0.5) / 3.0 - 1.0;
      let w = (1.0 - abs(f.x)) * (1.0 - abs(f.y));
      let u = uv + f * 3.0 * px;
      acc += skyBlend(skyBase, nSamp, vec2<f32>(u.x, clamp(u.y, 0.5 / F.skyD.y, 1.0 - 0.5 / F.skyD.y))) * w;
      ws += w;
    }
  }
  return acc / ws;
}
// ---- Irradiance. The light the whole sky and the ground under it shed on a surface, for
// each way the surface can face: the sky gathered over the hemisphere and weighted by the
// cosine, which is what a matt surface answers to. Kept in a 34 by 16 corner of the
// panorama's mip 3: across is the facing's azimuth with a column of overlap at each end,
// up is its height from straight down to straight up. In the units of sunCol.
@fragment fn fsSkyIrr(in: SkyV) -> @location(0) vec4<f32> {
  let az = (in.clip.x - 1.0) / 32.0 * 6.2831853 - PI;
  let ny = clamp((in.clip.y - 0.5) / 7.5 - 1.0, -1.0, 1.0);
  let nh = sqrt(max(1.0 - ny * ny, 0.0));
  let n = vec3<f32>(nh * cos(az), ny, nh * sin(az));
  let e = 8.0 / F.skyD.y;
  var acc = vec3<f32>(0.0);
  var up = vec3<f32>(0.0);
  // 24 by 6 directions, each standing for the same share of the dome.
  for (var j = 0; j < 6; j++) {
    let sy = (f32(j) + 0.5) / 6.0;
    let ch = sqrt(1.0 - sy * sy);
    for (var i = 0; i < 24; i++) {
      let a = (f32(i) + 0.5 * f32(j & 1)) / 24.0 * 6.2831853;
      let d = vec3<f32>(ch * cos(a), sy, ch * sin(a));
      let uv = skyUV(d);
      let L = textureSampleLevel(skyBase, nSamp, vec2<f32>(uv.x, clamp(uv.y, e, 1.0 - e)), 0, 0.0).rgb;
      acc += L * max(dot(n, d), 0.0);
      up += L * sy;
    }
  }
  // Each direction is 2 pi / 144 of solid angle, and a matt surface divides by pi.
  let k = 2.0 / 144.0;
  // Under the horizon is the ground and the sea, lit by the sun and by that same sky.
  let gl = vec3<f32>(0.2, 0.2, 0.17) * (up * k + F.sunCol / max(F.lit.y, 1e-3) * max(F.sunDir.y, 0.0) * (1.0 - 0.7 * sat(F.mood.y)));
  return vec4<f32>(acc * k + gl * (1.0 - ny) * 0.5, 1.0);
}
// Lightning is light from inside the cloud. A bake takes many frames and a flash does
// not, so the panorama never holds it. fsBoltVol marches it for the frame it is on.
// A near-field volume pass (F.cloudOwn) should add boltAt on each of its own samples instead.
const BOLT_C = vec3<f32>(0.76, 0.84, 1.0);
// How much of the flash reaches a point in metres. A ground stroke lights its column;
// a stroke that stays in the cloud is a point. Nothing past a couple of kilometres.
fn boltNear(p: vec3<f32>) -> f32 {
  if (F.bolt.w <= 0.0) { return 0.0; }
  let r = select(length(p - F.bolt.xyz), length(p.xz - F.bolt.xz), F.boltB.y > 0.5);
  return F.bolt.w * exp(-r * r / 2.8e6);
}
// What the flash throws on a surface. gain is higher for leaves, which are then
// multiplied by a dark albedo, than for water, which is added as a finished colour.
fn boltOnSurf(world: vec3<f32>, n: vec3<f32>, gain: f32) -> vec3<f32> {
  if (F.bolt.w <= 0.0) { return vec3<f32>(0.0); }
  var src = F.bolt.xyz;
  if (F.boltB.y > 0.5) { src.y = world.y; }
  let d = src - world;
  let r = length(d);
  let ndl = sat(dot(n, d / max(r, 1.0)) * 0.55 + 0.45);
  let fall = 1.0 / (1.0 + r * r / 6.4e6);
  return BOLT_C * (F.bolt.w * fall * ndl * gain);
}
// Radiance one cloud sample (kilometres, density d) sends from the flash. Empty air
// is dark. Cloud between the channel and the sample puts the light out. fsCloudVol
// adds this per step; fsBoltVol integrates it with boltMarch.
fn boltAt(p: vec3<f32>, d: f32) -> vec3<f32> {
  if (F.bolt.w <= 0.0 || d <= 0.003) { return vec3<f32>(0.0); }
  let bp = F.bolt.xyz * 0.001;
  var src = bp;
  if (F.boltB.y > 0.5) {
    src.y = clamp(p.y, min(bp.y, F.cldA.z), max(bp.y, F.cldA.w));
  }
  let off = p - src;
  let r = length(off);
  let dir = off / max(r, 1e-3);
  let mid = cloudDen(p - dir * min(r * 0.5, 0.45));
  let block = exp(-r * (0.28 * d + 0.5 * mid));
  let reach = exp(-r * 0.42);
  return BOLT_C * (F.bolt.w * d * block * reach * 0.16);
}
// Kilometres by which the view ray misses the channel. A large value is "not this pixel".
fn boltMiss(rd: vec3<f32>) -> f32 {
  if (rd.y <= 0.02) { return 1e3; }
  let h0 = clamp(F.camPos.y, 2.0, 400.0) * 0.001;
  let org = F.camPos.xz * 0.001;
  let horiz = rd.xz;
  let hl2 = max(dot(horiz, horiz), 1e-6);
  let tc = dot(F.bolt.xz * 0.001 - org, horiz) / hl2;
  if (tc <= 0.0) { return 1e3; }
  return length(org + horiz * tc - F.bolt.xz * 0.001);
}
// Density march of the flash along one view ray. Eye height matches fsSkyBake, so the
// glow sits in the same cloud the panorama drew. Steps follow the cloud quality.
fn boltMarch(rd: vec3<f32>) -> vec3<f32> {
  if (F.bolt.w <= 0.0 || boltMiss(rd) > 3.2) { return vec3<f32>(0.0); }
  let h0 = clamp(F.camPos.y, 2.0, 400.0) * 0.001;
  let org = F.camPos.xz * 0.001;
  let bp = F.bolt.xyz * 0.001;
  let Rc = RE + h0;
  let b = Rc * rd.y;
  let base = F.cldA.z;
  let topH = F.cldA.w;
  let tA = shellT(b, Rc, max(base - h0, 0.0));
  let tB = min(shellT(b, Rc, topH - h0), 70.0);
  if (tB <= tA + 0.02) { return vec3<f32>(0.0); }
  let horiz = rd.xz;
  let hl2 = max(dot(horiz, horiz), 1e-6);
  let tc = clamp(dot(bp.xz - org, horiz) / hl2, tA, tB);
  let cq = clamp(F.cloudOct, 1.0, 3.0);
  let n = i32(8.0 + 5.0 * cq);
  let t0 = max(tA, tc - 2.6);
  let t1 = min(tB, tc + 2.6);
  if (t1 <= t0) { return vec3<f32>(0.0); }
  var acc = vec3<f32>(0.0);
  var Tr = 1.0;
  let dt = (t1 - t0) / f32(n);
  for (var i = 0; i < 24; i++) {
    if (i >= n || Tr < 0.03) { break; }
    let t = t0 + (f32(i) + 0.5) * dt;
    let p = vec3<f32>(org.x + rd.x * t, h0 + riseAt(b, Rc, t), org.y + rd.z * t);
    let w = wxAt(p.xz);
    if (!cloudMay(w, p.y)) { continue; }
    let dens = cloudDenW(p, w, 0.7);
    if (dens <= 0.003) { continue; }
    let al = 1.0 - exp(-dens * C_SIG * dt);
    acc += Tr * al * boltAt(p, dens) * pathKeep(t, h0, p.y);
    Tr *= 1.0 - al;
  }
  return acc;
}
fn skyIrr(n: vec3<f32>) -> vec3<f32> {
  let u = atan2(n.z, n.x) / 6.2831853 + 0.5;
  let px = vec2<f32>(1.0 + u * 32.0, 0.5 + (clamp(n.y, -1.0, 1.0) + 1.0) * 7.5);
  return textureSampleLevel(skyMap, skySamp, px / floor(F.skyD.xy / 8.0), 0, 3.0).rgb * max(F.lit.y, 0.0);
}
fn skyDimRaw(rd: vec3<f32>) -> vec3<f32> {
  let uv = skyUV(rd);
  let e = 8.0 / F.skyD.y;
  return textureSampleLevel(skyMap, skySamp, vec2<f32>(uv.x, clamp(uv.y, e, 1.0 - e)), 0, 4.0).rgb;
}
fn skyDim(rd: vec3<f32>) -> vec3<f32> {
  return skyDimRaw(rd) * max(F.lit.y, 0.0);
}

// Saint Lucia. Kept in step with ASTRO_LAT in astro.js.
const ASTRO_LAT: f32 = 0.24276483;
// A view direction back to the celestial sphere. The same sum as astroDirToRaDec.
fn astroRaDec(rd: vec3<f32>) -> vec2<f32> {
  let east = rd.x * F.astroC.x + rd.z * F.astroC.y;
  let north = rd.x * F.astroC.z + rd.z * F.astroC.w;
  let alt = asin(clamp(rd.y, -1.0, 1.0));
  let az = atan2(east, north);
  let lat = ASTRO_LAT;
  let sinDec = sin(alt) * sin(lat) + cos(alt) * cos(lat) * cos(az);
  let dec = asin(clamp(sinDec, -1.0, 1.0));
  let cosDec = max(cos(dec), 1e-4);
  let sinH = -sin(az) * cos(alt) / cosDec;
  let cosH = (sin(alt) - sin(dec) * sin(lat)) / (cosDec * cos(lat));
  let H = atan2(sinH, cosH);
  return vec2<f32>(F.astro.x - H, dec);
}
fn starUV(rd: vec3<f32>) -> vec2<f32> {
  let eq = astroRaDec(rd);
  return vec2<f32>(fract(eq.x * 0.15915494), clamp(eq.y * 0.31830989 + 0.5, 0.001, 0.999));
}
// The moon's own face. Phase is the angle between the real sun and the outward normal,
// so a crescent is a crescent and a full moon is not a flat disc scaled down.
fn moonDisc(rd: vec3<f32>) -> vec3<f32> {
  let m = normalize(F.moon.xyz);
  if (m.y < -0.02) { return vec3<f32>(0.0); }
  let cosA = dot(rd, m);
  if (cosA < 0.982) { return vec3<f32>(0.0); }
  let ang = acos(min(cosA, 1.0));
  // True radius is about a quarter of a degree. The 60 degree view would draw that as a
  // few pixels, too small to show a crescent, so the face is enlarged. The centre stays
  // on the true direction and the terminator is still the real sun.
  let rad = max(F.astro.z, 0.0042) * 5.5;
  let night = sat(F.sunTrue.w);
  let gain = (night * 1.25 + (1.0 - night) * 0.2) * smoothstep(-0.01, 0.05, m.y);
  // A tight glow. It uses a radius near the true one, so enlarging the face does not
  // paint a disc of haze around it.
  let glowR = max(F.astro.z, 0.0042) * 9.0;
  var col = vec3<f32>(0.72, 0.78, 0.95) * exp(-ang / glowR) * 0.04 * gain;
  if (ang < rad * 1.2) {
    let r = ang / rad;
    let limb = smoothstep(1.04, 0.82, r);
    var tng = cross(vec3<f32>(0.0, 1.0, 0.0), m);
    if (length(tng) < 0.05) { tng = cross(vec3<f32>(1.0, 0.0, 0.0), m); }
    tng = normalize(tng);
    let bng = normalize(cross(m, tng));
    let off = rd - m * cosA;
    let u = dot(off, tng) / rad;
    let v = dot(off, bng) / rad;
    let z = sqrt(max(1.0 - r * r, 0.0));
    // The near face points back at the eye. Full when the sun is behind us, dark when it is with the moon.
    let N = normalize(tng * u + bng * v - m * z);
    let ndl = dot(N, normalize(F.astroB.xyz));
    let lit = smoothstep(-0.03, 0.06, ndl);
    let maria = 0.62 + 0.38 * n2(vec2<f32>(u, v) * 3.2);
    let earth = (1.0 - lit) * 0.055;
    let face = vec3<f32>(0.95, 0.94, 0.88) * maria * (lit + earth);
    col += face * (0.45 + 0.55 * z) * limb * gain * 3.2;
  }
  return col;
}
// Stars and the Milky Way live in one map (catalog points + galactic band; no stick figures).
// cover is how much of this view the clouds leave open.
fn nightSky(rd: vec3<f32>, cover: f32) -> vec3<f32> {
  var col = vec3<f32>(0.0);
  let night = sat(F.sunTrue.w);
  if (night > 0.02 && rd.y > 0.0) {
    let s = textureSampleLevel(starMap, starSamp, starUV(rd), 0.0).rgb;
    // Decode the bake's sqrt encoding; a mild lift keeps faint stars under moonless skies.
    let flux = s * s;
    col += (flux * 4.35 + flux * flux * 1.6) * night * sat(rd.y * 5.0) * cover;
  }
  // The iris opens for the dark ground. Divide it back out so the disc keeps its shape
  // instead of the whole face clipping to white. Same trick as the insects.
  col += moonDisc(rd) * cover / max(F.exposure, 0.15);
  return col;
}

// disc is 1 where the sun itself may show, 0 for the glow of the air alone.
fn skyLook(rd: vec3<f32>, disc: f32) -> vec3<f32> {
  let s = skyBlend(skyMap, skySamp, skyUV(rd));
  var col = s.rgb;
  let mu = dot(rd, F.sunTrue.xyz);
  if (disc > 0.0 && mu > 0.9992) {
    // The disc, a little dimmer at its limb, with the same air between it and the eye as
    // lights everything else, so it dims and reddens as it sinks and goes out behind cloud.
    let r = acos(min(mu, 1.0)) / 0.0075;
    let face = smoothstep(1.0, 0.85, r) * (0.55 + 0.45 * sqrt(max(1.0 - r * r, 0.0)));
    col += F.disc.rgb * sunT(max(F.camPos.y, 0.0) * 0.001, F.sunTrue.y) * (16.0 * face + 0.5 * exp(-r * 0.9)) * s.a * disc;
  }
  col *= max(F.lit.y, 0.0);
  if (rd.y > 0.0) { col += nightSky(rd, s.a); }
  return col;
}
fn skyColor(rd: vec3<f32>) -> vec3<f32> { return skyLook(rd, 1.0); }
// The air a distant thing is seen through: the glow of the horizon that way. The rows of
// the panorama just under the horizon hold the air alone, with no cloud drawn across it.
// Blend a little of the view direction so aerial perspective matches the sky the ray
// actually faces (coherent with the panorama, not a single fixed dip).
fn hazeColor(dir: vec3<f32>) -> vec3<f32> {
  let d = normalize(dir + vec3<f32>(1e-5, 0.0, 0.0));
  let low = normalize(vec3<f32>(d.x, -0.028, d.z));
  let toward = normalize(vec3<f32>(d.x, clamp(d.y * 0.35, -0.08, 0.12), d.z));
  return mix(skyLook(low, 0.0), skyLook(toward, 0.0), 0.35);
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
`;
}
