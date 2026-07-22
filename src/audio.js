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
  }

  stopDrone() {
    if (!this.ctx || !this._started) return;
    const now = this.ctx.currentTime;
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0, now, 0.4);
    setTimeout(() => {
      (this._droneOsc || []).forEach((o) => { try { o.stop(); } catch {} });
      try { this._lfo && this._lfo.stop(); } catch {}
      this._droneOsc = null;
      this._started = false;
    }, 900);
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
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(1760, now + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + 0.2);
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
