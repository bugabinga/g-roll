// ============================================================================
//  Audio — fully procedural WebAudio. No sample files, no downloads.
//  A low dread drone, a heartbeat that quickens with speed, and sharp stingers.
// ============================================================================

export class Audio {
  constructor(muted = false) {
    this.ctx = null;
    this.muted = muted;
    this.master = null;
    this.droneGain = null;
    this._heartTimer = 0;
    this._heartRate = 1.1;   // seconds between beats
    this._started = false;
  }

  // Must be called from a user gesture to satisfy autoplay policies.
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---- ambient dread drone (runs during play) ----------------------------
  startDrone() {
    this.ensure();
    if (!this.ctx || this._started) return;
    this._started = true;
    const now = this.ctx.currentTime;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.gain.setTargetAtTime(0.16, now, 1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 3;
    filter.connect(this.droneGain);
    this.droneGain.connect(this.master);

    // two detuned saws + a sub sine => brooding pad
    [55, 55.4, 82.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 2 ? 0.6 : 0.4;
      o.connect(g); g.connect(filter);
      o.start(now);
      this._droneOsc = this._droneOsc || [];
      this._droneOsc.push(o);
    });

    // slow LFO wobble on the filter for unease
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    lfo.start(now);
    this._lfo = lfo;
    this._droneFilter = filter;

    // melodic bus for the escalating score
    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.value = 0.0;
    this._musicGain.gain.setTargetAtTime(0.5, now, 2.0);
    this._musicGain.connect(this.master);
    this._musicTimer = 0;
    this._musicStep = 0;
  }

  stopDrone() {
    if (!this.ctx || !this._started) return;
    const now = this.ctx.currentTime;
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0, now, 0.4);
    if (this._musicGain) this._musicGain.gain.setTargetAtTime(0, now, 0.3);
    setTimeout(() => {
      (this._droneOsc || []).forEach((o) => { try { o.stop(); } catch {} });
      try { this._lfo && this._lfo.stop(); } catch {}
      this._droneOsc = null;
      this._started = false;
      this._musicGain = null;
    }, 900);
  }

  // Escalating score: an arpeggio in A-minor that grows denser, higher and
  // faster as `intensity` (0..1, from time survived) climbs.
  updateMusic(dt, intensity) {
    if (!this.ctx || !this._started || this.muted || !this._musicGain) return;
    const I = Math.min(1, Math.max(0, intensity));

    // drone opens up (brighter) with tension
    if (this._droneFilter) this._droneFilter.frequency.setTargetAtTime(320 + I * 1100, this.ctx.currentTime, 0.4);

    const interval = 0.5 - I * 0.34;            // 0.5s calm -> ~0.16s frantic
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = interval;

    const step = this._musicStep++;
    // A natural-minor motif; higher octave folds in as intensity rises
    const scale = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440];
    const motif = [0, 2, 4, 3, 5, 4, 2, 0, 4, 6, 7, 5];
    const density = 0.4 + I * 0.6;              // chance a step actually sounds
    if (Math.random() < density) {
      let f = scale[motif[step % motif.length]];
      if (I > 0.55 && step % 2 === 0) f *= 2;   // sparkle up an octave when tense
      this._pluck(f, 0.09 + I * 0.06);
    }
    // a driving bass pulse every 4 steps, arriving once things heat up
    if (step % 4 === 0 && I > 0.18) this._bass(110, 0.16 + I * 0.12);
  }

  _pluck(freq, vol) {
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.32);
    o.connect(g); g.connect(this._musicGain);
    o.start(now); o.stop(now + 0.34);
  }

  _bass(freq, vol) {
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    o.connect(lp); lp.connect(g); g.connect(this._musicGain);
    o.start(now); o.stop(now + 0.38);
  }

  // heartbeat cadence tracks danger; call each frame with normalised speed 0..1
  updateHeart(dt, intensity) {
    if (!this.ctx || !this._started || this.muted) return;
    this._heartRate = 1.15 - intensity * 0.7; // faster as you speed up
    this._heartTimer -= dt;
    if (this._heartTimer <= 0) {
      this._heartTimer = this._heartRate;
      this._thump(0.0);
      this._thump(0.16); // the double-beat
    }
  }

  _thump(delay) {
    const now = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + 0.24);
  }

  // ---- one-shots ---------------------------------------------------------
  gem() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // a crystalline two-note bell chime with an octave partial + a high sparkle
    const notes = [1318.5, 1975.5]; // E6 -> B6, a bright rising fifth
    notes.forEach((f, i) => {
      const t = now + i * 0.055;
      [[1, 0.16, 'triangle'], [2.01, 0.06, 'sine'], [3.0, 0.03, 'sine']].forEach(([h, vol, type]) => {
        const o = this.ctx.createOscillator();
        o.type = type; o.frequency.value = f * h;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 0.42);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.45);
      });
    });
    // shimmer ping
    const s = this.ctx.createOscillator();
    s.type = 'sine'; s.frequency.setValueAtTime(2637, now); s.frequency.exponentialRampToValueAtTime(3951, now + 0.12);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.05, now); sg.gain.exponentialRampToValueAtTime(0.0005, now + 0.2);
    s.connect(sg); sg.connect(this.master); s.start(now); s.stop(now + 0.22);
  }

  // bright metallic "boing" when you land on top of an explosive
  bombBounce() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(620, now + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 0.24);
    // little coin-like ting on top for "bonus"
    const t2 = this.ctx.createOscillator(); t2.type = 'triangle'; t2.frequency.value = 1568;
    const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.1, now + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    t2.connect(g2); g2.connect(this.master); t2.start(now + 0.02); t2.stop(now + 0.26);
  }

  explosion() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // low boom
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(120, now); o.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 0.62);
    // noise crackle
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(0.5);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.setValueAtTime(2200, now); bp.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    const ng = this.ctx.createGain(); ng.gain.setValueAtTime(0.5, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    src.connect(bp); bp.connect(ng); ng.connect(this.master); src.start(now); src.stop(now + 0.55);
  }

  jump() { this._whoosh(520, 0.14, 0.14); }
  roll() { this._whoosh(300, 0.22, 0.18); }

  _whoosh(freq, dur, vol) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const noise = this._noiseBuffer(dur);
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, now);
    bp.frequency.exponentialRampToValueAtTime(freq * 0.4, now + dur);
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(now); src.stop(now + dur);
  }

  death() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // low detuned brass-ish stab + noise crunch
    [110, 146.8, 55].forEach((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, now + 0.9);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0, now);
      g.gain.linearRampToValueAtTime(0.3, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(g); g.connect(lp); lp.connect(this.master);
      o.start(now); o.stop(now + 1.15);
    });
    // crunch
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(g); g.connect(this.master);
    src.start(now); src.stop(now + 0.5);
  }

  toll() { // deep bell for menu / new record
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [220, 329.6, 440].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.14 / (i + 1), now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
      o.connect(g); g.connect(this.master);
      o.start(now); o.stop(now + 2.5);
    });
  }

  _noiseBuffer(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
