// CPU equirect bake of the night sky — test / tooling only (not shipped in index.html).
// Runtime stars are procedural in WGSL via astroStarBuffer + nightSky.

function astroStarRGB(bv) {
  const t = astroClamp(bv, -0.35, 1.9);
  const r = t < 0.15 ? 0.72 + (t + 0.35) * 0.45 : 1;
  const g = t < 0.2 ? 0.86 + t * 0.25 : astroClamp(0.98 - (t - 0.2) * 0.28, 0.45, 1);
  const b = t < 0 ? 1 : astroClamp(1 - t * 0.48, 0.38, 1);
  const m = Math.max(r, g, b);
  return [r / m, g / m, b / m];
}
function astroHash(n) {
  let x = (Math.imul(n, 747796405) + 2891336453) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822519) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}
function astroSplat(acc, W, H, ra, dec, rgb, amp) {
  const px = ra / (Math.PI * 2) * W - 0.5;
  const py = (dec / Math.PI + 0.5) * H - 0.5;
  const core = astroClamp(0.55 + Math.sqrt(Math.max(amp, 0)) * 0.95, 0.55, 2.4);
  const halo = core * (1.55 + Math.min(amp, 2.5) * 0.35);
  const r = Math.ceil(halo * 2.1);
  const cx = Math.round(px), cy = Math.round(py);
  const sCore = 2 * core * core * 0.28;
  const sHalo = 2 * halo * halo * 0.55;
  for (let dy = -r; dy <= r; dy++) {
    const j = cy + dy;
    if (j < 0 || j >= H) continue;
    const ddy = py - j;
    for (let dx = -r; dx <= r; dx++) {
      const ddx = px - (cx + dx);
      const d2 = ddx * ddx + ddy * ddy;
      const w = Math.exp(-d2 / sCore) + 0.18 * Math.exp(-d2 / sHalo);
      if (w < 0.025) continue;
      const i = ((cx + dx) % W + W) % W;
      const o = (j * W + i) * 3;
      acc[o] += rgb[0] * amp * w;
      acc[o + 1] += rgb[1] * amp * w;
      acc[o + 2] += rgb[2] * amp * w;
    }
  }
}
// Equirectangular celestial map for numeric checks. Runtime sky does not sample this.
function astroBake(W, H) {
  const acc = new Float32Array(W * H * 3);
  const sD = Math.sin(ASTRO_GN_DEC), cD = Math.cos(ASTRO_GN_DEC);
  for (let y = 0; y < H; y++) {
    const dec = ((y + 0.5) / H) * Math.PI - Math.PI / 2;
    const sd = Math.sin(dec), cd = Math.cos(dec);
    for (let x = 0; x < W; x++) {
      const ra = ((x + 0.5) / W) * Math.PI * 2;
      const cra = Math.cos(ra - ASTRO_GN_RA), sra = Math.sin(ra - ASTRO_GN_RA);
      const sb = sd * sD + cd * cD * cra;
      const b = Math.asin(astroClamp(sb, -1, 1));
      const gl = astroWrap(ASTRO_GL0 - Math.atan2(cd * sra, sd * cD - cd * sD * cra));
      const dl = Math.atan2(Math.sin(gl), Math.cos(gl));
      const band = Math.exp(-0.5 * (b * b) / 0.010);
      const wide = Math.exp(-0.5 * (b * b) / 0.078);
      const center = Math.exp(-0.5 * (dl * dl) / 0.30);
      const dC = Math.atan2(Math.sin(gl - 1.40), Math.cos(gl - 1.40));
      const cyg = Math.exp(-0.5 * (dC * dC) / 0.12) * Math.exp(-0.5 * (b * b) / 0.014);
      const rift = Math.exp(-0.5 * ((b + 0.015) * (b + 0.015)) / 0.0020) * Math.exp(-0.5 * ((dl - 0.35) * (dl - 0.35)) / 0.20);
      const clump = 0.82 + 0.18 * Math.sin(gl * 6.0 + b * 11.0);
      let glow = (0.05 * wide + 0.13 * band * clump) * (0.38 + 1.15 * center) * (1 - 0.62 * rift) + 0.07 * cyg;
      const o = (y * W + x) * 3;
      acc[o] += glow * 0.62;
      acc[o + 1] += glow * 0.70;
      acc[o + 2] += glow * 0.95;
      if (Math.abs(b) < 0.5) {
        const h = astroHash(x + y * W);
        const gate = Math.exp(-0.5 * (b / 0.18) * (b / 0.18));
        if (h < 0.03 * gate) {
          const mag = 6.15 + astroHash(x * 17 + y * 3) * 1.35;
          const amp = Math.pow(10, -0.4 * mag) * 1.1;
          const tint = 0.75 + 0.25 * h;
          acc[o] += amp * tint * 0.85;
          acc[o + 1] += amp * tint * 0.9;
          acc[o + 2] += amp * tint;
        }
      }
    }
  }
  const cat = astroCatalog();
  for (let i = 0; i < cat.stars.length; i++) {
    const s = cat.stars[i];
    const amp = Math.pow(10, -0.4 * s.mag) * 0.58;
    astroSplat(acc, W, H, s.ra, s.dec, astroStarRGB(s.bv), amp);
  }
  const out = new Uint8Array(W * H * 4);
  for (let i = 0, p = 0; i < acc.length; i += 3, p += 4) {
    for (let c = 0; c < 3; c++) {
      const x = Math.sqrt(Math.min(Math.max(acc[i + c], 0), 4)) * 0.5;
      out[p + c] = Math.max(0, Math.min(255, Math.round(x * 255)));
    }
    out[p + 3] = 255;
  }
  return out;
}
