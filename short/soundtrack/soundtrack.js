// THE BAN HAMMER - soundtrack, synthesized from scratch with the Web Audio API.
// No samples, no audio files: every sound is oscillators, filtered (seeded) noise
// and envelopes, rendered offline with OfflineAudioContext.
//
// 120 BPM, 4/4, D minor. 1 beat = 0.5s, 1 bar = 2s, 30s = 15 bars exactly.
// Every cue below is placed on that grid so cuts and hits line up with the picture.

/* global OfflineAudioContext */

const SR = 48000;
const BEAT = 0.5;
const BAR = 2;
const STEP = BEAT / 4; // 16th note = 0.125s
const LEN = 30;
const TAIL = 3; // rendered past the loop point, then folded back onto the start

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// Graph setup
// ---------------------------------------------------------------------------
export async function renderSoundtrack({ gainDb = 0 } = {}) {
  const ctx = new OfflineAudioContext(2, SR * (LEN + TAIL), SR);
  const rand = mulberry32(1337);

  // One long white-noise buffer shared by every noise voice (random start offsets).
  const noiseBuf = ctx.createBuffer(1, SR * 4, SR);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  }

  // Synthesized reverb impulse: stereo decaying noise.
  const irLen = Math.floor(SR * 1.6);
  const ir = ctx.createBuffer(2, irLen, SR);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const k = i / irLen;
      d[i] = (rand() * 2 - 1) * Math.pow(1 - k, 3.2) * 0.6;
    }
  }

  // Saturation curve (gentle tanh) shared by bass and booms.
  function tanhCurve(drive) {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return c;
  }

  // Master: bus sum -> glue compressor -> makeup -> destination.
  // Peak limiting and loudness are handled after render (see limit()).
  const master = ctx.createGain();
  master.gain.value = Math.pow(10, gainDb / 20);
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 10;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.008;
  glue.release.value = 0.18;
  master.connect(glue);
  glue.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.35;
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);

  // Buses. The music bus has a low-pass for sweeps, and music + bass share a
  // sidechain "pump" gain that ducks on drop kicks.
  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(master);

  const pump = ctx.createGain();
  pump.connect(master);

  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.85;
  bassBus.connect(pump);

  const musicFilter = ctx.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 18000;
  musicFilter.Q.value = 0.8;
  musicFilter.connect(pump);
  const music = ctx.createGain();
  music.gain.value = 0.55;
  music.connect(musicFilter);

  const fx = ctx.createGain();
  fx.gain.value = 0.9;
  fx.connect(master);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function noise(t, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const offset = rand() * (noiseBuf.duration - dur - 0.1);
    src.start(t, Math.max(0, offset), dur + 0.05);
    return src;
  }

  function env(param, t, attack, peak, decay, floor = 0.0001) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  }

  function send(node, amount) {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(reverb);
  }

  function pan(node, value, dest) {
    const p = ctx.createStereoPanner();
    p.pan.value = value;
    node.connect(p);
    p.connect(dest);
    return p;
  }

  // -------------------------------------------------------------------------
  // Instruments
  // -------------------------------------------------------------------------
  function kick(t, amp = 1, long = false) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    const sh = ctx.createWaveShaper();
    sh.curve = tanhCurve(2.2);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, amp, long ? 0.55 : 0.32);
    o.connect(sh);
    sh.connect(g);
    g.connect(drums);
    o.start(t);
    o.stop(t + 0.7);

    // Click transient.
    const n = noise(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    env(ng.gain, t, 0.001, amp * 0.35, 0.012);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(drums);
  }

  function hat(t, amp = 0.25, open = false, panV = 0.15) {
    const n = noise(t, open ? 0.25 : 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 10500;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, amp, open ? 0.2 : 0.035);
    n.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    pan(g, panV, drums);
  }

  function clap(t, amp = 0.7) {
    const n = noise(t, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;
    const g = ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    // three quick "hands" then the body
    for (const [dt, a] of [
      [0, 1],
      [0.012, 0.8],
      [0.024, 1],
    ]) {
      p.setValueAtTime(amp * a, t + dt);
      p.exponentialRampToValueAtTime(amp * 0.2, t + dt + 0.01);
    }
    p.setValueAtTime(amp * 0.9, t + 0.036);
    p.exponentialRampToValueAtTime(0.0001, t + 0.24);
    n.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(drums);
    send(g, 0.35);
  }

  function snare(t, amp = 0.5) {
    const n = noise(t, 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, amp, 0.12);
    n.connect(bp);
    bp.connect(g);
    g.connect(drums);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.06);
    const og = ctx.createGain();
    env(og.gain, t, 0.001, amp * 0.6, 0.07);
    o.connect(og);
    og.connect(drums);
    o.start(t);
    o.stop(t + 0.15);
  }

  // Phonk 808: sine + octave triangle, saturated, with a small pitch drop for punch.
  function bass(t, midi, dur, amp = 0.8, drive = 2.5) {
    const f = midiHz(midi);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.12, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(f * 2.24, t);
    o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.045);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.25;
    const sh = ctx.createWaveShaper();
    sh.curve = tanhCurve(drive);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.006);
    g.gain.setValueAtTime(amp, t + Math.max(0.01, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(sh);
    o2.connect(o2g);
    o2g.connect(sh);
    sh.connect(lp);
    lp.connect(g);
    g.connect(bassBus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // TR-808 style cowbell (two detuned squares through a band-pass), pitched for melody.
  function cowbell(t, midi, amp = 0.35, dur = 0.22, panV = -0.1) {
    const f = midiHz(midi);
    const a = ctx.createOscillator();
    a.type = "square";
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.type = "square";
    b.frequency.value = f * 1.4815;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * 2.2;
    bp.Q.value = 1.3;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(amp * 0.3, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    a.connect(bp);
    b.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    pan(g, panV, music);
    send(g, 0.18);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.02);
    b.stop(t + dur + 0.02);
  }

  // Sub boom: long pitch-dropping sine with saturation so phones still hear it.
  function boom(t, amp = 1, dur = 2) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(30, t + dur * 0.7);
    const sh = ctx.createWaveShaper();
    sh.curve = tanhCurve(1.8);
    const g = ctx.createGain();
    env(g.gain, t, 0.004, amp, dur);
    o.connect(sh);
    sh.connect(g);
    g.connect(fx);
    o.start(t);
    o.stop(t + dur + 0.1);

    // Thump body
    const n = noise(t, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const ng = ctx.createGain();
    env(ng.gain, t, 0.002, amp * 0.9, 0.22);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(fx);
  }

  function crash(t, amp = 0.5, dur = 1.1) {
    const n = noise(t, dur + 0.1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const g = ctx.createGain();
    env(g.gain, t, 0.002, amp, dur);
    n.connect(lp);
    lp.connect(hp);
    hp.connect(g);
    g.connect(fx);
    send(g, 0.5);
  }

  // Filtered-noise riser with a rising saw underneath.
  function riser(t0, t1, amp = 0.35) {
    const dur = t1 - t0;
    const n = noise(t0, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(9000, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp * 0.05, t0);
    g.gain.exponentialRampToValueAtTime(amp, t1 - 0.01);
    g.gain.setValueAtTime(0.0001, t1);
    n.connect(bp);
    bp.connect(g);
    g.connect(fx);
    send(g, 0.3);

    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(880, t1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(5000, t1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(amp * 0.28, t1 - 0.01);
    og.gain.setValueAtTime(0.0001, t1);
    o.connect(lp);
    lp.connect(og);
    og.connect(fx);
    o.start(t0);
    o.stop(t1 + 0.01);
  }

  function whoosh(t, dur = 0.35, amp = 0.3, up = true) {
    const n = noise(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    const [f0, f1] = up ? [500, 6000] : [6000, 500];
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp * 3, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp);
    bp.connect(g);
    pan(g, up ? 0.3 : -0.3, fx);
  }

  // Dissonant string-hit stinger (D, Eb, A + low D).
  function stinger(t, amp = 0.3) {
    for (const [m, p] of [
      [50, 0],
      [62, -0.3],
      [63, 0.3],
      [69, -0.15],
      [74, 0.15],
    ]) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midiHz(m);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(4200, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.8);
        const g = ctx.createGain();
        env(g.gain, t, 0.006, amp * 0.18, 0.95);
        o.connect(lp);
        lp.connect(g);
        pan(g, p, fx);
        send(g, 0.4);
        o.start(t);
        o.stop(t + 1.1);
      }
    }
  }

  function alarm(t, amp = 0.22) {
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.125;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = i % 2 ? 932 : 1245;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(amp, tt + 0.004);
      g.gain.setValueAtTime(amp, tt + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      o.connect(lp);
      lp.connect(g);
      g.connect(fx);
      send(g, 0.2);
      o.start(tt);
      o.stop(tt + 0.13);
    }
  }

  function blip(t, freq = 1400, amp = 0.16) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.setValueAtTime(freq * 1.5, t + 0.03);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5000;
    const g = ctx.createGain();
    env(g.gain, t, 0.002, amp, 0.07);
    o.connect(lp);
    lp.connect(g);
    g.connect(fx);
    o.start(t);
    o.stop(t + 0.1);
  }

  function sparkle(t, amp = 0.16) {
    [86, 89, 93, 98].forEach((m, i) => {
      const tt = t + i * 0.045;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = midiHz(m);
      const g = ctx.createGain();
      env(g.gain, tt, 0.002, amp, 0.25);
      o.connect(g);
      pan(g, -0.3 + i * 0.2, fx);
      send(g, 0.5);
      o.start(tt);
      o.stop(tt + 0.3);
    });
  }

  function glass(t, amp = 0.35) {
    const n = noise(t, 0.5);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, amp, 0.4);
    n.connect(hp);
    hp.connect(g);
    g.connect(fx);
    send(g, 0.5);
    for (let i = 0; i < 6; i++) {
      const tt = t + rand() * 0.12;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 2800 + rand() * 4200;
      const og = ctx.createGain();
      env(og.gain, tt, 0.001, amp * 0.25, 0.3 + rand() * 0.3);
      o.connect(og);
      pan(og, rand() * 1.6 - 0.8, fx);
      o.start(tt);
      o.stop(tt + 0.7);
    }
  }

  // The Roblox "oof": a buzzy glottal source through vowel formants that glide
  // from "uh" to "oo", clipped off with a breathy "f".
  function oof(t, amp = 0.55, pitch = 1, panV = 0) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(amp, t + 0.012);
    out.gain.setValueAtTime(amp * 0.95, t + 0.17);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    pan(out, panV, fx);
    send(out, 0.12);

    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(215 * pitch, t);
    src.frequency.linearRampToValueAtTime(200 * pitch, t + 0.06);
    src.frequency.linearRampToValueAtTime(150 * pitch, t + 0.3);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibG = ctx.createGain();
    vibG.gain.value = 3 * pitch;
    vib.connect(vibG);
    vibG.connect(src.frequency);

    const formants = [
      // [start Hz, end Hz, Q, gain]
      [620, 340, 5, 1.0],
      [1100, 820, 7, 0.55],
      [2500, 2300, 9, 0.18],
    ];
    for (const [f0, f1, q, fg] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0 * Math.sqrt(pitch), t);
      bp.frequency.exponentialRampToValueAtTime(f1 * Math.sqrt(pitch), t + 0.12);
      const g = ctx.createGain();
      g.gain.value = fg * 3.2;
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
    }
    src.start(t);
    vib.start(t);
    src.stop(t + 0.32);
    vib.stop(t + 0.32);

    // breathy "f"
    const n = noise(t + 0.22, 0.12);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t + 0.22);
    ng.gain.linearRampToValueAtTime(amp * 0.12, t + 0.25);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.33);
    n.connect(hp);
    hp.connect(ng);
    pan(ng, panV, fx);
  }

  // Bit-crushed glitch stutter: square blips at random pitches on 32nds.
  function stutter(t0, dur, amp = 0.2) {
    const step = STEP / 2;
    for (let tt = t0; tt < t0 + dur - 0.001; tt += step) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 180 + Math.floor(rand() * 8) * 140;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, tt);
      g.gain.setValueAtTime(0.0001, tt + step * 0.7);
      o.connect(g);
      pan(g, rand() * 1.2 - 0.6, fx);
      o.start(tt);
      o.stop(tt + step);
    }
  }

  function tick(t, amp = 0.2) {
    const n = noise(t, 0.02);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3500;
    bp.Q.value = 3;
    const g = ctx.createGain();
    env(g.gain, t, 0.001, amp, 0.02);
    n.connect(bp);
    bp.connect(g);
    g.connect(fx);
  }

  function snareRoll(t0, t1, amp0 = 0.12, amp1 = 0.5) {
    let tt = t0;
    let i = 0;
    while (tt < t1 - 0.001) {
      const k = (tt - t0) / (t1 - t0);
      snare(tt, amp0 + (amp1 - amp0) * k);
      // 8ths -> 16ths -> 32nds
      tt += k < 0.4 ? STEP * 2 : k < 0.75 ? STEP : STEP / 2;
      i++;
    }
  }

  // Sidechain pump on music + bass, following the kicks.
  function duck(t, depth = 0.35, rel = 0.2) {
    pump.gain.setValueAtTime(depth, t);
    pump.gain.linearRampToValueAtTime(1, t + rel);
  }

  // -------------------------------------------------------------------------
  // Patterns (16 steps per bar)
  // -------------------------------------------------------------------------
  const COWBELL_A = [74, 0, 74, 77, 0, 79, 81, 0, 79, 77, 0, 74, 76, 0, 77, 0];
  const COWBELL_B = [74, 0, 74, 77, 0, 79, 84, 0, 81, 79, 0, 77, 81, 0, 79, 77];
  // [step, midi, length in steps]
  const BASS_A = [
    [0, 38, 6],
    [7, 41, 3],
    [10, 33, 6],
  ];
  const BASS_B = [
    [0, 38, 6],
    [7, 36, 3],
    [10, 33, 6],
  ];

  function groove(bar, opts) {
    const t0 = bar * BAR;
    const alt = bar % 2 === 1;
    const {
      kicks = [0, 10],
      claps = [8],
      hats = true,
      hatAmp = 0.16,
      rolls = false,
      cow = true,
      cowAmp = 0.3,
      cowOct = false,
      bassOn = true,
      bassAmp = 0.7,
      drive = 2.5,
      pumpOn = false,
    } = opts;
    for (const s of kicks) {
      kick(t0 + s * STEP, 0.95);
      if (pumpOn) duck(t0 + s * STEP);
    }
    for (const s of claps) clap(t0 + s * STEP, 0.62);
    if (hats) {
      for (let s = 0; s < 16; s++) {
        const accent = s % 4 === 2 ? 1.25 : s % 2 ? 0.7 : 0.95;
        hat(t0 + s * STEP, hatAmp * accent, false, s % 2 ? 0.25 : -0.15);
      }
      if (rolls && alt) {
        // triplet roll across the last beat
        for (let r = 0; r < 6; r++) hat(t0 + 12 * STEP + (r * BEAT) / 6, hatAmp * (0.6 + r * 0.1), false, 0.4);
      }
      hat(t0 + 14 * STEP, hatAmp * 1.4, true, 0.2);
    }
    if (cow) {
      const pat = alt ? COWBELL_B : COWBELL_A;
      pat.forEach((m, s) => {
        if (!m) return;
        cowbell(t0 + s * STEP, m, cowAmp);
        if (cowOct) cowbell(t0 + s * STEP, m + 12, cowAmp * 0.35, 0.16, 0.25);
      });
    }
    if (bassOn) {
      for (const [s, m, len] of alt ? BASS_B : BASS_A) {
        bass(t0 + s * STEP, m, len * STEP, bassAmp, drive);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Arrangement (bar index 0..14, t = bar * 2s)
  // -------------------------------------------------------------------------
  const HOOK = { kicks: [0, 7, 10], claps: [8], hatAmp: 0.13, cowAmp: 0.27, bassAmp: 0.42, drive: 2 };
  const DROP = {
    kicks: [0, 3, 7, 10],
    claps: [4, 12],
    hatAmp: 0.19,
    rolls: true,
    cowAmp: 0.36,
    cowOct: true,
    bassAmp: 0.85,
    drive: 3.6,
    pumpOn: true,
  };
  const HALF = { kicks: [0, 10], claps: [8], hatAmp: 0.11, cowAmp: 0.24, bassAmp: 0.4, drive: 2 };

  // Bars 1-2 (0-4s): hook. Everything hits on frame 0.
  boom(0, 0.95, 1.8);
  crash(0, 0.4, 1.2);
  groove(0, HOOK);
  groove(1, HOOK);
  whoosh(1.2, 0.3, 0.26); // into the close-up cut at 1.5
  kick(2.0, 0.6);
  crash(2.0, 0.28, 0.6); // UNRELEASED stamp
  sparkle(3.0); // grab
  whoosh(2.75, 0.25, 0.2);

  // Bars 3-4 (4-8s): chat, admin joins, threat.
  groove(2, HOOK);
  blip(4.0, 1400);
  blip(4.25, 1250);
  blip(4.5, 1600);
  whoosh(5.2, 0.3, 0.28);
  alarm(5.5);
  boom(5.5, 0.7, 1.2);
  // bar 4: thin out, low-pass the music under the threat
  groove(3, { ...HOOK, kicks: [0], claps: [], hats: false });
  musicFilter.frequency.setValueAtTime(18000, 6.5);
  musicFilter.frequency.exponentialRampToValueAtTime(1100, 6.9);
  blip(6.5, 900, 0.2);
  riser(7.1, 8.0, 0.2); // reverse swell into the wind-up

  // Bar 5 (8-10s): swing (speed ramp) then IMPACT on 9.0.
  hat(8.0, 0.2, true);
  bass(8.0, 38, 1.0, 0.45, 2);
  riser(8.0, 9.0, 0.45); // wind-up swell (speed ramp)
  whoosh(8.45, 0.55, 0.4, true); // accelerating swing
  musicFilter.frequency.setValueAtTime(1100, 8.99);
  musicFilter.frequency.setValueAtTime(18000, 9.0);
  kick(9.0, 1, true);
  boom(9.0, 0.95, 1.4);
  crash(9.0, 0.45, 1.0);
  oof(9.02, 0.6, 1);
  stinger(9.0, 0.26);
  // second half of bar 5 back in the groove
  for (const s of [10, 12, 14]) hat(8 + s * STEP, 0.16);
  cowbell(8 + 10 * STEP, 74, 0.28);
  cowbell(8 + 12 * STEP, 77, 0.28);
  cowbell(8 + 14 * STEP, 79, 0.28);
  bass(8 + 10 * STEP, 33, 6 * STEP, 0.7);

  // Bar 6 (10-12s): mass bans, oofs speed-ramping.
  groove(5, HOOK);
  const oofTimes = [10.0, 10.36, 10.66, 10.9, 11.08, 11.22, 11.33, 11.42];
  oofTimes.forEach((t, i) => oof(t, 0.42 - i * 0.02, 1 + i * 0.045, (i % 2 ? 0.35 : -0.35)));

  // Bar 7 (12-14s; the "only me" shot starts at 11.5): filter down, riser starts.
  musicFilter.frequency.setValueAtTime(18000, 11.5);
  musicFilter.frequency.exponentialRampToValueAtTime(420, 12.2);
  groove(6, { ...HALF, claps: [], hats: false });
  hat(11.5, 0.12, true);
  riser(11.5, 15.5, 0.55);
  stinger(13.0, 0.3); // the hammer turns
  kick(13.0, 0.8, true);

  // Bar 8 (14-16s): snare roll, then 0.5s of silence before the drop.
  kick(14.0, 0.8);
  bass(14.0, 38, 0.5, 0.6);
  snareRoll(14.5, 15.5, 0.18, 0.95);
  riser(14.5, 15.5, 0.7); // second, tighter riser layer for the last beat before silence
  kick(15.0, 0.7);
  // 15.5 - 16.0: silence (nothing scheduled)

  // Bars 9-12 (16-24s): DROP.
  musicFilter.frequency.setValueAtTime(18000, 15.5);
  boom(16.0, 1.0, 2.4);
  crash(16.0, 0.55, 1.6);
  glass(16.0, 0.4);
  for (let b = 8; b < 12; b++) groove(b, DROP);
  oof(17.0, 0.7, 0.92); // the break-apart
  crash(17.0, 0.25, 0.5);
  stutter(18.0, 0.5, 0.16); // ERROR 267
  kick(19.0, 0.7);
  crash(19.0, 0.35, 0.7); // TERMINATED stamp
  whoosh(19.75, 0.3, 0.3); // into the spinning hammer
  whoosh(20.0, 0.5, 0.22, false);
  for (let i = 0; i < 8; i++) tick(21.0 + i * STEP, 0.2 + i * 0.02); // server rows
  riser(22.0, 23.0, 0.3); // NEXT STOP
  boom(23.0, 0.85, 1.4);
  crash(23.0, 0.4, 1.0);
  blip(23.25, 1600, 0.2); // "joined the game"

  // Bars 13-14 (24-28s): half-time breakdown, landing, filter closes.
  musicFilter.frequency.setValueAtTime(18000, 23.99);
  musicFilter.frequency.setValueAtTime(2600, 24.0);
  groove(12, HALF);
  groove(13, HALF);
  blip(24.0, 1200, 0.14);
  blip(24.5, 1200, 0.14);
  kick(25.5, 0.9, true); // landing thud
  crash(25.5, 0.2, 0.5);
  musicFilter.frequency.setValueAtTime(2600, 27.0);
  musicFilter.frequency.exponentialRampToValueAtTime(500, 28.5);

  // Bar 15 (28-30s): push-in. Riser + roll resolve into the boom at 0.0 (the loop).
  groove(14, { ...HALF, kicks: [0], claps: [], hats: false, cow: false, bassAmp: 0.55 });
  riser(28.5, 30.0, 0.5);
  snareRoll(29.0, 30.0, 0.15, 0.8);

  // -------------------------------------------------------------------------
  // Render, fold the tail over the loop point, limit, encode.
  // -------------------------------------------------------------------------
  const rendered = await ctx.startRendering();
  const n = SR * LEN;
  const chans = [0, 1].map((c) => {
    const src = rendered.getChannelData(c);
    const out = new Float32Array(n);
    out.set(src.subarray(0, n));
    // Whatever rings past 30s (reverb, boom tails) wraps onto the start, so the
    // loop point is seamless.
    for (let i = n; i < src.length; i++) out[i - n] += src[i];
    return out;
  });

  const stats = limit(chans, SR, Math.pow(10, -2.0 / 20));
  return { wav: encodeWav(chans, SR), stats };
}

// Look-ahead peak limiter: ceiling in linear amplitude. Returns gain-reduction stats.
function limit(chans, sr, ceiling) {
  const n = chans[0].length;
  const look = Math.floor(sr * 0.003);
  const release = Math.exp(-1 / (sr * 0.08));
  const peak = new Float32Array(n);
  for (let i = 0; i < n; i++) peak[i] = Math.max(Math.abs(chans[0][i]), Math.abs(chans[1][i]));
  // Required gain at each sample, looked ahead over the window.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) need[i] = peak[i] > ceiling ? ceiling / peak[i] : 1;
  // Sliding minimum over the look-ahead window (simple O(n*look), fine for 30s).
  const target = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 1;
    const end = Math.min(n, i + look);
    for (let j = i; j < end; j++) if (need[j] < m) m = need[j];
    target[i] = m;
  }
  let g = 1;
  let maxGr = 0;
  let grSamples = 0;
  let rawPeak = 0;
  for (let i = 0; i < n; i++) {
    rawPeak = Math.max(rawPeak, peak[i]);
    if (target[i] < g) g = target[i];
    else g = target[i] - (target[i] - g) * release;
    const gr = -20 * Math.log10(g);
    if (gr > maxGr) maxGr = gr;
    if (gr > 1) grSamples++;
    chans[0][i] *= g;
    chans[1][i] *= g;
  }
  let outPeak = 0;
  for (let i = 0; i < n; i++) outPeak = Math.max(outPeak, Math.abs(chans[0][i]), Math.abs(chans[1][i]));
  return {
    rawPeakDb: 20 * Math.log10(rawPeak),
    outPeakDb: 20 * Math.log10(outPeak),
    maxGainReductionDb: maxGr,
    secondsOver1dBReduction: grSamples / sr,
  };
}

function encodeWav(chans, sr) {
  const n = chans[0].length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      // TPDF-free simple rounding is fine at 16-bit for this material.
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}
