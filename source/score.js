// Beneath the Blue. An original ambient score at 78 BPM.
// The phrases and the two harmonic cycles are written out. The synthesizer
// only performs them. Nothing here quotes another piece.

const SCORE_BPM = 78;
const SCORE_BEAT = 60 / SCORE_BPM;
const SCORE_EIGHTH = SCORE_BEAT / 2;

// Each chord is a bass note plus a close voicing. MIDI numbers.
const SCORE_OPEN = [
  { bass: 45, pad: [57, 61, 64, 68] },
  { bass: 43, pad: [55, 59, 62, 66] },
  { bass: 42, pad: [54, 57, 61, 68] },
  { bass: 38, pad: [50, 57, 62, 64] },
  { bass: 40, pad: [52, 57, 59, 64] },
  { bass: 37, pad: [49, 56, 59, 63] },
  { bass: 47, pad: [47, 54, 59, 64] },
  { bass: 45, pad: [45, 52, 57, 66] }
];
const SCORE_DEEP = [
  { bass: 42, pad: [54, 57, 61, 64] },
  { bass: 38, pad: [50, 54, 57, 61] },
  { bass: 40, pad: [52, 59, 64, 66] },
  { bass: 45, pad: [57, 61, 64, 66] },
  { bass: 43, pad: [55, 59, 62, 66] },
  { bass: 42, pad: [54, 61, 64, 68] },
  { bass: 47, pad: [47, 54, 57, 64] },
  { bass: 40, pad: [52, 54, 59, 64] }
];

// Eighth-note positions inside an 8-bar phrase. Written against the chords above.
const SCORE_LANTERN = [
  { at: 0, n: 69, d: 6, v: 0.86 },
  { at: 8, n: 73, d: 4, v: 0.72 },
  { at: 14, n: 76, d: 2, v: 0.78 },
  { at: 16, n: 71, d: 6, v: 0.7 },
  { at: 24, n: 74, d: 5, v: 0.66 },
  { at: 32, n: 73, d: 8, v: 0.74 },
  { at: 42, n: 69, d: 4, v: 0.58 },
  { at: 48, n: 74, d: 6, v: 0.7 },
  { at: 56, n: 78, d: 3, v: 0.62 },
  { at: 60, n: 76, d: 4, v: 0.55 }
];
const SCORE_CURRENT = [
  { at: 0, n: 76, d: 6, v: 0.7 },
  { at: 8, n: 71, d: 4, v: 0.62 },
  { at: 14, n: 69, d: 4, v: 0.58 },
  { at: 20, n: 68, d: 6, v: 0.64 },
  { at: 28, n: 76, d: 4, v: 0.6 },
  { at: 36, n: 74, d: 6, v: 0.66 },
  { at: 44, n: 66, d: 4, v: 0.5 },
  { at: 50, n: 69, d: 8, v: 0.72 },
  { at: 60, n: 64, d: 4, v: 0.48 }
];
const SCORE_GLASS = [
  { at: 2, n: 76, d: 4, v: 0.6 },
  { at: 8, n: 73, d: 6, v: 0.66 },
  { at: 18, n: 74, d: 4, v: 0.58 },
  { at: 24, n: 71, d: 6, v: 0.62 },
  { at: 34, n: 69, d: 6, v: 0.55 },
  { at: 42, n: 73, d: 4, v: 0.6 },
  { at: 50, n: 66, d: 4, v: 0.48 },
  { at: 56, n: 69, d: 8, v: 0.64 }
];
const SCORE_INTRO = [
  { at: 6, n: 76, d: 8, v: 0.32 },
  { at: 28, n: 69, d: 10, v: 0.36 },
  { at: 48, n: 73, d: 8, v: 0.28 }
];

// Pluck/arp off: the triangle hit every ~3 s read as a metallic clank over the tropical bed.
const SCORE_FORM = [
  { chords: 'open', bars: 8, melody: 'intro', arp: false, pluck: false },
  { chords: 'open', bars: 16, melody: 'theme', arp: false, pluck: false },
  { chords: 'open', bars: 16, melody: 'glass', arp: false, pluck: false },
  { chords: 'deep', bars: 16, melody: null, arp: false, pluck: false },
  { chords: 'open', bars: 16, melody: 'return', arp: false, pluck: false }
];

function scoreHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createScore(ac, destination) {
  const bus = ac.createGain();
  bus.gain.value = 0;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 16;
  comp.ratio.value = 1.7;
  comp.attack.value = 0.02;
  comp.release.value = 0.28;
  const dry = ac.createGain();
  dry.gain.value = 0.9;
  const send = ac.createGain();
  send.gain.value = 0.22;
  const verb = ac.createConvolver();
  verb.normalize = true;
  const irLen = (ac.sampleRate * 3.2) | 0;
  const ir = ac.createBuffer(2, irLen, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let s = 2000 + c * 97;
    for (let i = 0; i < irLen; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      const n = ((s >>> 0) / 4294967296) * 2 - 1;
      d[i] = n * Math.pow(1 - i / irLen, 2.2) * (c ? 0.9 : 1);
    }
  }
  verb.buffer = ir;
  const delay = ac.createDelay(1.0);
  delay.delayTime.value = 0.31;
  const feedback = ac.createGain();
  feedback.gain.value = 0.28;
  const delayTone = ac.createBiquadFilter();
  delayTone.type = 'lowpass';
  delayTone.frequency.value = 1800;
  const delayIn = ac.createGain();
  delayIn.gain.value = 1;
  delayIn.connect(delay);
  delay.connect(delayTone);
  delayTone.connect(feedback);
  feedback.connect(delay);
  delay.connect(dry);
  delay.connect(send);

  dry.connect(bus);
  send.connect(verb);
  verb.connect(bus);
  bus.connect(comp);
  comp.connect(destination);

  let want = 0;
  let eighth = 0;
  let formIndex = 0;
  let sectionStart = 0;
  let cycle = 0;
  let nextTime = 0;
  let timer = 0;
  let alive = true;

  function endNodes(nodes, when) {
    nodes.forEach((n) => {
      if (n.stop) {
        try { n.stop(when); } catch (e) { /* already stopped */ }
      }
    });
    const osc = nodes.find((n) => n.stop);
    if (!osc) return;
    osc.onended = () => {
      nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* gone */ } });
    };
  }

  function envGain(t, attack, hold, release, peak) {
    const g = ac.createGain();
    const a = Math.max(attack, 0.005);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + release);
    return g;
  }

  function playPad(chord, t) {
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ac.createGain();
    lfoAmt.gain.value = 6;
    lfo.connect(lfoAmt);
    const nodes = [lfo, lfoAmt];
    const span = SCORE_EIGHTH * 16;
    chord.pad.forEach((midi, i) => {
      const freq = scoreHz(midi);
      const g = envGain(t, 1.15, Math.max(0.2, span - 1.3), 2.6, 0.07);
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 980;
      filter.Q.value = 0.5;
      const pan = ac.createStereoPanner();
      pan.pan.value = [-0.45, -0.15, 0.18, 0.48][i] || 0;
      ['sine', 'triangle', 'triangle'].forEach((type, k) => {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = [-7, 0, 8][k];
        if (k === 2) lfoAmt.connect(o.detune);
        const vg = ac.createGain();
        vg.gain.value = k === 0 ? 0.7 : 0.45;
        o.connect(vg);
        vg.connect(filter);
        nodes.push(o, vg);
        o.start(t);
      });
      filter.connect(g);
      g.connect(pan);
      pan.connect(dry);
      pan.connect(send);
      nodes.push(g, filter, pan);
    });
    lfo.start(t);
    endNodes(nodes, t + span + 2.8);
  }

  function playBass(chord, t) {
    const freq = scoreHz(chord.bass);
    const span = SCORE_EIGHTH * 14;
    const g = envGain(t, 0.14, Math.max(0.2, span - 0.3), 0.55, 0.16);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    const sine = ac.createOscillator();
    sine.type = 'sine';
    sine.frequency.value = freq;
    const harm = ac.createOscillator();
    harm.type = 'triangle';
    harm.frequency.value = freq * 2;
    const hg = ac.createGain();
    hg.gain.value = 0.14;
    sine.connect(filter);
    harm.connect(hg);
    hg.connect(filter);
    filter.connect(g);
    g.connect(dry);
    const nodes = [sine, harm, hg, filter, g];
    sine.start(t);
    harm.start(t);
    endNodes(nodes, t + span + 0.7);
  }

  // Soft sine lead — no FM metal (the old 2.01-ratio modulator read as a synth metal hit).
  function playBell(midi, t, velocity, durEighths) {
    const freq = scoreHz(midi);
    const dur = Math.max(1.4, durEighths * SCORE_EIGHTH);
    const g = envGain(t, 0.08, 0.05, dur, 0.08 * velocity);
    const car = ac.createOscillator();
    const soft = ac.createOscillator();
    const softG = ac.createGain();
    car.type = 'sine';
    soft.type = 'sine';
    car.frequency.value = freq;
    soft.frequency.value = freq * 2;
    softG.gain.value = 0.12;
    soft.connect(softG);
    softG.connect(g);
    const pan = ac.createStereoPanner();
    pan.pan.value = ((midi % 5) - 2) * 0.16;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = Math.min(2400, freq * 3.2);
    tone.Q.value = 0.4;
    car.connect(tone);
    tone.connect(g);
    g.connect(pan);
    pan.connect(dry);
    pan.connect(send);
    const nodes = [car, soft, softG, tone, g, pan];
    car.start(t);
    soft.start(t);
    endNodes(nodes, t + dur + 0.1);
  }

  // Hard-disabled: triangle pluck / arp was the metallic clank every ~3 s.
  function playPluck() { /* silenced */ }
  function playArp() { /* silenced */ }

  function playShimmer(midi, t) {
    const freq = scoreHz(midi + 12);
    const g = envGain(t, 0.4, 0.2, 2.2, 0.018);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    o.connect(filter);
    filter.connect(g);
    g.connect(send);
    const nodes = [o, filter, g];
    o.start(t);
    endNodes(nodes, t + 3);
  }

  function playBubble(midi, t) {
    const g = envGain(t, 0.02, 0.02, 0.32, 0.02);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(scoreHz(midi + 12), t);
    o.frequency.exponentialRampToValueAtTime(scoreHz(midi), t + 0.28);
    o.connect(g);
    g.connect(send);
    const nodes = [o, g];
    o.start(t);
    endNodes(nodes, t + 0.45);
  }

  function notesAt(list, at) {
    const out = [];
    for (let i = 0; i < list.length; i++) if (list[i].at === at) out.push(list[i]);
    return out;
  }

  function melodyAt(kind, local) {
    const first = cycle % 2 === 0 ? SCORE_LANTERN : SCORE_GLASS;
    if (kind === 'intro') return notesAt(SCORE_INTRO, local);
    if (kind === 'theme') {
      if (local < 64) return notesAt(first, local);
      return notesAt(SCORE_CURRENT, local - 64);
    }
    if (kind === 'glass') {
      if (local < 64) return notesAt(cycle % 2 === 0 ? SCORE_GLASS : SCORE_LANTERN, local);
      return [];
    }
    if (kind === 'return') {
      if (local < 64) return notesAt(SCORE_LANTERN, local);
      return notesAt(SCORE_CURRENT, local - 64).map((n) => ({ at: n.at, n: n.n, d: n.d, v: n.v * 0.62 }));
    }
    return [];
  }

  function advanceForm(e) {
    let guard = 0;
    while (guard++ < 4) {
      const sec = SCORE_FORM[formIndex];
      if (e - sectionStart < sec.bars * 8) break;
      sectionStart += sec.bars * 8;
      formIndex += 1;
      if (formIndex >= SCORE_FORM.length) {
        formIndex = 1;
        cycle += 1;
      }
    }
  }

  function emit(e, when) {
    advanceForm(e);
    const sec = SCORE_FORM[formIndex];
    const local = e - sectionStart;
    const book = sec.chords === 'deep' ? SCORE_DEEP : SCORE_OPEN;
    const chord = book[Math.floor(local / 16) % book.length];
    const inChord = local % 16;
    const feel = ((e * 17) % 5) * 0.004;
    const t = when + feel;
    if (inChord === 0) {
      playBass(chord, t);
      playPad(chord, t);
      if (local === 0 && (sec.melody === 'glass' || sec.melody === null)) playShimmer(chord.pad[chord.pad.length - 1], t);
    }
    if (sec.pluck && (inChord === 0 || inChord === 8) && (Math.floor(local / 16) % 4) !== 3) {
      playPluck(chord.pad[2], t, 0.7);
    }
    if (sec.arp && (inChord === 3 || inChord === 7 || inChord === 11)) {
      const tone = chord.pad[inChord === 3 ? 0 : inChord === 7 ? 2 : 1];
      playArp(tone, t);
    }
    if (sec.arp && inChord === 14 && (Math.floor(local / 16) % 2) === 0) playBubble(chord.pad[2], t);
    const notes = melodyAt(sec.melody, local);
    for (let i = 0; i < notes.length; i++) playBell(notes[i].n, t, notes[i].v, notes[i].d);
  }

  function pump(until) {
    while (alive && nextTime < until) {
      emit(eighth, nextTime);
      eighth += 1;
      nextTime += SCORE_EIGHTH;
    }
  }

  function start() {
    if (timer) return;
    nextTime = ac.currentTime + 0.2;
    timer = setInterval(() => {
      if (!alive) return;
      pump(ac.currentTime + 0.22);
    }, 40);
  }

  function renderSpan(seconds) {
    nextTime = 0.08;
    pump(seconds);
  }

  function setAudible(on, vol) {
    const next = on ? 0.78 * vol : 0;
    if (Math.abs(next - want) < 0.004) return;
    want = next;
    if (typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext) {
      bus.gain.value = next;
      return;
    }
    const now = ac.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.setTargetAtTime(next, now, on ? 1.15 : 0.9);
  }

  function stop() {
    alive = false;
    if (timer) clearInterval(timer);
    timer = 0;
  }

  return { start: start, renderSpan: renderSpan, setAudible: setAudible, stop: stop, bus: bus };
}
