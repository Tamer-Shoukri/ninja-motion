/**
 * Synthesized WebAudio SFX — no asset files. The context is created on the
 * first user gesture (browser autoplay rules). `M` toggles mute.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = localStorage.getItem("ninja-muted") === "1";

  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.6;
        this.master.connect(this.ctx.destination);
      } catch {
        return;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("ninja-muted", this.muted ? "1" : "0");
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, gain: number, freq: number, type: BiquadFilterType = "bandpass", when = 0, sweepTo?: number, q = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Blade swish + wet splat, pitched up as the chain grows. */
  slice(chain: number): void {
    this.hiss(0.14, 0.35, 5200, "bandpass", 0, 1800, 0.8);
    this.hiss(0.12, 0.25, 900, "lowpass", 0.01);
    this.tone(420 + Math.min(chain, 10) * 45, 0.09, "triangle", 0.12, 0.01);
  }

  combo(count: number): void {
    [0, 4, 7, 12].slice(0, Math.min(4, count - 1)).forEach((st, i) =>
      this.tone(660 * Math.pow(2, st / 12), 0.16, "square", 0.07, i * 0.07),
    );
  }

  bomb(): void {
    this.hiss(0.9, 0.7, 900, "lowpass", 0, 120, 0.5);
    this.tone(110, 0.6, "sine", 0.55, 0, 35);
  }

  freeze(): void {
    [1568, 1318, 1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.25, "sine", 0.08, i * 0.05));
    this.hiss(0.8, 0.12, 7000, "highpass", 0);
  }

  frenzy(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.12, "square", 0.07, i * 0.05));
  }

  throw(): void {
    this.hiss(0.18, 0.06, 600, "bandpass", 0, 1400, 1.2);
  }

  pick(): void {
    this.tone(880, 0.12, "triangle", 0.12);
    this.tone(1320, 0.18, "triangle", 0.1, 0.06);
  }

  tick(): void {
    this.tone(1200, 0.05, "square", 0.05);
  }

  go(): void {
    this.tone(784, 0.12, "square", 0.09);
    this.tone(1175, 0.3, "square", 0.09, 0.1);
  }

  over(): void {
    [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.28, "triangle", 0.12, i * 0.14));
  }

  best(): void {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.11, i * 0.1));
  }
}
