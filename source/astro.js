// The night sky over the Windward Islands. The clock on the island is local mean solar
// time at Saint Lucia (13.9094 N, 60.9789 W). The moon's phase and place are the real
// ones for that hour on the UTC date, from the truncated ELP series in Meeus,
// Astronomical Algorithms, chapters 22, 25 and 47. Stars are Hipparcos through
// magnitude 6 at real RA/Dec, uploaded as a spatial-hash storage buffer for procedural
// shader discs (not a low-res equirect texture); the Milky Way is analytic in WGSL.
// Space 7, Moonlit Island, uses this moon by default.

const ASTRO_LAT_DEG = 13.9094;
const ASTRO_LON_DEG = -60.9789;
const ASTRO_LAT = ASTRO_LAT_DEG * Math.PI / 180;
const ASTRO_LON = ASTRO_LON_DEG * Math.PI / 180;
const ASTRO_EARTH_KM = 6378.14;
const ASTRO_MOON_KM = 1737.4;
const ASTRO_SUN_KM = 149598000;
const SPACE_MOONLIT = { id: 7, name: 'Moonlit Island', realMoon: true, wx: 'clear' };

let astroClock = function () { return new Date(); };

function astroClamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function astroWrap(a) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}
function astroNow() {
  if (typeof qstr !== 'undefined' && qstr && typeof qstr.has === 'function' && qstr.has('utc')) {
    const t = Date.parse(qstr.get('utc'));
    if (!isNaN(t)) return new Date(t);
  }
  return astroClock();
}
// Days since J2000.0. Terrestrial Time is a minute ahead of UTC; the moon moves that far.
function astroDays(date) {
  return date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
}
function astroDeltaT(d) {
  const y = 2000 + d / 365.2425;
  let t;
  if (y < 1920) { t = y - 1900; return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197))); }
  if (y < 1941) { t = y - 1920; return 21.20 + t * (0.84493 + t * (-0.076100 + t * 0.0020936)); }
  if (y < 1961) { t = y - 1950; return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547)); }
  if (y < 1986) { t = y - 1975; return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718)); }
  if (y < 2005) { t = y - 2000; return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599)))); }
  if (y < 2050) { t = y - 2000; return 62.92 + t * (0.32217 + t * 0.005589); }
  t = (y - 1820) / 100;
  return -20 + 32 * t * t - 0.5628 * (2150 - y);
}
function astroDaysTT(d) { return d + astroDeltaT(d) / 86400; }

// Local mean solar time `hour` on the UTC civil date of the clock, plus env.astroDay
// when the chosen night runs past midnight. `day` overrides that offset.
function astroDateAtLocalHour(hour, day) {
  const now = astroNow();
  const utc0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const extra = day == null ? ((typeof env !== 'undefined' && env.astroDay) || 0) : day;
  return new Date(utc0 + (hour + extra * 24 - ASTRO_LON_DEG / 15) * 3600000);
}

function astroNutation(t) {
  const om = (125.04452 - 1934.136261 * t) * Math.PI / 180;
  const ls = (280.4665 + 36000.7698 * t) * Math.PI / 180;
  const lm = (218.3165 + 481267.8813 * t) * Math.PI / 180;
  const dpsi = (-17.20 * Math.sin(om) - 1.32 * Math.sin(2 * ls) - 0.23 * Math.sin(2 * lm) + 0.21 * Math.sin(2 * om)) / 3600;
  const deps = (9.20 * Math.cos(om) + 0.57 * Math.cos(2 * ls) + 0.10 * Math.cos(2 * lm) - 0.09 * Math.cos(2 * om)) / 3600;
  const eps0 = 23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504));
  return { dpsi: dpsi, eps: (eps0 + deps) * Math.PI / 180 };
}

// Meeus table 47.A. Rows of D, M, M', F, longitude in 1e-6 deg, distance in 1e-3 km.
const ASTRO_MOON_LON = new Int32Array([
  0, 0, 1, 0, 6288774, -20905355,
  2, 0, -1, 0, 1274027, -3699111,
  2, 0, 0, 0, 658314, -2955968,
  0, 0, 2, 0, 213618, -569925,
  0, 1, 0, 0, -185116, 48888,
  0, 0, 0, 2, -114332, -3149,
  2, 0, -2, 0, 58793, 246158,
  2, -1, -1, 0, 57066, -152138,
  2, 0, 1, 0, 53322, -170733,
  2, -1, 0, 0, 45758, -204586,
  0, 1, -1, 0, -40923, -129620,
  1, 0, 0, 0, -34720, 108743,
  0, 1, 1, 0, -30383, 104755,
  2, 0, 0, -2, 15327, 10321,
  0, 0, 1, 2, -12528, 0,
  0, 0, 1, -2, 10980, 79661,
  4, 0, -1, 0, 10675, -34782,
  0, 0, 3, 0, 10034, -23210,
  4, 0, -2, 0, 8548, -21636,
  2, 1, -1, 0, -7888, 24208,
  2, 1, 0, 0, -6766, 30824,
  1, 0, -1, 0, -5163, -8379,
  1, 1, 0, 0, 4987, -16675,
  2, -1, 1, 0, 4036, -12831,
  2, 0, 2, 0, 3994, -10445,
  4, 0, 0, 0, 3861, -11650,
  2, 0, -3, 0, 3665, 14403,
  0, 1, -2, 0, -2689, -7003,
  2, 0, -1, 2, -2602, 0,
  2, -1, -2, 0, 2390, 10056,
  1, 0, 1, 0, -2348, 6322,
  2, -2, 0, 0, 2236, -9884,
  0, 1, 2, 0, -2120, 5751,
  0, 2, 0, 0, -2069, 0,
  2, -2, -1, 0, 2048, -4950,
  2, 0, 1, -2, -1773, 4130,
  2, 0, 0, 2, -1595, 0,
  4, -1, -1, 0, 1215, -3958,
  0, 0, 2, 2, -1110, 0,
  3, 0, -1, 0, -892, 3258,
  2, 1, 1, 0, -810, 2616,
  4, -1, -2, 0, 759, -1897,
  0, 2, -1, 0, -713, -2117,
  2, 2, -1, 0, -700, 2354,
  2, 1, -2, 0, 691, 0,
  2, -1, 0, -2, 596, 0,
  4, 0, 1, 0, 549, -1423,
  0, 0, 4, 0, 537, -1117,
  4, -1, 0, 0, 520, -1571,
  1, 0, -2, 0, -487, -1739,
  2, 1, 0, -2, -399, 0,
  0, 0, 2, -2, -381, -4421,
  1, 1, 1, 0, 351, 0,
  3, 0, -2, 0, -340, 0,
  4, 0, -3, 0, 330, 0,
  2, -1, 2, 0, 327, 0,
  0, 2, 1, 0, -323, 1165,
  1, 1, -1, 0, 299, 0,
  2, 0, 3, 0, 294, 0,
  2, 0, -1, -2, 0, 8752
]);
// Meeus table 47.B. Rows of D, M, M', F, latitude in 1e-6 deg.
const ASTRO_MOON_LAT = new Int32Array([
  0, 0, 0, 1, 5128122,
  0, 0, 1, 1, 280602,
  0, 0, 1, -1, 277693,
  2, 0, 0, -1, 173237,
  2, 0, -1, 1, 55413,
  2, 0, -1, -1, 46271,
  2, 0, 0, 1, 32573,
  0, 0, 2, 1, 17198,
  2, 0, 1, -1, 9266,
  0, 0, 2, -1, 8822,
  2, -1, 0, -1, 8216,
  2, 0, -2, -1, 4324,
  2, 0, 1, 1, 4200,
  2, 1, 0, -1, -3359,
  2, -1, -1, 1, 2463,
  2, -1, 0, 1, 2211,
  2, -1, -1, -1, 2065,
  0, 1, -1, -1, -1870,
  4, 0, -1, -1, 1828,
  0, 1, 0, 1, -1794,
  0, 0, 0, 3, -1749,
  0, 1, -1, 1, -1565,
  1, 0, 0, 1, -1491,
  0, 1, 1, 1, -1475,
  0, 1, 1, -1, -1410,
  0, 1, 0, -1, -1344,
  1, 0, 0, -1, -1335,
  0, 0, 3, 1, 1107,
  4, 0, 0, -1, 1021,
  4, 0, -1, 1, 833,
  0, 0, 1, -3, 777,
  4, 0, -2, 1, 671,
  2, 0, 0, -3, 607,
  2, 0, 2, -1, 596,
  2, -1, 1, -1, 491,
  2, 0, -2, 1, -451,
  0, 0, 3, -1, 439,
  2, 0, 2, 1, 422,
  2, 0, -3, -1, 421,
  2, 1, -1, 1, -366,
  2, 1, 0, 1, -351,
  4, 0, 0, 1, 331,
  2, -1, 1, 1, 315,
  2, -2, 0, -1, 302,
  0, 0, 1, 3, -283,
  2, 1, 1, -1, -229,
  1, 1, 0, -1, 223,
  1, 1, 0, 1, 223,
  0, 1, -2, -1, -220,
  2, 1, -1, -1, -220,
  1, 0, 1, 1, -185,
  2, -1, -2, -1, 181,
  0, 1, 2, 1, -177,
  4, 0, -2, -1, 176,
  4, -1, -1, -1, 166,
  1, 0, 1, -1, -164,
  4, 0, 1, -1, 132,
  1, 0, -1, -1, -119,
  4, -1, 0, -1, 115,
  2, -2, 0, 1, 107
]);

function astroMoonCoords(d) {
  const t = d / 36525;
  const Lp = 218.3164477 + t * (481267.88123421 + t * (-0.0015786 + t * (1 / 538841 - t / 65194000)));
  const D = 297.8501921 + t * (445267.1114034 + t * (-0.0018819 + t * (1 / 545868 - t / 113065000)));
  const M = 357.5291092 + t * (35999.0502909 + t * (-0.0001536 + t / 24490000));
  const Mp = 134.9633964 + t * (477198.8675055 + t * (0.0087414 + t * (1 / 69699 - t / 14712000)));
  const F = 93.2720950 + t * (483202.0175233 + t * (-0.0036539 + t * (-1 / 3526000 + t / 863310000)));
  const E = 1 - t * (0.002516 + t * 0.0000074);
  const Dr = D * Math.PI / 180, Mr = M * Math.PI / 180, Mpr = Mp * Math.PI / 180, Fr = F * Math.PI / 180;
  let sl = 0, sr = 0, sb = 0;
  for (let i = 0; i < ASTRO_MOON_LON.length; i += 6) {
    const m = ASTRO_MOON_LON[i + 1];
    const arg = ASTRO_MOON_LON[i] * Dr + m * Mr + ASTRO_MOON_LON[i + 2] * Mpr + ASTRO_MOON_LON[i + 3] * Fr;
    const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
    sl += ASTRO_MOON_LON[i + 4] * f * Math.sin(arg);
    sr += ASTRO_MOON_LON[i + 5] * f * Math.cos(arg);
  }
  for (let i = 0; i < ASTRO_MOON_LAT.length; i += 5) {
    const m = ASTRO_MOON_LAT[i + 1];
    const arg = ASTRO_MOON_LAT[i] * Dr + m * Mr + ASTRO_MOON_LAT[i + 2] * Mpr + ASTRO_MOON_LAT[i + 3] * Fr;
    const f = m === 1 || m === -1 ? E : m === 2 || m === -2 ? E * E : 1;
    sb += ASTRO_MOON_LAT[i + 4] * f * Math.sin(arg);
  }
  const A1 = (119.75 + 131.849 * t) * Math.PI / 180;
  const A2 = (53.09 + 479264.290 * t) * Math.PI / 180;
  const A3 = (313.45 + 481266.484 * t) * Math.PI / 180;
  const Lpr = Lp * Math.PI / 180;
  sl += 3958 * Math.sin(A1) + 1962 * Math.sin(Lpr - Fr) + 318 * Math.sin(A2);
  sb += -2235 * Math.sin(Lpr) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - Fr) + 175 * Math.sin(A1 + Fr) + 127 * Math.sin(Lpr - Mpr) - 115 * Math.sin(Lpr + Mpr);
  const nut = astroNutation(t);
  const lon = (Lp + sl / 1e6 + nut.dpsi) * Math.PI / 180;
  const lat = (sb / 1e6) * Math.PI / 180;
  const eps = nut.eps;
  return {
    ra: Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)),
    dec: Math.asin(astroClamp(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon), -1, 1)),
    dist: 385000.56 + sr / 1000,
    lon: lon
  };
}
function astroSunCoords(d) {
  const t = d / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) * Math.PI / 180;
  const M = (357.52911 + t * (35999.05029 - t * 0.0001537)) * Math.PI / 180;
  const sinM = Math.sin(M), cosM = Math.cos(M);
  const C = ((1.914602 - t * (0.004817 + t * 0.000014)) * sinM + (0.019993 - 0.000101 * t) * 2 * sinM * cosM + 0.000289 * sinM * (3 - 4 * sinM * sinM)) * Math.PI / 180;
  const Om = (125.04 - 1934.136 * t) * Math.PI / 180;
  const lon = L0 + C - (0.00569 + 0.00478 * Math.sin(Om)) * Math.PI / 180;
  const eps = (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) * Math.PI / 180 + 0.00256 * Math.cos(Om) * Math.PI / 180;
  return {
    ra: Math.atan2(Math.cos(eps) * Math.sin(lon), Math.cos(lon)),
    dec: Math.asin(astroClamp(Math.sin(eps) * Math.sin(lon), -1, 1)),
    lon: lon
  };
}
function astroIllum(sun, moon) {
  const phi = Math.acos(astroClamp(Math.sin(sun.dec) * Math.sin(moon.dec) + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra), -1, 1));
  const inc = Math.atan2(ASTRO_SUN_KM * Math.sin(phi), moon.dist - ASTRO_SUN_KM * Math.cos(phi));
  let phase = ((moon.lon - sun.lon) / (Math.PI * 2)) % 1;
  if (phase < 0) phase += 1;
  return { fraction: (1 + Math.cos(inc)) / 2, phase: phase };
}
function astroLST(d) {
  return (280.46061837 + 360.98564736629 * d) * Math.PI / 180 - (-ASTRO_LON);
}
// Azimuth is from north toward east. Hour angle is positive to the west.
function astroHoriz(H, lat, dec) {
  const alt = Math.asin(astroClamp(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), -1, 1));
  const raw = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  return { alt: alt, az: astroWrap(raw + Math.PI * 3) };
}
function astroRefract(h) {
  const x = h < 0 ? 0 : h;
  return 0.0002967 / Math.tan(x + 0.00312536 / (x + 0.08901179));
}
function astroBasis() {
  if (astroBasis.B) return astroBasis.B;
  const e = envSunAt(6);
  const el = Math.hypot(e[0], e[2]) || 1;
  const ex = e[0] / el, ez = e[2] / el;
  astroBasis.B = { ex: ex, ez: ez, nx: -ez, nz: ex };
  return astroBasis.B;
}
function astroDir(alt, az, basis) {
  const c = Math.cos(alt);
  const east = Math.sin(az) * c, north = Math.cos(az) * c;
  const x = basis.ex * east + basis.nx * north;
  const y = Math.sin(alt);
  const z = basis.ez * east + basis.nz * north;
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}
// Inverse of astroDir + astroHoriz, for the star texture. The shader uses the same sum.
function astroDirToRaDec(rd, lst, lat, basis) {
  const east = rd[0] * basis.ex + rd[2] * basis.ez;
  const north = rd[0] * basis.nx + rd[2] * basis.nz;
  const alt = Math.asin(astroClamp(rd[1], -1, 1));
  const az = Math.atan2(east, north);
  const sinDec = Math.sin(alt) * Math.sin(lat) + Math.cos(alt) * Math.cos(lat) * Math.cos(az);
  const dec = Math.asin(astroClamp(sinDec, -1, 1));
  const cosDec = Math.max(Math.cos(dec), 1e-5);
  const sinH = -Math.sin(az) * Math.cos(alt) / cosDec;
  const cosH = (Math.sin(alt) - Math.sin(dec) * Math.sin(lat)) / (cosDec * Math.cos(lat));
  const H = Math.atan2(sinH, cosH);
  return { ra: lst - H, dec: dec, alt: alt, az: az };
}
function astroAt(date) {
  const d = astroDays(date);
  const moon = astroMoonCoords(astroDaysTT(d));
  const sun = astroSunCoords(astroDaysTT(d));
  const ill = astroIllum(sun, moon);
  const lst = astroLST(d);
  const geo = astroHoriz(lst - moon.ra, ASTRO_LAT, moon.dec);
  const parallax = Math.asin(astroClamp(ASTRO_EARTH_KM / moon.dist * Math.cos(geo.alt), -1, 1));
  // Apparent altitude, the same sum SunCalc reports: refraction is the horizon value below the sea.
  const h = geo.alt - parallax;
  const alt = h + astroRefract(h);
  const basis = astroBasis();
  const sgeo = astroHoriz(lst - sun.ra, ASTRO_LAT, sun.dec);
  return {
    ra: moon.ra, dec: moon.dec, dist: moon.dist, lon: moon.lon,
    alt: alt, az: geo.az, lst: astroWrap(lst),
    illum: ill.fraction, phase: ill.phase,
    rad: Math.asin(astroClamp(ASTRO_MOON_KM / moon.dist, 0, 1)),
    moonDir: astroDir(alt, geo.az, basis),
    sunDir: astroDir(sgeo.alt, sgeo.az, basis),
    basis: basis
  };
}

// Galactic coordinates, J2000. The band of the Milky Way is galactic latitude.
const ASTRO_GN_RA = 192.85948 * Math.PI / 180;
const ASTRO_GN_DEC = 27.12825 * Math.PI / 180;
const ASTRO_GL0 = 122.93191857 * Math.PI / 180;
function astroGalactic(ra, dec) {
  const sd = Math.sin(dec), cd = Math.cos(dec);
  const cra = Math.cos(ra - ASTRO_GN_RA), sra = Math.sin(ra - ASTRO_GN_RA);
  const sb = sd * Math.sin(ASTRO_GN_DEC) + cd * Math.cos(ASTRO_GN_DEC) * cra;
  const b = Math.asin(astroClamp(sb, -1, 1));
  const y = cd * sra;
  const x = sd * Math.cos(ASTRO_GN_DEC) - cd * Math.sin(ASTRO_GN_DEC) * cra;
  return { l: astroWrap(ASTRO_GL0 - Math.atan2(y, x)), b: b };
}

function astroB64(s) {
  const bin = atob(s);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  return raw;
}
function astroCatalog() {
  if (astroCatalog.cache) return astroCatalog.cache;
  const stars = [];
  try {
    const sb = astroB64(ASTRO_STARS_B64);
    const sv = new DataView(sb.buffer, sb.byteOffset, sb.byteLength);
    for (let i = 0; i < sb.length; i += 6) {
      stars.push({
        ra: sv.getUint16(i, true) / 65535 * Math.PI * 2,
        dec: sv.getInt16(i + 2, true) / 32767 * 90 * Math.PI / 180,
        mag: sv.getUint8(i + 4) / 25 - 2,
        bv: sv.getInt8(i + 5) / 50 - 0.4
      });
    }
  } catch (err) {
    stars.length = 0;
  }
  astroCatalog.cache = { stars: stars };
  return astroCatalog.cache;
}
// Spatial hash of Hipparcos for procedural nightSky (STAR_GW×STAR_GH in sky.js).
// Layout: [0 .. GW*GH) vec4(start, count, 0, 0); then star records vec4(ra, dec, mag, bv).
const ASTRO_STAR_GW = 64;
const ASTRO_STAR_GH = 32;
function astroStarBuffer(device) {
  const cat = astroCatalog();
  const GW = ASTRO_STAR_GW, GH = ASTRO_STAR_GH;
  const cells = new Array(GW * GH);
  for (let i = 0; i < cells.length; i++) cells[i] = [];
  for (let i = 0; i < cat.stars.length; i++) {
    const s = cat.stars[i];
    const cx = Math.min(GW - 1, Math.max(0, (s.ra / (Math.PI * 2) * GW) | 0));
    const cy = Math.min(GH - 1, Math.max(0, ((s.dec / Math.PI + 0.5) * GH) | 0));
    cells[cy * GW + cx].push(s);
  }
  let total = 0;
  for (let i = 0; i < cells.length; i++) total += cells[i].length;
  const data = new Float32Array(GW * GH * 4 + total * 4);
  let cursor = GW * GH;
  for (let i = 0; i < cells.length; i++) {
    const list = cells[i];
    data[i * 4] = cursor;
    data[i * 4 + 1] = list.length;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const o = cursor * 4;
      data[o] = s.ra;
      data[o + 1] = s.dec;
      data[o + 2] = s.mag;
      data[o + 3] = s.bv;
      cursor++;
    }
  }
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(buf.getMappedRange()).set(data);
  buf.unmap();
  return buf;
}

function astroPhaseName(phase, illum) {
  if (illum > 0.98) return 'Full moon';
  if (illum < 0.02) return 'New moon';
  if (phase < 0.22) return 'Waxing crescent';
  if (phase < 0.28) return 'First quarter';
  if (phase < 0.47) return 'Waxing gibbous';
  if (phase < 0.53) return 'Full moon';
  if (phase < 0.72) return 'Waning gibbous';
  if (phase < 0.78) return 'Last quarter';
  return 'Waning crescent';
}
// The local hour tonight when the real moon stands highest, from late afternoon through
// the next morning. Past midnight the clock stays in 0..24 and astroDay carries the date.
// If the moon never clears the horizon, the night stays at 22:30 and the sky is stars alone.
function astroMoonlitHour() {
  let best = 22.5, bestAlt = -2;
  for (let i = 0; i <= 64; i++) {
    const h = 16 + i * 0.25;
    // Past the island's twilight. A sun only just set still leaves a bright blue sky.
    if (envSunAt(h)[1] > -0.16) continue;
    const sky = astroAt(astroDateAtLocalHour(h, 0));
    if (sky.alt > bestAlt) { bestAlt = sky.alt; best = h; }
  }
  if (bestAlt < 8 * Math.PI / 180) return { hour: 22.5, day: 0 };
  if (best >= 24) return { hour: best - 24, day: 1 };
  return { hour: best, day: 0 };
}
function applySpace7(opt) {
  opt = opt || {};
  env.spaceId = SPACE_MOONLIT.id;
  if (!opt.keepMoon) env.realMoon = SPACE_MOONLIT.realMoon;
  if (!opt.keepHour) {
    const pick = astroMoonlitHour();
    env.hour = pick.hour;
    env.astroDay = pick.day;
    env.goal = null;
    env.run = false;
  }
  if (!opt.keepWx) { envSet(SPACE_MOONLIT.wx, true); env.auto = false; }
}
// Puts the real moon, or the old staged one, into env for this frame.
function astroSync(env) {
  const sky = astroAt(astroDateAtLocalHour(env.hour));
  const B = sky.basis;
  let moon, sun, illum, real, rad, phase;
  if (env.realMoon === false) {
    const staged = envSunAt(env.hour + 12.6);
    const len = Math.hypot(staged[0], staged[1], staged[2]) || 1;
    moon = [staged[0] / len, staged[1] / len, staged[2] / len];
    sun = [-moon[0], -moon[1], -moon[2]];
    illum = 1; real = 0; rad = 0.00465; phase = 0.5;
  } else {
    moon = sky.moonDir; sun = sky.sunDir;
    illum = sky.illum; real = 1; rad = sky.rad; phase = sky.phase;
  }
  env.moon = moon;
  env.astro = {
    lst: sky.lst, illum: illum, rad: rad, real: real, sun: sun, moonK: 0,
    ex: B.ex, ez: B.ez, nx: B.nx, nz: B.nz,
    alt: Math.asin(astroClamp(moon[1], -1, 1)), az: sky.az,
    ra: sky.ra, dec: sky.dec, dist: sky.dist, phase: phase
  };
  if (typeof window !== 'undefined') window.__astro = env.astro;
}
