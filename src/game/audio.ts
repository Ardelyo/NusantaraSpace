// Audio prosedural (WebAudio): mesin, angin, napas, jetpack, musik ambien, efek UI
export interface AudioState {
  throttle: number; // 0..1
  speed01: number; // 0..1
  atmo: number; // kepadatan atmosfer 0..1
  inside: boolean; // di dalam kapal
  eva: boolean;
  jet: number; // 0..1
  walking: boolean;
  heat: number; // 0..1
  windSpeed: number; // 0..1
}

export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  muted = false;
  noise!: AudioBuffer;
  eng!: { g: GainNode; f: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode; og: GainNode };
  wind!: { g: GainNode; f: BiquadFilterNode };
  jet!: { g: GainNode; f: BiquadFilterNode };
  breath!: { g: GainNode };
  hum!: { g: GainNode };
  heatN!: { g: GainNode; f: BiquadFilterNode };
  reverb!: ConvolverNode;
  musicGain!: GainNode;
  musicTimer: number | undefined;
  stepT = 0;
  started = false;

  start() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // noise (coklat + putih)
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;
      d[i] = w * 0.5 + last * 6;
    }
    const src = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random() * 2);
      return s;
    };

    // reverb
    const rl = ctx.sampleRate * 3.2;
    const imp = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = imp.getChannelData(c);
      for (let i = 0; i < rl; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = imp;
    const rg = ctx.createGain();
    rg.gain.value = 0.55;
    this.reverb.connect(rg);
    rg.connect(this.master);

    // mesin
    const engF = ctx.createBiquadFilter();
    engF.type = 'lowpass';
    engF.frequency.value = 200;
    const engG = ctx.createGain();
    engG.gain.value = 0;
    src().connect(engF);
    engF.connect(engG);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 48; o2.frequency.value = 48.7;
    const og = ctx.createGain();
    og.gain.value = 0;
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 160;
    o1.connect(of); o2.connect(of); of.connect(og);
    o1.start(); o2.start();
    og.connect(engG);
    engG.connect(this.master);
    this.eng = { g: engG, f: engF, o1, o2, og };

    // angin
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 700;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    src().connect(wf); wf.connect(wg); wg.connect(this.master);
    this.wind = { g: wg, f: wf };

    // jetpack
    const jf = ctx.createBiquadFilter();
    jf.type = 'highpass';
    jf.frequency.value = 1200;
    const jg = ctx.createGain();
    jg.gain.value = 0;
    src().connect(jf); jf.connect(jg); jg.connect(this.master);
    this.jet = { g: jg, f: jf };

    // napas
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 500;
    bf.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.22;
    const lg = ctx.createGain();
    lg.gain.value = 0.04;
    lfo.connect(lg);
    lg.connect(bg.gain);
    lfo.start();
    src().connect(bf); bf.connect(bg); bg.connect(this.master);
    this.breath = { g: bg };

    // dengung pakaian / kapal
    const hg = ctx.createGain();
    hg.gain.value = 0.0;
    const ho = ctx.createOscillator();
    ho.type = 'sine';
    ho.frequency.value = 55;
    const ho2 = ctx.createOscillator();
    ho2.type = 'triangle';
    ho2.frequency.value = 110.4;
    const hg2 = ctx.createGain();
    hg2.gain.value = 0.3;
    ho.connect(hg); ho2.connect(hg2); hg2.connect(hg); hg.connect(this.master);
    ho.start(); ho2.start();
    this.hum = { g: hg };

    // panas masuk atmosfer
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1200;
    const hgn = ctx.createGain();
    hgn.gain.value = 0;
    src().connect(hf); hf.connect(hgn); hgn.connect(this.master);
    this.heatN = { g: hgn, f: hf };

    // musik
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.reverb);
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 7000);
  }

  scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const roots = [110, 98, 82.41, 123.47, 87.31];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3];
    const now = ctx.currentTime;
    const chord = [0, 2, 4, Math.random() < 0.5 ? 5 : 6];
    chord.forEach((n, i) => this.pad(root * scale[n] * (i === 0 ? 0.5 : 1), now + i * 0.15, 9));
    const bells = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bells; i++) this.bell(root * 4 * scale[Math.floor(Math.random() * scale.length)], now + 1.5 + Math.random() * 5.5);
  }

  pad(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    for (const det of [-5, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
    f.connect(g);
    g.connect(this.musicGain);
  }

  bell(freq: number, t: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.musicGain);
    o.start(t); o2.start(t); o.stop(t + 3.6); o2.stop(t + 3.6);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx!.currentTime, 0.05);
  }

  update(s: AudioState, dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const sm = (p: AudioParam, v: number, tc = 0.12) => p.setTargetAtTime(v, t, tc);
    const insideMuf = s.inside ? 1 : 0;
    // mesin (terdengar di dalam kapal; sangat redam di luar)
    const eg = s.eva ? 0 : 0.28 * (0.15 + s.throttle * 0.85) * (s.inside ? 1 : 0.7);
    sm(this.eng.g.gain, eg);
    sm(this.eng.f.frequency, 120 + s.speed01 * 520 + s.throttle * 220);
    sm(this.eng.o1.frequency, 42 + s.throttle * 26);
    sm(this.eng.o2.frequency, 42.9 + s.throttle * 26.5);
    sm(this.eng.og.gain, 0.55 + s.throttle * 0.9);
    // angin
    const wv = s.atmo * clamp01(s.windSpeed) * (s.eva ? 0.5 : 0.35 * (s.inside ? 0.6 : 1));
    sm(this.wind.g.gain, wv);
    sm(this.wind.f.frequency, 300 + s.windSpeed * 1400);
    // jetpack
    sm(this.jet.g.gain, s.eva ? s.jet * 0.2 : 0);
    // napas EVA
    sm(this.breath.g.gain, s.eva ? 0.1 : 0);
    sm(this.hum.g.gain, s.eva ? 0.02 : 0.012 + 0.012 * insideMuf);
    sm(this.heatN.g.gain, s.heat * 0.45);
    sm(this.heatN.f.frequency, 400 + s.heat * 1800);
    // langkah
    if (s.walking) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = s.eva ? 0.46 : 0.5;
        this.step(s.eva);
      }
    } else this.stepT = 0;
  }

  // ---------- efek ----------
  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, slide = 0, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur: number, f0: number, f1: number, vol = 0.2, type: BiquadFilterType = 'bandpass', delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.05);
  }

  click() { this.tone(1400, 0.05, 'square', 0.04); this.tone(900, 0.06, 'sine', 0.05, 0, 0.02); }
  open() { this.tone(520, 0.12, 'triangle', 0.08); this.tone(780, 0.18, 'triangle', 0.08, 0, 0.09); }
  close() { this.tone(780, 0.1, 'triangle', 0.07); this.tone(520, 0.16, 'triangle', 0.07, 0, 0.08); }
  select() { this.tone(660, 0.08, 'sine', 0.1); this.tone(990, 0.14, 'sine', 0.1, 0, 0.07); }
  warn() { for (let i = 0; i < 3; i++) this.tone(880, 0.16, 'square', 0.06, -200, i * 0.24); }
  scan() { this.tone(300, 1.1, 'sine', 0.1, 1800); this.tone(150, 1.1, 'triangle', 0.06, 900); }
  discover() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.09, 0, i * 0.11)); }
  hiss(d = 2.4) { this.burst(d, 3500, 600, 0.22, 'bandpass'); }
  thunk() { this.tone(90, 0.35, 'sine', 0.35, -50); this.burst(0.25, 400, 80, 0.2, 'lowpass'); }
  touch() { this.tone(70, 0.5, 'sine', 0.4, -30); this.burst(0.6, 600, 60, 0.3, 'lowpass'); }
  engage() { this.tone(110, 1.2, 'sawtooth', 0.07, 300); this.burst(1.0, 200, 2500, 0.12, 'bandpass'); }
  flag() { this.tone(400, 0.12, 'square', 0.06); this.tone(600, 0.2, 'square', 0.06, 0, 0.1); this.thunk(); }
  step(eva: boolean) {
    this.burst(0.12, eva ? 500 : 900, 120, eva ? 0.25 : 0.14, 'lowpass');
    this.tone(eva ? 70 : 100, 0.1, 'sine', 0.12, -20);
  }
  jump() { this.burst(0.3, 800, 200, 0.2, 'lowpass'); }
  boost() { this.burst(1.4, 300, 3000, 0.25, 'bandpass'); this.tone(80, 1.4, 'sawtooth', 0.08, 220); }
  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.ctx?.close();
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
