// THE CHAIR IS THE GHOST - soundtrack. Spooky trap in F# minor (music box, pads,
// ghost choir, sliding 808s, trap drums), built on THE BAN HAMMER's synth engine., synthesized from scratch with the Web Audio API.
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
const LEN = 22;
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

  // -------------------------------------------------------------------------
  // Spooky-trap instruments (this track only)
  // -------------------------------------------------------------------------
  // FM music box: sine carrier with a decaying 3.5x modulator.
  function musicBox(t, midi, amp = 0.2, dur = 1.1, panV = 0) {
    const f = midiHz(midi);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 2.2, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.35);
    mod.connect(modG);
    modG.connect(car.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    const g = ctx.createGain();
    env(g.gain, t, 0.003, amp, dur);
    car.connect(lp);
    lp.connect(g);
    pan(g, panV, music);
    send(g, 0.45);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  // Dark pad: detuned saws, low-passed, slow attack.
  function pad(t0, t1, midis, amp = 0.1) {
    midis.forEach((m, i) => {
      for (const det of [-12, 12]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midiHz(m);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        lp.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(amp / midis.length, t0 + 0.4);
        g.gain.setValueAtTime(amp / midis.length, Math.max(t0 + 0.41, t1 - 0.3));
        g.gain.linearRampToValueAtTime(0.0001, t1);
        o.connect(lp);
        lp.connect(g);
        pan(g, (i - 1) * 0.35, music);
        send(g, 0.3);
        o.start(t0);
        o.stop(t1 + 0.05);
      }
    });
  }

  // Ghost choir: saws through "ooh" formants with slow vibrato.
  function choir(t0, t1, midis, amp = 0.12) {
    midis.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midiHz(m);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + i * 0.4;
      const vibG = ctx.createGain();
      vibG.gain.value = 3;
      vib.connect(vibG);
      vibG.connect(o.frequency);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.linearRampToValueAtTime(amp / midis.length, t0 + 0.3);
      out.gain.setValueAtTime(amp / midis.length, Math.max(t0 + 0.31, t1 - 0.25));
      out.gain.linearRampToValueAtTime(0.0001, t1);
      for (const [fq, q, fg] of [
        [420, 6, 1],
        [800, 8, 0.5],
        [2600, 10, 0.12],
      ]) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = fq;
        bp.Q.value = q;
        const gg = ctx.createGain();
        gg.gain.value = fg * 3;
        o.connect(bp);
        bp.connect(gg);
        gg.connect(out);
      }
      pan(out, (i - 1) * 0.5, music);
      send(out, 0.55);
      o.start(t0);
      vib.start(t0);
      o.stop(t1 + 0.05);
      vib.stop(t1 + 0.05);
    });
  }

  // Sliding 808: optional glide from another note, saturated.
  function slide808(t, midi, dur, amp = 0.7, fromMidi = null, drive = 3) {
    const f = midiHz(midi);
    const o = ctx.createOscillator();
    o.type = "sine";
    if (fromMidi !== null) {
      o.frequency.setValueAtTime(midiHz(fromMidi), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    } else {
      o.frequency.setValueAtTime(f * 1.1, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    }
    const sh = ctx.createWaveShaper();
    sh.curve = tanhCurve(drive);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.006);
    g.gain.setValueAtTime(amp, t + Math.max(0.01, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(sh);
    sh.connect(lp);
    lp.connect(g);
    g.connect(bassBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Trap bar: half-time snare on beat 3, hats on 8ths/16ths with triplet rolls.
  function trap(bar, o) {
    const t0 = bar * BAR;
    const { kicks = [0, 10], hats16 = false, rolls = false, hatAmp = 0.13, pumpOn = false } = o;
    for (const st of kicks) {
      kick(t0 + st * STEP, 0.95);
      if (pumpOn) duck(t0 + st * STEP);
    }
    snare(t0 + 8 * STEP, 0.55);
    clap(t0 + 8 * STEP, 0.45);
    for (let st = 0; st < 16; st += hats16 ? 1 : 2) {
      hat(t0 + st * STEP, hatAmp * (st % 4 === 0 ? 1.1 : 0.75), false, st % 2 ? 0.3 : -0.2);
    }
    if (rolls) {
      for (let r = 0; r < 6; r++) hat(t0 + 12 * STEP + (r * BEAT) / 6, hatAmp * (0.6 + r * 0.1), false, 0.35);
      for (let r = 0; r < 4; r++) hat(t0 + 14 * STEP + (r * STEP) / 2, hatAmp * 0.8, false, -0.35);
    }
    hat(t0 + 6 * STEP, hatAmp * 1.3, true, 0.2);
  }

  // Motifs (F# minor). Music box on 8ths, 808 roots, pad chords.
  const BOX_A = [78, 81, 85, 81, 77, 81, 85, 81];
  const BOX_B = [78, 81, 86, 85, 81, 78, 77, 73];
  const SUB_A = [[0, 42, 6, null], [6, 42, 4, 49], [10, 45, 6, null]];
  const SUB_B = [[0, 38, 6, null], [6, 37, 4, null], [10, 42, 6, 45]];
  const CHORD = [[54, 57, 61], [50, 54, 57], [49, 53, 56], [54, 57, 61]];
  function box(bar, amp = 0.2, octave = false) {
    const pat = bar % 2 ? BOX_B : BOX_A;
    pat.forEach((m, i) => {
      musicBox(bar * BAR + i * BEAT * 0.5, m, amp, 1.0, i % 2 ? 0.25 : -0.25);
      if (octave) musicBox(bar * BAR + i * BEAT * 0.5, m + 12, amp * 0.35, 0.7, i % 2 ? -0.3 : 0.3);
    });
  }
  function subLine(bar, amp = 0.7, drive = 3) {
    for (const [st, m, len, from] of bar % 2 ? SUB_B : SUB_A) slide808(bar * BAR + st * STEP, m, len * STEP, amp, from, drive);
  }

  // -------------------------------------------------------------------------
  // New sound effects
  // -------------------------------------------------------------------------
  function pop(t, amp = 0.16) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.05);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, amp, 0.08);
    o.connect(g);
    g.connect(fx);
    o.start(t);
    o.stop(t + 0.12);
  }
  // Vacuum suction: band-passed noise sweeping up, with a fast wobble.
  function vacuum(t0, t1, amp = 0.3) {
    const n = noise(t0, t1 - t0);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(2600, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.12);
    g.gain.setValueAtTime(amp, t1 - 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t1);
    const wob = ctx.createOscillator();
    wob.frequency.value = 17;
    const wobG = ctx.createGain();
    wobG.gain.value = amp * 0.35;
    wob.connect(wobG);
    wobG.connect(g.gain);
    n.connect(bp);
    bp.connect(g);
    pan(g, 0.2, fx);
    wob.start(t0);
    wob.stop(t1);
  }
  function heartbeat(t, amp = 0.55) {
    for (const [dt, a] of [
      [0, 1],
      [0.2, 0.7],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(42, t + dt + 0.12);
      const g = ctx.createGain();
      env(g.gain, t + dt, 0.004, amp * a, 0.16);
      o.connect(g);
      g.connect(fx);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }
  // Record scratch: resonant noise sweeping down, up, down.
  function scratch(t, amp = 0.35) {
    const n = noise(t, 0.35);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(3200, t);
    bp.frequency.exponentialRampToValueAtTime(450, t + 0.1);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.32);
    const g = ctx.createGain();
    env(g.gain, t, 0.004, amp * 3, 0.3);
    n.connect(bp);
    bp.connect(g);
    g.connect(fx);
  }
  function ding(t, amp = 0.2) {
    for (const [f, a] of [
      [1760, 1],
      [2637, 0.5],
      [3520, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g.gain, t, 0.002, amp * a, 0.9);
      o.connect(g);
      g.connect(fx);
      send(g, 0.4);
      o.start(t);
      o.stop(t + 1);
    }
  }

  // -------------------------------------------------------------------------
  // Arrangement. Cut list: short/videos/chair-ghost/edl.json (120 BPM grid).
  // -------------------------------------------------------------------------
  const CUTS = [1, 2, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18, 19.5];
  const CAPTIONS = [0, 2, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18, 19.5];

  // Bar 1 (0-2s): hook. Pad + music box, the chair slams the lens at 1.0.
  boom(0, 0.8, 1.6);
  pad(0, 2, CHORD[0], 0.1);
  box(0, 0.16);
  kick(1.0, 1, true);
  crash(1.0, 0.45, 1.0);
  oof(1.02, 0.6, 1);
  slide808(1.0, 42, 0.9, 0.7, 54);

  // Bars 2-5 (2-10s): the setup. Light trap groove under the music box.
  for (let b = 1; b < 5; b++) {
    trap(b, { kicks: [0, 10] });
    box(b, 0.17);
    subLine(b, 0.55, 2.5);
    pad(b * BAR, b * BAR + BAR, CHORD[b % 4], 0.08);
  }
  ding(2.0, 0.14); // the round starts
  heartbeat(3.0);
  heartbeat(3.75); // "JUST A CHAIR..."
  scratch(4.5); // "...RIGHT?"
  stinger(4.55, 0.24);
  whoosh(6.2, 0.45, 0.42, true); // the chair swoops over the camera
  boom(6.6, 0.55, 1.0);
  vacuum(9.0, 10.5, 0.3); // DRAIN IT
  riser(9.0, 10.5, 0.35);

  // Bar 6 (10-12s): the slam at 10.5, filter closes, 0.25s of silence before the drop.
  kick(10.5, 1, true);
  boom(10.5, 0.95, 1.4);
  crash(10.5, 0.5, 1.0);
  glass(10.5, 0.3);
  oof(10.55, 0.5, 1.1);
  musicFilter.frequency.setValueAtTime(18000, 10.49);
  musicFilter.frequency.exponentialRampToValueAtTime(400, 11.5);
  pad(10.5, 11.75, CHORD[1], 0.1);
  riser(10.7, 11.75, 0.5);
  snareRoll(11.0, 11.75, 0.15, 0.8);

  // Bars 7-9 (12-18s): DROP. Full trap, driven 808 slides, the ghost choir.
  musicFilter.frequency.setValueAtTime(18000, 11.75);
  boom(12.0, 1.0, 2.0);
  crash(12.0, 0.5, 1.4);
  for (let b = 6; b < 9; b++) {
    trap(b, { kicks: [0, 3, 10], hats16: true, rolls: true, hatAmp: 0.16, pumpOn: true });
    box(b, 0.19, true);
    subLine(b, 0.85, 3.8);
    choir(b * BAR, b * BAR + BAR, CHORD[b % 4].map((m) => m + 12), 0.16);
  }
  vacuum(13.5, 15.0, 0.3); // SUCK IT OUT
  boom(15.0, 0.85, 1.6); // slow-mo reveal
  stinger(15.0, 0.28);
  sparkle(15.0, 0.18);
  boom(16.5, 0.9, 1.2); // "HE RAN."
  whoosh(17.45, 0.35, 0.45, false); // the ghost runs through the camera
  crash(17.75, 0.3, 0.6);

  // Bar 10 (18-20s): the ghost-health HUD. Glitch, then a ding as it lands on 36%.
  trap(9, { kicks: [0, 10] });
  subLine(9, 0.6, 2.5);
  pad(18, 20, CHORD[1], 0.09);
  box(9, 0.17);
  stutter(18.0, 0.25, 0.14);
  ding(19.0, 0.18);

  // Bar 11 (20-22s): the swoop again; riser + roll resolve into the boom at 0.0 (loop).
  trap(10, { kicks: [0, 10] });
  subLine(10, 0.55, 2.5);
  pad(20, 22, CHORD[0], 0.09);
  box(10, 0.16);
  whoosh(19.8, 0.45, 0.38, true);
  riser(21.0, 22.0, 0.45);
  snareRoll(21.25, 22.0, 0.12, 0.6);

  // Every cut gets a whoosh leading into it; every caption a pop.
  CUTS.forEach((c) => whoosh(c - 0.2, 0.22, 0.14, true));
  CAPTIONS.forEach((c) => {
    pop(c, 0.14);
    pop(c + STEP, 0.1);
  });

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
