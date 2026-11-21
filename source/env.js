// The air over the island: one clock, one weather, one wind. The light, the clouds, the
// haze, the rain, the plants, the sea, the animals and the sound all read this state, so
// a gust that bends the palms is the same gust that moves the cloud shadow and the spray.

// The hour the place opens at. The sun then stands where the views were framed for.
const ENV_H0 = 15.8;
// name, cloud cover, rain, ground mist, humidity, wind in m/s, gustiness
const WEATHER = {
  clear: ['Clear', 0, 0, 0, 0.25, 4.5, 0.35],
  clouds: ['Passing clouds', 0.26, 0, 0, 0.35, 6, 0.5],
  gusts: ['Wind gusts', 0.3, 0, 0, 0.3, 11, 1],
  overcast: ['Overcast', 0.8, 0, 0, 0.55, 5, 0.4],
  drizzle: ['Light rain', 0.86, 0.3, 0.06, 0.8, 4, 0.35],
  shower: ['Tropical shower', 0.95, 1, 0.05, 1, 9, 0.9],
  after: ['After the rain', 0.3, 0, 0.12, 0.8, 2.5, 0.25],
  mist: ['Mist', 0.08, 0, 1, 0.85, 1.2, 0.1]
};
// What tends to follow what. A shower builds, falls and clears; it does not switch on.
const WX_NEXT = {
  clear: ['clear', 'clouds', 'clouds', 'gusts'], clouds: ['clear', 'clouds', 'overcast', 'gusts'], gusts: ['clouds', 'clear'],
  overcast: ['drizzle', 'clouds', 'shower'], drizzle: ['shower', 'overcast', 'after'], shower: ['after', 'drizzle'],
  after: ['clouds', 'clear', 'mist'], mist: ['clear', 'clouds']
};
const DAY_STOPS = [[6.2, 'First light'], [8, 'Morning'], [12, 'Midday'], [ENV_H0, 'Afternoon'], [17.35, 'Golden hour'], [18.02, 'Sunset'], [18.55, 'Blue hour'], [22.5, 'Night']];
const env = {
  hour: ENV_H0, rate: 1 / 240, run: true, goal: null,
  wx: 'clear', auto: true, hold: 200,
  v: WEATHER.clear.slice(1), wet: 0, sea: 1,
  ang: 0.36, angGoal: 0.36, wx0: 1, wz0: 0, speed: 4.5, gust: 0.35, cloud: [0, 0], gustOff: [0, 0],
  sun: [0, 1, 0], moon: [0, -1, 0], key: [0, 1, 0], keyCol: [1, 1, 1], amb: [0.34, 0.48, 0.7], disc: [1, 1, 1],
  gnd: 1, expo: 0.92, expoSmooth: null, night: 0, moonUp: 0, mist: 0, humid: 0.25, haze: 0, cover: 0, dew: 0,
  day: [1, 1, 1], gold: 0, airMass: 1
};
const envLum = (c) => c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
function envSunAt(h) {
  if (!env.basis) {
    // A tilted circle through the framed afternoon sun: overhead-ish at noon, on the horizon at six.
    const a0 = (ENV_H0 - 12) * Math.PI / 12, s = Math.sin(a0), c = Math.cos(a0);
    const az = Math.atan2(SUN[2], SUN[0]) + Math.acos(Math.min(1, s / Math.hypot(SUN[0], SUN[2])));
    const wx = Math.cos(az), wz = Math.sin(az);
    env.basis = [(SUN[0] - wx * s) / c, SUN[1] / c, (SUN[2] - wz * s) / c, wx, wz];
  }
  const B = env.basis, a = (h - 12) * Math.PI / 12, c = Math.cos(a), s = Math.sin(a);
  return [B[0] * c + B[3] * s, B[1] * c, B[2] * c + B[4] * s];
}
// How much air a ray from the sun crosses, in units of the air straight overhead.
function envAirMass(sy) {
  const el = Math.asin(Math.max(0, Math.min(1, sy))) * 57.2958;
  return 1 / (Math.max(sy, 0) + 0.15 * Math.pow(el + 3.885, -1.253));
}
function envLight(cover) {
  const sun = envSunAt(env.hour), sy = sun[1];
  const moon = envSunAt(env.hour + 12.6);
  // Sunlight reddens with the length of its path: blue is scattered out of the beam first.
  const am = envAirMass(sy);
  const k = am - envAirMass(SUN[1]);
  env.airMass = am;
  const tr = [Math.exp(-0.05 * k), Math.exp(-0.095 * k), Math.exp(-0.19 * k)];
  // Direct solar contribution is fully off once the disc is gone; twilight is amb-only.
  const up = smooth01(-0.02, 0.05, sy);
  const night = smooth01(0.02, -0.18, sy), moonUp = smooth01(0.02, 0.2, moon[1]);
  // Whichever is up lights the ground. Through twilight neither does, and the sky is all there is.
  const day = sy > -0.06, src = day ? sun : moon, ky = Math.max(src[1], day ? 0.12 : 0.2);
  const f = src[1] >= ky ? 1 : Math.sqrt(1 - ky * ky) / (Math.hypot(src[0], src[2]) || 1);
  env.key = [src[0] * f, f === 1 ? src[1] : ky, src[2] * f];
  const mk = 0.035 * smooth01(-0.08, -0.2, sy) * moonUp;
  // Golden hour: warm directional light peaking as the sun nears the horizon — not a global orange wash.
  const gold = smooth01(0.42, 0.04, sy) * smooth01(-0.18, -0.02, sy);
  env.gold = gold;
  const dayK = smooth01(-0.1, 0.4, sy), low = 1 - smooth01(0, 0.35, sy);
  if (day) {
    // Photographic key: midday restrained; golden hour warm without clipping highlights.
    const rad = (1.35 + 0.82 * dayK) * (1 - 0.58 * cover) * (1 + 0.32 * gold);
    env.keyCol = [
      1.08 * tr[0] * up * rad * (1 + 0.58 * gold),
      0.96 * tr[1] * up * rad * (1 + 0.1 * gold),
      0.8 * tr[2] * up * rad * (1 - 0.38 * gold)
    ];
  } else {
    env.keyCol = [0.55 * mk, 0.7 * mk, mk];
  }
  const tw = smooth01(-0.24, -0.04, sy) * (1 - smooth01(-0.04, 0.2, sy)), nk = night * (0.5 + 0.5 * moonUp);
  // Cooler blue ambient in open shade; warmer only from the key, not the whole hemisphere.
  const amb = [
    dayK * (0.30 + 0.04 * low) * (1 - 0.22 * gold) + tw * 0.045 + nk * 0.004,
    dayK * (0.46 - 0.02 * low) * (1 + 0.06 * gold) + tw * 0.055 + nk * 0.006,
    dayK * (0.72 - 0.08 * low) * (1 + 0.38 * gold) + tw * 0.11 + nk * 0.012
  ];
  // Under cloud the whole sky is the lamp: grey, and about as bright as a clear sky's blue.
  const g = envLum(amb) * 1.12, oc = cover * 0.85;
  env.amb = [amb[0] + (g * 0.96 - amb[0]) * oc, amb[1] + (g - amb[1]) * oc, amb[2] + (g * 1.05 - amb[2]) * oc];
  // All the light reaching open ground, and the same thing as a colour for whatever has no
  // light of its own in the shaders: foam, and the glow of the water's own body.
  const kd = env.key[1] * (1 - 0.85 * cover);
  const D = [0, 1, 2].map((i) => env.keyCol[i] * kd + env.amb[i]);
  const L = envLum(D);
  if (!env.L0) { env.L0 = L; env.D0 = D; }
  env.day = D.map((d, i) => d / env.D0[i]);
  // The eye and the camera both open up as the light goes, but not all the way.
  env.gnd = L / env.L0;
  // Exposure target: preserve deep shadows and bright shafts; adaptation is applied in envStep.
  const Lc = envLum(env.keyCol) * env.key[1] + envLum(amb);
  env.expo = 0.88 * Math.min(4.8, Math.pow(env.L0 / Math.max(Lc, 1e-4), 0.55))
    * Math.pow(Lc / Math.max(L, 1e-4), 0.22);
  const dv = smooth01(-0.03, 0.01, sy);
  // Disc colour stays warm at golden hour without turning the whole sky orange.
  env.disc = [
    1.25 * tr[0] * dv * (1 + 0.35 * gold),
    1.0 * tr[1] * dv * (1 + 0.05 * gold),
    0.82 * tr[2] * dv * (1 - 0.25 * gold)
  ];
  env.sun = sun; env.moon = moon; env.night = night; env.moonUp = moonUp;
}
function envSet(wx, snap) {
  if (!WEATHER[wx]) return;
  env.wx = wx; env.hold = 150 + Math.random() * 240;
  if (snap) { env.v = WEATHER[wx].slice(1); env.wet = wx === 'after' ? 0.85 : env.v[1] > 0 ? 1 : 0; }
}
function envStep(dt, time, placeCover, placeHaze, seaDir, seaAmp) {
  if (env.goal != null) {
    let d = (env.goal - env.hour + 24) % 24;
    const st = Math.min(d, dt * 1.6);
    env.hour += st;
    if (d - st < 1e-3) env.goal = null;
  } else if (env.run) env.hour += dt * env.rate;
  env.hour = (env.hour + 24) % 24;
  if (env.auto) {
    env.hold -= dt;
    if (env.hold < 0) { const n = WX_NEXT[env.wx]; envSet(n[(Math.random() * n.length) | 0], false); }
  }
  const T = WEATHER[env.wx], v = env.v, tau = [30, 14, 40, 30, 12, 12];
  for (let i = 0; i < 6; i++) v[i] += (T[i + 1] - v[i]) * (1 - Math.exp(-dt / tau[i]));
  const sy0 = envSunAt(env.hour)[1];
  env.cover = Math.max(placeCover, v[0]);
  // Rain wets everything in half a minute. The sun and the wind take minutes to dry it.
  env.wet = Math.max(0, Math.min(1, env.wet + dt * (v[1] * 0.05 - 0.004 * (1 + 2 * Math.max(sy0, 0) * (1 - env.cover)))));
  // Cool still air at first light holds mist in the hollows; the climbing sun burns it off.
  const dawn = smooth01(4.5, 6, env.hour) * (1 - smooth01(7, 9.5, env.hour));
  const heat = smooth01(0.12, 0.6, sy0) * (1 - env.cover);
  env.dew = 0.4 * dawn;
  env.mist = Math.max(v[2], 0.6 * dawn) * (1 - 0.75 * heat) * (1 - smooth01(4, 9, v[4]) * 0.8);
  env.humid = Math.min(1, v[3] + 0.3 * dawn + 0.15 * smooth01(0, -0.2, sy0));
  env.haze = Math.min(1, placeHaze + Math.max(0, env.humid - 0.25) * 0.9);
  // Trade wind follows the sea, with slow backing/veering — never snaps between frames.
  const angGoal = seaDir + 0.36 + 0.3 * Math.sin(time * 0.013) + 0.15 * Math.sin(time * 0.031 + 1);
  env.angGoal = angGoal;
  let dAng = angGoal - env.ang;
  while (dAng > Math.PI) dAng -= Math.PI * 2;
  while (dAng < -Math.PI) dAng += Math.PI * 2;
  env.ang += dAng * (1 - Math.exp(-dt / 8));
  env.wx0 = Math.cos(env.ang); env.wz0 = Math.sin(env.ang);
  // Night and still weather ease the trades; showers and gusts lift them.
  const nightCalm = 1 - 0.35 * smooth01(0.08, -0.1, sy0);
  const wxBoost = 0.55 + 0.45 * Math.min(seaAmp, 1.5) + 0.15 * v[1] + 0.1 * v[5];
  env.speed += (v[4] * wxBoost * nightCalm - env.speed) * (1 - Math.exp(-dt / 3.5));
  env.gust += (v[5] - env.gust) * (1 - Math.exp(-dt / 4));
  env.sea = 0.72 + 0.28 * (env.speed / 4.5);
  // Cloud rides faster air than the ground feels. Gust cells travel slower than the wind in them.
  env.cloud[0] += env.wx0 * env.speed * 1.9e-3 * dt; env.cloud[1] += env.wz0 * env.speed * 1.9e-3 * dt;
  // Wrap so cloud noise stays in a stable coordinate domain overnight and across long sessions.
  env.cloud[0] = ((env.cloud[0] % 48) + 48) % 48;
  env.cloud[1] = ((env.cloud[1] % 48) + 48) % 48;
  env.gustOff[0] += env.wx0 * env.speed * 0.6 * dt; env.gustOff[1] += env.wz0 * env.speed * 0.6 * dt;
  envLight(env.cover);
  // Gradual exposure adaptation: forest shade vs bright lagoon should feel like one eye opening.
  const target = env.expo;
  if (env.expoSmooth == null) env.expoSmooth = target;
  const tauE = target > env.expoSmooth ? 0.9 : 1.8;
  env.expoSmooth += (target - env.expoSmooth) * (1 - Math.exp(-Math.max(dt, 1e-3) / tauE));
  env.expo = env.expoSmooth;
}
// The wind at a place in m/s. Matches the GPU windAt gust cells so plants, insects, spray
// and audio all feel the same travelling weather.
function envWindAt(x, z) {
  const px = x - env.gustOff[0], pz = z - env.gustOff[1];
  const g0 = vnoise(px * 0.018, pz * 0.018);
  const g1 = vnoise(px * 0.07 + 7, pz * 0.07 + 3);
  const g = g0 * 0.6 + g1 * 0.4;
  return env.speed * (1 + (g * g * 2.6 - 0.7) * env.gust);
}
function envLabel() {
  const h = env.goal != null ? env.goal : env.hour;
  let name = 'Night';
  for (const s of DAY_STOPS) if (h >= s[0] - 0.6) name = s[1];
  if (h < 5.6) name = 'Night';
  const m = Math.round(h * 60) % 1440;
  return { title: name + ' · ' + String((m / 60) | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'), line: WEATHER[env.wx][0] };
}
function envNextStop(back) {
  const n = DAY_STOPS.length;
  // Count from where the clock is already headed, so two presses go two stops on.
  const from = env.goal != null ? env.goal : env.hour;
  let i = DAY_STOPS.findIndex((s) => s[0] > from + 0.05);
  if (i < 0) i = 0;
  if (back) i = (i - 2 + n * 2) % n;
  env.goal = DAY_STOPS[i][0];
}
// Shown in the uniform block as eight vec4 after the shadow matrices.
function envWrite(arr, o, sunAng, sunK) {
  const ca = Math.cos(sunAng), sa = Math.sin(sunAng);
  const rot = (d, at, w) => { arr[at] = d[0] * ca - d[2] * sa; arr[at + 1] = d[1]; arr[at + 2] = d[0] * sa + d[2] * ca; arr[at + 3] = w; };
  rot(env.key, 52, arr[55]);
  arr[56] = env.keyCol[0] * sunK; arr[57] = env.keyCol[1] * sunK; arr[58] = env.keyCol[2] * sunK; arr[59] = env.expo;
  arr[o] = env.amb[0]; arr[o + 1] = env.amb[1]; arr[o + 2] = env.amb[2]; arr[o + 3] = env.gnd;
  rot(env.sun, o + 4, env.night);
  rot(env.moon, o + 8, env.night * env.moonUp);
  arr[o + 12] = env.wx0; arr[o + 13] = env.wz0; arr[o + 14] = env.speed; arr[o + 15] = env.gust;
  arr[o + 16] = env.cloud[0]; arr[o + 17] = env.cloud[1]; arr[o + 18] = env.gustOff[0]; arr[o + 19] = env.gustOff[1];
  arr[o + 20] = env.v[1]; arr[o + 21] = Math.max(env.wet, env.dew); arr[o + 22] = env.mist; arr[o + 23] = env.humid;
  arr[o + 24] = env.disc[0] * sunK; arr[o + 25] = env.disc[1] * sunK; arr[o + 26] = env.disc[2] * sunK; arr[o + 27] = env.airMass;
  for (let i = 0; i < 3; i++) { arr[o + 28 + i] = env.day[i]; arr[140 + i] *= env.day[i]; arr[144 + i] *= env.day[i]; }
  arr[o + 31] = env.gold;
}
