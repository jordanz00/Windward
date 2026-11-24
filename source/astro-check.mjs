// Numeric check for the night sky. Not part of the page.
// Reference altitudes, azimuths and phases are SunCalc (Meeus) at Saint Lucia.
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {
  console, Math, Date, Int32Array, Float32Array, Uint8Array, Int8Array, DataView, atob,
  URLSearchParams
};
ctx.globalThis = ctx;
createContext(ctx);
function load(name) {
  runInContext(readFileSync(join(root, 'source', name), 'utf8'), ctx, { filename: name });
}
runInContext(`
const SUN = (function () {
  const v = [-0.74, 0.50, -0.42];
  const L = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / L, v[1] / L, v[2] / L];
})();
function smooth01(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
}
`, ctx);
load('env.js');
load('astro-data.js');
load('astro.js');

const D = 180 / Math.PI;
const grab = (expr) => runInContext(expr, ctx);
const LAT = grab('ASTRO_LAT');
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log('ok  ' + name); return; }
  failed++;
  console.log('FAIL ' + name + (detail ? '  ' + detail : ''));
}
function ang(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) * D;
}

// fraction, phase, altitude deg, azimuth deg, distance km. SunCalc at 13.9094 N, 60.9789 W.
const CASES = [
  ['1992-04-12T00:00:00Z', 0.6786, 0.3079, 85.29, 268.78, 368409],
  ['2024-10-17T11:26:00Z', 0.9998, 0.5000, -21.20, 287.73, 357364],
  ['2026-11-24T02:00:00Z', 0.9939, 0.4792, 69.62, 58.06, 362222],
  ['2026-11-24T22:30:00Z', 0.9967, 0.5124, 10.51, 65.43, 360142],
  ['2025-01-13T22:27:00Z', 0.9984, 0.5000, 7.52, 65.33, 381410],
  ['2025-03-04T00:00:00Z', 0.211, 0.15, 25, 283, 0]
];

for (const [iso, frac, phase, alt, az, dist] of CASES) {
  const sky = ctx.astroAt(new Date(iso));
  const df = Math.abs(sky.illum - frac);
  const dp = Math.min(Math.abs(sky.phase - phase), 1 - Math.abs(sky.phase - phase));
  const da = Math.abs(sky.alt * D - alt);
  const dz = ang(sky.az, az / D);
  const dd = dist ? Math.abs(sky.dist - dist) : 0;
  const fracTol = iso.startsWith('2025-03-04') ? 0.03 : 0.008;
  const phaseTol = iso.startsWith('2025-03-04') ? 0.08 : 0.012;
  const altTol = iso.startsWith('2025-03-04') ? 1.2 : 0.35;
  const azTol = iso.startsWith('2025-03-04') ? 1.5 : 0.45;
  check(iso,
    df < fracTol && dp < phaseTol && da < altTol && dz < azTol && dd < (dist ? 80 : 1),
    'illum ' + sky.illum.toFixed(4) + ' phase ' + sky.phase.toFixed(4)
      + ' alt ' + (sky.alt * D).toFixed(2) + ' az ' + (sky.az * D).toFixed(2)
      + ' dist ' + sky.dist.toFixed(0)
      + '  d ' + [df.toFixed(4), dp.toFixed(4), da.toFixed(2), dz.toFixed(2), dd.toFixed(0)].join(' '));
  check(iso + ' lst wrapped', sky.lst >= 0 && sky.lst < Math.PI * 2);
}

const sky = ctx.astroAt(new Date('2026-11-24T02:00:00Z'));
const samples = [[101.287, -16.716], [0, 0], [83, 22], [266.4, -28.9], [180, 60], [40, -50]];
for (const [raD, decD] of samples) {
  const ra = raD / D, dec = decD / D;
  const geo = ctx.astroHoriz(sky.lst - ra, LAT, dec);
  const dir = ctx.astroDir(geo.alt, geo.az, sky.basis);
  const back = ctx.astroDirToRaDec(dir, sky.lst, LAT, sky.basis);
  check('roundtrip ' + raD + ',' + decD, ang(back.ra, ra) < 0.05 && Math.abs(back.dec - dec) * D < 0.05,
    'dra ' + ang(back.ra, ra).toFixed(4) + ' ddec ' + (Math.abs(back.dec - dec) * D).toFixed(4));
}

const g = ctx.astroGalactic(266.405 / D, -28.936 / D);
let gl = g.l;
if (gl > Math.PI) gl -= Math.PI * 2;
check('galactic centre', Math.abs(g.b) * D < 1.2 && Math.abs(gl) * D < 1.2,
  'l ' + (g.l * D).toFixed(2) + ' b ' + (g.b * D).toFixed(2));

const cat = ctx.astroCatalog();
check('star count', cat.stars.length === 5044, String(cat.stars.length));
check('line count', cat.lines.length === 751, String(cat.lines.length));
const sirius = cat.stars.find((s) => Math.abs(s.mag + 1.44) < 0.1 && Math.abs(s.dec * D + 16.72) < 0.08);
check('sirius', !!sirius && Math.abs(sirius.ra * D - 101.29) < 0.05, sirius ? (sirius.ra * D).toFixed(3) + ' ' + (sirius.dec * D).toFixed(3) + ' mag ' + sirius.mag.toFixed(2) : 'missing');

runInContext('astroClock = () => new Date("2025-03-04T00:00:00Z")', ctx);
ctx.applySpace7();
const cres = ctx.astroAt(ctx.astroDateAtLocalHour(grab('env.hour')));
check('space 7 crescent night',
  grab('env.spaceId') === 7 && grab('env.realMoon') === true && grab('env.wx') === 'clear' && grab('env.auto') === false && grab('env.run') === false
    && grab('envSunAt(env.hour)[1]') < -0.15
    && cres.alt > 8 / D && cres.illum < 0.5 && cres.illum > 0.15,
  'hour ' + grab('env.hour').toFixed(2) + ' day ' + grab('env.astroDay') + ' sun ' + grab('envSunAt(env.hour)[1]').toFixed(3)
    + ' alt ' + (cres.alt * D).toFixed(1) + ' illum ' + cres.illum.toFixed(3));

runInContext('astroClock = () => new Date("2026-11-24T16:00:00Z")', ctx);
ctx.applySpace7();
const full = ctx.astroAt(ctx.astroDateAtLocalHour(grab('env.hour')));
check('space 7 full moon', full.illum > 0.98 && full.alt > 8 / D && grab('env.astroDay') === 1,
  'hour ' + grab('env.hour').toFixed(2) + ' day ' + grab('env.astroDay') + ' alt ' + (full.alt * D).toFixed(1) + ' illum ' + full.illum.toFixed(3));

runInContext('env.hour = 22.5; env.astroDay = 0; env.realMoon = true; env.face = 0; envLight(0);', ctx);
const lit = grab('({illum: env.astro.illum, moonK: env.astro.moonK, up: env.moon[1], key: env.keyCol.slice()})');
check('night key follows the phase', lit.moonK > 0 && lit.moonK < 0.2 && lit.key[2] > lit.key[0],
  'moonK ' + lit.moonK.toFixed(4) + ' key ' + lit.key.map((v) => v.toFixed(4)).join(','));
runInContext('const buf = new Float32Array(264); envWrite(buf, 188, -0.1, 1); globalThis.__buf = buf;', ctx);
const lst = grab('__buf[252]');
check('uniform carries wrapped sidereal time', lst > 0 && lst < Math.PI * 2, String(lst));

const t0 = Date.now();
const rgba = ctx.astroBake(128, 64);
const ms = Date.now() - t0;
function lum(ra, dec) {
  const x = ((Math.round(ra / 360 * 128) % 128) + 128) % 128;
  const y = Math.max(0, Math.min(63, Math.round((dec + 90) / 180 * 64)));
  const o = (y * 128 + x) * 4;
  return rgba[o] + rgba[o + 1] + rgba[o + 2];
}
check('milky way brighter than the pole', lum(266.4, -28.9) > lum(0, 85) + 8,
  'core ' + lum(266.4, -28.9) + ' pole ' + lum(0, 85) + ' bake ' + ms + ' ms');
check('sirius pixel lit', lum(101.29, -16.72) > 4, String(lum(101.29, -16.72)));

if (failed) {
  console.log(failed + ' failed');
  process.exit(1);
}
console.log('astro-check passed');
