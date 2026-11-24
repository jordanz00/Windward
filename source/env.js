// The air over the island: one clock, one weather, one wind. The light, the clouds, the
// haze, the rain, the plants, the sea, the animals and the sound all read this state, so
// a gust that bends the palms is the same gust that moves the cloud shadow and the spray.

// The hour the place opens at. The sun then stands where the views were framed for.
const ENV_H0 = 15.8;
// The hour the day opens at, and holds until the hour is first changed: the sun a hand above the sea.
const ENV_OPEN = 17.65;
// name, cloud cover, rain, ground mist, humidity, wind in m/s, gustiness, and then the sky:
// how much of the air holds cumulus, the stratocumulus deck, how unstable the air is (which is
// how deep cumulus grows and how many towers stand), and cirrus.
const WEATHER = {
  clear: ['Clear', 0, 0, 0, 0.25, 4.5, 0.35, 0.16, 0, 0.25, 0.35],
  clouds: ['Passing clouds', 0.26, 0, 0, 0.35, 6, 0.5, 0.36, 0, 0.45, 0.3],
  gusts: ['Wind gusts', 0.3, 0, 0, 0.3, 11, 1, 0.32, 0, 0.4, 0.55],
  overcast: ['Overcast', 0.8, 0, 0, 0.55, 5, 0.4, 0.35, 0.92, 0.3, 0.1],
  drizzle: ['Light rain', 0.86, 0.3, 0.06, 0.8, 4, 0.35, 0.3, 1, 0.35, 0],
  shower: ['Tropical shower', 0.95, 1, 0.05, 1, 9, 0.9, 0.55, 0.85, 1, 0.2],
  storm: ['Thunderstorm', 1, 1, 0.06, 1, 12.5, 1, 0.6, 1, 1, 0],
  after: ['After the rain', 0.3, 0, 0.12, 0.8, 2.5, 0.25, 0.28, 0.1, 0.85, 0.45],
  mist: ['Mist', 0.08, 0, 1, 0.85, 1.2, 0.1, 0.1, 0.1, 0.1, 0.2]
};
// What tends to follow what. A shower builds, falls and clears; it does not switch on.
const WX_NEXT = {
  clear: ['clear', 'clouds', 'clouds', 'gusts'], clouds: ['clear', 'clouds', 'overcast', 'gusts'], gusts: ['clouds', 'clear'],
  overcast: ['drizzle', 'clouds', 'shower'], drizzle: ['shower', 'overcast', 'after'], shower: ['after', 'drizzle', 'after', 'storm'], storm: ['shower', 'after'],
  after: ['clouds', 'clear', 'mist'], mist: ['clear', 'clouds']
};
const DAY_STOPS = [[6.2, 'First light'], [8, 'Morning'], [12, 'Midday'], [ENV_H0, 'Afternoon'], [ENV_OPEN, 'Golden hour'], [18.02, 'Sunset'], [18.55, 'Blue hour'], [22.5, 'Night']];
const env = {
  hour: ENV_H0, rate: 1 / 240, run: true, goal: null,
  wx: 'clear', auto: true, hold: 200,
  v: WEATHER.clear.slice(1), wet: 0, sea: 1,
  ang: 0.36, angGoal: 0.36, wx0: 1, wz0: 0, speed: 4.5, gust: 0.35, cloud: [0, 0], gustOff: [0, 0],
  sun: [0, 1, 0], moon: [0, -1, 0], key: [0, 1, 0], keyCol: [1, 1, 1], amb: [0.34, 0.48, 0.7], disc: [1, 1, 1],
  gnd: 1, expo: 0.92, expoSmooth: null, night: 0, moonUp: 0, mist: 0, humid: 0.25, haze: 0, cover: 0, dew: 0,
  day: [1, 1, 1], airMass: 1, low: 0,
  // The sky. Heights in km. Each layer of air has carried its clouds its own distance.
  sky: { cum: 0.16, conv: 0.25, base: 1, top: 3, cirrus: 0.35, deck: 0, deckBase: 1.5, deckThick: 0.45, depth: 1.2, lean: [0, 0], evo: 0, rise: 0, high: [0, 0], deckOff: [0, 0], tower: [0, 0] }
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
// What is left of sunlight at the sea, red, green and blue. The same sum as sunT in the
// sky's shaders, so the light on the sand is the colour of the light on the clouds.
function envChap(X, c) {
  const q = Math.sqrt(X);
  if (c >= 0) return q / (q * c + 1);
  const x0 = Math.sqrt(1 - c * c) * X;
  return 2 * Math.sqrt(x0) * Math.exp(Math.min(X - x0, 60)) - q / (1 - q * c);
}
function envSunT(sy, haze) {
  const r = 8 * envChap(795, sy), m = 0.0231 * (0.7 + 1.7 * Math.max(0, Math.min(1, haze))) * 1.2 * envChap(5300, sy);
  return [0.0071, 0.0173, 0.0333].map((b) => Math.exp(-Math.min(b * r + m, 60)));
}
function envLight(cover) {
  const sun = envSunAt(env.hour), sy = sun[1];
  const moon = envSunAt(env.hour + 12.6);
  // Sunlight reddens with the length of its path: blue is scattered out of the beam first.
  // The sun above the air is one fixed colour; everything warm about a low sun is what the
  // air has taken out of it. It is set so the framed afternoon is lit as it was drawn.
  env.airMass = envAirMass(sy);
  if (!env.space) { const t0 = envSunT(SUN[1], 0); env.space = [1.98 / t0[0], 1.82 / t0[1], 1.51 / t0[2]]; }
  const tr = envSunT(sy, env.haze);
  // Direct solar contribution is fully off once the disc is gone; twilight is amb-only.
  const up = smooth01(-0.02, 0.05, sy);
  const night = smooth01(0.02, -0.18, sy), moonUp = smooth01(0.02, 0.2, moon[1]);
  // Whichever is up lights the ground. Through twilight neither does, and the sky is all there is.
  const day = sy > -0.06, src = day ? sun : moon, ky = Math.max(src[1], day ? 0.12 : 0.2);
  const f = src[1] >= ky ? 1 : Math.sqrt(1 - ky * ky) / (Math.hypot(src[0], src[2]) || 1);
  env.key = [src[0] * f, f === 1 ? src[1] : ky, src[2] * f];
  const mk = 0.035 * smooth01(-0.08, -0.2, sy) * moonUp;
  const dayK = smooth01(-0.1, 0.4, sy), low = 1 - smooth01(0, 0.35, sy);
  // The sky's own light turns bluer as the sun gets low and its direct light warms.
  const gold = smooth01(0.42, 0.04, sy) * smooth01(-0.18, -0.02, sy);
  env.keyCol = day ? env.space.map((c, i) => c * tr[i] * up) : [0.55 * mk, 0.7 * mk, mk];
  const tw = smooth01(-0.24, -0.04, sy) * (1 - smooth01(-0.04, 0.2, sy)), nk = night * (0.5 + 0.5 * moonUp);
  // Ambient carries shade detail; keep contrast via key strength, not by crushing fill.
  const amb = [
    dayK * (0.32 + 0.04 * low) * (1 - 0.2 * gold) + tw * 0.045 + nk * 0.004,
    dayK * (0.48 - 0.02 * low) * (1 + 0.05 * gold) + tw * 0.055 + nk * 0.006,
    dayK * (0.7 - 0.08 * low) * (1 + 0.32 * gold) + tw * 0.11 + nk * 0.012
  ];
  // Under cloud the sky is a grey lamp. Storm / heavy rain goes darker still — not a bright
  // overcast that exposure opens into midday sun.
  const rain = env.v ? env.v[1] : 0;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const stormK = clamp01(cover) * (0.55 + 0.45 * clamp01(rain));
  const g = envLum(amb) * mix(1.1, 0.55, stormK), oc = cover * mix(0.85, 0.98, stormK);
  env.amb = [
    (amb[0] + (g * 0.92 - amb[0]) * oc) * mix(1, 0.62, stormK * dayK),
    (amb[1] + (g - amb[1]) * oc) * mix(1, 0.64, stormK * dayK),
    (amb[2] + (g * 1.02 - amb[2]) * oc) * mix(1, 0.68, stormK * dayK)
  ];
  // All the light reaching open ground, and the same thing as a colour for whatever has no
  // light of its own in the shaders: foam, and the glow of the water's own body.
  const kd = env.key[1] * (1 - mix(0.85, 0.97, stormK) * cover);
  const D = [0, 1, 2].map((i) => env.keyCol[i] * kd + env.amb[i]);
  const L = envLum(D);
  if (!env.L0) { env.L0 = L; env.D0 = D; }
  env.day = D.map((d, i) => d / env.D0[i]);
  // The eye and the camera both open up as the light goes, but not all the way.
  env.gnd = L / env.L0;
  // Exposure target: preserve deep shadows and bright shafts; adaptation is applied in envStep.
  // The meter reads what the camera faces. A sun in the frame brings its bright sky with it,
  // and the lens closes for that, as it would: the land goes toward silhouette, the sky keeps its colour.
  const glare = Math.pow(Math.max(env.face || 0, 0), 3) * (1 - 0.85 * cover);
  // A low sun lights the ground at a glance and weakly, but the sky is lit by light that came
  // in higher and lost less, and it stays bright after the ground has gone dim, brightest
  // round the sun. The meter reads the frame, and half of a frame is that sky: the lens does
  // not open for the dim ground as far as the ground alone would have it, and facing the sun
  // it closes. Otherwise everything warm in an evening sky burns out to white.
  env.low = smooth01(0.4, 0.08, sy) * smooth01(-0.12, -0.02, sy);
  const glow = envLum(envSunT(Math.max(sy, -0.03) + 0.06, env.haze).map((t, i) => t * env.space[i])) * env.low;
  const Lc = envLum(env.keyCol) * (env.key[1] + 1.5 * glare * up) + glow * (0.5 + 4 * glare) + envLum(env.amb);
  let expo = 0.74 * Math.min(4.8, Math.pow(env.L0 / Math.max(Lc, 1e-4), 0.47))
    * Math.pow(Lc / Math.max(L, 1e-4), 0.22);
  // Do not fully open the iris for a daytime thunderstorm — keep the gloom.
  expo *= mix(1, 0.52, stormK * dayK);
  env.expo = expo;
  // Dim the solar disc colour that lights the cloud bake, so decks read as dark storm cloud.
  const discK = mix(1, 0.28, stormK * dayK);
  env.disc = env.space.map((c) => c * discK);
  env.sun = sun; env.moon = moon; env.night = night; env.moonUp = moonUp;
}
function envSet(wx, snap) {
  if (!WEATHER[wx]) return;
  env.wx = wx; env.hold = 150 + Math.random() * 240;
  if (snap) { env.v = WEATHER[wx].slice(1); env.wet = wx === 'after' ? 0.85 : env.v[1] > 0 ? 1 : 0; }
}
// Lightning. A flash is a few return strokes down one channel, each a sharp rise and a fast
// decay some tens of milliseconds after the last, which is why it flickers. Six in ten reach
// the sea and show their channel; the rest stay inside the cloud and only light it. The
// thunder leaves with the flash and arrives at the speed of sound.
const bolt = { wait: 3, t: 0, end: 0, strokes: [], pos: [0, 900, 4000], show: 0, seed: 0, now: 0, due: [] };
function boltStrike(cx, cz, fx, fz) {
  const R = Math.random;
  const ground = R() < 0.6;
  // Most fall where the eye is turned, so a storm is seen as well as heard.
  const a = Math.atan2(fz, fx) + (R() < 0.7 ? (R() - 0.5) * 1.2 : R() * 6.2832);
  const d = ground ? 1200 + 4800 * Math.pow(R(), 1.5) : 2500 + 9000 * R();
  bolt.pos = [cx + Math.cos(a) * d, ground ? 900 : 1500 + 3000 * R(), cz + Math.sin(a) * d];
  bolt.show = ground ? 1 : 0; bolt.seed = R() * 97; bolt.t = 0; bolt.strokes = [];
  let t = 0;
  // A far flash is a dimmer one.
  const dim = 1 / (1 + d * d / 8e7);
  for (let i = 0, n = ground ? 1 + ((R() * 3) | 0) : 2 + ((R() * 2) | 0); i < n; i++) {
    bolt.strokes.push([t, dim * (ground ? (i ? 0.3 + 0.6 * R() : 1) : 0.35 + 0.5 * R()), ground ? 0.03 + 0.05 * R() : 0.06 + 0.09 * R()]);
    t += 0.045 + (ground ? 0.09 : 0.16) * R();
  }
  bolt.end = t + 0.6;
  bolt.due.push([d / 343, d]);
}
// Never more than three strokes to a flash, so the screen does not strobe. Where the visitor
// has asked for less motion the flicker goes altogether: one slow swell, a third as bright.
const boltCalm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Returns how far off a thunderclap that arrives this frame was struck, or 0.
function boltStep(dt, cx, cz, fx, fz) {
  if (env.wx === 'storm' && env.v[1] > 0.6 && env.v[0] > 0.5) {
    bolt.wait -= dt;
    if (bolt.wait < 0) { bolt.wait = 2.5 + 11 * Math.pow(Math.random(), 1.6); boltStrike(cx, cz, fx, fz); }
  } else bolt.wait = Math.min(bolt.wait, 1.5 + 2 * Math.random());
  bolt.now = 0;
  if (bolt.t < bolt.end) {
    bolt.t += dt;
    let lit = 0, on = false;
    for (const k of bolt.strokes) if (bolt.t >= k[0]) { lit += k[1] * Math.exp(-(bolt.t - k[0]) / k[2]); on = true; }
    // Between strokes a little current keeps the channel glowing.
    bolt.now = Math.min(1.2, lit) + (on && bolt.t < bolt.end - 0.55 ? 0.06 : 0);
    if (bolt.now < 0.004) bolt.now = 0;
    if (boltCalm) bolt.now = 0.35 * Math.pow(Math.sin(Math.PI * Math.min(1, bolt.t / bolt.end)), 2);
  }
  let heard = 0;
  for (let i = bolt.due.length - 1; i >= 0; i--) if ((bolt.due[i][0] -= dt) <= 0) { heard = bolt.due[i][1]; bolt.due.splice(i, 1); }
  return heard;
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
  // Rain starts in seconds. A sky takes minutes to build and longer to clear.
  const T = WEATHER[env.wx], v = env.v, tau = [30, 14, 40, 30, 12, 12, 60, 60, 120, 150];
  for (let i = 0; i < 10; i++) v[i] += (T[i + 1] - v[i]) * (1 - Math.exp(-dt / tau[i]));
  const sy0 = envSunAt(env.hour)[1];
  env.cover = Math.max(placeCover, v[0]);
  // Rain wets everything in half a minute. The sun and the wind take minutes to dry it.
  env.wet = Math.max(0, Math.min(1, env.wet + dt * (v[1] * 0.05 - 0.004 * (1 + 2 * Math.max(sy0, 0) * (1 - env.cover)))));
  // Cool still air at first light holds mist in the hollows; the climbing sun burns it off.
  const dawn = smooth01(4.5, 6, env.hour) * (1 - smooth01(7, 9.5, env.hour));
  const heat = smooth01(0.12, 0.6, sy0) * (1 - env.cover);
  env.dew = 0.4 * dawn;
  env.mist = Math.max(v[2], 0.6 * dawn) * (1 - 0.75 * heat) * (1 - smooth01(4, 9, v[4]) * 0.8);
  // The air dampens again as the afternoon cools: the haze of the last hour before sunset,
  // and the reason low sun stands in shafts between the trunks.
  const dusk = env.hour > 12 ? smooth01(0.4, 0.1, sy0) * smooth01(-0.15, 0, sy0) : 0;
  env.humid = Math.min(1, v[3] + 0.3 * dawn + 0.28 * dusk + 0.15 * smooth01(0, -0.2, sy0));
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
  envSky(dt, placeCover);
  env.gustOff[0] += env.wx0 * env.speed * 0.6 * dt; env.gustOff[1] += env.wz0 * env.speed * 0.6 * dt;
  envLight(env.cover);
  // Gradual exposure adaptation: forest shade vs bright lagoon should feel like one eye opening.
  const target = env.expo;
  if (env.expoSmooth == null) env.expoSmooth = target;
  const tauE = target > env.expoSmooth ? 0.9 : 1.8;
  env.expoSmooth += (target - env.expoSmooth) * (1 - Math.exp(-Math.max(dt, 1e-3) / tauE));
  env.expo = env.expoSmooth;
}
// The sky's state: what kinds of cloud, how high, and how far each layer of air has carried
// its own. Humid air condenses lower. Unstable air grows deeper cumulus and stands towers
// in it. The deck sits above the cumulus base, and thickens and sinks when it rains.
function envSky(dt, placeCover) {
  const k = env.sky, v = env.v, s = env.speed * 1.9e-3 * dt;
  // The sun's heat is what lifts fair-weather cumulus: it thins and flattens toward evening,
  // and what is left by night is the shallow cloud the warm sea keeps going.
  const heat = smooth01(0.02, 0.42, env.sun ? env.sun[1] : 0.5);
  k.cum = v[6] * (0.62 + 0.38 * heat); k.conv = v[8]; k.cirrus = v[9];
  k.deck = Math.max(v[7], 0.9 * smooth01(0.35, 0.85, placeCover));
  k.base = 1.2 - 0.62 * env.humid;
  k.depth = (0.7 + 1.1 * k.conv) * (0.75 + 0.25 * heat);
  k.deckBase = k.base + 0.55 * (1 - 0.6 * v[1]);
  k.deckThick = 0.45 + 0.8 * v[1];
  k.top = k.base + Math.max(k.depth * 1.6, smooth01(0.24, 0.34, k.conv) * (3.5 + 8.5 * k.conv), k.deckBase - k.base + k.deckThick) + 0.1;
  // Wind grows with height, so cloud leans downwind. The low cloud goes with the trades, the
  // deck a little faster and veered, the towers with the slower steering flow, and the cirrus
  // with the upper wind, which keeps its own heading whatever the trades do.
  const lean = 0.08 + 0.03 * env.speed;
  k.lean = [env.wx0 * lean, env.wz0 * lean];
  // Everything wraps at 288 km, which every scale of cloud noise divides, so nothing jumps.
  const go = (o, x, z) => { o[0] = (((o[0] + x) % 288) + 288) % 288; o[1] = (((o[1] + z) % 288) + 288) % 288; };
  go(env.cloud, env.wx0 * s, env.wz0 * s);
  go(k.deckOff, Math.cos(env.ang + 0.2) * s * 1.25, Math.sin(env.ang + 0.2) * s * 1.25);
  go(k.tower, env.wx0 * s * 0.6, env.wz0 * s * 0.6);
  go(k.high, (0.012 + env.speed * 1.2e-3) * dt, 0.0015 * dt);
  // A slow clock for growth and decay, and the rise of the billows through the cloud.
  k.evo = (k.evo + dt / 7200) % 1;
  k.rise = (k.rise + 0.0013 * dt) % 9.6;
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
  for (const s of DAY_STOPS) if (h >= s[0] - 0.25) name = s[1];
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
  arr[o + 24] = env.disc[0]; arr[o + 25] = env.disc[1]; arr[o + 26] = env.disc[2]; arr[o + 27] = env.airMass;
  arr[o + 31] = env.low;
  for (let i = 0; i < 3; i++) { arr[o + 28 + i] = env.day[i]; arr[140 + i] *= env.day[i]; arr[144 + i] *= env.day[i]; }
  const k = env.sky;
  arr.set([k.cum, k.conv, k.base, k.top, k.cirrus, k.deck, k.deckBase, k.evo, k.high[0], k.high[1], k.deckOff[0], k.deckOff[1]], o + 32);
  arr[o + 47] = k.depth;
  arr[o + 50] = k.tower[0]; arr[o + 51] = k.tower[1];
  arr.set([k.lean[0], k.lean[1], k.deckThick, k.rise], o + 52);
  // The flash is given in what the eye is opened to, so it dazzles by night and by day alike.
  arr.set([bolt.pos[0], bolt.pos[1], bolt.pos[2], bolt.now * 2.7 / Math.max(env.expo, 0.05), bolt.seed, bolt.show, 0, 0], o + 56);
}
